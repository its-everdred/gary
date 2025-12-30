import { mock } from 'bun:test';

export const mockConfigService = {
  ConfigService: {
    getVoteQuorumPercent: mock(() => 0.4),
    getKickQuorumPercent: mock(() => 0.4),
    getGovernanceChannelId: mock(() => 'governance-123'),
    getGeneralChannelId: mock(() => 'general-123'),
    getModFlagChannelId: mock(() => 'mod-flag-123'),
    getModCommsChannelId: mock(() => 'mod-comms-123'),
    getNominationsCategoryId: mock(() => 'category-123'),
    getGuildId: mock(() => 'test-guild-123'),
    getGuildSalt: mock(() => 'test-salt'),
    getLogLevel: mock(() => 'info')
  }
};

export const resetConfigMocks = () => {
  mockConfigService.ConfigService.getVoteQuorumPercent.mockReset();
  mockConfigService.ConfigService.getKickQuorumPercent.mockReset();
  mockConfigService.ConfigService.getGovernanceChannelId.mockReset();
  mockConfigService.ConfigService.getGeneralChannelId.mockReset();
  mockConfigService.ConfigService.getModFlagChannelId.mockReset();
  mockConfigService.ConfigService.getModCommsChannelId.mockReset();
  mockConfigService.ConfigService.getNominationsCategoryId.mockReset();
  mockConfigService.ConfigService.getGuildId.mockReset();
  mockConfigService.ConfigService.getGuildSalt.mockReset();
  mockConfigService.ConfigService.getLogLevel.mockReset();
};