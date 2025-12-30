import { describe, test, expect } from 'bun:test';
import { TimeCalculationService } from '../lib/timeCalculation.js';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

function createMockNominee(overrides: Partial<Nominee> = {}): Nominee {
  return {
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.ACTIVE,
    nominator: 'test-nominator',
    guildId: 'test-guild',
    discussionStart: null,
    voteStart: null,
    cleanupStart: null,
    createdAt: new Date(),
    discussionChannelId: null,
    voteChannelId: null,
    ...overrides
  };
}

describe('TimeCalculationService', () => {
  describe('getNextMondayAt9AM', () => {
    test('returns next Monday when called on Sunday', () => {
      // Create a Sunday date (Jan 7, 2024 was a Sunday)
      const sunday = new Date('2024-01-07T10:00:00.000Z');
      
      const nextMonday = TimeCalculationService.getNextMondayAt9AM(sunday);
      
      // Should be Monday Jan 8, 2024 at 14:00 UTC (9 AM ET)
      expect(nextMonday.getUTCDay()).toBe(1); // Monday
      expect(nextMonday.getUTCHours()).toBe(14); // 9 AM ET
      expect(nextMonday.getUTCMinutes()).toBe(0);
    });

    test('returns next Monday when called on Tuesday', () => {
      // Create a Tuesday date (Jan 9, 2024 was a Tuesday)
      const tuesday = new Date('2024-01-09T10:00:00.000Z');
      
      const nextMonday = TimeCalculationService.getNextMondayAt9AM(tuesday);
      
      // Should be Monday Jan 15, 2024
      expect(nextMonday.getUTCDay()).toBe(1); // Monday
      expect(nextMonday.getUTCDate()).toBe(15);
    });

    test('returns same Monday if called on Monday before 9 AM ET', () => {
      // Create a Monday date before 9 AM ET (Jan 8, 2024 at 13:00 UTC = 8 AM ET)
      const mondayEarly = new Date('2024-01-08T13:00:00.000Z');
      
      const nextMonday = TimeCalculationService.getNextMondayAt9AM(mondayEarly);
      
      // Should be the same Monday at 9 AM ET
      expect(nextMonday.getUTCDay()).toBe(1);
      expect(nextMonday.getUTCDate()).toBe(8);
      expect(nextMonday.getUTCHours()).toBe(14); // 9 AM ET
    });

    test('returns next Monday if called on Monday after 9 AM ET', () => {
      // Create a Monday date after 9 AM ET (Jan 8, 2024 at 15:00 UTC = 10 AM ET)
      const mondayLate = new Date('2024-01-08T15:00:00.000Z');
      
      const nextMonday = TimeCalculationService.getNextMondayAt9AM(mondayLate);
      
      // Should be next Monday (Jan 15, 2024)
      expect(nextMonday.getUTCDay()).toBe(1);
      expect(nextMonday.getUTCDate()).toBe(15);
    });
  });

  describe('calculateDiscussionStart', () => {
    test('first in queue gets next Monday', () => {
      const discussionStart = TimeCalculationService.calculateDiscussionStart(1);
      
      expect(discussionStart.getUTCDay()).toBe(1); // Monday
      expect(discussionStart.getUTCHours()).toBe(14); // 9 AM ET
    });

    test('second in queue gets following Monday', () => {
      const firstStart = TimeCalculationService.calculateDiscussionStart(1);
      const secondStart = TimeCalculationService.calculateDiscussionStart(2);
      
      const daysDifference = (secondStart.getTime() - firstStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDifference).toBe(7); // One week later
    });

    test('third in queue gets two weeks later', () => {
      const firstStart = TimeCalculationService.calculateDiscussionStart(1);
      const thirdStart = TimeCalculationService.calculateDiscussionStart(3);
      
      const daysDifference = (thirdStart.getTime() - firstStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDifference).toBe(14); // Two weeks later
    });
  });

  describe('calculateScheduledTimes', () => {
    test('calculates all three phases correctly', () => {
      const times = TimeCalculationService.calculateScheduledTimes(1);
      
      expect(times.discussionStart.getUTCDay()).toBe(1); // Monday
      
      // Vote should start 48 hours after discussion
      const hoursDiff = (times.voteStart.getTime() - times.discussionStart.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBe(48);
      
      // Cleanup should start 120 hours (5 days) after vote
      const voteHoursDiff = (times.cleanupStart.getTime() - times.voteStart.getTime()) / (1000 * 60 * 60);
      expect(voteHoursDiff).toBe(120);
    });

    test('maintains consistent scheduling across queue positions', () => {
      const firstTimes = TimeCalculationService.calculateScheduledTimes(1);
      const secondTimes = TimeCalculationService.calculateScheduledTimes(2);
      
      // Both should have same phase durations
      const firstDuration = firstTimes.voteStart.getTime() - firstTimes.discussionStart.getTime();
      const secondDuration = secondTimes.voteStart.getTime() - secondTimes.discussionStart.getTime();
      
      expect(firstDuration).toBe(secondDuration);
    });
  });

  describe('recalculateAllSchedules', () => {
    test('assigns schedules based on creation order', async () => {
      const nominees = [
        createMockNominee({ 
          id: 'first', 
          name: 'First Nominee',
          createdAt: new Date('2024-01-01'),
          state: NomineeState.ACTIVE 
        }),
        createMockNominee({ 
          id: 'second', 
          name: 'Second Nominee',
          createdAt: new Date('2024-01-02'),
          state: NomineeState.ACTIVE 
        }),
        createMockNominee({ 
          id: 'third', 
          name: 'Third Nominee',
          createdAt: new Date('2024-01-03'),
          state: NomineeState.DISCUSSION // Should be excluded from ACTIVE scheduling
        })
      ];
      
      const results = await TimeCalculationService.recalculateAllSchedules(nominees);
      
      expect(results).toHaveLength(2); // Only ACTIVE nominees
      
      const firstResult = results.find(r => r.nominee.id === 'first');
      const secondResult = results.find(r => r.nominee.id === 'second');
      
      expect(firstResult).toBeTruthy();
      expect(secondResult).toBeTruthy();
      
      // Second should start one week after first
      if (firstResult && secondResult) {
        const daysDiff = (secondResult.scheduledTimes.discussionStart.getTime() - 
                         firstResult.scheduledTimes.discussionStart.getTime()) / (1000 * 60 * 60 * 24);
        expect(daysDiff).toBe(7);
      }
    });

    test('handles empty list', async () => {
      const results = await TimeCalculationService.recalculateAllSchedules([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('getNomineeForStateAtTime', () => {
    test('identifies nominee ready for discussion', () => {
      const pastTime = new Date('2024-01-01T14:00:00.000Z');
      const nominees = [
        createMockNominee({
          state: NomineeState.ACTIVE,
          discussionStart: pastTime
        })
      ];
      
      const currentTime = new Date('2024-01-01T15:00:00.000Z');
      const readyNominee = TimeCalculationService.getNomineeForStateAtTime(
        nominees, 
        NomineeState.DISCUSSION, 
        currentTime
      );
      
      expect(readyNominee).toBeTruthy();
      expect(readyNominee?.state).toBe(NomineeState.ACTIVE);
    });

    test('returns null when no nominee is ready', () => {
      const futureTime = new Date('2024-01-02T14:00:00.000Z');
      const nominees = [
        createMockNominee({
          state: NomineeState.ACTIVE,
          discussionStart: futureTime
        })
      ];
      
      const currentTime = new Date('2024-01-01T15:00:00.000Z');
      const readyNominee = TimeCalculationService.getNomineeForStateAtTime(
        nominees,
        NomineeState.DISCUSSION,
        currentTime
      );
      
      expect(readyNominee).toBeNull();
    });

    test('identifies nominee ready for vote', () => {
      const pastTime = new Date('2024-01-01T14:00:00.000Z');
      const nominees = [
        createMockNominee({
          state: NomineeState.DISCUSSION,
          voteStart: pastTime
        })
      ];
      
      const currentTime = new Date('2024-01-01T15:00:00.000Z');
      const readyNominee = TimeCalculationService.getNomineeForStateAtTime(
        nominees,
        NomineeState.VOTE,
        currentTime
      );
      
      expect(readyNominee).toBeTruthy();
      expect(readyNominee?.state).toBe(NomineeState.DISCUSSION);
    });
  });

  describe('shouldTransitionToPast', () => {
    test('returns true when cleanup period has ended', () => {
      const pastCleanupStart = new Date('2024-01-01T14:00:00.000Z');
      const nominee = createMockNominee({
        state: NomineeState.CLEANUP,
        cleanupStart: pastCleanupStart
      });
      
      // 25 hours later (cleanup period is 24 hours)
      const currentTime = new Date('2024-01-02T15:00:00.000Z');
      
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(nominee, currentTime);
      expect(shouldTransition).toBe(true);
    });

    test('returns false when cleanup period is still active', () => {
      const recentCleanupStart = new Date('2024-01-01T14:00:00.000Z');
      const nominee = createMockNominee({
        state: NomineeState.CLEANUP,
        cleanupStart: recentCleanupStart
      });
      
      // 12 hours later (cleanup period is 24 hours)
      const currentTime = new Date('2024-01-02T02:00:00.000Z');
      
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(nominee, currentTime);
      expect(shouldTransition).toBe(false);
    });

    test('returns false for non-cleanup states', () => {
      const nominee = createMockNominee({ state: NomineeState.VOTE });
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(nominee);
      expect(shouldTransition).toBe(false);
    });
  });

  describe('utility methods', () => {
    test('formatForDiscord creates proper timestamp', () => {
      const date = new Date('2024-01-01T14:00:00.000Z');
      const formatted = TimeCalculationService.formatForDiscord(date, 'f');
      
      const expectedTimestamp = Math.floor(date.getTime() / 1000);
      expect(formatted).toBe(`<t:${expectedTimestamp}:f>`);
    });
  });
});