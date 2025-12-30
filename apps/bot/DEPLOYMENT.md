# Deployment Guide

## Railway Deployment

### Required Environment Variables

The following environment variables MUST be set in your Railway service:

#### Discord Configuration
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_APP_ID` - Discord application ID (from Discord Developer Portal)
- `GUILD_ID` - Discord server ID

#### Channel IDs
- `GOVERNANCE_CHANNEL_ID` - Channel for governance announcements
- `GENERAL_CHANNEL_ID` - General channel for public announcements
- `MOD_FLAG_CHANNEL_ID` - Moderator channel for flag notifications
- `MOD_COMMS_CHANNEL_ID` - Moderator channel for vote results
- `NOMINATIONS_CHANNEL_CATEGORY_ID` - Category ID for nomination channels

#### Database
- `DATABASE_URL` - PostgreSQL connection string (automatically set by Railway)

#### Voting Configuration
- `KICK_QUORUM_PERCENT` - Percentage of members needed for kick quorum (default: 40)
- `VOTE_QUORUM_PERCENT` - Percentage of members needed for vote quorum (default: 40)
- `VOTE_PASS_PERCENT` - Percentage of yes votes needed to pass (default: 80)

#### Security
- `GUILD_SALT` - Random salt for hashing (generate with: `openssl rand -base64 32`)

#### Nomination Timing (in minutes)
- `NOMINATE_DISCUSSION_PERIOD_MINUTES` - Discussion phase duration (default: 2880 = 48 hours)
- `NOMINATE_VOTE_PERIOD_MINUTES` - Vote phase duration (default: 7200 = 5 days)
- `NOMINATE_CLEANUP_PERIOD_MINUTES` - Cleanup phase duration (default: 1440 = 24 hours)

#### Optional
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

### Setting Variables in Railway

1. Go to your Railway project
2. Select the bot service
3. Navigate to the Variables tab
4. Add each required variable

### Validation

The bot will validate all environment variables on startup. If any required variables are missing, it will:
1. Log which variables are missing
2. Provide helpful default values
3. Exit with an error

This ensures the bot won't run with missing configuration that could cause unexpected behavior.

### Database Setup

#### First-time Production Deployment

If you're deploying to a production database that already has data (e.g., from a previous version), you need to baseline the migrations:

1. Deploy your code
2. Run `npm run baseline` ONCE to mark existing migrations as applied
3. Future deployments will work with just `npm start`

#### Fresh Database

If starting with a fresh database, just run `npm start` - no baseline needed.

### Example .env file for local development

```env
DISCORD_TOKEN=your_discord_token
DISCORD_APP_ID=your_application_id
GUILD_ID=your_guild_id

GOVERNANCE_CHANNEL_ID=123456789
GENERAL_CHANNEL_ID=123456789
MOD_FLAG_CHANNEL_ID=123456789
MOD_COMMS_CHANNEL_ID=123456789
NOMINATIONS_CHANNEL_CATEGORY_ID=123456789

DATABASE_URL=postgresql://user:password@localhost:5432/gary

KICK_QUORUM_PERCENT=40
VOTE_QUORUM_PERCENT=40
VOTE_PASS_PERCENT=80

GUILD_SALT=your_generated_salt_here

NOMINATE_DISCUSSION_PERIOD_MINUTES=2880
NOMINATE_VOTE_PERIOD_MINUTES=7200
NOMINATE_CLEANUP_PERIOD_MINUTES=1440
```