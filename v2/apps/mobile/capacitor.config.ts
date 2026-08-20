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
 *   Vercel, over HTTPS. That is where the field experience is served, and the
 *   web app proxies /api to the VPS itself — so the phone never talks to a raw
 *   IP address, needs no cleartext exception, and every server deploy reaches
 *   every installed phone without a new APK.
 *
 *   When the custom domain exists, change this once to https://app.<domain>
 *   and rebuild. Nothing else moves.
 */
const config: CapacitorConfig = {
  appId: 'com.pestops.field',
  appName: 'Easy Pest Control',
  webDir: 'www',
  server: {
    url: 'https://easypestcontrol-management-system.vercel.app',
  },
};

export default config;
