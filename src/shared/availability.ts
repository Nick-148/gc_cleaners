/**
 * Pure availability computation shared by the API and its tests (ADR 0004).
 * Effective windows = weekly rules for the weekday, overridden by `start_time`
 * with per-date overrides, removed entirely by closures.
 */
import {
  addDays,
  isValidClockTime,
  isValidIsoDate,
  weekdayOf,
  zonedDateTime,
  zonedTimeToInstant,
  type ClockTime,
  type IsoDate,
} from './dates';

export interface AvailabilityRule {
  id: string;
  weekday: number;
  startTime: ClockTime;
  endTime: ClockTime;
  capacity: number;
  active: boolean;
}

export interface WindowOverride {
  id: string;
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  capacity: number;
  note: string | null;
}

export interface Closure {
  date: IsoDate;
  reason: string | null;
}

export interface CleaningWindow {
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  capacity: number;
  source: 'rule' | 'override';
}

export interface BookableWindow {
  startTime: ClockTime;
  endTime: ClockTime;
  remaining: number;
}

export interface BookableDay {
  date: IsoDate;
  windows: BookableWindow[];
}

export interface SchedulingPolicy {
  timeZone: string;
  minLeadHours: number;
  horizonDays: number;
}

export function slotKey(date: IsoDate, startTime: ClockTime): string {
  return `${date}T${startTime}`;
}

/**
 * Every effective window on a date, including closed ones (capacity 0).
 * Returns [] for closed days. Sorted by start time.
 */
export function windowsForDate(
  date: IsoDate,
  rules: readonly AvailabilityRule[],
  overrides: readonly WindowOverride[],
  closures: readonly Closure[],
): CleaningWindow[] {
  if (closures.some((c) => c.date === date)) return [];
  const weekday = weekdayOf(date);
  const byStart = new Map<ClockTime, CleaningWindow>();
  for (const rule of rules) {
    if (!rule.active || rule.weekday !== weekday) continue;
    byStart.set(rule.startTime, {
      date,
      startTime: rule.startTime,
      endTime: rule.endTime,
      capacity: rule.capacity,
      source: 'rule',
    });
  }
  for (const override of overrides) {
    if (override.date !== date) continue;
    byStart.set(override.startTime, {
      date,
      startTime: override.startTime,
      endTime: override.endTime,
      capacity: override.capacity,
      source: 'override',
    });
  }
  return [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** First and last bookable calendar dates (campus time) for the policy. */
export function bookingDateRange(
  now: Date,
  policy: SchedulingPolicy,
): { firstDate: IsoDate; lastDate: IsoDate } {
  const today = zonedDateTime(now, policy.timeZone).date;
  return { firstDate: today, lastDate: addDays(today, policy.horizonDays) };
}

/** Whether a window's start is within the lead-time and horizon limits. */
export function isWithinBookingRange(
  date: IsoDate,
  startTime: ClockTime,
  now: Date,
  policy: SchedulingPolicy,
): boolean {
  if (!isValidIsoDate(date) || !isValidClockTime(startTime)) return false;
  const { lastDate } = bookingDateRange(now, policy);
  if (date > lastDate) return false;
  const startsAt = zonedTimeToInstant(date, startTime, policy.timeZone).getTime();
  return startsAt >= now.getTime() + policy.minLeadHours * 3_600_000;
}

/**
 * Bookable days from `from` (clamped to today) for `days` days, never past the horizon.
 * `bookedCounts` maps `slotKey(date, start)` to the number of active bookings.
 * Days with no bookable windows are kept, with an empty `windows` array.
 */
export function computeBookableDays(input: {
  now: Date;
  policy: SchedulingPolicy;
  from?: IsoDate | undefined;
  days: number;
  rules: readonly AvailabilityRule[];
  overrides: readonly WindowOverride[];
  closures: readonly Closure[];
  bookedCounts: ReadonlyMap<string, number>;
}): BookableDay[] {
  const { now, policy } = input;
  const { firstDate, lastDate } = bookingDateRange(now, policy);
  const start = input.from !== undefined && input.from > firstDate ? input.from : firstDate;
  const result: BookableDay[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(start, i);
    if (date > lastDate) break;
    const windows = windowsForDate(date, input.rules, input.overrides, input.closures)
      .filter((w) => w.capacity > 0 && isWithinBookingRange(date, w.startTime, now, policy))
      .map((w) => ({
        startTime: w.startTime,
        endTime: w.endTime,
        remaining: Math.max(
          0,
          w.capacity - (input.bookedCounts.get(slotKey(date, w.startTime)) ?? 0),
        ),
      }));
    result.push({ date, windows });
  }
  return result;
}

/** The effective open window for a requested slot, or null if no such window exists or it's closed. */
export function findOpenWindow(
  date: IsoDate,
  startTime: ClockTime,
  rules: readonly AvailabilityRule[],
  overrides: readonly WindowOverride[],
  closures: readonly Closure[],
): CleaningWindow | null {
  const window = windowsForDate(date, rules, overrides, closures).find(
    (w) => w.startTime === startTime,
  );
  return window && window.capacity > 0 ? window : null;
}
