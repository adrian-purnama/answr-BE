/**
 * Add calendar months in UTC with day clamping (Jan 31 + 1 month → Feb 28/29).
 */
export function addCalendarMonths(dateUtc: Date, months: number): Date {
  const year = dateUtc.getUTCFullYear();
  const month = dateUtc.getUTCMonth();
  const day = dateUtc.getUTCDate();
  const hours = dateUtc.getUTCHours();
  const minutes = dateUtc.getUTCMinutes();
  const seconds = dateUtc.getUTCSeconds();
  const ms = dateUtc.getUTCMilliseconds();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTarget = daysInUtcMonth(targetYear, normalizedMonth);
  const clampedDay = Math.min(day, daysInTarget);

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      clampedDay,
      hours,
      minutes,
      seconds,
      ms,
    ),
  );
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Clock-skew tolerance for backdating floor. */
export const PLAN_BACKDATE_SKEW_MS = 5_000;

export function backdateFloor(now: Date = new Date()): Date {
  return new Date(now.getTime() - PLAN_BACKDATE_SKEW_MS);
}
