/* ============================================================================
   One door to the GPS. In the browser this is navigator.geolocation; inside
   the PestOps Field app it is the NATIVE Android location service via the
   Capacitor bridge — which also sidesteps the WebView rule that blocks
   geolocation on plain-http origins (our LAN setup).
   ========================================================================== */

export interface GeoPos {
  coords: { latitude: number; longitude: number; accuracy: number };
}

interface CapGeo {
  getCurrentPosition(opts: Record<string, unknown>): Promise<GeoPos>;
  watchPosition(
    opts: Record<string, unknown>,
    cb: (pos: GeoPos | null, err?: unknown) => void,
  ): Promise<string>;
  clearWatch(opts: { id: string }): Promise<void>;
  requestPermissions?: () => Promise<{ location?: string }>;
}

/* The three ways GPS goes wrong on a phone — each names its exact fix, so the
   technician (or whoever is on the phone with them) knows what to press. */
export const GEO_OLD_APP =
  'This phone has an old build of the app — install the latest PestOps Field APK once, then GPS works.';
export const GEO_BLOCKED =
  'Location is blocked for PestOps Field. Open the phone’s Settings → Apps → ' +
  'PestOps Field → Permissions → Location → “Allow while using the app”.';
export const GEO_OFF =
  'The phone’s Location switch is off — turn on Location in the quick settings and try again.';

function native(): CapGeo | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Capacitor?: { Plugins?: { Geolocation?: CapGeo } } };
  return w.Capacitor?.Plugins?.Geolocation || null;
}

/** Inside the Android shell at all? (Even an old build injects Capacitor.) */
function inAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { Capacitor?: unknown }).Capacitor;
}

/** Picks our actionable message out of a failure, or returns the fallback. */
export function geoHint(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return m === GEO_OLD_APP || m === GEO_BLOCKED || m === GEO_OFF ? m : fallback;
}

/** 'prompt' → Android shows its Allow dialog right here; 'denied' → it never
    will again, so say where the switch lives instead of failing silently. */
async function ask(g: CapGeo): Promise<void> {
  const p = await g.requestPermissions?.().catch(() => null);
  if (p && p.location === 'denied') throw new Error(GEO_BLOCKED);
}

function mapNativeError(e: unknown): Error {
  if (e instanceof Error && (e.message === GEO_BLOCKED || e.message === GEO_OFF)) return e;
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/disabled|not enabled|unavailable|settings/i.test(m)) return new Error(GEO_OFF);
  if (/denied|permission/i.test(m)) return new Error(GEO_BLOCKED);
  return e instanceof Error ? e : new Error(m || 'GPS failed');
}

/** One position fix. */
export async function getPosition(): Promise<GeoPos> {
  const g = native();
  if (g) {
    try {
      await ask(g);
      return await g.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    } catch (e) { throw mapNativeError(e); }
  }
  // A Capacitor shell without the plugin is the old APK: the browser fallback
  // below can never prompt there (http origin), so name the real fix.
  if (inAppShell()) throw new Error(GEO_OLD_APP);
  return new Promise((res, rej) => {
    if (!('geolocation' in navigator)) { rej(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 });
  });
}

/** Follow the GPS. Returns a stop function. */
export function watchPosition(cb: (p: GeoPos) => void, err?: (msg?: string) => void): () => void {
  const g = native();
  if (g) {
    let id: string | null = null;
    let stopped = false;
    ask(g)
      .then(() => g.watchPosition({ enableHighAccuracy: true }, (pos, e) => {
        if (pos) cb(pos);
        else if (e) err?.(mapNativeError(e).message);
      }))
      .then((watchId) => {
        id = watchId;
        if (stopped && id) g.clearWatch({ id }).catch(() => {});
      })
      .catch((e) => err?.(mapNativeError(e).message));
    return () => { stopped = true; if (id) g.clearWatch({ id }).catch(() => {}); };
  }
  if (inAppShell()) { err?.(GEO_OLD_APP); return () => {}; }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    err?.();
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => cb(p), () => err?.(),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
