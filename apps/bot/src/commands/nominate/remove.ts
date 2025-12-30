import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { CommandUtils } from '../../lib/commandUtils.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { ConfigService } from '../../lib/configService.js';
import { NominationJobScheduler } from '../../lib/jobScheduler.js';

const logger = pino();

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



    await interaction.deferReply({ ephemeral: true });

    // Check if this is the current active nominee (has channels)
    const hasChannels = nominee.discussionChannelId || nominee.voteChannelId;
    
    if (hasChannels) {
      // Perform full cleanup using existing job scheduler logic
      const jobScheduler = NominationJobScheduler.getInstance(interaction.client);
      const result = await jobScheduler.performPostCleanupCleanup(nominee);

      if (result.success) {
        await interaction.editReply({
          content: `✅ **${nominee.name} has been removed**\n\n` +
                   '• Deleted from nominations list\n' +
                   '• Removed discussion and vote channels\n' +
                   '• Cleaned up associated messages\n' +
                   '• Updated schedules for remaining nominees'
        });
      } else {
        await interaction.editReply({
          content: `❌ **Failed to remove ${nominee.name}**\n\nError: ${result.errorMessage}`
        });
      }
    } else {
      // Simple removal for queued nominees (no channels to clean up)
      await prisma.nominee.delete({
        where: {
          id: nominee.id
        }
      });

      // Recalculate schedules for remaining nominees
      await TimeCalculationService.recalculateAndUpdateQueueSchedules(guildId);

      await interaction.editReply({
        content: `✅ **${nominee.name} has been removed from the queue**\n\n` +
                 '• Deleted from nominations list\n' +
                 '• Updated schedules for remaining nominees'
      });
    }


  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate remove',
      'removing the nominee'
    );
  }
}


