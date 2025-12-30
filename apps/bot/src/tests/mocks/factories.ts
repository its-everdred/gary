import { NomineeState } from '@prisma/client';
import type { Nominee } from '@prisma/client';

export const createMockNominee = (overrides: Partial<Nominee> = {}): Nominee => ({
  id: 'test-nominee-id',
  name: 'Test Nominee',
  state: NomineeState.ACTIVE,
  nominator: 'nominator-user-id',
  guildId: 'test-guild-id',
  discussionStart: new Date(),
  voteStart: new Date(),
  cleanupStart: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  discussionChannelId: 'discussion-channel-id',
  voteChannelId: 'vote-channel-id',
  votePollMessageId: null,
  voteYesCount: 0,
  voteNoCount: 0,
  votePassed: null,
  botMessageIds: null,
  voteGovernanceAnnounced: false,
  announcementMessageIds: null,
  ...overrides
});