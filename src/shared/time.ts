/**
 * Time-zone helpers built on the platform's Intl API, so no date library is
 * needed. Customers choose a local date and time ("Tuesday at 10:00"); the
 * server stores an exact instant (timestamptz). These functions convert
 * between the two for a named IANA time zone, including daylight-saving changes.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? -1,
  };
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True when the string is a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidLocalDate(date: string): boolean {
  const match = DATE_PATTERN.exec(date);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function isValidLocalTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/**
 * Converts a wall-clock date and time in `timeZone` to an exact instant.
 * Throws on malformed input; callers validate first.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  if (!isValidLocalDate(date) || !isValidLocalTime(time)) {
    throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  }
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);

  // Two passes: the second corrects for a daylight-saving change between the
  // naive guess and the real instant.
  const firstGuess = naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/** The local calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Adds whole calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Start (inclusive) and end (exclusive) instants of a local calendar day. */
export function localDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(date, "00:00", timeZone),
    end: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
