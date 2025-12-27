import type { Guild, TextChannel } from 'discord.js';
import { NOMINATION_CONFIG } from './constants.js';

export class ChannelFinderService {
  static async findGovernanceChannel(guild: Guild): Promise<TextChannel | null> {
    const channelId = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }

  static async findGeneralChannel(guild: Guild): Promise<TextChannel | null> {
    const channelId = NOMINATION_CONFIG.CHANNELS.GENERAL;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }

  static async findModCommsChannel(guild: Guild): Promise<TextChannel | null> {
    const channelId = NOMINATION_CONFIG.CHANNELS.MOD_COMMS;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }

  static async findModWarnChannel(guild: Guild): Promise<TextChannel | null> {
    const channelId = NOMINATION_CONFIG.CHANNELS.MOD_WARN;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }
}