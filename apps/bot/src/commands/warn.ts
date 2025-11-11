import { SlashCommandBuilder, TextChannel } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../lib/db.js';
import { hmac } from '../lib/crypto.js';
import pino from 'pino';
import { getEligibleCount } from '../lib/eligible.js';

export const warnCommand = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Send an anonymous warning about a member')
  .addUserOption((option) =>
    option
      .setName('target')
      .setDescription('The member to warn')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('The warning message to send anonymously')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

async function sendWarning(
  client: any,
  targetUserId: string,
  message: string,
  totalWarningsCount: number,
  eligibleCount: number
): Promise<void> {
  try {
    const channel = (await client.channels.fetch(
      process.env.MOD_CHANNEL_ID!
    )) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error('Alert channel not found or not text-based');
      return;
    }

    const kickQuorumPercent =
      parseInt(process.env.KICK_QUORUM_PERCENT || '40') / 100;
    const kickThreshold = Math.ceil(eligibleCount * kickQuorumPercent);
    const warningsUntilKick = kickThreshold - totalWarningsCount;

    let warningMessage =
      `⚠️ **WARN** - An anonymous member warns <@${targetUserId}>:\n` +
      `"${message}"\n` +
      `*This member has received ${totalWarningsCount} warning${
        totalWarningsCount !== 1 ? 's' : ''
      } total.*`;

    if (warningsUntilKick > 0) {
      warningMessage += ` They are ${warningsUntilKick} more warning${
        warningsUntilKick !== 1 ? 's' : ''
      } away from reaching kick quorum.`;
    } else {
      warningMessage += ' **They have reached kick quorum!**';
    }

    await channel.send(warningMessage);
  } catch (error) {
    logger.error({ error }, 'Failed to send warning');
  }
}

export async function warnHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

  const target = interaction.options.getUser('target', true);
  const targetId = target.id;
  const message = interaction.options.getString('message', true);
  const voterId = interaction.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    const guild = await interaction.client.guilds.fetch(guildId);

    const voter = await guild.members.fetch(voterId).catch(() => null);
    if (!voter) {
      await interaction.editReply(
        'You must be a member of the configured guild to send warnings.'
      );
      return;
    }
    if (voter.user.bot) {
      await interaction.editReply('Bots cannot send warnings.');
      return;
    }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await interaction.editReply('Target not found in guild.');
      return;
    }

    const voterHash = hmac(voterId, process.env.GUILD_SALT!);

    // Check if user has already warned this target
    const existingWarning = await prisma.vote.findUnique({
      where: {
        guildId_targetUserId_voterHash: {
          guildId,
          targetUserId: targetId,
          voterHash,
        },
      },
    });

    if (existingWarning) {
      await interaction.editReply(
        'You already submit a warning for this user.'
      );
      return;
    }

    // Reply immediately to user
    await interaction.editReply('Warning sent anonymously to moderators.');

    // Handle database and alert operations asynchronously
    (async () => {
      try {
        logger.info({ targetId, message }, 'Creating warning vote');
        await prisma.vote.create({
          data: {
            guildId,
            targetUserId: targetId,
            voterHash,
            message,
          },
        });

        logger.info('Vote created, counting warnings');
        const totalWarningsCount = await prisma.vote.count({
          where: {
            guildId,
            targetUserId: targetId,
          },
        });

        logger.info({ totalWarningsCount }, 'Getting eligible count');
        const eligibleCount = await getEligibleCount(interaction.client);

        logger.info({ eligibleCount }, 'Sending warning to channel');
        await sendWarning(
          interaction.client,
          targetId,
          message,
          totalWarningsCount,
          eligibleCount
        );

        logger.info('Warning processing completed');
      } catch (asyncError) {
        logger.error(
          { error: asyncError, targetId },
          'Async warning processing failed'
        );
      }
    })();
  } catch (error) {
    logger.error(
      { error, command: 'warn', user: interaction.user.id },
      'Warn command error'
    );

    if (interaction.deferred) {
      await interaction.editReply(
        'An error occurred while sending your warning.'
      );
    } else {
      await interaction.reply({
        content: 'An error occurred while sending your warning.',
        flags: 64,
      });
    }
  }
}
