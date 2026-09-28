/* ============================================================================
   Which dates are open, and to whom.

   The client's rule, in one place: the ADMIN may open any date. Everyone else
   - a branch manager, a technician, anyone filing a claim - may work only on
   the last seven days and the next two. Everything before that is locked: the
   day cannot be opened, its report cannot be created, and nothing on it can
   be added, changed, approved or paid. Only the admin goes back further.

   It lives on the server because a rule about money that only the screen
   knows is a rule anyone with a URL can walk around.

   The system itself is not a person: a trip that finishes lands its expense
   on the day it finished, whoever is signed in, and that is never locked.
   ========================================================================== */
import { ForbiddenException } from '@nestjs/common';
import { addDays } from 'shared';

/** Days before today that stay open to everyone. */
export const WINDOW_BACK = 7;
/** Days after today that are already open to everyone. */
export const WINDOW_AHEAD = 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso: string) => {
  const p = iso.split('-');
  return p.length === 3 ? `${Number(p[2])} ${MONTHS[Number(p[1]) - 1]} ${p[0]}` : iso;
};
const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export interface ExpenseWindow {
  /** First open date, inclusive. */
  from: string;
  /** Last open date, inclusive. */
  to: string;
  today: string;
  /** The admin: no window at all. */
  unlimited: boolean;
  back: number;
  ahead: number;
}

export function expenseWindow(role?: string): ExpenseWindow {
  const today = todayISO();
  return {
    from: addDays(today, -WINDOW_BACK), to: addDays(today, WINDOW_AHEAD), today,
    unlimited: role === 'admin', back: WINDOW_BACK, ahead: WINDOW_AHEAD,
  };
}

/** May this role work on this date? */
export function dateOpen(role: string | undefined, date: string): boolean {
  const w = expenseWindow(role);
  return w.unlimited || (date >= w.from && date <= w.to);
}

/** The one sentence a locked date answers with, everywhere. */
export function lockedMessage(date: string): string {
  const w = expenseWindow();
  return `${nice(date)} is locked. You can open ${nice(w.from)} to ${nice(w.to)} `
    + `(the last ${WINDOW_BACK} days and the next ${WINDOW_AHEAD}). Only the admin can open other dates.`;
}

/**
 * Refuse a locked date. 403, not 401: the person is signed in perfectly
 * well, they simply may not work on this day - and the web client signs you
 * out on a 401.
 */
export function mustBeOpenDate(role: string | undefined, date: string): void {
  if (!dateOpen(role, date)) throw new ForbiddenException(lockedMessage(date));
}
