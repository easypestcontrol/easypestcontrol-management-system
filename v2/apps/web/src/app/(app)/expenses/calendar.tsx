'use client';

/* ============================================================================
   The month, as a calendar of money.

   One cell per day: the day's total and a thin bar underneath that splits it
   into red (pending), amber (approved, still owed) and green (paid). The
   office reads the month the way it reads a heat map — where the money is,
   and how much of it is still waiting — and taps a day to work on it.

   Weeks start on Sunday, as the schedule's calendar does; the two should
   never disagree about which column a date is in.
   ========================================================================== */

import { money } from 'shared';
import { pad2, todayISO } from './ui';

export interface DayCell {
  date: string; total: number; count: number;
  pending: number; due: number; paid: number; rejected: number;
  /** Lines still to verify. A Rs 0 trip is one of them, and rupees alone
      would paint the day green. */
  pendingCount?: number;
  reports: Array<{ id: string; branch: string; branchName: string; status: string }>;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Rupees in the five characters a 46px cell can hold: 850, 1.2k, 12k, 1.2L. */
function compact(n: number): string {
  const one = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toString();
  if (n >= 10000000) return '₹' + one(n / 10000000) + 'Cr';
  if (n >= 100000) return '₹' + one(n / 100000) + 'L';
  if (n >= 1000) return '₹' + one(n / 1000) + 'k';
  return '₹' + Math.round(n);
}

export default function MonthGrid({ ym, days, onPick }: {
  ym: string;
  days: DayCell[];
  onPick: (date: string) => void;
}) {
  const [y, m] = ym.split('-').map(Number);
  const startPad = new Date(y, m - 1, 1).getDay();
  const count = new Date(y, m, 0).getDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = todayISO();

  const cells: Array<string | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(`${ym}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 mb-1.5">
        {DOW.map((d) => (
          <span key={d} className="text-center text-[10.5px] lg:text-[11px] font-semibold uppercase tracking-wide text-muted-2">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5">
        {cells.map((iso, i) => {
          if (!iso) return <span key={'pad' + i} />;
          const d = byDate.get(iso);
          const has = !!d && d.count > 0;
          const isToday = iso === today;
          const future = iso > today;
          const live = d ? d.pending + d.due + d.paid : 0;
          const toVerify = d?.pendingCount || 0;
          // Money decides the bar - except that a day with something still to
          // verify must never read as settled. If the pending lines are worth
          // nothing (a trip that never moved), a red fifth is forced in.
          const forced = toVerify > 0 && (d?.pending || 0) === 0 ? 0.2 : 0;
          const seg = (n: number, cls: string) => (n > 0 && live > 0
            ? <span className={cls} style={{ width: (n / live * 100 * (1 - forced)) + '%' }} /> : null);
          return (
            <button key={iso} type="button" onClick={() => onPick(iso)}
              className={'relative text-left rounded-[10px] lg:rounded-[12px] border p-1.5 lg:p-2 '
                + 'min-h-[60px] lg:min-h-[84px] transition-colors '
                + (has ? 'bg-white border-line hover:border-accent ' : 'bg-wash/60 border-line-soft hover:bg-wash ')
                + (isToday ? 'ring-2 ring-accent/30 ' : '')
                + (future && !has ? 'opacity-60' : '')}>
              <span className={'text-[12px] lg:text-[13px] font-semibold leading-none '
                + (isToday ? 'text-accent' : has ? 'text-ink' : 'text-muted-2')}>
                {Number(iso.slice(8))}
              </span>
              {d && has && (
                <>
                  {/* the whole figure at a desk; a compact one where 7 columns
                      share 360px */}
                  <span className="max-lg:hidden block text-[13.5px] font-bold tabular-nums mt-1 truncate">{money(d.total)}</span>
                  <span className="lg:hidden block text-[11px] font-bold tabular-nums mt-1 truncate">{compact(d.total)}</span>
                  <span className="max-lg:hidden block text-[10.5px] text-muted truncate">
                    {d.count} · {d.reports.length} {d.reports.length === 1 ? 'branch' : 'branches'}
                  </span>
                  {toVerify > 0 && (
                    <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-ink text-white text-[10px] font-bold flex items-center justify-center"
                      title={toVerify + ' to verify'}>
                      {toVerify}
                    </span>
                  )}
                  <span className="absolute left-1.5 right-1.5 bottom-1.5 h-1.5 rounded-full overflow-hidden flex bg-line-soft">
                    {forced > 0 && <span className="bg-rose-ink" style={{ width: '20%' }} />}
                    {seg(d.pending, 'bg-rose-ink')}
                    {seg(d.due, 'bg-amber-ink')}
                    {seg(d.paid, 'bg-mint-ink')}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-ink" /> Pending — not yet verified (the red number is how many)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-ink" /> Approved — to pay</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-mint-ink" /> Paid</span>
      </div>
    </div>
  );
}
