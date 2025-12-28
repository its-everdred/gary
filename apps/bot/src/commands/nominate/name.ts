import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { validateNominatorUser } from '../../lib/permissions.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { NomineeDisplayUtils } from '../../lib/nomineeDisplayUtils.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ChannelFinderService } from '../../lib/channelFinderService.js';
import { NOMINATION_CONFIG } from '../../lib/constants.js';
import { ConfigService } from '../../lib/configService.js';
import { DISCORD_CONSTANTS } from '../../lib/discordConstants.js';

async function calculateNomineeSchedule(guildId: string): Promise<{ discussionStart: Date; voteStart: Date; certifyStart: Date }> {
  // Get all active nominees to determine queue position
  const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
  const queuePosition = activeNominees.length + 1; // New nominee goes to end of queue
  
  return TimeCalculationService.calculateScheduledTimes(queuePosition);
}

async function validateNomineeNotDuplicate(guildId: string, name: string): Promise<string | null> {
  const existingNominee = await prisma.nominee.findFirst({
    where: {
      guildId,
      name: {
        equals: name,
        mode: 'insensitive'
      },
      state: {
        not: NomineeState.PAST
      }
    }
  });
  
  if (existingNominee) {
    return `❌ **${name}** is already nominated and is currently in ${existingNominee.state.toLowerCase()} state.`;
  }
  return null;
}



export async function handleNameCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();
    const name = interaction.options.getString('name', true).trim();
    const nominator = interaction.options.getUser('nominator');
  
    // Basic name validation
    if (name.length < DISCORD_CONSTANTS.LIMITS.NOMINEE_NAME_MIN || name.length > DISCORD_CONSTANTS.LIMITS.NOMINEE_NAME_MAX) {
      await interaction.reply({
        content: `Nominee name must be between ${DISCORD_CONSTANTS.LIMITS.NOMINEE_NAME_MIN} and ${DISCORD_CONSTANTS.LIMITS.NOMINEE_NAME_MAX} characters.`,
        flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
      });
      return;
    }

    // If nominator is specified, this is a mod-only command
    if (nominator) {
      const modValidation = await CommandUtils.validateModeratorAccess(interaction, guildId);
      if (!modValidation.isValid) {
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
          flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
        });
        return;
      }

      // Check for existing nominee with same name
      const duplicateError = await validateNomineeNotDuplicate(guildId, name);
      if (duplicateError) {
        await interaction.reply({
          content: duplicateError,
          flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
        });
        return;
      }

      // Calculate schedule for new nominee
      const schedule = await calculateNomineeSchedule(guildId);
      
      // Create nomination on behalf of nominator
      await prisma.nominee.create({
        data: {
          name,
          state: NomineeState.ACTIVE,
          nominator: nominator.id,
          guildId,
          discussionStart: schedule.discussionStart,
          voteStart: schedule.voteStart,
          certifyStart: schedule.certifyStart
        }
      });

      // Get all nominees for the queue display
      const nominees = await NomineeDisplayUtils.getNomineesInQueueOrder(guildId);

      // Create embed for governance channel
      const nominationEmbed = await NomineeDisplayUtils.createNominationEmbed(
        name,
        nominator.username || nominator.displayName || nominator.id,
        interaction.user.username || interaction.user.displayName || interaction.user.id,
        nominees
      );

      try {
        const governanceChannel = await ChannelFinderService.governance();
        if (governanceChannel) {
          await governanceChannel.send({ embeds: [nominationEmbed] });
        } else {
          console.error('Governance channel not found. Check GOVERNANCE_CHANNEL_ID environment variable.');
        }
      } catch (announcementError) {
        // Log the announcement error but don't fail the command
        console.error('Failed to announce nomination:', announcementError);
      }
      
      // Send private acknowledgment to mod
      const channelRef = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE ? `<#${NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE}>` : 'governance channel';
      await interaction.reply({
        content: `Successfully nominated ${name} on behalf of ${nominator.username} and announced in ${channelRef}.`,
        flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
      });

      
      return;
    }

    // Check for existing nominee with same name
    const duplicateError = await validateNomineeNotDuplicate(guildId, name);
    if (duplicateError) {
      await interaction.reply({
        content: duplicateError,
        flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
      });
      return;
    }

    // Calculate schedule for new nominee
    const schedule = await calculateNomineeSchedule(guildId);
    
    // Create nomination
    await prisma.nominee.create({
      data: {
        name,
        state: NomineeState.ACTIVE,
        nominator: interaction.user.id,
        guildId,
        discussionStart: schedule.discussionStart,
        voteStart: schedule.voteStart,
        certifyStart: schedule.certifyStart
      }
    });

    // Get all nominees for the queue display
    const allNominees = await NomineeDisplayUtils.getNomineesInQueueOrder(guildId);

    // Create embed for governance channel
    const nominationEmbed = await NomineeDisplayUtils.createNominationEmbed(
      name,
      interaction.user.username || interaction.user.displayName || interaction.user.id,
      null, // No moderator for regular nominations
      allNominees
    );

    try {
      const governanceChannel = await ChannelFinderService.governance();
      if (governanceChannel) {
        await governanceChannel.send({ embeds: [nominationEmbed] });
      } else {
        console.error('Governance channel not found. Check GOVERNANCE_CHANNEL_ID environment variable.');
      }
    } catch (announcementError) {
      // Log the announcement error but don't fail the command
      console.error('Failed to announce nomination:', announcementError);
    }
    
    // Send private acknowledgment to nominator
    const channelRef = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE ? `<#${NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE}>` : 'governance channel';
    await interaction.reply({
      content: `Successfully nominated ${name} and announced in ${channelRef}.`,
      flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
    });


  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate name',
      'creating the nomination'
    );
  }
}