import { Client } from 'discord.js';

export async function getEligibleCount(client: Client): Promise<number> {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  
  // Use approximate count to avoid fetching all members
  const totalCount = guild.approximateMemberCount || guild.memberCount || 0;
  
  // Estimate ~90% are real users (10% bots)
  return Math.max(1, Math.floor(totalCount * 0.9));
}