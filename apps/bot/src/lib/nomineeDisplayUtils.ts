import type { Nominee } from '@prisma/client';
import { NomineeState } from '@prisma/client';

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
}