/* ============================================================================
   In-app banners with sound, via the phone's own notification tray. Inside
   the Easy Pest Control app this raises a real Android notification (default
   system tone) the moment the bell learns something new — the technician
   hears it even mid-checklist. In a plain browser it is a silent no-op; the
   closed-app case is FCM's job (see apps/api/src/notifications/push.ts).
   ========================================================================== */

interface CapLocalNotifications {
  requestPermissions(): Promise<{ display?: string }>;
  createChannel?(c: {
    id: string; name: string; description?: string;
    importance: number; visibility?: number; vibration?: boolean; sound?: string;
  }): Promise<void>;
  schedule(opts: {
    notifications: Array<{ id: number; title: string; body: string; channelId?: string }>;
  }): Promise<unknown>;
}

/* An Android channel's sound and importance are frozen the instant it is first
   created — the app can never change them again; only the person can, in
   Settings. The original 'pestops-alerts' channel was created silent on early
   installs and stayed silent no matter what we set here. Bumping the id hands
   every device a brand-new channel that rings. Change the suffix again if a
   future install is ever created wrong. */
const CHANNEL = 'pestops-alerts-2';

function plugin(): CapLocalNotifications | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: CapLocalNotifications } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications || null;
}

let ready = false;

/** Ask once (Android 13+ needs it) and create our channel — default sound. */
export async function ensureNotifyReady(): Promise<void> {
  const p = plugin();
  if (!p || ready) return;
  ready = true;
  try {
    await p.requestPermissions();
    // No sound named = the system default tone (the plugin leaves the channel's
    // default in place). importance 4 is HIGH: a heads-up banner that rings.
    await p.createChannel?.({
      id: CHANNEL,
      name: 'PestOps alerts',
      description: 'Services, schedules and money',
      importance: 4,   // HIGH — heads-up banner with the default sound
      visibility: 1,   // show on the lock screen
      vibration: true, // buzz as well as ring
    });
  } catch { ready = false; }
}

/** One banner. The id keeps repeats from stacking (row id fits Android's int). */
export function localNotify(id: number, title: string, body: string): void {
  const p = plugin();
  if (!p) return;
  void ensureNotifyReady().then(() =>
    p.schedule({
      notifications: [{ id: id % 2147483647, title, body, channelId: CHANNEL }],
    }).catch(() => {}),
  );
}
