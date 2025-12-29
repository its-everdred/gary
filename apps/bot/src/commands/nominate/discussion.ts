import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { NOMINATION_CONFIG } from '../../lib/constants.js';
import { TimeCalculationService } from '../../lib/timeCalculation.js';

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
      // Transition to VOTE state immediately
      const transitionResult = await NomineeStateManager.transitionNominee(nominee.id, NomineeState.VOTE);
      
      if (transitionResult.success) {
        await interaction.editReply(
          `Discussion duration set to ${hours} hour${hours !== 1 ? 's' : ''}, which has already elapsed. ` +
          `**${nominee.name}** has been transitioned to VOTE state.`
        );
      } else {
        await interaction.editReply(
          `Failed to transition nominee to VOTE state: ${transitionResult.errorMessage || 'Unknown error'}`
        );
      }
      return;
    }

    // Update nominee with new vote start time and adjust certify start accordingly
    const newCertifyStart = new Date(newVoteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * 60 * 1000);
    
    await prisma.nominee.update({
      where: { id: nominee.id },
      data: { 
        voteStart: newVoteStart,
        certifyStart: newCertifyStart
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
        const baseTime = new Date(newCertifyStart.getTime() + NOMINATION_CONFIG.CERTIFY_DURATION_MINUTES * 60 * 1000);
        
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
          const newQueuedCertifyStart = new Date(newQueuedVoteStart.getTime() + NOMINATION_CONFIG.VOTE_DURATION_MINUTES * 60 * 1000);
          
          await prisma.nominee.update({
            where: { id: queuedNominee.id },
            data: {
              discussionStart: newDiscussionStart,
              voteStart: newQueuedVoteStart,
              certifyStart: newQueuedCertifyStart
            }
          });
        }
      }
    }

    // Update discussion channel embed
    if (nominee.discussionChannelId) {
      const discussionChannel = await interaction.client.channels.fetch(nominee.discussionChannelId);
      if (discussionChannel?.isTextBased()) {
        // Find and update the pinned embed
        const messages = await discussionChannel.messages.fetchPinned();
        const pinnedMessage = messages.find(msg => 
          msg.author.id === interaction.client.user?.id &&
          msg.embeds.length > 0
        );

        if (pinnedMessage) {
          const discussionStart = new Date(nominee.discussionStart);
          const totalDuration = newVoteStart.getTime() - discussionStart.getTime();
          const totalHours = Math.floor(totalDuration / (1000 * 60 * 60));

          const updatedEmbed = EmbedBuilder.from(pinnedMessage.embeds[0])
            .setFields([
              { name: 'Nominated by', value: `<@${nominee.nominator}>`, inline: true },
              { name: 'State', value: '🗣️ Discussion', inline: true },
              { name: 'Duration', value: `${totalHours} hours`, inline: true }
            ])
            .setFooter({ 
              text: `Began ${formatDiscordTimestamp(discussionStart)} • Ends ${formatDiscordTimestamp(newVoteStart)}` 
            });

          await pinnedMessage.edit({ embeds: [updatedEmbed] });
        }
      }
    }

    await interaction.editReply(
      `Discussion duration for **${nominee.name}** has been set to ${hours} hour${hours !== 1 ? 's' : ''}. ` +
      `Vote will start: ${formatDiscordTimestamp(newVoteStart, 'F')}`
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

function formatDiscordTimestamp(date: Date, format: string = 't'): string {
  const timestamp = Math.floor(date.getTime() / 1000);
  return `<t:${timestamp}:${format}>`;
}