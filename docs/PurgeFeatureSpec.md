# Purge Feature Specification

## Overview

Automated message cleanup for Discord channels with configurable retention policies. Progressive build order: notifications → manual execution → auto-delete.

## Commands

### `/mod purge view`
View current purge configuration for all channels.

### `/mod purge set channel:<#channel> days:<number> [autodelete:<bool>]`
Configure purge settings for a channel.

- `channel` (required): Channel to configure
- `days` (required): Retention window (1-365)
- `autodelete` (optional, default: false): Enable auto-deletion

**Validation:**
- Channel must exist and be accessible
- Days: 1-365
- Auto-delete only available when Phase 3 is implemented

### `/mod purge execute channel:<#channel>`
Manually trigger purge for a channel. Requires confirmation prompt. Only available when Phase 2 is implemented.

### `/mod purge disable channel:<#channel>`
Disable purge for a channel.

## Build Order

### Phase 1: Notification Only (Build first)
- Scheduled checks identify channels with messages past retention threshold
- Post notifications to mod-comms channel
- No deletion occurs
- Deploy and monitor 2-4 weeks to verify accuracy

### Phase 2: Manual Execution (Build second)
- Implement `/mod purge execute` command
- Moderators can manually trigger purge after reviewing notifications
- Verify deletion mechanics work as expected
- Run 2-4 weeks with spot checks

### Phase 3: Auto-Delete (Build last)
- Implement `autodelete` flag in `/mod purge set`
- Bot automatically deletes qualifying messages on schedule
- Posts summary to mod-comms after each purge
- Enable gradually, starting with low-risk channels

## Scheduled Checks

**Cadence**: Configured via `PURGE_SCHEDULE_CRON` (default: every Sunday 9 AM UTC)

**Process**:
1. Iterate channels with configured retention windows
2. Fetch messages older than retention threshold
3. Count qualifying messages
4. If count > 0:
   - **Phase 1/2**: Post notification to mod-comms
   - **Phase 3**: If autodelete enabled, delete messages and post summary; else notify

**Notification format**:
```
🧹 Purge Alert
Channel: #general
Retention: 30 days
Messages past threshold: 1,247
Oldest: 2025-11-10 14:32 UTC
```

**Auto-delete summary**:
```
✅ Auto-Purge Complete
Channel: #general
Messages deleted: 1,247
Oldest remaining: 2025-12-10 09:15 UTC
```

## Privacy & Security

**The bot MUST NOT access message content.**

While `READ_MESSAGE_HISTORY` grants access to full message objects, implementation should:

**✅ DO:**
- Access message `id` and `timestamp` only
- Count messages for reporting

**❌ DO NOT:**
- Read message `content`, `author`, `embeds`, `attachments`
- Log message data (even in errors)
- Store message information beyond counts

**Implementation pattern**:
```javascript
// Extract only metadata immediately
const messages = await channel.messages.fetch({ limit: 100 });
const toDelete = messages
  .filter(msg => Date.now() - msg.createdTimestamp > retentionMs)
  .map(msg => msg.id);  // Only ID
```

## Database Schema

```sql
-- Channel retention policies
CREATE TABLE purge_config (
  channel_id TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  autodelete_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail
CREATE TABLE purge_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  messages_deleted INTEGER NOT NULL,
  trigger_type TEXT NOT NULL, -- 'manual', 'auto', 'scheduled_check'
  triggered_by TEXT,          -- user_id or 'system'
  oldest_deleted TIMESTAMP,
  newest_deleted TIMESTAMP
);
```

## Discord API

### Rate Limits
- **Bulk delete**: Max 100 messages, must be < 14 days old
- **Individual delete**: 5 messages/sec for messages > 14 days old
- Use bulk delete when possible, fall back to individual delete for older messages

### Deletion Logic
```javascript
For each message:
  // ONLY access: message.id, message.timestamp
  message_age = now - message.timestamp
  if message_age > retention_days:
    if message.timestamp < 14_days_ago:
      delete_individual(message.id)
    else:
      add_to_bulk_batch(message.id)
      if batch.size >= PURGE_BATCH_SIZE:
        bulk_delete(batch)
        sleep(PURGE_BATCH_DELAY_MS)
```

### Permissions Required
- `MANAGE_MESSAGES` - Delete messages
- `READ_MESSAGE_HISTORY` - Fetch message metadata (ID, timestamp)
- `VIEW_CHANNEL` - Access channels

## Environment Variables

```bash
PURGE_SCHEDULE_CRON="0 9 * * 0"      # Cron schedule (default: Sundays 9 AM UTC)
PURGE_MOD_CHANNEL_ID="123456789"     # Notification channel ID
PURGE_BATCH_SIZE="100"               # Messages per batch (max 100)
PURGE_BATCH_DELAY_MS="1000"          # Delay between batches
```

## Error Handling

- If deletion fails (permissions, rate limit), log error and skip
- Post error summary to mod-comms
- Continue with remaining messages (don't abort)

## Safety Features

- **Progressive rollout**: Three phases ensure safe deployment
- **Confirmation prompts**: Required for manual execution
- **Audit log**: All purges tracked (channel, count, timestamp, executor)
- **Rate limit handling**: Respects Discord API limits
- **Max messages limit**: Configurable per-purge (default: 10,000)

## Testing Checklist

- [ ] Configure retention for test channel
- [ ] Verify notification accuracy (Phase 1)
- [ ] Test manual execution (Phase 2)
- [ ] Verify only correct messages deleted
- [ ] Test auto-delete (Phase 3)
- [ ] Test bulk delete vs individual delete paths
- [ ] Verify error handling (missing permissions, rate limits)
- [ ] Verify audit log completeness
- [ ] Confirm message content never accessed

## Future Enhancements

- Whitelist users (exclude specific users' messages)
- Exempt pinned messages
- Reaction-based protection (preserve messages with specific reactions)
- Export messages before deletion (archive to S3)
- Web dashboard for configuration
