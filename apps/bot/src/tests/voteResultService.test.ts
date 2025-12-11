import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

// Mock Discord.js
const mockMessage = {
  id: 'poll-message-id',
  author: { id: '437618149505105920', username: 'EasyPoll' },
  content: 'Poll for Test Nominee',
  embeds: [{
    title: 'Should we invite Test Nominee to GA?',
    description: 'Poll Results: ✅ 12 votes, ❌ 3 votes - Poll closed',
    color: 0xff0000,
    fields: [
      { name: 'Yes', value: '12', inline: true },
      { name: 'No', value: '3', inline: true }
    ]
  }]
};

const mockChannel = {
  id: 'vote-channel-id',
  messages: {
    fetch: mock(() => Promise.resolve(new Map([['poll-message-id', mockMessage]])))
  }
};

const mockGuild = {
  id: 'test-guild-id',
  channels: {
    cache: {
      get: mock(() => mockChannel)
    }
  },
  members: {
    cache: {
      filter: mock(() => ({ size: 25 })) // 25 non-bot members
    },
    fetch: mock(() => Promise.resolve())
  }
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
    ...overrides
  };
}

describe('VoteResultService', () => {
  let voteResultService: VoteResultService;

  beforeEach(() => {
    voteResultService = new VoteResultService(mockClient as any);
    
    // Reset all mocks
    mockClient.guilds.fetch.mockReset();
    mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
    mockChannel.messages.fetch.mockReset();
    mockChannel.messages.fetch.mockReturnValue(Promise.resolve(new Map([['poll-message-id', mockMessage]])));
    mockGuild.channels.cache.get.mockReset();
    mockGuild.channels.cache.get.mockReturnValue(mockChannel);
    mockGuild.members.cache.filter.mockReset();
    mockGuild.members.cache.filter.mockReturnValue({ size: 25 });
    mockGuild.members.fetch.mockReset();
    mockGuild.members.fetch.mockReturnValue(Promise.resolve());
    mockPrisma.nominee.update.mockReset();
    mockPrisma.nominee.update.mockReturnValue(Promise.resolve());
  });

  describe('checkVoteCompletion', () => {
    test('returns null when no vote channel ID', async () => {
      const nominee = createMockNominee({ voteChannelId: null });

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });

    test('returns null when vote channel not found', async () => {
      const nominee = createMockNominee();
      mockGuild.channels.cache.get.mockReturnValue(undefined);

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });

    test('returns null when no completed poll found', async () => {
      const nominee = createMockNominee();
      mockChannel.messages.fetch.mockReturnValue(Promise.resolve(new Map()));

      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeNull();
    });

    test('successfully calculates vote results from completed poll', async () => {
      const nominee = createMockNominee();
      
      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeTruthy();
      if (result) {
        expect(result.yesVotes).toBe(12);
        expect(result.noVotes).toBe(3);
        expect(result.totalVotes).toBe(15);
        expect(result.memberCount).toBe(25);
        expect(result.quorumMet).toBe(true); // 15 > (25 * 0.4 = 10)
        expect(result.passThresholdMet).toBe(true); // 12 > (15 * 0.8 = 12)
        expect(result.passed).toBe(true);
      }

      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: {
          voteYesCount: 12,
          voteNoCount: 3,
          votePassed: true,
          votePollMessageId: 'poll-message-id'
        }
      });
    });

    test('correctly identifies failed vote due to lack of quorum', async () => {
      const nominee = createMockNominee();
      
      // Mock fewer votes to fail quorum
      mockMessage.embeds[0].description = 'Poll Results: ✅ 8 votes, ❌ 1 votes - Poll closed';
      
      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeTruthy();
      if (result) {
        expect(result.yesVotes).toBe(8);
        expect(result.noVotes).toBe(1);
        expect(result.totalVotes).toBe(9);
        expect(result.quorumMet).toBe(false); // 9 < (25 * 0.4 = 10)
        expect(result.passed).toBe(false);
      }
    });

    test('correctly identifies failed vote due to insufficient approval', async () => {
      const nominee = createMockNominee();
      
      // Mock votes that meet quorum but fail approval threshold
      mockMessage.embeds[0].description = 'Poll Results: ✅ 8 votes, ❌ 7 votes - Poll closed';
      
      const result = await voteResultService.checkVoteCompletion(nominee);

      expect(result).toBeTruthy();
      if (result) {
        expect(result.yesVotes).toBe(8);
        expect(result.noVotes).toBe(7);
        expect(result.totalVotes).toBe(15);
        expect(result.quorumMet).toBe(true); // 15 > 10
        expect(result.passThresholdMet).toBe(false); // 8 < (15 * 0.8 = 12)
        expect(result.passed).toBe(false);
      }
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
});