export const NOMINATION_CONFIG = {
  DISCUSSION_DURATION_MINUTES: parseInt(process.env.NOMINATE_DISCUSSION_PERIOD_MINUTES || '2880'),
  VOTE_DURATION_MINUTES: parseInt(process.env.NOMINATE_VOTE_PERIOD_MINUTES || '7200'),
  CERTIFY_DURATION_MINUTES: 1440, // 24 hours
  
  DISCUSSION_START_DAY: 1, // Monday = 1
  DISCUSSION_START_HOUR: 9, // 9 AM
  DISCUSSION_START_TIMEZONE: 'America/New_York', // ET
  
  VOTE_QUORUM_THRESHOLD: 0.4, // 40% of members must vote
  VOTE_PASS_THRESHOLD: 0.8, // 80% yes votes to pass
  
  CHANNEL_PREFIXES: {
    DISCUSSION: 'discussion-',
    VOTE: 'vote-'
  },
  
  CHANNELS: {
    GA_GOVERNANCE: process.env.GOVERNANCE_CHANNEL_ID || '',
    GENERAL: process.env.GENERAL_CHANNEL_ID || '',
    MOD: process.env.MOD_CHANNEL_ID || ''
  }
} as const;

export const NOMINATION_MESSAGES = {
  NOMINATION_CREATED: (nominator: string, name: string, startTime: string) =>
    `Member ${nominator} has nominated ${name} for invitation to GA. Discussion period will begin ${startTime}.`,
  
  NOMINATION_CREATED_QUEUED: (nominator: string, name: string, startTime: string) =>
    `Member ${nominator} has nominated ${name} for invitation to GA. Discussion period will begin ${startTime} after all existing nominations are resolved.`,
  
  VOTE_MESSAGE: (name: string, discussionLink: string, startTimestamp: string, endTimestamp: string) =>
    `Should we invite ${name} to GA?\n\nAs per discussion ${discussionLink}, the anonymous vote for ${name} is now LIVE for the next ${Math.round(parseInt(process.env.NOMINATE_VOTE_PERIOD_MINUTES || '7200') / 1440)} days.\n\nStart: ${startTimestamp}\nEnd: ${endTimestamp}`,
  
  VOTE_EMOJI_MESSAGE: 'Though not required, you are welcome click the :PepeVoted: emoji to indicate that you have voted, so we have a sense of whether quorum has been achieved.',
  
  RESULTS: {
    PASSED: (name: string, yesVotes: number, noVotes: number, nominator: string) =>
      `The vote to invite ${name} to GA PASSED with ${yesVotes} Yes votes, ${noVotes} No votes. An invite link will be given to ${nominator} in 24 hours.`,
    
    FAILED_VOTES: (name: string, yesVotes: number, noVotes: number, yesPercent: number) =>
      `The vote to invite ${name} to GA FAILED with ${yesVotes} yes votes, ${noVotes} No votes. (Only ${yesPercent}% yes)`,
    
    FAILED_QUORUM: (name: string, votePercent: number) =>
      `The vote to invite ${name} to GA FAILED to meet quorum with only ${votePercent}% of members voting.`
  }
} as const;

export const ERROR_MESSAGES = {
  NOMINATION_IN_PROGRESS: 'There is already a nomination in progress. Please wait until it completes.',
  NOMINEE_NOT_FOUND: 'Nominee not found.',
  NOMINEE_ALREADY_EXISTS: 'A nomination for this person already exists.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to use this command.',
  INVALID_STATE_TRANSITION: 'Cannot perform this action in the current nomination state.'
} as const;