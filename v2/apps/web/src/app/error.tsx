'use client';

/* ============================================================================
   What the app shows when a page throws.

   Without this, Next shows "Application error: a client-side exception has
   occurred" - a dead end that tells the person nothing and offers nothing.

   The commonest cause is not a bug at all: the app deploys several times a
   day, and a tab (or the Android shell) still running the previous build
   asks for a chunk that no longer exists. That is a ChunkLoadError, and the
   cure is a reload - so here it happens by itself, once. Anything else gets
   a plain card with the two things a person can actually do.
   ========================================================================== */

import { useEffect, useState } from 'react';

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const text = (error?.name || '') + ' ' + (error?.message || '');
    if (!STALE.test(text)) return;
    // One automatic reload per page, guarded so a genuinely broken build can
    // never spin. The key is the path, so a later stale chunk elsewhere still
    // gets its own reload.
    const key = 'pestops.reloaded:' + window.location.pathname;
    let done = '';
    try { done = sessionStorage.getItem(key) || ''; } catch { /* private mode etc. */ }
    if (done) return;
    try { sessionStorage.setItem(key, String(Date.now())); } catch { /* nothing to remember with */ }
    setReloading(true);
    window.location.reload();
  }, [error]);

  if (reloading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-[13px] text-muted">
        A newer version of the app is live - reloading…
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-6 max-w-[420px] w-full text-center">
        <p className="text-[16px] font-bold">Something went wrong on this page</p>
        <p className="text-[13px] text-muted mt-1.5">
          The rest of the app is fine. Reload to try again; if it keeps happening, tell the office what you were doing.
        </p>
        {error?.digest && <p className="text-[11px] text-muted-2 mt-2 tabular-nums">ref {error.digest}</p>}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button type="button" onClick={() => window.location.reload()}
            className="h-11 rounded-[12px] bg-accent text-white text-[14px] font-bold hover:brightness-90">Reload</button>
          <a href="/dashboard" onClick={() => reset()}
            className="h-11 rounded-[12px] border border-line text-[14px] font-semibold flex items-center justify-center hover:bg-wash">Dashboard</a>
        </div>
      </div>
    </div>
  );
}
