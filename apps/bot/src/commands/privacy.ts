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
The bot can only post messages in one configured moderator channel (<#${process.env.MOD_CHANNEL_ID}>).

**Data Storage:**
• \`guildId\`: The configured guild ID
• \`targetUserId\`: Discord ID of warning targets (plain text for warnings only)
• \`voterHash\`: HMAC-SHA256 hash of sender ID (non-reversible)
• \`message\`: Warning messages (stored in plain text)
• \`createdAt\`: Timestamp of each action

**Privacy Statement:**
The bot cannot read message text; it only receives command interactions in DM. Sender identities are anonymized using one-way hashing. Target IDs are only stored for warnings (not whispers).

**Your Rights:**
The bot owner cannot reverse-engineer sender identities from stored hashes.`;

  await interaction.reply({ 
    content: privacyInfo, 
    ephemeral: true 
  });
}