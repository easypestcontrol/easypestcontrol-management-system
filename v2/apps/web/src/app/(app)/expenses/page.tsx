'use client';

/* ============================================================================
   Expenses — one door, two rooms.
   • Admin / branch manager: the branch+date reports, each a folder of the
     whole branch's expenses; they open new reports and step in to review.
   • Everyone else: their own expense history and an Add-Expense button. They
     never see a report containing coworkers' money.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from 'shared';
import { api, ApiError, type Bootstrap, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';
import { catIcon, chip } from './ui';
import AddExpense from './add-expense';

interface ReportRow {
  id: string; title: string; date: string; branch: string; branchName: string; status: string;
  count: number; employees: number; total: number; pending: number; approved: number; reimbursed: number; rejected: number;
}
interface MineRow {
  id: string; date: string; category: string; merchant: string; note: string; amount: number;
  status: string; source: string; tripId: string; rejectReason: string; hasReceipt: boolean;
}

const niceDate = (iso: string) => {
  const p = String(iso || '').split('-');
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return p.length === 3 ? `${Number(p[2])} ${M[Number(p[1]) - 1]}` : iso;
};

export default function ExpensesPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  useEffect(() => { api.get<SessionUser>('/auth/me').then(setMe).catch(() => {}); }, []);
  if (!me) return <div className="p-6 text-muted text-[13px]">Loading…</div>;
  const manage = me.role === 'admin' || me.role === 'ops';
  return manage ? <ManagerView me={me} /> : <EmployeeView />;
}

/* ------------------------------------------------------- manager: reports */
function ManagerView({ me }: { me: SessionUser }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [opening, setOpening] = useState(false);
  const [adding, setAdding] = useState(false);
  const bf = useBranchFilter();

  const load = useCallback(() => {
    api.get<{ rows: ReportRow[] }>('/expenses/reports' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [bf.branch]);
  useEffect(() => { load(); }, [load]);

  // group by month for a tidy shelf
  const groups: Array<{ m: string; rows: ReportRow[] }> = [];
  for (const r of rows || []) {
    const M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const p = r.date.split('-'); const m = p.length === 3 ? `${M[Number(p[1]) - 1]} ${p[0]}` : r.date;
    const g = groups[groups.length - 1];
    if (g && g.m === m) g.rows.push(r); else groups.push({ m, rows: [r] });
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1000px]">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Expenses</h1>
          <p className="text-muted text-[13px] mt-0.5">One report per branch per day — the whole branch&rsquo;s expenses in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          {bf.el}
          <button onClick={() => setAdding(true)} className="h-9 px-3.5 rounded border border-line text-[13px] font-semibold hover:bg-wash">Add my expense</button>
          <button onClick={() => setOpening(true)} className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">Open report</button>
        </div>
      </div>

      {!rows ? <div className="text-muted text-[13px]">Loading…</div>
        : rows.length === 0 ? (
          <div className="rounded-md border border-line bg-white p-10 text-center text-muted text-[13px]">
            No reports yet. Open one for a branch and a date, then the branch&rsquo;s people add their expenses.
          </div>
        ) : groups.map((g) => (
          <div key={g.m} className="mb-5">
            <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-muted-2 mb-2">{g.m}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {g.rows.map((r) => (
                <button key={r.id} onClick={() => router.push('/expenses/' + r.id)}
                  className="text-left w-full rounded-md border border-line bg-white shadow-card p-4 hover:border-navy/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-bold flex items-center gap-2">
                        {niceDate(r.date)} · {r.branchName}
                        {r.status === 'closed' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-wash text-muted border border-line">CLOSED</span>}
                      </div>
                      <div className="text-[11.5px] text-muted mt-0.5">{r.employees} {r.employees === 1 ? 'employee' : 'employees'} · {r.count} expense{r.count === 1 ? '' : 's'} · {r.id}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[16px] font-bold">{money(r.total)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                    {r.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber text-amber-ink">{money(r.pending)} pending</span>}
                    {r.approved > 0 && <span className="px-2 py-0.5 rounded-full bg-wash text-navy border border-navy">{money(r.approved)} approved</span>}
                    {r.reimbursed > 0 && <span className="px-2 py-0.5 rounded-full bg-navy text-white">{money(r.reimbursed)} reimbursed</span>}
                    {r.rejected > 0 && <span className="px-2 py-0.5 rounded-full bg-red-wash text-accent">{money(r.rejected)} rejected</span>}
                    {r.count === 0 && <span className="text-muted-2">empty</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

      {opening && <OpenReport onClose={() => setOpening(false)} onDone={() => { setOpening(false); load(); }} />}
      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

/* ------------------------------------------------- open-report dialog */
function OpenReport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const [date, setDate] = useState(todayISO());
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get<Bootstrap>('/org/bootstrap').then((b) => {
      setBranches(b.branches); if (b.branches[0]) setBranch(b.branches[0].id);
    }).catch(() => {});
  }, []);
  async function create() {
    if (busy || !branch) return;
    setBusy(true); setErr('');
    try { await api.post('/expenses/reports', { date, branch }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not open the report'); setBusy(false); }
  }
  const input = 'w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-[400px] rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-line-soft">
          <h2 className="text-[15px] font-bold">Open an expense report</h2>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <label className="block"><span className="block text-[12px] font-semibold text-ink-2 mb-1">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
          <label className="block"><span className="block text-[12px] font-semibold text-ink-2 mb-1">Branch</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={input}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <p className="text-[11.5px] text-muted">One report per branch per day. The branch&rsquo;s people then add their expenses into it.</p>
          {err && <p className="text-[12.5px] text-accent">{err}</p>}
          <button onClick={create} disabled={busy} className="h-11 rounded-md bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-50">Open report</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ employee: mine */
function EmployeeView() {
  const [rows, setRows] = useState<MineRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState('all');
  const load = useCallback(() => { api.get<{ rows: MineRow[] }>('/expenses/mine').then((r) => setRows(r.rows)).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const shown = (rows || []).filter((r) => f === 'all' || r.status === f);
  const TABS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['reimbursed', 'Reimbursed']];

  return (
    <div className="p-4 lg:p-6 max-w-[720px]">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">My expenses</h1>
          <p className="text-muted text-[13px] mt-0.5">Your submissions and where each one stands.</p>
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
                  <span className="w-9 h-9 rounded-lg bg-red-wash text-accent flex items-center justify-center shrink-0 mt-0.5"><Icon name={catIcon(e.category)} size={16} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold">
                      {e.category}
                      {e.source === 'auto_trip' && <span className="ml-2 text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-wash text-muted border border-line align-middle">AUTO · TRIP</span>}
                    </span>
                    <span className="block text-[11.5px] text-muted">{niceDate(e.date)}{e.merchant ? ' · ' + e.merchant : ''}{e.note ? ' · ' + e.note : ''}</span>
                    {e.status === 'rejected' && e.rejectReason && (
                      <span className="block text-[11.5px] text-accent mt-1">Reason: {e.rejectReason}</span>
                    )}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13.5px] font-bold">{money(e.amount)}</span>
                    <span className={'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' + c.cls}>{c.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}
