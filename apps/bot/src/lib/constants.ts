import { ConfigService } from './configService.js';

export const NOMINATION_CONFIG = {
  DISCUSSION_DURATION_MINUTES: parseInt(
    process.env.NOMINATE_DISCUSSION_PERIOD_MINUTES || '2880'
  ),
  VOTE_DURATION_MINUTES: parseInt(
    process.env.NOMINATE_VOTE_PERIOD_MINUTES || '7200'
  ),
  CERTIFY_DURATION_MINUTES: parseInt(
    process.env.NOMINATE_CERTIFY_PERIOD_MINUTES || '1440'
  ), // 24 hours default

  DISCUSSION_START_DAY: 1, // Monday = 1
  DISCUSSION_START_HOUR: 9, // 9 AM
  DISCUSSION_START_TIMEZONE: 'America/New_York', // ET

  VOTE_PASS_THRESHOLD: 0.8, // 80% yes votes to pass
  
  // Helper to get vote pass percentage as integer
  get VOTE_PASS_PERCENT(): number {
    return Math.round(this.VOTE_PASS_THRESHOLD * 100);
  },

  // Helper to get certify period as human readable string
  get CERTIFY_PERIOD_TEXT(): string {
    const minutes = this.CERTIFY_DURATION_MINUTES;
    if (minutes >= 1440) {
      const days = Math.round(minutes / 1440);
      return days === 1 ? '24 hours' : `${days} days`;
    } else if (minutes >= 60) {
      const hours = Math.round(minutes / 60);
      return hours === 1 ? '1 hour' : `${hours} hours`;
    } else {
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    }
  },

  CHANNEL_PREFIXES: {
    DISCUSSION: 'discussion-',
    VOTE: 'vote-',
  },

  CHANNELS: {
    GOVERNANCE: ConfigService.getGovernanceChannelId() || '',
    GENERAL: ConfigService.getGeneralChannelId() || '',
    MOD_FLAG: ConfigService.getModFlagChannelId() || '',
    MOD_COMMS: ConfigService.getModCommsChannelId() || '',
  },
  CATEGORIES: {
    NOMINATIONS: ConfigService.getNominationsCategoryId() || '',
  },
} as const;

export const NOMINATION_MESSAGES = {
  NOMINATION_CREATED: (nominator: string, name: string, startTime: string) =>
    `Member ${nominator} has nominated ${name} for invitation. Discussion period will begin ${startTime}.`,

  NOMINATION_CREATED_QUEUED: (
    nominator: string,
    name: string,
    startTime: string
  ) =>
    `Member ${nominator} has nominated ${name} for invitation. Discussion period will begin ${startTime} after all existing nominations are resolved.`,

  VOTE_MESSAGE: (
    name: string,
    discussionLink: string,
    startTimestamp: string,
    endTimestamp: string
  ) =>
    `Should we invite ${name}?\n\nAs per discussion ${discussionLink}, the anonymous vote for ${name} is now LIVE for the next ${Math.round(
      parseInt(process.env.NOMINATE_VOTE_PERIOD_MINUTES || '7200') / 1440
    )} days.\n\nStart: ${startTimestamp}\nEnd: ${endTimestamp}`,

  VOTE_EMOJI_MESSAGE:
    'Though not required, you are welcome click the :PepeVoted: emoji to indicate that you have voted, so we have a sense of whether quorum has been achieved.',

  RESULTS: {
    PASSED: (
      name: string,
      yesVotes: number,
      noVotes: number,
      nominator: string
    ) =>
      `The vote to invite ${name} PASSED with ${yesVotes} Yes votes, ${noVotes} No votes. An invite link will be sent to ${nominator} in 24 hours.`,

    FAILED_VOTES: (
      name: string,
      yesVotes: number,
      noVotes: number,
      yesPercent: number
    ) =>
      `The vote to invite ${name} FAILED with ${yesVotes} yes votes, ${noVotes} No votes. (Only ${yesPercent}% yes)`,

    FAILED_QUORUM: (name: string, votePercent: number) =>
      `The vote to invite ${name} FAILED to meet quorum with only ${votePercent}% of members voting.`,
  },
} as const;

export const ERROR_MESSAGES = {
  NOMINATION_IN_PROGRESS:
    'There is already a nomination in progress. Please wait until it completes.',
  NOMINEE_NOT_FOUND: 'Nominee not found.',
  NOMINEE_ALREADY_EXISTS: 'A nomination for this person already exists.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to use this command.',
  INVALID_STATE_TRANSITION:
    'Cannot perform this action in the current nomination state.',
} as const;

export const createPassedMessage = (name: string, yesVotes: number, noVotes: number, nominator: string): string => {
  return `The vote to invite ${name} PASSED with ${yesVotes} Yes votes, ${noVotes} No votes. An invite link will be sent to ${nominator} in ${NOMINATION_CONFIG.CERTIFY_PERIOD_TEXT}.`;
};
