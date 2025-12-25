import { NOMINATION_CONFIG } from './constants.js';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';
import pino from 'pino';

const logger = pino();

export interface ScheduledTimes {
  discussionStart: Date;
  voteStart: Date;
  certifyStart: Date;
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
    
    const certifyStart = new Date(voteStart);
    certifyStart.setUTCMinutes(
      certifyStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES
    );
    
    return {
      discussionStart,
      voteStart,
      certifyStart
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
      
      logger.info({
        nomineeId: nominee.id,
        name: nominee.name,
        queuePosition,
        discussionStart: scheduledTimes.discussionStart,
        voteStart: scheduledTimes.voteStart,
        certifyStart: scheduledTimes.certifyStart
      }, 'Calculated schedule for nominee');
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
      switch (targetState) {
        case NomineeState.DISCUSSION:
          if (nominee.discussionStart && nominee.discussionStart <= currentTime && 
              nominee.state === NomineeState.ACTIVE) {
            return nominee;
          }
          break;
          
        case NomineeState.VOTE:
          if (nominee.voteStart && nominee.voteStart <= currentTime && 
              nominee.state === NomineeState.DISCUSSION) {
            return nominee;
          }
          break;
          
        case NomineeState.CERTIFY:
          if (nominee.certifyStart && nominee.certifyStart <= currentTime && 
              nominee.state === NomineeState.VOTE) {
            return nominee;
          }
          break;
      }
    }
    
    return null;
  }

  /**
   * Checks if a nominee should transition to PAST state (failed vote or completed process)
   */
  static shouldTransitionToPast(nominee: Nominee, currentTime: Date = new Date()): boolean {
    if (nominee.state === NomineeState.CERTIFY && nominee.certifyStart) {
      const certifyEndTime = new Date(nominee.certifyStart);
      certifyEndTime.setUTCMinutes(
        certifyEndTime.getUTCMinutes() + NOMINATION_CONFIG.CERTIFY_DURATION_MINUTES
      );
      
      return currentTime >= certifyEndTime;
    }
    
    return false;
  }

  /**
   * Calculates how many nominees can be processed in parallel
   * (Always 1 based on the requirement that only one nominee can be in progress)
   */
  static getMaxConcurrentNominees(): number {
    return 1;
  }

  /**
   * Formats a date for Discord timestamp display
   */
  static formatForDiscord(date: Date, format: 'f' | 'F' | 'R' | 't' | 'T' | 'd' | 'D' = 'f'): string {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${format}>`;
  }

  /**
   * Gets time remaining until a specific date
   */
  static getTimeRemaining(targetDate: Date, fromDate: Date = new Date()): {
    days: number;
    hours: number;
    minutes: number;
    totalHours: number;
  } {
    const diffMs = targetDate.getTime() - fromDate.getTime();
    
    if (diffMs <= 0) {
      return { days: 0, hours: 0, minutes: 0, totalHours: 0 };
    }
    
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, totalHours };
  }
}