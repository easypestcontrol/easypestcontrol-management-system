'use client';
/* ============================================================================
   Turn-by-turn navigation, shared.

   Lifted out of the service page so the Trip section uses the same one. Two
   copies of navigation would drift, and the half that drifts is always the one
   somebody is driving at the time.

   The route call returns the steps as well as the line, so following them costs
   no extra request: the phone knows where it is, and stepping to the next
   instruction is local arithmetic. Ola is only called again on a genuine
   re-route.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { getPosition, watchPosition as geoWatch, geoHint, type GeoPos } from '@/lib/geo';
import { api } from '@/lib/api';
import { decodePolyline } from '@/lib/polyline';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';

// The map is client-only — it touches window on mount.
const RouteMap = dynamic(() => import('@/app/(app)/trip/trip-map'), { ssr: false });

function NavigateSheet({ destText, title, onClose }: {
  destText: string; title: string; onClose: () => void;
}) {
  const [olaKey, setOlaKey] = useState('');
  const [destLL, setDestLL] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<Array<[number, number]>>([]);
  const [road, setRoad] = useState<{ km: string; mins: number } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [note, setNote] = useState('');
  const [mapKey, setMapKey] = useState(0); // remount to redraw after refresh
  // ---- turn-by-turn ----
  const [steps, setSteps] = useState<Array<{
    text: string; distanceM: number; durationS: number; maneuver: string; lat: number; lng: number;
  }>>([]);
  const [navOn, setNavOn] = useState(false);
  const [nav, setNav] = useState<{ idx: number; toStepM: number; remainM: number; remainS: number } | null>(null);
  const mapCtl = useRef<{ move: (lat: number, lng: number, follow: boolean) => void } | null>(null);
  const navWatch = useRef<(() => void) | null>(null);
  const navIdx = useRef(0);
  const navLast = useRef(0);

  const position = () => getPosition();

  /** Metres between two coordinates — free local math for step advancing. */
  const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const rad = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(rad(bLat - aLat) / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };

  async function fetchRoute(h: { lat: number; lng: number }, d: { lat: number; lng: number }) {
    const r = await api.get<{ distanceM: number; durationS: number; polyline: string;
      steps: Array<{ text: string; distanceM: number; durationS: number; maneuver: string; lat: number; lng: number }>;
    }>('/trips/route?from=' + h.lat + ',' + h.lng + '&to=' + d.lat + ',' + d.lng);
    setRoad({ km: (r.distanceM / 1000).toFixed(1), mins: Math.max(1, Math.round(r.durationS / 60)) });
    setRoute(r.polyline ? decodePolyline(r.polyline) : []);
    setSteps(r.steps || []);
    navIdx.current = 0;
    setNav(null);
  }

  /**
   * Live guidance: the GPS moves the marker and the camera, advances the
   * instruction as each turn is reached, and recomputes what is left — all
   * local math, ZERO extra Ola calls while driving.
   */
  function startNav() {
    if (navWatch.current !== null) { setNavOn(true); return; }
    setNavOn(true);
    navWatch.current = geoWatch((pos: GeoPos) => {
      const now = Date.now();
      if (now - navLast.current < 3000) return;
      navLast.current = now;
      const la = pos.coords.latitude, ln = pos.coords.longitude;
      mapCtl.current?.move(la, ln, true);
      let i = navIdx.current;
      while (i < steps.length && metres(la, ln, steps[i].lat, steps[i].lng) < 45) i++;
      navIdx.current = i;
      const toStepM = i < steps.length ? Math.round(metres(la, ln, steps[i].lat, steps[i].lng)) : 0;
      const rest = steps.slice(i + 1);
      setNav({
        idx: i,
        toStepM,
        remainM: toStepM + rest.reduce((a, st) => a + st.distanceM, 0),
        remainS: (steps[i]?.durationS || 0) + rest.reduce((a, st) => a + st.durationS, 0),
      });
    }, (msg) => setNote(msg || 'GPS lost — guidance paused'));
  }

  function stopNav() {
    navWatch.current?.();
    navWatch.current = null;
    setNavOn(false);
  }

  useEffect(() => () => stopNav(), []); // leaving the sheet stops guidance

  async function boot() {
    setState('loading'); setNote('');
    try {
      const k = await api.get<{ key: string }>('/org/integrations/ola');
      setOlaKey(k.key);
      const g = await api.get<{ found: boolean; lat: number; lng: number }>(
        '/trips/geocode?q=' + encodeURIComponent(destText));
      if (!g.found) {
        setNote('Ola could not place "' + destText + '" — check the customer\u2019s address.');
        setState('error');
        return;
      }
      const d = { lat: g.lat, lng: g.lng, label: destText };
      setDestLL(d);
      try {
        const pos = await position();
        const h = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setHere(h);
        await fetchRoute(h, d);
      } catch (e) {
        setNote(geoHint(e,
          'Allow location access to see the route from where you are — showing the site for now.'));
      }
      setState('ready');
      setMapKey((v) => v + 1);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not load the map');
      setState('error');
    }
  }

  async function refresh() {
    if (!destLL) return;
    setNote('');
    try {
      const pos = await position();
      const h = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setHere(h);
      await fetchRoute(h, destLL);   // one route call, on demand
      setMapKey((v) => v + 1);
    } catch (e) { setNote(geoHint(e, 'Could not read your GPS position')); }
  }

  useEffect(() => { boot(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="bg-white w-full sm:max-w-[680px] sm:rounded-lg rounded-t-xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line sticky top-0 bg-white">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate">To {title}</p>
            <p className="text-[11.5px] text-muted truncate">{destText}</p>
            {road && (
              <p className="text-[13px] font-bold text-navy mt-0.5">
                {road.km} km · about {road.mins} min by road
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-semibold hover:bg-wash shrink-0">
            Close
          </button>
        </div>
        <div className="p-4">
          {state === 'loading' && (
            <p className="text-muted text-[13px] py-12 text-center">Placing you and the site on the map…</p>
          )}
          {note && <p className="text-[12.5px] text-accent mb-2">{note}</p>}
          {state === 'ready' && navOn && (
            <div className="rounded-md bg-navy text-white px-4 py-3 mb-3">
              {nav && nav.idx >= steps.length ? (
                <p className="text-[16px] font-semibold">You have arrived. 🏁</p>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-wide opacity-70">
                    {nav ? 'In ' + (nav.toStepM >= 1000 ? (nav.toStepM / 1000).toFixed(1) + ' km' : nav.toStepM + ' m') : 'Waiting for GPS…'}
                  </p>
                  <p className="text-[15.5px] font-semibold leading-snug mt-0.5">
                    {steps[nav?.idx ?? 0]?.text || 'Follow the red line'}
                  </p>
                  {steps[(nav?.idx ?? 0) + 1] && (
                    <p className="text-[12px] opacity-75 mt-1">Then: {steps[(nav?.idx ?? 0) + 1].text}</p>
                  )}
                  {nav && (
                    <p className="text-[12px] opacity-90 mt-1.5 font-medium">
                      {(nav.remainM / 1000).toFixed(1)} km · about {Math.max(1, Math.round(nav.remainS / 60))} min left
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {state === 'ready' && olaKey && (
            <RouteMap key={mapKey} olaKey={olaKey} here={here} dest={destLL} route={route} height={420}
              onReady={(c: { move: (lat: number, lng: number, follow: boolean) => void }) => { mapCtl.current = c; }} />
          )}
          {state === 'ready' && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {!navOn ? (
                <button onClick={startNav} disabled={!steps.length}
                  className="h-10 px-5 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90 disabled:opacity-60">
                  Start directions
                </button>
              ) : (
                <button onClick={stopNav}
                  className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
                  Stop directions
                </button>
              )}
              <button onClick={refresh}
                className="h-10 px-4 rounded border border-navy text-navy text-[13px] font-semibold hover:bg-wash">
                Re-route
              </button>
              <span className="text-[11px] text-muted-2 self-center">
                Guidance is free — Ola is only called when you re-route.
              </span>
            </div>
          )}
          {state === 'error' && (
            <p className="text-[12px] text-muted mt-2">
              Fix the address on the customer profile and reopen the map.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default NavigateSheet;
