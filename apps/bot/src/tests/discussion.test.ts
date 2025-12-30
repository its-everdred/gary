import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import {
  setupModuleMocks,
  resetAllMocks,
  mockPrisma,
  mockJobScheduler,
  createMockInteraction,
  createMockNominee
} from './mocks';

// Setup module mocks
setupModuleMocks();

const { handleDiscussionCommand } = await import('../commands/nominate/discussion.js');

describe('discussion command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    // Reset all mocks to baseline state
    resetAllMocks();
    
    // Create fresh interaction for each test
    mockInteraction = createMockInteraction();
  });

  afterEach(() => {
    // Clean up after each test
    resetAllMocks();
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

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'There is no nominee currently in discussion.'
    );
  });

  test('sets discussion duration successfully', async () => {
    const discussionStart = new Date();
    const voteStart = new Date(discussionStart.getTime() + 48 * 60 * 60 * 1000);
    
    const nominee = createMockNominee({
      id: 'nominee-1',
      name: 'Test User',
      state: NomineeState.DISCUSSION,
      nominator: 'user-123',
      discussionStart,
      voteStart,
      cleanupStart: new Date(),
      discussionChannelId: 'channel-123'
    });
    
    mockPrisma.nominee.findFirst.mockResolvedValue(nominee);

    mockInteraction.options.getNumber.mockReturnValue(10); // Set to 10 hours

    await handleDiscussionCommand(mockInteraction);

    expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
      where: { id: 'nominee-1' },
      data: expect.objectContaining({
        voteStart: expect.any(Date),
        cleanupStart: expect.any(Date)
      })
    });

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Discussion duration for **Test User** has been set to 10 hours')
    );
  });

  test('transitions to VOTE state if duration already passed', async () => {
    const discussionStart = new Date(Date.now() - 5 * 60 * 60 * 1000); // Started 5 hours ago
    const voteStart = new Date(discussionStart.getTime() + 48 * 60 * 60 * 1000);
    
    const nominee = createMockNominee({
      id: 'nominee-1',
      name: 'Test User',
      state: NomineeState.DISCUSSION,
      nominator: 'user-123',
      discussionStart,
      voteStart,
      cleanupStart: new Date(),
      discussionChannelId: 'channel-123'
    });
    
    mockPrisma.nominee.findFirst.mockResolvedValue(nominee);

    mockInteraction.options.getNumber.mockReturnValue(2); // Set to 2 hours (already passed)

    await handleDiscussionCommand(mockInteraction);

    expect(mockJobScheduler.transitionToVote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'nominee-1'
    }));
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('has been transitioned to VOTE state')
    );
  });
});