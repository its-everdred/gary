/**
 * Centralized configuration service to standardize environment variable access
 */
export class ConfigService {
  static getGuildId(): string {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      throw new Error('GUILD_ID environment variable is required');
    }
    return guildId;
  }

  static getGovernanceChannelId(): string | null {
    return process.env.GOVERNANCE_CHANNEL_ID || null;
  }

  static getGeneralChannelId(): string | null {
    return process.env.GENERAL_CHANNEL_ID || null;
  }

  static getModCommsChannelId(): string | null {
    return process.env.MOD_COMMS_CHANNEL_ID || null;
  }

  static getModWarnChannelId(): string | null {
    return process.env.MOD_WARN_CHANNEL_ID || null;
  }

  static getNominationsCategoryId(): string | null {
    return process.env.NOMINATIONS_CHANNEL_CATEGORY_ID || null;
  }

  static getDiscordToken(): string {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN environment variable is required');
    }
    return token;
  }

  static getDiscordAppId(): string {
    const appId = process.env.DISCORD_APP_ID;
    if (!appId) {
      throw new Error('DISCORD_APP_ID environment variable is required');
    }
    return appId;
  }

  static getDatabaseUrl(): string {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    return dbUrl;
  }

  static getGuildSalt(): string {
    const salt = process.env.GUILD_SALT;
    if (!salt) {
      throw new Error('GUILD_SALT environment variable is required');
    }
    return salt;
  }
}