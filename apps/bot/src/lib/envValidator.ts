import dotenv from 'dotenv';
import pino from 'pino';

const logger = pino();

// Load .env file
dotenv.config();

interface EnvConfig {
  // Discord
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  GUILD_ID: string;
  
  // Channels
  GOVERNANCE_CHANNEL_ID: string;
  GENERAL_CHANNEL_ID: string;
  MOD_FLAG_CHANNEL_ID: string;
  MOD_COMMS_CHANNEL_ID: string;
  NOMINATIONS_CHANNEL_CATEGORY_ID: string;
  
  // Database
  DATABASE_URL: string;
  
  // Voting
  KICK_QUORUM_PERCENT: string;
  VOTE_QUORUM_PERCENT: string;
  VOTE_PASS_PERCENT: string;
  
  // Security
  GUILD_SALT: string;
  
  // Nomination Durations (in minutes)
  NOMINATE_DISCUSSION_PERIOD_MINUTES: string;
  NOMINATE_VOTE_PERIOD_MINUTES: string;
  NOMINATE_CLEANUP_PERIOD_MINUTES: string;
  
  // Logging
  LOG_LEVEL?: string;
}

const REQUIRED_ENV_VARS: (keyof EnvConfig)[] = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'GUILD_ID',
  'GOVERNANCE_CHANNEL_ID',
  'GENERAL_CHANNEL_ID',
  'MOD_FLAG_CHANNEL_ID',
  'MOD_COMMS_CHANNEL_ID',
  'NOMINATIONS_CHANNEL_CATEGORY_ID',
  'DATABASE_URL',
  'KICK_QUORUM_PERCENT',
  'VOTE_QUORUM_PERCENT',
  'VOTE_PASS_PERCENT',
  'GUILD_SALT',
  'NOMINATE_DISCUSSION_PERIOD_MINUTES',
  'NOMINATE_VOTE_PERIOD_MINUTES',
  'NOMINATE_CLEANUP_PERIOD_MINUTES'
];

export function validateEnvironment(): void {
  const missingVars: string[] = [];
  
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', missingVars);
    logger.error('Please ensure all required environment variables are set in your .env file or deployment environment');
    
    // Provide helpful defaults info
    logger.info('Default values:');
    logger.info('  NOMINATE_DISCUSSION_PERIOD_MINUTES=2880 (48 hours)');
    logger.info('  NOMINATE_VOTE_PERIOD_MINUTES=7200 (5 days)');
    logger.info('  NOMINATE_CLEANUP_PERIOD_MINUTES=1440 (24 hours)');
    logger.info('  KICK_QUORUM_PERCENT=40');
    logger.info('  VOTE_QUORUM_PERCENT=40');
    logger.info('  VOTE_PASS_PERCENT=80');
    
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  // Validate numeric values
  const numericVars = [
    'KICK_QUORUM_PERCENT',
    'VOTE_QUORUM_PERCENT', 
    'VOTE_PASS_PERCENT',
    'NOMINATE_DISCUSSION_PERIOD_MINUTES',
    'NOMINATE_VOTE_PERIOD_MINUTES',
    'NOMINATE_CLEANUP_PERIOD_MINUTES'
  ];
  
  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(parseInt(value))) {
      throw new Error(`${varName} must be a valid number, got: ${value}`);
    }
  }
  
  // Log successful validation with actual values
  logger.info('Environment variables validated successfully');
  logger.info('Nomination timings:', {
    discussionMinutes: process.env.NOMINATE_DISCUSSION_PERIOD_MINUTES,
    voteMinutes: process.env.NOMINATE_VOTE_PERIOD_MINUTES,
    cleanupMinutes: process.env.NOMINATE_CLEANUP_PERIOD_MINUTES
  });
}

// Export typed environment getter
export function getEnvVar(key: keyof EnvConfig): string {
  const value = process.env[key];
  if (!value && REQUIRED_ENV_VARS.includes(key)) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}