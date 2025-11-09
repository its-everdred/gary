import { SlashCommandBuilder, GatewayIntentBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export const privacyCommand = new SlashCommandBuilder()
  .setName('privacy')
  .setDescription('View privacy and data handling information')
  .toJSON();

export async function privacyHandler(interaction: ChatInputCommandInteraction) {
  const intents = interaction.client.options.intents;
  const hasMessageContent = intents?.has(GatewayIntentBits.MessageContent) ?? false;

  const privacyInfo = `**GARY Privacy Information**

**Gateway Intents:**
• Guilds: ✅ Enabled
• DirectMessages: ✅ Enabled
• MessageContent: ${hasMessageContent ? '⚠️ ENABLED' : '❌ Disabled'}

**Permissions:**
The bot can only post alerts in one configured channel (<#${process.env.ALERT_CHANNEL_ID}>).

**Data Storage:**
• \`guildId\`: The configured guild ID
• \`targetUserId\`: Discord ID of vote targets (plain text)
• \`voterHash\`: HMAC-SHA256 hash of voter ID (non-reversible)
• \`createdAt\`: Timestamp of each vote

**Privacy Statement:**
The bot cannot read message text; it only receives command interactions in DM. Voter identities are anonymized using one-way hashing. Only target IDs are stored in plain text for alert notifications.

**Your Rights:**
Use \`/history\` to see your voting record. The bot owner cannot reverse-engineer voter identities from stored hashes.`;

  await interaction.reply({ 
    content: privacyInfo, 
    ephemeral: true 
  });
}