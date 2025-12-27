import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { CommandUtils } from '../../lib/commandUtils.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';

const logger = pino();

export async function handleRemoveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID!;
    const name = interaction.options.getString('name', true).trim();

    // Validate moderator permissions
    const modValidation = await CommandUtils.validateModeratorAccess(interaction, guildId);
    if (!modValidation.isValid) {
      return;
    }

    // Find the nominee (case-insensitive)
    const nominee = await NomineeStateManager.findNomineeByName(guildId, name);

    if (!nominee) {
      await interaction.reply({
        content: `No nominee found with the name "${name}".`,
        flags: 64
      });
      return;
    }

    if (nominee.state === NomineeState.PAST) {
      await interaction.reply({
        content: `${nominee.name} is already in past state and cannot be removed.`,
        flags: 64
      });
      return;
    }


    // Remove the nominee
    await prisma.nominee.delete({
      where: {
        id: nominee.id
      }
    });

    // Recalculate schedules for all remaining active nominees
    await recalculateRemainingNominees(guildId, nominee.name);

    await interaction.reply({
      content: `${nominee.name} has been removed from the nominations list. Schedules updated for remaining nominees.`,
      flags: 64
    });


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
      return;
    }

    // Recalculate times for all nominees based on their new queue positions
    const recalculations = await TimeCalculationService.recalculateAllSchedules(activeNominees);
    
    // Update database with new schedules
    for (const result of recalculations) {
      await prisma.nominee.update({
        where: { id: result.nominee.id },
        data: {
          discussionStart: result.scheduledTimes.discussionStart,
          voteStart: result.scheduledTimes.voteStart,
          certifyStart: result.scheduledTimes.certifyStart
        }
      });
    }


  } catch (error) {
    logger.error({ 
      error, 
      guildId, 
      removedNomineeName 
    }, 'Failed to recalculate schedules after nominee removal');
  }
}

