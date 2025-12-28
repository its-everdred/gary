import type { Client, Guild, TextChannel } from 'discord.js';
import { NOMINATION_CONFIG } from './constants.js';
import { ConfigService } from './configService.js';

export class ChannelFinderService {
  private static client: Client | null = null;
  
  /**
   * Initialize the service with a client instance
   */
  static initialize(client: Client): void {
    this.client = client;
  }
  
  /**
   * Get the configured guild
   */
  private static async getGuild(): Promise<Guild | null> {
    if (!this.client) return null;
    
    try {
      const guildId = ConfigService.getGuildId();
      return await this.client.guilds.fetch(guildId);
    } catch {
      return null;
    }
  }
  
  /**
   * Abstract function to find a channel by its ID
   */
  private static async findChannel(channelId: string | undefined): Promise<TextChannel | null> {
    if (!channelId) return null;
    
    const guild = await this.getGuild();
    if (!guild) return null;
    
    const channel = guild.channels.cache.get(channelId);
    return channel?.isTextBased() ? channel as TextChannel : null;
  }

  static async governance(): Promise<TextChannel | null> {
    return this.findChannel(NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE);
  }

  static async general(): Promise<TextChannel | null> {
    return this.findChannel(NOMINATION_CONFIG.CHANNELS.GENERAL);
  }

  static async modComms(): Promise<TextChannel | null> {
    return this.findChannel(NOMINATION_CONFIG.CHANNELS.MOD_COMMS);
  }

  static async modWarn(): Promise<TextChannel | null> {
    return this.findChannel(NOMINATION_CONFIG.CHANNELS.MOD_WARN);
  }
  
  /**
   * Get the guild instance for other services to use
   */
  static async guild() {
    return this.getGuild();
  }
}