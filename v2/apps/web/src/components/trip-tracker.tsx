'use client';

/* ============================================================================
   The app-wide trip tracker. As long as the person has an ACTIVE trip, this
   feeds GPS breadcrumbs to it from ANY page — the job checklist, the wallet,
   anywhere — so the moving distance and duration always count. Renders
   nothing.

   Two ways of doing the same job, and it picks the better one available:

   · Inside the Android app (version 1.1 on), the trip is handed to a native
     recorder - a foreground service with a "Trip in progress" notification
     that reads the GPS and sends every fix itself. It keeps going with the
     phone locked, in a pocket, or with another app in front, which a web
     page cannot: a page in the background hears nothing from the GPS. This
     component only starts and stops it, and repaints the numbers.

   · In a browser, or in an older copy of the app, the page watches the GPS
     itself - which works only while it is on the screen.

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
import { api, ApiError, getToken } from '@/lib/api';
import { watchPosition, type GeoPos } from '@/lib/geo';

interface Fix { lat: number; lng: number; acc: number; spd?: number; at: string }

/** What the phone holds while it cannot reach us - about an hour of driving. */
const HOLD = 900;

/** The Android app's own recorder (TripTrackerPlugin.java), when this is that app. */
interface NativeTracker {
  start(o: { tripId: string; token: string; base: string }): Promise<unknown>;
  stop(): Promise<unknown>;
}
function nativeTracker(): NativeTracker | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Capacitor?: { Plugins?: { TripTracker?: NativeTracker } } };
  const t = w.Capacitor?.Plugins?.TripTracker;
  return t && typeof t.start === 'function' ? t : null;
}

export default function TripTracker() {
  useEffect(() => {
    let tripId = '';
    let stopWatch: (() => void) | null = null;
    let lastTaken = 0;
    let gone = false;
    let queue: Fix[] = [];
    let sending = false;
    // The native recorder has the trip: the page neither watches nor sends.
    let nativeOn = false;
    let nativePoll: ReturnType<typeof setInterval> | null = null;

    const stopNative = () => {
      if (nativePoll) { clearInterval(nativePoll); nativePoll = null; }
      if (nativeOn) nativeTracker()?.stop().catch(() => {});
      nativeOn = false;
    };

    const stop = () => {
      stopWatch?.();
      stopWatch = null;
      stopNative();
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
      if (!tripId || gone || nativeOn) return;
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

    /** The page's own watch - the browser, or an app without the recorder. */
    const watchHere = () => {
      if (!stopWatch) {
        stopWatch = watchPosition(onPos, () => window.dispatchEvent(new Event('trip:gps-denied')));
      }
    };

    const begin = (id: string) => {
      if (tripId && tripId !== id) { queue = []; stopNative(); } // a different trip
      tripId = id;
      const nt = nativeTracker();
      if (!nt) { watchHere(); return; }
      if (nativeOn) return;
      nativeOn = true; // claimed before the await, so two heartbeats cannot both start it
      nt.start({ tripId: id, token: getToken() || '', base: window.location.origin + '/api' })
        .then(() => {
          if (gone || tripId !== id) { stopNative(); return; }
          stopWatch?.(); stopWatch = null;
          /* The recorder sends the fixes; the screens still want the running
             distance. One cheap read of our own API every ten seconds. */
          if (!nativePoll) {
            nativePoll = setInterval(() => {
              api.get<{ id: string; distanceM: number; points: number } | null>('/trips/active')
                .then((t) => {
                  if (t && t.id === tripId) {
                    window.dispatchEvent(new CustomEvent('trip:tick', { detail: { distanceM: t.distanceM, points: t.points } }));
                  }
                }).catch(() => {});
            }, 10000);
          }
        })
        .catch(() => {
          // Location refused, or the recorder could not start: the page does what it can.
          nativeOn = false;
          if (!gone && tripId === id) watchHere();
        });
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
      // Leaving the page is not ending the trip: the native recorder keeps
      // going. Only the page's own watch and timers stop.
      stopWatch?.(); stopWatch = null;
      if (nativePoll) { clearInterval(nativePoll); nativePoll = null; }
      window.removeEventListener('trip:changed', check);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
