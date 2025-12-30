import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { NOMINATION_CONFIG } from '../../lib/constants.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';
import { TimestampUtils } from '../../lib/timestampUtils.js';
import { NominationJobScheduler } from '../../lib/jobScheduler.js';

const logger = pino();

export async function handleDiscussionCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: 64 });

  const hours = interaction.options.getNumber('hours', true);

  // Validate input
  if (hours < 0) {
    await interaction.editReply('Hours must be a positive number.');
    return;
  }

  try {
    // Find nominee currently in DISCUSSION state
    const nominee = await prisma.nominee.findFirst({
      where: {
        state: NomineeState.DISCUSSION,
        guildId: interaction.guildId!
      }
    });

    if (!nominee) {
      await interaction.editReply('There is no nominee currently in discussion.');
      return;
    }

    if (!nominee.discussionStart || !nominee.voteStart) {
      await interaction.editReply('Discussion period data is incomplete for this nominee.');
      return;
    }

    // Calculate new vote start time based on override duration
    const discussionStart = new Date(nominee.discussionStart);
    const newVoteStart = new Date(discussionStart.getTime() + (hours * 60 * 60 * 1000));
    const currentTime = new Date();
    
    // Check if the new duration has already passed
    if (newVoteStart <= currentTime) {
      // Use shared vote transition logic (DRY)
      const jobScheduler = NominationJobScheduler.getInstance(interaction.client);
      
      try {
        await jobScheduler.transitionToVote(nominee);
        
        await interaction.editReply(
          `Discussion duration set to ${hours} hour${hours !== 1 ? 's' : ''}, which has already elapsed. ` +
          `**${nominee.name}** has been transitioned to VOTE state and vote channel created.`
        );
      } catch (error) {
        logger.error({ error, nomineeId: nominee.id }, 'Failed to transition nominee to VOTE state');
        await interaction.editReply(
          `Failed to transition nominee to VOTE state: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      return;
    }

    // Update nominee with new vote start time and adjust cleanup start accordingly
    const newCleanupStart = new Date(newVoteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * 60 * 1000);
    
    await prisma.nominee.update({
      where: { id: nominee.id },
      data: { 
        voteStart: newVoteStart,
        cleanupStart: newCleanupStart
      }
    });

    // Recalculate schedules for queued nominees based on new end time
    const oldVoteStart = new Date(nominee.voteStart);
    if (newVoteStart > oldVoteStart) {
      // Find the next nominee in queue  
      const nextNominee = await prisma.nominee.findFirst({
        where: {
          guildId: interaction.guildId!,
          state: NomineeState.ACTIVE
        },
        orderBy: { createdAt: 'asc' }
      });

      if (nextNominee) {
        // Calculate new base time for next nominee (after current one completes)
        const baseTime = new Date(newCleanupStart.getTime() + NOMINATION_CONFIG.CLEANUP_DURATION_MINUTES * 60 * 1000);
        
        // Update all queued nominees
        const queuedNominees = await prisma.nominee.findMany({
          where: {
            guildId: interaction.guildId!,
            state: NomineeState.ACTIVE
          },
          orderBy: { createdAt: 'asc' }
        });

        for (let i = 0; i < queuedNominees.length; i++) {
          const queuedNominee = queuedNominees[i];
          const weekOffset = i * 7 * 24 * 60 * 60 * 1000; // weeks in milliseconds
          
          const newDiscussionStart = TimeCalculationService.getNextMondayAt9AM(new Date(baseTime.getTime() + weekOffset));
          const newQueuedVoteStart = new Date(newDiscussionStart.getTime() + NOMINATION_CONFIG.DISCUSSION_DURATION_MINUTES * 60 * 1000);
          const newQueuedCleanupStart = new Date(newQueuedVoteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * 60 * 1000);
          
          await prisma.nominee.update({
            where: { id: queuedNominee.id },
            data: {
              discussionStart: newDiscussionStart,
              voteStart: newQueuedVoteStart,
              cleanupStart: newQueuedCleanupStart
            }
          });
        }
      }
    }

    // Update discussion channel embed and vote start message
    if (nominee.discussionChannelId) {
      const discussionChannel = await interaction.client.channels.fetch(nominee.discussionChannelId);
      if (discussionChannel?.isTextBased()) {
        // Find and update the first bot embed message
        const messages = await discussionChannel.messages.fetch({ limit: 10 });
        const embedMessage = messages.find(msg => 
          msg.author.id === interaction.client.user?.id &&
          msg.embeds.length > 0
        );

        if (embedMessage) {
          const discussionStart = new Date(nominee.discussionStart);
          const totalDuration = newVoteStart.getTime() - discussionStart.getTime();
          const totalHours = Math.floor(totalDuration / (1000 * 60 * 60));

          const updatedEmbed = EmbedBuilder.from(embedMessage.embeds[0])
            .setFields([
              { name: '👤 Nominator', value: `<@${nominee.nominator}>`, inline: true },
              { name: '⏰ Duration', value: `${totalHours} hours`, inline: true }
            ])
            .setTimestamp(discussionStart);

          await embedMessage.edit({ embeds: [updatedEmbed] });
        }

        // Find and update the "Voting will commence" message
        let voteStartMessage = messages.find(msg =>
          msg.author.id === interaction.client.user?.id &&
          msg.content.includes('Voting will commence at')
        );

        const newVoteStartMessage = `Voting will commence at ${TimestampUtils.formatDiscordTimestamp(newVoteStart, 'F')}`;

        if (voteStartMessage) {
          await voteStartMessage.edit({ content: newVoteStartMessage });
        } else {
          // Create the message if it doesn't exist
          voteStartMessage = await discussionChannel.send({
            content: newVoteStartMessage,
          });
          
          // TODO: Store the message ID in database for future updates
          // For now, the message will be found by content search
        }
      }
    }

    await interaction.editReply(
      `Discussion duration for **${nominee.name}** has been set to ${hours} hour${hours !== 1 ? 's' : ''}. ` +
      `Vote will start: ${TimestampUtils.formatDiscordTimestamp(newVoteStart, 'F')}`
    );

    logger.info({
      nominee: nominee.name,
      newDuration: hours,
      newVoteStart: newVoteStart.toISOString()
    }, 'Discussion duration updated');

  } catch (error) {
    logger.error({ error }, 'Failed to adjust discussion period');
    await interaction.editReply('An error occurred while adjusting the discussion period.');
  }
}

