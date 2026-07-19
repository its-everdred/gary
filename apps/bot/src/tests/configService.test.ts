import { describe, test, expect, afterEach } from 'bun:test';
import { ConfigService } from '../lib/configService.js';

describe('ConfigService.getPruneWeeks', () => {
  const original = process.env.PRUNE_WEEKS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PRUNE_WEEKS;
    } else {
      process.env.PRUNE_WEEKS = original;
    }
  });

  test('defaults to 6 when unset', () => {
    delete process.env.PRUNE_WEEKS;
    expect(ConfigService.getPruneWeeks()).toBe(6);
  });

  test('returns the configured value when set to a positive integer', () => {
    process.env.PRUNE_WEEKS = '4';
    expect(ConfigService.getPruneWeeks()).toBe(4);
  });

  test('falls back to 6 when non-numeric', () => {
    process.env.PRUNE_WEEKS = 'abc';
    expect(ConfigService.getPruneWeeks()).toBe(6);
  });

  test('falls back to 6 when zero or negative', () => {
    process.env.PRUNE_WEEKS = '0';
    expect(ConfigService.getPruneWeeks()).toBe(6);
    process.env.PRUNE_WEEKS = '-3';
    expect(ConfigService.getPruneWeeks()).toBe(6);
  });
});
