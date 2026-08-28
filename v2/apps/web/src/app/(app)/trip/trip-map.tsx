'use client';

/* ============================================================================
   The Ola Maps view — mounted ONLY when the user asks for it, so tiles are
   never fetched by a render loop, only by an explicit human tap.
   Draws whichever layers it is given:
   - path:  the GPS breadcrumb trail (the road actually driven) — navy
   - route: the road route ahead (decoded Ola polyline)          — red
   - here:  where I am (a heading arrow, like a navigation app)
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
  onReady?: (ctl: {
    move: (lat: number, lng: number, follow: boolean, bearing?: number | null) => void;
  }) => void;
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
        if (path.length > 1) line('trail', path.map((p) => [p.lng, p.lat]), '#141414', 4); // driven so far

        /* ------------------------------------------------------- me, pointing

           A teardrop pin says where you are and nothing about which way you
           are facing, so at a fork it is useless — the one moment a driver
           actually needs the map. Every navigation app draws an arrow for
           this reason, and this one now does too.

           rotationAlignment 'map' is what makes it behave: the arrow's
           rotation is measured against the map's north, not the screen's, so
           it keeps pointing down the real road as the map turns underneath
           it. pitchAlignment 'map' lays it flat on the tilted ground instead
           of standing it up like a signpost.

           The cone is hidden until there is a heading to believe. Somebody
           standing still has no direction, and an arrow pointing north
           because that is the default is worse than no arrow.               */
        const meEl = document.createElement('div');
        meEl.style.width = '46px';
        meEl.style.height = '46px';
        meEl.innerHTML = [
          '<svg viewBox="0 0 46 46" width="46" height="46">',
          // the beam, showing which way is forward
          '<path id="me-cone" d="M23 3 L35 25 A13 13 0 0 0 11 25 Z"',
          ' fill="#141414" opacity="0.22"/>',
          // the dot itself
          '<circle cx="23" cy="25" r="8.5" fill="#141414"',
          ' stroke="#fff" stroke-width="3"/>',
          '</svg>',
        ].join('');
        const cone = meEl.querySelector('#me-cone') as SVGPathElement | null;
        if (cone) cone.style.opacity = '0';   // no heading yet

        const me = here || (last ? { lat: last.lat, lng: last.lng } : null);
        const meMarker = new maplibregl.Marker({
          element: meEl,
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        });
        if (me) meMarker.setLngLat([me.lng, me.lat]).addTo(map);
        let meOnMap = !!me;

        /* The camera's own heading, eased separately from the arrow's. A GPS
           bearing wobbles by a few degrees at a stand; the arrow can wobble
           with it, but a map that twitches is unreadable. */
        let camBearing = map.getBearing();
        let following = false;
        onReady?.({
          /*
           * Follow the driver.
           *
           * Overview zoom is useless at a junction — you cannot see which of
           * two roads is yours — so following pulls in to street level. And
           * when a bearing is known the map turns with the car, because a
           * north-up map asks the driver to rotate it in their head at
           * exactly the moment they have no attention to spare. Passing no
           * bearing (stopped, or too slow to have a direction) leaves the
           * rotation where it was rather than spinning on noise.
           */
          move: (lat, lng, follow, bearing) => {
            if (!meOnMap) { meMarker.addTo(map); meOnMap = true; }
            meMarker.setLngLat([lng, lat]);
            if (typeof bearing === 'number') {
              meMarker.setRotation(bearing);
              if (cone) cone.style.opacity = '0.22';
            }
            if (!follow) return;

            if (typeof bearing === 'number') {
              // Shortest way round, so 350° to 10° turns twenty degrees and
              // not three hundred and forty.
              const d = ((bearing - camBearing + 540) % 360) - 180;
              camBearing = (camBearing + d * 0.16 + 360) % 360;
            }

            /*
             * The first follow frames the driver; every one after that just
             * slides the camera.
             *
             * This used to call easeTo with a 900 ms animation on every
             * update, which was survivable when updates came once every ten
             * seconds. They now arrive on every animation frame, and sixty
             * overlapping nine-hundred-millisecond eases a second is a camera
             * that never arrives anywhere. jumpTo is instant, and it looks
             * perfectly smooth because the position being fed to it is
             * already interpolated.
             *
             * Zoom and pitch are set once, then left alone — a driver who
             * pinches out to see the next junction should not have the map
             * snatch itself back every frame.
             */
            if (!following) {
              following = true;
              map.easeTo({
                center: [lng, lat],
                zoom: Math.max(map.getZoom(), 16.5),
                bearing: camBearing,
                pitch: 45,
                duration: 600,
              });
              return;
            }
            map.jumpTo({ center: [lng, lat], bearing: camBearing });
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
