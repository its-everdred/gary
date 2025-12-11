# GARY Nomination System - Feature Design Document

## Overview

The nomination system adds member invitation capabilities to GARY, allowing community members to nominate candidates for GA (General Assembly) membership through a structured discussion and voting process.

## System Architecture

### Database Schema

```prisma
model Nominee {
  id              String          @id @default(cuid())
  name            String
  state           NomineeState
  nominator       String          // Discord username
  guildId         String
  discussionStart DateTime?
  voteStart       DateTime?
  certifyStart    DateTime?
  createdAt       DateTime        @default(now())
  
  // Channel references
  discussionChannelId String?
  voteChannelId       String?
  
  @@unique([guildId, name]) // Prevent duplicate nominations
  @@index([guildId, state]) // Query optimization
}

enum NomineeState {
  ACTIVE
  DISCUSSION
  VOTE
  CERTIFY
  PAST
}
```

### State Transition Flow

```
ACTIVE → DISCUSSION → VOTE → CERTIFY → PAST
   ↓                                    ↑
   └─────────────(failed vote)─────────┘
```

### Commands Implementation

#### `/nominate list`
- **Access:** Public
- **Function:** Display ordered list of nominees by state and anticipated dates
- **Output:** Numbered list, oldest first, excludes PAST state

#### `/nominate name:"John Doe"`
- **Access:** Public  
- **Function:** Add nominee to active list
- **Validation:** Name uniqueness, guild membership

#### `/nominate name:"John Doe" nominator:@user`
- **Access:** Moderator only
- **Function:** Create nomination on behalf of another user
- **Validation:** Nominator exists, mod permissions

#### `/nominate remove:"John Doe"`
- **Access:** Moderator only
- **Function:** Remove nominee and recalculate schedules
- **Side effects:** Update remaining nominee schedules

#### `/nominate name:"John Doe" start`
- **Access:** Moderator only
- **Function:** Immediately start discussion process
- **Constraints:** Cannot start if another nominee is in DISCUSSION or VOTE state

## Background Processing Options

### Option 1: Cron-style Scheduler (Recommended)
```typescript
// Using node-cron
import cron from 'node-cron';

class NominationScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  scheduleStateTransition(nomineeId: string, transitionTime: Date, nextState: NomineeState) {
    const cronExpression = this.dateToCron(transitionTime);
    const task = cron.schedule(cronExpression, () => {
      this.transitionNominee(nomineeId, nextState);
    });
    this.jobs.set(`${nomineeId}-${nextState}`, task);
  }
}
```

**Pros:** Simple, reliable, built-in persistence
**Cons:** Limited to single instance, requires restart handling

### Option 2: Database-driven Job Queue
```typescript
model ScheduledJob {
  id          String   @id @default(cuid())
  nomineeId   String
  executeAt   DateTime
  jobType     String   // 'START_DISCUSSION', 'START_VOTE', 'START_CERTIFY', 'COMPLETE'
  completed   Boolean  @default(false)
}
```

**Pros:** Persistent, scalable, resumable
**Cons:** More complex implementation

### Option 3: External Job Queue (Bull/Agenda)
```typescript
import Bull from 'bull';

const nominationQueue = new Bull('nomination transitions');

nominationQueue.process('transition', async (job) => {
  const { nomineeId, nextState } = job.data;
  await transitionNominee(nomineeId, nextState);
});
```

**Pros:** Production-ready, robust, scalable
**Cons:** Additional infrastructure dependency

**Recommendation:** Start with Option 1 (node-cron) for MVP, migrate to Option 2 for production scale.

## Time Calculation Logic

### Base Schedule
- **Discussion Phase:** 48 hours
- **Vote Phase:** 5 days  
- **Certify Phase:** 24 hours (success) / 0 hours (failure)
- **Total cycle:** ~7.3 days per nominee

### Monday Start Rule
- Discussions begin on Mondays at 9 AM ET
- Queue system calculates next available Monday for each nominee
- Manual start overrides queue order but maintains phase durations

### Schedule Recalculation Triggers
1. New nominee added
2. Nominee removed
3. Manual start initiated
4. Vote failure (shortens certify phase)

## Channel Management

### Discussion Channel
- **Naming:** `#discussion-{lowercased-name-with-dashes}`
- **Permissions:** Default server permissions
- **Lifecycle:** Created at DISCUSSION start, archived after VOTE begins

### Vote Channel  
- **Naming:** `#vote-{lowercased-name-with-dashes}`
- **Permissions:** 
  - @everyone: View, Read history, Use commands, Use activities
  - Bots: View, Send messages, Embed links, Use commands
- **Content:** Vote message, anonymous poll, participation emoji
- **Lifecycle:** Created at VOTE start, archived after results posted

## Voting System Integration

### Poll Configuration
```typescript
const pollCommand = `/timepoll question:"Should we invite ${nominee.name} to GA?" time:5d type:Anonymous maxchoices:1 text:"Start: ${startTimestamp}\\nEnd: ${endTimestamp}" answer-1:"✅ Yes, Accept" answer-2:"❌ No, Reject"`;
```

### Result Calculation
- **Quorum threshold:** 40% of Discord members
- **Pass threshold:** 80% yes votes of valid votes
- **Data source:** Poll API results + member count API

## Error Handling & Edge Cases

### State Conflicts
- Prevent multiple nominees in DISCUSSION/VOTE simultaneously
- Handle manual start conflicts with clear error messages
- Validate state transitions before execution

### Channel Management Failures
- Retry channel creation with exponential backoff
- Fallback to #ga-governance for critical announcements
- Log channel permission errors for mod review

### External API Failures
- Discord API rate limiting: Implement retry with backoff
- Poll creation failures: Manual intervention notification
- Member count API failures: Use cached values with staleness warning

## Testing Strategy

### Unit Tests
- **State transition logic**
- **Time calculation algorithms**  
- **Permission validation**
- **Command parsing and validation**

### Integration Tests
- **Database operations**
- **Discord API interactions**
- **Channel creation and permissions**
- **Poll integration**

### End-to-End Tests
- **Complete nomination workflow**
- **Manual override scenarios**
- **Failure recovery paths**
- **Multi-nominee queue management**

### Performance Tests
- **Large nominee queue handling**
- **Concurrent command execution**
- **Database query optimization**

## Security Considerations

### Permissions
- Strict mod-only validation for privileged commands
- Input sanitization for nominee names
- Channel permission verification

### Data Protection
- No PII beyond Discord usernames
- Audit trail for mod actions
- Secure token handling for external APIs

### Rate Limiting
- Command cooldowns to prevent spam
- Background job throttling
- Discord API respect for rate limits

## Monitoring & Observability

### Metrics
- Nomination completion rates
- Average time to completion
- Vote participation rates
- Error frequencies by type

### Logging
- State transitions with timestamps
- Command executions with user context
- Background job executions
- Channel creation/management events

### Alerts
- Failed state transitions
- Channel creation failures
- Missed scheduled executions
- Low vote participation warnings

## Migration Strategy

### Phase 1: Core Implementation
- Database schema and models
- Basic commands (add, list, remove)
- Manual state transitions

### Phase 2: Automation
- Background job system
- Automatic state transitions
- Channel management

### Phase 3: Polish
- Vote integration
- Result posting
- Comprehensive error handling

### Phase 4: Monitoring
- Metrics collection
- Performance optimization
- Production hardening

## Open Questions for Product Owner

1. **Vote Integration:** Which polling bot/system should we integrate with? Do we need a specific polling bot permission setup?

2. **Channel Cleanup:** Should discussion/vote channels be deleted or archived after completion? What's the retention policy?

3. **Notification Strategy:** Besides #ga-governance and #general, are there other channels that should receive notifications?

4. **Permission Management:** Should the bot automatically manage channel permissions, or should mods handle permission setup manually?

5. **Member Count Source:** How should we determine the total member count for quorum calculation? All server members or a specific role?

6. **Time Zone Handling:** Should the 9 AM ET start time be configurable per server, or is ET fixed for all instances?

7. **Failure Recovery:** If the bot goes offline during a vote period, how should it handle resuming the process?

8. **Concurrent Nomination Limit:** Is the one-at-a-time restriction for DISCUSSION/VOTE states firm, or should this be configurable?

9. **Name Validation:** Are there any restrictions on nominee names (length, characters, format)?

10. **Historical Data:** Should we maintain detailed logs of past nominations for audit/analytics purposes?