import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ChannelType } from 'discord.js';
import { PruneService } from '../lib/pruneService.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const RECENT = NOW - 5 * DAY; // within 6 weeks -> active
const OLD = NOW - 60 * DAY; // older than 6 weeks -> inactive
const OLDER = NOW - 90 * DAY;

function msg(id: string, authorId: string, ts: number, bot = false) {
  return { id, author: { id: authorId, bot }, createdTimestamp: ts };
}

// messages must be provided newest -> oldest
function makeChannel(
  id: string,
  messages: ReturnType<typeof msg>[],
  { readable = true, type = ChannelType.GuildText } = {}
) {
  return {
    id,
    type,
    permissionsFor: () => ({ has: () => readable }),
    messages: {
      fetch: async ({ limit, before }: { limit: number; before?: string }) => {
        let start = 0;
        if (before) {
          start = messages.findIndex((m) => m.id === before) + 1;
        }
        const page = messages.slice(start, start + limit);
        return new Map(page.map((m) => [m.id, m]));
      },
    },
  };
}

function makeMember(
  id: string,
  { bot = false, username }: { bot?: boolean; username?: string } = {}
) {
  return {
    id,
    displayName: username ?? id,
    user: { bot, username: username ?? id },
  };
}

function makeService(channels: any[], members: any[]) {
  const me = { id: 'gary' };
  const guild = {
    id: 'g',
    members: {
      me,
      fetch: async () => new Map(members.map((m) => [m.id, m])),
      fetchMe: async () => me,
    },
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
  };
  const client = { guilds: { fetch: async () => guild } } as any;
  return new PruneService(client);
}

describe('PruneService.getInactiveMembers', () => {
  const originalPruneWeeks = process.env.PRUNE_WEEKS;

  beforeEach(() => {
    process.env.PRUNE_WEEKS = '6';
  });

  afterEach(() => {
    if (originalPruneWeeks === undefined) delete process.env.PRUNE_WEEKS;
    else process.env.PRUNE_WEEKS = originalPruneWeeks;
  });

  test('excludes members with a recent message', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'active', RECENT)])],
      [makeMember('active')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result).toEqual([]);
  });

  test('includes a member whose newest message is older than the cutoff', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'dormant', OLD)])],
      [makeMember('dormant')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('dormant');
    expect(result[0].lastMessageAt?.getTime()).toBe(OLD);
  });

  test('includes a member with no messages as never-posted', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'active', RECENT)])],
      [makeMember('active'), makeMember('lurker')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result.map((r) => r.userId)).toEqual(['lurker']);
    expect(result[0].lastMessageAt).toBeNull();
  });

  test('excludes bots from roster and ignores bot messages', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'botuser', OLD, true)])],
      [makeMember('botuser', { bot: true })]
    );
    const result = await service.getInactiveMembers('g');
    expect(result).toEqual([]);
  });

  test('takes the newest message across channels (recent wins -> excluded)', async () => {
    const service = makeService(
      [
        makeChannel('c1', [msg('m1', 'e', OLD)]),
        makeChannel('c2', [msg('m2', 'e', RECENT)]),
      ],
      [makeMember('e')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result).toEqual([]);
  });

  test('takes the newest message across channels for inactive members', async () => {
    const service = makeService(
      [
        makeChannel('c1', [msg('m1', 'f', OLDER)]),
        makeChannel('c2', [msg('m2', 'f', OLD)]),
      ],
      [makeMember('f')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result[0].lastMessageAt?.getTime()).toBe(OLD);
  });

  test('skips unreadable channels without flagging their authors as active', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'hidden', RECENT)], { readable: false })],
      [makeMember('hidden')]
    );
    const result = await service.getInactiveMembers('g');
    // The recent message is in an unreadable channel, so 'hidden' looks never-posted.
    expect(result.map((r) => r.userId)).toEqual(['hidden']);
    expect(result[0].lastMessageAt).toBeNull();
  });

  test('sorts never-posted first, then oldest last-message first', async () => {
    const service = makeService(
      [
        makeChannel('c1', [
          msg('m1', 'old', OLD),
          msg('m2', 'older', OLDER),
        ]),
      ],
      [
        makeMember('old'),
        makeMember('older'),
        makeMember('never'),
      ]
    );
    const result = await service.getInactiveMembers('g');
    expect(result.map((r) => r.userId)).toEqual(['never', 'older', 'old']);
  });

  test('scans all channels regardless of count (paging + concurrency)', async () => {
    const channels = Array.from({ length: 12 }, (_, i) =>
      makeChannel(`c${i}`, [msg(`m${i}`, `u${i}`, OLD)])
    );
    const members = Array.from({ length: 12 }, (_, i) => makeMember(`u${i}`));
    const service = makeService(channels, members);
    const result = await service.getInactiveMembers('g');
    expect(result).toHaveLength(12);
  });
});
