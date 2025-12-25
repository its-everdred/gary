import type { Client, Guild, TextChannel } from 'discord.js';
import pino from 'pino';
import { NOMINATION_CONFIG } from './constants.js';

const logger = pino();

export interface ChannelPostResult {
  success: boolean;
  channelName?: string;
  errorMessage?: string;
}

export class AnnouncementUtils {
  /**
   * Finds the governance channel in a guild
   */
  static async findGovernanceChannel(guild: Guild): Promise<TextChannel | null> {
    const governanceChannelId = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE;
    if (!governanceChannelId) {
      logger.warn('GOVERNANCE_CHANNEL_ID not configured');
      return null;
    }

    const channel = guild.channels.cache.get(governanceChannelId) as TextChannel;
    if (!channel?.isTextBased()) {
      logger.warn(`Governance channel ${governanceChannelId} not found or not text-based`);
      return null;
    }

    return channel;
  }

  /**
   * Posts a message to the governance channel
   */
  static async postToGovernanceChannel(
    client: Client,
    guildId: string,
    message: string
  ): Promise<ChannelPostResult> {
    try {
      const governanceChannelId = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE;
      if (!governanceChannelId) {
        logger.warn('GOVERNANCE_CHANNEL_ID not configured');
        return { success: false, errorMessage: 'Governance channel not configured' };
      }

      const guild = await client.guilds.fetch(guildId);
      if (!guild) {
        return { success: false, errorMessage: 'Guild not found' };
      }

      const channel = guild.channels.cache.get(governanceChannelId) as TextChannel;
      if (!channel?.isTextBased()) {
        logger.warn(`Governance channel ${governanceChannelId} not found or not text-based`);
        return { success: false, errorMessage: 'Governance channel not found or not text-based' };
      }

      await channel.send(message);
      return { success: true, channelName: channel.name };
    } catch (error) {
      logger.error({ error, guildId, message: message.substring(0, 100) }, 'Failed to post to governance channel');
      return { 
        success: false, 
        errorMessage: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Gets governance channel reference for display
   */
  static getGovernanceChannelReference(): string {
    const governanceChannelId = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE;
    return governanceChannelId ? `<#${governanceChannelId}>` : 'governance channel';
  }

  /**
   * Finds the #general channel in a guild
   */
  static async findGeneralChannel(guild: Guild): Promise<TextChannel | null> {
    // Try exact match first
    let channel = guild.channels.cache.find(ch => 
      ch.isTextBased() && 
      ch.name === 'general'
    ) as TextChannel | undefined;

    // If not found, try system channel
    if (!channel && guild.systemChannelId) {
      const systemChannel = guild.channels.cache.get(guild.systemChannelId);
      if (systemChannel?.isTextBased()) {
        channel = systemChannel as TextChannel;
      }
    }

    // If still not found, get first available text channel
    if (!channel) {
      channel = guild.channels.cache.find(ch => 
        ch.isTextBased() && 
        ch.permissionsFor(guild.members.me!)?.has('SendMessages')
      ) as TextChannel | undefined;
    }

    return channel || null;
  }
}