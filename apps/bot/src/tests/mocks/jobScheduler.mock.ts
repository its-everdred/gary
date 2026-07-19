import { mock } from 'bun:test';

export const mockJobScheduler = {
  start: mock(() => {}),
  stop: mock(() => {}),
  isRunning: mock(() => false),
  transitionToVote: mock(() => Promise.resolve()),
  transitionToCleanup: mock(() => Promise.resolve()),
  transitionToPast: mock(() => Promise.resolve()),
  forceVoteToCleanup: mock(() =>
    Promise.resolve({ success: true, tallied: false })
  )
};

export const mockNominationJobScheduler = {
  getInstance: mock(() => mockJobScheduler)
};

export const resetJobSchedulerMocks = () => {
  mockJobScheduler.start.mockReset();
  mockJobScheduler.stop.mockReset();
  mockJobScheduler.isRunning.mockReset();
  mockJobScheduler.transitionToVote.mockReset();
  mockJobScheduler.transitionToCleanup.mockReset();
  mockJobScheduler.transitionToPast.mockReset();
  mockJobScheduler.forceVoteToCleanup.mockReset();
  mockJobScheduler.forceVoteToCleanup.mockImplementation(() =>
    Promise.resolve({ success: true, tallied: false })
  );
  mockNominationJobScheduler.getInstance.mockReset();
  
  // Re-establish the mock implementation after reset
  mockNominationJobScheduler.getInstance.mockImplementation(() => mockJobScheduler);
};