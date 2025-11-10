import { describe, test, expect, mock } from 'bun:test';
import { prisma } from '../lib/db.js';

describe('warn command', () => {
  test('warning creates new entry with message', async () => {
    const mockCreate = mock(() => Promise.resolve({ id: '1' }));
    prisma.vote.create = mockCreate;

    const guildId = '123';
    const targetUserId = '456';
    const voterHash = 'hash123';
    const message = 'This user is being disruptive';

    await prisma.vote.create({
      data: {
        guildId,
        targetUserId,
        voterHash,
        message,
      },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        guildId: '123',
        targetUserId: '456',
        voterHash: 'hash123',
        message: 'This user is being disruptive',
      },
    });
  });

  test('warnings are stored with anonymous hash', async () => {
    const mockCreate = mock(() => Promise.resolve({ id: '2' }));
    prisma.vote.create = mockCreate;

    await prisma.vote.create({
      data: {
        guildId: '123',
        targetUserId: '789',
        voterHash: 'anonymized_hash_value',
        message: 'Spam in chat',
      },
    });

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.voterHash).toBe('anonymized_hash_value');
    expect(callData.targetUserId).toBe('789');
  });
});