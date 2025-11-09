import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../lib/db.js';
import { hmac } from '../lib/crypto.js';
import { getEligibleCount } from '../lib/eligible.js';
import { getVoteCount } from '../lib/tally.js';
import { sendQuorumAlert } from '../lib/alert.js';

export const kickCommand = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Vote to kick a member from the guild')
  .addStringOption(option =>
    option
      .setName('target_id')
      .setDescription('Discord ID of the target member (right-click > Copy User ID)')
      .setRequired(true)
  )
  .toJSON();

export async function kickHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const targetId = interaction.options.getString('target_id', true);
  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    const guild = await interaction.client.guilds.fetch(guildId);
    
    const voter = await guild.members.fetch(voterId).catch(() => null);
    if (!voter) {
      await interaction.editReply('You must be a member of the configured guild to vote.');
      return;
    }
    if (voter.user.bot) {
      await interaction.editReply('Bots cannot vote.');
      return;
    }

    const target = await guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await interaction.editReply('Target not found in guild. Make sure to use their Discord ID.');
      return;
    }
    if (target.user.bot) {
      await interaction.editReply('Cannot vote to kick bots.');
      return;
    }

    const voterHash = hmac(voterId, process.env.GUILD_SALT!);

    await prisma.vote.upsert({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
      update: {},
      create: {
        guildId,
        targetUserId: targetId,
        voterHash,
      },
    });

    const voteCount = await getVoteCount(guildId, targetId);
    const eligibleCount = await getEligibleCount(interaction.client);
    const quorumPercent = parseInt(process.env.QUORUM_PERCENT || '40');
    const percentage = Math.round((voteCount / eligibleCount) * 100);
    const hasQuorum = (voteCount / eligibleCount) >= (quorumPercent / 100);

    if (hasQuorum) {
      await sendQuorumAlert(interaction.client, targetId, voteCount, eligibleCount);
      await interaction.editReply(`Quorum reached. Mods notified. (${voteCount}/${eligibleCount} - ${percentage}%)`);
    } else {
      await interaction.editReply(`Vote recorded. Progress: ${voteCount}/${eligibleCount} (~${percentage}%)`);
    }
  } catch (error) {
    console.error('Kick command error:', error);
    await interaction.editReply('An error occurred while processing your vote.');
  }
}