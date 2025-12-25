import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import pino from 'pino';
import { validateModeratorPermission } from '../../lib/permissions.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { ChannelManagementService } from '../../lib/channelService.js';
import { AnnouncementService } from '../../lib/announcementService.js';
import { NomineeState } from '@prisma/client';
import { NOMINATION_CONFIG } from '../../lib/constants.js';

const logger = pino();

export const startSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName('start')
    .setDescription('Start discussion for a nominee or the next in queue (moderator only)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name of the nominee to start (optional - if not provided, starts next in queue)')
        .setRequired(false)
        .setMaxLength(100)
    );

export async function handleStartCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const nomineeName = interaction.options.getString('name'); // Now optional

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
    let nominee;

    // Check if another nominee is already in progress first
    const hasInProgress = await NomineeStateManager.hasNomineeInProgress(guildId);
    if (hasInProgress) {
      const inProgressNominee = await NomineeStateManager.getCurrentNomineeInProgress(guildId);
      await interaction.reply({
        content: `❌ **Another Nominee In Progress**\n\nCannot start discussion because "${inProgressNominee?.name}" is currently in ${inProgressNominee?.state} state.\n\nOnly one nominee can be in progress at a time.`,
        ephemeral: true
      });
      return;
    }

    if (nomineeName) {
      // Specific nominee requested
      nominee = await NomineeStateManager.findNomineeByName(guildId, nomineeName);
      
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
    } else {
      // No specific nominee - find the next one in queue
      nominee = await NomineeStateManager.getNextNomineeForDiscussion(guildId);
      
      if (!nominee) {
        await interaction.reply({
          content: `❌ **No Nominees Available**\n\nThere are no active nominees ready to start discussion.`,
          ephemeral: true
        });
        return;
      }
    }

    await interaction.deferReply();

    // Calculate new times based on current time
    const now = new Date();
    const voteStart = new Date(now);
    voteStart.setUTCMinutes(voteStart.getUTCMinutes() + NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES);
    
    const certifyStart = new Date(voteStart);
    certifyStart.setUTCMinutes(certifyStart.getUTCMinutes() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES);
    
    // Transition nominee to DISCUSSION state
    const transitionResult = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.DISCUSSION,
      {
        discussionStart: now,
        voteStart: voteStart,
        certifyStart: certifyStart
      }
    );

    if (!transitionResult.success) {
      await interaction.editReply({
        content: `❌ **Transition Failed**\n\nFailed to start discussion for "${nominee.name}":\n${transitionResult.errorMessage}`
      });
      return;
    }

    // Create discussion channel
    const channelService = new ChannelManagementService(interaction.client);
    const channelResult = await channelService.createDiscussionChannel(transitionResult.nominee!);
    
    if (channelResult.success) {
      // Post announcement to governance channel
      const announcementService = new AnnouncementService(interaction.client);
      await announcementService.announceDiscussionStart(
        transitionResult.nominee!,
        channelResult.channel!.id,
        interaction.user.id // Pass user ID to indicate manual start
      );
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: channelResult.errorMessage
      }, 'Failed to create discussion channel for manual start');
    }
    
    // Log the manual start
    logger.info({
      nomineeId: nominee.id,
      name: nominee.name,
      moderator: interaction.user.id,
      user: interaction.user.id,
      specifiedName: !!nomineeName
    }, 'Nominee discussion started manually by moderator');

    const targetName = nomineeName || nominee.name;
    const autoSelectedNote = nomineeName ? '' : ' (next in queue)';
    
    const successMessage = channelResult.success 
      ? `✅ Discussion for "${targetName}"${autoSelectedNote} started successfully.\n📁 Channel: ${channelResult.channel?.toString()}\n📢 Announced in governance channel.`
      : `⚠️ Discussion for "${targetName}"${autoSelectedNote} started, but channel creation failed.`;
    
    await interaction.editReply({
      content: successMessage
    });

  } catch (error) {
    logger.error({
      error,
      user: userId,
      nomineeName,
      selectedNominee: nominee?.name
    }, 'Start command error');

    const targetName = nomineeName || nominee?.name || 'nominee';
    const content = interaction.replied || interaction.deferred
      ? `❌ **Error**\n\nAn error occurred while starting discussion for "${targetName}".`
      : '❌ An error occurred while processing your command.';

    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}