'use client';

/* ============================================================================
   Reports, on a phone.

   A report on a laptop is read across: several charts side by side, compared
   with the eye. A phone cannot do that and should not pretend to, so this is
   not the desktop page shrunk — it is the handful of figures somebody
   actually quotes down the phone, and one bar chart of the months.

   Anything that needs comparing lives on the desktop, and the screen says so
   rather than serving a chart too small to read.
   ========================================================================== */

import { Card, Screen, compact, money } from '@/components/mobile';

interface MonthPoint { label: string; billed: number; collected: number }

export default function ReportsMobile({ s, rangeLabel, filterEl }: {
  s: {
    totals: {
      billed: number; collected: number; outstanding: number; overdue: number;
      visitsDone: number; completionRatePct: number; avgRating: number; openInvoices: number;
    };
    revenueByMonth: MonthPoint[];
  } | null;
  rangeLabel: string;
  filterEl?: React.ReactNode;
}) {
  const months = (s?.revenueByMonth || []).slice(-6);
  const peak = Math.max(1, ...months.map((m) => Math.max(m.billed, m.collected)));

  return (
    <Screen>
      <div className="bg-white px-4 pt-2 pb-3">
        <h1 className="text-[25px] font-bold tracking-[-0.025em]">Reports</h1>
        <p className="text-[13.5px] text-muted mt-0.5">{rangeLabel}</p>
        {filterEl && <div className="mt-3">{filterEl}</div>}
      </div>

      {!s ? (
        <div className="px-4 pt-3 flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-[110px] rounded-2xl bg-white animate-pulse" />)}
        </div>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-3">
          {/* The four figures people actually quote out loud. */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { l: 'Billed', v: compact(s.totals.billed), tint: 'bg-sky' },
              { l: 'Collected', v: compact(s.totals.collected), tint: 'bg-mint' },
              { l: 'Outstanding', v: compact(s.totals.outstanding), tint: 'bg-white' },
              { l: 'Overdue', v: compact(s.totals.overdue), tint: 'bg-rose', bad: true },
            ].map((x) => (
              <div key={x.l} className={'rounded-2xl p-3.5 min-h-[86px] flex flex-col ' + x.tint}>
                <span className="text-[12.5px] text-muted font-medium">{x.l}</span>
                <span className={'text-[23px] font-bold tracking-[-0.02em] tabular-nums mt-1 '
                  + (x.bad ? 'text-rose-ink' : '')}>{x.v}</span>
              </div>
            ))}
          </div>

          {/* Billed against collected, one month per pair. Bars rather than a
              line: two lines this narrow cross each other and lie. */}
          {months.length > 0 && (
            <Card title="Billed and collected">
              <div className="flex items-end justify-between gap-2 h-[120px] mt-1">
                {months.map((m) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex items-end justify-center gap-1 h-[96px]">
                      <span className="w-[42%] rounded-t bg-sky"
                        style={{ height: Math.max(3, (m.billed / peak) * 96) + 'px' }} />
                      <span className="w-[42%] rounded-t bg-accent"
                        style={{ height: Math.max(3, (m.collected / peak) * 96) + 'px' }} />
                    </div>
                    <span className="text-[11.5px] text-muted">{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line-soft">
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky" /> Billed
                </span>
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Collected
                </span>
              </div>
            </Card>
          )}

          <Card title="The work" flush className="mb-4">
            {[
              { k: 'Visits completed', v: String(s.totals.visitsDone) },
              { k: 'Completion rate', v: s.totals.completionRatePct + '%' },
              { k: 'Average rating', v: s.totals.avgRating ? s.totals.avgRating.toFixed(1) : '—' },
              { k: 'Open invoices', v: String(s.totals.openInvoices) },
              { k: 'Still to come in', v: money(s.totals.outstanding) },
            ].map((x) => (
              <div key={x.k} className="flex justify-between px-4 py-3 border-b border-line-soft last:border-b-0">
                <span className="text-[14.5px] text-muted">{x.k}</span>
                <span className="text-[15px] font-bold tabular-nums">{x.v}</span>
              </div>
            ))}
          </Card>

          <p className="text-[13px] text-muted text-center px-4 pb-4 leading-relaxed">
            The technician leaderboard, service mix, sales funnel and ageing buckets
            are on the desktop — they are read by comparing them, which needs a
            wider screen than this.
          </p>
        </div>
      )}
    </Screen>
  );
}
