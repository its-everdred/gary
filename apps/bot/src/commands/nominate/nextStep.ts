import type { ChatInputCommandInteraction } from 'discord.js';
import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ConfigService } from '../../lib/configService.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { NominationJobScheduler } from '../../lib/jobScheduler.js';
import { NOMINATION_CONFIG } from '../../lib/constants.js';
import { TimestampUtils } from '../../lib/timestampUtils.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Advances the nomination pipeline to its next phase, either immediately or,
 * when `hours` is given, by overwriting the current phase's end time so the
 * scheduler performs the transition X hours from now.
 *
 *   (no current nominee) → start discussion for the top queued nominee
 *   DISCUSSION           → start the vote
 *   VOTE                 → rejected (a live vote cannot be advanced)
 *   CLEANUP              → finish cleanup and start whatever is next
 */
export async function handleNextStepCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();

    const modValidation = await CommandUtils.validateModeratorAccess(
      interaction,
      guildId
    );
    if (!modValidation.isValid) {
      return;
    }

    const hours = interaction.options.getNumber('hours');
    if (hours !== null && hours <= 0) {
      await CommandUtils.replyWithError(
        interaction,
        'Hours must be a positive number.'
      );
      return;
    }

    // The nominee currently moving through the pipeline, or the top of the
    // queue when nothing is in progress.
    const nominee =
      (await NomineeStateManager.getCurrentNomineeInProgress(guildId)) ??
      (await NomineeStateManager.getNextNomineeForDiscussion(guildId));

    if (!nominee) {
      await CommandUtils.replyWithError(
        interaction,
        'There are no nominees to advance.'
      );
      return;
    }

    await interaction.deferReply({ flags: 64 });

    switch (nominee.state) {
      case NomineeState.ACTIVE:
        await advanceToDiscussion(interaction, nominee, hours);
        break;
      case NomineeState.DISCUSSION:
        await advanceToVote(interaction, nominee, hours);
        break;
      case NomineeState.VOTE:
        await interaction.editReply(
          `❌ **${nominee.name}** is in an active vote, which can't be advanced. ` +
            'The vote must finish on its own.'
        );
        break;
      case NomineeState.CLEANUP:
        await advanceToCleanup(interaction, nominee, hours);
        break;
      default:
        await interaction.editReply(
          `❌ **${nominee.name}** is in ${nominee.state} state and can't be advanced.`
        );
    }
  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'mod nominate next-step',
      'advancing the nomination'
    );
  }
}

/**
 * ACTIVE → DISCUSSION (immediately, or scheduled X hours out)
 */
async function advanceToDiscussion(
  interaction: ChatInputCommandInteraction,
  nominee: Nominee,
  hours: number | null
): Promise<void> {
  const jobScheduler = NominationJobScheduler.getInstance(interaction.client);

  if (hours === null) {
    await jobScheduler.transitionToDiscussion(nominee);
    await interaction.editReply(
      `✅ Discussion started for **${nominee.name}**.`
    );
    return;
  }

  const discussionStart = new Date(Date.now() + hours * HOUR_MS);
  const voteStart = new Date(
    discussionStart.getTime() +
      NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES * MINUTE_MS
  );
  const cleanupStart = new Date(
    voteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * MINUTE_MS
  );

  await prisma.nominee.update({
    where: { id: nominee.id },
    data: { discussionStart, voteStart, cleanupStart },
  });

  await interaction.editReply(
    `✅ Discussion for **${nominee.name}** will start ${formatWhen(
      discussionStart,
      hours
    )}.`
  );
}

/**
 * DISCUSSION → VOTE (immediately, or scheduled X hours out)
 */
async function advanceToVote(
  interaction: ChatInputCommandInteraction,
  nominee: Nominee,
  hours: number | null
): Promise<void> {
  const jobScheduler = NominationJobScheduler.getInstance(interaction.client);

  if (hours === null) {
    await jobScheduler.transitionToVote(nominee);
    await interaction.editReply(
      `✅ Vote started for **${nominee.name}**.`
    );
    return;
  }

  const voteStart = new Date(Date.now() + hours * HOUR_MS);
  const cleanupStart = new Date(
    voteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * MINUTE_MS
  );

  await prisma.nominee.update({
    where: { id: nominee.id },
    data: { voteStart, cleanupStart },
  });

  await interaction.editReply(
    `✅ Vote for **${nominee.name}** will start ${formatWhen(voteStart, hours)}.`
  );
}

/**
 * CLEANUP → PAST (immediately, or scheduled X hours out)
 */
async function advanceToCleanup(
  interaction: ChatInputCommandInteraction,
  nominee: Nominee,
  hours: number | null
): Promise<void> {
  const jobScheduler = NominationJobScheduler.getInstance(interaction.client);

  if (hours === null) {
    const result = await jobScheduler.performPostCleanupCleanup(nominee);
    if (result.success) {
      await interaction.editReply(
        `✅ Cleanup completed for **${nominee.name}**. Channels removed and the next nominee started if one is queued.`
      );
    } else {
      await interaction.editReply(
        `❌ Cleanup failed for **${nominee.name}**: ${result.errorMessage}`
      );
    }
    return;
  }

  // The scheduler runs cleanup at cleanupStart + CLEANUP_DURATION, so anchor
  // cleanupStart backwards to land the transition X hours from now.
  const cleanupAt = new Date(Date.now() + hours * HOUR_MS);
  const cleanupStart = new Date(
    cleanupAt.getTime() - NOMINATION_CONFIG.CLEANUP_DURATION_MINUTES * MINUTE_MS
  );

  await prisma.nominee.update({
    where: { id: nominee.id },
    data: { cleanupStart },
  });

  await interaction.editReply(
    `✅ **${nominee.name}** will be cleaned up ${formatWhen(cleanupAt, hours)}.`
  );
}

function formatWhen(when: Date, hours: number): string {
  const label = `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `in ${label} (${TimestampUtils.formatDiscordTimestamp(when, 'F')})`;
}
