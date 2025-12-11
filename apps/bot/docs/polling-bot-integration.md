# Polling Bot Integration Research

## Overview
The nomination system requires integration with a Discord polling bot to facilitate voting on nominees. This document outlines the available options and recommended approach.

## Requirements
- Create yes/no polls for nominee voting
- Track individual votes (not anonymous)
- Calculate vote percentages and quorum
- API or webhook integration for vote results
- Reliability and uptime

## Option 1: Discord's Native Polls (Recommended)
Discord added native polling functionality in 2024. This is the recommended approach.

### Pros
- Built into Discord, no external dependencies
- Reliable and always available
- Shows real-time results
- Tracks who voted for what
- Can be created via Discord API

### Cons
- Limited customization options
- Cannot programmatically end polls early

### Implementation
```javascript
// Create a poll using Discord.js
await channel.send({
  poll: {
    question: {
      text: `Vote for nominee: ${nomineeName}`
    },
    answers: [
      { poll_media: { text: 'Yes' } },
      { poll_media: { text: 'No' } }
    ],
    duration: 120, // 5 days in hours
    allow_multiselect: false
  }
});
```

## Option 2: Simple Poll Bot
Popular third-party polling bot with 1M+ servers.

### Pros
- Well-established and reliable
- Good API documentation
- Supports webhooks for results

### Cons
- External dependency
- May have rate limits
- Requires bot invitation

## Option 3: Carl-bot
Multi-purpose bot with polling features.

### Pros
- Very popular and reliable
- Good moderation integration
- Reaction-based polls

### Cons
- Overkill if only using for polls
- More complex setup

## Recommendation

Use **Discord's Native Polls** for the following reasons:

1. **No External Dependencies**: Native polls are built into Discord, eliminating third-party bot dependencies
2. **API Support**: Can be created and managed via Discord.js
3. **Vote Tracking**: Shows who voted for each option
4. **Real-time Results**: Updates live as votes come in
5. **Duration Support**: Can set polls to run for up to 7 days (covers our 5-day requirement)

## Implementation Plan

1. Update vote channel creation to include poll creation
2. Store poll message ID in nominee record
3. Use Discord API to fetch poll results when needed
4. Calculate quorum based on guild member count
5. Transition to CERTIFY state when poll ends

## Vote Result Calculation

```javascript
async function calculateVoteResults(pollMessage) {
  const poll = pollMessage.poll;
  const results = poll.results;
  
  const yesVotes = results.answer_counts[0];
  const noVotes = results.answer_counts[1];
  const totalVotes = yesVotes + noVotes;
  
  const memberCount = guild.memberCount - botCount;
  const quorumMet = totalVotes >= (memberCount * 0.4);
  const passThreshold = yesVotes >= (totalVotes * 0.8);
  
  return {
    passed: quorumMet && passThreshold,
    yesVotes,
    noVotes,
    totalVotes,
    quorumMet,
    passThreshold
  };
}
```

## Database Schema Update

Add poll tracking to nominee model:

```prisma
model Nominee {
  // ... existing fields
  votePollMessageId String?
  voteYesCount      Int     @default(0)
  voteNoCount       Int     @default(0)
  votePassed        Boolean?
}
```

## Next Steps

1. Implement poll creation in vote channel service
2. Add poll result fetching to job scheduler
3. Update state transitions to check poll results
4. Test with Discord's poll API