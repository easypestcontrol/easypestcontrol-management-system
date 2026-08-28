'use client';

/* ============================================================================
   The app-wide trip tracker. As long as the person has an ACTIVE trip, this
   feeds GPS breadcrumbs to it from ANY page — the job checklist, the wallet,
   anywhere — so the moving distance and duration always count. Renders
   nothing.

   Cost: zero Ola calls, ever. Pings go to our own API (at most one every
   4 seconds, only while a trip is active), and other screens hear about
   them through 'trip:tick' window events. 'trip:changed' events (fired by
   the start/end buttons) re-sync immediately; a 60-second local heartbeat
   catches anything else.
   ========================================================================== */

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { watchPosition, type GeoPos } from '@/lib/geo';

export default function TripTracker() {
  useEffect(() => {
    let tripId = '';
    let stopWatch: (() => void) | null = null;
    let lastSent = 0;
    let gone = false;

    const stop = () => {
      stopWatch?.();
      stopWatch = null;
      tripId = '';
    };

    const onPos = (pos: GeoPos) => {
      if (!tripId || gone) return;
      const now = Date.now();
      /*
       * One breadcrumb every four seconds, not ten.
       *
       * Distance is the sum of straight lines between breadcrumbs, so the
       * gap between them is measurement error: at ten seconds a van at city
       * speed covers a couple of hundred metres, and every bend in that
       * stretch is cut off the total. A trip down a winding road came back
       * short, and short distance is short reimbursement.
       *
       * Four seconds is still nothing — it is our own API, no Ola call, and
       * a two-hour trip is under two thousand rows.
       */
      if (now - lastSent < 4000) return;
      lastSent = now;
      api.post<{ distanceM: number; points: number }>('/trips/' + tripId + '/ping', {
        lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy,
      }).then((r) => {
        window.dispatchEvent(new CustomEvent('trip:tick', { detail: r }));
      }).catch(() => {});
    };

    const begin = (id: string) => {
      tripId = id;
      if (!stopWatch) {
        stopWatch = watchPosition(onPos, () => window.dispatchEvent(new Event('trip:gps-denied')));
      }
    };

    const check = () => {
      api.get<{ id: string } | null>('/trips/active')
        .then((t) => { if (gone) return; if (t) begin(t.id); else stop(); })
        .catch(() => {});
    };

    check();
    const iv = setInterval(check, 60000); // local heartbeat — never an Ola call
    window.addEventListener('trip:changed', check);
    return () => {
      gone = true;
      clearInterval(iv);
      stop();
      window.removeEventListener('trip:changed', check);
    };
  }, []);

  return null;
}
