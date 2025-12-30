import { NOMINATION_CONFIG } from './constants.js';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';
import { prisma } from './db.js';
import pino from 'pino';

const logger = pino();

export interface ScheduledTimes {
  discussionStart: Date;
  voteStart: Date;
  cleanupStart: Date;
}

export class TimeCalculationService {
  /**
   * Calculates the next Monday at 9 AM ET from a given date
   */
  static getNextMondayAt9AM(fromDate: Date = new Date()): Date {
    const targetTime = new Date(fromDate);
    
    // Set to 9 AM ET (14:00 UTC during standard time, 13:00 UTC during daylight time)
    // For simplicity, we'll use a fixed UTC offset. In production, consider using a proper timezone library
    targetTime.setUTCHours(14, 0, 0, 0); // 9 AM ET in UTC (standard time)
    
    // Get current day of week (0 = Sunday, 1 = Monday, etc.)
    const currentDay = targetTime.getUTCDay();
    
    if (currentDay === 1 && targetTime > fromDate) {
      // If it's Monday and we haven't passed 9 AM ET yet, use today
      return targetTime;
    }
    
    // Calculate days until next Monday
    const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
    targetTime.setUTCDate(targetTime.getUTCDate() + daysUntilMonday);
    
    return targetTime;
  }

  /**
   * Calculates discussion start time based on queue position
   */
  static calculateDiscussionStart(queuePosition: number): Date {
    const baseDate = new Date();
    const weeksToAdd = Math.max(0, queuePosition - 1);
    
    const startDate = this.getNextMondayAt9AM(baseDate);
    
    // Add weeks for queue position (each nominee gets ~1 week)
    startDate.setUTCDate(startDate.getUTCDate() + (weeksToAdd * 7));
    
    return startDate;
  }

  /**
   * Calculates all scheduled times for a nominee
   */
  static calculateScheduledTimes(queuePosition: number): ScheduledTimes {
    const discussionStart = this.calculateDiscussionStart(queuePosition);
    
    const voteStart = new Date(discussionStart);
    voteStart.setUTCMinutes(
      voteStart.getUTCMinutes() + NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES
    );
    
    const cleanupStart = new Date(voteStart);
    cleanupStart.setUTCMinutes(
      cleanupStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES
    );
    
    return {
      discussionStart,
      voteStart,
      cleanupStart
    };
  }

  /**
   * Recalculates schedules for all active nominees in a guild
   */
  static async recalculateAllSchedules(
    activeNominees: Nominee[]
  ): Promise<Array<{nominee: Nominee, scheduledTimes: ScheduledTimes}>> {
    const results: Array<{nominee: Nominee, scheduledTimes: ScheduledTimes}> = [];
    
    // Filter to only ACTIVE nominees for scheduling
    const activeOnlyNominees = activeNominees.filter(n => n.state === NomineeState.ACTIVE);
    
    activeOnlyNominees.forEach((nominee, index) => {
      const queuePosition = index + 1;
      const scheduledTimes = this.calculateScheduledTimes(queuePosition);
      
      results.push({
        nominee,
        scheduledTimes
      });
    });
    
    return results;
  }

  /**
   * Gets the current nominee that should be in a specific state based on time
   */
  static getNomineeForStateAtTime(
    nominees: Nominee[],
    targetState: NomineeState,
    currentTime: Date = new Date()
  ): Nominee | null {
    for (const nominee of nominees) {
      let shouldTransition = false;

      switch (targetState) {
        case NomineeState.DISCUSSION:
          shouldTransition = nominee.discussionStart && nominee.discussionStart <= currentTime && 
              nominee.state === NomineeState.ACTIVE;
          break;
          
        case NomineeState.VOTE:
          shouldTransition = nominee.voteStart && nominee.voteStart <= currentTime && 
              nominee.state === NomineeState.DISCUSSION;
          break;
          
        case NomineeState.CLEANUP:
          shouldTransition = nominee.cleanupStart && nominee.cleanupStart <= currentTime && 
              nominee.state === NomineeState.VOTE;
          break;
      }

      if (shouldTransition) {
        return nominee;
      }
    }
    
    return null;
  }

  /**
   * Checks if a nominee should transition to PAST state (failed vote or completed process)
   */
  static shouldTransitionToPast(nominee: Nominee, currentTime: Date = new Date()): boolean {
    if (nominee.state === NomineeState.CLEANUP && nominee.cleanupStart) {
      const cleanupEndTime = new Date(nominee.cleanupStart);
      cleanupEndTime.setUTCMinutes(
        cleanupEndTime.getUTCMinutes() + NOMINATION_CONFIG.CLEANUP_DURATION_MINUTES
      );
      
      return currentTime >= cleanupEndTime;
    }
    
    return false;
  }

  /**
   * Recalculates and updates schedules for remaining active nominees in database
   */
  static async recalculateAndUpdateQueueSchedules(guildId: string, excludeNomineeId?: number): Promise<void> {
    try {
      // Get all active nominees (not in PAST state) ordered by creation time
      const whereClause: any = {
        guildId,
        state: NomineeState.ACTIVE
      };
      
      if (excludeNomineeId) {
        whereClause.id = { not: excludeNomineeId };
      }

      const activeNominees = await prisma.nominee.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' }
      });

      if (activeNominees.length === 0) {
        return;
      }

      // Recalculate times for all nominees based on their new queue positions
      const recalculations = await this.recalculateAllSchedules(activeNominees);
      
      // Update database with new schedules
      for (const result of recalculations) {
        await prisma.nominee.update({
          where: { id: result.nominee.id },
          data: {
            discussionStart: result.scheduledTimes.discussionStart,
            voteStart: result.scheduledTimes.voteStart,
            cleanupStart: result.scheduledTimes.cleanupStart
          }
        });
      }

    } catch (error) {
      logger.error({ 
        error, 
        guildId, 
        excludeNomineeId
      }, 'Failed to recalculate and update queue schedules');
      throw error;
    }
  }

  /**
   * Formats a date for Discord timestamp display
   */
  static formatForDiscord(date: Date, format: 'f' | 'F' | 'R' | 't' | 'T' | 'd' | 'D' = 'f'): string {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${format}>`;
  }
}