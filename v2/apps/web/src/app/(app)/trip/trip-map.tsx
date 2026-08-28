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

export default function TripMap({
  olaKey, path = [], route = [], here = null, dest = null, height = 340,
  onReady, onFollowChange,
}: {
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
    recentre: () => void;
  }) => void;
  /** Told when the driver takes the camera by hand, and when it is given back. */
  onFollowChange?: (following: boolean) => void;
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
        // Flat. Ola's default style stands the buildings up, and at street
        // zoom a driver is looking at rooftops instead of the junction they
        // are about to reach. Nothing about a route needs a third dimension.
        pitch: 0,
        maxPitch: 0,
        attributionControl: false,
        transformRequest: (url) => ({ url: withKey(url) }),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        if (dead) return;

        /* Take the buildings down. Ola's default style extrudes them, and at
           street zoom that is a wall of grey blocks over the one junction the
           driver needs to see. */
        for (const layer of map.getStyle().layers || []) {
          if (layer.type === 'fill-extrusion') map.removeLayer(layer.id);
        }

        const line = (
          id: string, coords: Array<[number, number]>, color: string, width: number,
          opacity = 0.85,
        ) => {
          map.addSource(id, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
          });
          map.addLayer({
            id, type: 'line', source: id,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity },
          });
        };

        /* The road ahead, drawn twice: a broad blue band with a red line down
           the middle of it.

           One line of any colour disappears into a map full of coloured
           roads. Two makes the route the only thing on screen with that
           shape — the blue is wide enough to follow at a glance while
           driving, the red thin enough to show exactly which lane of the
           junction it goes through. */
        if (route.length > 1) {
          line('route-casing', route, '#1A56DB', 11, 0.9);
          line('route', route, '#FF0000', 4, 1);
        }
        if (path.length > 1) line('trail', path.map((p) => [p.lng, p.lat]), '#141414', 4); // driven so far

        /* ------------------------------------------------------- me, pointing

           A teardrop pin says where you are and nothing about which way you
           are facing, so at a fork it is useless — the one moment a driver
           actually needs the map.

           The first attempt at this drew a dot with a faint cone behind it,
           hidden until the GPS reported a heading. On screen that was a black
           blob: standing still there is no heading, so the cone never showed,
           and pitchAlignment 'map' laid the dot flat under a 45-degree tilt
           and squashed it into an ellipse. It looked like a bug because it
           read like one.

           So: an actual arrow, always drawn. rotationAlignment 'map' keeps it
           measured against the map's north rather than the screen's, so it
           points down the real road and turns as the map turns. But
           pitchAlignment is 'viewport' — the arrow stays face-on to the
           driver instead of being foreshortened into a smear by the tilt.
           Correct heading, still legible.

           With no fix to go on it points along the route rather than north,
           because the road ahead is a better guess than the top of the map.  */
        const meEl = document.createElement('div');
        meEl.style.width = '42px';
        meEl.style.height = '42px';
        meEl.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,.35))';
        meEl.innerHTML = [
          '<svg viewBox="0 0 42 42" width="42" height="42">',
          '<circle cx="21" cy="21" r="19" fill="#fff" opacity="0.92"/>',
          // the arrow: a chevron with a notched tail, pointing up = 0°
          '<path d="M21 5 L33 34 L21 27 L9 34 Z" fill="#141414"',
          ' stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>',
          '</svg>',
        ].join('');

        const me = here || (last ? { lat: last.lat, lng: last.lng } : null);
        const meMarker = new maplibregl.Marker({
          element: meEl,
          rotationAlignment: 'map',
          pitchAlignment: 'viewport',
        });
        if (me) meMarker.setLngLat([me.lng, me.lat]).addTo(map);
        let meOnMap = !!me;

        // Point it down the route until the GPS has an opinion.
        if (route.length > 1) {
          const [aLng, aLat] = route[0];
          const [bLng, bLat] = route[Math.min(4, route.length - 1)];
          const rad = (x: number) => (x * Math.PI) / 180;
          const y = Math.sin(rad(bLng - aLng)) * Math.cos(rad(bLat));
          const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat))
            - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng - aLng));
          meMarker.setRotation((Math.atan2(y, x) * 180) / Math.PI);
        }

        /* The camera's own heading, eased separately from the arrow's. A GPS
           bearing wobbles by a few degrees at a stand; the arrow can wobble
           with it, but a map that twitches is unreadable. */
        let camBearing = map.getBearing();
        let following = false;

        /* ------------------------------------------------- who is driving

           Auto-follow and a driver's hands fight over the same camera, and
           the camera was winning: rotate the map to look down a side street
           and the next fix — a second later — yanked it straight back. That
           is not a map, it is an argument.

           So a gesture wins. The moment somebody drags, rotates, tilts or
           zooms, following stops and stays stopped until they ask for it
           back. MapLibre marks user gestures with an originalEvent; our own
           jumpTo and easeTo carry none, so the two are told apart cleanly
           rather than by guessing at timings.                               */
        let userHasIt = false;
        const handOver = (e: { originalEvent?: unknown }) => {
          if (!e.originalEvent || !following) return;
          userHasIt = true;
          onFollowChange?.(false);
        };
        map.on('dragstart', handOver);
        map.on('rotatestart', handOver);
        map.on('pitchstart', handOver);
        map.on('zoomstart', handOver);
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
          /** Take the camera back, after the driver has been moving it by hand. */
          recentre: () => {
            userHasIt = false;
            following = false;      // so the next move() frames it properly
            onFollowChange?.(true);
          },
          move: (lat, lng, follow, bearing) => {
            if (!meOnMap) { meMarker.addTo(map); meOnMap = true; }
            meMarker.setLngLat([lng, lat]);
            if (typeof bearing === 'number') meMarker.setRotation(bearing);
            // The arrow keeps updating while the driver looks around; only
            // the camera stops.
            if (!follow || userHasIt) return;

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
