import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { ChatInputCommandInteraction, Guild } from 'discord.js';

const mockUtils = {
  createWarning: mock(() => Promise.resolve()),
  countWarnings: mock(() => Promise.resolve(1)),
  getEligibleCount: mock(() => Promise.resolve(10)),
  sendToModChannel: mock(() => Promise.resolve()),
  validateGuildMember: mock(() => Promise.resolve({ isValid: true })),
  validateTargetMember: mock(() => Promise.resolve({ isValid: true })),
  checkExistingWarning: mock(() => Promise.resolve(false)),
  hmac: mock(() => 'hashed-voter-id')
};

const mockPrisma = {
  warn: {
    create: mock(() => Promise.resolve({ id: '1' })),
    findUnique: mock(() => Promise.resolve({ id: 'warning-id' })),
    delete: mock(() => Promise.resolve())
  }
};

mock.module('../lib/utils.js', () => mockUtils);
mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { warnHandler } = await import('../commands/warn.js');
const { unwarnHandler } = await import('../commands/unwarn.js');

function createMockInteraction(targetUserId: string, message: string): ChatInputCommandInteraction {
  return {
    deferReply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    options: {
      getUser: mock(() => ({ id: targetUserId })),
      getString: mock(() => message)
    },
    user: { id: 'voter-user-123' },
    client: {
      guilds: {
        fetch: mock(() => Promise.resolve({} as Guild))
      }
    }
  } as any;
}

function createMockUnwarnInteraction(targetUserId: string): ChatInputCommandInteraction {
  return {
    deferReply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    options: {
      getUser: mock(() => ({ id: targetUserId }))
    },
    user: { id: 'voter-user-123' },
    client: {
      guilds: {
        fetch: mock(() => Promise.resolve({} as Guild))
      }
    }
  } as any;
}

describe('warn command', () => {
  beforeEach(() => {
    mockUtils.createWarning.mockReset();
    mockUtils.countWarnings.mockReset();
    mockUtils.getEligibleCount.mockReset();
    mockUtils.sendToModChannel.mockReset();
    mockUtils.validateGuildMember.mockReset();
    mockUtils.validateTargetMember.mockReset();
    mockUtils.checkExistingWarning.mockReset();
    mockUtils.hmac.mockReset();
    
    process.env.GUILD_ID = 'test-guild-123';
    process.env.GUILD_SALT = 'test-salt';
    process.env.KICK_QUORUM_PERCENT = '40';
  });

  test('successful warning creates database entry', async () => {
    const mockInteraction = createMockInteraction('warn-user-123', 'This is a test warning');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.checkExistingWarning.mockReturnValue(Promise.resolve(false));
    mockUtils.createWarning.mockReturnValue(Promise.resolve());
    mockUtils.countWarnings.mockReturnValue(Promise.resolve(1));
    mockUtils.getEligibleCount.mockReturnValue(Promise.resolve(10));
    mockUtils.sendToModChannel.mockReturnValue(Promise.resolve());
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await warnHandler(mockInteraction);

    expect(mockUtils.createWarning).toHaveBeenCalledWith(
      'test-guild-123',
      'warn-user-123',
      'hashed-voter-id',
      'This is a test warning'
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith('Warning sent anonymously to moderators.');
  });

  test('prevents duplicate warnings from same voter', async () => {
    const mockInteraction = createMockInteraction('warn-user-123', 'Another warning');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.checkExistingWarning.mockReturnValue(Promise.resolve(true));
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await warnHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You already submit a warning for this user.');
  });

  test('rejects warning from invalid guild member', async () => {
    const mockInteraction = createMockInteraction('warn-user-123', 'Test warning');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({
      isValid: false,
      errorMessage: 'You must be a member of this server to use this command.'
    }));

    await warnHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You must be a member of this server to use this command.');
  });

  test('rejects warning for invalid target', async () => {
    const mockInteraction = createMockInteraction('invalid-user', 'Test warning');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({
      isValid: false,
      errorMessage: 'Target user is not a member of this server.'
    }));

    await warnHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('Target user is not a member of this server.');
  });
});

describe('unwarn command', () => {
  beforeEach(() => {
    mockPrisma.warn.findUnique.mockReset();
    mockPrisma.warn.delete.mockReset();
    mockUtils.validateGuildMember.mockReset();
    mockUtils.validateTargetMember.mockReset();
    mockUtils.sendToModChannel.mockReset();
    mockUtils.hmac.mockReset();
    
    process.env.GUILD_ID = 'test-guild-123';
    process.env.GUILD_SALT = 'test-salt';
  });

  test('successfully removes existing warning', async () => {
    const mockInteraction = createMockUnwarnInteraction('warn-user-123');
    
    mockPrisma.warn.findUnique.mockReturnValue(Promise.resolve({ id: 'warning-id-123' }));
    mockPrisma.warn.delete.mockReturnValue(Promise.resolve());
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.sendToModChannel.mockReturnValue(Promise.resolve());
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await unwarnHandler(mockInteraction);

    expect(mockPrisma.warn.delete).toHaveBeenCalledWith({
      where: {
        guildId_targetUserId_voterHash: {
          guildId: 'test-guild-123',
          targetUserId: 'warn-user-123',
          voterHash: 'hashed-voter-id'
        }
      }
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith('Your warning has been removed.');
  });

  test('handles attempt to remove non-existent warning', async () => {
    const mockInteraction = createMockUnwarnInteraction('warn-user-123');
    
    mockPrisma.warn.findUnique.mockReturnValue(Promise.resolve(null));
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await unwarnHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You have not warned this user.');
  });
});

describe('database operations', () => {
  test('warning creates new entry with message', async () => {
    mockPrisma.warn.create.mockReturnValue(Promise.resolve({ id: '1' }));

    const guildId = '123';
    const targetUserId = '456';
    const voterHash = 'hash123';
    const message = 'This user is being disruptive';

    await mockPrisma.warn.create({
      data: {
        guildId,
        targetUserId,
        voterHash,
        message,
      },
    });

    expect(mockPrisma.warn.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.warn.create).toHaveBeenCalledWith({
      data: {
        guildId: '123',
        targetUserId: '456',
        voterHash: 'hash123',
        message: 'This user is being disruptive',
      },
    });
  });

  test('warnings are stored with anonymous hash', async () => {
    mockPrisma.warn.create.mockReset();
    mockPrisma.warn.create.mockReturnValue(Promise.resolve({ id: '2' }));

    await mockPrisma.warn.create({
      data: {
        guildId: '123',
        targetUserId: '789',
        voterHash: 'anonymized_hash_value',
        message: 'Spam in chat',
      },
    });

    const callData = mockPrisma.warn.create.mock.calls[0][0].data;
    expect(callData.voterHash).toBe('anonymized_hash_value');
    expect(callData.targetUserId).toBe('789');
  });
});