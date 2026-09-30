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
import { WindowNote, isLocked, useExpenseWindow, type ExpenseWindow } from './window';

interface Recent {
  id: string; date: string; category: string; merchant: string; amount: number; paidAmount: number;
  status: string; source: string; branch: string; branchName: string; reportId: string;
  employeeName: string; employeeColor: string;
}
interface MonthData { ym: string; window?: ExpenseWindow; totals: Summary; days: DayCell[]; recent: Recent[] }
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
  // The admin has no window; everyone else sees the dates outside theirs
  // padlocked, on the calendar and in the list beside it.
  const win = data?.window || null;
  const limited = !!win && !win.unlimited;
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

      <WindowNote w={win} />

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
            : <MonthGrid ym={ym} days={data.days} onPick={(d) => router.push('/expenses/day/' + d)}
                locked={limited ? (d) => isLocked(win, d) : undefined} />}
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
              const shut = isLocked(win, e.date);
              return (
                <button key={e.id} disabled={shut} onClick={() => { if (!shut) router.push('/expenses/day/' + e.date); }}
                  title={shut ? 'Locked — only the admin can open this date' : undefined}
                  className={'w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-0 transition-colors '
                    + (shut ? 'opacity-55 cursor-not-allowed' : 'hover:bg-wash')}>
                  <span className="w-8 h-8 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0">
                    <Icon name={catIcon(e.category)} size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{e.category}{e.merchant ? ' · ' + e.merchant : ''}</span>
                    <span className="block text-[11.5px] text-muted truncate">{e.employeeName} · {e.branchName} · {niceDate(e.date)}{shut ? ' · locked' : ''}</span>
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
  const all = rows || [];
  const OWED = ['approved', 'partial', 'processing', 'payment_failed'];
  // 'owed' is the "to be paid" tile: every agreed line with money still to come.
  const shown = all.filter((r) => f === 'all' || (f === 'owed' ? OWED.includes(r.status) : r.status === f));
  const win = useExpenseWindow();
  const TABS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['partial', 'Partly paid'], ['reimbursed', 'Paid'], ['rejected', 'Rejected']];

  /* The four numbers, from the person's own lines. "Owed" is what has been
     agreed and not yet sent - the balance of a part-paid line included. */
  const sum = (xs: MineRow[], v: (r: MineRow) => number) => xs.reduce((a, r) => a + v(r), 0);
  const pend = all.filter((r) => r.status === 'pending');
  const owed = all.filter((r) => OWED.includes(r.status));
  const rej = all.filter((r) => r.status === 'rejected');
  const paidTotal = sum(all, (r) => (r.status === 'reimbursed' ? r.amount : r.status === 'rejected' ? 0 : r.paidAmount || 0));
  const lines = (n: number) => n + (n === 1 ? ' line' : ' lines');
  const tiles = [
    { k: 'pending', l: 'With the office', v: sum(pend, (r) => r.amount), sub: pend.length ? lines(pend.length) + ' to be checked' : 'nothing waiting', icon: 'clock' as const, bg: 'bg-rose', ink: 'text-rose-ink', hot: pend.length > 0 },
    { k: 'owed', l: 'Approved, to be paid', v: sum(owed, (r) => Math.max(0, r.amount - (r.paidAmount || 0))), sub: owed.length ? lines(owed.length) + ' agreed' : 'nothing owed', icon: 'check' as const, bg: 'bg-amber', ink: 'text-amber-ink', hot: false },
    { k: 'reimbursed', l: 'Paid to you', v: paidTotal, sub: 'reimbursed so far', icon: 'invoice' as const, bg: 'bg-mint', ink: 'text-mint-ink', hot: false },
    { k: 'rejected', l: 'Rejected', v: sum(rej, (r) => r.amount), sub: rej.length ? lines(rej.length) + ' sent back' : 'none', icon: 'x' as const, bg: 'bg-wash', ink: 'text-muted', hot: false },
  ];

  /* Where it went: every line that was not rejected, by category. */
  const catMap = new Map<string, { total: number; count: number }>();
  for (const r of all) {
    if (r.status === 'rejected') continue;
    const c = catMap.get(r.category) || { total: 0, count: 0 };
    c.total += r.amount; c.count += 1; catMap.set(r.category, c);
  }
  const catRows = [...catMap.entries()].map(([name, c]) => ({ name, ...c }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
  // Bars by rupees; when every line is Rs 0 (trips before a rate is set), by count.
  const top = Math.max(0, ...catRows.map((c) => c.total));
  const topCount = Math.max(1, ...catRows.map((c) => c.count));
  const cats = catRows.map((c) => ({ ...c, share: top > 0 ? c.total / top : c.count / topCount }));

  return (
    <>
    {/* The phone gets an app screen, the desk keeps its table. */}
    <MyExpensesMobile rows={rows} filter={f} onFilter={setF} />

    {/* The whole width of the desk. This was a 720px column with the other
        half of the screen left empty; the space now carries what the list
        alone could not say at a glance - how much is still with the office,
        how much is owed, how much has been paid, and where it went. */}
    <div className="max-lg:hidden p-6 max-w-[1320px]" data-my-expenses>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My expenses</h1>
          <p className="text-muted text-[13px] mt-0.5">Your submissions and where each one stands.</p>
        </div>
        <button onClick={() => setAdding(true)} className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 flex items-center gap-1.5">
          <Icon name="plus" size={14} /> Add expense
        </button>
      </div>

      {/* four numbers, each one also the filter for the list below */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {tiles.map((t) => (
          <button key={t.k} type="button" onClick={() => setF(f === t.k ? 'all' : t.k)} data-tile={t.k}
            className={'card p-5 flex flex-col text-left transition-shadow hover:shadow-pop '
              + (f === t.k ? 'ring-2 ring-navy' : '')}>
            <span className={'w-11 h-11 rounded-[12px] flex items-center justify-center mb-4 ' + t.bg + ' ' + t.ink}>
              <Icon name={t.icon} size={18} />
            </span>
            <span className={'text-2xl font-bold tracking-tight tabular-nums ' + (t.hot ? t.ink : '')}>{money(t.v)}</span>
            <span className="text-[13px] font-medium text-muted mt-0.5">{t.l}</span>
            <span className="text-[11px] text-muted-2">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-4 py-3 border-b border-line-soft">
            {TABS.map(([k, l]) => {
              const n = k === 'all' ? all.length : all.filter((r) => r.status === k).length;
              return (
                <button key={k} onClick={() => setF(k)}
                  className={'h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap border flex items-center gap-1.5 '
                    + (f === k ? 'bg-navy text-white border-navy' : 'border-line text-muted hover:bg-wash')}>
                  {l}
                  <span className={'text-[11px] tabular-nums ' + (f === k ? 'text-white/70' : 'text-muted-2')}>{n}</span>
                </button>
              );
            })}
          </div>

          {!rows ? <div className="p-8 text-muted text-[13px] text-center">Loading…</div>
            : shown.length === 0 ? (
              <div className="p-12 text-center">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-wash text-muted flex items-center justify-center mb-3">
                  <Icon name="receipt" size={20} />
                </span>
                <p className="text-[14px] font-semibold">{rows.length === 0 ? 'No expenses yet' : 'Nothing in this filter'}</p>
                <p className="text-muted text-[12.5px] mt-1">
                  {rows.length === 0 ? 'Add the first one with the red button above.' : 'Pick another tab to see the rest.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-line-soft">
                {shown.map((e) => {
                  const c = chip(e.status);
                  return (
                    <div key={e.id} data-expense-row className="flex items-start gap-3.5 px-4 py-3.5 hover:bg-wash/60">
                      <span className="w-10 h-10 rounded-[12px] bg-rose text-rose-ink flex items-center justify-center shrink-0 mt-0.5"><Icon name={catIcon(e.category)} size={17} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-semibold">{e.category}</span>
                          {e.source === 'auto_trip' && <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-wash text-muted border border-line whitespace-nowrap">AUTO · TRIP</span>}
                          <span className="text-[11.5px] text-muted-2 whitespace-nowrap">{niceDate(e.date)}</span>
                        </span>
                        {(e.merchant || e.note) && (
                          <span className="block text-[12px] text-muted mt-0.5 line-clamp-2">
                            {[e.merchant, e.note].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {whoSentence(e, money) && (
                          <span className={'block text-[12px] mt-1 font-medium ' + (e.status === 'rejected' ? 'text-accent' : e.status === 'reimbursed' ? 'text-mint-ink' : 'text-ink-2')}>
                            {whoSentence(e, money)}
                          </span>
                        )}
                      </span>
                      <span className="text-right shrink-0 pl-2">
                        <span className="block text-[14.5px] font-bold tabular-nums">{money(e.amount)}</span>
                        {e.paidAmount > 0 && e.paidAmount < e.amount && <span className="block text-[11px] text-muted">{money(e.paidAmount)} paid</span>}
                        <span className={'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' + c.cls}>{c.label}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>

        <div className="flex flex-col gap-4">
          {/* where it went */}
          <section className="card p-4" data-by-category>
            <h3 className="text-[14px] font-bold">Where it went</h3>
            <p className="text-[11.5px] text-muted mt-0.5 mb-3">Everything you have filed, by category. Rejected lines are left out.</p>
            {cats.length === 0 ? (
              <p className="text-[12.5px] text-muted">Nothing filed yet.</p>
            ) : cats.map((c) => (
              <div key={c.name} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-wash text-ink-2 flex items-center justify-center shrink-0"><Icon name={catIcon(c.name)} size={13} /></span>
                  <span className="flex-1 min-w-0 text-[12.5px] font-semibold truncate">{c.name}</span>
                  <span className="text-[12.5px] font-bold tabular-nums">{money(c.total)}</span>
                </div>
                <div className="flex items-center gap-2.5 mt-1.5 pl-[38px]">
                  <span className="flex-1 h-1.5 rounded-full bg-wash overflow-hidden">
                    <span className="block h-full rounded-full bg-navy" style={{ width: Math.max(4, Math.round(c.share * 100)) + '%' }} />
                  </span>
                  <span className="text-[11px] text-muted-2 whitespace-nowrap">{c.count} {c.count === 1 ? 'entry' : 'entries'}</span>
                </div>
              </div>
            ))}
          </section>

          {/* which dates are open, and what happens to a claim */}
          <section className="card p-4">
            <h3 className="text-[14px] font-bold mb-3">How a claim moves</h3>
            <div className="[&>p]:mb-3"><WindowNote w={win} /></div>
            <ol className="flex flex-col gap-2.5">
              {([
                ['bg-rose text-rose-ink', 'Pending', 'The office checks it against the receipt.'],
                ['bg-amber text-amber-ink', 'Approved', 'Agreed - it is owed to you and waits to be paid.'],
                ['bg-mint text-mint-ink', 'Paid', 'The money has been sent; who paid and when is on the line.'],
              ] as Array<[string, string, string]>).map(([cls, t, d], i) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className={'w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ' + cls}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold leading-tight">{t}</span>
                    <span className="block text-[11.5px] text-muted leading-snug mt-0.5">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
    </>
  );
}
