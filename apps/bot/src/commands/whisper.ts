import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { sendWhisper } from '../lib/alert.js';

export const whisperCommand = new SlashCommandBuilder()
  .setName('whisper')
  .setDescription('Send an anonymous message to moderators')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message to whisper anonymously')
      .setRequired(true)
  )
  .setContexts([1]) // 1 = DM context
  .toJSON();

export async function whisperHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const message = interaction.options.getString('message', true);
  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    const guild = await interaction.client.guilds.fetch(guildId);
    
    const member = await guild.members.fetch(voterId).catch(() => null);
    if (!member) {
      await interaction.editReply('You must be a member of the configured guild to send whispers.');
      return;
    }
    if (member.user.bot) {
      await interaction.editReply('Bots cannot send whispers.');
      return;
    }

    await sendWhisper(interaction.client, message);
    await interaction.editReply('Whisper sent anonymously to moderators.');
  } catch (error) {
    console.error('Whisper command error:', error);
    await interaction.editReply('An error occurred while sending your whisper.');
  }
}