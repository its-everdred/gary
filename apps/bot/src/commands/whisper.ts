import { SlashCommandBuilder, TextChannel } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';

export const whisperCommand = new SlashCommandBuilder()
  .setName('whisper')
  .setDescription('Send an anonymous message to moderators')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message to whisper anonymously')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

async function sendWhisper(
  client: any,
  message: string
): Promise<void> {
  try {
    const channel = (await client.channels.fetch(
      process.env.MOD_CHANNEL_ID!
    )) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error("Alert channel not found or not text-based");
      return;
    }

    await channel.send(`**PSST** - Anon whispers:\n` + `"${message}"`);
  } catch (error) {
    logger.error({ error }, "Failed to send whisper");
  }
}

export async function whisperHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

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
    logger.error({ error, command: 'whisper', user: interaction.user.id }, 'Whisper command error');
    
    if (interaction.deferred) {
      await interaction.editReply('An error occurred while sending your whisper.');
    } else {
      await interaction.reply({ 
        content: 'An error occurred while sending your whisper.',
        flags: 64
      });
    }
  }
}