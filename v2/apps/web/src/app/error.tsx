'use client';

/* ============================================================================
   What the app shows when a page throws.

   Without this, Next shows "Application error: a client-side exception has
   occurred" - a dead end that tells the person nothing and offers nothing.

   The commonest cause is not a bug at all: the app deploys several times a
   day, and a tab (or the Android shell) still running the previous build
   asks for a chunk that no longer exists. That is a ChunkLoadError, and the
   cure is a reload - so here it happens by itself, once a minute at most per
   page, so a genuinely broken build can never spin. Anything else gets a
   plain card with the two things a person can actually do - and, in small
   type, the page and the error's first line, so a photograph of this screen
   is enough for the office to find the cause.
   ========================================================================== */

import { useEffect, useState } from 'react';

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
/** How long one automatic reload "counts" for a page. A second stale error
    inside this window shows the card; after it, a fresh deploy gets its
    own reload again. */
const RELOAD_WINDOW_MS = 60_000;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);
  const text = (error?.name || '') + ' ' + (error?.message || '');
  const stale = STALE.test(text);

  // Tell the office what broke, fire-and-forget: the API logs it. A stale
  // build is not worth a report; a real error on a phone is the only way
  // anyone will ever hear of it.
  useEffect(() => {
    if (stale) return;
    try {
      fetch('/api/client-errors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({
          path: window.location.pathname, name: error?.name, message: error?.message,
          stack: String(error?.stack || '').slice(0, 600), ua: navigator.userAgent, digest: error?.digest,
        }),
      }).catch(() => {});
    } catch { /* reporting must never be the second error */ }
  }, [error, stale]);

  useEffect(() => {
    if (!stale) return;
    const key = 'pestops.reloaded:' + window.location.pathname;
    let last = 0;
    try { last = Number(sessionStorage.getItem(key) || 0); } catch { /* private mode etc. */ }
    if (Date.now() - last < RELOAD_WINDOW_MS) return;
    try { sessionStorage.setItem(key, String(Date.now())); } catch { /* nothing to remember with */ }
    setReloading(true);
    window.location.reload();
  }, [stale]);

  if (reloading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-[13px] text-muted">
        A newer version of the app is live - reloading…
      </div>
    );
  }

  const where = typeof window !== 'undefined' ? window.location.pathname : '';
  const detail = (error?.message || error?.name || 'Unknown error').split('\n')[0].slice(0, 180);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-6 max-w-[420px] w-full text-center">
        <p className="text-[16px] font-bold">Something went wrong on this page</p>
        <p className="text-[13px] text-muted mt-1.5">
          The rest of the app is fine. Reload to try again; if it keeps happening, show the office this screen.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button type="button" onClick={() => window.location.reload()}
            className="h-11 rounded-[12px] bg-accent text-white text-[14px] font-bold hover:brightness-90">Reload</button>
          <a href="/dashboard" onClick={() => reset()}
            className="h-11 rounded-[12px] border border-line text-[14px] font-semibold flex items-center justify-center hover:bg-wash">Dashboard</a>
        </div>
        {/* For the office, not the person: enough to find it in the code. */}
        <p className="text-[11px] text-muted-2 mt-4 break-words leading-relaxed">
          {where && <span className="tabular-nums">{where}</span>}
          {where && ' · '}
          {stale ? 'the app was updated while this page was open' : detail}
          {error?.digest && <span> · ref {error.digest}</span>}
        </p>
      </div>
    </div>
  );
}
