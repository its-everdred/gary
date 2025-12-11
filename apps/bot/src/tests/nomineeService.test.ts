import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

const mockPrisma = {
  nominee: {
    findUnique: mock(),
    findFirst: mock(),
    findMany: mock(),
    count: mock(),
    update: mock()
  }
};

mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { NomineeStateManager } = await import('../lib/nomineeService.js');

function createMockNominee(overrides: Partial<Nominee> = {}): Nominee {
  return {
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.ACTIVE,
    nominator: 'test-nominator',
    guildId: 'test-guild',
    discussionStart: null,
    voteStart: null,
    certifyStart: null,
    createdAt: new Date(),
    discussionChannelId: null,
    voteChannelId: null,
    ...overrides
  };
}

describe('NomineeStateManager', () => {
  beforeEach(() => {
    mockPrisma.nominee.findUnique.mockReset();
    mockPrisma.nominee.findFirst.mockReset();
    mockPrisma.nominee.findMany.mockReset();
    mockPrisma.nominee.count.mockReset();
    mockPrisma.nominee.update.mockReset();
  });

  describe('validateStateTransition', () => {
    test('allows valid ACTIVE to DISCUSSION transition', async () => {
      const nominee = createMockNominee({ state: NomineeState.ACTIVE });
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(null));

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.DISCUSSION);

      expect(result.isValid).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    test('allows valid DISCUSSION to VOTE transition', async () => {
      const nominee = createMockNominee({ 
        state: NomineeState.DISCUSSION,
        discussionStart: new Date()
      });

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.VOTE);

      expect(result.isValid).toBe(true);
    });

    test('allows valid VOTE to CERTIFY transition', async () => {
      const nominee = createMockNominee({ 
        state: NomineeState.VOTE,
        voteStart: new Date()
      });

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.CERTIFY);

      expect(result.isValid).toBe(true);
    });

    test('allows any state to PAST transition', async () => {
      const states = [NomineeState.ACTIVE, NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY];

      for (const state of states) {
        const nominee = createMockNominee({ state });
        const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.PAST);
        expect(result.isValid).toBe(true);
      }
    });

    test('rejects invalid transitions', async () => {
      const nominee = createMockNominee({ state: NomineeState.ACTIVE });
      
      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.VOTE);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Invalid state transition from ACTIVE to VOTE');
    });

    test('rejects transitions from PAST state', async () => {
      const nominee = createMockNominee({ state: NomineeState.PAST });
      
      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.ACTIVE);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Invalid state transition from PAST to ACTIVE');
    });

    test('rejects DISCUSSION start when another nominee is in progress', async () => {
      const nominee = createMockNominee({ state: NomineeState.ACTIVE });
      const existingNominee = createMockNominee({ 
        id: 'other-nominee',
        name: 'Other Nominee',
        state: NomineeState.VOTE 
      });
      
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(existingNominee));

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.DISCUSSION);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Cannot start discussion: Other Nominee is already in vote state');
    });

    test('rejects VOTE start without discussion start time', async () => {
      const nominee = createMockNominee({ 
        state: NomineeState.DISCUSSION,
        discussionStart: null
      });

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.VOTE);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Discussion start time must be set before starting vote');
    });

    test('rejects CERTIFY start without vote start time', async () => {
      const nominee = createMockNominee({ 
        state: NomineeState.VOTE,
        voteStart: null
      });

      const result = await NomineeStateManager.validateStateTransition(nominee, NomineeState.CERTIFY);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Vote start time must be set before starting certification');
    });
  });

  describe('transitionNominee', () => {
    test('successfully transitions nominee with valid state change', async () => {
      const nominee = createMockNominee({ state: NomineeState.ACTIVE });
      const updatedNominee = createMockNominee({ state: NomineeState.DISCUSSION });
      
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(nominee));
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(null));
      mockPrisma.nominee.update.mockReturnValue(Promise.resolve(updatedNominee));

      const result = await NomineeStateManager.transitionNominee(
        'test-nominee-id', 
        NomineeState.DISCUSSION,
        { discussionStart: new Date() }
      );

      expect(result.success).toBe(true);
      expect(result.nominee?.state).toBe(NomineeState.DISCUSSION);
      expect(mockPrisma.nominee.update).toHaveBeenCalled();
    });

    test('fails transition for non-existent nominee', async () => {
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(null));

      const result = await NomineeStateManager.transitionNominee(
        'non-existent-id',
        NomineeState.DISCUSSION
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Nominee not found');
    });

    test('fails transition for invalid state change', async () => {
      const nominee = createMockNominee({ state: NomineeState.ACTIVE });
      
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(nominee));

      const result = await NomineeStateManager.transitionNominee(
        'test-nominee-id',
        NomineeState.VOTE // Invalid: ACTIVE -> VOTE
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid state transition');
    });
  });

  describe('utility methods', () => {
    test('getNextNomineeForDiscussion returns oldest active nominee', async () => {
      const nominee = createMockNominee();
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(nominee));

      const result = await NomineeStateManager.getNextNomineeForDiscussion('test-guild');

      expect(result).toBe(nominee);
      expect(mockPrisma.nominee.findFirst).toHaveBeenCalledWith({
        where: {
          guildId: 'test-guild',
          state: NomineeState.ACTIVE
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
    });

    test('getCurrentNomineeInState finds nominee in specific state', async () => {
      const nominee = createMockNominee({ state: NomineeState.VOTE });
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(nominee));

      const result = await NomineeStateManager.getCurrentNomineeInState('test-guild', NomineeState.VOTE);

      expect(result).toBe(nominee);
    });

    test('hasNomineeInProgress returns true when nominee exists in progress states', async () => {
      mockPrisma.nominee.count.mockReturnValue(Promise.resolve(1));

      const result = await NomineeStateManager.hasNomineeInProgress('test-guild');

      expect(result).toBe(true);
      expect(mockPrisma.nominee.count).toHaveBeenCalledWith({
        where: {
          guildId: 'test-guild',
          state: {
            in: [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY]
          }
        }
      });
    });

    test('hasNomineeInProgress returns false when no nominees in progress', async () => {
      mockPrisma.nominee.count.mockReturnValue(Promise.resolve(0));

      const result = await NomineeStateManager.hasNomineeInProgress('test-guild');

      expect(result).toBe(false);
    });

    test('getActiveNominees returns all non-past nominees', async () => {
      const nominees = [
        createMockNominee({ state: NomineeState.ACTIVE }),
        createMockNominee({ state: NomineeState.DISCUSSION })
      ];
      mockPrisma.nominee.findMany.mockReturnValue(Promise.resolve(nominees));

      const result = await NomineeStateManager.getActiveNominees('test-guild');

      expect(result).toBe(nominees);
      expect(mockPrisma.nominee.findMany).toHaveBeenCalledWith({
        where: {
          guildId: 'test-guild',
          state: {
            not: NomineeState.PAST
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
    });

    test('findNomineeByName returns nominee when found', async () => {
      const nominee = createMockNominee({ name: 'John Doe' });
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(nominee));

      const result = await NomineeStateManager.findNomineeByName('test-guild', 'John Doe');

      expect(result).toBe(nominee);
      expect(mockPrisma.nominee.findUnique).toHaveBeenCalledWith({
        where: {
          guildId_name: {
            guildId: 'test-guild',
            name: 'John Doe'
          }
        }
      });
    });

    test('findNomineeByName returns null when not found', async () => {
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(null));

      const result = await NomineeStateManager.findNomineeByName('test-guild', 'Nonexistent');

      expect(result).toBeNull();
    });

    test('getCurrentNomineeInProgress returns nominee in progress state', async () => {
      const nominee = createMockNominee({ state: NomineeState.VOTE });
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(nominee));

      const result = await NomineeStateManager.getCurrentNomineeInProgress('test-guild');

      expect(result).toBe(nominee);
      expect(mockPrisma.nominee.findFirst).toHaveBeenCalledWith({
        where: {
          guildId: 'test-guild',
          state: {
            in: [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY]
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
    });

    test('getCurrentNomineeInProgress returns null when no nominee in progress', async () => {
      mockPrisma.nominee.findFirst.mockReturnValue(Promise.resolve(null));

      const result = await NomineeStateManager.getCurrentNomineeInProgress('test-guild');

      expect(result).toBeNull();
    });
  });
});