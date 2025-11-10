import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../lib/db.js';
import { hmac } from '../lib/crypto.js';
import { sendWarning } from '../lib/alert.js';
import { getEligibleCount } from '../lib/eligible.js';

export const warnCommand = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Send an anonymous warning about a member')
  .addStringOption(option =>
    option
      .setName('target_id')
      .setDescription('Discord ID of the target member (right-click > Copy User ID)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The warning message to send anonymously')
      .setRequired(true)
  )
  .toJSON();

export async function warnHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const targetId = interaction.options.getString('target_id', true);
  const message = interaction.options.getString('message', true);
  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    const guild = await interaction.client.guilds.fetch(guildId);
    
    const voter = await guild.members.fetch(voterId).catch(() => null);
    if (!voter) {
      await interaction.editReply('You must be a member of the configured guild to send warnings.');
      return;
    }
    if (voter.user.bot) {
      await interaction.editReply('Bots cannot send warnings.');
      return;
    }

    const target = await guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await interaction.editReply('Target not found in guild. Make sure to use their Discord ID.');
      return;
    }

    const voterHash = hmac(voterId, process.env.GUILD_SALT!);

    await prisma.vote.create({
      data: {
        guildId,
        targetUserId: targetId,
        voterHash,
        message,
      },
    });

    // Count warnings for this target in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentWarningsCount = await prisma.vote.count({
      where: {
        guildId,
        targetUserId: targetId,
        message: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const eligibleCount = await getEligibleCount(interaction.client);
    
    await sendWarning(interaction.client, targetId, message, recentWarningsCount, eligibleCount);
    await interaction.editReply('Warning sent anonymously to moderators.');
  } catch (error) {
    console.error('Warn command error:', error);
    await interaction.editReply('An error occurred while sending your warning.');
  }
}