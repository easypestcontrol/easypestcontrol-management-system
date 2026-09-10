'use client';

/* ============================================================================
   My expenses, on a phone.

   The desk version is a table of claims with a red button in the corner. On a
   phone that read as a web page someone had shrunk: a header row, a strip of
   small pills, and rows too tight to tap.

   This is the same information as an app screen. What is owed to you is the
   first thing, because that is the question being asked when this screen is
   opened at all. Then the claims themselves — one per row, the category, what
   it was for, the money, and where it stands — and the red button that adds
   one sits where a thumb is, not in a corner.
   ========================================================================== */

import { money } from 'shared';
import { Icon } from '@/components/icons';
import { Card, Chip, Fab, Filters, Screen, ScreenTitle, type Tone } from '@/components/mobile';
import { catIcon } from './ui';

export interface MineRow {
  id: string; date: string; category: string; merchant: string; note: string; amount: number;
  status: string; source: string; tripId: string; rejectReason: string; hasReceipt: boolean;
}

/** 2026-09-07 → "7 Sep". */
const niceDate = (iso: string) => {
  const p = String(iso || '').split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return p.length === 3 ? Number(p[2]) + ' ' + M[Number(p[1]) - 1] : iso;
};

/* Where a claim stands, in the four words a person actually uses. Amber while
   somebody has to look at it, navy once the money is moving, red if it was
   turned down. */
const STATE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting', tone: 'warn' },
  approved: { label: 'Approved', tone: 'info' },
  processing: { label: 'Paying', tone: 'warn' },
  reimbursed: { label: 'Paid', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
  payment_failed: { label: 'Payment failed', tone: 'bad' },
};
const stateOf = (s: string) => STATE[s] || STATE.pending;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'reimbursed', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
];

export default function MyExpensesMobile({ rows, filter, onFilter }: {
  rows: MineRow[] | null;
  filter: string;
  onFilter: (v: string) => void;
}) {
  const all = rows || [];
  const shown = all.filter((r) => filter === 'all' || r.status === filter);
  const owed = all
    .filter((r) => r.status === 'pending' || r.status === 'approved' || r.status === 'processing')
    .reduce((a, r) => a + r.amount, 0);
  const paid = all.filter((r) => r.status === 'reimbursed').reduce((a, r) => a + r.amount, 0);

  return (
    <Screen>
      <ScreenTitle title="My expenses" />
      <Filters value={filter} onChange={onFilter} options={TABS} />

      <div className="px-4 pt-3 flex flex-col gap-3">
        {/* The two numbers this screen exists to answer. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-[20px] px-4 py-3.5">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Owed to you</p>
            <p className="text-[21px] font-bold mt-1 leading-none">{money(owed)}</p>
          </div>
          <div className="bg-white rounded-[20px] px-4 py-3.5">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Paid back</p>
            <p className="text-[21px] font-bold mt-1 leading-none">{money(paid)}</p>
          </div>
        </div>

        {rows === null ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[84px] rounded-[20px] bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">
              {all.length === 0 ? 'No expenses yet' : 'Nothing in this filter'}
            </p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              {all.length === 0
                ? 'Petrol, tolls, parking — add one with the red button and the office sees it.'
                : 'Try another filter.'}
            </p>
          </Card>
        ) : (
          <Card flush className="mb-4">
            {shown.map((e) => {
              const st = stateOf(e.status);
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-4 border-b border-line-soft last:border-b-0">
                  <span className="w-11 h-11 rounded-full bg-rose text-rose-ink flex items-center justify-center shrink-0">
                    <Icon name={catIcon(e.category)} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[15.5px] font-bold tracking-[-0.01em] truncate">{e.category}</span>
                      <span className="text-[15.5px] font-bold tabular-nums shrink-0">{money(e.amount)}</span>
                    </span>
                    <span className="flex items-center gap-2 mt-1.5 min-w-0">
                      <Chip tone={st.tone}>{st.label}</Chip>
                      <span className="text-[13px] text-muted truncate min-w-0">
                        {niceDate(e.date)}{e.merchant ? ' · ' + e.merchant : ''}
                      </span>
                    </span>
                    {e.note && (
                      <span className="block text-[12.5px] text-muted-2 mt-1 truncate">{e.note}</span>
                    )}
                    {e.source === 'auto_trip' && (
                      <span className="block text-[12px] text-muted-2 mt-1">From your trip</span>
                    )}
                    {e.status === 'rejected' && e.rejectReason && (
                      <span className="block text-[12.5px] text-accent mt-1">Reason: {e.rejectReason}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* A route, not a popup: the back gesture has to close the form rather
          than the whole app. */}
      <Fab href="/expenses/new" label="Add expense" />
    </Screen>
  );
}
