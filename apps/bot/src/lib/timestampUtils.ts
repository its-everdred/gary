/**
 * Utility functions for Discord timestamp formatting
 */

export class TimestampUtils {
  /**
   * Formats a Discord timestamp
   * @param date - The date to format
   * @param format - Discord timestamp format (t=time, T=long time, d=date, D=long date, f=full, F=long full, R=relative)
   */
  static formatDiscordTimestamp(date: Date, format: string = 't'): string {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${format}>`;
  }

  /**
   * Creates a time range footer text for regular message content
   * @param startDate - Start date
   * @param endDate - End date
   * @param prefix - Optional prefix text
   */
  static createTimeRangeMessage(startDate: Date | null, endDate: Date | null, prefix?: string): string {
    if (!startDate || !endDate) {
      return prefix || '';
    }

    const parts = [];
    if (prefix) {
      parts.push(prefix);
    }
    parts.push(`Began ${this.formatDiscordTimestamp(startDate)}`);
    parts.push(`Ends ${this.formatDiscordTimestamp(endDate)}`);
    
    return parts.join(' • ');
  }

  /**
   * Creates a simple footer text for embeds (timestamps should use embed.timestamp field)
   * @param startDate - Start date
   * @param endDate - End date
   * @param prefix - Optional prefix text
   */
  static createTimeRangeFooter(startDate: Date | null, endDate: Date | null, prefix?: string): string {
    if (!startDate || !endDate) {
      return prefix || '';
    }

    const parts = [];
    if (prefix) {
      parts.push(prefix);
    }
    
    // Format dates as readable strings for embed footers
    const startStr = startDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const endStr = endDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    parts.push(`Began ${startStr}`);
    parts.push(`Ends ${endStr}`);
    
    return parts.join(' • ');
  }

  /**
   * Creates a vote result footer
   * @param voteStart - Vote start date
   * @param voteEnd - Vote end date
   * @param passed - Whether the vote passed
   */
  static createVoteResultFooter(voteStart: Date | null, voteEnd: Date | null, passed: boolean): string {
    if (!voteStart || !voteEnd) {
      return passed ? 'Vote Passed' : 'Vote Failed';
    }

    const status = passed ? 'Passed' : 'Failed';
    return `Vote ${status} • Started ${this.formatDiscordTimestamp(voteStart)} • Ended ${this.formatDiscordTimestamp(voteEnd)}`;
  }
}