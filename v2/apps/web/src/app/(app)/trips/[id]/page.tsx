'use client';

/* ============================================================================
   Trip review — one drive in full: the GPS breadcrumb on a small map, the
   planned-vs-driven distance, the cost at the ₹/km rate, and why it was
   flagged. The admin approves or rejects (with a reason the technician
   sees), or cancels a still-running one.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { initials } from '../../contracts/lib';

interface Pt { lat: number; lng: number; t: string }
interface Detail {
  id: string; userId: string; userName: string; userColor: string;
  purpose: string; status: string; review: string; flagged: boolean; flagReason: string;
  startPlace: string; endPlace: string; dest: string;
  distanceM: number; plannedM: number; cost: number; rate: number; mins: number;
  reviewNote: string; claimId: string;
  startAt: string; endAt: string | null; canManage: boolean;
}

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const km = (m: number) => (m / 1000).toFixed(1) + ' km';
const dur = (m: number) => m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
const clock = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const STATE: Record<string, { label: string; cls: string }> = {
  active: { label: 'On the road', cls: 'bg-navy text-white' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-wash text-accent' },
  pending: { label: 'Needs review', cls: 'bg-amber text-amber-ink' },
  auto: { label: 'Approved', cls: 'bg-wash text-navy border border-navy' },
  approved: { label: 'Approved', cls: 'bg-wash text-navy border border-navy' },
  rejected: { label: 'Rejected', cls: 'bg-red-wash text-accent' },
};

export default function TripReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<Detail | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.get<Detail>('/trips/' + id + '/detail')
      .then((r) => { setT(r); setMissing(false); })
      .catch(() => setMissing(true));
    api.get<{ points: Pt[] }>('/trips/' + id + '/path').then((r) => setPts(r.points || [])).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not do that'); }
    setBusy(false);
  }
  const approve = () => act(() => api.post('/trips/' + id + '/review', { approve: true }));
  const reject = () => {
    const note = window.prompt('Reject this trip — reason (the technician sees this):');
    if (note == null || !note.trim()) return;
    return act(() => api.post('/trips/' + id + '/review', { approve: false, note: note.trim() }));
  };
  const cancel = () => {
    const note = window.prompt('Cancel this running trip — message to the technician:', 'Cancelled by the office');
    if (note == null) return;
    return act(() => api.post('/trips/' + id + '/cancel', { note: note.trim() }));
  };

  if (missing) return (
    <div className="p-10 text-center">
      <p className="text-[14px] font-semibold">No such trip</p>
      <Link href="/trips" className="text-[13px] text-accent font-medium">← Trips dashboard</Link>
    </div>
  );
  if (!t) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const st = t.status === 'active' ? STATE.active : t.status === 'cancelled' ? STATE.cancelled : (STATE[t.review] || STATE.auto);
  const decidable = t.canManage && t.status !== 'active' && t.review === 'pending' && !t.claimId;

  return (
    <div className="p-4 lg:p-6 max-w-[980px]">
      <Link href="/trips" className="text-[12.5px] text-muted hover:text-ink">← Trips dashboard</Link>

      <div className="mt-2 mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[20px] font-semibold">{t.id}</h1>
            <span className={'inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ' + st.cls}>{st.label}</span>
          </div>
          <p className="text-muted text-[12.5px] mt-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-[9.5px] font-bold"
              style={{ background: t.userColor }}>{initials(t.userName)}</span>
            {t.userName} · {day(t.startAt)} · {clock(t.startAt)}–{clock(t.endAt)} · {t.purpose || 'Trip'}
          </p>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 items-start">
        {/* map */}
        <div className="card overflow-hidden">
          <TripMap pts={pts} planned={t.plannedM} driven={t.distanceM} start={t.startPlace} end={t.endPlace || t.dest} />
        </div>

        {/* facts + actions */}
        <div>
          <div className="card px-4 py-1">
            {[
              ['Started', (t.startPlace || '—') + ' · ' + clock(t.startAt)],
              ['Ended', (t.endPlace || t.dest || '—') + ' · ' + clock(t.endAt)],
              ['Distance driven', km(t.distanceM), t.flagged],
              ['Shortest route', t.plannedM ? km(t.plannedM) : 'not available'],
              ['Duration', dur(t.mins)],
              ['Cost @ ' + money(t.rate) + '/km', money(t.cost)],
            ].map(([k, v, warn]) => (
              <div key={k as string} className="flex items-center justify-between py-2.5 border-b border-line-soft last:border-0">
                <span className="text-[12px] text-muted">{k}</span>
                <span className={'text-[13px] font-semibold num ' + (warn ? 'text-amber-ink' : '')}>{v}</span>
              </div>
            ))}
          </div>

          {t.flagged && t.flagReason && (
            <div className="mt-3 rounded-md border border-amber-ink/25 bg-amber px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-ink">Why it's flagged</p>
              <p className="text-[12.5px] text-ink-2 mt-0.5">{t.flagReason} Worth a look before it's paid.</p>
            </div>
          )}
          {t.review === 'rejected' && t.reviewNote && (
            <div className="mt-3 rounded-md border border-red-line bg-red-wash px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-accent">Rejected</p>
              <p className="text-[12.5px] text-ink-2 mt-0.5">{t.reviewNote}</p>
            </div>
          )}
          {t.claimId && (
            <p className="mt-3 text-[12px] text-muted">
              On claim <Link href={'/expenses/' + t.claimId} className="text-accent font-semibold">{t.claimId}</Link> — decide it there.
            </p>
          )}

          {t.canManage && t.status === 'active' && (
            <button disabled={busy} onClick={cancel}
              className="mt-3 w-full h-10 rounded border border-red-line text-accent text-[13px] font-semibold hover:bg-red-wash">
              Cancel this running trip
            </button>
          )}
          {decidable && (
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={approve}
                className="flex-1 h-10 rounded bg-navy text-white text-[13px] font-bold hover:brightness-110">
                Approve · {money(t.cost)}
              </button>
              <button disabled={busy} onClick={reject}
                className="flex-1 h-10 rounded border border-red-line text-accent text-[13px] font-semibold hover:bg-red-wash">
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------- the breadcrumb, as a mini map */
function TripMap({ pts, planned, driven, start, end }: {
  pts: Pt[]; planned: number; driven: number; start: string; end: string;
}) {
  const W = 560, H = 300, PAD = 26;
  if (pts.length < 2) {
    return (
      <div className="h-[300px] flex items-center justify-center text-[12.5px] text-muted bg-wash">
        No GPS trail recorded for this trip.
      </div>
    );
  }
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-4, spanLng = maxLng - minLng || 1e-4;
  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (W - PAD * 2);
  const y = (lat: number) => H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);
  const dpath = pts.map((p, i) => (i ? 'L' : 'M') + x(p.lng).toFixed(1) + ' ' + y(p.lat).toFixed(1)).join(' ');
  const a = pts[0], b = pts[pts.length - 1];

  return (
    <div className="relative">
      <span className="absolute top-2.5 left-2.5 z-10 bg-white border border-line rounded-md text-[10.5px] font-semibold text-ink-2 px-2.5 py-1 num">
        {planned ? 'Planned ' + (planned / 1000).toFixed(1) + ' km · ' : ''}Driven {(driven / 1000).toFixed(1)} km
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="300" preserveAspectRatio="xMidYMid slice" aria-label="Trip route">
        <rect width={W} height={H} fill="#eef0ee" />
        <g stroke="#dfe3df" strokeWidth="1">
          <path d={`M0 ${H*0.33}H${W}M0 ${H*0.66}H${W}`} /><path d={`M${W*0.33} 0V${H}M${W*0.66} 0V${H}`} />
        </g>
        <path d={dpath} fill="none" stroke="#FF0000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(a.lng)} cy={y(a.lat)} r="7" fill="#141414" />
        <circle cx={x(b.lng)} cy={y(b.lat)} r="7" fill="#FF0000" />
      </svg>
      <div className="flex items-center justify-between px-3 py-2 text-[11.5px] border-t border-line-soft">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-navy inline-block" />{start || 'Start'}</span>
        <span className="flex items-center gap-1.5">{end || 'End'}<span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" /></span>
      </div>
    </div>
  );
}
