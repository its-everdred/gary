import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { validateModeratorPermission } from '../../lib/permissions.js';

const logger = pino();

export async function handleRemoveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID!;
    const name = interaction.options.getString('name', true).trim();
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Validate moderator permissions
    const modPermission = await validateModeratorPermission(
      interaction.client,
      guildId,
      userId
    );
    
    if (!modPermission.isValid) {
      await interaction.reply({
        content: modPermission.errorMessage!,
        flags: 64
      });
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

    await interaction.reply({
      content: `${name} has been removed from the nominations list.`,
      flags: 64
    });

    logger.info({
      nomineeId: nominee.id,
      name,
      previousState: nominee.state,
      moderator: username,
      user: userId
    }, 'Nominee removed by moderator');

    // TODO: If nominee was in progress, recalculate schedules for remaining nominees
    // TODO: Send announcement to GA governance channel about removal
    if (wasInProgress) {
      logger.info({ name }, 'In-progress nominee removed - schedule recalculation needed');
    }

  } catch (error) {
    logger.error({ error, command: 'nominate remove', user: interaction.user.id }, 'Remove command error');
    await interaction.reply({
      content: 'An error occurred while removing the nominee.',
      flags: 64
    });
  }
}