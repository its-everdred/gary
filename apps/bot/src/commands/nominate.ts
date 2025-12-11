import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../lib/db.js';
import { NomineeState } from '@prisma/client';

export const nominateCommand = new SlashCommandBuilder()
  .setName('nominate')
  .setDescription('Manage GA nominations')
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all current nominations and their state')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('name')
      .setDescription('Nominate someone for GA membership')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the person to nominate')
          .setRequired(true)
      )
      .addUserOption(option =>
        option
          .setName('nominator')
          .setDescription('[MOD ONLY] Nominate on behalf of someone else')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('[MOD ONLY] Remove a nominee from the list')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the nominee to remove')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('[MOD ONLY] Start discussion for a nominee immediately')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the nominee to start discussion for')
          .setRequired(true)
      )
  )
  .toJSON();

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

async function handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

export async function nominateHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'list':
      await handleListCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: 'This nomination command is not yet implemented.',
        flags: 64
      });
  }
}