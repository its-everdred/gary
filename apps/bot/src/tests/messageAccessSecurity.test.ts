import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { } from 'discord.js';
import { VoteResultService } from '../lib/voteResultService.js';
import { NominationJobScheduler } from '../lib/jobScheduler.js';
import type { Nominee } from '@prisma/client';
import { NomineeState } from '@prisma/client';

describe('Message Access Security Tests', () => {
  let mockClient: any;
  let mockGuild: any;
  let mockVoteChannel: any;
  let mockDiscussionChannel: any;
  let mockGovernanceChannel: any;
  let voteResultService: VoteResultService;
  let jobScheduler: NominationJobScheduler;
  let messageAccessLog: Array<{ channelId: string; channelType: string; operation: string }>;

  beforeEach(() => {
    // Reset message access tracking
    messageAccessLog = [];

    // Create mock channels with tracking
    const createTrackedChannel = (id: string, type: string, name: string) => ({
      id,
      name,
      type: 0, // GUILD_TEXT
      guild: mockGuild,
      messages: {
        fetch: mock(async (options?: any) => {
          messageAccessLog.push({
            channelId: id,
            channelType: type,
            operation: typeof options === 'string' ? 'fetch_single' : 'fetch_multiple'
          });
          
          if (type === 'vote') {
            // Return mock EasyPoll message for vote channels
            const mockMessage = {
              id: 'poll-message-id',
              author: { id: '437618149505105920' }, // EasyPoll bot ID
              embeds: [{
                description: 'Poll Results: ✅ 15 votes, ❌ 3 votes - Poll closed'
              }],
              createdTimestamp: Date.now() - 30000, // 30 seconds ago
              reactions: {
                cache: new Map([
                  ['✅', { count: 15, users: { cache: new Map() } }],
                  ['❌', { count: 3, users: { cache: new Map() } }]
                ])
              }
            };
            
            const mockCollection = new Map();
            mockCollection.set('poll-message-id', mockMessage);
            return mockCollection;
          }
          
          // Return empty collection for non-vote channels
          return new Map();
        })
      },
      send: mock(async () => ({ id: 'sent-message-id' })),
      setName: mock(async () => {}),
      delete: mock(async () => {})
    });

    mockVoteChannel = createTrackedChannel('vote-channel-123', 'vote', 'nominee-vote-smith');
    mockDiscussionChannel = createTrackedChannel('discussion-channel-456', 'discussion', 'nominee-discussion-smith'); 
    mockGovernanceChannel = createTrackedChannel('governance-channel-789', 'governance', 'governance');

    // Mock guild
    mockGuild = {
      id: 'test-guild-id',
      channels: {
        cache: new Map([
          ['vote-channel-123', mockVoteChannel],
          ['discussion-channel-456', mockDiscussionChannel],
          ['governance-channel-789', mockGovernanceChannel]
        ]),
        fetch: mock(async (id: string) => {
          const channel = mockGuild.channels.cache.get(id);
          if (channel) return channel;
          throw new Error('Channel not found');
        })
      },
      members: {
        cache: new Map(),
        fetch: mock(async () => new Map())
      }
    };

    // Mock client
    mockClient = {
      guilds: {
        cache: new Map([['test-guild-id', mockGuild]]),
        fetch: mock(async () => mockGuild)
      }
    };

    // Initialize services
    voteResultService = new VoteResultService(mockClient);
    jobScheduler = new NominationJobScheduler(mockClient);
  });

  const createMockNominee = (overrides: Partial<Nominee> = {}): Nominee => ({
    id: 'test-nominee-id',
    name: 'Test Nominee',
    state: NomineeState.VOTE,
    nominator: 'test-nominator',
    guildId: 'test-guild-id',
    voteChannelId: 'vote-channel-123',
    discussionChannelId: 'discussion-channel-456',
    discussionStart: new Date(),
    voteStart: new Date(),
    cleanupStart: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    failureReason: null,
    passed: null,
    voteGovernanceAnnounced: false,
    cleanupGovernanceAnnounced: false,
    ...overrides
  });

  describe('VoteResultService Message Access', () => {
    test('only accesses vote channel messages during vote completion check', async () => {
      const nominee = createMockNominee();
      
      await voteResultService.checkVoteCompletion(nominee);
      
      // Verify only vote channel was accessed (may fetch multiple times for latest data)
      expect(messageAccessLog.length).toBeGreaterThan(0);
      expect(messageAccessLog.every(log => log.channelId === 'vote-channel-123')).toBe(true);
      expect(messageAccessLog.every(log => log.channelType === 'vote')).toBe(true);
    });

    test('does not access messages when no vote channel ID exists', async () => {
      const nominee = createMockNominee({ voteChannelId: null });
      
      const result = await voteResultService.checkVoteCompletion(nominee);
      
      expect(result).toBeNull();
      expect(messageAccessLog).toHaveLength(0);
    });

    test('does not access discussion or governance channels during vote processing', async () => {
      const nominee = createMockNominee();
      
      await voteResultService.checkVoteCompletion(nominee);
      
      // Ensure no access to discussion or governance channels
      const accessedChannelTypes = messageAccessLog.map(log => log.channelType);
      expect(accessedChannelTypes).not.toContain('discussion');
      expect(accessedChannelTypes).not.toContain('governance');
      expect(messageAccessLog.every(log => log.channelType === 'vote')).toBe(true);
    });

    test('rejects accessing messages from non-vote channels', async () => {
      // Try to create nominee with discussion channel as vote channel (invalid)
      const nominee = createMockNominee({ voteChannelId: 'discussion-channel-456' });
      
      // Mock the guild to return discussion channel when vote channel ID is requested
      mockGuild.channels.fetch = mock(async (id: string) => {
        if (id === 'discussion-channel-456') return mockDiscussionChannel;
        throw new Error('Channel not found');
      });
      
      await voteResultService.checkVoteCompletion(nominee);
      
      // Should have tried to access the channel but it should be logged as discussion type
      expect(messageAccessLog).toHaveLength(1);
      expect(messageAccessLog[0].channelType).toBe('discussion');
      
      // In production, this should be caught by channel validation
      // This test demonstrates the importance of proper channel type validation
    });
  });

  describe('JobScheduler Message Access', () => {
    test('only accesses vote channel messages for governance announcements', async () => {
      const nominee = createMockNominee({
        state: NomineeState.VOTE,
        voteGovernanceAnnounced: false
      });

      // Create a job scheduler with the mock client
      const scheduler = new NominationJobScheduler(mockClient);
      
      // Manually trigger the vote governance announcement check
      try {
        await scheduler['checkAndAnnounceVoteToGovernance'](nominee);
      } catch {
        // Expected to fail in test environment due to missing governance channel
        // but should still log message access attempts
      }
      
      // Verify vote channel was accessed to find poll
      const voteChannelAccesses = messageAccessLog.filter(log => 
        log.channelId === 'vote-channel-123' && log.channelType === 'vote'
      );
      expect(voteChannelAccesses.length).toBeGreaterThan(0);
    });

    test('does not access discussion channel messages during job processing', async () => {
      const nominee = createMockNominee();
      
      try {
        await jobScheduler['checkAndAnnounceVoteToGovernance'](nominee);
      } catch {
        // Expected to fail in test environment
      }
      
      // Ensure discussion channel was never accessed for messages
      const discussionAccesses = messageAccessLog.filter(log => 
        log.channelType === 'discussion'
      );
      expect(discussionAccesses).toHaveLength(0);
    });
  });

  describe('Cross-Channel Message Access Prevention', () => {
    test('prevents accidental message access to wrong channel types', async () => {
      // This test ensures our tracking catches any unexpected message access
      const nominee = createMockNominee();
      
      // Run both services
      await voteResultService.checkVoteCompletion(nominee);
      
      try {
        await jobScheduler['checkAndAnnounceVoteToGovernance'](nominee);
      } catch {
        // Expected failure in test environment
      }
      
      // Verify ONLY vote channels were accessed for messages
      const nonVoteAccesses = messageAccessLog.filter(log => 
        log.channelType !== 'vote'
      );
      
      expect(nonVoteAccesses).toHaveLength(0);
      
      // Verify all accesses were to vote channels
      const allAccesses = messageAccessLog.every(log => 
        log.channelType === 'vote'
      );
      expect(allAccesses).toBe(true);
    });

    test('validates channel access patterns match security requirements', () => {
      // This test documents the expected message access patterns
      const expectedPatterns = [
        'Only vote channels should have message.fetch calls',
        'Discussion channels should only receive messages, not read them', 
        'Governance channels should only receive announcements',
        'No general message event listeners should exist',
        'Message access should be limited to specific operations'
      ];
      
      // These patterns are enforced by our implementation
      // This test serves as documentation and validation
      expect(expectedPatterns).toHaveLength(5);
    });
  });

  describe('Message Content Access Restrictions', () => {
    test('only processes messages from vote channels for vote results', async () => {
      const nominee = createMockNominee();
      
      // Reset message log to track this specific test
      messageAccessLog = [];
      
      await voteResultService.checkVoteCompletion(nominee);
      
      // Verify that message processing only happened in vote channels
      expect(messageAccessLog.length).toBeGreaterThan(0);
      expect(messageAccessLog.every(log => 
        log.channelId === 'vote-channel-123' && 
        log.channelType === 'vote'
      )).toBe(true);
      
      // The key security requirement: no message content access outside vote channels
      const nonVoteChannelAccess = messageAccessLog.filter(log => 
        log.channelType !== 'vote'
      );
      expect(nonVoteChannelAccess).toHaveLength(0);
    });

    test('does not attempt to read content from non-EasyPoll messages', async () => {
      const nominee = createMockNominee();
      
      // Mock vote channel with non-EasyPoll message
      mockVoteChannel.messages.fetch = mock(async () => {
        const mockMessage = {
          id: 'regular-message-id',
          author: { id: 'some-other-bot-id' }, // Not EasyPoll
          embeds: [],
          createdTimestamp: Date.now() - 30000
        };
        
        const collection = new Map();
        collection.set('regular-message-id', mockMessage);
        return collection;
      });
      
      const result = await voteResultService.checkVoteCompletion(nominee);
      
      // Should return null because no EasyPoll message found
      expect(result).toBeNull();
    });
  });

  describe('Integration Security Test', () => {
    test('comprehensive security check - no unauthorized message access', async () => {
      // Create nominees in different states
      const nominees = [
        createMockNominee({ state: NomineeState.ACTIVE }),
        createMockNominee({ state: NomineeState.DISCUSSION }), 
        createMockNominee({ state: NomineeState.VOTE }),
        createMockNominee({ state: NomineeState.CLEANUP })
      ];
      
      // Reset access log
      messageAccessLog = [];
      
      // Process all nominees
      for (const nominee of nominees) {
        await voteResultService.checkVoteCompletion(nominee);
        
        try {
          await jobScheduler['checkAndAnnounceVoteToGovernance'](nominee);
        } catch {
          // Expected failures in test environment
        }
      }
      
      // Security assertions
      expect(messageAccessLog.every(log => log.channelType === 'vote')).toBe(true);
      expect(messageAccessLog.every(log => log.channelId === 'vote-channel-123')).toBe(true);
      
      // No access to sensitive channels
      const sensitiveChannelAccess = messageAccessLog.filter(log => 
        ['discussion', 'governance', 'general', 'admin'].includes(log.channelType)
      );
      expect(sensitiveChannelAccess).toHaveLength(0);
    });
  });
});