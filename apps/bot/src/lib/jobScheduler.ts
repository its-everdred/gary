import cron from 'node-cron';
import type { Client } from 'discord.js';
import pino from 'pino';
import { NomineeStateManager } from './nomineeService.js';
import { TimeCalculationService } from './timeCalculation.js';
import { NomineeState } from '@prisma/client';
import { prisma } from './db.js';

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
  private _isRunning = false;

  private constructor(client: Client) {
    this.client = client;
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
        logger.error({ error }, 'State transition job failed');
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
        logger.error({ error, guildId }, 'Guild state transition processing failed');
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

    // Check for nominees ready for certification
    const readyForCertify = TimeCalculationService.getNomineeForStateAtTime(
      activeNominees,
      NomineeState.CERTIFY,
      currentTime
    );

    if (readyForCertify) {
      await this.transitionToCertify(readyForCertify);
    }

    // Check for nominees that should transition to PAST
    const certifyNominees = activeNominees.filter(n => n.state === NomineeState.CERTIFY);
    for (const nominee of certifyNominees) {
      if (TimeCalculationService.shouldTransitionToPast(nominee, currentTime)) {
        await this.transitionToPast(nominee);
      }
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
      
      // TODO: Create discussion channel (Task 12)
      // TODO: Send announcement to GA governance channel
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
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.VOTE,
      {
        voteStart: new Date()
      }
    );

    if (result.success) {
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        guildId: nominee.guildId
      }, 'Nominee transitioned to VOTE state');
      
      // TODO: Create vote channel (Task 14)
      // TODO: Create vote poll (Task 16)
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
  private async transitionToCertify(nominee: any): Promise<void> {
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
        guildId: nominee.guildId
      }, 'Nominee transitioned to CERTIFY state');
      
      // TODO: Calculate vote results (Task 17)
      // TODO: Post results to #general (Task 18)
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