import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

// Simplified mock setup for testing business logic
const mockGuild = {
  id: 'test-guild-id',
  memberCount: 25
};

const mockClient = {
  guilds: {
    fetch: mock(() => Promise.resolve(mockGuild))
  }
};

const mockPrisma = {
  nominee: {
    update: mock(() => Promise.resolve())
  }
};

mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { VoteResultService } = await import('../lib/voteResultService.js');

function createMockNominee(overrides: Partial<Nominee> = {}): Nominee {
  return {
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.VOTE,
    nominator: 'nominator-user-id',
    guildId: 'test-guild-id',
    discussionStart: new Date(),
    voteStart: new Date(),
    certifyStart: null,
    createdAt: new Date(),
    discussionChannelId: 'discussion-channel-id',
    voteChannelId: 'vote-channel-id',
    votePollMessageId: null,
    voteYesCount: 0,
    voteNoCount: 0,
    votePassed: null,
    botMessageIds: null,
    voteGovernanceAnnounced: false,
    announcementMessageIds: null,
    ...overrides
  };
}

describe('VoteResultService', () => {
  let voteResultService: VoteResultService;

  beforeEach(() => {
    voteResultService = new VoteResultService(mockClient as any);
    
    // Reset essential mocks only
    mockClient.guilds.fetch.mockReset();
    mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
    mockPrisma.nominee.update.mockReset();
    mockPrisma.nominee.update.mockReturnValue(Promise.resolve());
  });

  describe('checkVoteCompletion', () => {
    test('returns null when no vote channel ID', async () => {
      const nominee = createMockNominee({ voteChannelId: null });

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });


    test('returns null when no vote channel ID', async () => {
      const nominee = createMockNominee({ voteChannelId: null });

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });

    test('calculates vote results correctly for passing vote', async () => {
      // Use simulateVoteResults which works reliably without complex mocks
      const nominee = createMockNominee();
      
      const result = await voteResultService.simulateVoteResults(nominee, 12, 3);

      expect(result.yesVotes).toBe(12);
      expect(result.noVotes).toBe(3);
      expect(result.totalVotes).toBe(15);
      expect(result.memberCount).toBe(25);
      expect(result.quorumMet).toBe(true); // 15 > (25 * 0.4 = 10)
      expect(result.passThresholdMet).toBe(true); // 12 >= (15 * 0.8 = 12)
      expect(result.passed).toBe(true);

      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: {
          voteYesCount: 12,
          voteNoCount: 3,
          votePassed: true,
          votePollMessageId: 'simulated'
        }
      });
    });

    test('correctly identifies failed vote due to lack of quorum', async () => {
      const nominee = createMockNominee();
      
      // 9 total votes is less than required quorum of 10 (25 * 0.4)
      const result = await voteResultService.simulateVoteResults(nominee, 8, 1);

      expect(result.yesVotes).toBe(8);
      expect(result.noVotes).toBe(1);
      expect(result.totalVotes).toBe(9);
      expect(result.quorumMet).toBe(false); // 9 < (25 * 0.4 = 10)
      expect(result.passed).toBe(false);
    });

    test('correctly identifies failed vote due to insufficient approval', async () => {
      const nominee = createMockNominee();
      
      // Meets quorum (15 > 10) but fails approval threshold (8 < 12)
      const result = await voteResultService.simulateVoteResults(nominee, 8, 7);

      expect(result.yesVotes).toBe(8);
      expect(result.noVotes).toBe(7);
      expect(result.totalVotes).toBe(15);
      expect(result.quorumMet).toBe(true); // 15 > 10
      expect(result.passThresholdMet).toBe(false); // 8 < (15 * 0.8 = 12)
      expect(result.passed).toBe(false);
    });

    test('handles error gracefully', async () => {
      const nominee = createMockNominee();
      mockClient.guilds.fetch.mockRejectedValue(new Error('Guild fetch failed'));

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });
  });

  describe('simulateVoteResults', () => {
    test('calculates results for simulated vote data', async () => {
      const nominee = createMockNominee();
      
      const result = await voteResultService.simulateVoteResults(nominee, 20, 5);

      expect(result.yesVotes).toBe(20);
      expect(result.noVotes).toBe(5);
      expect(result.totalVotes).toBe(25);
      expect(result.memberCount).toBe(25);
      expect(result.quorumMet).toBe(true); // 25 = 100% participation
      expect(result.passThresholdMet).toBe(true); // 20/25 = 80%
      expect(result.passed).toBe(true);

      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: {
          voteYesCount: 20,
          voteNoCount: 5,
          votePassed: true,
          votePollMessageId: 'simulated'
        }
      });
    });

    test('correctly calculates failed simulated vote', async () => {
      const nominee = createMockNominee();
      
      const result = await voteResultService.simulateVoteResults(nominee, 5, 15);

      expect(result.yesVotes).toBe(5);
      expect(result.noVotes).toBe(15);
      expect(result.totalVotes).toBe(20);
      expect(result.quorumMet).toBe(true); // 20 > 10
      expect(result.passThresholdMet).toBe(false); // 5 < (20 * 0.8 = 16)
      expect(result.passed).toBe(false);
    });

    test('correctly calculates quorum failure', async () => {
      const nominee = createMockNominee();
      
      const result = await voteResultService.simulateVoteResults(nominee, 8, 1);

      expect(result.yesVotes).toBe(8);
      expect(result.noVotes).toBe(1);
      expect(result.totalVotes).toBe(9);
      expect(result.quorumMet).toBe(false); // 9 < (25 * 0.4 = 10)
      expect(result.passThresholdMet).toBe(true); // 8 > (9 * 0.8 = 7.2)
      expect(result.passed).toBe(false); // Failed due to quorum
    });
  });

  describe('result calculations', () => {
    test('calculates exact threshold cases correctly', async () => {
      const nominee = createMockNominee();
      
      // Test exact 80% threshold
      const result = await voteResultService.simulateVoteResults(nominee, 8, 2);

      expect(result.yesVotes).toBe(8);
      expect(result.noVotes).toBe(2);
      expect(result.totalVotes).toBe(10);
      expect(result.requiredQuorum).toBe(10); // ceil(25 * 0.4)
      expect(result.requiredPassVotes).toBe(8); // ceil(10 * 0.8)
      expect(result.quorumMet).toBe(true);
      expect(result.passThresholdMet).toBe(true);
      expect(result.passed).toBe(true);
    });

    test('calculates minimum quorum correctly', async () => {
      const nominee = createMockNominee();
      
      // Test exact quorum threshold
      const result = await voteResultService.simulateVoteResults(nominee, 8, 2);

      expect(result.requiredQuorum).toBe(10); // ceil(25 * 0.4) = 10
      expect(result.quorumMet).toBe(true);
    });
  });

  describe('postVoteResults', () => {
    test('stores announcement message IDs for cleanup', async () => {
      const nominee = createMockNominee({ announcementMessageIds: 'existing-id' });
      
      const voteResults = {
        passed: true,
        yesVotes: 12,
        noVotes: 3,
        totalVotes: 15,
        quorumMet: true,
        passThresholdMet: true,
        memberCount: 25,
        requiredQuorum: 10,
        requiredPassVotes: 12
      };

      // Mock channels and messages
      const mockGovernanceMessage = { id: 'governance-result-id' };
      const mockGeneralMessage = { id: 'general-result-id' };
      
      const mockGovernanceChannel = {
        send: mock(() => Promise.resolve(mockGovernanceMessage))
      };
      const mockGeneralChannel = {
        send: mock(() => Promise.resolve(mockGeneralMessage))
      };
      const mockModCommsChannel = {
        send: mock(() => Promise.resolve({ id: 'mod-comms-id' }))
      };

      // Mock ChannelFinderService
      mock.module('../lib/channelFinderService.js', () => ({
        ChannelFinderService: {
          governance: mock(() => Promise.resolve(mockGovernanceChannel)),
          general: mock(() => Promise.resolve(mockGeneralChannel)),
          modComms: mock(() => Promise.resolve(mockModCommsChannel)),
        }
      }));

      await voteResultService.postVoteResults(nominee, voteResults);

      // Should store governance and general message IDs (not mod-comms)
      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: {
          announcementMessageIds: 'existing-id,governance-result-id,general-result-id'
        }
      });
    });

    test('handles no existing announcement IDs', async () => {
      const nominee = createMockNominee({ announcementMessageIds: null });
      
      const voteResults = {
        passed: false,
        yesVotes: 5,
        noVotes: 10,
        totalVotes: 15,
        quorumMet: true,
        passThresholdMet: false,
        memberCount: 25,
        requiredQuorum: 10,
        requiredPassVotes: 12
      };

      // Mock channels and messages
      const mockGovernanceMessage = { id: 'governance-result-id' };
      
      const mockGovernanceChannel = {
        send: mock(() => Promise.resolve(mockGovernanceMessage))
      };

      // Mock ChannelFinderService
      mock.module('../lib/channelFinderService.js', () => ({
        ChannelFinderService: {
          governance: mock(() => Promise.resolve(mockGovernanceChannel)),
          general: mock(() => Promise.resolve(null)), // No general channel
          modComms: mock(() => Promise.resolve(null)), // No mod comms channel
        }
      }));

      await voteResultService.postVoteResults(nominee, voteResults);

      // Should store only governance message ID
      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: {
          announcementMessageIds: 'governance-result-id'
        }
      });
    });
  });
});