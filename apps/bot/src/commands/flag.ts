import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Client } from 'discord.js';
import pino from 'pino';
import {
  hmac,
  getEligibleCount,
  validateGuildMember,
  validateTargetMember,
  sendToModChannel,
  checkExistingWarning,
  createWarning,
  countWarnings
} from '../lib/utils.js';
import { ConfigService } from '../lib/configService.js';

export const flagCommand = new SlashCommandBuilder()
  .setName('flag')
  .setDescription('Send an anonymous flag about a member')
  .addUserOption((option) =>
    option
      .setName('target')
      .setDescription('The member to flag')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('The flag message to send anonymously')
      .setRequired(true)
  )
  .toJSON();

const logger = pino();

function buildFlagMessage(
  targetUserId: string,
  message: string,
  totalFlagsCount: number,
  eligibleCount: number
): string {
  const kickQuorumPercent = ConfigService.getKickQuorumPercent();
  const kickThreshold = Math.ceil(eligibleCount * kickQuorumPercent);
  const flagsUntilKick = kickThreshold - totalFlagsCount;

  let flagMessage =
    `⚠️ **FLAG** - Anon flags <@${targetUserId}>:\n` +
    `"${message}"\n` +
    `*This member has received ${totalFlagsCount} flag${
      totalFlagsCount !== 1 ? 's' : ''
    } total.*`;

  if (flagsUntilKick > 0) {
    flagMessage += ` They are ${flagsUntilKick} more flag${
      flagsUntilKick !== 1 ? 's' : ''
    } away from reaching kick quorum.`;
  } else {
    flagMessage += ' **They have reached kick quorum!**';
  }

  return flagMessage;
}

async function processFlagAsync(
  client: Client,
  guildId: string,
  targetId: string,
  voterHash: string,
  message: string
): Promise<void> {
  try {
    await createWarning(guildId, targetId, voterHash, message);

    const totalFlagsCount = await countWarnings(guildId, targetId);

    const eligibleCount = await getEligibleCount(client);

    const flagMessage = buildFlagMessage(targetId, message, totalFlagsCount, eligibleCount);
    await sendToModChannel(client, flagMessage);
  } catch (error) {
    logger.error({ error, targetId }, 'Async flag processing failed');
  }
}

export async function flagHandler(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('target', true);
  const targetId = target.id;
  const message = interaction.options.getString('message', true);
  const voterId = interaction.user.id;
  const guildId = ConfigService.getGuildId();

  try {
    // Validate voter
    const voterValidation = await validateGuildMember(interaction.client, guildId, voterId);
    if (!voterValidation.isValid) {
      await interaction.editReply(voterValidation.errorMessage!);
      return;
    }

    // Validate target
    const guild = await interaction.client.guilds.fetch(guildId);
    const targetValidation = await validateTargetMember(guild, targetId);
    if (!targetValidation.isValid) {
      await interaction.editReply(targetValidation.errorMessage!);
      return;
    }

    // Check for existing flag
    const voterHash = hmac(voterId, ConfigService.getGuildSalt());
    const hasExistingWarning = await checkExistingWarning(guildId, targetId, voterHash);
    
    if (hasExistingWarning) {
      await interaction.editReply('You already submit a flag for this user.');
      return;
    }

    // Reply immediately to user
    await interaction.editReply('Flag sent anonymously to moderators.');

    // Process flag asynchronously
    processFlagAsync(interaction.client, guildId, targetId, voterHash, message);
    
  } catch (error) {
    logger.error({ error, command: 'flag', user: interaction.user.id }, 'Flag command error');

    if (interaction.deferred) {
      await interaction.editReply('An error occurred while sending your flag.');
    } else {
      await interaction.reply({
        content: 'An error occurred while sending your flag.',
        flags: 64,
      });
    }
  }
}