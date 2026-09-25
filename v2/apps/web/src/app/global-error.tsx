'use client';

/* The last net: an error in the root layout itself. This replaces the whole
   document, so it carries its own <html> and <body> and no app styling can
   be assumed. Same rule as error.tsx: a stale build reloads itself once. */

import { useEffect } from 'react';

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!STALE.test((error?.name || '') + ' ' + (error?.message || ''))) return;
    let done = '';
    try { done = sessionStorage.getItem('pestops.reloaded:root') || ''; } catch { /* ignore */ }
    if (done) return;
    try { sessionStorage.setItem('pestops.reloaded:root', String(Date.now())); } catch { /* ignore */ }
    window.location.reload();
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', background: '#F9FAFB', color: '#111827' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #F3F4F6', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 2px 15px -3px rgba(0,0,0,.07)' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Something went wrong</p>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '6px 0 0' }}>Reload to try again.</p>
            {error?.digest && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '8px 0 0' }}>ref {error.digest}</p>}
            <button type="button" onClick={() => window.location.reload()}
              style={{ marginTop: 20, height: 44, width: '100%', borderRadius: 12, border: 0, background: '#E11D48', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
