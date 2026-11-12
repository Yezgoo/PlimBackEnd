// Timetables are stored in Lisbon local time ("Mondays 09:00 to 13:00"), while bookings are instants (UTC).
// This turns an instant into what a clock in Lisbon shows, summer and winter time included.

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type LisbonClock = {
  day: string;     // "2026-11-18": to tell whether two instants fall on the same local day
  weekday: number; // 1 = Monday ... 7 = Sunday
  minutes: number; // minutes after midnight
};

export function lisbonClock(instant: Date): LisbonClock {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
