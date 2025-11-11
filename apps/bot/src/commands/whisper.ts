import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { validateGuildMember, sendToModChannel } from '../lib/utils.js';

export const whisperCommand = new SlashCommandBuilder()
  .setName('whisper')
  .setDescription('Send an anonymous message to moderators')
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('The message to whisper anonymously')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

function buildWhisperMessage(message: string): string {
  return `🗣️ **PSST** - Anon whispers:\n"${message}"`;
}

export async function whisperHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const message = interaction.options.getString('message', true);
  const userId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    // Validate user
    const userValidation = await validateGuildMember(interaction.client, guildId, userId);
    if (!userValidation.isValid) {
      await interaction.editReply(userValidation.errorMessage!);
      return;
    }

    // Reply immediately and send whisper asynchronously
    await interaction.editReply('Whisper sent anonymously to moderators.');
    
    const whisperMessage = buildWhisperMessage(message);
    await sendToModChannel(interaction.client, whisperMessage);
    
  } catch (error) {
    logger.error({ error, command: 'whisper', user: interaction.user.id }, 'Whisper command error');

    if (interaction.deferred) {
      await interaction.editReply('An error occurred while sending your whisper.');
    } else {
      await interaction.reply({
        content: 'An error occurred while sending your whisper.',
        flags: 64,
      });
    }
  }
}