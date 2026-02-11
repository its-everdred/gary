import { Client, GatewayIntentBits, REST, Routes, Partials } from 'discord.js';
import pino from 'pino';
import { flagCommand, flagHandler } from './commands/flag.js';
import { unflagCommand, unflagHandler } from './commands/unflag.js';
import { nominateCommand, nominateHandler } from './commands/nominate/index.js';
import { modCommand, modHandler } from './commands/mod.js';
import { NominationJobScheduler } from './lib/jobScheduler.js';
import { ChannelFinderService } from './lib/channelFinderService.js';
import { validateEnvironment } from './lib/envValidator.js';

// Note: Environment variables should be set by the deployment platform (Railway, Docker, etc)
// or loaded by the Prisma CLI which reads .env files automatically
// Validate environment variables before anything else
try {
  validateEnvironment();
} catch (error) {
  console.error('Environment validation failed:', error);
  process.exit(1);
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

logger.info({ pid: process.pid, port: process.env.PORT, nodeVersion: process.version }, 'Process starting');

process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const commands = [flagCommand, unflagCommand, nominateCommand, modCommand];

let jobScheduler: NominationJobScheduler | null = null;

client.on('clientReady', async () => {
  logger.info(`Gary bot is ready! Logged in as ${client.user?.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  
  try {
    logger.info('Registering slash commands...');
    
    // Add timeout to catch hanging API calls
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Command registration timed out after 10 seconds')), 10000);
    });
    
    const registrationPromise = rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID!),
      { body: commands }
    );
    
    await Promise.race([registrationPromise, timeoutPromise]);
    logger.info('Slash commands registered successfully');
    
  } catch (error: any) {
    logger.error({ 
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      appId: process.env.DISCORD_APP_ID 
    }, 'Failed to register commands');
  }

  // Initialize ChannelFinderService
  logger.info('Initializing ChannelFinderService...');
  ChannelFinderService.initialize(client);
  
  // Start nomination job scheduler
  try {
    logger.info('Starting nomination job scheduler...');
    jobScheduler = NominationJobScheduler.getInstance(client);
    jobScheduler.start();
    logger.info('Gary bot is fully operational!');
  } catch (error: any) {
    logger.error({ 
      error: error?.message || 'Unknown error',
      stack: error?.stack 
    }, 'Failed to start nomination job scheduler');
  }
});

client.on('error', (error) => {
  logger.error(error, 'Discord client error');
});

client.on('warn', () => {
  // Discord client warning
});


client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  try {
    switch (interaction.commandName) {
      case 'flag':
        await flagHandler(interaction);
        break;
      case 'unflag':
        await unflagHandler(interaction);
        break;
      case 'nominate':
        await nominateHandler(interaction);
        break;
      case 'mod':
        await modHandler(interaction);
        break;
    }
  } catch (error) {
    logger.error({ error, command: interaction.commandName }, 'Command error');
    await interaction.reply({ 
      content: 'An error occurred while processing your command.', 
      flags: 64 
    }).catch(() => {});
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info({ signal, uptime: process.uptime() }, 'Received shutdown signal');

  if (jobScheduler?.isRunning()) {
    jobScheduler.stop();
  }

  client.destroy();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Login with timeout
const loginTimeout = setTimeout(() => {
  logger.error('Discord login timed out after 30 seconds');
  process.exit(1);
}, 30000);

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    clearTimeout(loginTimeout);
    logger.info('Discord client logged in successfully');
  })
  .catch((error) => {
    clearTimeout(loginTimeout);
    logger.error(error, 'Failed to login');
    process.exit(1);
  });