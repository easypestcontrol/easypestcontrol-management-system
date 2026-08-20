'use client';

/* ============================================================================
   Trips — two ways onto the road:
   1. Today's services: every service scheduled for me today is a one-tap
      trip starter, destination already set to the customer's site.
   2. Add trip: going somewhere else (material pickup, bank, office…) —
      pick the purpose, pick or type the location, go.
   Either way the GPS breadcrumbs the route and the distance is what was
   actually driven — segment by segment, never a straight line.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { decodePolyline } from '@/lib/polyline';
import { getPosition, geoHint } from '@/lib/geo';

// The Ola map is loaded only when the user asks for it — never in the background.
const TripMap = dynamic(() => import('./trip-map'), { ssr: false });
// The same turn-by-turn sheet the service page uses — one implementation.
const NavigateSheet = dynamic(() => import('@/components/navigate-sheet'), { ssr: false });

interface Trip {
  id: string; userId: string; userName?: string; purpose: string; jobId: string;
  dest: string; status: string; startAt: string; endAt: string | null;
  distanceM: number; mins: number; points: number;
  last: { lat: number; lng: number; t: string } | null;
}
interface TodaySvc { jobId: string; slot: string; client: string; dest: string; services: string }
interface Place { id: string; name: string; dest: string }

const PURPOSES = [
  'Service visit', 'Inspection', 'Material pickup', 'Office',
  'Bank', 'Customer meeting', 'Other',
];

const km = (m: number) => (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
const dur = (mins: number) => mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
const when = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};
const hhmm = (t: string) => {
  const p = t.split(':').map(Number);
  const h = p[0] % 12 || 12;
  return h + ':' + String(p[1] || 0).padStart(2, '0') + ' ' + (p[0] < 12 ? 'AM' : 'PM');
};

export default function TripPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [active, setActive] = useState<Trip | null>(null);
  const [rows, setRows] = useState<Trip[] | null>(null);
  const [today, setToday] = useState<TodaySvc[] | null>(null);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [gpsState, setGpsState] = useState<'idle' | 'on' | 'denied'>('idle');
  const [olaOn, setOlaOn] = useState(false);
  const [olaKey, setOlaKey] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [mapPath, setMapPath] = useState<Array<{ lat: number; lng: number; t: string }>>([]);
  const [destLL, setDestLL] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [road, setRoad] = useState<{ km: string; mins: number } | null>(null);
  const [roadBusy, setRoadBusy] = useState(false);
  const [roadErr, setRoadErr] = useState('');
  const [routeLine, setRouteLine] = useState<Array<[number, number]>>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [mapKey, setMapKey] = useState(0);

  const load = useCallback((showAll: boolean) => {
    api.get<Trip[]>('/trips' + (showAll ? '?all=1' : '')).then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
    api.get<Trip | null>('/trips/active').then(setActive).catch(() => {});
    api.get<TodaySvc[]>('/trips/today-services').then(setToday).catch(() => setToday([]));
    api.get<{ ola: boolean }>('/org/integrations').then((r) => {
      setOlaOn(r.ola);
      if (r.ola) api.get<{ key: string }>('/org/integrations/ola').then((k) => setOlaKey(k.key)).catch(() => {});
    }).catch(() => {});
    load(false);
    // The app-wide tracker (mounted in the layout) does the pinging from any
    // page; this screen just listens and repaints the numbers.
    const onTick = (e: Event) => {
      const d = (e as CustomEvent).detail as { distanceM: number; points: number };
      setGpsState('on');
      setActive((t) => (t ? { ...t, distanceM: d.distanceM, points: d.points } : t));
    };
    const onDenied = () => setGpsState('denied');
    window.addEventListener('trip:tick', onTick);
    window.addEventListener('trip:gps-denied', onDenied);
    return () => {
      window.removeEventListener('trip:tick', onTick);
      window.removeEventListener('trip:gps-denied', onDenied);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startTrip(purpose: string, dest: string, jobId = '') {
    await api.post<{ id: string }>('/trips', { purpose, dest, jobId });
    const fresh = await api.get<Trip | null>('/trips/active');
    setActive(fresh);
    window.dispatchEvent(new Event('trip:changed')); // the tracker starts pinging
  }

  /** Where the trip is headed, geocoded ONCE and cached for this trip. */
  async function destCoords(): Promise<{ lat: number; lng: number; label: string } | null> {
    if (!active?.dest) return null;
    if (destLL) return destLL;
    const g = await api.get<{ found: boolean; lat: number; lng: number; formatted: string }>(
      '/trips/geocode?q=' + encodeURIComponent(active.dest));
    if (!g.found) return null;
    const d = { lat: g.lat, lng: g.lng, label: active.dest };
    setDestLL(d);
    return d;
  }

  /**
   * One tap: geocode the destination (cached), read my GPS once, fetch the
   * road route ONCE, pull my breadcrumbs, and open the Ola map with all of
   * it drawn. Refreshing repeats the route call only when tapped — never
   * on a timer.
   */
  async function openRoute() {
    if (!active) return;
    setRoadBusy(true); setRoadErr('');
    try {
      const d = await destCoords().catch(() => null);
      try {
        const p = await api.get<{ points: Array<{ lat: number; lng: number; t: string }> }>(
          '/trips/' + active.id + '/path');
        setMapPath(p.points);
      } catch { setMapPath([]); }
      let h: { lat: number; lng: number } | null = null;
      try {
        const pos = await getPosition();
        h = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setHere(h);
      } catch (e) {
        setRoadErr(geoHint(e, 'Could not read your GPS — showing the map without your position'));
      }
      if (d && h) {
        const r = await api.get<{ distanceM: number; durationS: number; polyline: string }>(
          '/trips/route?from=' + h.lat + ',' + h.lng + '&to=' + d.lat + ',' + d.lng);
        setRoad({ km: (r.distanceM / 1000).toFixed(1), mins: Math.max(1, Math.round(r.durationS / 60)) });
        setRouteLine(r.polyline ? decodePolyline(r.polyline) : []);
      } else if (!d && active.dest) {
        setRoadErr('Ola could not place "' + active.dest + '" on the map — check the address');
      }
      setShowMap(true);
      setMapKey((v) => v + 1); // remount so every layer redraws with fresh data
    } catch (e) {
      setRoadErr(e instanceof Error ? e.message : 'Could not load the route');
    }
    setRoadBusy(false);
  }

  async function end() {
    if (!active) return;
    try {
      await api.post('/trips/' + active.id + '/end', {});
      setActive(null);
      setGpsState('idle');
      setShowMap(false); setDestLL(null); setRoad(null); setRoadErr('');
      setRouteLine([]); setHere(null);
      window.dispatchEvent(new Event('trip:changed')); // the tracker stops
      load(all);
    } catch { /* stays active */ }
  }

  const canSeeAll = !!me && ['admin', 'ops'].includes(me.role);

  return (
    <div className="p-4 lg:p-6 max-w-[860px]">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Trips</h1>
          <p className="text-muted text-[13px] mt-0.5 mb-5">
            Tap a service to drive to it, or add your own trip — the distance is the road you actually take.
          </p>
        </div>
        {!active && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 h-11 lg:h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> Add trip
          </button>
        )}
      </div>

      {/* ------------------------------------------------------ active trip */}
      {active && (
        <section className="rounded-md border-2 border-navy p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="zpill navy">On the road</span>
              <p className="text-[14px] font-semibold mt-2">{active.purpose}</p>
              {active.dest && (
                <p className="text-[12.5px] text-ink-2 mt-0.5">→ {active.dest}</p>
              )}
              <p className="text-[12px] text-muted mt-0.5">
                Started {when(active.startAt)} · {active.points} GPS points
                {gpsState === 'on' && <span className="text-navy font-medium"> · GPS live</span>}
                {gpsState === 'idle' && <span className="text-muted"> · waiting for GPS…</span>}
                {gpsState === 'denied' && (
                  <span className="text-accent font-medium"> · GPS blocked — allow location for this site</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <span className="block text-[30px] font-bold text-navy leading-none">{km(active.distanceM)}</span>
              <span className="block text-[11.5px] text-muted mt-1">{dur(active.mins)} on the move</span>
            </div>
          </div>
          {road && (
            <p className="text-[13px] font-semibold text-navy mt-2">
              By road: {road.km} km · about {road.mins} min <span className="text-muted font-normal">(Ola Maps)</span>
            </p>
          )}
          {roadErr && <p className="text-[12px] text-accent mt-2">{roadErr}</p>}
          {/* Directions leads. Someone reading this screen is in a vehicle, and
              the one thing they want is the next turn — not the map preview,
              and certainly not the button that ends the trip, which used to be
              the loudest thing here. */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {olaOn && active.dest && (
              <button onClick={() => setNavOpen(true)}
                className="h-12 lg:h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold
                  hover:brightness-90 flex items-center justify-center gap-1.5 max-lg:w-full">
                <Icon name="branch" size={15} /> Directions
              </button>
            )}
            {olaOn && (
              <button onClick={openRoute} disabled={roadBusy}
                className="h-12 lg:h-9 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash disabled:opacity-60">
                {roadBusy ? 'Loading route…' : showMap ? 'Refresh route & map' : 'Preview on map'}
              </button>
            )}
            <button onClick={end}
              className="h-12 lg:h-9 px-5 rounded border border-line text-accent text-[13px] font-semibold hover:bg-red-wash">
              End trip
            </button>
          </div>
          {showMap && olaKey && (
            <div className="mt-4">
              <TripMap key={mapKey} olaKey={olaKey} path={mapPath} here={here}
                dest={destLL} route={routeLine} height={400} />
              <p className="text-[11px] text-muted-2 mt-1.5">
                Red line: the road to take · navy line: driven so far · red pin: the destination.
                <button onClick={() => setShowMap(false)} className="ml-2 font-medium text-navy hover:text-accent">
                  Hide map
                </button>
              </p>
            </div>
          )}
          {navOpen && active.dest && (
            <NavigateSheet destText={active.dest} title={active.purpose || 'Navigate'}
              onClose={() => setNavOpen(false)} />
          )}

          {!olaOn && (
            <p className="text-[11.5px] text-muted-2 mt-3">
              Route and distance are recorded either way. Connect the Ola Maps key in
              Settings → Integrations and this card also shows the live map.
            </p>
          )}
        </section>
      )}

      {/* ----------------------------------------- 1. today's services */}
      {!active && today && today.length > 0 && (
        <section className="rounded-md border border-line mb-5 overflow-hidden">
          <h2 className="px-4 py-3 text-[13px] font-semibold border-b border-line-soft">
            Today&rsquo;s services — tap to start the trip
          </h2>
          {today.map((svc) => (
            <div key={svc.jobId}
              className="flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-0">
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">
                  {svc.client} <span className="text-muted font-normal">· {hhmm(svc.slot)}</span>
                </span>
                <span className="block text-[12px] text-muted truncate">
                  {svc.services} · {svc.dest || 'no address on file'}
                </span>
              </span>
              <button
                onClick={() => startTrip('Service ' + svc.jobId + ' — ' + svc.client, svc.dest, svc.jobId)}
                className="h-9 px-4 rounded bg-navy text-white text-[12.5px] font-semibold hover:brightness-110 shrink-0">
                Start trip
              </button>
            </div>
          ))}
        </section>
      )}
      {!active && today && today.length === 0 && (
        <p className="text-[12.5px] text-muted mb-5">
          No services scheduled for you today — going somewhere else? Use <b>Add trip</b>.
        </p>
      )}

      {/* --------------------------------------------------------- history */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13.5px] font-semibold">{all ? 'Everyone’s trips' : 'My trips'}</h2>
        {canSeeAll && (
          <button onClick={() => { setAll(!all); load(!all); }}
            className="text-[12px] font-medium text-navy hover:text-accent">
            {all ? 'Show only mine' : 'Show everyone'}
          </button>
        )}
      </div>
      <section className="rounded-md border border-line overflow-hidden">
        {/* phones: trip cards */}
        <div className="lg:hidden flex flex-col divide-y divide-line-soft">
          {!rows ? (
            <p className="text-muted text-[13px] px-4 py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted text-[13px] px-4 py-6 text-center">
              No trips yet — the first one starts above.
            </p>
          ) : rows.map((t) => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold truncate">{t.purpose}</span>
                <span className="text-[14px] font-bold text-navy shrink-0">{km(t.distanceM)}</span>
              </div>
              {t.dest && <p className="text-[11.5px] text-muted truncate mt-0.5">→ {t.dest}</p>}
              <p className="text-[11px] text-muted-2 mt-1">
                {all && t.userName ? t.userName + ' · ' : ''}{when(t.startAt)} ·{' '}
                {t.status === 'active' ? 'live now' : dur(t.mins)}
              </p>
            </div>
          ))}
        </div>

        <table className="ztable max-lg:hidden">
          <thead><tr>
            <th>Trip</th>{all && <th>Person</th>}<th>Purpose</th><th>Started</th>
            <th className="text-right">Distance</th><th className="text-right">Duration</th>
          </tr></thead>
          <tbody>
            {!rows ? (
              <tr><td colSpan={all ? 6 : 5} className="text-center text-muted py-6">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={all ? 6 : 5} className="text-center text-muted py-6">
                No trips yet — the first one starts above.
              </td></tr>
            ) : rows.map((t) => (
              <tr key={t.id}>
                <td className="font-mono text-[12px]">{t.id}</td>
                {all && <td>{t.userName}</td>}
                <td className="max-w-[260px]">
                  <span className="block truncate">{t.purpose}</span>
                  {t.dest && <span className="block text-[11px] text-muted-2 truncate">→ {t.dest}</span>}
                </td>
                <td className="text-[12.5px]">{when(t.startAt)}</td>
                <td className="text-right font-semibold">{km(t.distanceM)}</td>
                <td className="text-right text-[12.5px]">
                  {t.status === 'active' ? <span className="zpill navy">live</span> : dur(t.mins)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {adding && (
        <AddTripDialog
          onClose={() => setAdding(false)}
          onStart={async (purpose, dest) => { setAdding(false); await startTrip(purpose, dest); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- add trip */

function AddTripDialog({ onClose, onStart }: {
  onClose: () => void; onStart: (purpose: string, dest: string) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [note, setNote] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [customDest, setCustomDest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Ola place search — fires ONE call per explicit Search tap, never per key.
  const [found, setFound] = useState<Array<{ label: string }> | null>(null);
  const [searching, setSearching] = useState(false);

  async function searchOla() {
    const q = customDest.trim();
    if (q.length < 3) { setErr('Type at least 3 letters of the place first'); return; }
    setErr(''); setSearching(true); setFound(null);
    try {
      const r = await api.get<{ results: Array<{ label: string }>; reason?: string }>(
        '/trips/search?q=' + encodeURIComponent(q));
      setFound(r.results);
      if (!r.results.length && r.reason) setErr(r.reason);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Search failed'); }
    setSearching(false);
  }

  useEffect(() => {
    api.get<Place[]>('/trips/places').then(setPlaces).catch(() => {});
  }, []);

  async function go() {
    setErr('');
    const picked = places.find((p) => p.id === placeId);
    const dest = placeId === '__other'
      ? customDest.trim()
      : picked ? (picked.dest ? picked.name + ' — ' + picked.dest : picked.name) : '';
    if (!dest) { setErr('Pick where you are going, or type the place'); return; }
    const full = purpose === 'Other'
      ? (note.trim() || 'Trip')
      : purpose + (note.trim() ? ' — ' + note.trim() : '');
    setBusy(true);
    try { await onStart(full, dest); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start'); setBusy(false); }
  }

  const input = 'w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';
  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold">Add trip</h2>
          <button onClick={onClose} className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <label className="block">
            <span className={label}>Purpose *</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={input + ' bg-white'}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>{purpose === 'Other' ? 'What is it? *' : 'Note (optional)'}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={purpose === 'Other' ? 'e.g. Vehicle service' : 'e.g. picking up gel tubes'}
              className={input} />
          </label>
          <label className="block">
            <span className={label}>Where to? *</span>
            <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={input + ' bg-white'}>
              <option value="">Pick a location…</option>
              <option value="__other">Somewhere else — type it below</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.dest ? ' — ' + p.dest : ''}</option>
              ))}
            </select>
          </label>
          {placeId === '__other' && (
            <div className="block">
              <span className={label}>Place / address *</span>
              <div className="flex gap-2">
                <input value={customDest}
                  onChange={(e) => { setCustomDest(e.target.value); setFound(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchOla(); }}
                  placeholder="e.g. HDFC Bank, Anna Nagar" className={input} />
                <button onClick={searchOla} disabled={searching}
                  className="h-10 px-3.5 rounded bg-navy text-white text-[12.5px] font-semibold shrink-0 hover:brightness-110 disabled:opacity-60">
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              {found && found.length > 0 && (
                <div className="mt-2 rounded border border-line divide-y divide-line-soft overflow-hidden">
                  {found.map((f) => (
                    <button key={f.label}
                      onClick={() => { setCustomDest(f.label); setFound(null); }}
                      className={'w-full text-left px-3 py-2.5 text-[12.5px] leading-snug hover:bg-wash active:bg-wash '
                        + (customDest === f.label ? 'font-semibold text-navy' : '')}>
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              {found && found.length === 0 && !err && (
                <p className="text-[11.5px] text-muted mt-1.5">
                  Ola found nothing for that — refine the text, or start with it as typed.
                </p>
              )}
              <p className="text-[11px] text-muted-2 mt-1.5">
                Search finds the exact place on the Ola map, so Route and the road
                distance line up with the real address.
              </p>
            </div>
          )}
          {err && <p className="text-accent text-[12.5px]">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">Cancel</button>
          <button onClick={go} disabled={busy}
            className="h-9 px-4 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-60">
            {busy ? 'Starting…' : 'Start trip'}
          </button>
        </div>
      </div>
    </div>
  );
}
