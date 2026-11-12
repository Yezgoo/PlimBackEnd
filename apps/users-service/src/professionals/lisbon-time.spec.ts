import { describe, expect, it } from 'vitest';
import { lisbonClock } from './lisbon-time.js';

describe('lisbonClock', () => {
  it('in winter Lisbon is on UTC', () => {
    // Wednesday 18 November 2026
    expect(lisbonClock(new Date('2026-11-18T15:00:00Z'))).toEqual({ day: '2026-11-18', weekday: 3, minutes: 15 * 60 });
  });

  it('in summer Lisbon is one hour ahead of UTC', () => {
    // Wednesday 15 July 2026, 15:00 UTC = 16:00 in Lisbon
    expect(lisbonClock(new Date('2026-07-15T15:00:00Z'))).toEqual({ day: '2026-07-15', weekday: 3, minutes: 16 * 60 });
  });

  it('late evening UTC in summer is already the next day in Lisbon', () => {
    // Sunday 19 July 23:30 UTC = Monday 20 July 00:30 in Lisbon
    expect(lisbonClock(new Date('2026-07-19T23:30:00Z'))).toEqual({ day: '2026-07-20', weekday: 1, minutes: 30 });
  });

  it('numbers the week Monday = 1 to Sunday = 7', () => {
    expect(lisbonClock(new Date('2026-11-16T12:00:00Z')).weekday).toBe(1); // Monday
    expect(lisbonClock(new Date('2026-11-22T12:00:00Z')).weekday).toBe(7); // Sunday
  });
});
