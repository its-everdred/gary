import { Client, TextChannel } from 'discord.js';
import pino from 'pino';

const logger = pino();

export async function sendQuorumAlert(
  client: Client, 
  targetUserId: string, 
  voteCount: number,
  eligibleCount: number
): Promise<void> {
  try {
    const channel = await client.channels.fetch(process.env.ALERT_CHANNEL_ID!) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error('Alert channel not found or not text-based');
      return;
    }

    const percentage = Math.round((voteCount / eligibleCount) * 100);
    const modRoleId = process.env.MOD_ROLE_ID;
    
    await channel.send(
      '🚨 **Quorum Reached**\n' +
      `Target: <@${targetUserId}>\n` +
      `Votes: ${voteCount}/${eligibleCount} (${percentage}%)\n` +
      (modRoleId ? `<@&${modRoleId}>` : '')
    );
  } catch (error) {
    logger.error({ error }, 'Failed to send quorum alert');
  }
}