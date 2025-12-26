# GARY - Generally Autonomous Representative Yeoman

Privacy focused discord moderation assistant manager.

## Commands

### Warning System
- `/warn target:<@user> message:<text>` - Warn mods about a user, tracks toward kick quorum
- `/unwarn target:<@user>` - Remove your warning about a user

### Nomination System
- `/nominate name:<text>` - Nominate someone for GA membership
- `/mod nominate add name:<text> nominator:<@user>` - Moderator: Add nomination on behalf of someone
- `/mod nominate remove name:<text>` - Moderator: Remove a nominee
- `/mod nominate start [name:<text>]` - Moderator: Start discussion for specific nominee or next in queue

## Features

- **Anonymous Warning System**: Members can warn about problematic users anonymously
- **Nomination System**: Automated GA membership nomination workflow with:
  - Discussion channels (24 hours)
  - Vote channels with EasyPoll integration (48 hours)
  - Automatic quorum calculation (40% of members)
  - Pass threshold (80% yes votes)
  - Certification period (7 days)

## EasyPoll Integration

The bot integrates with [EasyPoll](https://easypoll.bot) for anonymous voting:
1. Bot creates vote channels automatically
2. Bot provides the exact `/timepoll` command to create polls
3. Bot reads poll results when voting ends
4. Requires MESSAGE CONTENT INTENT to read EasyPoll embeds

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
   - ✅ `Read Message History` - Read EasyPoll messages for vote parsing
   - Total permissions value: 2064 (or use Administrator for all permissions)
5. Scroll down → Copy the generated URL
6. Open URL in browser → Choose your server → Authorize

**Important**: If you get "Unknown Integration" errors when using slash commands, re-invite the bot with the `applications.commands` scope.

### 3. Get IDs & Configure

```bash
cp .env.example .env
open .env
```

Fill in all values:

```bash
DISCORD_TOKEN=         # Bot token from step 1.3
DISCORD_APP_ID=        # Application ID from step 1.4
GUILD_ID=              # Right-click server → Copy Server ID (needs Developer Mode*)
MOD_CHANNEL_ID=        # Right-click mod channel → Copy Channel ID
KICK_QUORUM_PERCENT=40 # % of members for kick alert
GUILD_SALT=            # Run: openssl rand -base64 32
DATABASE_URL=          # Local: postgres://gary:pass@localhost:5432/gary
                       # Railway: ${{Postgres.DATABASE_URL}}

# Optional: Nomination System Configuration
GOVERNANCE_CHANNEL_ID= # Channel for nomination announcements
MOD_ROLES=             # Comma-separated role IDs (e.g., "123,456")
                       # Or use role names: "@Moderator,@Admin"
```

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

### 5. Deploy to Railway

Self-host or use a service like [Railway](https://railway.app).

**Railway Setup:**

1. Fork this repo to your GitHub
2. [railway.app](https://railway.app) → Start New Project → Deploy from GitHub repo
3. Add service → Database → Add PostgreSQL
4. Click on your app → Variables → Add all variables from step 3
5. **Important**: Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`
6. Settings → Generate Domain (for health checks)
7. Deploys automatically on git push
