import type { Client } from 'discord.js';
import pino from 'pino';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';
import { NomineeStateManager } from './nomineeService.js';
import { NomineeDisplayUtils } from './nomineeDisplayUtils.js';
import { ChannelFinderService } from './channelFinderService.js';
import { prisma } from './db.js';
import { ConfigService } from './configService.js';
import { TimestampUtils } from './timestampUtils.js';

const logger = pino();

export class AnnouncementService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }


  /**
   * Adds message IDs to the nominee's announcement tracking field
   */
  private async addAnnouncementMessageIds(nomineeId: string, messageIds: string[]): Promise<void> {
    try {
      const nominee = await prisma.nominee.findUnique({
        where: { id: nomineeId }
      });

      if (!nominee) return;

      const existingIds = nominee.announcementMessageIds ? nominee.announcementMessageIds.split(',') : [];
      const allIds = [...existingIds, ...messageIds].filter(Boolean);

      await prisma.nominee.update({
        where: { id: nomineeId },
        data: {
          announcementMessageIds: allIds.join(',')
        }
      });
    } catch (error) {
      logger.error({ error, nomineeId, messageIds }, 'Failed to store announcement message IDs');
    }
  }

  /**
   * Posts vote announcement to governance channel
   */
  async announceVoteStart(nominee: Nominee, voteChannelId: string, pollUrl?: string): Promise<boolean> {
    try {
      const governanceChannel = await ChannelFinderService.governance();
      
      if (!governanceChannel) {
        return false;
      }

      if (!nominee.voteStart || !nominee.certifyStart) {
        logger.warn({ nomineeId: nominee.id }, 'Vote start or certify start time not set');
        return false;
      }

      const voteStart = new Date(nominee.voteStart);
      const voteEnd = new Date(nominee.certifyStart);

      const description = pollUrl 
        ? `Voting has begun for **${nominee.name}**'s nomination: [Vote Now](${pollUrl})`
        : `Voting has begun for **${nominee.name}**'s nomination.`;

      const embed = {
        title: '🗳️ New Vote Started',
        description,
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: TimestampUtils.createTimeRangeFooter(voteStart, voteEnd)
        }
      };

      const governanceMessage = await governanceChannel.send({
        embeds: [embed]
      });

      const messageIds = [governanceMessage.id];

      // Also announce vote start in general channel
      try {
        const generalChannel = await ChannelFinderService.general();
        if (generalChannel) {
          const generalMessage = await generalChannel.send({
            embeds: [embed]
          });
          messageIds.push(generalMessage.id);
        }
      } catch (error) {
        // Don't fail if general channel announcement fails
        logger.error({
          error,
          nomineeId: nominee.id
        }, 'Failed to post vote announcement to general channel');
      }

      // Store message IDs for cleanup
      await this.addAnnouncementMessageIds(nominee.id, messageIds);

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
   * Posts discussion announcement to governance channel
   */
  async announceDiscussionStart(nominee: Nominee, discussionChannelId: string): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const governanceChannel = await ChannelFinderService.governance();
      
      if (!governanceChannel) {
        return false;
      }

      const discussionChannel = guild.channels.cache.get(discussionChannelId);
      const discussionChannelMention = discussionChannel ? `<#${discussionChannelId}>` : '#discussion-channel';

      if (!nominee.discussionStart || !nominee.voteStart) {
        logger.warn({ nomineeId: nominee.id }, 'Discussion start or vote start time not set');
        return false;
      }

      const discussionStart = new Date(nominee.discussionStart);
      const discussionEnd = new Date(nominee.voteStart);

      const nominatorName = await NomineeDisplayUtils.resolveNominatorName(nominee);
      const embed = {
        title: '💬 New Discussion Started',
        description: `Discussion period has begun for **${nominee.name}**'s nomination in ${discussionChannelMention}.`,
        fields: [
          {
            name: '👤 Nominated by',
            value: nominatorName,
            inline: true
          },
          {
            name: '⏱️ Duration',
            value: NomineeDisplayUtils.formatDuration(NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES),
            inline: true
          }
        ],
        color: 0x3498db,
        timestamp: discussionStart.toISOString()
      };

      const governanceMessage = await governanceChannel.send({
        embeds: [embed]
      });

      // Store message ID for cleanup
      await this.addAnnouncementMessageIds(nominee.id, [governanceMessage.id]);

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
      const generalChannel = await ChannelFinderService.general();
      
      if (!generalChannel) {
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
            value: `Quorum (${Math.round(ConfigService.getVoteQuorumPercent() * 100)}%): ${quorumMet ? '✅' : '❌'}\nApproval (${NOMINATION_CONFIG.VOTE_PASS_PERCENT}%): ${yesPercentage >= NOMINATION_CONFIG.VOTE_PASS_PERCENT ? '✅' : '❌'}`,
            inline: false
          }
        ],
        color: resultColor,
        timestamp: new Date().toISOString()
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
  async postResultsToGovernanceChannel(
    nominee: Nominee, 
    passed: boolean, 
    yesVotes: number, 
    noVotes: number, 
    quorumMet: boolean
  ): Promise<void> {
    try {
      const governanceChannel = await ChannelFinderService.governance();
      
      if (!governanceChannel) {
        return;
      }

      // Get next nominee in queue
      const nextNominee = await NomineeStateManager.getNextNomineeForDiscussion(nominee.guildId);
      
      const resultText = passed ? 'APPROVED' : 'NOT APPROVED';
      const resultEmoji = passed ? '✅' : '❌';
      const embedColor = passed ? 0x00ff00 : 0xff0000; // Green if passed, red if failed
      const totalVotes = yesVotes + noVotes;
      const yesPercentage = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;
      
      const embed = {
        title: `${resultEmoji} Vote Complete: ${nominee.name}`,
        description: `**Result: ${resultText}**`,
        fields: [
          {
            name: '📊 Vote Results',
            value: `${yesVotes} Yes (${yesPercentage}%) • ${noVotes} No (${100 - yesPercentage}%)`,
            inline: false
          },
          {
            name: '📋 Quorum Status',
            value: quorumMet ? '✅ Met' : '❌ Not met',
            inline: true
          },
          {
            name: '👤 Next Up',
            value: nextNominee 
              ? `${nextNominee.name} (by ${nextNominee.nominator})`
              : 'No nominees in queue',
            inline: true
          }
        ],
        color: embedColor,
        timestamp: new Date().toISOString(),
        footer: {
          text: TimestampUtils.createVoteResultFooter(
            nominee.voteStart ? new Date(nominee.voteStart) : null,
            nominee.certifyStart ? new Date(nominee.certifyStart) : null,
            passed
          )
        }
      };

      await governanceChannel.send({ embeds: [embed] });


    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to post results to governance channel');
    }
  }


  /**
   * Announces that vote time expired without poll completion
   */
  async announceVoteTimeExpired(nominee: Nominee): Promise<boolean> {
    try {
      const generalChannel = await ChannelFinderService.general();
      
      if (!generalChannel) {
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
          text: TimestampUtils.createTimeRangeFooter(
            nominee.voteStart ? new Date(nominee.voteStart) : null,
            nominee.certifyStart ? new Date(nominee.certifyStart) : null,
            'Vote Expired'
          )
        }
      };

      await generalChannel.send({
        content: `The vote period for ${nominee.name} has ended.`,
        embeds: [embed]
      });

      // Also post to governance channel with next nominee info
      await this.postResultsToGovernanceChannel(nominee, false, 0, 0, false);


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

}