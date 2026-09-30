'use client';

/* ============================================================================
   One trip, in full.

   For the person who made it: where did I go, and what was recorded. For the
   office: which road was taken, was it the planned one, how much was on
   foot, where were the stops, and how much of it did the phone actually see.

   The map carries the route; the findings beside it say the same thing in
   sentences; the numbers are the ones the allowance is paid on. All three
   come from one reading of the trip on the server (trips/analysis.ts), so
   they cannot disagree.

   The office approves or rejects a flagged trip here, and can end one that
   is still running. A running trip redraws itself as the phone reports.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { initials } from '../../contracts/lib';
import { ROUTE_COLOURS, type PathPt, type StopPt } from './route-map';

// The map library is heavy and the key is fetched first: loaded only here.
const RouteMap = dynamic(() => import('./route-map'), { ssr: false });

interface Check { tone: 'good' | 'warn' | 'bad' | 'plain'; text: string }
interface Stats {
  fixes: number; measuredM: number; estimatedM: number; driveM: number; walkM: number;
  offRouteM: number; judgedM: number; onRoutePct: number | null; maxOffM: number;
  gaps: number; gapS: number; stoppedS: number; movingS: number; maxKmh: number; avgKmh: number;
  endToDestM: number | null; reached: boolean | null;
}
interface Detail {
  id: string; userId: string; userName: string; userColor: string; userRole?: string;
  purpose: string; status: string; review: string; flagged: boolean; flagReason: string;
  startPlace: string; endPlace: string; dest: string;
  distanceM: number; plannedM: number; estM?: number; cost: number; rate: number; mins: number;
  reviewNote: string; claimId: string; points: number;
  startAt: string; endAt: string | null; canManage: boolean; mine?: boolean;
  path?: PathPt[]; planned?: Array<[number, number]>; destAt?: { lat: number; lng: number } | null;
  stops?: StopPt[]; stats?: Stats; checks?: Check[];
}

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const km = (m: number) => (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
const dur = (m: number) => m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
const clock = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const STATE: Record<string, { label: string; cls: string }> = {
  active: { label: 'On the road', cls: 'bg-navy text-white' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-wash text-accent' },
  pending: { label: 'Needs review', cls: 'bg-amber text-amber-ink' },
  auto: { label: 'Approved', cls: 'bg-mint text-mint-ink' },
  approved: { label: 'Approved', cls: 'bg-mint text-mint-ink' },
  rejected: { label: 'Rejected', cls: 'bg-red-wash text-accent' },
};
const ROLE: Record<string, string> = {
  sales: 'Sales', tech: 'Technician', senior_tech: 'Senior technician', ops: 'Operations',
  admin: 'Admin', accounts: 'Accounts',
};
const TONE: Record<Check['tone'], { dot: string; text: string }> = {
  good: { dot: 'bg-mint-ink', text: 'text-ink' },
  warn: { dot: 'bg-amber-ink', text: 'text-ink' },
  bad: { dot: 'bg-accent', text: 'text-ink' },
  plain: { dot: 'bg-muted-2', text: 'text-ink-2' },
};

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [olaKey, setOlaKey] = useState<string | null>(null); // null = not known yet, '' = not connected

  const load = useCallback(() => {
    api.get<Detail>('/trips/' + id + '/detail')
      .then((r) => { setT(r); setMissing(false); })
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get<{ ola: boolean }>('/org/integrations')
      .then((r) => (r.ola ? api.get<{ key: string }>('/org/integrations/ola').then((k) => setOlaKey(k.key || '')) : setOlaKey('')))
      .catch(() => setOlaKey(''));
  }, []);

  // A running trip keeps reporting: read it again every fifteen seconds.
  const running = t?.status === 'active';
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [running, load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not do that'); }
    setBusy(false);
  }
  const approve = () => act(() => api.post('/trips/' + id + '/review', { approve: true }));
  const reject = () => {
    const note = window.prompt('Reject this trip — reason (the person who made it sees this):');
    if (note == null || !note.trim()) return;
    return act(() => api.post('/trips/' + id + '/review', { approve: false, note: note.trim() }));
  };
  const cancel = () => {
    const note = window.prompt('Cancel this running trip — message to the person on it:', 'Cancelled by the office');
    if (note == null) return;
    return act(() => api.post('/trips/' + id + '/cancel', { note: note.trim() }));
  };

  if (missing) return (
    <div className="p-10 text-center">
      <p className="text-[14px] font-semibold">No such trip</p>
      <Link href="/trip" className="text-[13px] text-accent font-medium">← My trips</Link>
    </div>
  );
  if (!t) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const st = t.status === 'active' ? STATE.active : t.status === 'cancelled' ? STATE.cancelled : (STATE[t.review] || STATE.auto);
  const decidable = t.canManage && t.status !== 'active' && t.review === 'pending' && !t.claimId;
  const path = t.path || [];
  const planned = t.planned || [];
  const stops = t.stops || [];
  const s = t.stats;
  const hasTrail = path.filter((p) => !p.e).length >= 2;
  const estM = t.estM || 0;
  // The office came from its dashboard; the person who drove it, from their own list.
  const back = t.canManage && !t.mine ? { href: '/trips', label: 'Trips dashboard' } : { href: '/trip', label: 'My trips' };
  const diff = t.plannedM > 0 ? t.distanceM - t.plannedM : 0;

  const tiles: Array<{ l: string; v: string; sub: string; tone?: 'warn' | 'bad' | 'good' }> = [
    {
      l: 'Distance', v: km(t.distanceM),
      sub: estM > 0 ? km(estM) + ' of it estimated' : hasTrail ? 'measured by GPS' : 'nothing recorded',
      tone: estM > t.distanceM * 0.5 && estM > 0 ? 'warn' : undefined,
    },
    {
      l: 'Shortest route', v: t.plannedM ? km(t.plannedM) : '—',
      sub: !t.plannedM ? 'no route to compare'
        : Math.abs(diff) < 300 ? 'same as driven'
        : (diff > 0 ? km(diff) + ' more driven' : km(-diff) + ' less driven'),
      tone: t.plannedM && diff > t.plannedM * 0.4 + 2000 ? 'bad' : t.plannedM && diff > Math.max(500, t.plannedM * 0.15) ? 'warn' : undefined,
    },
    {
      l: 'On the planned route', v: s && s.onRoutePct !== null && planned.length > 1 ? s.onRoutePct + '%' : '—',
      sub: !s || planned.length < 2 ? 'no route to compare'
        : s.onRoutePct === null ? 'too little recorded'
        : s.offRouteM >= 300 ? km(s.offRouteM) + ' on another road'
        // Only what the phone saw can be judged: say how much that was.
        : estM > 0 && s.judgedM < t.distanceM * 0.8 ? 'of the ' + km(s.judgedM) + ' the GPS saw'
        : 'followed it',
      tone: s && s.onRoutePct !== null && planned.length > 1
        ? (s.onRoutePct < 60 ? 'bad' : s.onRoutePct < 90 && s.offRouteM >= 300 ? 'warn'
          : estM > 0 && s.judgedM < t.distanceM * 0.8 ? undefined : 'good') : undefined,
    },
    { l: 'On foot', v: s ? km(s.walkM) : '—', sub: 'under 7 km/h' },
    {
      l: 'Stops', v: String(stops.length),
      sub: stops.length ? stops.reduce((a, x) => a + x.mins, 0) + ' min stopped' : 'none of 3 min or more',
    },
    {
      l: 'Duration', v: dur(t.mins),
      sub: s && s.avgKmh ? 'avg ' + s.avgKmh + ' km/h · top ' + s.maxKmh : running ? 'still running' : 'start to end',
    },
  ];
  const toneCls = { warn: 'text-amber-ink', bad: 'text-accent', good: 'text-mint-ink' };

  return (
    <div className="p-4 lg:p-6 max-w-[1320px] max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]" data-trip-detail>
      <Link href={back.href} className="text-[12.5px] text-muted hover:text-ink">← {back.label}</Link>

      <div className="mt-2 mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[20px] lg:text-2xl font-bold tracking-tight">{t.purpose || 'Trip'}</h1>
            <span className={'inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ' + st.cls}>{st.label}</span>
            {running && <span className="text-[11.5px] font-semibold text-navy">updates every 15 s</span>}
          </div>
          <p className="text-muted text-[12.5px] mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-[11px] font-bold shrink-0"
              style={{ background: t.userColor }}>{initials(t.userName)}</span>
            <span className="font-semibold text-ink-2">{t.userName}</span>
            {t.userRole && <span>· {ROLE[t.userRole] || t.userRole}</span>}
            <span>· {t.id}</span>
            <span>· {day(t.startAt)}, {clock(t.startAt)} – {running ? 'now' : clock(t.endAt)}</span>
          </p>
        </div>
        {t.canManage && (
          <div className="flex gap-2 max-lg:w-full">
            {t.status === 'active' && (
              <button disabled={busy} onClick={cancel}
                className="h-10 lg:h-9 px-4 rounded border border-red-line text-accent text-[13px] font-semibold hover:bg-red-wash max-lg:flex-1">
                Cancel this running trip
              </button>
            )}
            {decidable && (
              <>
                <button disabled={busy} onClick={approve}
                  className="h-10 lg:h-9 px-4 rounded bg-navy text-white text-[13px] font-bold hover:brightness-110 max-lg:flex-1">
                  Approve · {money(t.cost)}
                </button>
                <button disabled={busy} onClick={reject}
                  className="h-10 lg:h-9 px-4 rounded border border-red-line text-accent text-[13px] font-semibold hover:bg-red-wash max-lg:flex-1">
                  Reject
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      {/* ------------------------------------------------ the trip in six numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4" data-trip-stats>
        {tiles.map((x) => (
          <div key={x.l} className="card px-4 py-3">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{x.l}</p>
            <p className={'text-[20px] font-bold tracking-tight tabular-nums mt-0.5 ' + (x.tone ? toneCls[x.tone] : '')}>{x.v}</p>
            <p className="text-[11.5px] text-muted-2 mt-0.5">{x.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        {/* ------------------------------------------------------------ the map */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="card overflow-hidden">
            {!hasTrail && planned.length < 2 ? (
              <div className="h-[300px] flex flex-col items-center justify-center text-center px-6 bg-wash" data-no-trail>
                <span className="w-12 h-12 rounded-2xl bg-white text-muted flex items-center justify-center mb-3">
                  <Icon name="road" size={20} />
                </span>
                <p className="text-[14px] font-semibold">No route was recorded for this trip</p>
                <p className="text-[12.5px] text-muted mt-1 max-w-[420px] leading-relaxed">
                  {t.points === 0 ? 'The phone sent no GPS position.' : 'The phone sent a single GPS position.'}{' '}
                  The route is recorded only while the app is open on the phone&rsquo;s screen with Location allowed.
                </p>
              </div>
            ) : olaKey === null ? (
              <div className="h-[460px] max-lg:h-[320px] flex items-center justify-center text-muted text-[13px] bg-wash">Loading the map…</div>
            ) : olaKey ? (
              <RouteMap olaKey={olaKey} path={path} planned={planned} dest={t.destAt || null}
                stops={stops} live={running} startLabel={t.startPlace} endLabel={t.endPlace || t.dest}
                heightClass="h-[320px] lg:h-[480px]"
                fallback={<Sketch path={path} planned={planned} why="The street map could not be loaded on this device, so the route is drawn on its own." />} />
            ) : (
              <Sketch path={path} planned={planned}
                why="The street map is not connected (Settings → Integrations → Ola Maps), so the route is drawn on its own." />
            )}
            {(hasTrail || planned.length > 1) && (
              <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 py-2.5 border-t border-line-soft text-[11.5px] text-ink-2" data-legend>
                {([
                  [ROUTE_COLOURS.planned, 'Shortest route', 'band'],
                  [ROUTE_COLOURS.drive, 'Driven on it', 'line'],
                  [ROUTE_COLOURS.off, 'Driven on another road', 'line'],
                  [ROUTE_COLOURS.walk, 'On foot', 'dots'],
                  [ROUTE_COLOURS.est, 'Not seen by GPS (estimated)', 'dash'],
                ] as Array<[string, string, string]>).map(([c, l, kind]) => (
                  <span key={l} className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="inline-block w-6 shrink-0" style={kind === 'band'
                      ? { height: 7, borderRadius: 4, background: c, opacity: 0.45 }
                      : { height: 0, borderTop: '3px ' + (kind === 'line' ? 'solid' : kind === 'dots' ? 'dotted' : 'dashed') + ' ' + c }} />
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------ the stops */}
          <div className="card" data-timeline>
            <h2 className="text-[13px] font-semibold px-4 py-3 border-b border-line-soft">The trip, in order</h2>
            <ol className="px-4 py-3 flex flex-col gap-0">
              <Step dot="bg-navy" title={'Started ' + clock(t.startAt)} sub={t.startPlace || (path[0] ? coord(path[0]) : 'no position recorded')}
                at={path[0]} />
              {stops.map((x, i) => (
                <Step key={i} dot="bg-amber-ink" title={'Stop ' + (i + 1) + ' · ' + x.mins + ' min'}
                  sub={'from ' + clock(x.at)} at={x} />
              ))}
              {s && s.gaps > 0 && (
                <Step dot="bg-muted-2" title={'GPS silent ' + s.gaps + (s.gaps === 1 ? ' time' : ' times') + ' · ' + Math.round(s.gapS / 60) + ' min'}
                  sub={km(estM) + ' bridged along the road map — the road actually taken there is not known'} />
              )}
              <Step dot={running ? 'bg-sky-ink' : 'bg-accent'} last
                title={running ? 'On the road now' : t.status === 'cancelled' ? 'Cancelled ' + clock(t.endAt) : 'Ended ' + clock(t.endAt)}
                sub={(t.endPlace || t.dest || '—')
                  + (s && s.endToDestM !== null && !running
                    ? (s.reached ? ' · at the destination' : ' · ' + (s.endToDestM >= 1000 ? km(s.endToDestM) : s.endToDestM + ' m') + ' from the destination')
                    : '')}
                at={path.length ? path[path.length - 1] : undefined} />
            </ol>
          </div>
        </div>

        {/* ------------------------------------------------- findings + money */}
        <div className="flex flex-col gap-4">
          <div className="card p-4" data-route-check>
            <h2 className="text-[13px] font-semibold mb-3">Route check</h2>
            <ul className="flex flex-col gap-2.5">
              {(t.checks || []).map((c, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={'w-2 h-2 rounded-full mt-[6px] shrink-0 ' + TONE[c.tone].dot} />
                  <span className={'text-[12.5px] leading-relaxed ' + TONE[c.tone].text}>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {t.flagged && t.flagReason && (
            <div className="rounded-md border border-amber-ink/25 bg-amber px-3.5 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-ink">Why it is waiting for review</p>
              <p className="text-[12.5px] text-ink-2 mt-1 leading-relaxed">{t.flagReason}</p>
            </div>
          )}
          {t.review === 'rejected' && t.reviewNote && (
            <div className="rounded-md border border-red-line bg-red-wash px-3.5 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-accent">Rejected</p>
              <p className="text-[12.5px] text-ink-2 mt-1">{t.reviewNote}</p>
            </div>
          )}

          <div className="card px-4 py-1">
            {([
              ['From', t.startPlace || (path[0] ? coord(path[0]) : '—')],
              ['To', t.dest || t.endPlace || '—'],
              ['GPS positions', String(s?.fixes ?? t.points)],
              ['Measured by GPS', s ? km(s.measuredM) : km(t.distanceM - estM)],
              ['Estimated', estM > 0 ? km(estM) : 'none'],
              ['Allowance @ ' + money(t.rate) + '/km', money(t.cost)],
            ] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-2.5 border-b border-line-soft last:border-0">
                <span className="text-[12px] text-muted shrink-0">{k}</span>
                <span className="text-[13px] font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>
          {t.claimId && (
            <p className="text-[12px] text-muted">
              On expense report <Link href={'/expenses/' + t.claimId} className="text-accent font-semibold">{t.claimId}</Link>
              {t.canManage ? ' — decide it there.' : '.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const coord = (p: { lat: number; lng: number }) => p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);

/** One line of the trip's story, with its place openable in a maps app. */
function Step({ dot, title, sub, at, last }: {
  dot: string; title: string; sub: string; at?: { lat: number; lng: number }; last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center shrink-0">
        <span className={'w-3 h-3 rounded-full mt-1 ' + dot} />
        {!last && <span className="w-px flex-1 bg-line my-1" />}
      </span>
      <span className={'min-w-0 flex-1 ' + (last ? '' : 'pb-3.5')}>
        <span className="block text-[13px] font-semibold leading-snug">{title}</span>
        <span className="block text-[12px] text-muted leading-snug mt-0.5">{sub}</span>
        {at && (
          <a href={'https://www.google.com/maps?q=' + at.lat + ',' + at.lng} target="_blank" rel="noreferrer"
            className="inline-block text-[11.5px] font-semibold text-navy hover:text-accent mt-0.5">
            {coord(at)} ↗
          </a>
        )}
      </span>
    </li>
  );
}

/* The route without a street map under it - what shows when no map key is
   connected. The same colours, so the legend still reads. */
function Sketch({ path, planned, why }: { path: PathPt[]; planned: Array<[number, number]>; why: string }) {
  const W = 760, H = 380, PAD = 28;
  const all: Array<[number, number]> = [...planned, ...path.map((p) => [p.lng, p.lat] as [number, number])];
  if (all.length < 2) return <div className="h-[300px] bg-wash" />;
  const lngs = all.map((p) => p[0]); const lats = all.map((p) => p[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1e-4, spanLat = maxLat - minLat || 1e-4;
  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (W - PAD * 2);
  const y = (lat: number) => H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);
  const colour = (p: PathPt) => (p.k === 'g' || p.e ? ROUTE_COLOURS.est : p.k === 'w' ? ROUTE_COLOURS.walk : p.o ? ROUTE_COLOURS.off : ROUTE_COLOURS.drive);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="380" preserveAspectRatio="xMidYMid meet" aria-label="Trip route" data-route-sketch>
        <rect width={W} height={H} fill="#eef0ee" />
        {planned.length > 1 && (
          <path d={planned.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ')}
            fill="none" stroke={ROUTE_COLOURS.planned} strokeOpacity="0.4" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {path.slice(1).map((p, i) => (
          <line key={i} x1={x(path[i].lng)} y1={y(path[i].lat)} x2={x(p.lng)} y2={y(p.lat)}
            stroke={colour(p)} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={p.k === 'g' || p.e ? '6 5' : p.k === 'w' ? '1 6' : undefined} />
        ))}
        {path.length > 0 && <circle cx={x(path[0].lng)} cy={y(path[0].lat)} r="7" fill="#141414" stroke="#fff" strokeWidth="2" />}
        {path.length > 1 && <circle cx={x(path[path.length - 1].lng)} cy={y(path[path.length - 1].lat)} r="7" fill="#FF0000" stroke="#fff" strokeWidth="2" />}
      </svg>
      <p className="px-4 py-2 text-[11.5px] text-muted border-t border-line-soft">
        {why}
      </p>
    </div>
  );
}
