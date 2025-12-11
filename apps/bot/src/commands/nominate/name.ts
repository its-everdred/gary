import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { validateModeratorPermission, validateNominatorUser } from '../../lib/permissions.js';

const logger = pino();

export async function handleNameCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID!;
    const name = interaction.options.getString('name', true).trim();
    const nominator = interaction.options.getUser('nominator');
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Basic name validation
    if (name.length < 2 || name.length > 100) {
      await interaction.reply({
        content: 'Nominee name must be between 2 and 100 characters.',
        flags: 64
      });
      return;
    }

    // If nominator is specified, this is a mod-only command
    if (nominator) {
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

      const nominatorValidation = await validateNominatorUser(
        interaction.client,
        guildId,
        nominator.id
      );

      if (!nominatorValidation.isValid) {
        await interaction.reply({
          content: nominatorValidation.errorMessage!,
          flags: 64
        });
        return;
      }

      // Create nomination on behalf of nominator
      const nominee = await prisma.nominee.create({
        data: {
          name,
          state: NomineeState.ACTIVE,
          nominator: nominator.username || nominator.id,
          guildId,
          discussionStart: null
        }
      });

      await interaction.reply({
        content: `${name} has been nominated for GA membership on behalf of ${nominator.username}. They will be added to the nomination queue.`,
        flags: 64
      });

      logger.info({
        nomineeId: nominee.id,
        name,
        nominator: nominator.username || nominator.id,
        moderator: username,
        user: userId
      }, 'Moderator nomination created');
      
      return;
    }

    // Check if nominee already exists
    const existingNominee = await prisma.nominee.findUnique({
      where: {
        guildId_name: {
          guildId,
          name
        }
      }
    });

    if (existingNominee && existingNominee.state !== NomineeState.PAST) {
      await interaction.reply({
        content: `${name} is already nominated and in ${existingNominee.state.toLowerCase()} state.`,
        flags: 64
      });
      return;
    }

    // Create nomination
    const nominee = await prisma.nominee.create({
      data: {
        name,
        state: NomineeState.ACTIVE,
        nominator: username,
        guildId,
        // TODO: Calculate discussionStart in Task 9
        discussionStart: null
      }
    });

    await interaction.reply({
      content: `${name} has been nominated for GA membership. They will be added to the nomination queue.`,
      flags: 64
    });

    // TODO: Send announcement to GA governance channel
    logger.info({
      nomineeId: nominee.id,
      name,
      nominator: username,
      user: userId
    }, 'New nomination created');

  } catch (error) {
    logger.error({ error, command: 'nominate name', user: interaction.user.id }, 'Name command error');
    await interaction.reply({
      content: 'An error occurred while creating the nomination.',
      flags: 64
    });
  }
}