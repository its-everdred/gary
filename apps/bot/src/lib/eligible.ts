import { Client } from 'discord.js';

export async function getEligibleCount(client: Client): Promise<number> {
  const override = parseInt(process.env.ELIGIBLE_COUNT_OVERRIDE || '0');
  if (override > 0) return override;

  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  
  try {
    const members = await guild.members.fetch();
    return members.filter(member => !member.user.bot).size;
  } catch {
    return guild.approximateMemberCount || guild.memberCount;
  }
}