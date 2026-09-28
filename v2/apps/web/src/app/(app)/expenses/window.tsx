'use client';

/* ============================================================================
   Which dates are open to the person looking.

   The admin may open any date. Everyone else works on the last seven days
   and the next two; anything outside that is locked - the day does not open,
   its report cannot be created, nothing on it can be added or changed. The
   server enforces it; this file is how the screens say so before the server
   has to: a lock on the calendar, limits on the date fields, and one screen
   for a day that will not open.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { niceDate } from './ui';

export interface ExpenseWindow {
  from: string; to: string; today: string;
  /** The admin: no window at all. */
  unlimited: boolean;
  back: number; ahead: number;
}

export const isLocked = (w: ExpenseWindow | null | undefined, date: string) =>
  !!w && !w.unlimited && (date < w.from || date > w.to);

export const windowText = (w: ExpenseWindow) => niceDate(w.from) + ' to ' + niceDate(w.to);

export const lockedText = (w: ExpenseWindow, date: string) =>
  niceDate(date, true) + ' is locked. You can open ' + windowText(w)
  + ' (the last ' + w.back + ' days and the next ' + w.ahead + '). Only the admin can open other dates.';

/** The window for whoever is signed in. Null until it arrives. */
export function useExpenseWindow(): ExpenseWindow | null {
  const [w, setW] = useState<ExpenseWindow | null>(null);
  useEffect(() => {
    let live = true;
    api.get<ExpenseWindow>('/expenses/window').then((x) => { if (live) setW(x); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return w;
}

/** One line under the page title, for everyone who has a window. */
export function WindowNote({ w }: { w: ExpenseWindow | null | undefined }) {
  if (!w || w.unlimited) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-wash px-3 py-2 text-[12.5px] text-ink-2 mb-4">
      <Icon name="lock" size={14} className="text-muted shrink-0 mt-[1px]" />
      <span>
        Open to you: <b>{windowText(w)}</b> (the last {w.back} days and the next {w.ahead}).
        Every other date is locked; only the admin can open it.
      </span>
    </p>
  );
}

/** A day that will not open. */
export function LockedDay({ message, back = '/expenses' }: { message: string; back?: string }) {
  return (
    <div className="p-6 lg:p-10 max-w-[560px] mx-auto text-center max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <span className="mx-auto w-14 h-14 rounded-2xl bg-wash text-muted flex items-center justify-center mb-4">
        <Icon name="lock" size={24} />
      </span>
      <h1 className="text-[18px] font-bold tracking-tight">This date is locked</h1>
      <p className="text-[13.5px] text-muted mt-2 leading-relaxed">{message}</p>
      <Link href={back}
        className="inline-flex items-center h-10 px-4 mt-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
        Back to the calendar
      </Link>
    </div>
  );
}
