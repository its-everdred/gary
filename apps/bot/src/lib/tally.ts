import { prisma } from './db.js';

export async function getVoteCount(guildId: string, targetUserId: string): Promise<number> {
  const count = await prisma.vote.count({
    where: {
      guildId,
      targetUserId,
    },
  });
  return count;
}