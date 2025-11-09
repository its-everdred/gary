# GARY - GA Representative Yeoman

Anonymous voting Discord bot for community-driven moderation.

## Discord Bot Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Name it (e.g., "GARY Bot")
4. Navigate to **Bot** section
5. Click **Add Bot**
6. Under **Privileged Gateway Intents**, ensure these are OFF:
   - ❌ Presence Intent
   - ❌ Server Members Intent  
   - ❌ Message Content Intent

### 2. Configure Bot Settings

In the **Bot** section:
- Copy the **Token** (save for `.env` file)
- Enable **PUBLIC BOT** if you want others to add it

### 3. Configure OAuth2 Settings

1. Go to **OAuth2** → **General**
2. Copy the **Client ID** (save for `.env` file)
3. Add redirect URIs if needed (not required for bot-only)

### 4. Set Bot Permissions & Invite

1. Go to **OAuth2** → **URL Generator**
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ View Channels (only for alert channel)
4. Copy the generated URL and use it to add bot to your server

### 5. Enable Interactions in DMs

In **Installation** section:
1. Under **Installation Contexts**, check:
   - ✅ Guild Install
2. Under **Supported Integration Types**:
   - For "Guild Install": check **Command**
3. Save changes

**Important**: The bot will automatically have DM command permissions when users share a server with it.

## Local Setup

### Prerequisites
- Node.js 20+ or Bun
- PostgreSQL database

### Installation

1. Clone repository:
```bash
git clone <repo-url>
cd gary/apps/bot
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment:
```bash
cp .env.example .env
```

4. Configure `.env`:
```env
DISCORD_TOKEN=<bot-token-from-step-1>
DISCORD_APP_ID=<client-id-from-oauth2>
GUILD_ID=<your-guild-id>
ALERT_CHANNEL_ID=<mod-alert-channel-id>
QUORUM_PERCENT=40
ELIGIBLE_COUNT_OVERRIDE=0
GUILD_SALT=<generate-random-base64-string>
DATABASE_URL=postgres://user:pass@localhost:5432/gary
```

To generate `GUILD_SALT`:
```bash
openssl rand -base64 32
```

5. Initialize database:
```bash
bunx prisma db push
```

6. Run the bot:
```bash
bun run dev
```

## Finding Discord IDs

To get Discord IDs (user, channel, guild):
1. Enable Developer Mode in Discord Settings → Advanced
2. Right-click on user/channel/server → Copy ID

## Bot Commands

All commands are DM-only:
- `/kick target_id:<user-id>` - Vote to kick a member
- `/history` - View your voting history
- `/privacy` - View privacy information

## Permissions Summary

**Gateway Intents** (in code):
- ✅ Guilds
- ✅ DirectMessages
- ❌ MessageContent (explicitly disabled)

**Guild Permissions** (when inviting):
- Send Messages (for alert channel only)
- View Channels (for alert channel only)

**No access to**:
- Message content
- Member lists
- User presence
- Any DM content except slash commands