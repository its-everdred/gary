import type { ChatInputCommandInteraction } from 'discord.js';
import pino from 'pino';
import { validateModeratorPermission } from './permissions.js';

const logger = pino();

export interface CommandData {
  guildId: string;
  userId: string;
  username: string;
}

export interface PermissionValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export class CommandUtils {
  /**
   * Handles command errors consistently across all commands
   */
  static async handleCommandError(
    interaction: ChatInputCommandInteraction,
    error: unknown,
    commandName: string,
    action: string
  ): Promise<void> {
    logger.error(
      { error, command: commandName, user: interaction.user.id },
      `${commandName} command error`
    );

    const content = interaction.replied || interaction.deferred
      ? `❌ **Error**\n\nAn error occurred while ${action}.`
      : `❌ An error occurred while ${action}.`;

    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ 
        content, 
        flags: 64 // EPHEMERAL
      });
    }
  }

  /**
   * Validates moderator access for commands that require it
   */
  static async validateModeratorAccess(
    interaction: ChatInputCommandInteraction,
    guildId: string
  ): Promise<PermissionValidationResult> {
    const permissionResult = await validateModeratorPermission(
      interaction.client,
      guildId,
      interaction.user.id
    );

    if (!permissionResult.isValid) {
      await interaction.reply({
        content: `❌ **Access Denied**\n\n${permissionResult.errorMessage}`,
        flags: 64 // EPHEMERAL
      });
      return { isValid: false, errorMessage: permissionResult.errorMessage };
    }

    return { isValid: true };
  }

  /**
   * Extracts basic command data from interaction
   */
  static extractCommandData(interaction: ChatInputCommandInteraction): CommandData | null {
    const guildId = interaction.guildId;
    if (!guildId) {
      return null;
    }

    return {
      guildId,
      userId: interaction.user.id,
      username: interaction.user.username
    };
  }

  /**
   * Validates guild context for commands that require it
   */
  static async validateGuildContext(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: 64 // EPHEMERAL
      });
      return false;
    }
    return true;
  }

  /**
   * Generic error reply for simple error cases
   */
  static async replyWithError(
    interaction: ChatInputCommandInteraction,
    message: string,
    ephemeral: boolean = true
  ): Promise<void> {
    await interaction.reply({
      content: `❌ ${message}`,
      flags: ephemeral ? 64 : undefined
    });
  }

  /**
   * Generic success reply for simple success cases
   */
  static async replyWithSuccess(
    interaction: ChatInputCommandInteraction,
    message: string,
    ephemeral: boolean = true
  ): Promise<void> {
    await interaction.reply({
      content: `✅ ${message}`,
      flags: ephemeral ? 64 : undefined
    });
  }
}