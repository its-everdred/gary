import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../lib/db.js';
import {
  hmac,
  validateGuildMember,
  validateTargetMember,
  sendToModChannel,
} from '../lib/utils.js';

export const unwarnCommand = new SlashCommandBuilder()
  .setName('unwarn')
  .setDescription('Remove your warning for a member')
  .addUserOption((option) =>
    option
      .setName('target')
      .setDescription('The member to remove your warning from')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

export async function unwarnHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('target', true);
  const targetId = target.id;
  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    // Validate voter
    const voterValidation = await validateGuildMember(
      interaction.client,
      guildId,
      voterId
    );
    if (!voterValidation.isValid) {
      await interaction.editReply(voterValidation.errorMessage!);
      return;
    }

    // Validate target
    const guild = await interaction.client.guilds.fetch(guildId);
    const targetValidation = await validateTargetMember(guild, targetId);
    if (!targetValidation.isValid) {
      await interaction.editReply(targetValidation.errorMessage!);
      return;
    }

    // Check if warning exists
    const voterHash = hmac(voterId, process.env.GUILD_SALT!);
    const existingWarning = await prisma.warn.findUnique({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
    });

    if (!existingWarning) {
      await interaction.editReply('You have not warned this user.');
      return;
    }

    // Delete the warning
    await prisma.warn.delete({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
    });

    // Reply immediately to user
    await interaction.editReply('Your warning has been removed.');

    // Send notification to mod channel
    const unwarnMessage = `🥹 **UNWARN** - Anon removed their warning for <@${targetId}>`;
    await sendToModChannel(interaction.client, unwarnMessage);
  } catch (error) {
    logger.error(
      { error, command: 'unwarn', user: interaction.user.id },
      'Unwarn command error'
    );

    if (interaction.deferred) {
      await interaction.editReply(
        'An error occurred while removing your warning.'
      );
    } else {
      await interaction.reply({
        content: 'An error occurred while removing your warning.',
        flags: 64,
      });
    }
  }
}
