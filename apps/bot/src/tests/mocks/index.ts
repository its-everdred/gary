import { mock } from 'bun:test';
import { mockPrisma, resetDatabaseMocks } from './database.mock';
import { mockConfigService, resetConfigMocks } from './config.mock';
import { mockConstants } from './constants.mock';
import { 
  createMockClient, 
  createMockInteraction, 
  createMockChannel,
  createMockMessage,
  mockDiscordJS,
  resetDiscordMocks 
} from './discord.mock';
import { 
  mockJobScheduler, 
  mockNominationJobScheduler, 
  resetJobSchedulerMocks 
} from './jobScheduler.mock';
import { 
  mockTimeCalculationService,
  mockTimestampUtils,
  mockChannelFinderService,
  mockPino,
  resetServiceMocks
} from './services.mock';

export * from './factories';

// Module mock setup function
export const setupModuleMocks = () => {
  mock.module('../../lib/db.js', () => ({ prisma: mockPrisma }));
  mock.module('../../lib/configService.js', () => mockConfigService);
  mock.module('../../lib/constants.js', () => mockConstants);
  mock.module('../../lib/jobScheduler.js', () => ({ NominationJobScheduler: mockNominationJobScheduler }));
  mock.module('../../lib/timeCalculation.js', () => mockTimeCalculationService);
  mock.module('../../lib/timestampUtils.js', () => mockTimestampUtils);
  mock.module('../../lib/channelFinderService.js', () => mockChannelFinderService);
  mock.module('discord.js', () => mockDiscordJS);
  mock.module('pino', () => mockPino);
};

// Reset all mocks function
export const resetAllMocks = (...customMocks: any[]) => {
  resetDatabaseMocks();
  resetConfigMocks();
  resetJobSchedulerMocks();
  resetServiceMocks();
  
  // Reset any custom mocks passed in
  customMocks.forEach(mockObj => {
    if (mockObj && typeof mockObj.mockReset === 'function') {
      mockObj.mockReset();
    }
  });
};

// Function to restore real modules for tests that need actual implementations
export const restoreRealModule = (modulePath: string) => {
  // This clears the module mock for the specific path
  mock.module(modulePath, undefined);
};

// Export individual mocks for direct use
export {
  mockPrisma,
  mockConfigService,
  mockConstants,
  mockJobScheduler,
  mockNominationJobScheduler,
  mockTimeCalculationService,
  mockTimestampUtils,
  mockChannelFinderService,
  createMockClient,
  createMockInteraction,
  createMockChannel,
  createMockMessage,
  mockDiscordJS
};