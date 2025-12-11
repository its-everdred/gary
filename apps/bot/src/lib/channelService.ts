import type { Client, Guild, TextChannel } from 'discord.js';
import { ChannelType as DJSChannelType, PermissionFlagsBits } from 'discord.js';
import pino from 'pino';
import { prisma } from './db.js';
import type { Nominee } from '@prisma/client';

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
      const nominator = await this.client.users.fetch(nominee.nominator);
      
      const embed = {
        title: `📋 Discussion: ${nominee.name}`,
        description: `Discussion period has begun for nominee **${nominee.name}**.`,
        fields: [
          {
            name: '👤 Nominated by',
            value: nominator ? nominator.toString() : 'Unknown user',
            inline: true
          },
          {
            name: '⏰ Discussion Duration',
            value: '48 hours',
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
          text: 'GA Governance Discussion'
        }
      };

      await channel.send({
        content: '🎯 **Discussion has started!**\n\nAll members are welcome to participate in this discussion.',
        embeds: [embed]
      });
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Failed to send discussion start message');
    }
  }

  /**
   * Sends the initial message when voting starts
   */
  private async sendVoteStartMessage(channel: TextChannel, nominee: Nominee): Promise<void> {
    try {
      const embed = {
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
          },
          {
            name: '🔗 Poll Location',
            value: 'Poll will be posted here shortly via polling bot',
            inline: false
          }
        ],
        color: 0xe74c3c,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'GA Governance Vote'
        }
      };

      await channel.send({
        content: '🗳️ **Voting has started!**\n\nPlease wait for the poll to be created.',
        embeds: [embed]
      });
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Failed to send vote start message');
    }
  }
}