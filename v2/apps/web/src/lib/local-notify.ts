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

/* A sound the app makes itself, independent of the Android notification
   channel. A channel's tone is frozen when it is first created and has proved
   unreliable across installs, so we also ring through WebAudio — the media
   stream, audible whenever the app is open, which is the only moment a local
   notification fires at all — with a vibration for a muted phone. The context
   is unlocked on the first touch so later chimes need no fresh gesture. */
let audioCtx: AudioContext | null = null;
let lastChime = 0;

function ac(): AudioContext | null {
  try {
    const W = window as unknown as {
      AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext;
    };
    const AC = W.AudioContext || W.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

if (typeof window !== 'undefined') {
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });
}

/** A two-note chime and a buzz. Debounced so a burst of five alerts once. */
export function playChime(): void {
  const now = Date.now();
  if (now - lastChime < 1500) return;
  lastChime = now;
  try { navigator.vibrate?.([140, 70, 140]); } catch { /* no vibrator here */ }
  try {
    const ctx = ac();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const note = (freq: number, at: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.45, t + at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    note(880, 0, 0.2);        // A5
    note(1318.5, 0.18, 0.3);  // up to E6
  } catch { /* stayed quiet; the vibration already fired */ }
}

/** One banner. The id keeps repeats from stacking (row id fits Android's int). */
export function localNotify(id: number, title: string, body: string): void {
  playChime(); // ring/buzz even if the OS channel is silent
  const p = plugin();
  if (!p) return;
  void ensureNotifyReady().then(() =>
    p.schedule({
      notifications: [{ id: id % 2147483647, title, body, channelId: CHANNEL }],
    }).catch(() => {}),
  );
}
