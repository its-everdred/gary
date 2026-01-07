import { Guild, TextChannel } from 'discord.js';
import pino from 'pino';

const logger = pino();

export class ChannelLookupService {
  /**
   * Finds a channel by ID with fallback to name pattern
   * @param guild The Discord guild
   * @param channelId The channel ID to try first
   * @param namePattern The name to fall back to if ID lookup fails
   * @returns The found text channel or null
   */
  static async findChannelWithFallback(
    guild: Guild,
    channelId: string | null | undefined,
    namePattern: string
  ): Promise<TextChannel | null> {
    logger.info(`Searching for channel - ID: ${channelId}, Name pattern: ${namePattern}`);
    
    // Try to get channel by ID first (99% of cases)
    if (channelId) {
      const channelById = guild.channels.cache.get(channelId) as TextChannel;
      if (channelById && channelById.isTextBased()) {
        logger.info(`Found channel by ID: ${channelById.name} (${channelById.id})`);
        return channelById;
      }
      logger.info(`Channel not found by ID: ${channelId}`);
    }

    // Fallback: If channel not found by ID, try to find by name pattern
    logger.info(`Looking for channel by name: ${namePattern}`);
    logger.info(`Available channels:`, {
      channels: guild.channels.cache.map(ch => ({ name: ch.name, id: ch.id, type: ch.type }))
    });
    
    const channelByName = guild.channels.cache.find(
      channel => channel.name === namePattern && channel.isTextBased()
    ) as TextChannel;

    if (channelByName) {
      logger.info({
        originalChannelId: channelId,
        foundChannelId: channelByName.id,
        channelName: namePattern,
      }, 'Found channel by name fallback');
      return channelByName;
    }

    logger.info(`Channel not found by name: ${namePattern}`);
    return null;
  }

  /**
   * Sanitizes nominee name for channel name (same logic as ChannelService)
   */
  private static sanitizeNomineeName(nomineeName: string): string {
    return nomineeName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  /**
   * Finds a discussion channel for a nominee
   */
  static async findDiscussionChannel(
    guild: Guild,
    nomineeId: string,
    nomineeName: string,
    discussionChannelId?: string | null
  ): Promise<TextChannel | null> {
    const sanitized = this.sanitizeNomineeName(nomineeName).substring(0, 88);
    const channelName = `discussion-${sanitized}`;
    return this.findChannelWithFallback(guild, discussionChannelId, channelName);
  }

  /**
   * Finds a vote channel for a nominee
   */
  static async findVoteChannel(
    guild: Guild,
    nomineeId: string,
    nomineeName: string,
    voteChannelId?: string | null
  ): Promise<TextChannel | null> {
    const sanitized = this.sanitizeNomineeName(nomineeName).substring(0, 95);
    const channelName = `vote-${sanitized}`;
    return this.findChannelWithFallback(guild, voteChannelId, channelName);
  }
}