# GARY - Generally Autonomous Representative Yeoman

Privacy focused discord moderation assistant manager.

## Commands

- `/warn target_id:<user_id> message:<text>` - Warn about user. Tracks toward kick quorum.
- `/whisper message:<text>` - Anonymous message to mods
- `/privacy` - View privacy info

## Quick Setup

### 1. Create Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Name it → Bot → Add Bot
3. **Token**: Reset Token → Copy for `DISCORD_TOKEN`
4. **Application ID**: General Information → Copy for `DISCORD_APP_ID`
5. **Intents**: Disable ALL privileged intents

### 2. Generate Invite Link

1. In Discord Developer Portal, go to your app
2. Left sidebar → OAuth2 → URL Generator
3. **Select Scopes** (what the bot can do):
   - ✅ `bot` - Allows bot to join servers
   - ✅ `applications.commands` - Allows slash commands
4. **Select Bot Permissions** (what bot can access):
   - ✅ `Send Messages` - Post warnings to mod channel
   - Total permissions value: 2048
5. Scroll down → Copy the generated URL
6. Open URL in browser → Choose your server → Authorize

### 3. Hosting

Self-host or use a service like [Railway](https://railway.app).

**Railway Setup:**

1. Fork this repo to your GitHub
2. [railway.app](https://railway.app) → Start New Project → Deploy from GitHub repo
3. Add service → Database → Add PostgreSQL
4. Click on your app → Variables → Add all variables from step 4
5. **Important**: Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`
6. Settings → Generate Domain (for health checks)
7. Deploys automatically on git push

### 4. Get IDs & Configure

```bash
DISCORD_TOKEN=         # Bot token from step 1.3
DISCORD_APP_ID=        # Application ID from step 1.4
GUILD_ID=              # Right-click server → Copy Server ID (needs Developer Mode*)
MOD_CHANNEL_ID=        # Right-click mod channel → Copy Channel ID
KICK_QUORUM_PERCENT=40 # % of members for kick alert
GUILD_SALT=            # Run: openssl rand -base64 32
DATABASE_URL=          # Local: postgres://user:pass@localhost:5432/gary
                       # Railway: ${{Postgres.DATABASE_URL}}
```

\*Enable Developer Mode: Discord Settings → Advanced → Developer Mode

## Local Development

```bash
cd apps/bot
bun install
cp .env.example .env  # Edit with your values
npx prisma db push
bun run dev
```
