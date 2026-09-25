'use client';

/* ============================================================================
   One day, every branch — the office's working screen.

   The calendar says where the money is; this is where it gets verified,
   approved and paid. The branches are a tab strip; one branch is open at a
   time, its people listed underneath, each person a line the office can
   approve or pay whole, or open to see the expenses themselves. Four sizes
   of decision, all here: the whole day, one branch, one person, one line.
   Closing is the exception: the office settles a DAY, so the one Close all /
   Reopen all at the top is the only switch, and a closed card says so
   rather than offering its own.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { niceDate, shiftDay, todayISO, type Exp, type Summary } from '../../ui';
import { PersonGroup, ReceiptModal, groupByPerson, type Group } from '../../expense-row';
import PayDialog, { type PayTarget } from '../../pay-dialog';

interface Report {
  id: string; title: string; branch: string; branchName: string; status: string;
  summary: Summary; expenses: Exp[];
}
interface Day { date: string; rate: number; summary: Summary; reports: Report[] }

export default function DayPage() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const [d, setD] = useState<Day | null>(null);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [receipt, setReceipt] = useState<{ title: string; images: string[] } | null>(null);

  const load = useCallback(() => {
    api.get<Day>('/expenses/day/' + date).then((x) => {
      setD(x);
      // Keep the branch that was open; on a fresh day, start where the work is.
      setSel((cur) => (x.reports.some((r) => r.id === cur) ? cur
        : (x.reports.find((r) => r.summary.pending > 0) || x.reports[0])?.id || ''));
    }).catch(() => setD({ date, rate: 0, summary: empty(), reports: [] }));
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
  const approveMany = (body: { date?: string; reportId?: string; ids?: string[] }, what: string, sum: number) => act(
    async () => {
      const out = await api.post<{ approved: number; amount: number; skipped: number }>('/expenses/approve', body);
      setNote(out.approved + ' approved, ' + money(out.amount) + (out.skipped ? ' · ' + out.skipped + ' skipped (closed report)' : ''));
    },
    'Approve every pending expense ' + what + ' — ' + money(sum) + '?');
  const approvePerson = (g: Group, pending: Exp[]) =>
    approveMany({ ids: pending.map((e) => e.id) }, 'of ' + g.name, pending.reduce((a, e) => a + e.amount, 0));
  const payPerson = (g: Group, payable: Exp[], due: number) =>
    setPay({ ids: payable.map((e) => e.id), title: g.name + ' · ' + niceDate(date), due });
  /* The whole day at once: the office settles a day, not a branch at a time.
     Reopening is the same single click the other way. */
  const closeDay = (reopen: boolean, n: number) => act(async () => {
    const out = await api.post<{ changed: number; pulled: number }>('/expenses/day/' + date + '/close', { reopen });
    setNote((reopen ? out.changed + ' report(s) reopened' : out.changed + ' report(s) closed')
      + (out.pulled ? ' · ' + out.pulled + ' trip expense(s) came in' : ''));
  }, reopen
    ? 'Reopen all ' + n + ' report(s) for ' + niceDate(date) + '? Their people can add and change expenses again.'
    : 'Close all ' + n + ' report(s) for ' + niceDate(date) + '? Nothing can be added, changed, approved or paid until they are reopened.');
  async function openReceipt(e: Exp) {
    try {
      const full = await api.get<{ images: string[] }>('/expenses/' + e.id);
      setReceipt({ title: e.category + ' · ' + money(e.amount), images: full.images || [] });
    } catch { setErr('Could not load the receipt'); }
  }

  if (!d) return <div className="p-6 text-muted text-[13px]">Loading…</div>;
  const S = d.summary;
  const openReports = d.reports.filter((r) => r.status !== 'closed');
  const allClosed = d.reports.length > 0 && openReports.length === 0;
  const pendingOpen = openReports.reduce((a, r) => a + r.summary.pending, 0);
  const dueOpen = openReports.reduce((a, r) => a + r.summary.due, 0);
  const tiles = [
    { l: 'Expenses', v: String(S.count), sub: S.employees + (S.employees === 1 ? ' person' : ' people') + ' · ' + d.reports.length + (d.reports.length === 1 ? ' branch' : ' branches') },
    { l: 'Pending', v: money(S.pending), sub: 'to verify', cls: S.pending > 0 ? 'text-rose-ink' : '' },
    { l: 'To pay', v: money(S.due), sub: 'approved, owed', cls: S.due > 0 ? 'text-amber-ink' : '' },
    { l: 'Paid', v: money(S.paid), sub: 'reimbursed', cls: S.paid > 0 ? 'text-mint-ink' : '' },
  ];
  const r = d.reports.find((x) => x.id === sel) || d.reports[0];
  const rowHandlers = { onApprove: approveOne, onReject: rejectOne, onReceipt: openReceipt,
    onPay: (x: Exp) => setPay({ ids: [x.id], single: true, title: x.category + ' · ' + x.employeeName, due: x.amount - (x.paidAmount || 0) }) };

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
        {d.reports.length > 0 && (allClosed ? (
          <button disabled={busy} onClick={() => closeDay(true, d.reports.length)}
            className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            Reopen all reports
          </button>
        ) : (
          <button disabled={busy} onClick={() => closeDay(false, openReports.length)}
            className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            Close all reports{d.reports.length > 1 ? ' (' + openReports.length + ')' : ''}
          </button>
        ))}
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
          No expenses on this day. A branch&rsquo;s report opens by itself with the first expense or trip.
        </div>
      ) : (
        <>
          {/* ------------------------------------------------ the branches */}
          <div role="tablist" aria-label="Branches" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mb-3">
            {d.reports.map((x) => {
              const on = x.id === (r?.id || '');
              return (
                <button key={x.id} role="tab" aria-selected={on} onClick={() => setSel(x.id)}
                  className={'h-10 px-4 rounded-[12px] border text-[13px] font-semibold whitespace-nowrap flex items-center gap-2 shrink-0 transition-colors '
                    + (on ? 'bg-accent text-white border-accent' : 'bg-white border-line hover:bg-wash')}>
                  {x.branchName}
                  {x.summary.pending > 0 && (
                    <span className={'text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ' + (on ? 'bg-white/20 text-white' : 'bg-rose text-rose-ink')}>
                      {x.expenses.filter((e) => e.status === 'pending').length} pending
                    </span>
                  )}
                  {x.status === 'closed' && <span className={'text-[10px] font-bold ' + (on ? 'text-white/80' : 'text-muted')}>CLOSED</span>}
                </button>
              );
            })}
          </div>

          {r && (() => {
            const locked = r.status === 'closed';
            const groups = groupByPerson(r.expenses);
            const rs = r.summary;
            return (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-bold truncate">{r.branchName}</h2>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (locked ? 'bg-wash text-muted border border-line' : 'bg-mint text-mint-ink')}>{locked ? 'CLOSED' : 'OPEN'}</span>
                      <Link href={'/expenses/' + r.id} className="text-[11.5px] text-muted hover:text-accent">{r.id} →</Link>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-wash text-ink-2 border border-line">{money(rs.total)} · {rs.count} · {groups.length} {groups.length === 1 ? 'person' : 'people'}</span>
                      {rs.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-rose text-rose-ink">{money(rs.pending)} pending</span>}
                      {rs.due > 0 && <span className="px-2 py-0.5 rounded-full bg-amber text-amber-ink">{money(rs.due)} to pay</span>}
                      {rs.paid > 0 && <span className="px-2 py-0.5 rounded-full bg-mint text-mint-ink">{money(rs.paid)} paid</span>}
                      {rs.rejected > 0 && <span className="px-2 py-0.5 rounded-full bg-wash text-muted border border-line">{money(rs.rejected)} rejected</span>}
                    </div>
                  </div>
                  {/* Closing is a day-level act - the one button at the top -
                      so a branch card never offers its own. */}
                  <div className="flex gap-2 flex-wrap">
                    {locked ? (
                      <span className="text-[12px] text-muted self-center">Closed for the day — use Reopen all reports above to change anything</span>
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
                      </>
                    )}
                  </div>
                </div>

                {groups.length === 0 ? (
                  <p className="px-4 py-6 text-center text-muted text-[13px]">No expenses in this report yet.</p>
                ) : groups.map((g) => (
                  <PersonGroup key={r.id + ':' + g.userId} g={g} busy={busy} locked={locked}
                    onApproveAll={approvePerson} onPayAll={payPerson} {...rowHandlers} />
                ))}
              </div>
            );
          })()}
        </>
      )}

      {pay && <PayDialog target={pay} onClose={() => setPay(null)}
        onDone={(out) => { setPay(null); setNote(out.paid + ' paid' + (out.failed ? ', ' + out.failed + ' failed — see the line' : '')); load(); }} />}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

const empty = (): Summary => ({ count: 0, employees: 0, total: 0, pending: 0, approved: 0, partial: 0, reimbursed: 0, rejected: 0, paid: 0, due: 0 });
