/**
 * Calendar and campus-time helpers (ADR 0004).
 *
 * Booking windows are wall-clock values in the campus time zone: an `IsoDate` (YYYY-MM-DD)
 * plus a `ClockTime` (HH:MM, 24h). Calendar arithmetic is done in UTC on date-only values,
 * so it never depends on the runtime's local time zone. Conversions to real instants go
 * through `Intl` with an explicit `timeZone`.
 */

export type IsoDate = string;
export type ClockTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDate(date: IsoDate): DateParts | null {
  const match = DATE_RE.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function requireDate(date: IsoDate): DateParts {
  const parts = parseDate(date);
  if (!parts) throw new RangeError(`Invalid ISO date: ${date}`);
  return parts;
}

function toIsoDate(utcMs: number): IsoDate {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  return parseDate(value) !== null;
}

export function isValidClockTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Minutes since midnight for a valid `HH:MM` value. */
export function minutesOf(time: ClockTime): number {
  const match = TIME_RE.exec(time);
  if (!match) throw new RangeError(`Invalid clock time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = requireDate(date);
  return toIsoDate(Date.UTC(year, month - 1, day) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = requireDate(a);
  const pb = requireDate(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY_MS,
  );
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: IsoDate): number {
  const { year, month, day } = requireDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(instantMs: number, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

function offsetMs(instantMs: number, timeZone: string): number {
  const w = wallClock(instantMs, timeZone);
  const asUtc = Date.UTC(
    w.year ?? 0,
    (w.month ?? 1) - 1,
    w.day ?? 1,
    w.hour ?? 0,
    w.minute ?? 0,
    w.second ?? 0,
  );
  return asUtc - (instantMs - (instantMs % 1000));
}

/** The campus-local calendar date and clock time of an instant. */
export function zonedDateTime(instant: Date, timeZone: string): { date: IsoDate; time: ClockTime } {
  const w = wallClock(instant.getTime(), timeZone);
  const pad = (n: number | undefined): string => String(n ?? 0).padStart(2, '0');
  return {
    date: `${String(w.year ?? 0).padStart(4, '0')}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/**
 * The instant at which a campus-local wall-clock time occurs.
 * Times inside a spring-forward gap resolve to the later offset. Our cleaning windows are
 * daytime-only, so they never fall into a DST gap.
 */
export function zonedTimeToInstant(date: IsoDate, time: ClockTime, timeZone: string): Date {
  const { year, month, day } = requireDate(date);
  const minutes = minutesOf(time);
  const naiveUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const firstOffset = offsetMs(naiveUtc, timeZone);
  let candidate = naiveUtc - firstOffset;
  const secondOffset = offsetMs(candidate, timeZone);
  if (secondOffset !== firstOffset) candidate = naiveUtc - secondOffset;
  return new Date(candidate);
}

export function formatDateLong(date: IsoDate, locale = 'en-US'): string {
  const { year, month, day } = requireDate(date);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "November 2, 2026" */
export function formatDateWithYear(date: IsoDate, locale = 'en-US'): string {
  const { year, month, day } = requireDate(date);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateShort(date: IsoDate, locale = 'en-US'): string {
  const { year, month, day } = requireDate(date);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function splitTime(time: ClockTime): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const minutes = minutesOf(time);
  const h24 = Math.floor(minutes / 60);
  return {
    hour: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: minutes % 60,
    period: h24 < 12 ? 'AM' : 'PM',
  };
}

/** "4:00 PM". Formatted by hand so output is identical in every runtime and ICU version. */
export function formatTime(time: ClockTime): string {
  const { hour, minute, period } = splitTime(time);
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

/** "4:00–6:00 PM", or "11:00 AM–1:00 PM" when the window crosses noon. */
export function formatWindow(start: ClockTime, end: ClockTime): string {
  const s = splitTime(start);
  const e = splitTime(end);
  const startText = `${s.hour}:${String(s.minute).padStart(2, '0')}`;
  const endText = formatTime(end);
  return s.period === e.period ? `${startText}–${endText}` : `${formatTime(start)}–${endText}`;
}
