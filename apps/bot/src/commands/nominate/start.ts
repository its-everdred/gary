import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import pino from 'pino';
import { validateModeratorPermission } from '../../lib/permissions.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { ChannelManagementService } from '../../lib/channelService.js';
import { NomineeState } from '@prisma/client';

const logger = pino();

export const startSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('start')
    .setDescription('Immediately start discussion for a nominee (moderator only)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name of the nominee to start discussion for')
        .setRequired(true)
        .setMaxLength(100)
    );

export async function handleStartCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const nomineeName = interaction.options.getString('name', true);

  if (!guildId) {
    await interaction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  // Check moderator permissions
  const permissionResult = await validateModeratorPermission(
    interaction.client,
    guildId,
    userId
  );

  if (!permissionResult.isValid) {
    await interaction.reply({
      content: `❌ **Access Denied**\n\n${permissionResult.errorMessage}`,
      ephemeral: true
    });
    return;
  }

  try {
    // Find the nominee
    const nominee = await NomineeStateManager.findNomineeByName(guildId, nomineeName);
    
    if (!nominee) {
      await interaction.reply({
        content: `❌ **Nominee Not Found**\n\nNo nominee named "${nomineeName}" found in this server.`,
        ephemeral: true
      });
      return;
    }

    // Check if nominee is in ACTIVE state
    if (nominee.state !== NomineeState.ACTIVE) {
      await interaction.reply({
        content: `❌ **Invalid State**\n\nNominee "${nomineeName}" is currently in ${nominee.state} state. Only ACTIVE nominees can be manually started.`,
        ephemeral: true
      });
      return;
    }

    // Check if another nominee is already in progress
    const hasInProgress = await NomineeStateManager.hasNomineeInProgress(guildId);
    if (hasInProgress) {
      const inProgressNominee = await NomineeStateManager.getCurrentNomineeInProgress(guildId);
      await interaction.reply({
        content: `❌ **Another Nominee In Progress**\n\nCannot start "${nomineeName}" because "${inProgressNominee?.name}" is currently in ${inProgressNominee?.state} state.\n\nOnly one nominee can be in progress at a time.`,
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Transition nominee to DISCUSSION state
    const transitionResult = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.DISCUSSION,
      {
        discussionStart: new Date()
      }
    );

    if (!transitionResult.success) {
      await interaction.editReply({
        content: `❌ **Transition Failed**\n\nFailed to start discussion for "${nomineeName}":\n${transitionResult.errorMessage}`
      });
      return;
    }

    // Create discussion channel
    const channelService = new ChannelManagementService(interaction.client);
    const channelResult = await channelService.createDiscussionChannel(transitionResult.nominee!);
    
    let channelInfo = '';
    if (channelResult.success) {
      channelInfo = `\n📁 Discussion channel: ${channelResult.channel?.toString()}`;
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: channelResult.errorMessage
      }, 'Failed to create discussion channel for manual start');
      channelInfo = '\n⚠️ Discussion started but channel creation failed.';
    }

    // Log the manual start
    logger.info({
      nomineeId: nominee.id,
      name: nominee.name,
      moderator: interaction.user.id,
      user: interaction.user.id
    }, 'Nominee discussion started manually by moderator');

    await interaction.editReply({
      content: `✅ **Discussion Started**\n\nDiscussion has been manually started for "${nomineeName}".\n\n⏰ **Duration:** 48 hours\n📅 **Started:** ${new Date().toLocaleString()}${channelInfo}`
    });

  } catch (error) {
    logger.error({
      error,
      user: userId,
      nomineeName
    }, 'Start command error');

    const content = interaction.replied || interaction.deferred
      ? `❌ **Error**\n\nAn error occurred while starting discussion for "${nomineeName}".`
      : '❌ An error occurred while processing your command.';

    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}