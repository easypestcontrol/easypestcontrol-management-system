'use client';

/* ============================================================================
   One day, every branch — the office's working screen.

   The calendar says where the money is; this is where it gets verified,
   approved and paid. Three sizes of decision, all here: the whole day at
   once, one branch's report, or one line. A closed report is shown but not
   touched — reopening it is the only way back in, and it says so.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { initials } from '../../../contracts/lib';
import { niceDate, shiftDay, todayISO, type Exp, type Summary } from '../../ui';
import { ExpenseRow, ReceiptModal } from '../../expense-row';
import PayDialog, { type PayTarget } from '../../pay-dialog';
import OpenReport from '../../open-report';

interface Report {
  id: string; title: string; branch: string; branchName: string; status: string;
  summary: Summary; expenses: Exp[];
}
interface Day { date: string; rate: number; summary: Summary; reports: Report[] }

export default function DayPage() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const [d, setD] = useState<Day | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [opening, setOpening] = useState(false);
  const [receipt, setReceipt] = useState<{ title: string; images: string[] } | null>(null);

  const load = useCallback(() => {
    api.get<Day>('/expenses/day/' + date).then(setD).catch(() => setD({ date, rate: 0, summary: empty(), reports: [] }));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr(''); setNote('');
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }
  const approveOne = (e: Exp) => act(() => api.post('/expenses/' + e.id + '/review', { approve: true }));
  const rejectOne = (e: Exp) => {
    const reason = window.prompt('Reject ' + e.category + ' ' + money(e.amount) + ' — reason (the employee sees this):');
    if (reason == null || !reason.trim()) return;
    return act(() => api.post('/expenses/' + e.id + '/review', { approve: false, reason: reason.trim() }));
  };
  const approveMany = (body: { date?: string; reportId?: string }, what: string, sum: number) => act(
    async () => {
      const out = await api.post<{ approved: number; amount: number; skipped: number }>('/expenses/approve', body);
      setNote(out.approved + ' approved, ' + money(out.amount) + (out.skipped ? ' · ' + out.skipped + ' skipped (closed report)' : ''));
    },
    'Approve every pending expense ' + what + ' — ' + money(sum) + '?');
  const toggleClose = (r: Report) => act(async () => {
    const out = await api.post<{ status: string; pulled: number }>('/expenses/reports/' + r.id + '/close', {});
    if (out.status === 'open' && out.pulled) setNote(out.pulled + ' trip expense(s) came in when the report reopened.');
  });
  async function openReceipt(e: Exp) {
    try {
      const full = await api.get<{ images: string[] }>('/expenses/' + e.id);
      setReceipt({ title: e.category + ' · ' + money(e.amount), images: full.images || [] });
    } catch { setErr('Could not load the receipt'); }
  }

  if (!d) return <div className="p-6 text-muted text-[13px]">Loading…</div>;
  const S = d.summary;
  const openReports = d.reports.filter((r) => r.status !== 'closed');
  const pendingOpen = openReports.reduce((a, r) => a + r.summary.pending, 0);
  const dueOpen = openReports.reduce((a, r) => a + r.summary.due, 0);
  const tiles = [
    { l: 'Expenses', v: String(S.count), sub: S.employees + (S.employees === 1 ? ' person' : ' people') + ' · ' + d.reports.length + (d.reports.length === 1 ? ' branch' : ' branches') },
    { l: 'Pending', v: money(S.pending), sub: 'to verify', cls: S.pending > 0 ? 'text-rose-ink' : '' },
    { l: 'To pay', v: money(S.due), sub: 'approved, owed', cls: S.due > 0 ? 'text-amber-ink' : '' },
    { l: 'Paid', v: money(S.paid), sub: 'reimbursed', cls: S.paid > 0 ? 'text-mint-ink' : '' },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-[1100px] max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <Link href="/expenses" className="text-[12.5px] text-muted hover:text-ink">← Calendar</Link>

      <div className="mt-2 mb-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => router.push('/expenses/day/' + shiftDay(date, -1))} aria-label="Previous day"
          className="w-9 h-9 rounded-[12px] border border-line flex items-center justify-center hover:bg-wash">
          <Icon name="chevRight" size={16} className="rotate-180" />
        </button>
        <h1 className="text-[18px] lg:text-2xl font-bold tracking-tight">{niceDate(date, true)}{date === todayISO() ? ' · Today' : ''}</h1>
        <button onClick={() => router.push('/expenses/day/' + shiftDay(date, 1))} aria-label="Next day"
          className="w-9 h-9 rounded-[12px] border border-line flex items-center justify-center hover:bg-wash">
          <Icon name="chevRight" size={16} />
        </button>
        <span className="flex-1" />
        <button onClick={() => setOpening(true)} className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">Open a report for this day</button>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}
      {note && <p className="text-[12.5px] text-mint-ink font-medium mb-3">{note}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {tiles.map((t) => (
          <div key={t.l} className="card p-3.5 lg:p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{t.l}</p>
            <p className={'mt-1 text-[17px] lg:text-[20px] font-bold leading-none tabular-nums ' + (t.cls || '')}>{t.v}</p>
            <p className="text-[11px] text-muted-2 mt-1 truncate">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* the whole day, in one go */}
      {(pendingOpen > 0 || dueOpen > 0) && (
        <div className="card p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[13.5px] font-bold">Every branch at once</p>
            <p className="text-[12px] text-muted">
              {pendingOpen > 0 ? money(pendingOpen) + ' to verify' : ''}{pendingOpen > 0 && dueOpen > 0 ? ' · ' : ''}{dueOpen > 0 ? money(dueOpen) + ' to pay' : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {pendingOpen > 0 && (
              <button disabled={busy} onClick={() => approveMany({ date }, 'in every branch on ' + niceDate(date), pendingOpen)}
                className="h-10 px-4 rounded bg-accent text-white text-[13px] font-bold hover:brightness-90">Approve all branches</button>
            )}
            {dueOpen > 0 && (
              <button disabled={busy} onClick={() => setPay({ date, title: 'every branch · ' + niceDate(date), due: dueOpen })}
                className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">Pay all approved</button>
            )}
          </div>
        </div>
      )}

      {d.reports.length === 0 ? (
        <div className="card p-10 text-center text-muted text-[13px]">
          No expenses on this day. Open a report for a branch and its people can add theirs.
        </div>
      ) : d.reports.map((r) => {
        const locked = r.status === 'closed';
        const groups: Array<{ userId: string; name: string; color: string; rows: Exp[]; sum: number }> = [];
        for (const e of r.expenses) {
          let g = groups.find((x) => x.userId === e.userId);
          if (!g) { g = { userId: e.userId, name: e.employeeName, color: e.employeeColor, rows: [], sum: 0 }; groups.push(g); }
          g.rows.push(e); g.sum += e.amount;
        }
        const rs = r.summary;
        return (
          <div key={r.id} className="card mb-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[15px] font-bold truncate">{r.branchName}</h2>
                  <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (locked ? 'bg-wash text-muted border border-line' : 'bg-mint text-mint-ink')}>{locked ? 'CLOSED' : 'OPEN'}</span>
                  <Link href={'/expenses/' + r.id} className="text-[11.5px] text-muted hover:text-accent">{r.id} →</Link>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                  <span className="px-2 py-0.5 rounded-full bg-wash text-ink-2 border border-line">{money(rs.total)} · {rs.count}</span>
                  {rs.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-rose text-rose-ink">{money(rs.pending)} pending</span>}
                  {rs.due > 0 && <span className="px-2 py-0.5 rounded-full bg-amber text-amber-ink">{money(rs.due)} to pay</span>}
                  {rs.paid > 0 && <span className="px-2 py-0.5 rounded-full bg-mint text-mint-ink">{money(rs.paid)} paid</span>}
                  {rs.rejected > 0 && <span className="px-2 py-0.5 rounded-full bg-wash text-muted border border-line">{money(rs.rejected)} rejected</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {locked ? (
                  <>
                    <span className="text-[12px] text-muted self-center">Closed — reopen to change anything</span>
                    <button disabled={busy} onClick={() => toggleClose(r)} className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">Reopen</button>
                  </>
                ) : (
                  <>
                    {rs.pending > 0 && (
                      <button disabled={busy} onClick={() => approveMany({ reportId: r.id }, 'in ' + r.branchName, rs.pending)}
                        className="h-9 px-3.5 rounded bg-accent text-white text-[12.5px] font-bold hover:brightness-90">Approve all in {r.branchName}</button>
                    )}
                    {rs.due > 0 && (
                      <button disabled={busy} onClick={() => setPay({ reportId: r.id, title: r.branchName + ' · ' + niceDate(date), due: rs.due })}
                        className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">Pay all</button>
                    )}
                    <button disabled={busy} onClick={() => toggleClose(r)} className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">Close report</button>
                  </>
                )}
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted text-[13px]">No expenses in this report yet.</p>
            ) : groups.map((g) => (
              <div key={g.userId}>
                <div className="flex items-center gap-2.5 px-4 py-2 bg-wash border-b border-line-soft">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9.5px] font-bold" style={{ background: g.color }}>{initials(g.name)}</span>
                  <span className="text-[13px] font-semibold flex-1">{g.name}</span>
                  <span className="text-[12px] text-muted tabular-nums">{money(g.sum)}</span>
                </div>
                {g.rows.map((e) => (
                  <ExpenseRow key={e.id} e={e} busy={busy} locked={locked}
                    onApprove={approveOne} onReject={rejectOne} onReceipt={openReceipt}
                    onPay={(x) => setPay({ ids: [x.id], single: true, title: x.category + ' · ' + x.employeeName, due: x.amount - (x.paidAmount || 0) })} />
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {pay && <PayDialog target={pay} onClose={() => setPay(null)}
        onDone={(out) => { setPay(null); setNote(out.paid + ' paid' + (out.failed ? ', ' + out.failed + ' failed — see the line' : '')); load(); }} />}
      {opening && <OpenReport date={date} onClose={() => setOpening(false)} onDone={() => { setOpening(false); load(); }} />}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

const empty = (): Summary => ({ count: 0, employees: 0, total: 0, pending: 0, approved: 0, partial: 0, reimbursed: 0, rejected: 0, paid: 0, due: 0 });
