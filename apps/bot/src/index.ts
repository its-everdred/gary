import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import pino from 'pino';
import { kickCommand, kickHandler } from './commands/kick.js';
import { historyCommand, historyHandler } from './commands/history.js';
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

const commands = [kickCommand, historyCommand, privacyCommand];

client.on('ready', async () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
  
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand() || !interaction.inGuild() === false) return;
  
  try {
    switch (interaction.commandName) {
      case 'kick':
        await kickHandler(interaction);
        break;
      case 'history':
        await historyHandler(interaction);
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

client.login(process.env.DISCORD_TOKEN);