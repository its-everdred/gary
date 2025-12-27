import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { validateModeratorPermission } from '../../lib/permissions.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { ChannelManagementService } from '../../lib/channelService.js';
import { AnnouncementService } from '../../lib/announcementService.js';
import { NomineeState } from '@prisma/client';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { NOMINATION_CONFIG } from '../../lib/constants.js';

const logger = pino();


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
          content: '❌ **No Nominees Available**\n\nThere are no active nominees ready to start discussion.',
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
      try {
        
        const announcementService = new AnnouncementService(interaction.client);
        await announcementService.announceDiscussionStart(
          transitionResult.nominee!,
          channelResult.channel!.id
        );
        
      } catch (announcementError) {
        logger.error({
          error: announcementError,
          nomineeId: nominee.id,
          name: nominee.name
        }, 'Failed to post governance announcement for manual discussion start');
        // Continue execution - don't let announcement failure block the command
      }
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: channelResult.errorMessage
      }, 'Failed to create discussion channel for manual start');
    }
    
    // Recalculate queue for remaining ACTIVE nominees
    try {
      await TimeCalculationService.recalculateAndUpdateQueueSchedules(guildId, nominee.id);
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        guildId
      }, 'Failed to recalculate queue after manual start');
    }

    // Don't send public response - governance announcement handles public notification
    // Just acknowledge the command was processed successfully
    await interaction.deleteReply();

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