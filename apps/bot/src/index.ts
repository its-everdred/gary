import { Client, GatewayIntentBits, REST, Routes, Partials } from 'discord.js';
import pino from 'pino';
import { warnCommand, warnHandler } from './commands/warn.js';
import { unwarnCommand, unwarnHandler } from './commands/unwarn.js';
import { nominateCommand, nominateHandler } from './commands/nominate/index.js';
import { modCommand, modHandler } from './commands/mod.js';
import { NominationJobScheduler } from './lib/jobScheduler.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const commands = [warnCommand, unwarnCommand, nominateCommand, modCommand];

let jobScheduler: NominationJobScheduler | null = null;

client.on('clientReady', async () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
  logger.info(`Connected to ${client.guilds.cache.size} guilds`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  
  try {
    logger.info('Registering slash commands...', { 
      commandCount: commands.length,
      appId: process.env.DISCORD_APP_ID,
      commands: commands.map(c => c.name)
    });
    
    // Add timeout to catch hanging API calls
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Command registration timed out after 10 seconds')), 10000);
    });
    
    const registrationPromise = rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID!),
      { body: commands }
    );
    
    const result = await Promise.race([registrationPromise, timeoutPromise]);
    
    logger.info('Commands registered successfully', { 
      registeredCount: Array.isArray(result) ? result.length : 'unknown'
    });
  } catch (error: any) {
    logger.error({ 
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      appId: process.env.DISCORD_APP_ID 
    }, 'Failed to register commands');
  }

  // Start nomination job scheduler
  try {
    jobScheduler = NominationJobScheduler.getInstance(client);
    jobScheduler.start();
    logger.info('Nomination job scheduler started successfully');
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

client.on('warn', (warning) => {
  logger.warn(warning, 'Discord client warning');
});

client.on('debug', (info) => {
  if (info.includes('interaction')) {
    logger.debug(info, 'Debug interaction info');
  }
});

client.on('interactionCreate', async (interaction) => {
  logger.info({ 
    type: interaction.type,
    isChatInput: interaction.isChatInputCommand(),
    inGuild: interaction.inGuild(),
    user: interaction.user.id
  }, 'Interaction received');

  if (!interaction.isChatInputCommand()) return;
  
  logger.info({ 
    command: interaction.commandName, 
    user: interaction.user.id,
    channel: interaction.channelId 
  }, 'Command received');
  
  try {
    switch (interaction.commandName) {
      case 'warn':
        await warnHandler(interaction);
        break;
      case 'unwarn':
        await unwarnHandler(interaction);
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

logger.info('Starting bot...', {
  hasToken: !!process.env.DISCORD_TOKEN,
  hasAppId: !!process.env.DISCORD_APP_ID,
  tokenStart: process.env.DISCORD_TOKEN?.substring(0, 10)
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  if (jobScheduler?.isRunning()) {
    logger.info('Stopping nomination job scheduler...');
    jobScheduler.stop();
  }
  
  client.destroy();
  logger.info('Bot shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error(error, 'Failed to login');
  process.exit(1);
});