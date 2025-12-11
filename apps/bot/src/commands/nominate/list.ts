import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../../lib/db.js';
import { NomineeState } from '@prisma/client';

const logger = pino();

function formatNomineeList(nominees: Array<{
  name: string;
  state: NomineeState;
  nominator: string;
  discussionStart: Date | null;
  voteStart: Date | null;
  certifyStart: Date | null;
  createdAt: Date;
}>): string {
  if (nominees.length === 0) {
    return '**Current Nominations:** None';
  }

  const lines: string[] = [];
  
  nominees.forEach((nominee, index) => {
    const position = index + 1;
    
    if (nominee.state === NomineeState.VOTE && nominee.certifyStart) {
      const endTime = `<t:${Math.floor(nominee.certifyStart.getTime() / 1000)}:f>`;
      lines.push(`${position}. ${nominee.name} - Vote until ${endTime}`);
    } else if (nominee.state === NomineeState.DISCUSSION && nominee.voteStart) {
      const voteTime = `<t:${Math.floor(nominee.voteStart.getTime() / 1000)}:f>`;
      lines.push(`${position}. ${nominee.name} - Vote begins ${voteTime}`);
    } else if (nominee.state === NomineeState.CERTIFY) {
      lines.push(`${position}. ${nominee.name} - Results pending`);
    } else if (nominee.state === NomineeState.ACTIVE && nominee.discussionStart) {
      const discussionTime = `<t:${Math.floor(nominee.discussionStart.getTime() / 1000)}:f>`;
      lines.push(`${position}. ${nominee.name} - Discussion begins ${discussionTime}`);
    } else {
      lines.push(`${position}. ${nominee.name} - Pending schedule`);
    }
  });
  
  return lines.join('\n');
}

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

    const formattedList = formatNomineeList(nominees);
    await interaction.reply({
      content: formattedList,
      flags: 64 // EPHEMERAL
    });

  } catch (error) {
    logger.error({ error, command: 'nominate list', user: interaction.user.id }, 'List command error');
    await interaction.reply({
      content: 'An error occurred while fetching the nominations list.',
      flags: 64
    });
  }
}