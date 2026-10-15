'use client';

/* ============================================================================
   The trip that is running now, with its clock.

   A technician on the road is asked "how long have you been driving?" and
   "is it recording?" - so both are on the card, live: the time since the
   trip started ticks every second, and the GPS points count goes up as the
   app-wide tracker sends them (its trip:tick event). While a trip runs, a
   small "You are on a trip" bar floats on every other screen.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';

export interface LiveTrip {
  id: string; purpose: string; dest: string; startAt: string;
  distanceM: number; points: number;
}

/** Seconds since `iso`, re-rendered every second. */
export function useElapsed(iso: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  const start = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}

/** 75 → "00:01:15", 3725 → "01:02:05" - a stopwatch, never mistaken for a time of day. */
export function clockOf(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return p(h) + ':' + p(m) + ':' + p(s);
}

const km = (m: number) => (m / 1000).toFixed(m < 10000 ? 2 : 1);

/** "Service SER-1229 — Ocean Pearl Restaurant" → the customer. */
function nameOf(purpose: string): string {
  const m = /^Service\s+\S+\s+[—-]\s*(.*)$/.exec(purpose || '');
  return (m && m[1].trim()) || purpose || 'Trip';
}

/** Time on the road · distance · GPS points - the three live numbers. */
export function TripStats({ trip }: { trip: LiveTrip }) {
  const secs = useElapsed(trip.startAt);
  return (
    <div data-trip-stats className="grid grid-cols-[1.35fr_1fr_1fr] rounded-lg border border-line bg-wash overflow-hidden">
      <div className="px-3 py-2.5">
        <span className="block text-[10.5px] uppercase tracking-wide font-semibold text-muted">Time</span>
        <span data-trip-clock className="block text-[18px] font-bold text-accent leading-tight tabular-nums whitespace-nowrap">{clockOf(secs)}</span>
      </div>
      <div className="px-3 py-2.5 border-l border-line">
        <span className="block text-[10.5px] uppercase tracking-wide font-semibold text-muted">Distance</span>
        <span className="block text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">
          {km(trip.distanceM)}<span className="text-[12px] font-semibold text-muted"> km</span>
        </span>
      </div>
      <div className="px-3 py-2.5 border-l border-line">
        <span className="block text-[10.5px] uppercase tracking-wide font-semibold text-muted">Recorded</span>
        <span className="block text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">
          {trip.points}<span className="text-[12px] font-semibold text-muted"> pts</span>
        </span>
      </div>
    </div>
  );
}

interface LiveJob { id: string; clientName: string; startedAt: string }

/** One floating bar: a blinking dot, two lines, and a running clock. */
function FloatBar({ href, title, sub, secs, label }: {
  href: string; title: string; sub: string; secs: number; label: string;
}) {
  return (
    <Link href={href} aria-label={label}
      className="pointer-events-auto h-[52px] flex items-center gap-3 pl-3.5 pr-3 rounded-xl bg-white
        border border-accent/40 shadow-[0_6px_20px_rgba(20,20,20,0.16)] active:scale-[0.99]">
      <span className="relative flex w-2.5 h-2.5 shrink-0">
        <span className="absolute inset-0 rounded-full bg-accent opacity-60 animate-ping motion-reduce:animate-none" />
        <span className="relative w-2.5 h-2.5 rounded-full bg-accent" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold leading-tight">{title}</span>
        <span className="block text-[12px] text-muted leading-tight truncate mt-0.5">{sub}</span>
      </span>
      <span className="text-[15px] font-bold text-accent tabular-nums shrink-0">{clockOf(secs)}</span>
    </Link>
  );
}

/**
 * What is running, floating on every screen: a trip ("You are on a trip")
 * and a started service ("Service in progress").
 *
 * A technician who starts a trip or a service and then opens an expense or
 * the wallet must not forget it is still running. So it follows him: small
 * bars just above the tab bar (bottom-right on a computer) with the customer
 * and the running clock; one tap goes back to it. Not on its own page - the
 * trip page shows the trip, the service's page shows the service.
 *
 * It sets --trip-gap on the page while bars show, and the bottom buttons
 * (Save bars, the + button) sit that much higher, so it covers nothing.
 * Checks the server on open, on every change of screen, on trip:changed
 * and every 30 seconds, so whatever starts or ends anywhere shows up here.
 */
export function TripFloat() {
  const path = usePathname() || '';
  const [trip, setTrip] = useState<LiveTrip | null>(null);
  const [job, setJob] = useState<LiveJob | null>(null);
  const tripSecs = useElapsed(trip?.startAt);
  const jobSecs = useElapsed(job?.startedAt || null);
  useEffect(() => {
    let gone = false;
    const fetchIt = () => {
      api.get<LiveTrip | null>('/trips/active')
        .then((t) => { if (!gone) setTrip(t || null); }).catch(() => {});
      api.get<LiveJob | null>('/jobs/in-progress')
        .then((j) => { if (!gone) setJob(j || null); }).catch(() => {});
    };
    fetchIt();
    const poll = setInterval(fetchIt, 30000);
    window.addEventListener('trip:changed', fetchIt);
    return () => {
      gone = true;
      clearInterval(poll);
      window.removeEventListener('trip:changed', fetchIt);
    };
  }, [path]);

  const showTrip = !!trip && path !== '/trip';
  const showJob = !!job && !path.startsWith('/jobs/' + job.id);
  const bars = (showTrip ? 1 : 0) + (showJob ? 1 : 0);
  useEffect(() => {
    const root = document.documentElement;
    if (bars) root.style.setProperty('--trip-gap', bars * 60 + 'px');
    else root.style.removeProperty('--trip-gap');
    return () => { root.style.removeProperty('--trip-gap'); };
  }, [bars]);

  if (!bars) return null;
  return (
    <div data-live-floats
      className="fixed z-30 inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+66px)] flex flex-col gap-2
        pointer-events-none lg:inset-x-auto lg:right-5 lg:bottom-5 lg:w-[340px]">
      {showJob && job && (
        <FloatBar href={'/jobs/' + job.id} title="Service in progress"
          sub={job.clientName + ' · tap to open'} secs={jobSecs}
          label="Service in progress - open the service" />
      )}
      {showTrip && trip && (
        <FloatBar href="/trip" title="You are on a trip"
          sub={nameOf(trip.purpose) + ' · tap to open'} secs={tripSecs}
          label="You are on a trip - open the trip" />
      )}
    </div>
  );
}
