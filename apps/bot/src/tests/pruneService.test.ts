import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ChannelType } from 'discord.js';
import { PruneService } from '../lib/pruneService.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const RECENT = NOW - 5 * DAY; // within 6 weeks -> active
const OLD = NOW - 60 * DAY; // older than 6 weeks -> inactive
const OLDER = NOW - 90 * DAY;

function msg(id: string, authorId: string, ts: number, bot = false) {
  return {
    id,
    author: { id: authorId, bot, username: authorId },
    createdTimestamp: ts,
  };
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

// rosterIntent mirrors the gateway: true only when the bot connected with the
// Server Members Intent, which is what PruneService keys roster mode off of.
function makeService(channels: any[], members: any[] = [], rosterIntent = false) {
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
  const client = {
    guilds: { fetch: async () => guild },
    options: { intents: { has: () => rosterIntent } },
  } as any;
  return new PruneService(client);
}

const originalWeeks = process.env.PRUNE_WEEKS;

beforeEach(() => {
  process.env.PRUNE_WEEKS = '6';
});

afterEach(() => {
  if (originalWeeks === undefined) delete process.env.PRUNE_WEEKS;
  else process.env.PRUNE_WEEKS = originalWeeks;
});

describe('PruneService fallback mode (no member roster)', () => {
  test('reports rosterAvailable = false', async () => {
    const service = makeService([makeChannel('c1', [])]);
    const result = await service.getInactiveMembers('g');
    expect(result.rosterAvailable).toBe(false);
  });

  test('excludes members with a recent message', async () => {
    const service = makeService([
      makeChannel('c1', [msg('m1', 'active', RECENT)]),
    ]);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toEqual([]);
  });

  test('includes a poster whose newest message is older than the cutoff', async () => {
    const service = makeService([
      makeChannel('c1', [msg('m1', 'dormant', OLD)]),
    ]);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toHaveLength(1);
    expect(result.members[0].userId).toBe('dormant');
    expect(result.members[0].displayName).toBe('dormant');
    expect(result.members[0].lastMessageAt?.getTime()).toBe(OLD);
  });

  test('does not include members who never posted', async () => {
    // 'lurker' is in the roster but never posts; without the intent it cannot
    // be seen, so only the dormant poster is reported.
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'dormant', OLD)])],
      [makeMember('dormant'), makeMember('lurker')]
    );
    const result = await service.getInactiveMembers('g');
    expect(result.members.map((m) => m.userId)).toEqual(['dormant']);
  });

  test('takes the newest message across channels (recent wins -> excluded)', async () => {
    const service = makeService([
      makeChannel('c1', [msg('m1', 'e', OLD)]),
      makeChannel('c2', [msg('m2', 'e', RECENT)]),
    ]);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toEqual([]);
  });

  test('ignores bot messages', async () => {
    const service = makeService([
      makeChannel('c1', [msg('m1', 'botuser', OLD, true)]),
    ]);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toEqual([]);
  });

  test('skips unreadable channels', async () => {
    const service = makeService([
      makeChannel('c1', [msg('m1', 'hidden', OLD)], { readable: false }),
    ]);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toEqual([]);
  });

  test('scans all channels regardless of count', async () => {
    const channels = Array.from({ length: 12 }, (_, i) =>
      makeChannel(`c${i}`, [msg(`m${i}`, `u${i}`, OLD)])
    );
    const service = makeService(channels);
    const result = await service.getInactiveMembers('g');
    expect(result.members).toHaveLength(12);
  });
});

describe('PruneService roster mode (Server Members Intent)', () => {
  test('reports rosterAvailable = true', async () => {
    const service = makeService([makeChannel('c1', [])], [makeMember('a')], true);
    const result = await service.getInactiveMembers('g');
    expect(result.rosterAvailable).toBe(true);
  });

  test('includes members who never posted', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'active', RECENT)])],
      [makeMember('active'), makeMember('lurker')],
      true
    );
    const result = await service.getInactiveMembers('g');
    expect(result.members.map((m) => m.userId)).toEqual(['lurker']);
    expect(result.members[0].lastMessageAt).toBeNull();
  });

  test('excludes bots from the roster', async () => {
    const service = makeService(
      [makeChannel('c1', [])],
      [makeMember('botuser', { bot: true })],
      true
    );
    const result = await service.getInactiveMembers('g');
    expect(result.members).toEqual([]);
  });

  test('uses the member display name from the roster', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'u1', OLD)])],
      [makeMember('u1', { username: 'CoolName' })],
      true
    );
    const result = await service.getInactiveMembers('g');
    expect(result.members[0].displayName).toBe('CoolName');
  });

  test('sorts never-posted first, then oldest last-message first', async () => {
    const service = makeService(
      [makeChannel('c1', [msg('m1', 'old', OLD), msg('m2', 'older', OLDER)])],
      [makeMember('old'), makeMember('older'), makeMember('never')],
      true
    );
    const result = await service.getInactiveMembers('g');
    expect(result.members.map((m) => m.userId)).toEqual([
      'never',
      'older',
      'old',
    ]);
  });
});
