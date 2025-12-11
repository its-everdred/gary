import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';
import type { ChatInputCommandInteraction } from 'discord.js';

// Mock the dependencies
const mockValidateModeratorPermission = mock();
const mockFindNomineeByName = mock();
const mockHasNomineeInProgress = mock();
const mockGetCurrentNomineeInProgress = mock();
const mockTransitionNominee = mock();
const mockChannelService = {
  createDiscussionChannel: mock(() => Promise.resolve({ success: true, channel: { toString: () => '<#test-channel>' } }))
};

// Mock modules
mock.module('../lib/permissions.js', () => ({
  validateModeratorPermission: mockValidateModeratorPermission
}));

mock.module('../lib/nomineeService.js', () => ({
  NomineeStateManager: {
    findNomineeByName: mockFindNomineeByName,
    hasNomineeInProgress: mockHasNomineeInProgress,
    getCurrentNomineeInProgress: mockGetCurrentNomineeInProgress,
    transitionNominee: mockTransitionNominee
  }
}));

mock.module('../lib/channelService.js', () => ({
  ChannelManagementService: class MockChannelService {
    constructor() {
      return mockChannelService;
    }
  }
}));

// Import the handler after mocking
const { handleStartCommand } = await import('../commands/nominate/start.js');

function createMockNominee(overrides: Partial<Nominee> = {}): Nominee {
  return {
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.ACTIVE,
    nominator: 'nominator-user-id',
    guildId: 'test-guild-id',
    discussionStart: null,
    voteStart: null,
    certifyStart: null,
    createdAt: new Date(),
    discussionChannelId: null,
    voteChannelId: null,
    ...overrides
  };
}

function createMockInteraction(overrides: any = {}): ChatInputCommandInteraction {
  return {
    guildId: 'test-guild-id',
    user: { id: 'user-123' },
    client: {},
    options: {
      getString: mock((name: string) => name === 'name' ? 'Test Nominee' : null)
    },
    reply: mock(() => Promise.resolve()),
    deferReply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    replied: false,
    deferred: false,
    ...overrides
  } as any;
}

describe('/nominate start command', () => {
  beforeEach(() => {
    // Reset all mocks
    mockValidateModeratorPermission.mockReset();
    mockFindNomineeByName.mockReset();
    mockHasNomineeInProgress.mockReset();
    mockGetCurrentNomineeInProgress.mockReset();
    mockTransitionNominee.mockReset();
    mockChannelService.createDiscussionChannel.mockReset();
  });

  test('rejects command outside of guild', async () => {
    const interaction = createMockInteraction({ guildId: null });

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  });

  test('rejects command from non-moderator', async () => {
    const interaction = createMockInteraction();
    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: false,
      errorMessage: 'Insufficient permissions'
    }));

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ **Access Denied**\n\nInsufficient permissions',
      ephemeral: true
    });
  });

  test('rejects when nominee not found', async () => {
    const interaction = createMockInteraction();
    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(null));

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ **Nominee Not Found**\n\nNo nominee named "Test Nominee" found in this server.',
      ephemeral: true
    });
  });

  test('rejects when nominee not in ACTIVE state', async () => {
    const interaction = createMockInteraction();
    const nominee = createMockNominee({ state: NomineeState.DISCUSSION });

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(nominee));

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ **Invalid State**\n\nNominee "Test Nominee" is currently in DISCUSSION state. Only ACTIVE nominees can be manually started.',
      ephemeral: true
    });
  });

  test('rejects when another nominee is in progress', async () => {
    const interaction = createMockInteraction();
    const nominee = createMockNominee();
    const inProgressNominee = createMockNominee({
      name: 'Other Nominee',
      state: NomineeState.VOTE
    });

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(nominee));
    mockHasNomineeInProgress.mockReturnValue(Promise.resolve(true));
    mockGetCurrentNomineeInProgress.mockReturnValue(Promise.resolve(inProgressNominee));

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Cannot start "Test Nominee" because "Other Nominee" is currently in VOTE state'),
        ephemeral: true
      })
    );
  });

  test('successfully starts discussion for nominee', async () => {
    const interaction = createMockInteraction();
    const nominee = createMockNominee();
    const updatedNominee = createMockNominee({ state: NomineeState.DISCUSSION });

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(nominee));
    mockHasNomineeInProgress.mockReturnValue(Promise.resolve(false));
    mockTransitionNominee.mockReturnValue(Promise.resolve({
      success: true,
      nominee: updatedNominee
    }));
    mockChannelService.createDiscussionChannel.mockReturnValue(Promise.resolve({
      success: true,
      channel: { toString: () => '<#test-channel>' }
    }));

    await handleStartCommand(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(mockTransitionNominee).toHaveBeenCalledWith(
      nominee.id,
      NomineeState.DISCUSSION,
      { discussionStart: expect.any(Date) }
    );
    expect(mockChannelService.createDiscussionChannel).toHaveBeenCalledWith(updatedNominee);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Discussion has been manually started for "Test Nominee"')
      })
    );
  });

  test('handles transition failure', async () => {
    const interaction = createMockInteraction();
    const nominee = createMockNominee();

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(nominee));
    mockHasNomineeInProgress.mockReturnValue(Promise.resolve(false));
    mockTransitionNominee.mockReturnValue(Promise.resolve({
      success: false,
      errorMessage: 'Invalid transition'
    }));

    await handleStartCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ **Transition Failed**\n\nFailed to start discussion for "Test Nominee":\nInvalid transition'
    });
  });

  test('handles channel creation failure gracefully', async () => {
    const interaction = createMockInteraction();
    const nominee = createMockNominee();
    const updatedNominee = createMockNominee({ state: NomineeState.DISCUSSION });

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(nominee));
    mockHasNomineeInProgress.mockReturnValue(Promise.resolve(false));
    mockTransitionNominee.mockReturnValue(Promise.resolve({
      success: true,
      nominee: updatedNominee
    }));
    mockChannelService.createDiscussionChannel.mockReturnValue(Promise.resolve({
      success: false,
      errorMessage: 'Permission denied'
    }));

    await handleStartCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Discussion started but channel creation failed')
      })
    );
  });

  test('handles unexpected errors', async () => {
    const interaction = createMockInteraction();
    
    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockRejectedValue(new Error('Database error'));

    await handleStartCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ An error occurred while processing your command.',
      ephemeral: true
    });
  });

  test('handles errors after deferReply', async () => {
    const interaction = createMockInteraction();
    interaction.deferred = true;

    mockValidateModeratorPermission.mockReturnValue(Promise.resolve({
      hasPermission: true
    }));
    mockFindNomineeByName.mockReturnValue(Promise.resolve(createMockNominee()));
    mockHasNomineeInProgress.mockRejectedValue(new Error('Database error'));

    await handleStartCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ **Error**\n\nAn error occurred while starting discussion for "Test Nominee".'
    });
  });
});