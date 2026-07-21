# Purge Feature Summary

**TL;DR**: Automated message cleanup for Discord channels with configurable retention policies. Progressive build: notify → manual → auto-delete.

## Commands

```
/mod purge view                                          # View all configs
/mod purge set channel:#general days:30                  # Set retention
/mod purge set channel:#off-topic days:7 autodelete:true # Enable auto-delete
/mod purge execute channel:#general                      # Manual purge
/mod purge disable channel:#important                    # Disable
```

## Build Order

**Phase 1: Notification Only** (Build first)
- Scheduled checks find old messages
- Notify mods via mod-comms
- No deletion
- Monitor 2-4 weeks

**Phase 2: Manual Execution** (Build second)
- Add `/mod purge execute` command
- Mods trigger purge manually
- Verify deletion works
- Run 2-4 weeks

**Phase 3: Auto-Delete** (Build last)
- Add `autodelete:true` flag
- Auto-delete on schedule
- Start with low-risk channels

## Configuration

```bash
PURGE_SCHEDULE_CRON="0 9 * * 0"      # Every Sunday 9 AM UTC
PURGE_MOD_CHANNEL_ID="123456789"     # Notification channel
PURGE_BATCH_SIZE="100"               # Messages per batch
PURGE_BATCH_DELAY_MS="1000"          # Delay between batches
```

## Database Schema

```sql
-- Channel configs
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

## Privacy

**Message content is never accessed.**
- Bot only reads message ID and timestamp
- No message content, author, or attachments accessed
- Audit log contains only counts and timestamp ranges

## Discord Permissions

- `MANAGE_MESSAGES` - Delete messages
- `READ_MESSAGE_HISTORY` - Fetch metadata (ID, timestamp only)
- `VIEW_CHANNEL` - Access channels

## Discord API Limits

- **Bulk delete**: Max 100 messages, must be < 14 days old
- **Individual delete**: 5 messages/sec for older messages
- Bot uses bulk when possible, falls back to individual

## Safety Features

- Progressive 3-phase rollout
- Confirmation prompts for manual execution
- Audit log for all purges
- Rate limit handling
- Error recovery (continues on failure)

## Quick Start

1. Set env vars:
   ```bash
   PURGE_SCHEDULE_CRON="0 9 * * 0"
   PURGE_MOD_CHANNEL_ID="your-mod-channel-id"
   ```

2. Configure test channel:
   ```
   /mod purge set channel:#test days:30
   ```

3. Wait for scheduled check or test manually

4. Verify notification accuracy

5. Monitor 2-4 weeks, then build Phase 2

## References

- Full spec: [PurgeFeatureSpec.md](./PurgeFeatureSpec.md)
- Discord Bulk Delete: https://discord.com/developers/docs/resources/channel#bulk-delete-messages
