import cron from 'node-cron';
import type { Client } from 'discord.js';
import pino from 'pino';
import { NomineeStateManager } from './nomineeService.js';
import { TimeCalculationService } from './timeCalculation.js';
import { ChannelManagementService } from './channelService.js';
import { AnnouncementService } from './announcementService.js';
import { VoteResultService, type VoteResults } from './voteResultService.js';
import { NomineeState } from '@prisma/client';
import { prisma } from './db.js';
import { NOMINATION_CONFIG } from './constants.js';
import { ChannelFinderService } from './channelFinderService.js';
import { DISCORD_CONSTANTS } from './discordConstants.js';
import { NomineeDisplayUtils } from './nomineeDisplayUtils.js';

const logger = pino();

export interface JobScheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

export class NominationJobScheduler implements JobScheduler {
  private static instance: NominationJobScheduler | null = null;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private client: Client;
  private channelService: ChannelManagementService;
  private announcementService: AnnouncementService;
  private voteResultService: VoteResultService;
  private _isRunning = false;

  private constructor(client: Client) {
    this.client = client;
    this.channelService = new ChannelManagementService(client);
    this.announcementService = new AnnouncementService(client);
    this.voteResultService = new VoteResultService(client);
  }

  static getInstance(client: Client): NominationJobScheduler {
    if (!this.instance) {
      this.instance = new NominationJobScheduler(client);
    }
    return this.instance;
  }

  start(): void {
    if (this._isRunning) {
      return;
    }

    this.scheduleStateTransitionJob();
    this.scheduleScheduleRecalculationJob();
    this._isRunning = true;
  }

  stop(): void {
    this.jobs.forEach((job) => {
      job.destroy();
    });

    this.jobs.clear();
    this._isRunning = false;
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Schedules the main state transition job that runs every minute
   * to check for nominees ready for state changes
   */
  private scheduleStateTransitionJob(): void {
    const job = cron.schedule(
      '* * * * *',
      async () => {
        try {
          await this.processStateTransitions();
        } catch (error) {
          logger.error(
            {
              error:
                error instanceof Error
                  ? {
                      message: error.message,
                      stack: error.stack,
                    }
                  : error,
            },
            'State transition job failed'
          );
        }
      },
      {
        scheduled: false,
        timezone: 'UTC',
      }
    );

    job.start();
    this.jobs.set('state-transitions', job);
  }

  /**
   * Schedules a job to recalculate schedules for active nominees
   * Runs every hour to ensure schedules stay accurate
   */
  private scheduleScheduleRecalculationJob(): void {
    const job = cron.schedule(
      '0 * * * *',
      async () => {
        try {
          await this.recalculateActiveSchedules();
        } catch (error) {
          logger.error({ error }, 'Schedule recalculation job failed');
        }
      },
      {
        scheduled: false,
        timezone: 'UTC',
      }
    );

    job.start();
    this.jobs.set('schedule-recalculation', job);
  }

  /**
   * Processes all possible state transitions for all guilds
   */
  private async processStateTransitions(): Promise<void> {
    const guilds = this.client.guilds.cache;

    for (const [guildId] of guilds) {
      try {
        await this.processGuildTransitions(guildId);
      } catch (error) {
        logger.error(
          {
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                  }
                : error,
            guildId,
          },
          'Guild state transition processing failed'
        );
      }
    }
  }

  /**
   * Processes state transitions for a specific guild
   */
  private async processGuildTransitions(guildId: string): Promise<void> {
    const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
    const currentTime = new Date();

    // Check for nominees ready to start discussion
    const readyForDiscussion = TimeCalculationService.getNomineeForStateAtTime(
      activeNominees,
      NomineeState.DISCUSSION,
      currentTime
    );

    if (readyForDiscussion) {
      await this.transitionToDiscussion(readyForDiscussion);
    }

    // Check for nominees ready to start voting
    const readyForVote = TimeCalculationService.getNomineeForStateAtTime(
      activeNominees,
      NomineeState.VOTE,
      currentTime
    );

    if (readyForVote) {
      await this.transitionToVote(readyForVote);
    }

    // Check for nominees in VOTE state - either ready by time or poll completed
    const voteNominees = activeNominees.filter(
      (n) => n.state === NomineeState.VOTE
    );

    for (const nominee of voteNominees) {
      // Check if governance announcement needs to be sent (poll posted but not announced yet)
      if (!nominee.voteGovernanceAnnounced && nominee.voteChannelId) {
        await this.checkAndAnnounceVoteToGovernance(nominee);
      }

      // Check if vote has completed (either by time or poll closure)
      const voteResults = await this.voteResultService.checkVoteCompletion(
        nominee
      );

      // Add 1-minute buffer after vote expiration to allow EasyPoll to finalize results
      const bufferTime = new Date(currentTime);
      bufferTime.setMinutes(bufferTime.getMinutes() - 1);
      const readyWithBuffer =
        nominee.cleanupStart && nominee.cleanupStart <= bufferTime;

      // Check if we should transition based on time - only if poll was detected
      const shouldTransitionByTime = readyWithBuffer && nominee.votePollDetectedAt;

      logger.debug(`Vote completion check for ${nominee.name}:`, {
        voteResults: !!voteResults,
        cleanupStart: nominee.cleanupStart?.toISOString(),
        currentTime: currentTime.toISOString(),
        bufferTime: bufferTime.toISOString(),
        readyWithBuffer,
        votePollDetectedAt: nominee.votePollDetectedAt?.toISOString(),
        shouldTransitionByTime
      });

      if (voteResults || shouldTransitionByTime) {
        logger.info(`Transitioning ${nominee.name} to CLEANUP - voteResults: ${!!voteResults}, timeExpired: ${shouldTransitionByTime}`);
        await this.transitionToCleanup(nominee, voteResults || undefined);
      }
    }

    // Check for nominees that should transition to PAST
    const cleanupNominees = activeNominees.filter(
      (n) => n.state === NomineeState.CLEANUP
    );

    for (const nominee of cleanupNominees) {
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(
        nominee,
        currentTime
      );

      logger.debug(`CLEANUP to PAST check for ${nominee.name}:`, {
        cleanupStart: nominee.cleanupStart?.toISOString(),
        currentTime: currentTime.toISOString(),
        shouldTransition
      });

      if (shouldTransition) {
        logger.info(`Transitioning ${nominee.name} from CLEANUP to PAST`);
        await this.transitionToPast(nominee);
      }
    }
  }

  /**
   * Checks if EasyPoll has been posted in vote channel and announces to governance if so
   */
  private async checkAndAnnounceVoteToGovernance(
    nominee: Nominee
  ): Promise<void> {
    try {
      if (!nominee.voteChannelId) {
        return;
      }

      const guild = await this.client.guilds.fetch(nominee.guildId);
      
      // Try to get channel by ID first (99% of cases)
      let voteChannel = guild.channels.cache.get(
        nominee.voteChannelId
      ) as TextChannel;

      // Fallback: If channel not found by ID, try to find by name pattern
      if (!voteChannel) {
        const channelName = `vote-${nominee.name}`;
        voteChannel = guild.channels.cache.find(
          channel => channel.name === channelName && channel.isTextBased()
        ) as TextChannel;
        
        if (!voteChannel) {
          return;
        }
      }

      // Check for EasyPoll messages in the channel
      const messages = await voteChannel.messages.fetch({
        limit: 10,
        force: true,
      });
      const easyPollMessage = messages.find(
        (msg) =>
          msg.author.id === DISCORD_CONSTANTS.BOT_IDS.EASYPOLL &&
          msg.embeds.length > 0
      );

      if (easyPollMessage) {
        // Check if this is the first time we're detecting the poll
        if (!nominee.votePollDetectedAt) {
          // First poll detection - adjust cleanupStart time
          const now = new Date();
          const newCleanupStart = new Date(now);
          newCleanupStart.setUTCMinutes(
            newCleanupStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES
          );
          
          // Update the nominee with poll detection time and adjusted cleanup time
          await prisma.nominee.update({
            where: { id: nominee.id },
            data: {
              votePollDetectedAt: now,
              cleanupStart: newCleanupStart,
            },
          });
          
          logger.info(
            {
              nomineeId: nominee.id,
              nomineeName: nominee.name,
              originalCleanupStart: nominee.cleanupStart,
              newCleanupStart,
              pollDetectedAt: now,
            },
            'Adjusted cleanup start time due to delayed poll posting'
          );
          
          // Update local nominee object for subsequent operations
          nominee.cleanupStart = newCleanupStart;
          nominee.votePollDetectedAt = now;
        }
        
        // EasyPoll found! Send governance announcement with link to poll
        const announced = await this.announcementService.announceVoteStart(
          nominee,
          nominee.voteChannelId,
          easyPollMessage.url
        );

        if (announced) {
          // Mark as announced in database
          await prisma.nominee.update({
            where: { id: nominee.id },
            data: { voteGovernanceAnnounced: true },
          });

          // Delete bot tracking messages (mod-comm instructions)
          if (nominee.botMessageIds) {
            try {
              const modCommsChannel = await ChannelFinderService.modComms();
              if (modCommsChannel) {
                const messageIds = nominee.botMessageIds.split(',');
                for (const messageId of messageIds) {
                  try {
                    const message = await modCommsChannel.messages.fetch(
                      messageId
                    );
                    await message.delete();
                  } catch {
                    // Message already deleted or not found, continue
                  }
                }
              }
            } catch (error) {
              // Log but don't fail the whole process
              logger.error(
                {
                  error,
                  nomineeId: nominee.id,
                  botMessageIds: nominee.botMessageIds,
                },
                'Failed to delete bot messages'
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error(
        {
          error,
          nomineeId: nominee.id,
          nomineeName: nominee.name,
        },
        'Failed to check for EasyPoll and announce to governance'
      );
    }
  }

  /**
   * Transitions a nominee from ACTIVE to DISCUSSION
   */
  private async transitionToDiscussion(nominee: Nominee): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.DISCUSSION,
      {
        discussionStart: new Date(),
      }
    );

    if (result.success) {
      logger.info(`Discussion started: ${nominee.name}`);

      // Create discussion channel
      const channelResult = await this.channelService.createDiscussionChannel(
        result.nominee
      );
      if (!channelResult.success) {
        logger.error(
          {
            nomineeId: nominee.id,
            error: channelResult.errorMessage,
          },
          'Failed to create discussion channel'
        );
      } else {
        // Send announcement to governance channel
        await this.announcementService.announceDiscussionStart(
          result.nominee,
          channelResult.channel!.id
        );
      }
    } else {
      logger.error(
        {
          nomineeId: nominee.id,
          error: result.errorMessage,
        },
        'Failed to transition nominee to DISCUSSION'
      );
    }
  }

  /**
   * Transitions a nominee from DISCUSSION to VOTE
   */
  public async transitionToVote(nominee: Nominee): Promise<void> {
    // Calculate new cleanup time based on current time
    const now = new Date();
    const cleanupStart = new Date(now);
    cleanupStart.setUTCMinutes(
      cleanupStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES
    );

    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.VOTE,
      {
        voteStart: now,
        cleanupStart: cleanupStart,
      }
    );

    if (result.success) {
      logger.info(`Vote started: ${nominee.name}`);

      // Create vote channel
      const channelResult = await this.channelService.createVoteChannel(
        result.nominee
      );
      if (!channelResult.success) {
        logger.error(
          {
            nomineeId: nominee.id,
            error: channelResult.errorMessage,
          },
          'Failed to create vote channel'
        );
      } else {
        // Note: Governance announcement will be sent automatically
        // once the moderator posts the EasyPoll in the vote channel
      }
    } else {
      logger.error(
        {
          nomineeId: nominee.id,
          error: result.errorMessage,
        },
        'Failed to transition nominee to VOTE'
      );
    }
  }

  /**
   * Transitions a nominee from VOTE to CLEANUP
   */
  private async transitionToCleanup(
    nominee: Nominee,
    voteResults?: VoteResults
  ): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.CLEANUP,
      {
        cleanupStart: new Date(),
      }
    );

    if (result.success) {
      logger.info(
        `Vote completed: ${nominee.name}${
          voteResults ? (voteResults.passed ? ' - PASSED' : ' - FAILED') : ''
        }`
      );

      // Post detailed results to both vote and governance channels if we have vote results
      if (voteResults) {
        // Post results to all channels (vote, governance, general, mod-comms)
        this.voteResultService
          .postVoteResults(nominee, voteResults)
          .catch((error) => {
            logger.error(
              { error, nomineeId: nominee.id },
              'Failed to post vote results'
            );
          });
      } else {
        // Vote period expired without results - create default failed results
        const expiredResults: VoteResults = {
          passed: false,
          yesVotes: 0,
          noVotes: 0,
          totalVotes: 0,
          quorumMet: false,
          passThresholdMet: false,
          memberCount: 0,
          requiredQuorum: 0,
          requiredPassVotes: 0,
        };

        // Post expired results to all channels
        this.voteResultService
          .postVoteResults(nominee, expiredResults)
          .catch((error) => {
            logger.error(
              { error, nomineeId: nominee.id },
              'Failed to post expired vote results'
            );
          });
      }
    } else {
      logger.error(
        {
          nomineeId: nominee.id,
          error: result.errorMessage,
        },
        'Failed to transition nominee to CLEANUP'
      );
    }
  }

  /**
   * Performs post-cleanup cleanup: transitions to PAST, deletes channels, sends instructions
   */
  async performPostCleanupCleanup(
    nominee: Nominee
  ): Promise<{ success: boolean; errorMessage?: string }> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.PAST
    );

    if (result.success) {
      logger.info(`Nomination completed: ${nominee.name}`);

      // Cleanup: Delete discussion and vote channels
      try {
        const channelService = new ChannelManagementService(this.client);

        // Delete discussion channel
        if (nominee.discussionChannelId) {
          await channelService.deleteChannel(
            nominee.discussionChannelId,
            'Nomination completed'
          );
        }

        // Delete vote channel
        if (nominee.voteChannelId) {
          await channelService.deleteChannel(
            nominee.voteChannelId,
            'Nomination completed'
          );
        }

        // Delete announcement messages from governance and general channels
        await this.deleteAnnouncementMessages(nominee);

        // Send cleanup instructions to mod-comms
        await this.sendCleanupInstructions(nominee);
      } catch (error) {
        logger.error(
          {
            error,
            nomineeId: nominee.id,
          },
          'Failed to delete nomination channels'
        );
        return { success: false, errorMessage: 'Failed to cleanup channels' };
      }

      // Start next nominee in queue if available
      await this.startNextNomineeIfReady(nominee.guildId);
      return { success: true };
    } else {
      logger.error(
        {
          nomineeId: nominee.id,
          error: result.errorMessage,
        },
        'Failed to transition nominee to PAST'
      );
      return { success: false, errorMessage: result.errorMessage };
    }
  }

  /**
   * Transitions a nominee from CLEANUP to PAST
   */
  private async transitionToPast(nominee: Nominee): Promise<void> {
    await this.performPostCleanupCleanup(nominee);
  }

  /**
   * Starts the next nominee in queue if no one else is in progress
   */
  private async startNextNomineeIfReady(guildId: string): Promise<void> {
    const hasInProgress = await NomineeStateManager.hasNomineeInProgress(
      guildId
    );

    if (!hasInProgress) {
      const nextNominee = await NomineeStateManager.getNextNomineeForDiscussion(
        guildId
      );

      if (
        nextNominee &&
        nextNominee.discussionStart &&
        nextNominee.discussionStart <= new Date()
      ) {
        await this.transitionToDiscussion(nextNominee);
      }
    }
  }

  /**
   * Recalculates schedules for all active nominees across all guilds
   */
  private async recalculateActiveSchedules(): Promise<void> {
    const guilds = this.client.guilds.cache;

    for (const [guildId] of guilds) {
      try {
        await this.recalculateGuildSchedules(guildId);
      } catch (error) {
        logger.error({ error, guildId }, 'Guild schedule recalculation failed');
      }
    }
  }

  /**
   * Recalculates schedules for active nominees in a specific guild
   */
  private async recalculateGuildSchedules(guildId: string): Promise<void> {
    const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
    const scheduleResults =
      await TimeCalculationService.recalculateAllSchedules(activeNominees);

    // Update database with new schedules
    for (const result of scheduleResults) {
      await prisma.nominee.update({
        where: { id: result.nominee.id },
        data: {
          discussionStart: result.scheduledTimes.discussionStart,
          voteStart: result.scheduledTimes.voteStart,
          cleanupStart: result.scheduledTimes.cleanupStart,
        },
      });
    }

    // Schedule results processed
  }

  /**
   * Deletes announcement messages from governance and general channels
   */
  private async deleteAnnouncementMessages(nominee: Nominee): Promise<void> {
    try {
      if (!nominee.announcementMessageIds) return;

      const governanceChannel = await ChannelFinderService.governance();
      const generalChannel = await ChannelFinderService.general();

      const messageIds = nominee.announcementMessageIds
        .split(',')
        .filter(Boolean);

      for (const messageId of messageIds) {
        try {
          // Try governance channel first
          if (governanceChannel) {
            try {
              const message = await governanceChannel.messages.fetch(messageId);
              await message.delete();
              continue;
            } catch {
              // Message not in governance channel, try general
            }
          }

          // Try general channel
          if (generalChannel) {
            try {
              const message = await generalChannel.messages.fetch(messageId);
              await message.delete();
            } catch {
              // Message not found or already deleted
            }
          }
        } catch (error) {
          logger.error(
            {
              error,
              nomineeId: nominee.id,
              messageId,
            },
            'Failed to delete announcement message'
          );
        }
      }
    } catch (error) {
      logger.error(
        {
          error,
          nomineeId: nominee.id,
          announcementMessageIds: nominee.announcementMessageIds,
        },
        'Failed to delete announcement messages'
      );
    }
  }

  /**
   * Sends cleanup instructions to mod-comms after channels are deleted
   */
  private async sendCleanupInstructions(nominee: Nominee): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const modCommsChannel = await ChannelFinderService.modComms();

      if (!modCommsChannel) return;

      // Find moderators role
      const moderatorsRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === 'moderators'
      );
      const moderatorsMention = moderatorsRole
        ? `<@&${moderatorsRole.id}>`
        : '@moderators';

      // Determine if the nominee passed or failed
      const passed = nominee.votePassed === true;

      // Only post cleanup instructions if the nominee passed
      if (passed) {
        const nominatorName = await NomineeDisplayUtils.resolveNominatorName(
          nominee
        );
        const embed = {
          title: '🔗 Cleanup and Send Invite',
          description: `Nomination channels have been deleted for **${nominee.name}**.`,
          fields: [
            {
              name: '1️⃣ Clean up remaining discussion',
              value: `Manually search for '${nominee.name}' and delete any discussion that occurred in other channels.`,
              inline: false,
            },
            {
              name: '2️⃣ Send the invite link',
              value: `Send invite link to **${nominatorName}**\n• Invite to Server → Edit invite link → Max number of uses → 1 use`,
              inline: false,
            },
            {
              name: '3️⃣ Delete this message',
              value:
                'Delete this message to indicate to other mods that the invite link was sent',
              inline: false,
            },
          ],
          color: 0xff6600,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Manual Action Required',
          },
        };

        await modCommsChannel.send({
          content: moderatorsMention,
          embeds: [embed],
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
          nomineeId: nominee.id,
        },
        'Failed to send cleanup instructions to mod-comms'
      );
    }
  }

  /**
   * Manually triggers state transition processing (useful for testing)
   */
  async triggerStateTransitions(): Promise<void> {
    await this.processStateTransitions();
  }

  /**
   * Manually triggers schedule recalculation (useful for testing)
   */
  async triggerScheduleRecalculation(): Promise<void> {
    await this.recalculateActiveSchedules();
  }
}
