import { Client } from 'discord.js';

export async function getEligibleCount(client: Client): Promise<number> {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  
  try {
    const members = await guild.members.fetch();
    return members.filter(member => !member.user.bot).size;
  } catch {
    return guild.approximateMemberCount || guild.memberCount;
  }
}