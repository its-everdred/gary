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

export interface PruneResult {
  members: InactiveMember[];
  // False when the member roster was unavailable (Server Members Intent off),
  // meaning members who never posted could not be detected.
  rosterAvailable: boolean;
}

interface Activity {
  lastMessageAt: Date;
  displayName: string;
}

/**
 * Scans channel history to find members who have been inactive for at least
 * PRUNE_WEEKS. Read-only — never modifies members or channels.
 *
 * When the Server Members Intent is available the full roster is used, so
 * members who never posted are also flagged. Otherwise it degrades to the set
 * of members seen posting, and never-posters are silently excluded.
 */
export class PruneService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async getInactiveMembers(guildId: string): Promise<PruneResult> {
    const guild = await this.client.guilds.fetch(guildId);
    const cutoff = new Date(Date.now() - ConfigService.getPruneWeeks() * WEEK_MS);

    const activity = await this.scanActivity(guild);
    const roster = await this.tryFetchRoster(guild);

    const inactive: InactiveMember[] = roster
      ? this.inactiveFromRoster(roster, activity, cutoff)
      : this.inactiveFromActivity(activity, cutoff);

    inactive.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return -1;
      if (!b.lastMessageAt) return 1;
      return a.lastMessageAt.getTime() - b.lastMessageAt.getTime();
    });

    return { members: inactive, rosterAvailable: roster !== null };
  }

  /**
   * Full-roster mode: every non-bot member whose newest message is missing or
   * older than the cutoff (includes members who never posted).
   */
  private inactiveFromRoster(
    roster: Map<string, { displayName: string; bot: boolean }>,
    activity: Map<string, Activity>,
    cutoff: Date
  ): InactiveMember[] {
    const inactive: InactiveMember[] = [];
    for (const [userId, info] of roster) {
      if (info.bot) continue;

      const lastMessageAt = activity.get(userId)?.lastMessageAt ?? null;
      if (!lastMessageAt || lastMessageAt < cutoff) {
        inactive.push({ userId, displayName: info.displayName, lastMessageAt });
      }
    }
    return inactive;
  }

  /**
   * Fallback mode: only members seen posting whose newest message is older than
   * the cutoff. Members who never posted cannot be detected without the roster.
   */
  private inactiveFromActivity(
    activity: Map<string, Activity>,
    cutoff: Date
  ): InactiveMember[] {
    const inactive: InactiveMember[] = [];
    for (const [userId, info] of activity) {
      if (info.lastMessageAt < cutoff) {
        inactive.push({
          userId,
          displayName: info.displayName,
          lastMessageAt: info.lastMessageAt,
        });
      }
    }
    return inactive;
  }

  /**
   * Fetches the member roster when opted in via PRUNE_MEMBER_ROSTER. Returns
   * null (fallback mode) when disabled or the fetch fails.
   */
  private async tryFetchRoster(
    guild: Guild
  ): Promise<Map<string, { displayName: string; bot: boolean }> | null> {
    if (!ConfigService.getPruneMemberRoster()) {
      return null;
    }

    try {
      const members = await guild.members.fetch();
      const roster = new Map<string, { displayName: string; bot: boolean }>();
      for (const member of members.values()) {
        roster.set(member.id, {
          displayName: member.displayName ?? member.user.username,
          bot: member.user.bot,
        });
      }
      return roster;
    } catch (error) {
      logger.warn(
        { error },
        'Member roster fetch failed - falling back to message-author scan'
      );
      return null;
    }
  }

  /**
   * Builds a userId -> most-recent-activity map across all readable channels,
   * scanning channels in parallel with a bounded worker pool.
   */
  private async scanActivity(guild: Guild): Promise<Map<string, Activity>> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const channels = this.readableTextChannels(guild, me);

    const perChannel = await this.mapWithConcurrency(
      channels,
      SCAN_CONCURRENCY,
      (channel) => this.scanChannel(channel)
    );

    const merged = new Map<string, Activity>();
    for (const channelMap of perChannel) {
      for (const [userId, activity] of channelMap) {
        const existing = merged.get(userId);
        if (!existing || activity.lastMessageAt > existing.lastMessageAt) {
          merged.set(userId, activity);
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
   * author's most-recent message time and display name.
   */
  private async scanChannel(channel: TextChannel): Promise<Map<string, Activity>> {
    const latest = new Map<string, Activity>();

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
          if (!existing || timestamp > existing.lastMessageAt) {
            latest.set(message.author.id, {
              lastMessageAt: timestamp,
              displayName: message.member?.displayName ?? message.author.username,
            });
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
