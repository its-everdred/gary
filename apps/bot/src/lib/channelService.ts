import type { Client, Guild, TextChannel, Role } from 'discord.js';
import { ChannelType as DJSChannelType, PermissionFlagsBits } from 'discord.js';
import pino from 'pino';
import { prisma } from './db.js';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';
import { NomineeDisplayUtils } from './nomineeDisplayUtils.js';

const logger = pino();

export interface ChannelCreationResult {
  success: boolean;
  channel?: TextChannel;
  errorMessage?: string;
}

export class ChannelManagementService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Creates a discussion channel for a nominee
   */
  async createDiscussionChannel(nominee: Nominee): Promise<ChannelCreationResult> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      if (!guild) {
        return {
          success: false,
          errorMessage: `Guild ${nominee.guildId} not found`
        };
      }

      const channelName = this.generateDiscussionChannelName(nominee.name);
      
      // Create the channel
      const createOptions = {
        name: channelName,
        type: DJSChannelType.GuildText,
        topic: `Discussion for nominee: ${nominee.name}`,
        reason: `Discussion channel for nominee ${nominee.name}`
      } as any;

      // Add parent category if configured
      const nominationsCategoryId = NOMINATION_CONFIG.CATEGORIES.NOMINATIONS;
      if (nominationsCategoryId) {
        const category = guild.channels.cache.get(nominationsCategoryId);
        if (category && category.type === DJSChannelType.GuildCategory) {
          createOptions.parent = nominationsCategoryId;
        } else {
          logger.warn({
            nomineeId: nominee.id,
            categoryId: nominationsCategoryId
          }, 'Nominations category not found or invalid, creating channel without parent');
        }
      }

      const channel = await guild.channels.create(createOptions) as TextChannel;

      // Update the nominee record with the channel ID
      await prisma.nominee.update({
        where: { id: nominee.id },
        data: { discussionChannelId: channel.id }
      });

      // Send initial message
      await this.sendDiscussionStartMessage(channel, nominee);

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        channelId: channel.id,
        channelName: channel.name,
        guildId: guild.id
      }, 'Discussion channel created successfully');

      return {
        success: true,
        channel
      };
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to create discussion channel');

      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Creates a vote channel for a nominee
   */
  async createVoteChannel(nominee: Nominee): Promise<ChannelCreationResult> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      if (!guild) {
        return {
          success: false,
          errorMessage: `Guild ${nominee.guildId} not found`
        };
      }

      // Get member count first, before creating channel
      let memberCount = 0;
      let requiredQuorum = 0;
      try {
        await guild.members.fetch();
        const nonBotMembers = guild.members.cache.filter(member => !member.user.bot);
        memberCount = nonBotMembers.size;
        requiredQuorum = Math.ceil(memberCount * NOMINATION_CONFIG.VOTE_QUORUM_THRESHOLD);
        
        logger.info({
          guildId: guild.id,
          memberCount,
          requiredQuorum
        }, 'Calculated quorum for vote');
      } catch (fetchError) {
        logger.error({
          error: fetchError,
          guildId: guild.id
        }, 'Failed to fetch members for quorum calculation');
        return {
          success: false,
          errorMessage: 'Failed to calculate quorum: Could not fetch guild members'
        };
      }

      const channelName = this.generateVoteChannelName(nominee.name);
      
      // Create the channel with restricted permissions
      const createOptions = {
        name: channelName,
        type: DJSChannelType.GuildText,
        topic: `Vote for nominee: ${nominee.name}`,
        reason: `Vote channel for nominee ${nominee.name}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.SendMessages],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: this.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          }
        ]
      } as any;

      // Add parent category if configured
      const nominationsCategoryId = NOMINATION_CONFIG.CATEGORIES.NOMINATIONS;
      if (nominationsCategoryId) {
        const category = guild.channels.cache.get(nominationsCategoryId);
        if (category && category.type === DJSChannelType.GuildCategory) {
          createOptions.parent = nominationsCategoryId;
        } else {
          logger.warn({
            nomineeId: nominee.id,
            categoryId: nominationsCategoryId
          }, 'Nominations category not found or invalid, creating vote channel without parent');
        }
      }

      const channel = await guild.channels.create(createOptions) as TextChannel;

      // Update the nominee record with the vote channel ID
      await prisma.nominee.update({
        where: { id: nominee.id },
        data: { voteChannelId: channel.id }
      });

      // Send initial vote message with calculated quorum
      await this.sendVoteStartMessage(channel, nominee, memberCount, requiredQuorum);

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        channelId: channel.id,
        channelName: channel.name,
        guildId: guild.id
      }, 'Vote channel created successfully');

      return {
        success: true,
        channel
      };
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to create vote channel');

      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Archives a channel by making it read-only and adding archive prefix
   */
  async archiveChannel(channelId: string, reason: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        logger.warn({ channelId }, 'Channel not found or not text-based');
        return false;
      }

      const guild = channel.guild;
      const newName = `archived-${channel.name}`;

      // Update channel permissions to make it read-only
      await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
        SendMessages: false,
        AddReactions: false
      });

      // Rename with archive prefix
      await channel.setName(newName);

      // Send archive message
      await channel.send(`🔒 **Channel Archived**\n\nReason: ${reason}\n\nThis channel is now read-only.`);

      logger.info({
        channelId: channel.id,
        oldName: channel.name.replace('archived-', ''),
        newName: newName,
        reason
      }, 'Channel archived successfully');

      return true;
    } catch (error) {
      logger.error({ error, channelId, reason }, 'Failed to archive channel');
      return false;
    }
  }

  /**
   * Deletes a channel completely
   */
  async deleteChannel(channelId: string, reason: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        logger.warn({ channelId }, 'Channel not found for deletion');
        return false;
      }

      await channel.delete(reason);

      logger.info({
        channelId,
        reason
      }, 'Channel deleted successfully');

      return true;
    } catch (error) {
      logger.error({ error, channelId, reason }, 'Failed to delete channel');
      return false;
    }
  }

  /**
   * Generates a discussion channel name from nominee name
   */
  private generateDiscussionChannelName(nomineeName: string): string {
    const sanitized = nomineeName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 88); // 100 - "discussion-".length = 88
    
    return `discussion-${sanitized}`;
  }

  /**
   * Generates a vote channel name from nominee name
   */
  private generateVoteChannelName(nomineeName: string): string {
    const sanitized = nomineeName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 95); // 100 - "vote-".length = 95
    
    return `vote-${sanitized}`;
  }

  /**
   * Sends the initial message when discussion starts
   */
  private async sendDiscussionStartMessage(channel: TextChannel, nominee: Nominee): Promise<void> {
    try {

      // Try to find the nominator by username to ping them (using cached members only)
      let nominatorMember = channel.guild.members.cache.find(member => 
        member.user.username === nominee.nominator || 
        member.displayName === nominee.nominator
      );

      // If not found in cache, try a limited fetch with timeout
      if (!nominatorMember) {
        try {
          
          // Use a Promise.race with timeout to prevent hanging
          await Promise.race([
            channel.guild.members.fetch({ limit: 100 }), // Only fetch recent 100 members
            new Promise((_, reject) => setTimeout(() => reject(new Error('Member fetch timeout')), 5000)) // 5 second timeout
          ]);
          
          // Try to find the nominator again after fetch
          nominatorMember = channel.guild.members.cache.find(member => 
            member.user.username === nominee.nominator || 
            member.displayName === nominee.nominator
          );
        } catch (fetchError) {
          logger.warn({
            error: fetchError,
            nomineeId: nominee.id
          }, 'Failed to fetch guild members for nominator lookup, proceeding without ping');
        }
      }
      
      const nominatorMention = nominatorMember ? nominatorMember.toString() : nominee.nominator;
      const nominatorDisplay = nominee.nominator || 'Unknown user';
      
      const embed = {
        title: `📋 Discussion: ${nominee.name}`,
        description: `Discussion period has begun for nominee **${nominee.name}**.`,
        fields: [
          {
            name: '👤 Nominated by',
            value: nominatorDisplay,
            inline: true
          },
          {
            name: '⏰ Discussion Duration',
            value: NomineeDisplayUtils.formatDuration(NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES),
            inline: true
          },
        ],
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Governance Discussion'
        }
      };

      // Send embed first
      await channel.send({
        embeds: [embed]
      });

      // Then send nominator ping as separate message
      const content = nominatorMember 
        ? `${nominatorMention}, please kick us off and let us know why you nominated ${nominee.name}.`
        : `The discussion period for **${nominee.name}** has begun.`;

      await channel.send({
        content
      });

    } catch (error) {
      logger.error({ 
        error, 
        channelId: channel.id,
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        nominator: nominee.nominator
      }, 'Failed to send discussion start message');
      throw error; // Re-throw so the calling function knows it failed
    }
  }

  /**
   * Sends the initial message when voting starts
   */
  private async sendVoteStartMessage(channel: TextChannel, nominee: Nominee, memberCount: number, requiredQuorum: number): Promise<void> {
    try {
      // Calculate timestamps for poll
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + (NOMINATION_CONFIG.VOTE_DURATION_MINUTES * 60); // Convert minutes to seconds
      
      // Generate the exact EasyPoll command
      const voteDurationFormatted = NOMINATION_CONFIG.VOTE_DURATION_MINUTES >= 1440 
        ? `${Math.round(NOMINATION_CONFIG.VOTE_DURATION_MINUTES / 1440)}d`
        : NOMINATION_CONFIG.VOTE_DURATION_MINUTES >= 60
        ? `${Math.round(NOMINATION_CONFIG.VOTE_DURATION_MINUTES / 60)}h`
        : `${NOMINATION_CONFIG.VOTE_DURATION_MINUTES}m`;
      
      const pollCommand = `/timepoll question:Should we invite ${nominee.name} to GA? time:${voteDurationFormatted} type:Anonymous (Buttons) maxchoices:1 text:Start: <t:${startTime}:F>\\nEnd: <t:${endTime}:F> answer-1:✅:Yes, Accept answer-2:❌:No, Reject`;

      // Get moderator role (this should be configured per guild)
      const moderatorRole = await this.getModeratorRole(channel.guild);
      const moderatorMention = moderatorRole ? `<@&${moderatorRole.id}>` : '@Moderator';

      const infoEmbed = {
        title: `🗳️ Vote: ${nominee.name}`,
        description: `Voting period has begun for nominee **${nominee.name}**.`,
        fields: [
          {
            name: '⏰ Vote Duration',
            value: NomineeDisplayUtils.formatDuration(NOMINATION_CONFIG.VOTE_DURATION_MINUTES),
            inline: true
          },
          {
            name: '📊 Quorum Required',
            value: `${requiredQuorum} vote minimum (40%)`,
            inline: true
          },
          {
            name: '✅ Pass Threshold',
            value: '80% yes votes',
            inline: true
          }
        ],
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'GA Governance Vote'
        }
      };

      // Send the message with moderator ping
      await channel.send({
        embeds: [infoEmbed]
      });

      // Also notify in mod comms channel if configured
      const modCommsChannelId = NOMINATION_CONFIG.CHANNELS.MOD_COMMS;
      
      if (modCommsChannelId) {
        try {
          const modCommsChannel = channel.guild.channels.cache.get(modCommsChannelId) as TextChannel;
          
          if (modCommsChannel?.isTextBased()) {
            const modNotifyEmbed = {
              title: '🚨 Poll Creation Required',
              description: `A vote has started for **${nominee.name}** and requires immediate moderator action.`,
              fields: [
                {
                  name: '📋 Copy/Paste Command',
                  value: `\`\`\`${pollCommand}\`\`\``
                },
                {
                  name: '📍 Vote Channel',
                  value: `<#${channel.id}>`,
                  inline: false
                }
              ],
              color: 0xff6600,
              timestamp: new Date().toISOString(),
              footer: {
                text: 'Nomination System • Action Required'
              }
            };

            await modCommsChannel.send({
              content: `${moderatorMention} **Vote poll needs to be created!**`,
              embeds: [modNotifyEmbed]
            });
          } else {
            logger.warn({
              nomineeId: nominee.id,
              modCommsChannelId
            }, 'Mod comms channel not found or not text-based');
          }
        } catch (error) {
          logger.error({
            error: error instanceof Error ? {
              message: error.message,
              stack: error.stack
            } : error,
            nomineeId: nominee.id
          }, 'Failed to send notification to mod comms channel');
        }
      } else {
        logger.warn({
          nomineeId: nominee.id
        }, 'MOD_COMMS_CHANNEL_ID not configured - no mod notification sent');
      }

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        channelId: channel.id,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to send vote start message');
    }
  }

  /**
   * Gets the moderator role for a guild
   */
  private async getModeratorRole(guild: Guild): Promise<Role | null> {
    // Check common moderator role names
    const moderatorRoleNames = ['moderator', 'mod', 'admin', 'administrator', 'staff'];
    
    for (const roleName of moderatorRoleNames) {
      const role = guild.roles.cache.find(r => 
        r.name.toLowerCase() === roleName || 
        r.name.toLowerCase().includes(roleName)
      );
      if (role) return role;
    }

    // If no role found, check for roles with moderate members permission
    const modRole = guild.roles.cache.find(r => 
      r.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      r.permissions.has(PermissionFlagsBits.Administrator)
    );

    return modRole || null;
  }
}