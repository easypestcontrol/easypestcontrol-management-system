'use client';

/* ============================================================================
   Expenses — one door, two rooms.

   • Admin / branch manager: the month as a calendar of money. Every day shows
     what it cost and how much of it is still red (pending), amber (approved,
     to pay) or green (paid); a tap on a day opens every branch's report for
     it. Beside the calendar, the latest expenses with the same colours, so
     "what came in today and is it paid" is answered before anything is
     clicked.
   • Everyone else: their own expense history and an Add-Expense button. They
     never see a report containing coworkers' money.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from 'shared';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';
import { catIcon, chip, niceDate, niceMonth, shiftMonth, todayISO, whoSentence, type Summary } from './ui';
import MonthGrid, { type DayCell } from './calendar';
import OpenReport from './open-report';
import AddExpense from './add-expense';
import MyExpensesMobile from './mobile';

interface Recent {
  id: string; date: string; category: string; merchant: string; amount: number; paidAmount: number;
  status: string; source: string; branch: string; branchName: string; reportId: string;
  employeeName: string; employeeColor: string;
}
interface MonthData { ym: string; totals: Summary; days: DayCell[]; recent: Recent[] }
interface MineRow {
  id: string; date: string; category: string; merchant: string; note: string; amount: number; paidAmount: number;
  status: string; source: string; tripId: string; rejectReason: string; hasReceipt: boolean;
  approvedByName?: string; rejectedByName?: string; paidByName?: string;
  reviewedAt?: string; paidAt?: string;
}

export default function ExpensesPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  useEffect(() => { api.get<SessionUser>('/auth/me').then(setMe).catch(() => {}); }, []);
  if (!me) return <div className="p-6 text-muted text-[13px]">Loading…</div>;
  const manage = me.role === 'admin' || me.role === 'ops';
  return manage ? <ManagerView /> : <EmployeeView />;
}

/* ---------------------------------------------------- manager: the month */
function ManagerView() {
  const router = useRouter();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [data, setData] = useState<MonthData | null>(null);
  const [opening, setOpening] = useState(false);
  const [adding, setAdding] = useState(false);
  const bf = useBranchFilter();

  const load = useCallback(() => {
    api.get<MonthData>('/expenses/month?ym=' + ym + (bf.branch ? '&branch=' + bf.branch : ''))
      .then(setData).catch(() => setData({ ym, totals: empty(), days: [], recent: [] }));
  }, [ym, bf.branch]);
  useEffect(() => { load(); }, [load]);

  const T = data?.totals || empty();
  const thisMonth = ym === todayISO().slice(0, 7);
  const tiles = [
    { l: 'This month', v: money(T.total), sub: T.count + (T.count === 1 ? ' expense' : ' expenses'), icon: 'receipt' as const, bg: 'bg-sky', ink: 'text-sky-ink' },
    { l: 'Pending', v: money(T.pending), sub: T.pendingCount ? T.pendingCount + ' to verify' : 'nothing to verify', icon: 'alert' as const, bg: 'bg-rose', ink: 'text-rose-ink', hot: T.pendingCount > 0 },
    { l: 'To pay', v: money(T.due), sub: 'approved, still owed', icon: 'check' as const, bg: 'bg-amber', ink: 'text-amber-ink', hot: T.due > 0 },
    { l: 'Paid', v: money(T.paid), sub: 'reimbursed', icon: 'invoice' as const, bg: 'bg-mint', ink: 'text-mint-ink' },
  ];

  return (
    <div className="p-4 lg:p-6 max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <div className="mb-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[17px] lg:text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="max-lg:hidden text-muted text-[13px] mt-0.5">The month as a calendar — red still to verify, amber to pay, green paid. Tap a day to work on it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
          <span className="max-lg:w-full [&>select]:max-lg:w-full">{bf.el}</span>
          <button onClick={() => setAdding(true)} className="h-10 lg:h-9 flex-1 lg:flex-none min-w-0 px-3.5 rounded border border-line text-[13px] font-semibold whitespace-nowrap hover:bg-wash">Add my expense</button>
          <button onClick={() => setOpening(true)} className="h-10 lg:h-9 flex-1 lg:flex-none min-w-0 px-4 rounded bg-accent text-white text-[13px] font-semibold whitespace-nowrap hover:brightness-90">Open report</button>
        </div>
      </div>

      {/* month nav */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month"
          className="w-9 h-9 rounded-[12px] border border-line flex items-center justify-center hover:bg-wash">
          <Icon name="chevRight" size={16} className="rotate-180" />
        </button>
        <h2 className="text-[16px] lg:text-[18px] font-bold min-w-[170px] text-center">{niceMonth(ym)}</h2>
        <button onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month"
          className="w-9 h-9 rounded-[12px] border border-line flex items-center justify-center hover:bg-wash">
          <Icon name="chevRight" size={16} />
        </button>
        {!thisMonth && (
          <button onClick={() => setYm(todayISO().slice(0, 7))}
            className="h-9 px-3 rounded-[12px] border border-line text-[12.5px] font-semibold hover:bg-wash">Today</button>
        )}
      </div>

      {/* the month in four numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {tiles.map((t) => (
          <div key={t.l} className="card p-4 lg:p-5 flex flex-col">
            <span className={'w-10 h-10 lg:w-11 lg:h-11 rounded-[12px] flex items-center justify-center mb-3 lg:mb-4 ' + t.bg + ' ' + t.ink}>
              <Icon name={t.icon} size={18} />
            </span>
            <span className={'text-xl lg:text-2xl font-bold tracking-tight tabular-nums ' + (t.hot ? t.ink : '')}>{t.v}</span>
            <span className="text-[13px] font-medium text-muted mt-0.5">{t.l}</span>
            <span className="text-[11px] text-muted-2">{t.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="card p-3 lg:p-4">
          {!data ? <div className="text-muted text-[13px] p-6 text-center">Loading…</div>
            : <MonthGrid ym={ym} days={data.days} onPick={(d) => router.push('/expenses/day/' + d)} />}
        </div>

        <div className="card">
          <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between">
            <h3 className="text-[14px] font-bold">Recent</h3>
            <span className="text-[11.5px] text-muted">{niceMonth(ym)}</span>
          </div>
          {!data ? <div className="p-6 text-muted text-[13px] text-center">Loading…</div>
            : data.recent.length === 0 ? (
              <div className="p-8 text-center text-muted text-[13px]">No expenses this month yet.</div>
            ) : data.recent.map((e) => {
              const c = chip(e.status);
              return (
                <button key={e.id} onClick={() => router.push('/expenses/day/' + e.date)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-0 hover:bg-wash transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0">
                    <Icon name={catIcon(e.category)} size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{e.category}{e.merchant ? ' · ' + e.merchant : ''}</span>
                    <span className="block text-[11.5px] text-muted truncate">{e.employeeName} · {e.branchName} · {niceDate(e.date)}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13px] font-bold tabular-nums">{money(e.amount)}</span>
                    <span className={'inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold ' + c.cls}>{c.label}</span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {opening && <OpenReport onClose={() => setOpening(false)} onDone={(id) => { setOpening(false); router.push('/expenses/' + id); }} />}
      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

const empty = (): Summary => ({ count: 0, employees: 0, total: 0, pending: 0, approved: 0, partial: 0, reimbursed: 0, rejected: 0, paid: 0, due: 0, unsettled: 0, pendingCount: 0 });

/* ------------------------------------------------------ employee: mine */
function EmployeeView() {
  const [rows, setRows] = useState<MineRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState('all');
  const load = useCallback(() => { api.get<{ rows: MineRow[] }>('/expenses/mine').then((r) => setRows(r.rows)).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const shown = (rows || []).filter((r) => f === 'all' || r.status === f);
  const TABS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['partial', 'Partly paid'], ['reimbursed', 'Paid'], ['rejected', 'Rejected']];

  return (
    <>
    {/* The phone gets an app screen, the desk keeps its table. */}
    <MyExpensesMobile rows={rows} filter={f} onFilter={setF} />

    <div className="max-lg:hidden p-4 lg:p-6 max-w-[720px]">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My expenses</h1>
          <p className="max-lg:hidden text-muted text-[13px] mt-0.5">Your submissions and where each one stands.</p>
        </div>
        <button onClick={() => setAdding(true)} className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">Add expense</button>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-4">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)}
            className={'h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap border ' + (f === k ? 'bg-navy text-white border-navy' : 'border-line text-muted hover:bg-wash')}>{l}</button>
        ))}
      </div>

      {!rows ? <div className="text-muted text-[13px]">Loading…</div>
        : shown.length === 0 ? (
          <div className="rounded-md border border-line bg-white p-10 text-center text-muted text-[13px]">
            {rows.length === 0 ? 'No expenses yet. Add one with the red button.' : 'Nothing in this filter.'}
          </div>
        ) : (
          <div className="rounded-md border border-line bg-white shadow-card divide-y divide-line-soft">
            {shown.map((e) => {
              const c = chip(e.status);
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="w-9 h-9 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0 mt-0.5"><Icon name={catIcon(e.category)} size={16} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold">
                      {e.category}
                      {e.source === 'auto_trip' && <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-wash text-muted border border-line align-middle whitespace-nowrap">AUTO · TRIP</span>}
                    </span>
                    <span className="block text-[11.5px] text-muted">{niceDate(e.date)}{e.merchant ? ' · ' + e.merchant : ''}{e.note ? ' · ' + e.note : ''}</span>
                    {whoSentence(e, money) && (
                      <span className={'block text-[12px] mt-1 font-medium ' + (e.status === 'rejected' ? 'text-accent' : e.status === 'reimbursed' ? 'text-mint-ink' : 'text-ink-2')}>
                        {whoSentence(e, money)}
                      </span>
                    )}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13.5px] font-bold">{money(e.amount)}</span>
                    {e.paidAmount > 0 && e.paidAmount < e.amount && <span className="block text-[11px] text-muted">{money(e.paidAmount)} paid</span>}
                    <span className={'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' + c.cls}>{c.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
    </>
  );
}
