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
import { ConfigService } from '../lib/configService.js';

export const unflagCommand = new SlashCommandBuilder()
  .setName('unflag')
  .setDescription('Remove your flag for a member')
  .addUserOption((option) =>
    option
      .setName('target')
      .setDescription('The member to remove your flag from')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

export async function unflagHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('target', true);
  const targetId = target.id;
  const voterId = interaction.user.id;
  const guildId = ConfigService.getGuildId();

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

    // Check if flag exists
    const voterHash = hmac(voterId, ConfigService.getGuildSalt());
    const existingFlag = await prisma.flag.findUnique({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
    });

    if (!existingFlag) {
      await interaction.editReply('You have not flagged this user.');
      return;
    }

    // Delete the flag
    await prisma.flag.delete({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
    });

    // Reply immediately to user
    await interaction.editReply('Your flag has been removed.');

    // Send notification to mod channel with truncated message
    const truncatedMessage = existingFlag.message ? 
      existingFlag.message.substring(0, 10) + (existingFlag.message.length > 10 ? '...' : '') : 
      '';
    const unflagMessage = `🥹 **UNFLAG** - Anon unflags <@${targetId}> "${truncatedMessage}"`;
    await sendToModChannel(interaction.client, unflagMessage);
  } catch (error) {
    logger.error(
      { error, command: 'unflag', user: interaction.user.id },
      'Unflag command error'
    );

    if (interaction.deferred) {
      await interaction.editReply(
        'An error occurred while removing your flag.'
      );
    } else {
      await interaction.reply({
        content: 'An error occurred while removing your flag.',
        flags: 64,
      });
    }
  }
}
