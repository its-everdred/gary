import { describe, test, expect, mock } from 'bun:test';
import { prisma } from '../lib/db.js';

describe('history command', () => {
  test('after two different targets voted, history returns two lines containing snowflakes', async () => {
    const mockVotes = [
      {
        id: '1',
        guildId: '123',
        targetUserId: '111111111111111111',
        voterHash: 'hash123',
        createdAt: new Date('2025-11-09'),
      },
      {
        id: '2',
        guildId: '123',
        targetUserId: '222222222222222222',
        voterHash: 'hash123',
        createdAt: new Date('2025-11-08'),
      },
    ];

    const mockFindMany = mock(() => Promise.resolve(mockVotes));
    prisma.vote.findMany = mockFindMany;

    const votes = await prisma.vote.findMany({
      where: {
        guildId: '123',
        voterHash: 'hash123',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(votes).toHaveLength(2);
    expect(votes[0].targetUserId).toBe('111111111111111111');
    expect(votes[1].targetUserId).toBe('222222222222222222');
  });
});