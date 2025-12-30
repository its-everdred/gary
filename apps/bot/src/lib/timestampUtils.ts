/**
 * Utility functions for Discord timestamp formatting
 */

export class TimestampUtils {
  /**
   * Formats a Discord timestamp
   * @param date - The date to format
   * @param format - Discord timestamp format (t=time, T=long time, d=date, D=long date, f=full, F=long full, R=relative)
   */
  static formatDiscordTimestamp(date: Date, format: string = "t"): string {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${format}>`;
  }

  /**
   * Creates a time range footer text for regular message content
   * @param startDate - Start date
   * @param endDate - End date
   * @param prefix - Optional prefix text
   */
  static createTimeRangeMessage(
    startDate: Date | null,
    endDate: Date | null,
    prefix?: string
  ): string {
    if (!startDate || !endDate) {
      return prefix || "";
    }

    const parts = [];
    if (prefix) {
      parts.push(prefix);
    }
    parts.push(`Began ${this.formatDiscordTimestamp(startDate)}`);
    parts.push(`Ends ${this.formatDiscordTimestamp(endDate)}`);

    return parts.join(" • ");
  }

}
