'use client';

/* ============================================================================
   One branch+date report — the manager's review room. Every employee's
   expenses for that day, grouped by person, each approved or rejected on its
   own. When the approved money is settled, reimbursement runs per employee
   (RazorpayX or by hand) and each person's expenses turn Reimbursed.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { initials } from '../../contracts/lib';
import { catIcon, chip } from '../ui';

interface Exp {
  id: string; userId: string; employeeName: string; employeeColor: string;
  date: string; category: string; merchant: string; note: string; amount: number;
  status: string; source: string; tripId: string; rejectReason: string; hasReceipt: boolean;
  km: number; rate: number;
}
interface Report {
  id: string; title: string; date: string; branch: string; branchName: string; status: string;
  description: string; rate: number;
  summary: { count: number; employees: number; total: number; pending: number; approved: number; reimbursed: number; rejected: number };
  expenses: Exp[];
  history: Array<{ at: string; text: string }>;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; images: string[]; title: string } | null>(null);

  const load = useCallback(() => {
    api.get<Report>('/expenses/reports/' + id).then((x) => { setR(x); setMissing(false); }).catch(() => setMissing(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr('');
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }
  const approve = (e: Exp) => act(() => api.post('/expenses/' + e.id + '/review', { approve: true }));
  const reject = (e: Exp) => {
    const reason = window.prompt('Reject ' + e.category + ' ' + money(e.amount) + ' — reason (the employee sees this):');
    if (reason == null || !reason.trim()) return;
    return act(() => api.post('/expenses/' + e.id + '/review', { approve: false, reason: reason.trim() }));
  };
  const reimburse = (mode: 'razorpayx' | 'manual') => act(
    async () => {
      const out = await api.post<{ paid: number; failed: number; results: Array<{ userId: string; ok: boolean; error?: string }> }>(
        '/expenses/reimburse', { reportId: id, mode });
      if (out.failed) setErr(out.failed + ' payout(s) failed — see each employee’s status; you can retry.');
    },
    mode === 'razorpayx'
      ? 'Send the approved amount to each employee’s bank via RazorpayX?'
      : 'Mark the approved expenses as reimbursed (paid by hand)?');

  async function openReceipt(e: Exp) {
    try {
      const full = await api.get<{ images: string[] }>('/expenses/' + e.id);
      setReceipt({ id: e.id, images: full.images || [], title: e.category + ' · ' + money(e.amount) });
    } catch { setErr('Could not load the receipt'); }
  }

  if (missing) return (
    <div className="p-10 text-center">
      <p className="text-[14px] font-semibold">No such report</p>
      <Link href="/expenses" className="text-[13px] text-accent font-medium">← All expenses</Link>
    </div>
  );
  if (!r) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  // group expenses by employee (already ordered by userId)
  const groups: Array<{ userId: string; name: string; color: string; rows: Exp[]; sum: number }> = [];
  for (const e of r.expenses) {
    let g = groups.find((x) => x.userId === e.userId);
    if (!g) { g = { userId: e.userId, name: e.employeeName, color: e.employeeColor, rows: [], sum: 0 }; groups.push(g); }
    g.rows.push(e); g.sum += e.amount;
  }
  const S = r.summary;

  return (
    <div className="p-4 lg:p-6 max-w-[1000px]">
      <Link href="/expenses" className="text-[12.5px] text-muted hover:text-ink">← All expenses</Link>

      <div className="mt-2 mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[20px] font-semibold">{r.title}</h1>
            {r.status === 'closed' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-wash text-muted border border-line">CLOSED</span>}
          </div>
          <p className="text-muted text-[12.5px] mt-0.5">{r.branchName} · {r.id} · one report for this branch &amp; day</p>
        </div>
        <button onClick={() => act(() => api.post('/expenses/reports/' + id + '/close', {}))}
          className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
          {r.status === 'closed' ? 'Reopen' : 'Close report'}
        </button>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      {/* summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { l: 'Employees', v: String(S.employees) },
          { l: 'Expenses', v: String(S.count) },
          { l: 'Pending', v: money(S.pending), amber: S.pending > 0 },
          { l: 'Approved', v: money(S.approved) },
          { l: 'Reimbursed', v: money(S.reimbursed) },
        ].map((t) => (
          <div key={t.l} className="card p-3.5 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t.l}</p>
            <p className={'mt-1 text-[17px] font-bold leading-none ' + (t.amber ? 'text-amber-ink' : '')}>{t.v}</p>
          </div>
        ))}
      </div>

      {/* reimburse bar */}
      {S.approved > 0 && (
        <div className="rounded-md border-2 border-navy bg-white shadow-card p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[13.5px] font-bold">{money(S.approved)} approved, ready to reimburse</p>
            <p className="text-[12px] text-muted">Grouped per employee — one payout each.</p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => reimburse('razorpayx')} className="h-10 px-4 rounded bg-accent text-white text-[13px] font-bold hover:brightness-90">Pay via RazorpayX</button>
            <button disabled={busy} onClick={() => reimburse('manual')} className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">Mark paid manually</button>
          </div>
        </div>
      )}

      {/* expenses grouped by employee */}
      {groups.length === 0 ? (
        <div className="card p-10 text-center text-muted text-[13px]">
          No expenses yet — the branch&rsquo;s people add theirs into this report.
        </div>
      ) : groups.map((g) => (
        <div key={g.userId} className="card mb-3 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-wash border-b border-line-soft">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold" style={{ background: g.color }}>{initials(g.name)}</span>
            <span className="text-[13.5px] font-semibold flex-1">{g.name}</span>
            <span className="text-[12.5px] text-muted num">{money(g.sum)}</span>
          </div>
          {g.rows.map((e) => {
            const c = chip(e.status);
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-line-soft last:border-0">
                <span className="w-9 h-9 rounded-lg bg-red-wash text-accent flex items-center justify-center shrink-0 mt-0.5"><Icon name={catIcon(e.category)} size={16} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {e.category}
                    {e.source === 'auto_trip' && <Link href={'/trips/' + e.tripId} className="ml-2 text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-wash text-muted border border-line align-middle hover:text-accent">AUTO · {e.tripId}</Link>}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {[e.merchant, e.note && e.source !== 'auto_trip' ? e.note : '', e.source === 'auto_trip' ? e.km + ' km × ' + money(e.rate) + '/km' : ''].filter(Boolean).join(' · ')}
                  </span>
                  {e.status === 'rejected' && e.rejectReason && <span className="block text-[11.5px] text-accent mt-1">Reason: {e.rejectReason}</span>}
                  {e.hasReceipt && <button onClick={() => openReceipt(e)} className="mt-1 text-[11.5px] font-semibold text-navy hover:text-accent inline-flex items-center gap-1"><Icon name="report" size={12} /> View receipt</button>}
                </span>
                <span className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <span className="text-[13.5px] font-bold">{money(e.amount)}</span>
                  <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + c.cls}>{c.label}</span>
                  {e.status === 'pending' && (
                    <span className="flex gap-1.5">
                      <button disabled={busy} onClick={() => approve(e)} className="h-7 px-2.5 rounded border border-line text-[11.5px] font-semibold hover:bg-wash">Approve</button>
                      <button disabled={busy} onClick={() => reject(e)} className="h-7 px-2.5 rounded border border-red-line text-accent text-[11.5px] font-semibold hover:bg-red-wash">Reject</button>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-13 py-3 border-b border-line-soft">
              <h2 className="text-[14px] font-bold">Receipt · {receipt.title}</h2>
              <button onClick={() => setReceipt(null)} className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {receipt.images.length === 0 ? <p className="text-[12.5px] text-muted text-center py-6">No receipt image.</p>
                // eslint-disable-next-line @next/next/no-img-element
                : receipt.images.map((img, i) => <img key={i} src={img} alt="receipt" className="w-full rounded border border-line" />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
