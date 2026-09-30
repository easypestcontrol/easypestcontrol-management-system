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

   A fix carries what the phone knows about it - its accuracy, its own speed,
   and the moment it was taken - and a fix that cannot be sent is KEPT, not
   dropped: a stretch with no signal arrives when the signal does, in order,
   with its own times, instead of becoming a hole in the route.
   ========================================================================== */

import { useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { watchPosition, type GeoPos } from '@/lib/geo';

interface Fix { lat: number; lng: number; acc: number; spd?: number; at: string }

/** What the phone holds while it cannot reach us - about an hour of driving. */
const HOLD = 900;

export default function TripTracker() {
  useEffect(() => {
    let tripId = '';
    let stopWatch: (() => void) | null = null;
    let lastTaken = 0;
    let gone = false;
    let queue: Fix[] = [];
    let sending = false;

    const stop = () => {
      stopWatch?.();
      stopWatch = null;
      tripId = '';
      queue = [];
    };

    /* One request at a time, oldest first. Two pings in flight would each
       read the trip, add their stretch and write it back - and the slower
       one would erase the faster one's. */
    const flush = async () => {
      if (sending || !tripId || !queue.length || gone) return;
      sending = true;
      const id = tripId;
      const batch = queue.slice(0, 200);
      try {
        const r = await api.post<{ distanceM: number; points: number }>(
          '/trips/' + id + '/ping', batch.length === 1 ? batch[0] : { batch });
        queue = queue.slice(batch.length);
        window.dispatchEvent(new CustomEvent('trip:tick', { detail: r }));
      } catch (e) {
        // The trip is over (or not ours): nothing more to send to it.
        if (e instanceof ApiError && (e.status === 400 || e.status === 404)) queue = [];
        // No signal: they wait. Keep the newest if it ever overflows.
        else if (queue.length > HOLD) queue = queue.slice(-HOLD);
      }
      sending = false;
      if (queue.length > 1) void flush(); // a backlog drains without waiting for the next fix
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
      if (now - lastTaken < 4000) return;
      lastTaken = now;
      const c = pos.coords;
      const fix: Fix = {
        lat: c.latitude, lng: c.longitude, acc: c.accuracy, at: new Date(now).toISOString(),
      };
      if (typeof c.speed === 'number' && c.speed >= 0) fix.spd = c.speed;
      queue.push(fix);
      void flush();
    };

    const begin = (id: string) => {
      if (tripId && tripId !== id) queue = []; // a different trip: the old one's fixes are not its
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

    const onOnline = () => { void flush(); };

    check();
    const iv = setInterval(check, 60000); // local heartbeat — never an Ola call
    window.addEventListener('trip:changed', check);
    window.addEventListener('online', onOnline);
    return () => {
      gone = true;
      clearInterval(iv);
      stop();
      window.removeEventListener('trip:changed', check);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
