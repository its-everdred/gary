import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { NomineeState } from '@prisma/client';

const mockPrisma = {
  nominee: {
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({ id: 'test-id' })),
    update: mock(() => Promise.resolve({ id: 'test-id' })),
    delete: mock(() => Promise.resolve())
  }
};

mock.module('../lib/db.js', () => ({ prisma: mockPrisma }));

const { nominateHandler } = await import('../commands/nominate.js');

function createMockNominateInteraction(subcommand: string, options: Record<string, any> = {}): ChatInputCommandInteraction {
  return {
    options: {
      getSubcommand: mock(() => subcommand),
      getString: mock((name: string) => options[name] || null),
      getUser: mock((name: string) => options[name] || null)
    },
    user: { id: 'user-123', username: 'user-123' },
    reply: mock(() => Promise.resolve())
  } as any;
}

describe('nominate command', () => {
  beforeEach(() => {
    mockPrisma.nominee.findMany.mockReset();
    mockPrisma.nominee.findUnique.mockReset();
    mockPrisma.nominee.create.mockReset();
    mockPrisma.nominee.update.mockReset();
    mockPrisma.nominee.delete.mockReset();
    
    process.env.GUILD_ID = 'test-guild-123';
  });

  describe('list subcommand', () => {
    test('displays empty list when no nominations exist', async () => {
      mockPrisma.nominee.findMany.mockReturnValue(Promise.resolve([]));
      const mockInteraction = createMockNominateInteraction('list');

      await nominateHandler(mockInteraction);

      expect(mockPrisma.nominee.findMany).toHaveBeenCalledWith({
        where: {
          guildId: 'test-guild-123',
          state: { not: NomineeState.PAST }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '**Current Nominations:** None',
        flags: 64
      });
    });

    test('displays active nominations with proper formatting', async () => {
      const mockNominees = [
        {
          name: 'John Doe',
          state: NomineeState.ACTIVE,
          nominator: 'Alice',
          discussionStart: new Date('2024-01-15T14:00:00Z'),
          voteStart: null,
          certifyStart: null,
          createdAt: new Date('2024-01-10T10:00:00Z')
        },
        {
          name: 'Jane Smith',
          state: NomineeState.ACTIVE,
          nominator: 'Bob',
          discussionStart: new Date('2024-01-22T14:00:00Z'),
          voteStart: null,
          certifyStart: null,
          createdAt: new Date('2024-01-12T10:00:00Z')
        }
      ];

      mockPrisma.nominee.findMany.mockReturnValue(Promise.resolve(mockNominees));
      const mockInteraction = createMockNominateInteraction('list');

      await nominateHandler(mockInteraction);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall.content).toContain('1. John Doe - Discussion begins');
      expect(replyCall.content).toContain('2. Jane Smith - Discussion begins');
      expect(replyCall.flags).toBe(64); // EPHEMERAL
    });

    test('displays nominations in different states with correct order', async () => {
      const mockNominees = [
        {
          name: 'Active User',
          state: NomineeState.ACTIVE,
          nominator: 'Alice',
          discussionStart: new Date('2024-01-15T14:00:00Z'),
          voteStart: null,
          certifyStart: null,
          createdAt: new Date('2024-01-10T10:00:00Z')
        },
        {
          name: 'Discussion User',
          state: NomineeState.DISCUSSION,
          nominator: 'Bob',
          discussionStart: new Date('2024-01-15T14:00:00Z'),
          voteStart: new Date('2024-01-17T14:00:00Z'),
          certifyStart: null,
          createdAt: new Date('2024-01-12T10:00:00Z')
        },
        {
          name: 'Voting User',
          state: NomineeState.VOTE,
          nominator: 'Carol',
          discussionStart: new Date('2024-01-15T14:00:00Z'),
          voteStart: new Date('2024-01-17T14:00:00Z'),
          certifyStart: new Date('2024-01-22T14:00:00Z'),
          createdAt: new Date('2024-01-14T10:00:00Z')
        }
      ];

      mockPrisma.nominee.findMany.mockReturnValue(Promise.resolve(mockNominees));
      const mockInteraction = createMockNominateInteraction('list');

      await nominateHandler(mockInteraction);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall.content).toContain('1. Active User - Discussion begins');
      expect(replyCall.content).toContain('2. Discussion User - Vote begins');
      expect(replyCall.content).toContain('3. Voting User - Vote until');
    });

    test('handles database errors gracefully', async () => {
      mockPrisma.nominee.findMany.mockRejectedValue(new Error('Database error'));
      const mockInteraction = createMockNominateInteraction('list');

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while fetching the nominations list.',
        flags: 64
      });
    });
  });

  describe('name subcommand', () => {
    test('creates new nomination successfully', async () => {
      const mockInteraction = createMockNominateInteraction('name', { name: 'John Doe' });
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve(null));
      mockPrisma.nominee.create.mockReturnValue(Promise.resolve({ id: 'test-id-123' }));

      await nominateHandler(mockInteraction);

      expect(mockPrisma.nominee.findUnique).toHaveBeenCalledWith({
        where: {
          guildId_name: {
            guildId: 'test-guild-123',
            name: 'John Doe'
          }
        }
      });

      expect(mockPrisma.nominee.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          state: NomineeState.ACTIVE,
          nominator: 'user-123',
          guildId: 'test-guild-123',
          discussionStart: null
        }
      });

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'John Doe has been nominated for GA membership. They will be added to the nomination queue.',
        flags: 64
      });
    });

    test('rejects nomination for existing nominee', async () => {
      const mockInteraction = createMockNominateInteraction('name', { name: 'Existing User' });
      mockPrisma.nominee.findUnique.mockReturnValue(Promise.resolve({
        id: 'existing-id',
        state: NomineeState.ACTIVE
      }));

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Existing User is already nominated and in active state.',
        flags: 64
      });
    });

    test('validates name length', async () => {
      const mockInteraction = createMockNominateInteraction('name', { name: 'A' });

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Nominee name must be between 2 and 100 characters.',
        flags: 64
      });
    });

    test('handles moderator nomination placeholder', async () => {
      const mockInteraction = createMockNominateInteraction('name', { 
        name: 'John Doe',
        nominator: { id: 'mod-user-456' }
      });

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Moderator nomination feature not yet implemented.',
        flags: 64
      });
    });
  });

  describe('unimplemented subcommands', () => {

    test('returns not implemented message for remove subcommand', async () => {
      const mockInteraction = createMockNominateInteraction('remove', { name: 'Test User' });

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This nomination command is not yet implemented.',
        flags: 64
      });
    });

    test('returns not implemented message for start subcommand', async () => {
      const mockInteraction = createMockNominateInteraction('start', { name: 'Test User' });

      await nominateHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This nomination command is not yet implemented.',
        flags: 64
      });
    });
  });
});