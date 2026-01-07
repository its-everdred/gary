import { Guild, TextChannel } from 'discord.js';
import { logger } from './logger.js';

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
    // Try to get channel by ID first (99% of cases)
    if (channelId) {
      const channelById = guild.channels.cache.get(channelId) as TextChannel;
      if (channelById && channelById.isTextBased()) {
        return channelById;
      }
    }

    // Fallback: If channel not found by ID, try to find by name pattern
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

    return null;
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
    const channelName = `discussion-${nomineeName}`;
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
    const channelName = `vote-${nomineeName}`;
    return this.findChannelWithFallback(guild, voteChannelId, channelName);
  }
}