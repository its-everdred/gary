import { Client, TextChannel } from 'discord.js';
import pino from 'pino';

const logger = pino();

export async function sendWarning(
  client: Client, 
  targetUserId: string, 
  message: string,
  recentWarningsCount: number,
  eligibleCount: number
): Promise<void> {
  try {
    const channel = await client.channels.fetch(process.env.MOD_CHANNEL_ID!) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error('Alert channel not found or not text-based');
      return;
    }

    const kickQuorumPercent = parseInt(process.env.KICK_QUORUM_PERCENT || '40') / 100;
    const kickThreshold = Math.ceil(eligibleCount * kickQuorumPercent);
    const warningsUntilKick = kickThreshold - recentWarningsCount;
    
    let warningMessage = `⚠️ **WARN** - An anonymous member warns <@${targetUserId}>:\n` +
      `"${message}"\n` +
      `*This member has received ${recentWarningsCount} warning${recentWarningsCount !== 1 ? 's' : ''} in the last 30 days.*`;
    
    if (warningsUntilKick > 0) {
      warningMessage += ` They are ${warningsUntilKick} more warning${warningsUntilKick !== 1 ? 's' : ''} away from reaching kick quorum.`;
    } else {
      warningMessage += ` **They have reached kick quorum!**`;
    }

    await channel.send(warningMessage);
  } catch (error) {
    logger.error({ error }, 'Failed to send warning');
  }
}

export async function sendWhisper(
  client: Client, 
  message: string
): Promise<void> {
  try {
    const channel = await client.channels.fetch(process.env.MOD_CHANNEL_ID!) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error('Alert channel not found or not text-based');
      return;
    }

    await channel.send(
      `👻 **PSST** - An anonymous member whispers:\n` +
      `"${message}"`
    );
  } catch (error) {
    logger.error({ error }, 'Failed to send whisper');
  }
}