import type { Client } from 'discord.js';
import pino from 'pino';

const logger = pino();

export interface PermissionResult {
  isValid: boolean;
  errorMessage?: string;
}

export async function validateModeratorPermission(
  client: Client,
  guildId: string,
  userId: string
): Promise<PermissionResult> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return {
        isValid: false,
        errorMessage: 'You must be a member of this server to use this command.'
      };
    }

    // Check for administrator permission or specific moderator roles
    if (member.permissions.has('Administrator')) {
      return { isValid: true };
    }

    // Check for manage server permission (common mod permission)
    if (member.permissions.has('ManageGuild')) {
      return { isValid: true };
    }

    // Check for kick members permission (another common mod permission)
    if (member.permissions.has('KickMembers')) {
      return { isValid: true };
    }

    // Check for ban members permission
    if (member.permissions.has('BanMembers')) {
      return { isValid: true };
    }

    // Check for manage messages permission
    if (member.permissions.has('ManageMessages')) {
      return { isValid: true };
    }

    // TODO: Add role-based checking if specific mod roles are configured
    // const modRoleId = process.env.MOD_ROLE_ID;
    // if (modRoleId && member.roles.cache.has(modRoleId)) {
    //   return { isValid: true };
    // }

    return {
      isValid: false,
      errorMessage: 'You do not have permission to use this moderator command.'
    };

  } catch (error) {
    logger.error({ error, guildId, userId }, 'Error validating moderator permissions');
    return {
      isValid: false,
      errorMessage: 'An error occurred while checking your permissions.'
    };
  }
}

export async function validateNominatorUser(
  client: Client,
  guildId: string,
  nominatorUserId: string
): Promise<PermissionResult> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(nominatorUserId).catch(() => null);

    if (!member) {
      return {
        isValid: false,
        errorMessage: 'The specified nominator is not a member of this server.'
      };
    }

    if (member.user.bot) {
      return {
        isValid: false,
        errorMessage: 'Bots cannot be used as nominators.'
      };
    }

    return { isValid: true };

  } catch (error) {
    logger.error({ error, guildId, nominatorUserId }, 'Error validating nominator user');
    return {
      isValid: false,
      errorMessage: 'An error occurred while validating the nominator.'
    };
  }
}