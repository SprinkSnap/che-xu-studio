/**
 * Business-timezone reporting periods for dashboard revenue windows.
 */

import { calendarDateInTimeZone, addCalendarDays } from '../reminders/dates';
import { DEFAULT_REPORTING_TIMEZONE } from './definitions';

/** Offset of `timeZone` from UTC at instant `date` (ms): localAsUtc - utc. */
function timezoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second')),
  );
  return asUtc - date.getTime();
}

/**
 * Convert a civil date/time in `timeZone` to a UTC Date.
 * Handles DST by refining the offset twice.
 */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = utcMillis;
  for (let i = 0; i < 2; i += 1) {
    const offset = timezoneOffsetMs(timeZone, new Date(instant));
    instant = utcMillis - offset;
  }
  return new Date(instant);
}

export function startOfBusinessDayUtc(isoDate: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split('-').map((p) => Number.parseInt(p, 10));
  return zonedLocalToUtc(y, m, d, 0, 0, 0, timeZone);
}

export function getBusinessToday(now = new Date(), timeZone = DEFAULT_REPORTING_TIMEZONE): string {
  return calendarDateInTimeZone(now, timeZone);
}

export type ReportingPeriod = {
  /** Inclusive start (UTC ISO). */
  startUtcIso: string;
  /** Exclusive end (UTC ISO) — typically now. */
  endUtcIso: string;
  /** Business-local YYYY-MM-DD start. */
  startDate: string;
  /** Business-local YYYY-MM-DD for "today". */
  businessToday: string;
  timeZone: string;
  label: string;
};

/** First calendar day of the business month containing `now`. */
export function getBusinessMonthStartDate(now: Date, timeZone: string): string {
  const today = calendarDateInTimeZone(now, timeZone);
  return `${today.slice(0, 7)}-01`;
}

/** January 1 of the business year containing `now`. */
export function getBusinessYearStartDate(now: Date, timeZone: string): string {
  const today = calendarDateInTimeZone(now, timeZone);
  return `${today.slice(0, 4)}-01-01`;
}

export function getBusinessMonthRange(
  now = new Date(),
  timeZone = DEFAULT_REPORTING_TIMEZONE,
): ReportingPeriod {
  const businessToday = getBusinessToday(now, timeZone);
  const startDate = getBusinessMonthStartDate(now, timeZone);
  const startUtc = startOfBusinessDayUtc(startDate, timeZone);
  return {
    startUtcIso: startUtc.toISOString(),
    endUtcIso: now.toISOString(),
    startDate,
    businessToday,
    timeZone,
    label: 'this month',
  };
}

export function getBusinessYearRange(
  now = new Date(),
  timeZone = DEFAULT_REPORTING_TIMEZONE,
): ReportingPeriod {
  const businessToday = getBusinessToday(now, timeZone);
  const startDate = getBusinessYearStartDate(now, timeZone);
  const startUtc = startOfBusinessDayUtc(startDate, timeZone);
  return {
    startUtcIso: startUtc.toISOString(),
    endUtcIso: now.toISOString(),
    startDate,
    businessToday,
    timeZone,
    label: 'this year',
  };
}

/** Last N complete/partial business months ending at current month (inclusive). */
export function getTrailingBusinessMonthRanges(
  monthCount: number,
  now = new Date(),
  timeZone = DEFAULT_REPORTING_TIMEZONE,
): Array<{ key: string; startUtcIso: string; endUtcIso: string; label: string }> {
  const today = calendarDateInTimeZone(now, timeZone);
  const [year, month] = today.split('-').map((p) => Number.parseInt(p, 10));
  const ranges: Array<{ key: string; startUtcIso: string; endUtcIso: string; label: string }> = [];

  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const startUtc = startOfBusinessDayUtc(startDate, timeZone);
    const endUtc =
      i === 0 ? now : startOfBusinessDayUtc(endDate, timeZone);
    ranges.push({
      key: startDate.slice(0, 7),
      startUtcIso: startUtc.toISOString(),
      endUtcIso: endUtc.toISOString(),
      label: startDate.slice(0, 7),
    });
  }
  return ranges;
}

export function businessMonthKey(isoTimestamp: string, timeZone: string): string {
  return calendarDateInTimeZone(new Date(isoTimestamp), timeZone).slice(0, 7);
}

export { addCalendarDays, calendarDateInTimeZone };
