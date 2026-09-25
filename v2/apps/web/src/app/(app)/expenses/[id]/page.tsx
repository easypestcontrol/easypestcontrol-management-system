'use client';

/* ============================================================================
   One branch+date report — the folder itself: its diary, its close/reopen,
   and every line in it. The day page works across branches; this is one
   branch's day on its own, with the same rows and the same buttons.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { niceDate, type Exp, type Summary } from '../ui';
import { PersonGroup, ReceiptModal, groupByPerson, type Group } from '../expense-row';
import PayDialog, { type PayTarget } from '../pay-dialog';

interface Report {
  id: string; title: string; date: string; branch: string; branchName: string; status: string;
  description: string; rate: number;
  summary: Summary;
  expenses: Exp[];
  history: Array<{ at: string; text: string }>;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [diary, setDiary] = useState(false);
  const [receipt, setReceipt] = useState<{ title: string; images: string[] } | null>(null);

  const load = useCallback(() => {
    api.get<Report>('/expenses/reports/' + id).then((x) => { setR(x); setMissing(false); }).catch(() => setMissing(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr(''); setNote('');
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }
  const approve = (e: Exp) => act(() => api.post('/expenses/' + e.id + '/review', { approve: true }));
  const reject = (e: Exp) => {
    const reason = window.prompt('Reject ' + e.category + ' ' + money(e.amount) + ' — reason (the employee sees this):');
    if (reason == null || !reason.trim()) return;
    return act(() => api.post('/expenses/' + e.id + '/review', { approve: false, reason: reason.trim() }));
  };
  const approveAll = () => act(async () => {
    const out = await api.post<{ approved: number; amount: number }>('/expenses/approve', { reportId: id });
    setNote(out.approved + ' approved, ' + money(out.amount));
  }, 'Approve every pending expense in this report?');
  const approvePerson = (g: Group, pending: Exp[]) => act(async () => {
    const out = await api.post<{ approved: number; amount: number }>('/expenses/approve', { ids: pending.map((e) => e.id) });
    setNote(out.approved + ' approved for ' + g.name + ', ' + money(out.amount));
  }, 'Approve every pending expense of ' + g.name + ' — ' + money(pending.reduce((a, e) => a + e.amount, 0)) + '?');
  const payPerson = (g: Group, payable: Exp[], due: number) =>
    setPay({ ids: payable.map((e) => e.id), title: g.name + ' · ' + niceDate(r?.date || ''), due });
  const toggleClose = () => act(async () => {
    const out = await api.post<{ status: string; pulled: number }>('/expenses/reports/' + id + '/close', {});
    if (out.status === 'open' && out.pulled) setNote(out.pulled + ' trip expense(s) came in when the report reopened.');
  });
  async function openReceipt(e: Exp) {
    try {
      const full = await api.get<{ images: string[] }>('/expenses/' + e.id);
      setReceipt({ title: e.category + ' · ' + money(e.amount), images: full.images || [] });
    } catch { setErr('Could not load the receipt'); }
  }

  if (missing) return (
    <div className="p-10 text-center">
      <p className="text-[14px] font-semibold">No such report</p>
      <Link href="/expenses" className="text-[13px] text-accent font-medium">← All expenses</Link>
    </div>
  );
  if (!r) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const groups = groupByPerson(r.expenses);
  const S = r.summary;
  const locked = r.status === 'closed';

  return (
    <div className="p-4 lg:p-6 max-w-[1000px] max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <div className="flex items-center gap-3 text-[12.5px] text-muted">
        <Link href="/expenses" className="hover:text-ink">← Calendar</Link>
        <Link href={'/expenses/day/' + r.date} className="hover:text-ink">{niceDate(r.date)} · every branch</Link>
      </div>

      <div className="mt-2 mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[18px] lg:text-2xl font-bold tracking-tight">{r.title}</h1>
            <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (locked ? 'bg-wash text-muted border border-line' : 'bg-mint text-mint-ink')}>{locked ? 'CLOSED' : 'OPEN'}</span>
          </div>
          <p className="text-muted text-[12.5px] mt-0.5">{r.branchName} · {r.id} · one report for this branch &amp; day</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDiary(true)} className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">History</button>
          <button disabled={busy} onClick={toggleClose} className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            {locked ? 'Reopen' : 'Close report'}
          </button>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}
      {note && <p className="text-[12.5px] text-mint-ink font-medium mb-3">{note}</p>}
      {locked && (
        <div className="rounded-[12px] border border-line bg-wash px-4 py-3 mb-4 text-[12.5px] text-muted">
          This report is closed: nothing can be added, changed, approved or paid. <b className="text-ink">Reopen</b> it to work on it — any trip that finished that day while it was closed comes in with it.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { l: 'Employees', v: String(S.employees) },
          { l: 'Expenses', v: String(S.count) },
          { l: 'Pending', v: money(S.pending), cls: S.pending > 0 ? 'text-rose-ink' : '' },
          { l: 'To pay', v: money(S.due), cls: S.due > 0 ? 'text-amber-ink' : '' },
          { l: 'Paid', v: money(S.paid), cls: S.paid > 0 ? 'text-mint-ink' : '' },
        ].map((t) => (
          <div key={t.l} className="card p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t.l}</p>
            <p className={'mt-1 text-[17px] font-bold leading-none tabular-nums ' + (t.cls || '')}>{t.v}</p>
          </div>
        ))}
      </div>

      {!locked && (S.pending > 0 || S.due > 0) && (
        <div className="card p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[13.5px] font-bold">
              {S.pending > 0 ? money(S.pending) + ' to verify' : ''}{S.pending > 0 && S.due > 0 ? ' · ' : ''}{S.due > 0 ? money(S.due) + ' approved, to pay' : ''}
            </p>
            <p className="text-[12px] text-muted">Paying groups per employee — one payout each.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {S.pending > 0 && <button disabled={busy} onClick={approveAll} className="h-10 px-4 rounded bg-accent text-white text-[13px] font-bold hover:brightness-90">Approve all pending</button>}
            {S.due > 0 && <button disabled={busy} onClick={() => setPay({ reportId: id, title: r.branchName + ' · ' + niceDate(r.date), due: S.due })} className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">Pay all approved</button>}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card p-10 text-center text-muted text-[13px]">
          No expenses yet — the branch&rsquo;s people add theirs into this report.
        </div>
      ) : (
        <div className="card overflow-hidden">
          {groups.map((g) => (
            <PersonGroup key={g.userId} g={g} busy={busy} locked={locked} defaultOpen
              onApproveAll={approvePerson} onPayAll={payPerson}
              onApprove={approve} onReject={reject} onReceipt={openReceipt}
              onPay={(x) => setPay({ ids: [x.id], single: true, title: x.category + ' · ' + x.employeeName, due: x.amount - (x.paidAmount || 0) })} />
          ))}
        </div>
      )}

      {pay && <PayDialog target={pay} onClose={() => setPay(null)}
        onDone={(out) => { setPay(null); setNote(out.paid + ' paid' + (out.failed ? ', ' + out.failed + ' failed — see the line' : '')); load(); }} />}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
      {diary && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setDiary(false)}>
          <div className="bg-white rounded-xl max-w-[480px] w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-line-soft"><h2 className="text-[14px] font-bold">History · {r.id}</h2></div>
            <div className="p-4 text-[12.5px] flex flex-col gap-2">
              {(r.history || []).length === 0 ? <p className="text-muted">Nothing yet.</p>
                : r.history.map((h, i) => <p key={i}><span className="text-muted tabular-nums">{h.at}</span> — {h.text}</p>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
