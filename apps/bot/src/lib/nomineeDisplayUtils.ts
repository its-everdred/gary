import type { Nominee } from '@prisma/client';
import { NomineeState } from '@prisma/client';
import type { EmbedBuilder } from 'discord.js';

export interface NomineeDisplayOptions {
  showHeader?: boolean;
  headerText?: string;
  includePosition?: boolean;
}

export class NomineeDisplayUtils {
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
   * Creates an embed for nomination announcements with queue
   */
  static createNominationEmbed(nomineeName: string, nominatorName: string, moderatorName: string | null, nominees: Nominee[]): any {
    const embed = {
      title: '📋 New Nomination',
      description: moderatorName 
        ? `**${nomineeName}** has been nominated for membership by ${nominatorName} (via ${moderatorName}).`
        : `**${nomineeName}** has been nominated for membership by ${nominatorName}.`,
      color: 0x3498db,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Governance • Nomination Queue'
      }
    };

    if (nominees.length > 0) {
      // Create table-like format for queue
      const queueTable = nominees.map((nominee, index) => {
        const position = index + 1;
        const state = this.getStateDisplay(nominee);
        const timing = this.getTimingDisplay(nominee);
        
        // Use code block for aligned table
        return `\`${position.toString().padEnd(2)}\` **${nominee.name}**\n    └ *by ${nominee.nominator}* • ${state} ${timing}`;
      }).join('\n\n');

      embed.fields.push({
        name: '📊 Current Queue',
        value: queueTable || 'No nominees in queue',
        inline: false
      });
    }

    return embed;
  }

  /**
   * Gets state display text for a nominee
   */
  private static getStateDisplay(nominee: Nominee): string {
    switch (nominee.state) {
      case NomineeState.VOTE:
        return '🗳️ Voting';
      case NomineeState.DISCUSSION:
        return '💬 Discussion';
      case NomineeState.CERTIFY:
        return '⏳ Results pending';
      case NomineeState.ACTIVE:
        return '📅 Scheduled';
      default:
        return nominee.state.toLowerCase();
    }
  }

  /**
   * Gets timing display for a nominee
   */
  private static getTimingDisplay(nominee: Nominee): string {
    if (nominee.state === NomineeState.VOTE && nominee.certifyStart) {
      return `ends ${this.formatDiscordTimestamp(nominee.certifyStart)}`;
    } else if (nominee.state === NomineeState.DISCUSSION && nominee.voteStart) {
      return `vote ${this.formatDiscordTimestamp(nominee.voteStart)}`;
    } else if (nominee.state === NomineeState.ACTIVE && nominee.discussionStart) {
      return `starts ${this.formatDiscordTimestamp(nominee.discussionStart)}`;
    } else {
      return '';
    }
  }
}