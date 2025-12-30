import { mock } from 'bun:test';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

/**
 * Centralized test utilities and mock factories
 * Use these instead of creating individual mocks in each test file
 */

// Standard Prisma mock
export const createMockPrisma = () => ({
  nominee: {
    findFirst: mock(() => Promise.resolve(null)),
    findMany: mock(() => Promise.resolve([])),
    update: mock(() => Promise.resolve()),
    create: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve())
  },
  flag: {
    findFirst: mock(() => Promise.resolve(null)),
    findMany: mock(() => Promise.resolve([])),
    create: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve())
  }
});

// Standard ConfigService mock
export const createMockConfigService = () => ({
  ConfigService: {
    getVoteQuorumPercent: mock(() => 0.4), // 40% quorum
    getKickQuorumPercent: mock(() => 0.4),
    getGovernanceChannelId: mock(() => 'governance-123'),
    getGeneralChannelId: mock(() => 'general-123'),
    getModFlagChannelId: mock(() => 'mod-flag-123'),
    getModCommsChannelId: mock(() => 'mod-comms-123'),
    getNominationsCategoryId: mock(() => 'category-123'),
    getGuildId: mock(() => 'test-guild-123'),
    getLogLevel: mock(() => 'info')
  }
});

// Standard Constants mock
export const createMockConstants = () => ({
  NOMINATION_CONFIG: {
    VOTE_PASS_THRESHOLD: 0.8, // 80% yes votes to pass
    VOTE_DURATION_MINUTES: 7200,
    CLEANUP_DURATION_MINUTES: 1440,
    DISCUSSION_DURATION_MINUTES: 2880,
    DISCUSSION_START_DAY: 1,
    DISCUSSION_START_HOUR: 9,
    DISCUSSION_START_TIMEZONE: 'America/New_York',
    get VOTE_PASS_PERCENT() {
      return Math.round(this.VOTE_PASS_THRESHOLD * 100);
    },
    get CLEANUP_PERIOD_TEXT() {
      const minutes = this.CLEANUP_DURATION_MINUTES;
      if (minutes >= 1440) {
        const days = Math.round(minutes / 1440);
        return days === 1 ? '24 hours' : `${days} days`;
      }
      return `${minutes} minutes`;
    },
    CHANNEL_PREFIXES: {
      DISCUSSION: 'discussion-',
      VOTE: 'vote-'
    }
  }
});

// Standard Discord.js mocks
export const createMockDiscordMessage = () => ({
  id: 'mock-message-id',
  author: { id: 'bot-id' },
  embeds: [{ data: { title: 'test' } }],
  content: 'Voting will commence at some time',
  edit: mock(() => Promise.resolve()),
  delete: mock(() => Promise.resolve())
});

export const createMockDiscordChannel = () => {
  const mockMessage = createMockDiscordMessage();
  const mockMessagesArray = [mockMessage];
  mockMessagesArray.find = mock(() => mockMessage);

  return {
    id: 'mock-channel-id',
    name: 'mock-channel',
    type: 0, // GUILD_TEXT
    isTextBased: () => true,
    messages: {
      fetchPinned: mock(() => Promise.resolve(new Map())),
      fetch: mock(() => Promise.resolve(mockMessagesArray))
    },
    send: mock(() => Promise.resolve(mockMessage))
  };
};

export const createMockDiscordGuild = () => ({
  id: 'test-guild-id',
  memberCount: 25,
  channels: {
    cache: new Map(),
    fetch: mock(() => Promise.resolve(createMockDiscordChannel()))
  },
  members: {
    cache: new Map(),
    fetch: mock(() => Promise.resolve(new Map()))
  }
});

export const createMockDiscordClient = () => ({
  guilds: {
    cache: new Map([['test-guild-id', createMockDiscordGuild()]]),
    fetch: mock(() => Promise.resolve(createMockDiscordGuild()))
  },
  channels: {
    fetch: mock(() => Promise.resolve(createMockDiscordChannel()))
  },
  user: { id: 'bot-id' }
});

export const createMockInteraction = () => ({
  deferReply: mock(() => Promise.resolve()),
  editReply: mock(() => Promise.resolve()),
  options: {
    getNumber: mock(() => 10),
    getString: mock(() => 'test-string'),
    getUser: mock(() => ({ id: 'user-123', username: 'testuser' }))
  },
  guildId: 'test-guild-123',
  client: createMockDiscordClient(),
  user: { id: 'user-123', username: 'testuser' }
});

// Standard Nominee factory
export const createMockNominee = (overrides: Partial<Nominee> = {}): Nominee => ({
  id: 'test-nominee-id',
  name: 'Test Nominee',
  state: NomineeState.ACTIVE,
  nominator: 'nominator-user-id',
  guildId: 'test-guild-id',
  discussionStart: new Date(),
  voteStart: new Date(),
  cleanupStart: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  discussionChannelId: 'discussion-channel-id',
  voteChannelId: 'vote-channel-id',
  votePollMessageId: null,
  voteYesCount: 0,
  voteNoCount: 0,
  votePassed: null,
  botMessageIds: null,
  voteGovernanceAnnounced: false,
  announcementMessageIds: null,
  ...overrides
});

// Mock JobScheduler
export const createMockJobScheduler = () => ({
  start: mock(() => {}),
  stop: mock(() => {}),
  isRunning: mock(() => false),
  transitionToVote: mock(() => Promise.resolve()),
  transitionToCleanup: mock(() => Promise.resolve()),
  transitionToPast: mock(() => Promise.resolve())
});

// Utility to setup module mocks - call this in test files
export const setupStandardMocks = () => {
  const mockPrisma = createMockPrisma();
  const mockConfigService = createMockConfigService();
  const mockConstants = createMockConstants();
  const mockJobScheduler = createMockJobScheduler();

  mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));
  mock.module('../lib/configService.js', () => mockConfigService);
  mock.module('../lib/constants.js', () => mockConstants);
  mock.module('../lib/jobScheduler.js', () => ({ 
    NominationJobScheduler: mock(() => mockJobScheduler)
  }));
  
  // Common utility mocks
  mock.module('../lib/timeCalculation.js', () => ({
    TimeCalculationService: {
      getNextMondayAt9AM: mock(() => new Date())
    }
  }));

  mock.module('../lib/timestampUtils.js', () => ({
    TimestampUtils: {
      formatDiscordTimestamp: mock(() => 'formatted-timestamp')
    }
  }));

  mock.module('discord.js', () => ({
    EmbedBuilder: {
      from: mock(() => ({
        setFields: mock(() => ({
          setTimestamp: mock(() => ({}))
        }))
      }))
    }
  }));

  mock.module('pino', () => ({
    default: () => ({
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {}
    })
  }));

  return { mockPrisma, mockConfigService, mockConstants, mockJobScheduler };
};