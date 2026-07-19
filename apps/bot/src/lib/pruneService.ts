import type { Client, Guild, TextChannel, Message } from 'discord.js';
import { ChannelType } from 'discord.js';
import pino from 'pino';
import { ConfigService } from './configService.js';

const logger = pino();

const SCAN_CONCURRENCY = 5;
const MESSAGE_PAGE_SIZE = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface InactiveMember {
  userId: string;
  displayName: string;
  lastMessageAt: Date | null;
}

/**
 * Scans channel history to find members who have been inactive for at least
 * PRUNE_WEEKS. Read-only — never modifies members or channels.
 */
export class PruneService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Returns non-bot members with no message in the last PRUNE_WEEKS, sorted
   * with never-posted members first, then oldest last-message first.
   */
  async getInactiveMembers(guildId: string): Promise<InactiveMember[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const cutoff = new Date(Date.now() - ConfigService.getPruneWeeks() * WEEK_MS);

    const activity = await this.scanActivity(guild);
    const members = await guild.members.fetch();

    const inactive: InactiveMember[] = [];
    for (const member of members.values()) {
      if (member.user.bot) continue;

      const lastMessageAt = activity.get(member.id) ?? null;
      if (!lastMessageAt || lastMessageAt < cutoff) {
        inactive.push({
          userId: member.id,
          displayName: member.displayName ?? member.user.username,
          lastMessageAt,
        });
      }
    }

    inactive.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return -1;
      if (!b.lastMessageAt) return 1;
      return a.lastMessageAt.getTime() - b.lastMessageAt.getTime();
    });

    return inactive;
  }

  /**
   * Builds a userId -> most-recent-message-time map across all readable
   * channels, scanning channels in parallel with a bounded worker pool.
   */
  private async scanActivity(guild: Guild): Promise<Map<string, Date>> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const channels = this.readableTextChannels(guild, me);

    const perChannel = await this.mapWithConcurrency(
      channels,
      SCAN_CONCURRENCY,
      (channel) => this.scanChannel(channel)
    );

    const merged = new Map<string, Date>();
    for (const channelMap of perChannel) {
      for (const [userId, timestamp] of channelMap) {
        const existing = merged.get(userId);
        if (!existing || timestamp > existing) {
          merged.set(userId, timestamp);
        }
      }
    }

    return merged;
  }

  /**
   * Guild text/announcement channels Gary can view and read history in.
   */
  private readableTextChannels(
    guild: Guild,
    me: Guild['members']['me']
  ): TextChannel[] {
    const channels: TextChannel[] = [];

    for (const channel of guild.channels.cache.values()) {
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        continue;
      }

      const perms = me ? channel.permissionsFor(me) : null;
      if (perms && perms.has('ViewChannel') && perms.has('ReadMessageHistory')) {
        channels.push(channel as TextChannel);
      }
    }

    return channels;
  }

  /**
   * Pages a channel's history newest -> oldest, recording each non-bot
   * author's most-recent message time.
   */
  private async scanChannel(channel: TextChannel): Promise<Map<string, Date>> {
    const latest = new Map<string, Date>();

    try {
      let before: string | undefined;

      for (;;) {
        const batch = await channel.messages.fetch({
          limit: MESSAGE_PAGE_SIZE,
          before,
        });

        const messages = [...batch.values()] as Message[];
        if (messages.length === 0) break;

        for (const message of messages) {
          if (message.author.bot) continue;

          const timestamp = new Date(message.createdTimestamp);
          const existing = latest.get(message.author.id);
          if (!existing || timestamp > existing) {
            latest.set(message.author.id, timestamp);
          }
        }

        before = messages[messages.length - 1].id;
        if (messages.length < MESSAGE_PAGE_SIZE) break;
      }
    } catch (error) {
      logger.warn(
        { error, channelId: channel.id },
        'Failed to scan channel for prune activity'
      );
    }

    return latest;
  }

  /**
   * Runs `fn` over items with at most `limit` concurrent executions.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (index < items.length) {
          const current = index++;
          results[current] = await fn(items[current]);
        }
      }
    );

    await Promise.all(workers);
    return results;
  }
}
