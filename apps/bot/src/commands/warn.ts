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

function buildWarningMessage(
  targetUserId: string,
  message: string,
  totalWarningsCount: number,
  eligibleCount: number
): string {
  const kickQuorumPercent = ConfigService.getKickQuorumPercent();
  const kickThreshold = Math.ceil(eligibleCount * kickQuorumPercent);
  const warningsUntilKick = kickThreshold - totalWarningsCount;

  let warningMessage =
    `⚠️ **WARN** - Anon warns <@${targetUserId}>:\n` +
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

  return warningMessage;
}

async function processWarningAsync(
  client: Client,
  guildId: string,
  targetId: string,
  voterHash: string,
  message: string
): Promise<void> {
  try {
    await createWarning(guildId, targetId, voterHash, message);

    const totalWarningsCount = await countWarnings(guildId, targetId);

    const eligibleCount = await getEligibleCount(client);

    const warningMessage = buildWarningMessage(targetId, message, totalWarningsCount, eligibleCount);
    await sendToModChannel(client, warningMessage);
  } catch (error) {
    logger.error({ error, targetId }, 'Async warning processing failed');
  }
}

export async function warnHandler(interaction: ChatInputCommandInteraction) {
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

    // Check for existing warning
    const voterHash = hmac(voterId, ConfigService.getGuildSalt());
    const hasExistingWarning = await checkExistingWarning(guildId, targetId, voterHash);
    
    if (hasExistingWarning) {
      await interaction.editReply('You already submit a warning for this user.');
      return;
    }

    // Reply immediately to user
    await interaction.editReply('Warning sent anonymously to moderators.');

    // Process warning asynchronously
    processWarningAsync(interaction.client, guildId, targetId, voterHash, message);
    
  } catch (error) {
    logger.error({ error, command: 'warn', user: interaction.user.id }, 'Warn command error');

    if (interaction.deferred) {
      await interaction.editReply('An error occurred while sending your warning.');
    } else {
      await interaction.reply({
        content: 'An error occurred while sending your warning.',
        flags: 64,
      });
    }
  }
}