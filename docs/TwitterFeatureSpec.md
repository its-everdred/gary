# Twitter Feature Spec

> Detailed implementation specification for the Twitter relay feature.

## Database Schema

### New Table: `twitter_links`

```sql
CREATE TABLE twitter_links (
  id SERIAL PRIMARY KEY,
  discord_user_id VARCHAR(255) NOT NULL UNIQUE,
  twitter_handle VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Commands

### `/mod twitter add`

**Parameters:**
- `user` (required): Discord user mention or ID
- `twitter` (required): Twitter handle (with or without @)

**Behavior:**
1. Validate Discord user exists in guild
2. Normalize Twitter handle (strip @, validate format)
3. Insert/update record in `twitter_links` table
4. Confirm success to mod

### `/mod twitter remove`

**Parameters:**
- `user` (required): Discord user mention or ID

**Behavior:**
1. Delete record from `twitter_links` if exists
2. Stop monitoring that Twitter account
3. Confirm removal to mod

### `/mod twitter list`

**Behavior:**
1. Query all `twitter_links` records
2. Display formatted list of Discord user → Twitter handle mappings

## Tweet Relay System

### Polling vs Streaming

<!-- TODO: Define approach - Twitter API v2 filtered stream or polling? -->

### Channel Configuration

<!-- TODO: Define how the relay channel is configured -->

### Tweet Formatting

<!-- TODO: Define embed format for relayed tweets -->

## API Requirements

<!-- TODO: Document Twitter API requirements and authentication -->

## Error Handling

<!-- TODO: Define error cases and user-facing messages -->

---

*This spec is a work in progress. Fill in TODOs as design decisions are made.*
