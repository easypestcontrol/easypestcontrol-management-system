/* ============================================================================
   Time — ISO date strings and minute arithmetic.

   The whole product runs on two primitives: a date is "YYYY-MM-DD" and a time
   of day is minutes past midnight. Ported 1:1 from v1 (data.js / store.js) so
   every generated visit lands on the same day it did before the rewrite.
   ========================================================================== */

/** "09:30" -> 570. Tolerant of junk, like v1. */
export function toMin(hhmm: string | null | undefined): number {
  const p = String(hhmm || '0:0').split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

/** 570 -> "09:30", clamped to the day. */
export function toHHMM(m: number): string {
  const x = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
}

export function parseISO(iso: string): Date {
  const p = iso.split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

export function toISO(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Keeps the day-of-month, clamped to the target month's length. */
export function addMonths(iso: string, n: number): string {
  const p = iso.split('-').map(Number);
  const target = new Date(p[0], p[1] - 1 + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(p[2], last));
  return toISO(target);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function dayOfMonth(iso: string): number {
  return parseISO(iso).getDate();
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return parseISO(iso).getDay();
}

/**
 * Move a proposed date onto the day the plan line asks for.
 * Only "dom:N" (fixed day of the month) is implemented; the field is a string
 * so "nth:2:SAT" and "gap:45" can be added without a schema change.
 */
export function applyDayRule(iso: string, rule: string | null | undefined): string {
  const m = /^dom:(\d{1,2})$/.exec(rule || '');
  if (!m) return iso;
  const p = iso.split('-').map(Number);
  const last = new Date(p[0], p[1], 0).getDate();
  return toISO(new Date(p[0], p[1] - 1, Math.min(Number(m[1]), last)));
}

/**
 * The first date at-or-after `iso` that work is allowed on: not a blackout
 * date, and not a Sunday when the contract skips Sundays.
 */
export function nextAllowedDay(iso: string, blackout: string[] = [], workdaysOnly = true): string {
  let d = iso;
  for (let guard = 0; guard < 62; guard++) {
    const sunday = workdaysOnly && dayOfWeek(d) === 0;
    const blocked = blackout.indexOf(d) >= 0;
    if (!sunday && !blocked) return d;
    d = addDays(d, 1);
  }
  return d;
}

export const FREQ_MONTHS: Record<string, number> = {
  Monthly: 1, 'Bi-Monthly': 2, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12,
};

/** "every N days / Monthly / Quarterly…" from a gap in days and a visit count. */
export function cadenceLabel(gapDays: number, visits: number): string {
  if (visits <= 1) return 'One-time';
  if (gapDays >= 350) return 'Yearly';
  if (gapDays >= 170) return 'Half-Yearly';
  if (gapDays >= 80) return 'Quarterly';
  if (gapDays >= 50) return 'Bi-Monthly';
  if (gapDays >= 26) return 'Monthly';
  if (gapDays >= 12) return 'Fortnightly';
  if (gapDays >= 6) return 'Weekly';
  return 'Every ' + Math.max(1, Math.round(gapDays)) + ' days';
}
