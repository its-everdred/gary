import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleListCommand } from './list.js';
import { handleNameCommand } from './name.js';

export const nominateCommand = new SlashCommandBuilder()
  .setName('nominate')
  .setDescription('Manage nominations')
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all current nominations and their state')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Nominate someone for membership')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the person to nominate')
          .setRequired(true)
      )
  )
  .toJSON();

export async function nominateHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'list':
      await handleListCommand(interaction);
      break;
    case 'add':
      await handleNameCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: 'This nomination command is not yet implemented.',
        flags: 64
      });
  }
}