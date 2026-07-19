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

  static getModFlagChannelId(): string | null {
    return process.env.MOD_FLAG_CHANNEL_ID || null;
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

  static getKickQuorumPercent(): number {
    return parseInt(process.env.KICK_QUORUM_PERCENT || '40') / 100;
  }

  static getVoteQuorumPercent(): number {
    return parseInt(process.env.VOTE_QUORUM_PERCENT || '40') / 100;
  }

  static getLogLevel(): string {
    return process.env.LOG_LEVEL || 'info';
  }

  static getPruneWeeks(): number {
    const weeks = parseInt(process.env.PRUNE_WEEKS || '6');
    return Number.isNaN(weeks) || weeks <= 0 ? 6 : weeks;
  }

  /**
   * Whether to request the privileged Server Members Intent. Only enable this
   * once the intent is also toggled on in the Discord Developer Portal — with
   * it, `/mod purge check` can also flag members who have never posted.
   * Default false so the bot runs without any privileged intent.
   */
  static getPruneMemberRoster(): boolean {
    return process.env.PRUNE_MEMBER_ROSTER === 'true';
  }
}