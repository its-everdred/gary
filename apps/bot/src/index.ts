import { Client, GatewayIntentBits, REST, Routes, Partials } from 'discord.js';
import pino from 'pino';
import { flagCommand, flagHandler } from './commands/flag.js';
import { unflagCommand, unflagHandler } from './commands/unflag.js';
import { nominateCommand, nominateHandler } from './commands/nominate/index.js';
import { modCommand, modHandler } from './commands/mod.js';
import { NominationJobScheduler } from './lib/jobScheduler.js';
import { ChannelFinderService } from './lib/channelFinderService.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
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
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  
  try {
    
    // Add timeout to catch hanging API calls
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Command registration timed out after 10 seconds')), 10000);
    });
    
    const registrationPromise = rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID!),
      { body: commands }
    );
    
    await Promise.race([registrationPromise, timeoutPromise]);
    
  } catch (error: any) {
    logger.error({ 
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      appId: process.env.DISCORD_APP_ID 
    }, 'Failed to register commands');
  }

  // Initialize ChannelFinderService
  ChannelFinderService.initialize(client);
  
  // Start nomination job scheduler
  try {
    jobScheduler = NominationJobScheduler.getInstance(client);
    jobScheduler.start();
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
const gracefulShutdown = () => {
  if (jobScheduler?.isRunning()) {
    jobScheduler.stop();
  }
  
  client.destroy();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown());
process.on('SIGINT', () => gracefulShutdown());

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error(error, 'Failed to login');
  process.exit(1);
});