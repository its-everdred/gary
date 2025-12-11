import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

// Mock Discord.js
const mockChannel = {
  id: 'test-channel-id',
  name: 'test-channel',
  isTextBased: () => true,
  guild: {
    id: 'test-guild-id',
    roles: { everyone: { id: 'everyone-role-id' } }
  },
  send: mock(() => Promise.resolve()),
  setName: mock(() => Promise.resolve()),
  permissionOverwrites: {
    edit: mock(() => Promise.resolve())
  },
  delete: mock(() => Promise.resolve())
};

const mockGuild = {
  id: 'test-guild-id',
  channels: {
    create: mock(() => Promise.resolve(mockChannel))
  },
  roles: {
    everyone: { id: 'everyone-role-id' }
  }
};

const mockClient = {
  guilds: {
    fetch: mock(() => Promise.resolve(mockGuild))
  },
  channels: {
    fetch: mock(() => Promise.resolve(mockChannel))
  },
  users: {
    fetch: mock(() => Promise.resolve({ toString: () => '<@123>' }))
  }
};

const mockPrisma = {
  nominee: {
    update: mock(() => Promise.resolve())
  }
};

mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { ChannelManagementService } = await import('../lib/channelService.js');

function createMockNominee(overrides: Partial<Nominee> = {}): Nominee {
  return {
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.ACTIVE,
    nominator: 'test-nominator',
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

describe('ChannelManagementService', () => {
  let channelService: ChannelManagementService;

  beforeEach(() => {
    channelService = new ChannelManagementService(mockClient as any);
    
    // Reset all mocks
    mockClient.guilds.fetch.mockReset();
    mockClient.channels.fetch.mockReset();
    mockClient.users.fetch.mockReset();
    mockGuild.channels.create.mockReset();
    mockChannel.send.mockReset();
    mockChannel.setName.mockReset();
    mockChannel.permissionOverwrites.edit.mockReset();
    mockChannel.delete.mockReset();
    mockPrisma.nominee.update.mockReset();
  });

  describe('createDiscussionChannel', () => {
    test('successfully creates discussion channel', async () => {
      const nominee = createMockNominee({ name: 'John Doe' });
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockReturnValue(Promise.resolve(mockChannel));
      mockPrisma.nominee.update.mockReturnValue(Promise.resolve());

      const result = await channelService.createDiscussionChannel(nominee);

      expect(result.success).toBe(true);
      expect(result.channel).toBe(mockChannel);
      
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'discussion-john-doe',
        type: ChannelType.GuildText,
        topic: 'Discussion for nominee: John Doe',
        reason: 'Discussion channel for nominee John Doe'
      });

      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: { discussionChannelId: mockChannel.id }
      });

      expect(mockChannel.send).toHaveBeenCalled();
    });

    test('handles guild not found', async () => {
      const nominee = createMockNominee();
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(null));

      const result = await channelService.createDiscussionChannel(nominee);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Guild test-guild-id not found');
    });

    test('handles channel creation error', async () => {
      const nominee = createMockNominee();
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockRejectedValue(new Error('Permission denied'));

      const result = await channelService.createDiscussionChannel(nominee);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Permission denied');
    });

    test('sanitizes channel name properly', async () => {
      const nominee = createMockNominee({ name: 'John "Special" Doe@#$%' });
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockReturnValue(Promise.resolve(mockChannel));

      await channelService.createDiscussionChannel(nominee);

      expect(mockGuild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'discussion-john-special-doe'
        })
      );
    });
  });

  describe('createVoteChannel', () => {
    test('successfully creates vote channel with proper permissions', async () => {
      const nominee = createMockNominee({ name: 'Jane Smith' });
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockReturnValue(Promise.resolve(mockChannel));
      mockPrisma.nominee.update.mockReturnValue(Promise.resolve());

      const result = await channelService.createVoteChannel(nominee);

      expect(result.success).toBe(true);
      expect(result.channel).toBe(mockChannel);
      
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'vote-jane-smith',
        type: ChannelType.GuildText,
        topic: 'Vote for nominee: Jane Smith',
        reason: 'Vote channel for nominee Jane Smith',
        permissionOverwrites: [
          {
            id: 'everyone-role-id',
            deny: [PermissionFlagsBits.SendMessages],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          }
        ]
      });

      expect(mockPrisma.nominee.update).toHaveBeenCalledWith({
        where: { id: nominee.id },
        data: { voteChannelId: mockChannel.id }
      });
    });

    test('handles vote channel creation error', async () => {
      const nominee = createMockNominee();
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockRejectedValue(new Error('Rate limited'));

      const result = await channelService.createVoteChannel(nominee);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Rate limited');
    });
  });

  describe('archiveChannel', () => {
    test('successfully archives channel', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(mockChannel));
      mockChannel.setName.mockReturnValue(Promise.resolve());
      mockChannel.permissionOverwrites.edit.mockReturnValue(Promise.resolve());

      const result = await channelService.archiveChannel('test-channel-id', 'Discussion completed');

      expect(result).toBe(true);
      
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        'everyone-role-id',
        {
          SendMessages: false,
          AddReactions: false
        }
      );

      expect(mockChannel.setName).toHaveBeenCalledWith('archived-test-channel');
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.stringContaining('Channel Archived')
      );
    });

    test('handles channel not found', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(null));

      const result = await channelService.archiveChannel('nonexistent-id', 'Test');

      expect(result).toBe(false);
    });

    test('handles archive error', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(mockChannel));
      mockChannel.permissionOverwrites.edit.mockRejectedValue(new Error('No permission'));

      const result = await channelService.archiveChannel('test-channel-id', 'Test');

      expect(result).toBe(false);
    });
  });

  describe('deleteChannel', () => {
    test('successfully deletes channel', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(mockChannel));
      mockChannel.delete.mockReturnValue(Promise.resolve());

      const result = await channelService.deleteChannel('test-channel-id', 'Cleanup');

      expect(result).toBe(true);
      expect(mockChannel.delete).toHaveBeenCalledWith('Cleanup');
    });

    test('handles channel not found', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(null));

      const result = await channelService.deleteChannel('nonexistent-id', 'Test');

      expect(result).toBe(false);
    });

    test('handles delete error', async () => {
      mockClient.channels.fetch.mockReturnValue(Promise.resolve(mockChannel));
      mockChannel.delete.mockRejectedValue(new Error('Missing permissions'));

      const result = await channelService.deleteChannel('test-channel-id', 'Test');

      expect(result).toBe(false);
    });
  });

  describe('channel name generation', () => {
    test('handles long names with truncation', async () => {
      const longName = 'A'.repeat(100);
      const nominee = createMockNominee({ name: longName });
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockReturnValue(Promise.resolve(mockChannel));

      await channelService.createDiscussionChannel(nominee);

      const createCall = mockGuild.channels.create.mock.calls[0][0];
      expect(createCall.name.length).toBeLessThanOrEqual(100);
      expect(createCall.name).toMatch(/^discussion-a+$/);
    });

    test('handles names with spaces and special characters', async () => {
      const nominee = createMockNominee({ name: 'John   Doe Jr.' });
      
      mockClient.guilds.fetch.mockReturnValue(Promise.resolve(mockGuild));
      mockGuild.channels.create.mockReturnValue(Promise.resolve(mockChannel));

      await channelService.createVoteChannel(nominee);

      const createCall = mockGuild.channels.create.mock.calls[0][0];
      expect(createCall.name).toBe('vote-john-doe-jr');
    });
  });
});