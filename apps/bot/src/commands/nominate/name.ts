import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { validateNominatorUser } from '../../lib/permissions.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { NomineeDisplayUtils } from '../../lib/nomineeDisplayUtils.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { AnnouncementUtils } from '../../lib/announcementUtils.js';

const logger = pino();

async function calculateNomineeSchedule(guildId: string): Promise<{ discussionStart: Date; voteStart: Date; certifyStart: Date }> {
  // Get all active nominees to determine queue position
  const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
  const queuePosition = activeNominees.length + 1; // New nominee goes to end of queue
  
  return TimeCalculationService.calculateScheduledTimes(queuePosition);
}

async function generateNominationQueueText(guildId: string): Promise<string> {
  try {
    const nominees = await prisma.nominee.findMany({
      where: {
        guildId,
        state: {
          not: 'PAST'
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return NomineeDisplayUtils.formatNominationQueue(nominees);
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to generate nomination queue text');
    return '\n\n**Current Queue:** Unable to load';
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

      // Generate queue text and post to governance channel
      const queueText = await generateNominationQueueText(guildId);
      await AnnouncementUtils.postToGovernanceChannel(
        interaction.client,
        guildId,
        `${name} has been nominated for membership by ${nominator.username}.${queueText}`
      );
      
      // Send private acknowledgment to mod
      const channelRef = AnnouncementUtils.getGovernanceChannelReference();
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

    // Generate queue text and post to governance channel
    const queueText = await generateNominationQueueText(guildId);
    await AnnouncementUtils.postToGovernanceChannel(
      interaction.client,
      guildId,
      `${name} has been nominated for membership by ${username}.${queueText}`
    );
    
    // Send private acknowledgment to nominator
    const channelRef = AnnouncementUtils.getGovernanceChannelReference();
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
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate name',
      'creating the nomination'
    );
  }
}