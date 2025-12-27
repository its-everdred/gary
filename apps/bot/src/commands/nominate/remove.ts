import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { CommandUtils } from '../../lib/commandUtils.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { ConfigService } from '../../lib/configService.js';

export async function handleRemoveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();
    const name = interaction.options.getString('name', true).trim();

    // Validate moderator permissions
    const modValidation = await CommandUtils.validateModeratorAccess(interaction, guildId);
    if (!modValidation.isValid) {
      return;
    }

    // Find the nominee (case-insensitive) - prioritize active nominees over past ones
    const nominee = await prisma.nominee.findFirst({
      where: {
        guildId,
        name: {
          equals: name,
          mode: 'insensitive'
        },
        state: {
          not: NomineeState.PAST
        }
      },
      orderBy: {
        createdAt: 'desc' // Get most recent if multiple
      }
    });

    if (!nominee) {
      await interaction.reply({
        content: `No nominee found with the name "${name}".`,
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
    await TimeCalculationService.recalculateAndUpdateQueueSchedules(guildId);

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


