import type { Nominee } from '@prisma/client';
import { NomineeState } from '@prisma/client';
import type { DiscordEmbed } from './voteResultService.js';
import { prisma } from './db.js';

export interface NomineeDisplayOptions {
  showHeader?: boolean;
  headerText?: string;
  includePosition?: boolean;
}

export class NomineeDisplayUtils {
  /**
   * Gets all non-PAST nominees sorted by queue priority
   */
  static async getNomineesInQueueOrder(guildId: string): Promise<Nominee[]> {
    const nominees = await prisma.nominee.findMany({
      where: {
        guildId,
        state: {
          not: NomineeState.PAST
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Sort nominees by correct queue priority
    nominees.sort((a, b) => {
      // Define state priority order
      const statePriority = {
        [NomineeState.DISCUSSION]: 1,
        [NomineeState.VOTE]: 2,
        [NomineeState.CERTIFY]: 3,
        [NomineeState.ACTIVE]: 4
      };

      // First, sort by state priority
      const aPriority = statePriority[a.state];
      const bPriority = statePriority[b.state];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // For ACTIVE nominees, sort by discussionStart time
      if (a.state === NomineeState.ACTIVE && b.state === NomineeState.ACTIVE) {
        if (a.discussionStart && b.discussionStart) {
          return a.discussionStart.getTime() - b.discussionStart.getTime();
        }
        if (a.discussionStart && !b.discussionStart) return -1;
        if (!a.discussionStart && b.discussionStart) return 1;
      }

      // Fall back to creation time
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return nominees;
  }

  /**
   * Formats a Discord timestamp for display
   */
  static formatDiscordTimestamp(date: Date, format: 'f' | 'F' | 'R' | 't' | 'T' | 'd' | 'D' = 'R'): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:${format}>`;
  }

  /**
   * Formats duration in minutes to a human-readable string
   */
  static formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    } else {
      const hours = Math.round(minutes / 60);
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
  }

  /**
   * Formats a single nominee entry for display
   */
  static formatNomineeEntry(nominee: Nominee, position?: number): string {
    const nominator = nominee.nominator; // Don't ping - just show username
    const positionPrefix = position ? `**${position}.** ` : '';
    
    if (nominee.state === NomineeState.VOTE && nominee.certifyStart) {
      const endTime = this.formatDiscordTimestamp(nominee.certifyStart);
      return `${positionPrefix}${nominee.name} *(by ${nominator})* • Vote ends ${endTime}`;
    } else if (nominee.state === NomineeState.DISCUSSION && nominee.voteStart) {
      const voteTime = this.formatDiscordTimestamp(nominee.voteStart);
      return `${positionPrefix}${nominee.name} *(by ${nominator})* • Vote begins ${voteTime}`;
    } else if (nominee.state === NomineeState.CERTIFY) {
      return `${positionPrefix}${nominee.name} *(by ${nominator})* • Results pending`;
    } else if (nominee.state === NomineeState.ACTIVE && nominee.discussionStart) {
      const discussionTime = this.formatDiscordTimestamp(nominee.discussionStart);
      return `${positionPrefix}${nominee.name} *(by ${nominator})* • Discussion ${discussionTime}`;
    } else {
      return `${positionPrefix}${nominee.name} *(by ${nominator})* • Pending schedule`;
    }
  }

  /**
   * Formats a list of nominees for display
   */
  static formatNomineeList(nominees: Nominee[], options: NomineeDisplayOptions = {}): string {
    const {
      showHeader = true,
      headerText = '**Current Nominations:**',
      includePosition = true
    } = options;

    if (nominees.length === 0) {
      return showHeader ? `${headerText} None` : 'None';
    }

    const lines: string[] = [];
    
    if (showHeader) {
      lines.push(headerText);
    }
    
    nominees.forEach((nominee, index) => {
      const position = includePosition ? index + 1 : undefined;
      lines.push(this.formatNomineeEntry(nominee, position));
    });
    
    return lines.join('\n');
  }

  /**
   * Formats nominee queue for governance announcements
   */
  static formatNominationQueue(nominees: Nominee[]): string {
    if (nominees.length === 0) {
      return '\n\n**Current Queue:** Empty';
    }

    const queueLines = ['\n\n**Current Queue:**'];
    
    nominees.forEach((nominee, index) => {
      const position = index + 1;
      queueLines.push(this.formatNomineeEntry(nominee, position));
    });
    
    return queueLines.join('\n');
  }

  /**
   * Creates the formatted queue display for embeds
   */
  static formatQueueForEmbed(nominees: Nominee[]): string {
    if (nominees.length === 0) {
      return 'No nominees in queue';
    }

    return nominees.map((nominee, index) => {
      const position = index + 1;
      const status = this.getStatusDisplay(nominee);
      
      return `\`${position.toString().padEnd(2)}\` **${nominee.name}** *by ${nominee.nominator}* • ${status}`;
    }).join('\n');
  }

  /**
   * Creates an embed for nomination announcements with queue
   */
  static createNominationEmbed(nomineeName: string, nominatorName: string, moderatorName: string | null, nominees: Nominee[]): DiscordEmbed {
    const embed = {
      title: '📋 New Nomination',
      description: moderatorName 
        ? `**${nomineeName}** has been nominated by ${nominatorName} (via ${moderatorName}).`
        : `**${nomineeName}** has been nominated by ${nominatorName}.`,
      color: 0x3498db,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Governance • Nomination Queue'
      }
    };

    if (nominees.length > 0) {
      embed.fields.push({
        name: '📊 Current Queue',
        value: this.formatQueueForEmbed(nominees),
        inline: false
      });
    }

    return embed;
  }

  /**
   * Creates an embed for displaying the current nomination queue
   */
  static createQueueEmbed(nominees: Nominee[]): DiscordEmbed {
    const embed = {
      title: '📊 Current Nominations',
      color: 0x3498db,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Governance • Nomination Queue'
      }
    };

    embed.fields.push({
      name: nominees.length === 0 ? 'Queue Status' : `Queue (${nominees.length} nominee${nominees.length === 1 ? '' : 's'})`,
      value: this.formatQueueForEmbed(nominees),
      inline: false
    });

    return embed;
  }

  /**
   * Gets complete status display for a nominee
   */
  private static getStatusDisplay(nominee: Nominee): string {
    if (nominee.state === NomineeState.VOTE && nominee.certifyStart) {
      return `Vote active ${this.formatDiscordTimestamp(nominee.certifyStart)} 🗳️`;
    } else if (nominee.state === NomineeState.DISCUSSION && nominee.voteStart) {
      return `Currently in discussion ${this.formatDiscordTimestamp(nominee.voteStart)} 🗣️`;
    } else if (nominee.state === NomineeState.CERTIFY) {
      return 'Results pending ⏳';
    } else if (nominee.state === NomineeState.ACTIVE && nominee.discussionStart) {
      return `Scheduled for discussion ${this.formatDiscordTimestamp(nominee.discussionStart)} 📅`;
    } else {
      return 'Pending schedule ⏳';
    }
  }
}