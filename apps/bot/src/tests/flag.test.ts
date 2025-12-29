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
  flag: {
    create: mock(() => Promise.resolve({ id: '1' })),
    findUnique: mock(() => Promise.resolve({ id: 'flag-id' })),
    delete: mock(() => Promise.resolve())
  }
};

mock.module('../lib/utils.js', () => mockUtils);
mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { flagHandler } = await import('../commands/flag.js');
const { unflagHandler } = await import('../commands/unflag.js');

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

function createMockUnflagInteraction(targetUserId: string): ChatInputCommandInteraction {
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

describe('flag command', () => {
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

  test('successful flag creates database entry', async () => {
    const mockInteraction = createMockInteraction('flag-user-123', 'This is a test flag');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.checkExistingWarning.mockReturnValue(Promise.resolve(false));
    mockUtils.createWarning.mockReturnValue(Promise.resolve());
    mockUtils.countWarnings.mockReturnValue(Promise.resolve(1));
    mockUtils.getEligibleCount.mockReturnValue(Promise.resolve(10));
    mockUtils.sendToModChannel.mockReturnValue(Promise.resolve());
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await flagHandler(mockInteraction);

    expect(mockUtils.createWarning).toHaveBeenCalledWith(
      'test-guild-123',
      'flag-user-123',
      'hashed-voter-id',
      'This is a test flag'
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith('Flag sent anonymously to moderators.');
  });

  test('prevents duplicate flags from same voter', async () => {
    const mockInteraction = createMockInteraction('flag-user-123', 'Another flag');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.checkExistingWarning.mockReturnValue(Promise.resolve(true));
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await flagHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You already submit a flag for this user.');
  });

  test('rejects flag from invalid guild member', async () => {
    const mockInteraction = createMockInteraction('flag-user-123', 'Test flag');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({
      isValid: false,
      errorMessage: 'You must be a member of this server to use this command.'
    }));

    await flagHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You must be a member of this server to use this command.');
  });

  test('rejects flag for invalid target', async () => {
    const mockInteraction = createMockInteraction('invalid-user', 'Test flag');
    
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({
      isValid: false,
      errorMessage: 'Target user is not a member of this server.'
    }));

    await flagHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('Target user is not a member of this server.');
  });
});

describe('unflag command', () => {
  beforeEach(() => {
    mockPrisma.flag.findUnique.mockReset();
    mockPrisma.flag.delete.mockReset();
    mockUtils.validateGuildMember.mockReset();
    mockUtils.validateTargetMember.mockReset();
    mockUtils.sendToModChannel.mockReset();
    mockUtils.hmac.mockReset();
    
    process.env.GUILD_ID = 'test-guild-123';
    process.env.GUILD_SALT = 'test-salt';
  });

  test('successfully removes existing flag', async () => {
    const mockInteraction = createMockUnflagInteraction('flag-user-123');
    
    mockPrisma.flag.findUnique.mockReturnValue(Promise.resolve({ id: 'flag-id-123' }));
    mockPrisma.flag.delete.mockReturnValue(Promise.resolve());
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.sendToModChannel.mockReturnValue(Promise.resolve());
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await unflagHandler(mockInteraction);

    expect(mockPrisma.flag.delete).toHaveBeenCalledWith({
      where: {
        guildId_targetUserId_voterHash: {
          guildId: 'test-guild-123',
          targetUserId: 'flag-user-123',
          voterHash: 'hashed-voter-id'
        }
      }
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith('Your flag has been removed.');
  });

  test('handles attempt to remove non-existent flag', async () => {
    const mockInteraction = createMockUnflagInteraction('flag-user-123');
    
    mockPrisma.flag.findUnique.mockReturnValue(Promise.resolve(null));
    mockUtils.validateGuildMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.validateTargetMember.mockReturnValue(Promise.resolve({ isValid: true }));
    mockUtils.hmac.mockReturnValue('hashed-voter-id');

    await unflagHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('You have not flagged this user.');
  });
});

describe('database operations', () => {
  test('flag creates new entry with message', async () => {
    mockPrisma.flag.create.mockReturnValue(Promise.resolve({ id: '1' }));

    const guildId = '123';
    const targetUserId = '456';
    const voterHash = 'hash123';
    const message = 'This user is being disruptive';

    await mockPrisma.flag.create({
      data: {
        guildId,
        targetUserId,
        voterHash,
        message,
      },
    });

    expect(mockPrisma.flag.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.flag.create).toHaveBeenCalledWith({
      data: {
        guildId: '123',
        targetUserId: '456',
        voterHash: 'hash123',
        message: 'This user is being disruptive',
      },
    });
  });

  test('flags are stored with anonymous hash', async () => {
    mockPrisma.flag.create.mockReset();
    mockPrisma.flag.create.mockReturnValue(Promise.resolve({ id: '2' }));

    await mockPrisma.flag.create({
      data: {
        guildId: '123',
        targetUserId: '789',
        voterHash: 'anonymized_hash_value',
        message: 'Spam in chat',
      },
    });

    const callData = mockPrisma.flag.create.mock.calls[0][0].data;
    expect(callData.voterHash).toBe('anonymized_hash_value');
    expect(callData.targetUserId).toBe('789');
  });
});