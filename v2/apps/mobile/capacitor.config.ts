import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Easy Pest Control — the technician Android app.
 *
 * The app is a native shell around the live PestOps server: it loads the
 * same field experience the technicians use (My Services, execution steps,
 * Trip with GPS + Ola map, Training, Wallet, collections). Because it points
 * at the server, EVERY server update reaches every installed app instantly —
 * no Play-Store redeploys.
 *
 * server.url:
 *   The company's own domain, over HTTPS. The site proxies /api to the VPS
 *   itself, so the phone never talks to a raw IP address and needs no
 *   cleartext exception — and every server deploy reaches every installed
 *   phone without a new APK.
 *
 *   This is the one setting that requires a rebuild to change, which is why
 *   it names a domain rather than a host that can move.
 */
const config: CapacitorConfig = {
  appId: 'com.pestops.field',
  appName: 'Easy Pest Control',
  webDir: 'www',
  server: {
    url: 'https://app.easypestcontrol.in',
  },
};

export default config;
