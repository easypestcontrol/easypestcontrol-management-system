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
  const mapCtl = useRef<{
    move: (lat: number, lng: number, follow: boolean, bearing?: number | null) => void;
  } | null>(null);
  const navWatch = useRef<(() => void) | null>(null);
  const navIdx = useRef(0);
  const navLast = useRef(0);
  // Spoken guidance. On by default: a driver cannot read a phone, and an
  // instruction nobody hears is the same as no instruction.
  const [voice, setVoice] = useState(true);
  const voiceRef = useRef(true);
  const spokenIdx = useRef(-1);      // which step has been announced
  const spokenNear = useRef(-1);     // which step got its "in 200 m" warning
  const offCount = useRef(0);        // consecutive fixes away from the line
  const lastFix = useRef<{ lat: number; lng: number } | null>(null);
  const [rerouting, setRerouting] = useState(false);

  const position = () => getPosition();

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [voice]);

  /** Metres between two coordinates — free local math for step advancing. */
  const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const rad = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(rad(bLat - aLat) / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };

  /**
   * Which way the car is pointing, from where it was to where it is.
   *
   * Phones report a `heading`, but it is the compass — it swings with the
   * handset lying on a seat and is absent on many devices. Two consecutive
   * positions give course over ground instead, which is what the map should
   * turn to. Under 8 m of movement there is no reliable direction, so we
   * return null and the camera keeps the rotation it had.
   */
  function bearingFrom(lat: number, lng: number): number | null {
    const p = lastFix.current;
    lastFix.current = { lat, lng };
    if (!p) return null;
    if (metres(p.lat, p.lng, lat, lng) < 8) return null;
    const rad = (x: number) => (x * Math.PI) / 180;
    const y = Math.sin(rad(lng - p.lng)) * Math.cos(rad(lat));
    const x = Math.cos(rad(p.lat)) * Math.sin(rad(lat)) -
      Math.sin(rad(p.lat)) * Math.cos(rad(lat)) * Math.cos(rad(lng - p.lng));
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  /** Ola writes instructions with markup in them; a voice reads it literally. */
  const plain = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  function speak(text: string) {
    if (!voiceRef.current || typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      // Cancel first: queued instructions are worse than late ones, because
      // the driver hears the previous turn while taking the next.
      synth.cancel();
      const u = new SpeechSynthesisUtterance(plain(text));
      u.rate = 1.05;
      u.lang = 'en-IN';
      synth.speak(u);
    } catch { /* a phone with no voice is not a reason to stop navigating */ }
  }

  /**
   * How far off the drawn route we are, in metres.
   *
   * Distance to the nearest SEGMENT, not the nearest shape point — on a long
   * straight the points can be hundreds of metres apart, and measuring to
   * them would call a car on the road "off route".
   */
  function offRouteM(la: number, ln: number): number {
    if (route.length < 2) return 0;
    // Local flat-earth metres: fine over the tens of metres that matter here.
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos((la * Math.PI) / 180);
    const px = ln * mPerLng, py = la * mPerLat;
    let best = Infinity;
    for (let i = 1; i < route.length; i++) {
      const ax = route[i - 1][0] * mPerLng, ay = route[i - 1][1] * mPerLat;
      const bx = route[i][0] * mPerLng, by = route[i][1] * mPerLat;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best) best = d;
    }
    return best;
  }

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
      mapCtl.current?.move(la, ln, true, bearingFrom(la, ln));
      setHere({ lat: la, lng: ln });

      /*
       * Wandered off the line? Ask Ola for a new one from where we actually
       * are. Two consecutive fixes, because a single bad reading under a
       * flyover would otherwise re-route a driver who never left the road.
       */
      const off = offRouteM(la, ln);
      if (off > 70) {
        offCount.current += 1;
        if (offCount.current >= 2 && destLL && !rerouting) {
          offCount.current = 0;
          setRerouting(true);
          speak('Recalculating');
          fetchRoute({ lat: la, lng: ln }, destLL)
            .then(() => { spokenIdx.current = -1; spokenNear.current = -1; })
            .catch(() => setNote('Could not re-route — keep to the last instruction'))
            .finally(() => setRerouting(false));
          return;
        }
      } else {
        offCount.current = 0;
      }

      let i = navIdx.current;
      while (i < steps.length && metres(la, ln, steps[i].lat, steps[i].lng) < 45) i++;
      navIdx.current = i;
      const toStepM = i < steps.length ? Math.round(metres(la, ln, steps[i].lat, steps[i].lng)) : 0;

      /* Say it once when the turn becomes current, and once more on approach —
         the order matters: "in two hundred metres, turn left" only helps if it
         arrives before the junction, not at it. */
      if (i >= steps.length) {
        if (spokenIdx.current !== 9999) { spokenIdx.current = 9999; speak('You have arrived'); }
      } else {
        if (spokenIdx.current !== i) {
          spokenIdx.current = i;
          speak(steps[i].text);
        } else if (spokenNear.current !== i && toStepM > 0 && toStepM < 200) {
          spokenNear.current = i;
          speak('In ' + toStepM + ' metres, ' + plain(steps[i].text));
        }
      }
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
    spokenIdx.current = -1;
    spokenNear.current = -1;
    lastFix.current = null;
    // A sheet closed mid-sentence should not keep talking.
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
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
              {rerouting ? (
                <p className="text-[15.5px] font-semibold">Recalculating…</p>
              ) : nav && nav.idx >= steps.length ? (
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
              onReady={(c: {
                move: (lat: number, lng: number, follow: boolean, bearing?: number | null) => void;
              }) => { mapCtl.current = c; }} />
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
              <button onClick={() => setVoice((v) => !v)}
                aria-pressed={voice}
                className={'h-10 px-4 rounded border text-[13px] font-semibold hover:bg-wash '
                  + (voice ? 'border-navy text-navy' : 'border-line text-muted')}>
                {voice ? '🔊 Voice on' : '🔇 Voice off'}
              </button>
              <span className="text-[11px] text-muted-2 self-center basis-full">
                Spoken directions, and it re-routes itself if you leave the road.
                Ola is called only when the route is recalculated.
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
