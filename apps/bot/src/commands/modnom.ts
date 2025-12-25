import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleNameCommand } from './nominate/name.js';
import { handleRemoveCommand } from './nominate/remove.js';
import { handleStartCommand } from './nominate/start.js';

export const modnomCommand = new SlashCommandBuilder()
  .setName('modnom')
  .setDescription('Mod tools for managing GA nominations')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand(subcommand =>
    subcommand
      .setName('name')
      .setDescription('Nominate someone on behalf of another member')
      .addUserOption(option =>
        option
          .setName('nominator')
          .setDescription('The member who is nominating')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the person to nominate')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a nominee from the list')
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
      .setDescription('Start discussion for a nominee immediately')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('The name of the nominee to start discussion for')
          .setRequired(true)
      )
  )
  .toJSON();

export async function modnomHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'name':
      await handleNameCommand(interaction);
      break;
    case 'remove':
      await handleRemoveCommand(interaction);
      break;
    case 'start':
      await handleStartCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: 'This command is not yet implemented.',
        flags: 64
      });
  }
}