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
    id: string; name: string; description?: string; importance: number;
  }): Promise<void>;
  schedule(opts: {
    notifications: Array<{ id: number; title: string; body: string; channelId?: string }>;
  }): Promise<unknown>;
}

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
    // Sound is a channel property on Android; no sound named = system default.
    await p.createChannel?.({
      id: 'pestops-alerts',
      name: 'PestOps alerts',
      description: 'Services, schedules and money',
      importance: 5, // heads-up banner
    });
  } catch { ready = false; }
}

/** One banner. The id keeps repeats from stacking (row id fits Android's int). */
export function localNotify(id: number, title: string, body: string): void {
  const p = plugin();
  if (!p) return;
  void ensureNotifyReady().then(() =>
    p.schedule({
      notifications: [{ id: id % 2147483647, title, body, channelId: 'pestops-alerts' }],
    }).catch(() => {}),
  );
}
