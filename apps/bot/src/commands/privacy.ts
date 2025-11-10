import { SlashCommandBuilder, GatewayIntentBits } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

export const privacyCommand = new SlashCommandBuilder()
  .setName("privacy")
  .setDescription("View privacy and data handling information")
  .toJSON();

export async function privacyHandler(interaction: ChatInputCommandInteraction) {
  const intents = interaction.client.options.intents;
  const hasMessageContent =
    intents?.has(GatewayIntentBits.MessageContent) ?? false;

  const privacyInfo = `**GARY Privacy Information**

**Gateway Intents:**
• Guilds: ✅ Enabled
• DirectMessages: ✅ Enabled
• MessageContent: ${hasMessageContent ? "⚠️ ENABLED" : "❌ Disabled"}`;

  await interaction.reply({
    content: privacyInfo,
    ephemeral: true,
  });
}
