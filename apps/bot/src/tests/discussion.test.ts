import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { NomineeState } from '@prisma/client';

const mockPrisma = {
  nominee: {
    findFirst: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve())
  }
};

const mockNomineeStateManager = {
  transitionNominee: mock(() => Promise.resolve({ success: true }))
};

const mockChannel = {
  isTextBased: () => true,
  messages: {
    fetchPinned: mock(() => Promise.resolve(new Map()))
  }
};

const mockInteraction = {
  deferReply: mock(() => Promise.resolve()),
  editReply: mock(() => Promise.resolve()),
  options: {
    getNumber: mock(() => 10)
  },
  guildId: 'test-guild-123',
  client: {
    channels: {
      fetch: mock(() => Promise.resolve(mockChannel))
    },
    user: { id: 'bot-id' }
  }
} as any as ChatInputCommandInteraction;

mock.module('../../lib/db.js', () => ({ prisma: mockPrisma }));
mock.module('../../lib/nomineeService.js', () => ({ NomineeStateManager: mockNomineeStateManager }));
mock.module('pino', () => ({
  default: () => ({
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  })
}));

const { handleDiscussionCommand } = await import('../commands/nominate/discussion.js');

describe('discussion command', () => {
  beforeEach(() => {
    mockPrisma.nominee.findFirst.mockReset();
    mockPrisma.nominee.update.mockReset();
    mockNomineeStateManager.transitionNominee.mockReset();
    mockInteraction.deferReply.mockClear();
    mockInteraction.editReply.mockClear();
    mockInteraction.options.getNumber.mockClear();
  });

  test('rejects negative hours', async () => {
    mockInteraction.options.getNumber.mockReturnValue(-5);

    await handleDiscussionCommand(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('Hours must be a positive number.');
  });

  test('shows error when no nominee in discussion', async () => {
    mockPrisma.nominee.findFirst.mockResolvedValue(null);
    mockInteraction.options.getNumber.mockReturnValue(10);

    await handleDiscussionCommand(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('There is no nominee currently in discussion.');
  });

  test('sets discussion duration successfully', async () => {
    const discussionStart = new Date();
    const voteStart = new Date(discussionStart.getTime() + 48 * 60 * 60 * 1000);
    
    mockPrisma.nominee.findFirst.mockResolvedValue({
      id: 'nominee-1',
      name: 'Test User',
      state: NomineeState.DISCUSSION,
      discussionStart,
      voteStart,
      discussionChannelId: 'channel-123'
    });

    mockInteraction.options.getNumber.mockReturnValue(10); // Set to 10 hours

    await handleDiscussionCommand(mockInteraction);

    expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
      where: { id: 'nominee-1' },
      data: expect.objectContaining({
        voteStart: expect.any(Date),
        certifyStart: expect.any(Date)
      })
    });

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Discussion duration for **Test User** has been set to 10 hours')
    );
  });

  test('transitions to VOTE state if duration already passed', async () => {
    const discussionStart = new Date(Date.now() - 5 * 60 * 60 * 1000); // Started 5 hours ago
    const voteStart = new Date(discussionStart.getTime() + 48 * 60 * 60 * 1000);
    
    mockPrisma.nominee.findFirst.mockResolvedValue({
      id: 'nominee-1',
      name: 'Test User',
      state: NomineeState.DISCUSSION,
      discussionStart,
      voteStart,
      discussionChannelId: 'channel-123'
    });

    mockInteraction.options.getNumber.mockReturnValue(2); // Set to 2 hours (already passed)
    mockNomineeStateManager.transitionNominee.mockResolvedValue({ success: true });

    await handleDiscussionCommand(mockInteraction);

    expect(mockNomineeStateManager.transitionNominee).toHaveBeenCalledWith('nominee-1', NomineeState.VOTE);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been transitioned to VOTE state')
    );
  });
});