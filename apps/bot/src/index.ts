import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import pino from 'pino';
import { warnCommand, warnHandler } from './commands/warn.js';
import { whisperCommand, whisperHandler } from './commands/whisper.js';
import { privacyCommand, privacyHandler } from './commands/privacy.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
});

const commands = [warnCommand, whisperCommand, privacyCommand];

client.on('clientReady', async () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
  logger.info(`Connected to ${client.guilds.cache.size} guilds`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  
  try {
    logger.info('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID!),
      { body: commands }
    );
    logger.info('Commands registered successfully');
  } catch (error) {
    logger.error(error, 'Failed to register commands');
  }
});

client.on('error', (error) => {
  logger.error(error, 'Discord client error');
});

client.on('warn', (warning) => {
  logger.warn(warning, 'Discord client warning');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  // If command used in guild, provide helpful DM instructions
  if (interaction.inGuild()) {
    await interaction.reply({
      content: 'Commands are not supported from the discord chat. Instead:\n1. Right click me in the members list\n2. Click Message\n3. Resend this in a DM',
      ephemeral: true
    });
    return;
  }
  
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
      case 'whisper':
        await whisperHandler(interaction);
        break;
      case 'privacy':
        await privacyHandler(interaction);
        break;
    }
  } catch (error) {
    logger.error({ error, command: interaction.commandName }, 'Command error');
    await interaction.reply({ 
      content: 'An error occurred while processing your command.', 
      ephemeral: true 
    }).catch(() => {});
  }
});

logger.info('Starting bot...');
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error(error, 'Failed to login');
  process.exit(1);
});