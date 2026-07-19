import { describe, test, expect } from 'bun:test';
import { formatAbsoluteDate, formatTimeAgo } from '../lib/pruneFormatUtils.js';

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

describe('formatAbsoluteDate', () => {
  test('renders "July 2, 2025"', () => {
    expect(formatAbsoluteDate(utc(2025, 7, 2))).toBe('July 2, 2025');
  });
});

describe('formatTimeAgo', () => {
  test('matches the report example: 12 months, 2 weeks', () => {
    expect(formatTimeAgo(utc(2025, 7, 2), utc(2026, 7, 18))).toBe(
      '12 months, 2 weeks'
    );
  });

  test('6 weeks ago renders as month + week', () => {
    // June 6 -> July 18 is 42 days = 1 month, 1 week, 5 days -> top two
    expect(formatTimeAgo(utc(2026, 6, 6), utc(2026, 7, 18))).toBe(
      '1 month, 1 week'
    );
  });

  test('under a week renders days only', () => {
    expect(formatTimeAgo(utc(2026, 7, 15), utc(2026, 7, 18))).toBe('3 days');
  });

  test('pluralization: singular week', () => {
    expect(formatTimeAgo(utc(2026, 7, 11), utc(2026, 7, 18))).toBe('1 week');
  });

  test('pluralization: two weeks', () => {
    expect(formatTimeAgo(utc(2026, 7, 4), utc(2026, 7, 18))).toBe('2 weeks');
  });

  test('exact month boundary renders single month', () => {
    expect(formatTimeAgo(utc(2026, 6, 18), utc(2026, 7, 18))).toBe('1 month');
  });

  test('future or equal dates render "less than a day"', () => {
    expect(formatTimeAgo(utc(2026, 7, 18), utc(2026, 7, 18))).toBe(
      'less than a day'
    );
  });
});
