import cron from 'node-cron';
import type { Client } from 'discord.js';
import pino from 'pino';
import { NomineeStateManager } from './nomineeService.js';
import { TimeCalculationService } from './timeCalculation.js';
import { ChannelManagementService } from './channelService.js';
import { AnnouncementService } from './announcementService.js';
import { VoteResultService } from './voteResultService.js';
import { NomineeState } from '@prisma/client';
import { prisma } from './db.js';
import { NOMINATION_CONFIG } from './constants.js';

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
      logger.warn('Job scheduler is already running');
      return;
    }

    this.scheduleStateTransitionJob();
    this.scheduleScheduleRecalculationJob();
    this._isRunning = true;
    
    logger.info('Nomination job scheduler started');
  }

  stop(): void {
    this.jobs.forEach((job, name) => {
      job.destroy();
      logger.info({ jobName: name }, 'Job stopped');
    });
    
    this.jobs.clear();
    this._isRunning = false;
    
    logger.info('Nomination job scheduler stopped');
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Schedules the main state transition job that runs every minute
   * to check for nominees ready for state changes
   */
  private scheduleStateTransitionJob(): void {
    const job = cron.schedule('* * * * *', async () => {
      try {
        await this.processStateTransitions();
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack
          } : error
        }, 'State transition job failed');
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    job.start();
    this.jobs.set('state-transitions', job);
    
    logger.info('State transition job scheduled (every minute)');
  }

  /**
   * Schedules a job to recalculate schedules for active nominees
   * Runs every hour to ensure schedules stay accurate
   */
  private scheduleScheduleRecalculationJob(): void {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        await this.recalculateActiveSchedules();
      } catch (error) {
        logger.error({ error }, 'Schedule recalculation job failed');
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    job.start();
    this.jobs.set('schedule-recalculation', job);
    
    logger.info('Schedule recalculation job scheduled (every hour)');
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
        logger.error({ 
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          guildId 
        }, 'Guild state transition processing failed');
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
    const voteNominees = activeNominees.filter(n => n.state === NomineeState.VOTE);

    for (const nominee of voteNominees) {
      // Check if governance announcement needs to be sent (poll posted but not announced yet)
      if (!nominee.voteGovernanceAnnounced && nominee.voteChannelId) {
        await this.checkAndAnnounceVoteToGovernance(nominee);
      }
      
      // Check if vote has completed (either by time or poll closure)
      const voteResults = await this.voteResultService.checkVoteCompletion(nominee);
      
      // Add 1-minute buffer after vote expiration to allow EasyPoll to finalize results
      const bufferTime = new Date(currentTime);
      bufferTime.setMinutes(bufferTime.getMinutes() - 1);
      const readyWithBuffer = nominee.certifyStart && nominee.certifyStart <= bufferTime;
      
      // Checking vote completion for nominee

      if (voteResults || readyWithBuffer) {
        await this.transitionToCertify(nominee, voteResults);
      }
    }

    // Check for nominees that should transition to PAST
    const certifyNominees = activeNominees.filter(n => n.state === NomineeState.CERTIFY);

    for (const nominee of certifyNominees) {
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(nominee, currentTime);

      if (shouldTransition) {
        await this.transitionToPast(nominee);
      }
    }
  }

  /**
   * Checks if EasyPoll has been posted in vote channel and announces to governance if so
   */
  private async checkAndAnnounceVoteToGovernance(nominee: any): Promise<void> {
    try {
      if (!nominee.voteChannelId) {
        return;
      }

      const guild = await this.client.guilds.fetch(nominee.guildId);
      const voteChannel = guild.channels.cache.get(nominee.voteChannelId) as TextChannel;
      
      if (!voteChannel) {
        logger.warn({
          nomineeId: nominee.id,
          voteChannelId: nominee.voteChannelId
        }, 'Vote channel not found for governance announcement check');
        return;
      }

      // Check for EasyPoll messages in the channel
      const messages = await voteChannel.messages.fetch({ limit: 10, force: true });
      const easyPollMessage = messages.find(msg => 
        msg.author.id === '437618149505105920' && // EasyPoll bot ID
        msg.embeds.length > 0
      );

      if (easyPollMessage) {
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
            data: { voteGovernanceAnnounced: true }
          });

          logger.info({
            nomineeId: nominee.id,
            nomineeName: nominee.name,
            voteChannelId: nominee.voteChannelId,
            pollMessageId: easyPollMessage.id
          }, 'Governance announcement sent after EasyPoll detection');
        }
      }
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to check for EasyPoll and announce to governance');
    }
  }

  /**
   * Transitions a nominee from ACTIVE to DISCUSSION
   */
  private async transitionToDiscussion(nominee: any): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.DISCUSSION,
      {
        discussionStart: new Date()
      }
    );

    if (result.success) {
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        guildId: nominee.guildId
      }, 'Nominee transitioned to DISCUSSION state');
      
      // Create discussion channel
      const channelResult = await this.channelService.createDiscussionChannel(result.nominee);
      if (!channelResult.success) {
        logger.error({
          nomineeId: nominee.id,
          error: channelResult.errorMessage
        }, 'Failed to create discussion channel');
      } else {
        // Send announcement to governance channel
        await this.announcementService.announceDiscussionStart(
          result.nominee, 
          channelResult.channel!.id
        );
      }
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: result.errorMessage
      }, 'Failed to transition nominee to DISCUSSION');
    }
  }

  /**
   * Transitions a nominee from DISCUSSION to VOTE
   */
  private async transitionToVote(nominee: any): Promise<void> {
    // Calculate new certify time based on current time
    const now = new Date();
    const certifyStart = new Date(now);
    certifyStart.setUTCMinutes(certifyStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES);
    
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.VOTE,
      {
        voteStart: now,
        certifyStart: certifyStart
      }
    );

    if (result.success) {
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        guildId: nominee.guildId
      }, 'Nominee transitioned to VOTE state');
      
      // Create vote channel
      const channelResult = await this.channelService.createVoteChannel(result.nominee);
      if (!channelResult.success) {
        logger.error({
          nomineeId: nominee.id,
          error: channelResult.errorMessage
        }, 'Failed to create vote channel');
      } else {
        // Note: Governance announcement will be sent automatically 
        // once the moderator posts the EasyPoll in the vote channel
        logger.info({
          nomineeId: nominee.id,
          name: nominee.name,
          voteChannelId: channelResult.channel!.id
        }, 'Vote channel created, waiting for moderator to post EasyPoll before governance announcement');
      }
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: result.errorMessage
      }, 'Failed to transition nominee to VOTE');
    }
  }

  /**
   * Transitions a nominee from VOTE to CERTIFY
   */
  private async transitionToCertify(nominee: any, voteResults?: any): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.CERTIFY,
      {
        certifyStart: new Date()
      }
    );

    if (result.success) {
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        guildId: nominee.guildId,
        voteResults: voteResults ? {
          passed: voteResults.passed,
          yesVotes: voteResults.yesVotes,
          noVotes: voteResults.noVotes
        } : undefined
      }, 'Nominee transitioned to CERTIFY state');
      
      // Post detailed results to both vote and governance channels if we have vote results
      if (voteResults) {
        // Post to vote channel
        this.voteResultService.postDetailedVoteResults(nominee, voteResults).catch(error => {
          logger.error({ error, nomineeId: nominee.id }, 'Failed to post detailed vote results to vote channel');
        });

        // Post same results to governance channel
        this.voteResultService.postVoteResultsToGovernance(nominee, voteResults).catch(error => {
          logger.error({ error, nomineeId: nominee.id }, 'Failed to post vote results to governance channel');
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
          requiredPassVotes: 0
        };
        
        // Post to both channels
        this.voteResultService.postDetailedVoteResults(nominee, expiredResults).catch(error => {
          logger.error({ error, nomineeId: nominee.id }, 'Failed to post expired vote results to vote channel');
        });
        
        this.voteResultService.postVoteResultsToGovernance(nominee, expiredResults).catch(error => {
          logger.error({ error, nomineeId: nominee.id }, 'Failed to post expired vote results to governance channel');
        });
      }
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: result.errorMessage
      }, 'Failed to transition nominee to CERTIFY');
    }
  }

  /**
   * Transitions a nominee from CERTIFY to PAST
   */
  private async transitionToPast(nominee: any): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.PAST
    );

    if (result.success) {
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        guildId: nominee.guildId
      }, 'Nominee transitioned to PAST state');
      
      // Start next nominee in queue if available
      await this.startNextNomineeIfReady(nominee.guildId);
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: result.errorMessage
      }, 'Failed to transition nominee to PAST');
    }
  }

  /**
   * Starts the next nominee in queue if no one else is in progress
   */
  private async startNextNomineeIfReady(guildId: string): Promise<void> {
    const hasInProgress = await NomineeStateManager.hasNomineeInProgress(guildId);
    
    if (!hasInProgress) {
      const nextNominee = await NomineeStateManager.getNextNomineeForDiscussion(guildId);
      
      if (nextNominee && nextNominee.discussionStart && nextNominee.discussionStart <= new Date()) {
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
    const scheduleResults = await TimeCalculationService.recalculateAllSchedules(activeNominees);
    
    // Update database with new schedules
    for (const result of scheduleResults) {
      await prisma.nominee.update({
        where: { id: result.nominee.id },
        data: {
          discussionStart: result.scheduledTimes.discussionStart,
          voteStart: result.scheduledTimes.voteStart,
          certifyStart: result.scheduledTimes.certifyStart
        }
      });
    }
    
    if (scheduleResults.length > 0) {
      logger.info({
        guildId,
        updatedCount: scheduleResults.length
      }, 'Guild schedules recalculated');
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