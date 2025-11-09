import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../lib/db.js';
import { hmac } from '../lib/crypto.js';

export const historyCommand = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View your voting history for this guild')
  .toJSON();

export async function historyHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;
  const voterHash = hmac(voterId, process.env.GUILD_SALT!);

  try {
    const votes = await prisma.vote.findMany({
      where: {
        guildId,
        voterHash,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (votes.length === 0) {
      await interaction.editReply('No votes recorded.');
      return;
    }

    const guild = await interaction.client.guilds.fetch(guildId);
    const voteList = await Promise.all(
      votes.map(async (vote) => {
        try {
          const member = await guild.members.fetch(vote.targetUserId);
          const date = vote.createdAt.toISOString().split('T')[0];
          return `• ${date} — @${member.user.username} (${vote.targetUserId})`;
        } catch {
          const date = vote.createdAt.toISOString().split('T')[0];
          return `• ${date} — Unknown User (${vote.targetUserId})`;
        }
      })
    );

    const response = `**Your voting history:**\n${voteList.join('\n')}`;
    await interaction.editReply(response.substring(0, 2000));
  } catch (error) {
    console.error('History command error:', error);
    await interaction.editReply('An error occurred while fetching your history.');
  }
}