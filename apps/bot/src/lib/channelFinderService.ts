import type { Guild, TextChannel } from 'discord.js';
import { NOMINATION_CONFIG } from './constants.js';

export class ChannelFinderService {
  /**
   * Abstract function to find a channel by its ID
   */
  private static async findChannel(guild: Guild, channelId: string | undefined): Promise<TextChannel | null> {
    if (!channelId) return null;
    
    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }

  static async findGovernanceChannel(guild: Guild): Promise<TextChannel | null> {
    return this.findChannel(guild, NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE);
  }

  static async findGeneralChannel(guild: Guild): Promise<TextChannel | null> {
    return this.findChannel(guild, NOMINATION_CONFIG.CHANNELS.GENERAL);
  }

  static async findModCommsChannel(guild: Guild): Promise<TextChannel | null> {
    return this.findChannel(guild, NOMINATION_CONFIG.CHANNELS.MOD_COMMS);
  }

  static async findModWarnChannel(guild: Guild): Promise<TextChannel | null> {
    return this.findChannel(guild, NOMINATION_CONFIG.CHANNELS.MOD_WARN);
  }
}