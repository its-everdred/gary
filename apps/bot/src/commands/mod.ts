import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleNameCommand } from './nominate/name.js';
import { handleRemoveCommand } from './nominate/remove.js';
import { handleStartCommand } from './nominate/start.js';
import { handleCleanupCommand } from './nominate/cleanup.js';
import { handleDiscussionCommand } from './nominate/discussion.js';

export const modCommand = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderator commands')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommandGroup(subcommandGroup =>
    subcommandGroup
      .setName('nominate')
      .setDescription('Manage nominations')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Nominate someone on behalf of another member')
          .addStringOption(option =>
            option
              .setName('name')
              .setDescription('The name of the person to nominate')
              .setRequired(true)
          )
          .addUserOption(option =>
            option
              .setName('nominator')
              .setDescription('The member who is nominating')
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
          .setDescription('Start discussion for a nominee or next in queue')
          .addStringOption(option =>
            option
              .setName('name')
              .setDescription('Name of the nominee to start (optional - if not provided, starts next in queue)')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('cleanup')
          .setDescription('Complete certification early and cleanup channels for nominee in CERTIFY state')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('discussion')
          .setDescription('Adjust discussion period duration for current nominee')
          .addNumberOption(option =>
            option
              .setName('hours')
              .setDescription('Hours to add (positive) or subtract (negative) from discussion period')
              .setRequired(true)
          )
      )
  )
  .toJSON();

export async function modHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommandGroup === 'nominate') {
    switch (subcommand) {
      case 'add':
        await handleNameCommand(interaction);
        break;
      case 'remove':
        await handleRemoveCommand(interaction);
        break;
      case 'start':
        await handleStartCommand(interaction);
        break;
      case 'cleanup':
        await handleCleanupCommand(interaction);
        break;
      case 'discussion':
        await handleDiscussionCommand(interaction);
        break;
      default:
        await interaction.reply({
          content: 'This command is not yet implemented.',
          flags: 64
        });
    }
  } else {
    await interaction.reply({
      content: 'This command group is not yet implemented.',
      flags: 64
    });
  }
}