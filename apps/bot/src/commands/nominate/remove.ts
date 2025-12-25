import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { CommandUtils } from '../../lib/commandUtils.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { AnnouncementUtils } from '../../lib/announcementUtils.js';

const logger = pino();

export async function handleRemoveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID!;
    const name = interaction.options.getString('name', true).trim();
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Validate moderator permissions
    const modValidation = await CommandUtils.validateModeratorAccess(interaction, guildId);
    if (!modValidation.isValid) {
      return;
    }

    // Find the nominee
    const nominee = await prisma.nominee.findUnique({
      where: {
        guildId_name: {
          guildId,
          name
        }
      }
    });

    if (!nominee) {
      await interaction.reply({
        content: `No nominee found with the name "${name}".`,
        flags: 64
      });
      return;
    }

    if (nominee.state === NomineeState.PAST) {
      await interaction.reply({
        content: `${name} is already in past state and cannot be removed.`,
        flags: 64
      });
      return;
    }

    // Check if nominee is currently in DISCUSSION, VOTE, or CERTIFY state
    const inProgressStates: NomineeState[] = [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY];
    const wasInProgress = inProgressStates.includes(nominee.state);

    // Remove the nominee
    await prisma.nominee.delete({
      where: {
        guildId_name: {
          guildId,
          name
        }
      }
    });

    // Recalculate schedules for all remaining active nominees
    await recalculateRemainingNominees(guildId, name);

    // Send announcement to governance channel
    await announceNomineeRemoval(interaction.client, guildId, name, nominee.state, username);

    await interaction.reply({
      content: `${name} has been removed from the nominations list. Schedules updated for remaining nominees.`,
      flags: 64
    });

    logger.info({
      nomineeId: nominee.id,
      name,
      previousState: nominee.state,
      moderator: username,
      user: userId,
      wasInProgress
    }, 'Nominee removed by moderator with schedule recalculation');

  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate remove',
      'removing the nominee'
    );
  }
}

/**
 * Recalculates schedules for all remaining active nominees after a removal
 */
async function recalculateRemainingNominees(guildId: string, removedNomineeName: string): Promise<void> {
  try {
    logger.info({ guildId, removedNomineeName }, 'Starting schedule recalculation after nominee removal');

    // Get all active nominees (not in PAST state) ordered by creation time
    const activeNominees = await prisma.nominee.findMany({
      where: {
        guildId,
        state: {
          not: NomineeState.PAST
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (activeNominees.length === 0) {
      logger.info({ guildId }, 'No remaining nominees to recalculate');
      return;
    }

    // Recalculate times for all nominees based on their new queue positions
    const recalculations = await TimeCalculationService.recalculateAllSchedules(activeNominees);
    
    // Update database with new schedules
    let updatedCount = 0;
    for (const result of recalculations) {
      await prisma.nominee.update({
        where: { id: result.nominee.id },
        data: {
          discussionStart: result.scheduledTimes.discussionStart,
          voteStart: result.scheduledTimes.voteStart,
          certifyStart: result.scheduledTimes.certifyStart
        }
      });
      updatedCount++;
    }

    logger.info({
      guildId,
      removedNomineeName,
      updatedCount,
      remainingNominees: activeNominees.length
    }, 'Schedule recalculation completed after nominee removal');

  } catch (error) {
    logger.error({ 
      error, 
      guildId, 
      removedNomineeName 
    }, 'Failed to recalculate schedules after nominee removal');
  }
}

/**
 * Announces nominee removal to governance channel
 */
async function announceNomineeRemoval(
  client: any,
  guildId: string,
  nomineeName: string,
  previousState: NomineeState,
  moderatorUsername: string
): Promise<void> {
  try {
    const stateDisplayNames = {
      [NomineeState.ACTIVE]: 'Active (pending)',
      [NomineeState.DISCUSSION]: 'Discussion',
      [NomineeState.VOTE]: 'Voting',
      [NomineeState.CERTIFY]: 'Certification',
      [NomineeState.PAST]: 'Past'
    };

    const stateDisplay = stateDisplayNames[previousState] || previousState.toLowerCase();
    const message = `🗑️ **Nominee Removed**\n\n**${nomineeName}** has been removed from the nominations list by ${moderatorUsername}.\n\n**Previous State:** ${stateDisplay}\n**Action:** Schedules have been recalculated for all remaining nominees.`;

    await AnnouncementUtils.postToGovernanceChannel(client, guildId, message);

    logger.info({
      guildId,
      nomineeName,
      previousState,
      moderatorUsername
    }, 'Nominee removal announced to governance channel');

  } catch (error) {
    logger.error({ 
      error, 
      guildId, 
      nomineeName, 
      moderatorUsername 
    }, 'Failed to announce nominee removal to governance channel');
  }
}