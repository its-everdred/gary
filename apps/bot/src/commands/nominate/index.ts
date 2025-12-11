import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleListCommand } from './list.js';
import { handleNameCommand } from './name.js';
import { handleRemoveCommand } from './remove.js';

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

export async function nominateHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'list':
      await handleListCommand(interaction);
      break;
    case 'name':
      await handleNameCommand(interaction);
      break;
    case 'remove':
      await handleRemoveCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: 'This nomination command is not yet implemented.',
        flags: 64
      });
  }
}