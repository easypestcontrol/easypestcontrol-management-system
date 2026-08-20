import type { CapacitorConfig } from '@capacitor/cli';

/**
 * PestOps Field — the technician Android app.
 *
 * The app is a native shell around the live PestOps server: it loads the
 * same field experience the technicians use (My Services, execution steps,
 * Trip with GPS + Ola map, Training, Wallet, collections). Because it points
 * at the server, EVERY server update reaches every installed app instantly —
 * no Play-Store redeploys.
 *
 * server.url:
 *   - Testing on the office Wi-Fi:  http://<this PC's LAN IP>:3050 — phone and
 *     PC must be on the same network. The IP comes from the router's DHCP and
 *     CAN DRIFT (it already moved .7 → .3); reserve it in the router, or wait
 *     for the VPS domain which ends this problem for good.
 *   - After the VPS goes live:      https://your-domain  (change and rebuild once)
 */
const config: CapacitorConfig = {
  appId: 'com.pestops.field',
  appName: 'PestOps Field',
  webDir: 'www',
  server: {
    url: 'http://192.168.1.3:3050',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
