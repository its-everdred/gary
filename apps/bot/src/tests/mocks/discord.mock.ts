import { mock } from 'bun:test';

export const createMockMessage = () => ({
  id: 'mock-message-id',
  author: { id: 'bot-id' },
  embeds: [{ data: { title: 'test' } }],
  content: 'Voting will commence at some time',
  edit: mock(() => Promise.resolve()),
  delete: mock(() => Promise.resolve())
});

export const createMockChannel = () => {
  const mockMessage = createMockMessage();
  const mockMessagesArray = [mockMessage];
  mockMessagesArray.find = mock(() => mockMessage);

  return {
    id: 'mock-channel-id',
    name: 'mock-channel',
    type: 0,
    isTextBased: () => true,
    messages: {
      fetchPinned: mock(() => Promise.resolve(new Map())),
      fetch: mock(() => Promise.resolve(mockMessagesArray))
    },
    send: mock(() => Promise.resolve(mockMessage))
  };
};

export const createMockGuild = () => ({
  id: 'test-guild-id',
  memberCount: 25,
  channels: {
    cache: new Map(),
    fetch: mock(() => Promise.resolve(createMockChannel()))
  },
  members: {
    cache: new Map(),
    fetch: mock(() => Promise.resolve(new Map()))
  }
});

export const createMockClient = () => ({
  guilds: {
    cache: new Map([['test-guild-id', createMockGuild()]]),
    fetch: mock(() => Promise.resolve(createMockGuild()))
  },
  channels: {
    fetch: mock(() => Promise.resolve(createMockChannel()))
  },
  user: { id: 'bot-id' }
});

export const createMockInteraction = () => ({
  deferReply: mock(() => Promise.resolve()),
  editReply: mock(() => Promise.resolve()),
  reply: mock(() => Promise.resolve()),
  deferred: false,
  options: {
    getNumber: mock(() => 10),
    getString: mock(() => 'test-string'),
    getUser: mock(() => ({ id: 'user-123', username: 'testuser' }))
  },
  guildId: 'test-guild-123',
  client: createMockClient(),
  user: { id: 'user-123', username: 'testuser' }
});

// Create a mockable SlashCommandBuilder class that chains properly
class MockSlashCommandBuilder {
  setName = mock(() => this);
  setDescription = mock(() => this);
  addUserOption = mock(() => this);
  addStringOption = mock(() => this);
  toJSON = mock(() => ({}));
}

// Mock Discord Client
class MockClient {
  options = {
    intents: {
      has: mock(() => false)
    }
  };
  
  constructor(options: any) {
    if (options?.intents) {
      this.options.intents.has = mock((intent: any) => {
        return Array.isArray(options.intents) && options.intents.includes(intent);
      });
    }
  }
}

// Mock GatewayIntentBits
export const mockGatewayIntentBits = {
  Guilds: Symbol('Guilds'),
  DirectMessages: Symbol('DirectMessages'),
  MessageContent: Symbol('MessageContent')
};

export const mockDiscordJS = {
  EmbedBuilder: {
    from: mock(() => ({
      setFields: mock(() => ({
        setTimestamp: mock(() => ({}))
      }))
    }))
  },
  SlashCommandBuilder: MockSlashCommandBuilder,
  Client: MockClient,
  GatewayIntentBits: mockGatewayIntentBits
};

export const resetDiscordMocks = (interaction: any, client: any, channel: any, message: any) => {
  if (interaction) {
    interaction.deferReply.mockReset();
    interaction.editReply.mockReset();
    interaction.options.getNumber.mockReset();
    interaction.options.getString.mockReset();
    interaction.options.getUser.mockReset();
  }
  
  if (client?.guilds?.fetch) client.guilds.fetch.mockReset();
  if (client?.channels?.fetch) client.channels.fetch.mockReset();
  
  if (channel?.messages?.fetch) channel.messages.fetch.mockReset();
  if (channel?.messages?.fetchPinned) channel.messages.fetchPinned.mockReset();
  if (channel?.send) channel.send.mockReset();
  
  if (message?.edit) message.edit.mockReset();
  if (message?.delete) message.delete.mockReset();
};