import { Client, Guild, TextChannel } from 'discord.js';
import { createHmac } from 'crypto';
import pino from 'pino';
import { prisma } from './db.js';

const logger = pino();

// Crypto utilities
export function hmac(userId: string, salt: string): string {
  return createHmac('sha256', salt)
    .update(userId)
    .digest('hex');
}

// Guild utilities
export async function getEligibleCount(client: Client): Promise<number> {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  return guild.memberCount || 1;
}

// Validation utilities
export async function validateGuildMember(
  client: Client,
  guildId: string,
  userId: string
): Promise<{ isValid: boolean; errorMessage?: string }> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    
    if (!member) {
      return { isValid: false, errorMessage: 'You must be a member of the configured guild.' };
    }
    
    if (member.user.bot) {
      return { isValid: false, errorMessage: 'Bots cannot use this command.' };
    }
    
    return { isValid: true };
  } catch {
    return { isValid: false, errorMessage: 'Failed to validate guild membership.' };
  }
}

export async function validateTargetMember(
  guild: Guild,
  targetId: string
): Promise<{ isValid: boolean; errorMessage?: string }> {
  try {
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    
    if (!targetMember) {
      return { isValid: false, errorMessage: 'Target not found in guild.' };
    }
    
    return { isValid: true };
  } catch {
    return { isValid: false, errorMessage: 'Failed to validate target member.' };
  }
}

// Channel utilities
export async function sendToModChannel(
  client: Client,
  message: string
): Promise<void> {
  try {
    const channel = (await client.channels.fetch(
      process.env.MOD_WARN_CHANNEL_ID!
    )) as TextChannel;
    
    if (!channel || !channel.isTextBased()) {
      logger.error('Mod channel not found or not text-based');
      return;
    }

    await channel.send(message);
  } catch (error) {
    logger.error({ error }, 'Failed to send message to mod channel');
  }
}

// Warn utilities
export async function checkExistingWarning(
  guildId: string,
  targetUserId: string,
  voterHash: string
): Promise<boolean> {
  const existingWarning = await prisma.warn.findUnique({
    where: {
      guildId_targetUserId_voterHash: {
        guildId,
        targetUserId,
        voterHash,
      },
    },
  });
  
  return !!existingWarning;
}

export async function createWarning(
  guildId: string,
  targetUserId: string,
  voterHash: string,
  message: string
): Promise<void> {
  await prisma.warn.create({
    data: {
      guildId,
      targetUserId,
      voterHash,
      message,
    },
  });
}

export async function countWarnings(
  guildId: string,
  targetUserId: string
): Promise<number> {
  return await prisma.warn.count({
    where: {
      guildId,
      targetUserId,
    },
  });
}

