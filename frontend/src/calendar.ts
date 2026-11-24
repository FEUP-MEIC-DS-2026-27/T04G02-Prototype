// Calendar arithmetic on 'YYYY-MM-DD' strings. Everything is done in UTC, so daylight
// saving never moves a date. Only "today" depends on the viewer's timezone.

const LOCALE = 'en-GB'; // the dashboard is in English
const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' });
const monthFormat = format({ month: 'long', year: 'numeric' });
const dayFormat = format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Monday first. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (iso: string) => (parse(iso).getUTCDay() + 6) % 7;
export const monthLabel = (iso: string) => monthFormat.format(parse(iso));
export const dayLabel = (iso: string) => dayFormat.format(parse(iso));

export function todayIso(now: Date = new Date()): string {
    return toIso(utc(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(iso: string, days: number): string {
    const d = parse(iso);
    return toIso(utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

/** Same day of another month, or that month's last day when it is shorter. */
export function addMonths(iso: string, months: number): string {
    const d = parse(iso);
    const [year, month] = [d.getUTCFullYear(), d.getUTCMonth() + months];
    const lastDay = utc(year, month + 1, 0).getUTCDate();
    return toIso(utc(year, month, Math.min(d.getUTCDate(), lastDay)));
}

/** The weeks of a date's month. Days of the neighbouring months are null. */
export function monthWeeks(iso: string): (string | null)[][] {
    const first = `${iso.slice(0, 8)}01`;
    const last = addDays(addMonths(first, 1), -1);
    const cells: (string | null)[] = Array(weekdayIndex(first)).fill(null);
    for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
