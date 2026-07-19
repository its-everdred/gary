import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Provide the env ConfigService reads. We only mock CommandUtils (to force
// the permission-denied path); PruneService is intentionally NOT mocked
// because the reject path returns before the service is ever constructed,
// and a global module mock would leak into pruneService.test.ts.
process.env.GUILD_ID = process.env.GUILD_ID || 'test-guild';
process.env.PRUNE_WEEKS = '6';

const validateModeratorAccess = mock(async () => ({ isValid: true }) as any);
const handleCommandError = mock(async () => {});

mock.module('../lib/commandUtils.js', () => ({
  CommandUtils: { validateModeratorAccess, handleCommandError },
}));

const { buildPruneReport, handlePurgeCheckCommand } = await import(
  '../commands/purge/check.js'
);

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

const NOW = utc(2026, 7, 18);

describe('buildPruneReport', () => {
  test('formats a numbered PRUNE ALERT list with dates and ages', () => {
    const messages = buildPruneReport(
      [
        { userId: '1', displayName: 'everdred', lastMessageAt: utc(2025, 7, 2) },
        {
          userId: '2',
          displayName: 'testingNamezz',
          lastMessageAt: utc(2025, 6, 1),
        },
      ],
      6,
      NOW
    );
    expect(messages).toHaveLength(1);
    const body = messages[0];
    expect(body).toContain('PRUNE ALERT');
    expect(body).toContain('2 members inactive for 6+ weeks');
    expect(body).toContain('1. everdred');
    expect(body).toContain('2. testingNamezz');
    expect(body).toContain('July 2, 2025 (12 months, 2 weeks)');
  });

  test('renders members with no recent posts as "No posts in N+ weeks"', () => {
    const messages = buildPruneReport(
      [{ userId: '3', displayName: 'lurker', lastMessageAt: null }],
      6,
      NOW
    );
    expect(messages[0]).toContain('lurker');
    expect(messages[0]).toContain('No posts in 6+ weeks');
  });

  test('returns a friendly message when nobody is inactive', () => {
    const messages = buildPruneReport([], 6, NOW);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('No members have been inactive');
  });

  test('splits large lists into multiple sub-2000-char messages', () => {
    const members = Array.from({ length: 120 }, (_, i) => ({
      userId: `${i}`,
      displayName: `member_with_a_longish_name_${i}`,
      lastMessageAt: utc(2025, 6, 1),
    }));
    const messages = buildPruneReport(members, 6, NOW);
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.length).toBeLessThan(2000);
    }
  });
});

describe('handlePurgeCheckCommand', () => {
  beforeEach(() => {
    handleCommandError.mockClear();
  });

  test('rejects non-moderators before scanning', async () => {
    validateModeratorAccess.mockResolvedValueOnce({ isValid: false });
    const interaction = {
      client: {},
      deferReply: mock(async () => {}),
      editReply: mock(async () => {}),
      followUp: mock(async () => {}),
    };

    await handlePurgeCheckCommand(interaction as any);

    // Denied before deferring/scanning — deferReply is the first thing the
    // handler does after passing validation.
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(handleCommandError).not.toHaveBeenCalled();
  });
});
