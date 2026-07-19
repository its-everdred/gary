import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { NomineeState } from '@prisma/client';
import {
  setupModuleMocks,
  resetAllMocks,
  mockPrisma,
  mockJobScheduler,
  createMockInteraction,
  createMockNominee,
} from './mocks';

setupModuleMocks();

// Bypass the moderator permission gate so these tests exercise routing.
const validateModeratorAccess = mock(async () => ({ isValid: true }) as any);
const replyWithError = mock(async () => {});
const handleCommandError = mock(async () => {});
mock.module('../lib/commandUtils.js', () => ({
  CommandUtils: { validateModeratorAccess, replyWithError, handleCommandError },
}));

const { handleNextStepCommand } = await import(
  '../commands/nominate/nextStep.js'
);

describe('next-step in the VOTE phase', () => {
  let interaction: any;

  beforeEach(() => {
    resetAllMocks();
    validateModeratorAccess.mockClear();
    validateModeratorAccess.mockResolvedValue({ isValid: true });
    interaction = createMockInteraction();
  });

  afterEach(() => {
    resetAllMocks();
  });

  function voteNominee() {
    return createMockNominee({
      id: 'n1',
      name: 'chester',
      state: NomineeState.VOTE,
    });
  }

  test('rejects the hours option for an active vote', async () => {
    mockPrisma.nominee.findFirst.mockResolvedValue(voteNominee());
    interaction.options.getNumber.mockReturnValue(5); // hours provided

    await handleNextStepCommand(interaction);

    expect(mockJobScheduler.forceVoteToCleanup).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('can only be advanced immediately')
    );
  });

  test('forces cleanup and reports when no finished vote exists', async () => {
    mockPrisma.nominee.findFirst.mockResolvedValue(voteNominee());
    interaction.options.getNumber.mockReturnValue(null); // immediate
    mockJobScheduler.forceVoteToCleanup.mockResolvedValue({
      success: true,
      tallied: false,
    });

    await handleNextStepCommand(interaction);

    expect(mockJobScheduler.forceVoteToCleanup).toHaveBeenCalled();
    const reply = interaction.editReply.mock.calls.at(-1)?.[0] as string;
    expect(reply).toContain('No finished vote was found');
    expect(reply).toContain('cleanup');
  });

  test('reports a tally when a finished poll exists', async () => {
    mockPrisma.nominee.findFirst.mockResolvedValue(voteNominee());
    interaction.options.getNumber.mockReturnValue(null);
    mockJobScheduler.forceVoteToCleanup.mockResolvedValue({
      success: true,
      tallied: true,
    });

    await handleNextStepCommand(interaction);

    const reply = interaction.editReply.mock.calls.at(-1)?.[0] as string;
    expect(reply).toContain('Tallied the finished poll');
  });
});
