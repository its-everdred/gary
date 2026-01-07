import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { NomineeDisplayUtils } from '../../lib/nomineeDisplayUtils.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ConfigService } from '../../lib/configService.js';

const logger = pino();

export async function handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();
    
    logger.info({
      userId: interaction.user.id,
      username: interaction.user.username,
      guildId,
      channelId: interaction.channelId
    }, 'User requested nomination list');
    
    const nominees = await NomineeDisplayUtils.getNomineesInQueueOrder(guildId);

    logger.debug({
      nomineeCount: nominees.length,
      nominees: nominees.map(n => ({ name: n.name, state: n.state }))
    }, 'Retrieved nomination queue');

    const queueEmbed = await NomineeDisplayUtils.createQueueEmbed(nominees);
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