import { describe, it, expect } from 'vitest';

import {
  getIstanbulToday,
  canEditDelivery,
  formatDateForDisplay,
  formatDateTime,
  parseIsoDate,
  formatIsoDate,
  getDatePresetRange,
  formatTime,
  parseDisplayDate,
  formatDateBucketLabel,
} from '@/utils/dates';

describe('getIstanbulToday', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    const today = getIstanbulToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a valid date', () => {
    const today = getIstanbulToday();
    const [year, month, day] = today.split('-').map(Number);
    expect(year).toBeGreaterThanOrEqual(2020);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });
});

describe('getDatePresetRange', () => {
  it('calculates an inclusive seven-day range across a month boundary', () => {
    expect(getDatePresetRange('7d', '2026-03-03')).toEqual({
      dateFrom: '2026-02-25',
      dateTo: '2026-03-03',
    });
  });

  it('calculates an inclusive thirty-day range across a year boundary', () => {
    expect(getDatePresetRange('30d', '2026-01-05')).toEqual({
      dateFrom: '2025-12-07',
      dateTo: '2026-01-05',
    });
  });

  it('uses the first day of the selected month', () => {
    expect(getDatePresetRange('month', '2024-02-29')).toEqual({
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
  });

  it('omits both dates for all time', () => {
    expect(getDatePresetRange('all', '2026-08-30')).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
    });
  });
});

describe('canEditDelivery', () => {
  it('returns false for a past date', () => {
    expect(canEditDelivery('2020-01-01')).toBe(false);
  });

  it('returns false for a future date', () => {
    expect(canEditDelivery('2999-12-31')).toBe(false);
  });

  it('returns a boolean for today', () => {
    const today = getIstanbulToday();
    expect(typeof canEditDelivery(today)).toBe('boolean');
  });
});

describe('formatDateForDisplay', () => {
  it('formats a date in Turkish locale', () => {
    const formatted = formatDateForDisplay('2024-03-15');
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/03/);
    expect(formatted).toMatch(/2024/);
  });

  it('accepts full ISO timestamps (RPC response shape)', () => {
    const formatted = formatDateForDisplay('2026-08-22 13:52:04.356532+00');
    expect(formatted).toMatch(/22/);
    expect(formatted).toMatch(/08/);
    expect(formatted).toMatch(/2026/);
  });

  it('passes non-date strings through unchanged', () => {
    expect(formatDateForDisplay('not-a-date')).toBe('not-a-date');
    expect(formatDateForDisplay('')).toBe('');
  });
});

describe('parseIsoDate / formatIsoDate', () => {
  it('round-trips a normal date', () => {
    expect(formatIsoDate(parseIsoDate('2024-03-15'))).toBe('2024-03-15');
  });

  it('round-trips a leap day', () => {
    expect(formatIsoDate(parseIsoDate('2024-02-29'))).toBe('2024-02-29');
  });

  it('round-trips a year boundary', () => {
    expect(formatIsoDate(parseIsoDate('2023-12-31'))).toBe('2023-12-31');
  });
});

describe('formatDateTime', () => {
  it('strips fractional seconds from a Supabase-style timestamp', () => {
    const formatted = formatDateTime('2026-08-22T13:52:04.356532+00');
    expect(formatted).toMatch(/16:52:04/);
    expect(formatted).not.toMatch(/\.356532/);
  });

  it('does not double-shift timestamps already in Istanbul time', () => {
    const formatted = formatDateTime('2026-08-22T13:52:04+03:00');
    expect(formatted).not.toMatch(/03:00/);
    expect(formatted).toMatch(/13:52:04/);
  });

  it('handles a timestamp with milliseconds but no explicit timezone', () => {
    const formatted = formatDateTime('2026-08-22T13:52:04.123');
    expect(formatted).toMatch(/13:52:04/);
    expect(formatted).not.toMatch(/\.123/);
  });

  it('handles a timestamp without milliseconds', () => {
    const formatted = formatDateTime('2026-08-22T13:52:04Z');
    expect(formatted).toMatch(/16:52:04/);
  });

  it('returns just the formatted date when there is no time component', () => {
    const formatted = formatDateTime('2026-08-22');
    expect(formatted).toMatch(/22/);
    expect(formatted).toMatch(/08/);
    expect(formatted).toMatch(/2026/);
    expect(formatted).not.toMatch(/:/);
  });

  it('returns empty string for empty input', () => {
    expect(formatDateTime('')).toBe('');
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('uses Istanbul time on a %s device', (zone) => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      expect(formatDateTime('2026-12-31T21:15:04Z')).toBe('01.01.2027 00:15:04');
      expect(formatDateTime('2027-01-01T00:15:04+03:00')).toBe('01.01.2027 00:15:04');
      expect(formatDateTime('2026-12-31 21:15:04.123456+00')).toBe('01.01.2027 00:15:04');
      expect(formatDateTime('2026-12-31T21:15:04.123')).toBe('31.12.2026 21:15:04');
      expect(formatDateForDisplay('2026-12-31T21:15:04Z')).toBe('01.01.2027');
      expect(formatDateForDisplay('2026-12-31')).toBe('31.12.2026');
      expect(formatTime('2026-12-31T21:00:00Z')).toBe('00:00');
      expect(formatDateTime('2026-08-22T12:00:00-04:00')).toBe('22.08.2026 19:00:00');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('parseDisplayDate', () => {
  it.each([
    ['2026-08-22', '2026-08-21T21:00:00.000Z'],
    ['2026-08-22T13:52:04.123', '2026-08-22T10:52:04.123Z'],
    ['2026-08-22 13:52:04.123456+00', '2026-08-22T13:52:04.123Z'],
    ['2026-08-22T13:52:04+0300', '2026-08-22T10:52:04.000Z'],
  ])('parses %s consistently', (input, expected) => {
    expect(parseDisplayDate(input).toISOString()).toBe(expected);
  });
  it('preserves Date instants and returns an invalid Date for malformed input', () => {
    const date = new Date('2026-08-22T12:00:00Z');
    expect(parseDisplayDate(date)).toBe(date);
    expect(Number.isNaN(parseDisplayDate('invalid').getTime())).toBe(true);
    expect(formatTime('invalid')).toBe('');
    expect(formatTime('')).toBe('');
  });
});

describe('formatDateBucketLabel', () => {
  it('handles Istanbul day, month, and ISO-week rollover', () => {
    expect(formatDateBucketLabel('2026-12-31T21:30:00Z', 'day')).toBe('01 Oca');
    expect(formatDateBucketLabel('2026-12-31T21:30:00Z', 'month')).toBe('Oca 27');
    expect(formatDateBucketLabel('2027-01-03T21:30:00Z', 'week')).toBe('H1');
    expect(formatDateBucketLabel('2027-01-03', 'week')).toBe('H53');
    expect(formatDateBucketLabel('invalid', 'day')).toBe('invalid');
  });
});
