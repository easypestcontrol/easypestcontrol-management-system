/* ============================================================================
   Closed-app push registration. When the PestOps Field APK carries the
   @capacitor/push-notifications plugin (added the moment Firebase keys
   exist), this asks Android for the FCM token, files it with the API
   (POST /devices), and routes a notification tap to the page it names.
   Until that APK exists — and always in a plain browser — every call here
   is a silent no-op, so it is safe to ship ahead of Firebase.
   ========================================================================== */

import { api } from '@/lib/api';

interface CapPush {
  requestPermissions(): Promise<{ receive?: string }>;
  register(): Promise<void>;
  addListener(
    event: string,
    cb: (data: { value?: string; notification?: { data?: { ref?: string } } }) => void,
  ): unknown;
}

function plugin(): CapPush | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Capacitor?: { Plugins?: { PushNotifications?: CapPush } } };
  return w.Capacitor?.Plugins?.PushNotifications || null;
}

/** The document id in a notification decides where a tap lands. */
export function refToPath(ref: string): string {
  if (/^(JOB|SER)-/.test(ref)) return '/jobs/' + ref;
  if (/^INV-/.test(ref)) return '/invoices/' + ref;
  if (/^QUO-/.test(ref)) return '/quotations/' + ref;
  if (/^(AMC|CON)-/.test(ref)) return '/contracts/' + ref;
  if (/^TR-/.test(ref)) return '/training';
  if (/^LD-/.test(ref)) return '/leads';
  return '';
}

let started = false;

/** Call once after login. Registers this phone for closed-app pushes. */
export function initPush(navigate: (path: string) => void): void {
  const p = plugin();
  if (!p || started) return;
  started = true;

  p.addListener('registration', (data) => {
    const token = String(data.value || '');
    if (!token) return;
    localStorage.setItem('pestops.fcm', token);
    api.post('/devices', { token, platform: 'android' }).catch(() => {});
  });

  p.addListener('pushNotificationActionPerformed', (data) => {
    const path = refToPath(String(data.notification?.data?.ref || ''));
    if (path) navigate(path);
  });

  p.requestPermissions()
    .then((s) => { if (s.receive !== 'denied') return p.register(); })
    .catch(() => {});
}

/** Call on logout — this phone stops being an address for that person. */
export function forgetPush(): void {
  const token = localStorage.getItem('pestops.fcm');
  if (token) {
    localStorage.removeItem('pestops.fcm');
    api.del('/devices?token=' + encodeURIComponent(token)).catch(() => {});
  }
  started = false;
}
