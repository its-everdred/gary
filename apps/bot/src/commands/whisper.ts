import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { prisma } from '../lib/db.js';
import { 
  validateGuildMember, 
  sendToModChannel,
  hmac
} from '../lib/utils.js';

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

async function checkWhisperRateLimit(
  guildId: string,
  userHash: string
): Promise<{ canWhisper: boolean; nextAllowedTime?: Date }> {
  const rateLimitMins = parseInt(process.env.WHISPER_RATE_LIMIT_MINS || '60');
  const rateLimitTime = new Date();
  rateLimitTime.setMinutes(rateLimitTime.getMinutes() - rateLimitMins);

  const recentWhisper = await prisma.whisper.findFirst({
    where: {
      guildId,
      userHash,
      createdAt: {
        gte: rateLimitTime,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (recentWhisper) {
    const nextAllowedTime = new Date(recentWhisper.createdAt);
    nextAllowedTime.setMinutes(nextAllowedTime.getMinutes() + rateLimitMins);
    return { canWhisper: false, nextAllowedTime };
  }

  return { canWhisper: true };
}

async function recordWhisper(
  guildId: string,
  userHash: string
): Promise<void> {
  await prisma.whisper.create({
    data: {
      guildId,
      userHash,
    },
  });
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

    // Check rate limit
    const userHash = hmac(userId, process.env.GUILD_SALT!);
    const rateLimit = await checkWhisperRateLimit(guildId, userHash);
    
    if (!rateLimit.canWhisper) {
      const minutesLeft = Math.ceil((rateLimit.nextAllowedTime!.getTime() - Date.now()) / 60000);
      await interaction.editReply(`You can whisper again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
      return;
    }

    // Reply immediately and send whisper asynchronously
    await interaction.editReply('Whisper sent anonymously to moderators.');
    
    // Record whisper and send to mod channel
    await recordWhisper(guildId, userHash);
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