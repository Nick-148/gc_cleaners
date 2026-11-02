import { describe, expect, it } from 'vitest';
import {
  computeBookableDays,
  findOpenWindow,
  isWithinBookingRange,
  slotKey,
  windowsForDate,
  type AvailabilityRule,
  type SchedulingPolicy,
  type WindowOverride,
} from '../../src/shared/availability';

const policy: SchedulingPolicy = {
  timeZone: 'America/New_York',
  minLeadHours: 12,
  horizonDays: 28,
};
// Monday 2026-11-02, 09:00 EST.
const now = new Date('2026-11-02T14:00:00Z');

const rule = (
  weekday: number,
  startTime: string,
  endTime: string,
  capacity = 2,
  active = true,
): AvailabilityRule => ({
  id: `r-${weekday}-${startTime}`,
  weekday,
  startTime,
  endTime,
  capacity,
  active,
});

const rules = [
  rule(1, '16:00', '18:00'),
  rule(1, '18:00', '20:00'),
  rule(2, '18:00', '20:00'),
  rule(2, '16:00', '18:00'),
  rule(3, '16:00', '18:00', 2, false),
];

const override = (
  date: string,
  startTime: string,
  endTime: string,
  capacity: number,
): WindowOverride => ({
  id: `o-${date}-${startTime}`,
  date,
  startTime,
  endTime,
  capacity,
  note: null,
});

describe('windowsForDate', () => {
  it('returns active rules for the weekday, sorted by start time', () => {
    expect(windowsForDate('2026-11-03', rules, [], []).map((w) => w.startTime)).toEqual([
      '16:00',
      '18:00',
    ]);
  });

  it('ignores inactive rules', () => {
    expect(windowsForDate('2026-11-04', rules, [], [])).toEqual([]);
  });

  it('lets overrides replace, close or add windows', () => {
    const windows = windowsForDate(
      '2026-11-03',
      rules,
      [
        override('2026-11-03', '16:00', '17:00', 5),
        override('2026-11-03', '18:00', '20:00', 0),
        override('2026-11-03', '10:00', '12:00', 1),
        override('2026-11-10', '10:00', '12:00', 1),
      ],
      [],
    );
    expect(windows).toEqual([
      { date: '2026-11-03', startTime: '10:00', endTime: '12:00', capacity: 1, source: 'override' },
      { date: '2026-11-03', startTime: '16:00', endTime: '17:00', capacity: 5, source: 'override' },
      { date: '2026-11-03', startTime: '18:00', endTime: '20:00', capacity: 0, source: 'override' },
    ]);
  });

  it('closes the whole day for a closure', () => {
    expect(
      windowsForDate(
        '2026-11-03',
        rules,
        [override('2026-11-03', '10:00', '12:00', 1)],
        [{ date: '2026-11-03', reason: null }],
      ),
    ).toEqual([]);
  });
});

describe('isWithinBookingRange', () => {
  it('enforces the minimum lead time', () => {
    expect(isWithinBookingRange('2026-11-02', '20:00', now, policy)).toBe(false); // 11h away
    expect(isWithinBookingRange('2026-11-02', '21:00', now, policy)).toBe(true); // exactly 12h
  });

  it('enforces the horizon in campus days', () => {
    expect(isWithinBookingRange('2026-11-30', '16:00', now, policy)).toBe(true);
    expect(isWithinBookingRange('2026-12-01', '10:00', now, policy)).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isWithinBookingRange('2026-11-31', '16:00', now, policy)).toBe(false);
    expect(isWithinBookingRange('2026-11-10', '4pm', now, policy)).toBe(false);
  });
});

describe('computeBookableDays', () => {
  it('computes remaining capacity and hides windows inside the lead time', () => {
    const days = computeBookableDays({
      now,
      policy,
      days: 2,
      rules,
      overrides: [],
      closures: [],
      bookedCounts: new Map([
        [slotKey('2026-11-03', '16:00'), 2],
        [slotKey('2026-11-03', '18:00'), 1],
      ]),
    });
    expect(days).toEqual([
      { date: '2026-11-02', windows: [] },
      {
        date: '2026-11-03',
        windows: [
          { startTime: '16:00', endTime: '18:00', remaining: 0 },
          { startTime: '18:00', endTime: '20:00', remaining: 1 },
        ],
      },
    ]);
  });

  it('never reports negative remaining capacity after an admin lowers capacity', () => {
    const [day] = computeBookableDays({
      now,
      policy,
      from: '2026-11-03',
      days: 1,
      rules: [rule(2, '16:00', '18:00', 1)],
      overrides: [],
      closures: [],
      bookedCounts: new Map([[slotKey('2026-11-03', '16:00'), 3]]),
    });
    expect(day?.windows[0]?.remaining).toBe(0);
  });

  it('clamps a past `from` to today and stops at the horizon', () => {
    const days = computeBookableDays({
      now,
      policy,
      from: '2026-10-01',
      days: 60,
      rules,
      overrides: [],
      closures: [],
      bookedCounts: new Map(),
    });
    expect(days[0]?.date).toBe('2026-11-02');
    expect(days.at(-1)?.date).toBe('2026-11-30');
    expect(days).toHaveLength(29);
  });
});

describe('findOpenWindow', () => {
  it('finds open windows and rejects closed or unknown ones', () => {
    expect(findOpenWindow('2026-11-03', '16:00', rules, [], [])?.endTime).toBe('18:00');
    expect(findOpenWindow('2026-11-03', '17:00', rules, [], [])).toBeNull();
    expect(
      findOpenWindow(
        '2026-11-03',
        '16:00',
        rules,
        [override('2026-11-03', '16:00', '18:00', 0)],
        [],
      ),
    ).toBeNull();
  });
});
