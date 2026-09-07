'use client';

/* ============================================================================
   Trips dashboard — the office's monitoring screen. Today's driving at a
   glance (trips, who's on the road now, total distance, cost at the ₹/km
   rate, and what needs a look), then every trip today with an inline
   approve / reject on the flagged ones and a remote-cancel on the running
   ones. The technician's own "My trips" screen lives at /trip, untouched.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { initials } from '../contracts/lib';
import { useBranchFilter } from '@/components/branch-filter';

interface Row {
  id: string; userId: string; userName: string; userColor: string;
  purpose: string; status: string; review: string; flagged: boolean; flagReason: string;
  startPlace: string; endPlace: string; dest: string;
  distanceM: number; plannedM: number; cost: number; mins: number; claimId: string;
}
interface Dash {
  rate: number;
  kpi: { trips: number; onRoad: number; distanceKm: number; cost: number; needsReview: number };
  rows: Row[];
}

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const km = (m: number) => (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
const dur = (m: number) => m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';

const CHIP: Record<string, { label: string; cls: string }> = {
  active: { label: 'On the road', cls: 'bg-navy text-white' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-wash text-accent' },
  pending: { label: 'Review', cls: 'bg-amber text-amber-ink' },
  auto: { label: 'Approved', cls: 'bg-wash text-navy border border-navy' },
  approved: { label: 'Approved', cls: 'bg-wash text-navy border border-navy' },
  rejected: { label: 'Rejected', cls: 'bg-red-wash text-accent' },
};
const chipFor = (r: Row) => r.status === 'active' ? CHIP.active
  : r.status === 'cancelled' ? CHIP.cancelled : (CHIP[r.review] || CHIP.auto);

export default function TripsDashboard() {
  const router = useRouter();
  const [d, setD] = useState<Dash | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const bf = useBranchFilter();

  const load = useCallback(() => {
    api.get<Dash>('/trips/dashboard' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setD).catch(() => setD(null));
  }, [bf.branch]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, fn: () => Promise<unknown>, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id); setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not do that'); }
    setBusy('');
  }
  const approve = (id: string) => act(id, () => api.post('/trips/' + id + '/review', { approve: true }));
  const reject = (id: string) => {
    const note = window.prompt('Reject this trip — reason (the technician sees this):');
    if (note == null || !note.trim()) return;
    return act(id, () => api.post('/trips/' + id + '/review', { approve: false, note: note.trim() }));
  };
  const cancel = (id: string) => {
    const note = window.prompt('Cancel this running trip — message to the technician:', 'Cancelled by the office');
    if (note == null) return;
    return act(id, () => api.post('/trips/' + id + '/cancel', { note: note.trim() }));
  };

  if (!d) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const K = d.kpi;
  const tiles = [
    { l: 'Trips today', v: String(K.trips), x: 'started today' },
    { l: 'On the road', v: String(K.onRoad), x: 'live now', live: true },
    { l: 'Distance today', v: K.distanceKm + ' km', x: 'GPS measured' },
    { l: 'Cost today', v: money(K.cost), x: '@ ' + money(d.rate) + ' / km' },
    { l: 'Needs review', v: String(K.needsReview), x: 'flagged as unusual', alert: K.needsReview > 0 },
  ];

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Trips — today</h1>
          <p className="text-muted text-[13px] mt-0.5">
            Every work drive, monitored. Flagged trips wait for your decision; the rest are
            approved automatically and roll into the daily report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bf.el}
          <button onClick={() => router.push('/trips/report')}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            Daily report
          </button>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {tiles.map((t) => (
          <div key={t.l} className={'rounded-md border bg-white p-3.5 shadow-card '
            + (t.alert ? 'border-red-line bg-red-wash' : 'border-line')}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t.l}</p>
            <p className={'mt-1.5 text-[22px] font-bold leading-none ' + (t.alert ? 'text-accent' : '')}>{t.v}</p>
            <p className="mt-1.5 text-[11px] text-muted-2">
              {t.live && K.onRoad > 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle mr-1" />}
              {t.x}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-line bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 h-11 border-b border-line-soft">
          <h2 className="text-[13.5px] font-semibold">Every trip, today</h2>
          <span className="text-[11.5px] text-muted">newest first</span>
        </div>
        {d.rows.length === 0 ? (
          <p className="p-10 text-center text-[13px] text-muted">No trips today yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="bg-wash">
                  {['Employee', 'Route', 'Distance', 'Time', 'Cost', 'Status', ''].map((h, i) => (
                    <th key={h} className={'text-[10px] uppercase tracking-wide font-semibold text-muted px-4 py-2.5 '
                      + (i >= 2 && i <= 4 ? 'text-right' : i === 6 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const c = chipFor(r);
                  return (
                    <tr key={r.id} className="border-t border-line-soft hover:bg-wash cursor-pointer"
                      onClick={() => router.push('/trips/' + r.id)}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                            style={{ background: r.userColor }}>{initials(r.userName)}</span>
                          <span className="font-medium">{r.userName}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="truncate max-w-[130px]">{r.startPlace || '—'}</span>
                          <span className="text-muted-2">→</span>
                          <span className="truncate max-w-[130px]">{r.endPlace || r.dest || '…'}</span>
                        </span>
                      </td>
                      <td className={'px-4 py-3 text-right num ' + (r.flagged ? 'text-amber-ink font-semibold' : '')}>
                        {km(r.distanceM)}
                      </td>
                      <td className="px-4 py-3 text-right num text-muted">{dur(r.mins)}</td>
                      <td className="px-4 py-3 text-right num font-semibold">{money(r.cost)}</td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ' + c.cls}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />{c.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {r.status === 'active' ? (
                          <button disabled={!!busy} onClick={() => cancel(r.id)}
                            className="h-7 px-2.5 rounded border border-red-line text-accent text-[11.5px] font-semibold hover:bg-red-wash">
                            Cancel
                          </button>
                        ) : r.review === 'pending' ? (
                          <span className="inline-flex gap-1.5 justify-end">
                            <button disabled={!!busy} onClick={() => approve(r.id)}
                              className="h-7 px-2.5 rounded border border-line text-[11.5px] font-semibold hover:bg-wash">Approve</button>
                            <button disabled={!!busy} onClick={() => reject(r.id)}
                              className="h-7 px-2.5 rounded border border-red-line text-accent text-[11.5px] font-semibold hover:bg-red-wash">Reject</button>
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-muted-2">{r.claimId ? 'claimed' : '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[12px] text-muted mt-3">
        Tap any trip to see its route and the planned-vs-driven distance. Set the ₹/km rate in
        Settings → Organisation.
      </p>
    </div>
  );
}
