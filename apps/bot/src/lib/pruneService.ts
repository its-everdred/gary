import type { Client, Guild, TextChannel, Message } from 'discord.js';
import { ChannelType, GatewayIntentBits } from 'discord.js';
import pino from 'pino';
import { ConfigService } from './configService.js';

const logger = pino();

const SCAN_CONCURRENCY = 5;
const MESSAGE_PAGE_SIZE = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Fallback mode (no roster) has to page past the cutoff to find inactive
// posters' last message, so it can't stop at the cutoff. Cap pages per channel
// instead so a large server can't run the scan past the interaction deadline.
const MAX_FALLBACK_PAGES = 30; // 30 * 100 = 3000 messages/channel

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

interface ScanOptions {
  // Stop paging a channel once messages predate this timestamp.
  stopBefore?: Date;
  // Hard cap on pages fetched per channel.
  maxPages?: number;
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
    const roster = await this.tryFetchRoster(guild);

    let inactive: InactiveMember[];
    if (roster) {
      // Roster mode: we only need to know who posted within the window. Stop
      // paging each channel once it crosses the cutoff, so the scan is bounded
      // by recent activity instead of full channel history.
      const recent = await this.scanActivity(guild, { stopBefore: cutoff });
      inactive = this.inactiveFromRoster(roster, recent);
    } else {
      // Fallback mode: no roster, so we must find posters whose last message is
      // old. Page-capped to stay within the interaction deadline.
      const activity = await this.scanActivity(guild, {
        maxPages: MAX_FALLBACK_PAGES,
      });
      inactive = this.inactiveFromActivity(activity, cutoff);
    }

    inactive.sort((a, b) => {
      // No-recent-post members (null) sort first, ordered by name for a stable
      // list; dated members (fallback mode) sort oldest-first.
      if (!a.lastMessageAt && !b.lastMessageAt) {
        return a.displayName.localeCompare(b.displayName);
      }
      if (!a.lastMessageAt) return -1;
      if (!b.lastMessageAt) return 1;
      return a.lastMessageAt.getTime() - b.lastMessageAt.getTime();
    });

    return { members: inactive, rosterAvailable: roster !== null };
  }

  /**
   * Full-roster mode: every non-bot member who did not post within the window.
   * `recent` holds only members seen posting since the cutoff, so anyone absent
   * from it is inactive. Their exact last-post date is unknown (we stop paging
   * at the cutoff), so lastMessageAt is null.
   */
  private inactiveFromRoster(
    roster: Map<string, { displayName: string; bot: boolean }>,
    recent: Map<string, Activity>
  ): InactiveMember[] {
    const inactive: InactiveMember[] = [];
    for (const [userId, info] of roster) {
      if (info.bot) continue;
      if (recent.has(userId)) continue;

      inactive.push({ userId, displayName: info.displayName, lastMessageAt: null });
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
   * Fetches the member roster when the Server Members Intent is active on the
   * gateway connection. Returns null (fallback mode) when the intent is absent
   * or the fetch fails. The intent is negotiated at login, so no env var is
   * needed — the bot connects with it when the Developer Portal toggle is on
   * and degrades automatically when it is off.
   */
  private async tryFetchRoster(
    guild: Guild
  ): Promise<Map<string, { displayName: string; bot: boolean }> | null> {
    if (!this.client.options.intents.has(GatewayIntentBits.GuildMembers)) {
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
   *
   * `stopBefore` halts a channel once it crosses that timestamp (recent-window
   * scan); `maxPages` caps pages per channel. One of the two bounds the scan so
   * it can never page an entire channel's history.
   */
  private async scanActivity(
    guild: Guild,
    opts: ScanOptions
  ): Promise<Map<string, Activity>> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const channels = this.readableTextChannels(guild, me);

    const perChannel = await this.mapWithConcurrency(
      channels,
      SCAN_CONCURRENCY,
      (channel) => this.scanChannel(channel, opts)
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
   * author's most-recent message time and display name. Bounded by
   * `opts.stopBefore` (stop once messages predate the cutoff) and/or
   * `opts.maxPages` (hard page cap).
   */
  private async scanChannel(
    channel: TextChannel,
    opts: ScanOptions
  ): Promise<Map<string, Activity>> {
    const latest = new Map<string, Activity>();

    try {
      let before: string | undefined;
      let pages = 0;

      for (;;) {
        if (opts.maxPages !== undefined && pages >= opts.maxPages) {
          logger.warn(
            { channelId: channel.id, maxPages: opts.maxPages },
            'Prune scan hit page cap - older activity in this channel not counted'
          );
          break;
        }

        const batch = await channel.messages.fetch({
          limit: MESSAGE_PAGE_SIZE,
          before,
        });
        pages++;

        const messages = [...batch.values()] as Message[];
        if (messages.length === 0) break;

        let crossedCutoff = false;
        for (const message of messages) {
          const timestamp = new Date(message.createdTimestamp);

          // Messages are newest -> oldest, so once one predates the cutoff every
          // later message does too; note it and stop after this page.
          if (opts.stopBefore && timestamp < opts.stopBefore) {
            crossedCutoff = true;
            continue;
          }
          if (message.author.bot) continue;

          const existing = latest.get(message.author.id);
          if (!existing || timestamp > existing.lastMessageAt) {
            latest.set(message.author.id, {
              lastMessageAt: timestamp,
              displayName: message.member?.displayName ?? message.author.username,
            });
          }
        }

        if (crossedCutoff) break;
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
