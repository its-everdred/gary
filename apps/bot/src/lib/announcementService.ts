import type { Client, TextChannel, Guild } from 'discord.js';
import pino from 'pino';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';
import { NomineeStateManager } from './nomineeService.js';
import { NomineeDisplayUtils } from './nomineeDisplayUtils.js';

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
        description: `Voting has begun for **${nominee.name}**'s nomination in ${voteChannelMention}.`,
        fields: [
          {
            name: '⏱️ Duration',
            value: NomineeDisplayUtils.formatDuration(NOMINATION_CONFIG.VOTE_DURATION_MINUTES),
            inline: true
          },
          {
            name: '📊 Requirements',
            value: '• 40% member participation (quorum)\n• 80% approval threshold',
            inline: true
          }
        ],
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Governance • All members are encouraged to vote'
        }
      };

      await governanceChannel.send({
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
        description: `Discussion period has begun for **${nominee.name}**'s nomination in ${discussionChannelMention}.`,
        fields: [
          {
            name: '⏱️ Duration',
            value: NomineeDisplayUtils.formatDuration(NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES),
            inline: true
          }
        ],
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Governance • All members welcome to participate'
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
        title: `${resultEmoji} Membership Vote Results`,
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
          text: passed ? 'Vote passed' : 'Vote failed'
        }
      };

      const announcement = passed 
        ? `🎉 **Congratulations!** ${nominee.name} has been approved for membership!`
        : `The membership vote for ${nominee.name} has concluded.`;

      await generalChannel.send({
        content: announcement,
        embeds: [embed]
      });

      // Also post to governance channel with next nominee info
      await this.postResultsToGovernanceChannel(nominee, passed, yesVotes, noVotes, quorumMet);

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
   * Posts vote results to governance channel with next nominee info
   */
  private async postResultsToGovernanceChannel(
    nominee: Nominee, 
    passed: boolean, 
    yesVotes: number, 
    noVotes: number, 
    quorumMet: boolean
  ): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const governanceChannel = await this.findGovernanceChannel(guild);
      
      if (!governanceChannel) {
        logger.warn({ guildId: nominee.guildId }, 'Governance channel not found for results posting');
        return;
      }

      // Get next nominee in queue
      const nextNominee = await NomineeStateManager.getNextNomineeForDiscussion(nominee.guildId);
      
      const resultText = passed ? '✅ **APPROVED**' : '❌ **NOT APPROVED**';
      const totalVotes = yesVotes + noVotes;
      const yesPercentage = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;
      
      let message = `**Vote Complete:** ${nominee.name} - ${resultText}\n`;
      message += `📊 Results: ${yesVotes} Yes (${yesPercentage}%), ${noVotes} No\n`;
      message += `📋 Quorum: ${quorumMet ? '✅ Met' : '❌ Not met'}\n\n`;
      
      if (nextNominee) {
        message += `**Next Up:** ${nextNominee.name} (nominated by ${nextNominee.nominator})`;
      } else {
        message += `**Next Up:** No nominees in queue`;
      }

      await governanceChannel.send(message);

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        nextNomineeName: nextNominee?.name,
        governanceChannelId: governanceChannel.id
      }, 'Vote results posted to governance channel with next nominee info');

    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post results to governance channel');
    }
  }

  /**
   * Finds the governance channel in a guild
   */
  private async findGovernanceChannel(guild: Guild): Promise<TextChannel | null> {
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
   * Announces that vote time expired without poll completion
   */
  async announceVoteTimeExpired(nominee: Nominee): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const generalChannel = await this.findGeneralChannel(guild);
      
      if (!generalChannel) {
        logger.warn({
          guildId: nominee.guildId,
          nomineeName: nominee.name
        }, 'General channel not found for vote expiration announcement');
        return false;
      }

      const embed = {
        title: '⏰ Vote Period Expired',
        description: `The voting period for **${nominee.name}**'s nomination has ended.`,
        fields: [
          {
            name: '📊 Status',
            value: 'Vote period expired - please check poll results manually',
            inline: false
          }
        ],
        color: 0xff9500,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Governance • Vote Expired'
        }
      };

      await generalChannel.send({
        content: `The vote period for ${nominee.name} has ended.`,
        embeds: [embed]
      });

      // Also post to governance channel with next nominee info
      await this.postResultsToGovernanceChannel(nominee, false, 0, 0, false);

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        generalChannelId: generalChannel.id
      }, 'Vote expiration announced in general channel');

      return true;
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post vote expiration announcement');
      return false;
    }
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