// Dates are YYYY-MM-DD strings and all arithmetic is in UTC, so the server's time zone cannot move a date.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const toUtc = (date: string): number => {
  if (!isIsoDate(date)) throw new RangeError(`Not a calendar date: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
};

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Adds calendar months, clamping to month-end: 2027-03-31 minus 1 month is 2027-02-28. */
export function addMonths(date: string, months: number): string {
  const start = new Date(toUtc(date));
  const firstOfTarget = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return firstOfTarget.toISOString().slice(0, 10);
}

export const yearOf = (date: string): number => Number(date.slice(0, 4));
