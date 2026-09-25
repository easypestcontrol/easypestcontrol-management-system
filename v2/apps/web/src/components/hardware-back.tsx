'use client';

/* ============================================================================
   Android's back key.

   Inside the Capacitor shell the WebView does not wire the hardware key to the
   page's history, so pressing back closed the whole application from any
   screen — a technician three taps into a job lost everything by reaching for
   the key every Android user reaches for.

   So we take the event ourselves:
     · anywhere with history behind it  → go back one page
     · on a top-level tab               → let the app close, which is what
                                          back means on a home screen

   In a plain browser this mounts, finds no Capacitor bridge, and does nothing.
   ========================================================================== */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** The screens where back should leave the app rather than go deeper. */
const ROOTS = ['/dashboard', '/customers', '/invoices', '/jobs', '/techdash'];

/* What the shell hands us. The raw native bridge (Capacitor.Plugins.App,
   which is all a remote-URL app has - it never ships the @capacitor/app
   JavaScript) returns the listener handle SYNCHRONOUSLY; the typed package
   wraps it in a promise. Calling .then on the bare handle threw a TypeError
   on every page inside the app, and the error boundary caught it. Accept
   either shape. */
type Handle = { remove: () => void | Promise<void> };
interface CapApp {
  addListener(
    event: 'backButton',
    cb: (data: { canGoBack: boolean }) => void,
  ): Handle | Promise<Handle>;
  exitApp(): Promise<void>;
}

function plugin(): CapApp | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Capacitor?: { Plugins?: { App?: CapApp } } };
  return w.Capacitor?.Plugins?.App || null;
}

export default function HardwareBack() {
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const app = plugin();
    if (!app) return;

    let remove: (() => void) | undefined;
    let dead = false;

    let handle: Handle | Promise<Handle> | undefined;
    try {
      handle = app.addListener('backButton', () => {
        // A tab is the bottom of the stack. Going "back" from there means
        // leaving, which is what the key means on any Android home screen.
        if (ROOTS.includes(path)) {
          app.exitApp().catch(() => {});
          return;
        }
        if (window.history.length > 1) router.back();
        else router.push('/dashboard');
      });
    } catch { /* a shell without the App plugin: no back handling, no crash */ }
    // Promise.resolve takes a promise or a plain handle alike.
    Promise.resolve(handle).then((h) => {
      if (!h) return;
      if (dead) void h.remove();
      else remove = () => { void h.remove(); };
    }).catch(() => { /* an older shell without the App plugin */ });

    return () => { dead = true; remove?.(); };
  }, [path, router]);

  return null;
}
