import type { Client, TextChannel, Guild } from 'discord.js';
import pino from 'pino';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';

const logger = pino();

export class AnnouncementService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Posts vote announcement to #ga-governance channel
   */
  async announceVoteStart(nominee: Nominee, voteChannelId: string): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const governanceChannel = await this.findGovernanceChannel(guild);
      
      if (!governanceChannel) {
        logger.warn({
          guildId: nominee.guildId,
          nomineeName: nominee.name
        }, 'GA governance channel not found for vote announcement');
        return false;
      }

      const voteChannel = guild.channels.cache.get(voteChannelId);
      const voteChannelMention = voteChannel ? `<#${voteChannelId}>` : '#vote-channel';

      const embed = {
        title: '🗳️ New Vote Started',
        description: `Voting has begun for **${nominee.name}**'s nomination to GA membership.`,
        fields: [
          {
            name: '📍 Vote Location',
            value: `Please vote in ${voteChannelMention}`,
            inline: false
          },
          {
            name: '⏱️ Duration',
            value: '5 days',
            inline: true
          },
          {
            name: '📊 Requirements',
            value: '• 40% member participation (quorum)\n• 80% approval threshold',
            inline: true
          },
          {
            name: '🔒 Voting Type',
            value: 'Anonymous (via EasyPoll)',
            inline: true
          }
        ],
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'GA Governance • All members are encouraged to vote'
        }
      };

      await governanceChannel.send({
        content: '@everyone A new GA membership vote has started!',
        embeds: [embed]
      });

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        governanceChannelId: governanceChannel.id,
        voteChannelId
      }, 'Vote announcement posted to governance channel');

      return true;
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post vote announcement');
      return false;
    }
  }

  /**
   * Posts discussion announcement to #ga-governance channel
   */
  async announceDiscussionStart(nominee: Nominee, discussionChannelId: string): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const governanceChannel = await this.findGovernanceChannel(guild);
      
      if (!governanceChannel) {
        logger.warn({
          guildId: nominee.guildId,
          nomineeName: nominee.name
        }, 'GA governance channel not found for discussion announcement');
        return false;
      }

      const discussionChannel = guild.channels.cache.get(discussionChannelId);
      const discussionChannelMention = discussionChannel ? `<#${discussionChannelId}>` : '#discussion-channel';

      const embed = {
        title: '💬 New Discussion Started',
        description: `Discussion period has begun for **${nominee.name}**'s nomination to GA membership.`,
        fields: [
          {
            name: '📍 Discussion Location',
            value: `Join the discussion in ${discussionChannelMention}`,
            inline: false
          },
          {
            name: '⏱️ Duration',
            value: '48 hours',
            inline: true
          },
          {
            name: '🎯 Purpose',
            value: 'Share thoughts on the nominee\'s qualifications and contributions',
            inline: true
          }
        ],
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'GA Governance • All members welcome to participate'
        }
      };

      await governanceChannel.send({
        embeds: [embed]
      });

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        governanceChannelId: governanceChannel.id,
        discussionChannelId
      }, 'Discussion announcement posted to governance channel');

      return true;
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post discussion announcement');
      return false;
    }
  }

  /**
   * Posts final results to #general channel
   */
  async announceResults(
    nominee: Nominee, 
    passed: boolean, 
    yesVotes: number, 
    noVotes: number, 
    quorumMet: boolean
  ): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const generalChannel = await this.findGeneralChannel(guild);
      
      if (!generalChannel) {
        logger.warn({
          guildId: nominee.guildId,
          nomineeName: nominee.name
        }, 'General channel not found for results announcement');
        return false;
      }

      const totalVotes = yesVotes + noVotes;
      const yesPercentage = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;

      const resultEmoji = passed ? '✅' : '❌';
      const resultText = passed ? 'APPROVED' : 'NOT APPROVED';
      const resultColor = passed ? 0x00ff00 : 0xff0000;

      const embed = {
        title: `${resultEmoji} GA Membership Vote Results`,
        description: `The vote for **${nominee.name}** has concluded.`,
        fields: [
          {
            name: '📊 Result',
            value: `**${resultText}**`,
            inline: false
          },
          {
            name: '✅ Yes Votes',
            value: `${yesVotes} (${yesPercentage}%)`,
            inline: true
          },
          {
            name: '❌ No Votes', 
            value: `${noVotes} (${100 - yesPercentage}%)`,
            inline: true
          },
          {
            name: '📈 Total Votes',
            value: totalVotes.toString(),
            inline: true
          },
          {
            name: '📋 Requirements Met',
            value: `Quorum (40%): ${quorumMet ? '✅' : '❌'}\nApproval (80%): ${yesPercentage >= 80 ? '✅' : '❌'}`,
            inline: false
          }
        ],
        color: resultColor,
        timestamp: new Date().toISOString(),
        footer: {
          text: passed ? 'Welcome to GA!' : 'Better luck next time'
        }
      };

      const announcement = passed 
        ? `🎉 **Congratulations!** ${nominee.name} has been approved for GA membership!`
        : `The GA membership vote for ${nominee.name} has concluded.`;

      await generalChannel.send({
        content: announcement,
        embeds: [embed]
      });

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        passed,
        yesVotes,
        noVotes,
        quorumMet,
        generalChannelId: generalChannel.id
      }, 'Vote results announced in general channel');

      return true;
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post results announcement');
      return false;
    }
  }

  /**
   * Finds the #ga-governance channel in a guild
   */
  private async findGovernanceChannel(guild: Guild): Promise<TextChannel | null> {
    const channel = guild.channels.cache.find(ch => 
      ch.isTextBased() && 
      ch.name === 'ga-governance'
    ) as TextChannel | undefined;

    return channel || null;
  }

  /**
   * Finds the #general channel in a guild
   */
  private async findGeneralChannel(guild: Guild): Promise<TextChannel | null> {
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