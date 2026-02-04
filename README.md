# GARY - Generally Autonomous Representative Yeoman

Minimal discord moderation assistant manager.

## Commands

See [COMMANDS.md](COMMANDS.md) for detailed command reference.

### Flagging System

- `/flag target:<@user> message:<text>` - Flag mods about a user, tracks toward kick quorum
- `/unflag target:<@user>` - Remove your flag about a user

### Nomination System

- `/nominate add name:<text>` - Nominate someone for membership
- `/nominate list` - List all current nominations and their state
- `/mod nominate add name:<text> nominator:<@user>` - Moderator: Add nomination on behalf of someone
- `/mod nominate remove name:<text>` - Moderator: Remove a nominee
- `/mod nominate start [name:<text>]` - Moderator: Start discussion for specific nominee or next in queue
- `/mod nominate discussion hours:<number>` - Moderator: Set discussion duration for current nominee
- `/mod nominate cleanup` - Moderator: Complete cleanup early and cleanup channels for nominee in CLEANUP state

## Features

- **Anonymous Flagging System**: Members can flag problematic users anonymously
- **Nomination System**: Automated membership nomination workflow with:
  - Discussion channels (24 hours)
  - Vote channels with EasyPoll integration (48 hours)
  - Automatic quorum calculation (40% of members)
  - Pass threshold (80% yes votes)
  - Cleanup period (7 days)

## EasyPoll Integration

The bot integrates with [EasyPoll](https://easypoll.bot) for anonymous voting in the nominate feature.

## Quick Setup

### 1. Create Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Name it → Bot → Add Bot
3. **Token**: Reset Token → Copy for `DISCORD_TOKEN`
4. **Application ID**: General Information → Copy for `DISCORD_APP_ID`
5. **Privileged Gateway Intents**:
   - ✅ Enable `MESSAGE CONTENT INTENT` (required to read EasyPoll embeds)
   - ❌ Keep `PRESENCE INTENT` disabled
   - ❌ Keep `SERVER MEMBERS INTENT` disabled

### 2. Generate Invite Link

1. In [Discord Developer Portal](https://discord.com/developers/applications), go to your app
2. Left sidebar → OAuth2 → URL Generator
3. **Select Scopes** (what the bot can do):
   - ✅ `bot` - Allows bot to join servers
   - ✅ `applications.commands` - **REQUIRED** for slash commands
4. **Select Bot Permissions** (what bot can access):
   - ✅ `View Channels` - See channels in the server
   - ✅ `Send Messages` - Post announcements and results
   - ✅ `Manage Channels` - Create discussion/vote channels
   - ✅ `Read Message History` - Only reads EasyPoll messages for vote parsing
   - Total permissions value: 2064 (or use Administrator for all permissions)
5. Scroll down → Copy the generated URL
6. Open URL in browser → Choose your server → Authorize

**Important**: If you get "Unknown Integration" errors when using slash commands, re-invite the bot with the `applications.commands` scope.

### 3. Get IDs & Configure

```bash
cp .env.example .env
open .env
```

Follow instructions to fill in all values.

\*Enable Developer Mode: Discord Settings → Advanced → Developer Mode

### 4. Run locally

##### Dependencies

- Node.js 20+
- PostgreSQL 15+
- Bun (package manager)

##### Install PostgreSQL

```bash
brew install postgresql@15
brew services start postgresql@15
```

##### Create database and user

```bash
# Connect as default user
psql postgres

# In psql, create user and database:
CREATE USER gary WITH PASSWORD 'password';
CREATE DATABASE gary OWNER gary;
GRANT ALL PRIVILEGES ON DATABASE gary TO gary;
\q
```

##### Run the bot

```bash
cd apps/bot
bun install
bunx prisma db push
bun run dev
```

### 5. Run with Docker

The easiest way to run Gary with all dependencies.

##### Prerequisites

- Docker and Docker Compose installed

##### Quick Start

```bash
# Copy example env and fill in your values
cp apps/bot/.env.example .env

# Start Gary with PostgreSQL
docker compose up -d

# View logs
docker compose logs -f gary
```

##### Docker Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Rebuild after code changes
docker compose up -d --build

# View logs
docker compose logs -f

# Reset database (caution: deletes all data)
docker compose down -v
docker compose up -d
```

##### Using Pre-built Image

You can also run Gary without building locally:

```bash
# Pull and run with your own PostgreSQL
docker run -d \
  --name gary-bot \
  -e DATABASE_URL=postgresql://user:pass@host:5432/gary \
  -e DISCORD_TOKEN=your_token \
  -e DISCORD_APP_ID=your_app_id \
  -e GUILD_ID=your_guild_id \
  -e GOVERNANCE_CHANNEL_ID=channel_id \
  -e GENERAL_CHANNEL_ID=channel_id \
  -e MOD_FLAG_CHANNEL_ID=channel_id \
  -e MOD_COMMS_CHANNEL_ID=channel_id \
  -e GUILD_SALT=your_salt \
  ghcr.io/its-everdred/gary:latest
```

### 6. Deploy to Railway

Self-host or use a service like [Railway](https://railway.app).

**Railway Setup:**

1. Fork this repo to your GitHub
2. [railway.app](https://railway.app) → Start New Project → Deploy from GitHub repo
3. Add service → Database → Add PostgreSQL
4. Click on your app → Variables → Add all variables from step 3
5. **Important**: Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`
6. Settings → Generate Domain (for health checks)
7. Deploys automatically on git push
