import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { validateModeratorPermission, validateNominatorUser } from '../../lib/permissions.js';
import { NOMINATION_CONFIG } from '../../lib/constants.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';

const logger = pino();

async function calculateNomineeSchedule(guildId: string): Promise<{ discussionStart: Date; voteStart: Date; certifyStart: Date }> {
  // Get all active nominees to determine queue position
  const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
  const queuePosition = activeNominees.length + 1; // New nominee goes to end of queue
  
  return TimeCalculationService.calculateScheduledTimes(queuePosition);
}

async function postToGovernanceChannel(interaction: ChatInputCommandInteraction, message: string): Promise<{ success: boolean; channelName?: string }> {
  try {
    const governanceChannelId = NOMINATION_CONFIG.CHANNELS.GA_GOVERNANCE;
    if (!governanceChannelId) {
      logger.warn('GOVERNANCE_CHANNEL_ID not configured');
      return { success: false };
    }

    const guild = interaction.guild;
    if (!guild) return { success: false };

    const channel = guild.channels.cache.get(governanceChannelId) as TextChannel;
    if (!channel?.isTextBased()) {
      logger.warn(`Governance channel ${governanceChannelId} not found or not text-based`);
      return { success: false };
    }

    await channel.send(message);
    return { success: true, channelName: channel.name };
  } catch (error) {
    logger.error({ error }, 'Failed to post to governance channel');
    return { success: false };
  }
}

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

      // Calculate schedule for new nominee
      const schedule = await calculateNomineeSchedule(guildId);
      
      // Create nomination on behalf of nominator
      const nominee = await prisma.nominee.create({
        data: {
          name,
          state: NomineeState.ACTIVE,
          nominator: nominator.username || nominator.id,
          guildId,
          discussionStart: schedule.discussionStart,
          voteStart: schedule.voteStart,
          certifyStart: schedule.certifyStart
        }
      });

      // Post to governance channel
      const governanceResult = await postToGovernanceChannel(interaction, `${name} has been nominated for membership by ${nominator.username}. They will be added to the nomination queue.`);
      
      // Send private acknowledgment to mod
      const channelRef = governanceResult.success && governanceResult.channelName ? `#${governanceResult.channelName}` : 'governance channel';
      await interaction.reply({
        content: `Successfully nominated ${name} on behalf of ${nominator.username} and announced in ${channelRef}.`,
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

    // Calculate schedule for new nominee
    const schedule = await calculateNomineeSchedule(guildId);
    
    // Create nomination
    const nominee = await prisma.nominee.create({
      data: {
        name,
        state: NomineeState.ACTIVE,
        nominator: username,
        guildId,
        discussionStart: schedule.discussionStart,
        voteStart: schedule.voteStart,
        certifyStart: schedule.certifyStart
      }
    });

    // Post to governance channel
    const governanceResult = await postToGovernanceChannel(interaction, `${name} has been nominated for membership by ${username}. They will be added to the nomination queue.`);
    
    // Send private acknowledgment to nominator
    const channelRef = governanceResult.success && governanceResult.channelName ? `#${governanceResult.channelName}` : 'governance channel';
    await interaction.reply({
      content: `Successfully nominated ${name} and announced in ${channelRef}.`,
      flags: 64
    });

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