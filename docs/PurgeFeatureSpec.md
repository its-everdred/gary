# Purge Feature Specification

## Overview

The Purge feature enables moderators to configure automated message cleanup policies for individual channels. Messages older than a configurable timeframe are identified, and moderators can be notified or have them automatically deleted based on progressive rollout phases.

## Goals

1. **Channel-specific retention policies**: Configure different message retention windows for each channel
2. **Automated monitoring**: Scheduled checks identify channels with messages past retention threshold
3. **Progressive rollout**: Start with notifications, progress to manual execution, then auto-deletion
4. **Safety first**: Multiple phases ensure deletion mechanics work as expected before automation

## Phases

### Phase 1: Notification Only (Initial Deployment)
- Scheduled checks identify channels with messages exceeding retention window
- Bot posts notifications to mod-comms channel
- No deletion occurs — purely informational

### Phase 2: Manual Execution
- Moderators can trigger purge via `/mod purge execute` command
- Provides hands-on experience with deletion mechanics
- Allows verification that correct messages are targeted

### Phase 3: Auto-Delete
- Moderators can enable auto-delete per channel via `autodelete:true` flag
- Bot automatically deletes qualifying messages on schedule
- Posts summary to mod-comms after each purge

## Commands

### `/mod purge view`
View current purge configuration for all channels.

**Output:**
```
📋 Purge Configuration:

#general - 30 days, auto-delete: disabled
#announcements - 90 days, auto-delete: disabled
#off-topic - 7 days, auto-delete: enabled
```

### `/mod purge set channel:<#channel> days:<number> [autodelete:<bool>]`
Configure purge settings for a channel.

**Parameters:**
- `channel` (required): Channel to configure (mention)
- `days` (required): Retention window in days (1-365)
- `autodelete` (optional): Enable/disable auto-deletion (default: false)

**Examples:**
```
/mod purge set channel:#general days:30
/mod purge set channel:#off-topic days:7 autodelete:true
```

**Validation:**
- Channel must exist and be accessible by bot
- Days must be between 1 and 365
- Auto-delete only allowed if Phase 3 implementation is complete

### `/mod purge execute channel:<#channel>`
Manually trigger purge for a specific channel.

**Parameters:**
- `channel` (required): Channel to purge (mention)

**Behavior:**
- Deletes messages older than configured retention window
- Posts summary to mod-comms
- Requires confirmation (button interaction)
- Not available until Phase 2 implementation is complete

**Example:**
```
/mod purge execute channel:#general

⚠️ Purge Confirmation
Channel: #general
Retention: 30 days
Estimated messages: 1,247
Are you sure? [Confirm] [Cancel]
```

### `/mod purge disable channel:<#channel>`
Disable purge for a specific channel.

**Parameters:**
- `channel` (required): Channel to disable (mention)

**Example:**
```
/mod purge disable channel:#important
```

## Scheduled Checks

### Cadence Configuration
Set via environment variable:
```
PURGE_SCHEDULE_CRON="0 9 * * 0"  # Every Sunday at 9 AM UTC
```

Default: Every Sunday at 9 AM UTC

### Check Process
1. Bot iterates through all channels with configured retention windows
2. For each channel:
   - Fetch messages older than retention window
   - Count qualifying messages
   - If count > 0:
     - **Phase 1**: Post notification to mod-comms
     - **Phase 2**: Same as Phase 1 (manual execution only)
     - **Phase 3**: If `autodelete:true`, delete messages and post summary; else notify

### Notification Format (Phase 1 & 2)
```
🧹 Purge Alert

Channel: #general
Retention: 30 days
Messages past threshold: 1,247
Oldest message: 2025-11-10 14:32 UTC

Use `/mod purge execute channel:#general` to purge manually.
```

### Auto-Delete Summary (Phase 3)
```
✅ Auto-Purge Complete

Channel: #general
Retention: 30 days
Messages deleted: 1,247
Oldest remaining: 2025-12-10 09:15 UTC
Next check: 2026-01-19 09:00 UTC
```

## Data Storage

### Channel Configuration
Store per-channel settings in database (SQLite for simplicity):

**Table: `purge_config`**
```sql
CREATE TABLE purge_config (
  channel_id TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  autodelete_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Purge History
Track purge executions for audit trail:

**Table: `purge_history`**
```sql
CREATE TABLE purge_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  messages_deleted INTEGER NOT NULL,
  trigger_type TEXT NOT NULL, -- 'manual', 'auto', 'scheduled_check'
  triggered_by TEXT, -- user_id for manual, 'system' for auto
  oldest_deleted TIMESTAMP,
  newest_deleted TIMESTAMP
);
```

## Environment Variables

```bash
# Purge feature configuration
PURGE_SCHEDULE_CRON="0 9 * * 0"      # Cron schedule for checks (default: Sundays 9 AM UTC)
PURGE_MOD_CHANNEL_ID="123456789"     # Channel ID for purge notifications
PURGE_BATCH_SIZE="100"               # Messages to delete per batch (Discord rate limit: 100/bulk)
PURGE_BATCH_DELAY_MS="1000"          # Delay between batches (rate limit safety)
```

## Discord API Considerations

### Rate Limits
- **Bulk delete**: Max 100 messages per call
- **Bulk delete age limit**: Messages must be < 14 days old
- For messages > 14 days: Use individual delete (1 message per call, 5/sec rate limit)

### Message Fetching
- Fetch in batches of 100 using `before` parameter
- Discord returns messages newest → oldest
- Stop when reaching retention threshold

### Permissions Required
- `MANAGE_MESSAGES` - Required for bulk delete
- `READ_MESSAGE_HISTORY` - Required to fetch old messages
- `VIEW_CHANNEL` - Required to access channel

## Implementation Notes

### Build Order (Recommended)
The phases represent a recommended implementation order, not distinct deployments:

1. **Phase 1: Notification Only** (Build first)
   - Implement scheduled checks
   - Implement notification posting to mod-comms
   - Deploy and monitor for 2-4 weeks
   - Verify message counts are accurate
   - Confirm no false positives

2. **Phase 2: Manual Execution** (Build second)
   - Implement `/mod purge execute` command
   - Implement deletion logic (bulk + individual)
   - Implement confirmation prompts
   - Moderators manually test purge
   - Verify deletion only affects correct messages
   - Run for 2-4 weeks with spot checks

3. **Phase 3: Auto-Delete** (Build last)
   - Add `autodelete` flag to `/mod purge set` command
   - Implement auto-delete logic in scheduled checks
   - Enable for low-risk channels first (e.g., #off-topic)
   - Monitor for 1-2 weeks
   - Gradually enable for more channels

### Deletion Logic
```
For each message:
  message_age = now - message.timestamp
  if message_age > retention_days:
    if message.timestamp < 14_days_ago:
      delete_individual(message)  # Slow path
    else:
      add_to_bulk_batch(message)  # Fast path
      if batch.size >= PURGE_BATCH_SIZE:
        bulk_delete(batch)
        sleep(PURGE_BATCH_DELAY_MS)
```

### Error Handling
- If deletion fails (permissions, rate limit), log error and skip
- Post error summary to mod-comms
- Continue with remaining messages (don't abort entire purge)

### Safety Guards
- **Dry-run mode**: Optional flag to simulate deletion without executing
- **Max messages per purge**: Configurable limit (default: 10,000)
- **Confirmation prompts**: Required for manual execution
- **Audit log**: All purges logged with trigger type, user, timestamp

## User Stories

### Story 1: Configure Channel Retention
**As a moderator**, I want to set a 30-day retention policy for #general so that old messages are automatically cleaned up.

**Steps:**
1. Moderator: `/mod purge set channel:#general days:30`
2. Bot: "✅ Purge configured for #general: 30 days retention, auto-delete disabled"

### Story 2: Receive Purge Notification (Phase 1)
**As a moderator**, I want to be notified when #general has messages older than 30 days so I can review before deletion.

**Steps:**
1. Scheduled check runs on Sunday 9 AM
2. Bot finds 1,247 messages > 30 days old in #general
3. Bot posts notification to mod-comms with count and oldest message timestamp

### Story 3: Manual Purge (Phase 2)
**As a moderator**, I want to manually purge #off-topic after reviewing the notification.

**Steps:**
1. Moderator: `/mod purge execute channel:#off-topic`
2. Bot: Shows confirmation prompt with estimated message count
3. Moderator: Clicks [Confirm]
4. Bot: Deletes messages, posts summary to mod-comms

### Story 4: Auto-Delete (Phase 3)
**As a moderator**, I want #off-topic to auto-delete messages older than 7 days so I don't have to manually purge.

**Steps:**
1. Moderator: `/mod purge set channel:#off-topic days:7 autodelete:true`
2. Bot: "✅ Purge configured for #off-topic: 7 days retention, auto-delete enabled"
3. Next scheduled check: Bot auto-deletes qualifying messages, posts summary

## Testing Plan

### Unit Tests
- Retention window calculation
- Message age filtering
- Batch deletion logic
- Configuration validation

### Integration Tests
- Database CRUD operations
- Discord API interactions (mocked)
- Scheduled job execution

### Manual Testing Checklist
- [ ] Configure retention for test channel
- [ ] Verify notification accuracy in Phase 1
- [ ] Test manual execution in Phase 2
- [ ] Verify only correct messages deleted
- [ ] Test auto-delete in Phase 3
- [ ] Verify error handling (missing permissions, rate limits)
- [ ] Test bulk delete vs individual delete paths
- [ ] Verify audit log completeness

## Future Enhancements

1. **Whitelist users**: Exclude messages from specific users (e.g., bot announcements)
2. **Pinned message exemption**: Never delete pinned messages
3. **Reaction-based protection**: Messages with specific reactions are preserved
4. **Per-role visibility**: Different retention windows based on who can see the channel
5. **Export before delete**: Archive messages to S3/disk before deletion
6. **Dashboard**: Web UI to view/configure purge settings

## Open Questions

1. Should pinned messages be exempt by default?
2. Should we require a minimum retention window (e.g., 7 days)?
3. Should purge history be retained indefinitely or expire?
4. Should we support regex patterns for message content filtering?
5. Should we allow per-user exemptions via command or config file?

## References

- [Discord Bulk Delete API](https://discord.com/developers/docs/resources/channel#bulk-delete-messages)
- [Discord Rate Limits](https://discord.com/developers/docs/topics/rate-limits)
- [Node-cron scheduling](https://www.npmjs.com/package/node-cron)
