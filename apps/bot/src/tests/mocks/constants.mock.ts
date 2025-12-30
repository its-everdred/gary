export const mockConstants = {
  NOMINATION_CONFIG: {
    VOTE_PASS_THRESHOLD: 0.8,
    VOTE_DURATION_MINUTES: 7200,
    CLEANUP_DURATION_MINUTES: 1440,
    DISCUSSION_DURATION_MINUTES: 2880,
    DISCUSSION_START_DAY: 1,
    DISCUSSION_START_HOUR: 9,
    DISCUSSION_START_TIMEZONE: 'America/New_York',
    get VOTE_PASS_PERCENT() {
      return Math.round(this.VOTE_PASS_THRESHOLD * 100);
    },
    get CLEANUP_PERIOD_TEXT() {
      const minutes = this.CLEANUP_DURATION_MINUTES;
      if (minutes >= 1440) {
        const days = Math.round(minutes / 1440);
        return days === 1 ? '24 hours' : `${days} days`;
      }
      return `${minutes} minutes`;
    },
    CHANNEL_PREFIXES: {
      DISCUSSION: 'discussion-',
      VOTE: 'vote-'
    }
  }
};