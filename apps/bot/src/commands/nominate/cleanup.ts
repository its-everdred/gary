import type { ChatInputCommandInteraction } from 'discord.js';
import { NomineeState } from '@prisma/client';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ConfigService } from '../../lib/configService.js';
import { NomineeStateManager } from '../../lib/nomineeService.js';
import { NominationJobScheduler } from '../../lib/jobScheduler.js';
import { DISCORD_CONSTANTS } from '../../lib/discordConstants.js';

export async function handleCleanupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();

    // Validate moderator permissions
    const modValidation = await CommandUtils.validateModeratorAccess(interaction, guildId);
    if (!modValidation.isValid) {
      return;
    }

    // Find nominee in CLEANUP state
    const nominee = await NomineeStateManager.getCurrentNomineeInState(guildId, NomineeState.CLEANUP);
    
    if (!nominee) {
      await interaction.reply({
        content: '❌ No nominee found in CLEANUP state. Cleanup command only works during the cleanup period.',
        flags: DISCORD_CONSTANTS.MESSAGE_FLAGS.EPHEMERAL
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Perform cleanup using existing job scheduler logic
    const jobScheduler = NominationJobScheduler.getInstance(interaction.client);
    const result = await jobScheduler.performPostCleanupCleanup(nominee);

    if (result.success) {
      await interaction.editReply({
        content: `✅ **Cleanup completed for ${nominee.name}**\n\n` +
                 '• Transitioned to PAST state\n' +
                 '• Deleted discussion and vote channels\n' +
                 '• Posted cleanup instructions to mod-comms\n' +
                 '• Started next nominee if available'
      });
    } else {
      await interaction.editReply({
        content: `❌ **Cleanup failed for ${nominee.name}**\n\nError: ${result.errorMessage}`
      });
    }

  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'mod nominate cleanup',
      'performing cleanup'
    );
  }
}