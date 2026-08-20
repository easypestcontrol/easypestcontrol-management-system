'use client';

/* ============================================================================
   The Ola Maps view — mounted ONLY when the user asks for it, so tiles are
   never fetched by a render loop, only by an explicit human tap.
   Draws whichever layers it is given:
   - path:  the GPS breadcrumb trail (the road actually driven) — navy
   - route: the road route ahead (decoded Ola polyline)          — red
   - here:  where I am (navy pin)
   - dest:  where I'm going (red pin)
   ========================================================================== */

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Pt { lat: number; lng: number; t?: string }

export default function TripMap({ olaKey, path = [], route = [], here = null, dest = null, height = 340, onReady }: {
  olaKey: string;
  path?: Pt[];
  route?: Array<[number, number]>; // [lng, lat]
  here?: { lat: number; lng: number } | null;
  dest?: { lat: number; lng: number; label: string } | null;
  height?: number;
  /**
   * Hands back a control to move the "me" marker as the GPS updates — the
   * marker glides and the camera follows WITHOUT remounting the map, so no
   * tile storm on every tick.
   */
  onReady?: (ctl: { move: (lat: number, lng: number, follow: boolean) => void }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (dead || !boxRef.current) return;

      // Every request Ola serves (style, tiles, sprites, glyphs) carries the key.
      const withKey = (url: string) =>
        url.includes('api_key=') ? url : url + (url.includes('?') ? '&' : '?') + 'api_key=' + olaKey;

      const last = path[path.length - 1];
      const center: [number, number] = here
        ? [here.lng, here.lat]
        : last ? [last.lng, last.lat]
        : dest ? [dest.lng, dest.lat] : [80.2707, 13.0827]; // Chennai fallback

      const map = new maplibregl.Map({
        container: boxRef.current,
        style: withKey('https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json'),
        center,
        zoom: 13,
        attributionControl: false,
        transformRequest: (url) => ({ url: withKey(url) }),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        if (dead) return;
        const line = (id: string, coords: Array<[number, number]>, color: string, width: number) => {
          map.addSource(id, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
          });
          map.addLayer({ id, type: 'line', source: id,
            paint: { 'line-color': color, 'line-width': width, 'line-opacity': 0.85 } });
        };

        if (route.length > 1) line('route', route, '#FF0000', 5); // the road ahead
        if (path.length > 1) line('trail', path.map((p) => [p.lng, p.lat]), '#1B2E65', 4); // driven so far

        const me = here || (last ? { lat: last.lat, lng: last.lng } : null);
        const meMarker = new maplibregl.Marker({ color: '#1B2E65' });
        if (me) meMarker.setLngLat([me.lng, me.lat]).addTo(map);
        let meOnMap = !!me;
        onReady?.({
          move: (lat, lng, follow) => {
            if (!meOnMap) { meMarker.addTo(map); meOnMap = true; }
            meMarker.setLngLat([lng, lat]);
            if (follow) map.easeTo({ center: [lng, lat], duration: 900 });
          },
        });
        if (dest) {
          new maplibregl.Marker({ color: '#FF0000' })
            .setLngLat([dest.lng, dest.lat])
            .setPopup(new maplibregl.Popup({ closeButton: false }).setText(dest.label))
            .addTo(map);
        }

        // frame everything in one view
        const pts: Array<[number, number]> = [
          ...route,
          ...path.map((p) => [p.lng, p.lat] as [number, number]),
        ];
        if (me) pts.push([me.lng, me.lat]);
        if (dest) pts.push([dest.lng, dest.lat]);
        if (pts.length > 1) {
          const lngs = pts.map((p) => p[0]);
          const lats = pts.map((p) => p[1]);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 48, maxZoom: 15, duration: 0 },
          );
        }
      });
    })();
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
    // The map mounts once per open — never re-created on data ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={boxRef} style={{ height }} className="w-full rounded-md border border-line overflow-hidden" />;
}
