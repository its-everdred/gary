# Purge Feature Summary

**TL;DR**: Automated message cleanup for Discord channels with configurable retention policies and progressive rollout (notify → manual → auto-delete).

## What It Does

- Configure per-channel message retention windows (e.g., "delete messages older than 30 days")
- Scheduled checks identify channels with messages past threshold
- Phase 1: Notify mods
- Phase 2: Allow manual purge
- Phase 3: Auto-delete with mod notifications

## Key Commands

```
/mod purge view                                    # View all channel configs
/mod purge set channel:#general days:30            # Set 30-day retention
/mod purge set channel:#off-topic days:7 autodelete:true  # Enable auto-delete
/mod purge execute channel:#general                # Manual purge (Phase 2+)
/mod purge disable channel:#important              # Disable purge
```

## Build Order (Recommended)

The phases represent recommended implementation order, not separate deployments:

### Phase 1: Notification Only ✅ (Build first)
- Implement scheduled checks
- Post notifications to mod-comms about messages past threshold
- **No deletion occurs**
- Deploy and monitor for 2-4 weeks to verify accuracy

### Phase 2: Manual Execution (Build second)
- Implement `/mod purge execute` command
- Mods can manually trigger purge after reviewing notifications
- Verify deletion mechanics work as expected
- Run for 2-4 weeks with spot checks

### Phase 3: Auto-Delete (Build last)
- Implement `autodelete:true` flag per channel
- Bot automatically deletes qualifying messages on schedule
- Posts summary to mod-comms after each purge
- Start with low-risk channels (#off-topic), expand gradually

## Configuration Example

```bash
# Environment variables
PURGE_SCHEDULE_CRON="0 9 * * 0"  # Every Sunday 9 AM UTC
PURGE_MOD_CHANNEL_ID="123456789" # Where to post notifications
PURGE_BATCH_SIZE="100"           # Messages per batch
PURGE_BATCH_DELAY_MS="1000"      # Delay between batches
```

## Safety Features

- **Progressive rollout**: Three phases ensure safe deployment
- **Confirmation prompts**: Required for manual execution
- **Audit log**: All purges tracked with timestamp, user, count
- **Rate limit handling**: Respects Discord API limits
- **Error recovery**: Continues on failure, posts error summary

## Database Schema

```sql
-- Channel retention policies
CREATE TABLE purge_config (
  channel_id TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  autodelete_enabled BOOLEAN DEFAULT FALSE
);

-- Audit trail
CREATE TABLE purge_history (
  id INTEGER PRIMARY KEY,
  channel_id TEXT,
  executed_at TIMESTAMP,
  messages_deleted INTEGER,
  trigger_type TEXT,  -- 'manual', 'auto', 'scheduled_check'
  triggered_by TEXT
);
```

## Discord Permissions Required

- `MANAGE_MESSAGES` - Delete messages
- `READ_MESSAGE_HISTORY` - Fetch old messages
- `VIEW_CHANNEL` - Access channels

## Discord API Limits

- **Bulk delete**: Max 100 messages, must be < 14 days old
- **Individual delete**: 5 messages/second for messages > 14 days old
- Purge uses bulk delete when possible, falls back to individual delete for older messages

## Example Notification (Phase 1)

```
🧹 Purge Alert

Channel: #general
Retention: 30 days
Messages past threshold: 1,247
Oldest message: 2025-11-10 14:32 UTC

Use `/mod purge execute channel:#general` to purge manually.
```

## Example Summary (Phase 3)

```
✅ Auto-Purge Complete

Channel: #general
Retention: 30 days
Messages deleted: 1,247
Oldest remaining: 2025-12-10 09:15 UTC
Next check: 2026-01-19 09:00 UTC
```

## Quick Start (Phase 1 Implementation)

1. Set environment variables:
   ```bash
   PURGE_SCHEDULE_CRON="0 9 * * 0"
   PURGE_MOD_CHANNEL_ID="your-mod-channel-id"
   ```

2. Configure a test channel:
   ```
   /mod purge set channel:#test-channel days:30
   ```

3. Wait for next scheduled check (or trigger manually for testing)

4. Verify notification appears in mod-comms with accurate message count

5. Monitor for 2-4 weeks, then proceed to Phase 2

## Future Enhancements

- Whitelist specific users (preserve bot announcements)
- Exempt pinned messages
- Reaction-based protection (keep messages with specific reactions)
- Export messages before deletion (archive to S3/disk)
- Web dashboard for configuration

## References

- Full spec: [PurgeFeatureSpec.md](./PurgeFeatureSpec.md)
- Discord Bulk Delete API: https://discord.com/developers/docs/resources/channel#bulk-delete-messages
- Discord Rate Limits: https://discord.com/developers/docs/topics/rate-limits
