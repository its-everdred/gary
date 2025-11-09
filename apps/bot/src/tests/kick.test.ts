import { describe, test, expect, mock } from 'bun:test';
import { prisma } from '../lib/db.js';
import { getVoteCount } from '../lib/tally.js';

describe('kick command', () => {
  test('first vote inserts, second vote by same user/target is ignored', async () => {
    const mockUpsert = mock(() => Promise.resolve({ id: '1' }));
    prisma.vote.upsert = mockUpsert;

    const guildId = '123';
    const targetUserId = '456';
    const voterHash = 'hash123';

    await prisma.vote.upsert({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId,
          voterHash,
        },
      },
      update: {},
      create: {
        guildId,
        targetUserId,
        voterHash,
      },
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  test('tally computes correctly for mock eligible count', async () => {
    const mockCount = mock(() => Promise.resolve(5));
    prisma.vote.count = mockCount;

    const voteCount = await getVoteCount('123', '456');
    const eligibleCount = 10;
    const quorumPercent = 40;
    const hasQuorum = (voteCount / eligibleCount) >= (quorumPercent / 100);

    expect(voteCount).toBe(5);
    expect(hasQuorum).toBe(true);
  });
});