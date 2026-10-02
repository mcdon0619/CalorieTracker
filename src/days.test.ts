import { describe, expect, it } from 'vitest';
import { dayKey, formatDay, shiftDay, timestampForDay } from './days';

describe('days', () => {
  it('keys by local date, rolling over at local midnight', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59, 59).getTime())).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 0, 6, 0, 0, 0).getTime())).toBe('2026-01-06');
  });

  it('shifts across month and year boundaries', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
    expect(shiftDay('2026-10-01', 0)).toBe('2026-10-01');
  });

  it('timestamps a retro entry on the chosen day at the current time of day', () => {
    const now = new Date(2026, 9, 1, 14, 30, 0).getTime();
    expect(timestampForDay('2026-10-01', now)).toBe(now);
    const past = timestampForDay('2026-09-28', now);
    expect(dayKey(past)).toBe('2026-09-28');
    expect(new Date(past).getHours()).toBe(14);
  });

  it('labels today and yesterday', () => {
    expect(formatDay('2026-10-01', '2026-10-01')).toBe('Today');
    expect(formatDay('2026-09-30', '2026-10-01')).toBe('Yesterday');
  });
});
