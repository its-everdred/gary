import { describe, test, expect, beforeEach } from 'bun:test';
import { ChannelType } from 'discord.js';
import { PruneService } from '../lib/pruneService.js';

// Privacy guarantee: the membership scan must work from message *metadata*
// (author + timestamp) alone and never read message content. These messages
// expose `content` as a throwing getter, so any code path that reads it fails
// the test loudly.
function contentTrapMessage(id: string, authorId: string, ts: number) {
  return {
    id,
    author: { id: authorId, bot: false, username: authorId },
    createdTimestamp: ts,
    get content(): string {
      throw new Error('privacy violation: message.content was read');
    },
    get embeds(): unknown[] {
      throw new Error('privacy violation: message.embeds was read');
    },
  };
}

function makeChannel(id: string, messages: ReturnType<typeof contentTrapMessage>[]) {
  return {
    id,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    messages: {
      fetch: async ({ limit, before }: { limit: number; before?: string }) => {
        let start = 0;
        if (before) start = messages.findIndex((m) => m.id === before) + 1;
        const page = messages.slice(start, start + limit);
        return new Map(page.map((m) => [m.id, m]));
      },
    },
  };
}

function makeService(channels: any[]) {
  const me = { id: 'gary' };
  const guild = {
    id: 'g',
    members: { me, fetch: async () => new Map(), fetchMe: async () => me },
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
  };
  const client = {
    guilds: { fetch: async () => guild },
    // No Server Members Intent -> fallback (message-author) scan.
    options: { intents: { has: () => false } },
  } as any;
  return new PruneService(client);
}

const DAY = 24 * 60 * 60 * 1000;

describe('privacy: prune scan never reads message content', () => {
  beforeEach(() => {
    process.env.PRUNE_WEEKS = '6';
  });

  test('scans authors/timestamps without touching content or embeds', async () => {
    const now = Date.now();
    const service = makeService([
      makeChannel('c1', [
        contentTrapMessage('m1', 'recent', now - 5 * DAY),
        contentTrapMessage('m2', 'dormant', now - 60 * DAY),
      ]),
    ]);

    // Completes without the content/embeds getters throwing.
    const result = await service.getInactiveMembers('g');
    expect(result.members.map((m) => m.userId)).toEqual(['dormant']);
  });
});
