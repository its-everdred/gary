import type { ChatInputCommandInteraction } from 'discord.js';
import { NomineeDisplayUtils } from '../../lib/nomineeDisplayUtils.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ConfigService } from '../../lib/configService.js';


export async function handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();
    
    const nominees = await NomineeDisplayUtils.getNomineesInQueueOrder(guildId);

    const queueEmbed = NomineeDisplayUtils.createQueueEmbed(nominees);
    await interaction.reply({
      embeds: [queueEmbed],
      flags: 64 // EPHEMERAL
    });

  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'nominate list',
      'fetching the nominations list'
    );
  }
}