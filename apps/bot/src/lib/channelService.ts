import type { Client, Guild, TextChannel, Role } from 'discord.js';
import { ChannelType as DJSChannelType, PermissionFlagsBits } from 'discord.js';
import pino from 'pino';
import { prisma } from './db.js';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';

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
      const channel = await guild.channels.create({
        name: channelName,
        type: DJSChannelType.GuildText,
        topic: `Discussion for nominee: ${nominee.name}`,
        reason: `Discussion channel for nominee ${nominee.name}`
      });

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

      const channelName = this.generateVoteChannelName(nominee.name);
      
      // Create the channel with restricted permissions
      const channel = await guild.channels.create({
        name: channelName,
        type: DJSChannelType.GuildText,
        topic: `Vote for nominee: ${nominee.name}`,
        reason: `Vote channel for nominee ${nominee.name}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.SendMessages],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          }
        ]
      });

      // Update the nominee record with the vote channel ID
      await prisma.nominee.update({
        where: { id: nominee.id },
        data: { voteChannelId: channel.id }
      });

      // Send initial vote message
      await this.sendVoteStartMessage(channel, nominee);

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
      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        nominator: nominee.nominator,
        channelId: channel.id
      }, 'Sending discussion start message');

      // Try to find the nominator by username to ping them (using cached members only)
      let nominatorMember = channel.guild.members.cache.find(member => 
        member.user.username === nominee.nominator || 
        member.displayName === nominee.nominator
      );

      // If not found in cache, try a limited fetch with timeout
      if (!nominatorMember) {
        try {
          logger.info({
            nomineeId: nominee.id,
            nominator: nominee.nominator
          }, 'Attempting to fetch guild members to find nominator');
          
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
            nomineeId: nominee.id,
            nominator: nominee.nominator
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
            value: `${Math.round(NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES / 60)} hours`,
            inline: true
          },
          {
            name: '📝 Purpose',
            value: 'Use this channel to discuss the nominee\'s qualifications, contributions, and suitability.',
            inline: false
          }
        ],
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Governance Discussion'
        }
      };

      const content = nominatorMember 
        ? `**Discussion has started!**\n\n${nominatorMention}, please kick us off with why you think ${nominee.name} should be invited.\n\nAll members are welcome to participate in this discussion.`
        : `**Discussion has started!**\n\nThe discussion period for **${nominee.name}** has begun. All members are welcome to participate.`;

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        channelId: channel.id,
        nominatorFound: !!nominatorMember
      }, 'About to send discussion start message to channel');

      const message = await channel.send({
        content,
        embeds: [embed]
      });

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        channelId: channel.id,
        messageId: message.id,
        nominatorFound: !!nominatorMember,
        nominatorUserId: nominatorMember?.user.id
      }, 'Discussion start message sent successfully');

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
  private async sendVoteStartMessage(channel: TextChannel, nominee: Nominee): Promise<void> {
    try {
      // Calculate timestamps for poll
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + (5 * 24 * 60 * 60); // 5 days in seconds
      
      // Generate the exact EasyPoll command
      const pollCommand = `/poll question:Should we invite ${nominee.name} to GA? time:5d type:Anonymous (Buttons) maxchoices:1 text:Start: <t:${startTime}:F>\\nEnd: <t:${endTime}:F> answer-1:✅:Yes, Accept answer-2:❌:No, Reject`;

      // Get moderator role (this should be configured per guild)
      const moderatorRole = await this.getModeratorRole(channel.guild);
      const moderatorMention = moderatorRole ? `<@&${moderatorRole.id}>` : '@Moderator';

      const infoEmbed = {
        title: `🗳️ Vote: ${nominee.name}`,
        description: `Voting period has begun for nominee **${nominee.name}**.`,
        fields: [
          {
            name: '⏰ Vote Duration',
            value: '5 days (120 hours)',
            inline: true
          },
          {
            name: '📊 Quorum Required',
            value: '40% of members',
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

      const commandEmbed = {
        title: '🚨 MODERATOR ACTION REQUIRED',
        description: 'Please create the EasyPoll by copying and pasting this command **exactly**:',
        fields: [
          {
            name: 'EasyPoll Command',
            value: `\`\`\`${pollCommand}\`\`\``
          },
          {
            name: 'Instructions',
            value: '1. Copy the command above\n2. Paste it in this channel\n3. Press Enter to create the poll\n4. The poll will run for 5 days automatically',
            inline: false
          }
        ],
        color: 0xff6600,
        footer: {
          text: 'This is a time-sensitive action - please create the poll immediately'
        }
      };

      // Send the message with moderator ping
      await channel.send({
        content: `${moderatorMention} **Immediate action required to create the vote poll!**`,
        embeds: [infoEmbed, commandEmbed]
      });

      // Log the poll creation request
      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        channelId: channel.id,
        pollCommand,
        startTimestamp: startTime,
        endTimestamp: endTime
      }, 'Vote poll creation requested');

    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Failed to send vote start message');
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