'use client';

/* ============================================================================
   One trip on a real map.

   The review screen drew the GPS trail as a red squiggle on a grey rectangle:
   the shape of the drive with no streets under it, so nobody could tell which
   road it was, let alone whether it was the right one.

   This is the road map, with the trip laid on it in the colours that answer
   the questions asked of a trip:

     the blue band      the shortest road to where the trip was going
     black              driven, on that road
     red                driven, on another road
     green, dotted      on foot (under 7 km/h)
     grey, dashed       not seen by the GPS - bridged along the road map

   plus where it started, where it ended, where it was going, and every stop
   of three minutes or more. While a trip is running the lines are redrawn in
   place as new fixes arrive; the map itself is never rebuilt.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface PathPt { lat: number; lng: number; t: string; k: 'd' | 'w' | 'g'; o: 0 | 1; e: 0 | 1 }
export interface StopPt { lat: number; lng: number; at: string; mins: number }

type Style = 'drive' | 'off' | 'walk' | 'est';
const STYLES: Style[] = ['est', 'walk', 'drive', 'off'];

export const ROUTE_COLOURS = {
  planned: '#3B82F6', drive: '#141414', off: '#FF0000', walk: '#0E9F6E', est: '#6B7280',
};

/** Which colour the stretch ending at a point is drawn in. */
function styleOf(p: PathPt): Style {
  if (p.k === 'g' || p.e) return 'est';
  if (p.k === 'w') return 'walk';
  return p.o ? 'off' : 'drive';
}

/** The path as one MultiLineString per colour. */
function split(path: PathPt[]): Record<Style, number[][][]> {
  const out: Record<Style, number[][][]> = { drive: [], off: [], walk: [], est: [] };
  let run: number[][] = [];
  let cur: Style | null = null;
  for (let i = 1; i < path.length; i++) {
    const st = styleOf(path[i]);
    if (st !== cur) {
      if (cur && run.length > 1) out[cur].push(run);
      run = [[path[i - 1].lng, path[i - 1].lat]];
      cur = st;
    }
    run.push([path[i].lng, path[i].lat]);
  }
  if (cur && run.length > 1) out[cur].push(run);
  return out;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

type Lib = typeof import('maplibre-gl');
type GLMap = import('maplibre-gl').Map;
type GLMarker = import('maplibre-gl').Marker;
type GLSource = import('maplibre-gl').GeoJSONSource;

export default function RouteMap({ olaKey, path, planned, dest, stops, live, startLabel, endLabel, heightClass = 'h-[460px]', fallback }: {
  olaKey: string;
  path: PathPt[];
  planned: Array<[number, number]>; // [lng, lat]
  dest: { lat: number; lng: number } | null;
  stops: StopPt[];
  /** Still running: the last point is "now", not "the end". */
  live: boolean;
  startLabel?: string;
  endLabel?: string;
  /** Tailwind height - the phone and the desk want different ones. */
  heightClass?: string;
  /** What to show if the street map cannot be drawn (no WebGL, a refused key). */
  fallback?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GLMap | null>(null);
  const libRef = useRef<Lib | null>(null);
  const markers = useRef<GLMarker[]>([]);
  const framed = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // ---- the map itself: once.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        if (dead || !box.current) return;
        libRef.current = maplibregl as unknown as Lib;
        // Every request Ola serves (style, tiles, sprites, glyphs) carries the key.
        const withKey = (url: string) =>
          url.includes('api_key=') ? url : url + (url.includes('?') ? '&' : '?') + 'api_key=' + olaKey;
        const first = path[0] || (dest ? { lng: dest.lng, lat: dest.lat } : null);
        const map = new maplibregl.Map({
          container: box.current,
          style: withKey('https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json'),
          center: first ? [first.lng, first.lat] : [80.2707, 13.0827],
          zoom: 13, pitch: 0, maxPitch: 0,
          attributionControl: false,
          transformRequest: (url) => ({ url: withKey(url) }),
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        /* A map that has not loaded its style in twelve seconds is not going
           to - a refused key, no route to the tile server. Individual errors
           are no guide: the provider's own style reports a missing icon or
           two on every load and draws perfectly well. */
        let loaded = false;
        const giveUp = setTimeout(() => { if (!dead && !loaded) setFailed(true); }, 12000);
        map.on('load', () => {
          if (dead) return;
          loaded = true;
          clearTimeout(giveUp);
          // Flat: a wall of extruded buildings hides the very road being judged.
          for (const layer of map.getStyle().layers || []) {
            if (layer.type === 'fill-extrusion') map.removeLayer(layer.id);
          }
          const empty = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
          map.addSource('planned', { type: 'geojson', data: empty as never });
          map.addLayer({
            id: 'planned', type: 'line', source: 'planned',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ROUTE_COLOURS.planned, 'line-width': 10, 'line-opacity': 0.4 },
          });
          for (const st of STYLES) {
            map.addSource('seg-' + st, { type: 'geojson', data: empty as never });
            map.addLayer({
              id: 'seg-' + st, type: 'line', source: 'seg-' + st,
              layout: { 'line-cap': st === 'drive' || st === 'off' ? 'round' : 'butt', 'line-join': 'round' },
              paint: {
                'line-color': ROUTE_COLOURS[st],
                'line-width': st === 'est' ? 3 : 4.5,
                'line-opacity': 0.95,
                ...(st === 'walk' ? { 'line-dasharray': [0.6, 1.4] } : {}),
                ...(st === 'est' ? { 'line-dasharray': [2, 2] } : {}),
              } as never,
            });
          }
          setReady(true);
        });
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map mounts once; the data below is drawn INTO it as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olaKey]);

  // ---- the trip, drawn into it - again on every new fix of a live trip.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;

    const feat = (coordinates: number[][][]) => ({
      type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates },
    });
    (map.getSource('planned') as GLSource | undefined)?.setData(feat(planned.length > 1 ? [planned] : []) as never);
    const parts = split(path);
    for (const st of STYLES) (map.getSource('seg-' + st) as GLSource | undefined)?.setData(feat(parts[st]) as never);

    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const dot = (bg: string, text: string, size = 26) => {
      const el = document.createElement('div');
      el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + bg
        + ';color:#fff;font:700 11px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;'
        + 'border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer';
      el.textContent = text;
      return el;
    };
    const pin = (el: HTMLElement, at: { lat: number; lng: number }, text: string) => {
      const m = new lib.Marker({ element: el })
        .setLngLat([at.lng, at.lat])
        .setPopup(new lib.Popup({ closeButton: false, offset: 16 }).setText(text))
        .addTo(map);
      markers.current.push(m);
    };

    const real = path.filter((p) => !p.e);
    const a = real[0];
    const b = real[real.length - 1];
    stops.forEach((s, i) => pin(dot('#D97706', String(i + 1), 22), s,
      'Stop ' + (i + 1) + ' · ' + s.mins + ' min from ' + clock(s.at)));
    if (dest) pin(dot('#FF0000', '★', 28), dest, 'Destination' + (endLabel ? ' · ' + endLabel : ''));
    if (a) pin(dot('#141414', 'A'), a, 'Started ' + clock(a.t) + (startLabel ? ' · ' + startLabel : ''));
    if (b && b !== a) {
      pin(dot(live ? '#1A56DB' : '#141414', live ? '●' : 'B'), b,
        (live ? 'Last seen ' : 'Ended ') + clock(b.t));
    }

    // Frame the whole trip once; a live trip is not re-framed under somebody's hands.
    if (!framed.current) {
      const pts: Array<[number, number]> = [
        ...planned, ...path.map((p) => [p.lng, p.lat] as [number, number]),
      ];
      if (dest) pts.push([dest.lng, dest.lat]);
      if (pts.length > 1) {
        const lngs = pts.map((p) => p[0]); const lats = pts.map((p) => p[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 56, maxZoom: 16, duration: 0 },
        );
        framed.current = true;
      }
    }
  }, [ready, path, planned, dest, stops, live, startLabel, endLabel]);

  if (failed) {
    return fallback ? <>{fallback}</> : (
      <div className={heightClass + ' flex items-center justify-center text-center px-6 bg-wash text-[12.5px] text-muted'}>
        The map could not be loaded. The route and its numbers are still correct - they do not depend on it.
      </div>
    );
  }
  return <div ref={box} data-route-map className={'w-full ' + heightClass} />;
}
