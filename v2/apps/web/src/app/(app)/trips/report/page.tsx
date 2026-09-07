'use client';

/* ============================================================================
   Daily trip report — each person's driving for a day, totalled and ready to
   claim. Rejected trips fall out; everything else counts, whether the admin
   looked or not. "Push to expense claim" drops each person's trips into their
   expense folder for the ordinary approve → RazorpayX payout.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { initials } from '../../contracts/lib';
import { useBranchFilter } from '@/components/branch-filter';

interface Person {
  userId: string; name: string; color: string;
  trips: number; distanceKm: number; cost: number; toReview: number; claimed: number;
}
interface Report {
  date: string; rate: number;
  people: Person[];
  total: { trips: number; distanceKm: number; cost: number; toReview: number };
}

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export default function TripReport() {
  const [date, setDate] = useState(todayISO());
  const [r, setR] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const bf = useBranchFilter();

  const load = useCallback(() => {
    const q = '?date=' + date + (bf.branch ? '&branch=' + bf.branch : '');
    api.get<Report>('/trips/report' + q).then(setR).catch(() => setR(null));
  }, [date, bf.branch]);
  useEffect(() => { load(); }, [load]);

  async function push() {
    if (busy || !r) return;
    if (!window.confirm('Build expense claims from ' + r.total.trips + ' trip(s) on ' + date +
      '?\nEach person gets a folder of their un-rejected trips, ready for payout.')) return;
    setBusy(true); setMsg('');
    try {
      const out = await api.post<{ pushed: number; missingReports: string[] }>('/trips/report/push',
        { date, branch: bf.branch || '' });
      const miss = (out.missingReports || []).length
        ? ' No open report for: ' + out.missingReports.join(', ') + ' — open one on the Expenses page first.'
        : '';
      setMsg((out.pushed === 0
        ? 'Nothing new to push — those trips are already in a report.'
        : out.pushed + ' trip(s) added to their branch’s expense report.') + miss);
      load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not push'); }
    setBusy(false);
  }

  const niceDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 max-w-[900px]">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Daily trip report</h1>
          <p className="text-muted text-[13px] mt-0.5">{niceDate}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {bf.el}
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
            className="h-9 px-2.5 rounded border border-line text-[12.5px] bg-white outline-none" />
          <button disabled={busy || !r || r.total.trips === 0} onClick={push}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
            Push to expense claim
          </button>
        </div>
      </div>

      <p className="inline-flex items-center gap-2 text-[11.5px] text-muted bg-wash border border-line rounded-full px-3 py-1 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-navy" />
        Totals rebuild live from the day's trips. Only rejected trips are left out.
      </p>
      {msg && <p className="text-[12.5px] font-medium text-navy mb-3">{msg}</p>}

      {!r ? (
        <div className="p-6 text-muted text-[13px]">Loading…</div>
      ) : r.people.length === 0 ? (
        <div className="card p-10 text-center text-muted text-[13px]">
          No trips on this day.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="bg-wash">
                  {['Employee', 'Trips', 'Distance', 'Cost @ ' + money(r.rate) + '/km', 'Status'].map((h, i) => (
                    <th key={h} className={'text-[10px] uppercase tracking-wide font-semibold text-muted px-4 py-2.5 '
                      + (i >= 1 && i <= 3 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.people.map((p) => (
                  <tr key={p.userId} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                          style={{ background: p.color }}>{initials(p.name)}</span>
                        <span className="font-medium">{p.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right num">{p.trips}</td>
                    <td className="px-4 py-3 text-right num">{p.distanceKm} km</td>
                    <td className="px-4 py-3 text-right num font-semibold">{money(p.cost)}</td>
                    <td className="px-4 py-3">
                      {p.claimed === p.trips && p.trips > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-wash text-navy border border-navy">Claimed</span>
                      ) : p.toReview > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber text-amber-ink">{p.toReview} to review</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-wash text-navy border border-navy">All clear</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-wash font-bold border-t border-line">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right num">{r.total.trips}</td>
                  <td className="px-4 py-3 text-right num">{r.total.distanceKm} km</td>
                  <td className="px-4 py-3 text-right num text-accent">{money(r.total.cost)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted mt-3">
        Pushed trips appear in each person's <Link href="/expenses" className="text-accent font-semibold">Expenses</Link>{' '}
        folder, locked to the GPS distance × the ₹/km rate — approve there and RazorpayX pays it out.
      </p>
    </div>
  );
}
