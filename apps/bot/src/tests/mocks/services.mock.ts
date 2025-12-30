import { mock } from 'bun:test';

export const mockTimeCalculationService = {
  TimeCalculationService: {
    getNextMondayAt9AM: mock(() => new Date())
  }
};

export const mockTimestampUtils = {
  TimestampUtils: {
    formatDiscordTimestamp: mock(() => 'formatted-timestamp')
  }
};

export const mockChannelFinderService = {
  ChannelFinderService: {
    governance: mock(() => Promise.resolve()),
    general: mock(() => Promise.resolve()),
    modComms: mock(() => Promise.resolve())
  }
};

export const mockPino = {
  default: () => ({
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  })
};

export const resetServiceMocks = () => {
  mockTimeCalculationService.TimeCalculationService.getNextMondayAt9AM.mockReset();
  mockTimestampUtils.TimestampUtils.formatDiscordTimestamp.mockReset();
  mockChannelFinderService.ChannelFinderService.governance.mockReset();
  mockChannelFinderService.ChannelFinderService.general.mockReset();
  mockChannelFinderService.ChannelFinderService.modComms.mockReset();
};