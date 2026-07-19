/**
 * Formatting helpers for the prune inactivity report.
 * Pure, Discord-free functions so they are trivially unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * Formats a date as e.g. "July 2, 2025" (always in UTC for stability).
 */
export function formatAbsoluteDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

function addUTCMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * Humanizes the gap between two dates as the two largest non-zero units among
 * months, weeks, and days, e.g. "12 months, 2 weeks" or "3 days".
 * Uses months (not years) as the top unit to match the prune report format.
 */
export function formatTimeAgo(from: Date, to: Date): string {
  if (from >= to) {
    return 'less than a day';
  }

  // Calendar months between the two dates.
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (addUTCMonths(from, months) > to) {
    months -= 1;
  }

  const anchor = addUTCMonths(from, months);
  const remainingDays = Math.floor((to.getTime() - anchor.getTime()) / DAY_MS);
  const weeks = Math.floor(remainingDays / 7);
  const days = remainingDays % 7;

  const units = [
    { value: months, unit: 'month' },
    { value: weeks, unit: 'week' },
    { value: days, unit: 'day' },
  ].filter((u) => u.value > 0);

  if (units.length === 0) {
    return 'less than a day';
  }

  return units
    .slice(0, 2)
    .map((u) => pluralize(u.value, u.unit))
    .join(', ');
}
