import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDateLong,
  formatDateShort,
  formatTime,
  formatWindow,
  isValidClockTime,
  isValidIsoDate,
  minutesOf,
  weekdayOf,
  zonedDateTime,
  zonedTimeToInstant,
} from '../../src/shared/dates';

const TZ = 'America/New_York';

describe('date validation', () => {
  it.each([
    ['2026-11-02', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['20261102', false],
    ['', false],
  ])('isValidIsoDate(%j) = %s', (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });

  it.each([
    ['00:00', true],
    ['23:59', true],
    ['24:00', false],
    ['9:00', false],
    ['12:60', false],
  ])('isValidClockTime(%j) = %s', (value, expected) => {
    expect(isValidClockTime(value)).toBe(expected);
  });
});

describe('calendar arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is unaffected by DST transitions', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('computes weekdays (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(weekdayOf('2026-11-07')).toBe(6);
  });

  it('rejects invalid input loudly', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => minutesOf('25:00')).toThrow(RangeError);
  });
});

describe('campus time zone conversion', () => {
  it('converts wall-clock times to instants in EST and EDT', () => {
    expect(zonedTimeToInstant('2026-11-03', '16:00', TZ).toISOString()).toBe(
      '2026-11-03T21:00:00.000Z',
    );
    expect(zonedTimeToInstant('2026-07-01', '16:00', TZ).toISOString()).toBe(
      '2026-07-01T20:00:00.000Z',
    );
  });

  it('handles the DST transition days', () => {
    // Spring forward on 2026-03-08 at 02:00 → 03:00.
    expect(zonedTimeToInstant('2026-03-08', '01:30', TZ).toISOString()).toBe(
      '2026-03-08T06:30:00.000Z',
    );
    expect(zonedTimeToInstant('2026-03-08', '16:00', TZ).toISOString()).toBe(
      '2026-03-08T20:00:00.000Z',
    );
    // Fall back on 2026-11-01 at 02:00 → 01:00.
    expect(zonedTimeToInstant('2026-11-01', '16:00', TZ).toISOString()).toBe(
      '2026-11-01T21:00:00.000Z',
    );
  });

  it('round-trips with zonedDateTime', () => {
    for (const [date, time] of [
      ['2026-01-15', '10:00'],
      ['2026-06-15', '18:30'],
      ['2026-11-01', '14:00'],
    ] as const) {
      expect(zonedDateTime(zonedTimeToInstant(date, time, TZ), TZ)).toEqual({ date, time });
    }
  });

  it('reports the campus date even when UTC is already tomorrow', () => {
    expect(zonedDateTime(new Date('2026-11-03T03:30:00Z'), TZ)).toEqual({
      date: '2026-11-02',
      time: '22:30',
    });
  });
});

describe('formatting', () => {
  it('formats dates without depending on the host time zone', () => {
    expect(formatDateLong('2026-11-03')).toBe('Tuesday, November 3');
    expect(formatDateShort('2026-11-03')).toBe('Tue, Nov 3');
  });

  it('formats times and windows', () => {
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('16:30')).toBe('4:30 PM');
    expect(formatWindow('16:00', '18:00')).toBe('4:00–6:00 PM');
    expect(formatWindow('11:00', '13:00')).toBe('11:00 AM–1:00 PM');
  });
});
