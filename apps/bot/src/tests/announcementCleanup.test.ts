import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import type { Client, Guild, TextChannel, Message } from 'discord.js';
import { AnnouncementService } from '../lib/announcementService.js';
import { NominationJobScheduler } from '../lib/jobScheduler.js';
import { ChannelFinderService } from '../lib/channelFinderService.js';
import { prisma } from '../lib/db.js';
import { NomineeState } from '@prisma/client';

// Mock the database
mock.module('../lib/db.js', () => ({
  prisma: {
    nominee: {
      findUnique: mock(),
      update: mock(),
    },
  },
}));

// Mock the channel finder service
mock.module('../lib/channelFinderService.js', () => ({
  ChannelFinderService: {
    findGovernanceChannel: mock(),
    findGeneralChannel: mock(),
    findModCommsChannel: mock(),
  },
}));

describe('Announcement Message Cleanup', () => {
  let mockClient: Client;
  let mockGuild: Guild;
  let mockGovernanceChannel: TextChannel;
  let mockGeneralChannel: TextChannel;
  let mockMessage: Message;
  let announcementService: AnnouncementService;
  let jobScheduler: NominationJobScheduler;

  beforeEach(() => {
    // Reset all mocks
    mock.restore();

    // Create mock message
    mockMessage = {
      id: 'test-message-id',
      delete: mock(() => Promise.resolve()),
    } as any;

    // Create mock channels
    mockGovernanceChannel = {
      send: mock(() => Promise.resolve(mockMessage)),
      messages: {
        fetch: mock(() => Promise.resolve(mockMessage)),
      },
    } as any;

    mockGeneralChannel = {
      send: mock(() => Promise.resolve(mockMessage)),
      messages: {
        fetch: mock(() => Promise.resolve(mockMessage)),
      },
    } as any;

    // Create mock guild
    mockGuild = {
      channels: {
        cache: {
          get: mock(() => mockGovernanceChannel),
        },
      },
    } as any;

    // Create mock client
    mockClient = {
      guilds: {
        fetch: mock(() => Promise.resolve(mockGuild)),
      },
    } as any;

    announcementService = new AnnouncementService(mockClient);
    jobScheduler = NominationJobScheduler.getInstance(mockClient);

    // Setup channel finder mocks
    (ChannelFinderService.findGovernanceChannel as any).mockResolvedValue(mockGovernanceChannel);
    (ChannelFinderService.findGeneralChannel as any).mockResolvedValue(mockGeneralChannel);
    (ChannelFinderService.findModCommsChannel as any).mockResolvedValue(null);
  });

  afterEach(() => {
    mock.restore();
  });

  test('should store message IDs when announcing discussion start', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.DISCUSSION,
      nominator: 'test-nominator',
      announcementMessageIds: null,
    };

    // Mock database calls
    (prisma.nominee.findUnique as any).mockResolvedValue(nominee);
    (prisma.nominee.update as any).mockResolvedValue(nominee);

    const result = await announcementService.announceDiscussionStart(nominee as any, 'discussion-channel-id');

    expect(result).toBe(true);
    expect(mockGovernanceChannel.send).toHaveBeenCalledTimes(1);
    expect(prisma.nominee.update).toHaveBeenCalledWith({
      where: { id: 'test-nominee-id' },
      data: {
        announcementMessageIds: 'test-message-id',
      },
    });
  });

  test('should store message IDs when announcing vote start', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.VOTE,
      nominator: 'test-nominator',
      announcementMessageIds: null,
    };

    // Mock different message IDs for governance and general
    const mockGovernanceMessage = { id: 'governance-message-id' };
    const mockGeneralMessage = { id: 'general-message-id' };

    (mockGovernanceChannel.send as any).mockResolvedValue(mockGovernanceMessage);
    (mockGeneralChannel.send as any).mockResolvedValue(mockGeneralMessage);

    // Mock database calls
    (prisma.nominee.findUnique as any).mockResolvedValue(nominee);
    (prisma.nominee.update as any).mockResolvedValue(nominee);

    const result = await announcementService.announceVoteStart(nominee as any, 'vote-channel-id');

    expect(result).toBe(true);
    expect(mockGovernanceChannel.send).toHaveBeenCalledTimes(1);
    expect(mockGeneralChannel.send).toHaveBeenCalledTimes(1);
    expect(prisma.nominee.update).toHaveBeenCalledWith({
      where: { id: 'test-nominee-id' },
      data: {
        announcementMessageIds: 'governance-message-id,general-message-id',
      },
    });
  });

  test('should append to existing message IDs', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.DISCUSSION,
      nominator: 'test-nominator',
      announcementMessageIds: 'existing-message-id',
    };

    // Mock database calls
    (prisma.nominee.findUnique as any).mockResolvedValue(nominee);
    (prisma.nominee.update as any).mockResolvedValue(nominee);

    await announcementService.announceDiscussionStart(nominee as any, 'discussion-channel-id');

    expect(prisma.nominee.update).toHaveBeenCalledWith({
      where: { id: 'test-nominee-id' },
      data: {
        announcementMessageIds: 'existing-message-id,test-message-id',
      },
    });
  });

  test('should delete announcement messages during cleanup', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.CERTIFY,
      nominator: 'test-nominator',
      announcementMessageIds: 'message-id-1,message-id-2',
      discussionChannelId: null,
      voteChannelId: null,
      votePassed: true,
    };

    // Mock the transition to PAST state
    const transitionResult = { success: true, nominee };

    // Mock NomineeStateManager
    const mockTransitionNominee = mock(() => Promise.resolve(transitionResult));
    mock.module('../lib/nomineeService.js', () => ({
      NomineeStateManager: {
        transitionNominee: mockTransitionNominee,
        getNextNomineeForDiscussion: mock(() => Promise.resolve(null)),
        hasNomineeInProgress: mock(() => Promise.resolve(false)),
      },
    }));

    // Mock the message fetch and delete
    const mockMessage1 = { id: 'message-id-1', delete: mock(() => Promise.resolve()) };
    const mockMessage2 = { id: 'message-id-2', delete: mock(() => Promise.resolve()) };

    (mockGovernanceChannel.messages.fetch as any)
      .mockResolvedValueOnce(mockMessage1)
      .mockResolvedValueOnce(mockMessage2);

    const result = await jobScheduler.performPostCertifyCleanup(nominee as any);

    expect(result.success).toBe(true);
    expect(mockGovernanceChannel.messages.fetch).toHaveBeenCalledWith('message-id-1');
    expect(mockGovernanceChannel.messages.fetch).toHaveBeenCalledWith('message-id-2');
    expect(mockMessage1.delete).toHaveBeenCalledTimes(1);
    expect(mockMessage2.delete).toHaveBeenCalledTimes(1);
  });

  test('should handle message deletion failures gracefully', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.CERTIFY,
      nominator: 'test-nominator',
      announcementMessageIds: 'invalid-message-id',
      discussionChannelId: null,
      voteChannelId: null,
      votePassed: true,
    };

    // Mock the transition to PAST state
    const transitionResult = { success: true, nominee };

    // Mock NomineeStateManager
    const mockTransitionNominee = mock(() => Promise.resolve(transitionResult));
    mock.module('../lib/nomineeService.js', () => ({
      NomineeStateManager: {
        transitionNominee: mockTransitionNominee,
        getNextNomineeForDiscussion: mock(() => Promise.resolve(null)),
        hasNomineeInProgress: mock(() => Promise.resolve(false)),
      },
    }));

    // Mock message fetch to throw error (message not found)
    (mockGovernanceChannel.messages.fetch as any).mockRejectedValue(new Error('Message not found'));
    (mockGeneralChannel.messages.fetch as any).mockRejectedValue(new Error('Message not found'));

    // Should not throw an error even if message deletion fails
    const result = await jobScheduler.performPostCertifyCleanup(nominee as any);

    expect(result.success).toBe(true);
    expect(mockGovernanceChannel.messages.fetch).toHaveBeenCalledWith('invalid-message-id');
  });

  test('should handle nominees with no announcement message IDs', async () => {
    const nominee = {
      id: 'test-nominee-id',
      name: 'Test Nominee',
      guildId: 'test-guild-id',
      state: NomineeState.CERTIFY,
      nominator: 'test-nominator',
      announcementMessageIds: null,
      discussionChannelId: null,
      voteChannelId: null,
      votePassed: true,
    };

    // Mock the transition to PAST state
    const transitionResult = { success: true, nominee };

    // Mock NomineeStateManager
    const mockTransitionNominee = mock(() => Promise.resolve(transitionResult));
    mock.module('../lib/nomineeService.js', () => ({
      NomineeStateManager: {
        transitionNominee: mockTransitionNominee,
        getNextNomineeForDiscussion: mock(() => Promise.resolve(null)),
        hasNomineeInProgress: mock(() => Promise.resolve(false)),
      },
    }));

    const result = await jobScheduler.performPostCertifyCleanup(nominee as any);

    expect(result.success).toBe(true);
    // Should not attempt to fetch any messages
    expect(mockGovernanceChannel.messages.fetch).not.toHaveBeenCalled();
    expect(mockGeneralChannel.messages.fetch).not.toHaveBeenCalled();
  });
});