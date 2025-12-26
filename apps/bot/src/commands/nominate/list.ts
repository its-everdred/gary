import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';
import { NomineeDisplayUtils } from '../../lib/nomineeDisplayUtils.js';
import { CommandUtils } from '../../lib/commandUtils.js';


export async function handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID!;
    
    const nominees = await prisma.nominee.findMany({
      where: {
        guildId,
        state: {
          not: NomineeState.PAST
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const queueEmbed = NomineeDisplayUtils.createQueueEmbed(nominees);
    await interaction.reply({
      embeds: [queueEmbed],
      flags: 64 // EPHEMERAL
    });

  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate list',
      'fetching the nominations list'
    );
  }
}