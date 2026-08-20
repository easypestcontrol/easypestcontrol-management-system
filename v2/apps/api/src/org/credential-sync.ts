/* ============================================================================
   Reading real usage off the services this app runs on.

   Nobody types a usage figure, and nobody types a credential either. Every
   service here is one the app already talks to, with keys it already holds:

     VPS            the API runs on it, so it reads its own disk, memory and
                    network. No credential exists to configure.
     Cloudflare R2  the same keys the app stores photographs with, from the
                    server environment. Usage is measured by listing the bucket
                    — no second analytics token to create and rotate.
     Ola Maps       no usage endpoint exists, so the app counts its own calls.
                    The key in Settings → Integrations is the one being metered.
     Razorpay       the keys from Settings → Integrations, reporting the
                    month's captured payments.

   That is the whole point of the page: a credential you have to re-enter here
   is a credential that will drift from the one actually in use, and then the
   figures describe a service you are not running.

   A sync that cannot work says why rather than leaving a stale figure looking
   current.
   ========================================================================== */
import { statfs } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

/**
 * A reading that cannot be taken *and* whose old figures must go.
 *
 * A transient failure — Cloudflare timing out — should leave the last good
 * number alone. A misconfiguration must not: figures measured on the wrong
 * machine, or under a key that has been revoked, are worse than a blank,
 * because a blank prompts a question and a wrong number does not.
 */
export class UsageUnavailable extends Error {
  wipe = true;
}

export interface QuotaReading {
  label: string;
  used: number;
  /** 0 leaves whatever limit is already recorded — the plan decides it. */
  limit?: number;
  unit: string;
  note?: string;
}

export interface SyncInput {
  service: string;
  apiKey: string;
  apiSecret: string;
  accountRef: string;
  resourceRef: string;
  /** Counts this app kept itself, keyed by meter name. */
  selfCounts: Record<string, number>;
}

const GB = 1024 * 1024 * 1024;
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------ Cloudflare R2 */

/**
 * Measured with the same keys the app stores photographs with.
 *
 * Cloudflare's analytics API would need a second token, created by hand and
 * rotated separately — and a token nobody remembers to rotate is worse than no
 * token. Listing the bucket needs nothing the app does not already have, and it
 * counts exactly what is there rather than what a dashboard thought yesterday.
 */
async function cloudflareR2(i: SyncInput): Promise<QuotaReading[]> {
  const account = process.env.R2_ACCOUNT_ID || '';
  const bucket = process.env.R2_BUCKET || '';
  const key = process.env.R2_ACCESS_KEY_ID || '';
  const secret = process.env.R2_SECRET_ACCESS_KEY || '';

  if (!account || !bucket || !key || !secret) {
    throw new UsageUnavailable(
      'R2 is not configured on the server. Set R2_ACCOUNT_ID, R2_BUCKET, '
      + 'R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in deploy/.env and restart the API — '
      + 'the same keys that store the photographs are the ones measured here.',
    );
  }

  const { ListObjectsV2Command, S3Client } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });

  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  // Paginated: a thousand keys per call, and a busy bucket has more than that.
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, ContinuationToken: token,
    }));
    for (const o of page.Contents || []) {
      bytes += o.Size || 0;
      objects += 1;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return [
    // Cloudflare's free tier is 10 GB stored; past that it is billed per GB.
    { label: 'Storage', used: round1(bytes / GB), limit: 10, unit: 'GB' },
    { label: 'Objects', used: objects, unit: 'files stored' },
  ];
}

/* --------------------------------------------------------------------- VPS */

async function vps(): Promise<QuotaReading[]> {
  /*
   * This reads the machine the API process is on — which is the VPS only when
   * the app has actually been deployed to it. Running locally it would report
   * the developer's laptop as though it were the server, which is how you end
   * up staring at "96% disk" for a machine that does not exist yet.
   *
   * Linux is the signal: the VPS runs Linux, the development machines here do
   * not. Refuse rather than mislead.
   */
  const host = `${os.hostname()} · ${os.platform()}`;
  if (os.platform() !== 'linux') {
    throw new UsageUnavailable(
      `These figures would be ${os.hostname()}'s, not your VPS — the API is running on `
      + `${os.platform() === 'win32' ? 'Windows' : os.platform()}, so this is a development `
      + 'machine. Deploy to the VPS and it will report its own disk, memory and bandwidth.',
    );
  }

  const out: QuotaReading[] = [];

  // Memory, from the machine this process is on.
  const totalGb = round1(os.totalmem() / GB);
  out.push({
    label: 'Memory',
    used: round1((os.totalmem() - os.freemem()) / GB),
    limit: totalGb,
    unit: 'GB',
    note: host,
  });

  // Disk on the volume the app lives on.
  try {
    const fs = await statfs(process.cwd());
    const total = fs.blocks * fs.bsize;
    const free = fs.bavail * fs.bsize;
    out.push({
      label: 'Disk',
      used: round1((total - free) / GB),
      limit: round1(total / GB),
      unit: 'GB',
      note: host,
    });
  } catch { /* not every filesystem answers statfs */ }

  // Bandwidth since boot, Linux only. A VPS bills on the month, so this is a
  // floor rather than the billed figure — labelled honestly.
  try {
    const raw = await readFile('/proc/net/dev', 'utf8');
    let bytes = 0;
    for (const line of raw.split('\n').slice(2)) {
      const [iface, rest] = line.split(':');
      if (!rest || /^\s*lo\s*$/.test(iface)) continue;
      const cols = rest.trim().split(/\s+/).map(Number);
      bytes += (cols[0] || 0) + (cols[8] || 0); // received + transmitted
    }
    if (bytes > 0) {
      out.push({
        label: 'Bandwidth',
        used: round1(bytes / GB),
        unit: 'GB since boot',
        note: `${host} — since it last started, not the billing month`,
      });
    }
  } catch { /* not Linux — no /proc */ }

  return out;
}

/* --------------------------------------------------------------- Ola Maps */

function olaMaps(i: SyncInput): QuotaReading[] {
  // Ola publishes no usage endpoint, so the honest figure is the one we keep:
  // every geocode, autocomplete and route this app has asked for this month.
  return [{
    label: 'API calls',
    used: i.selfCounts.ola || 0,
    unit: 'calls / month',
    note: 'counted by this app — Ola publishes no usage endpoint',
  }];
}

/* --------------------------------------------------------------- Razorpay */

/**
 * The keys from Settings → Integrations — the same ones that raise the UPI QR
 * codes. There is no quota to run out of; what matters is the month's volume,
 * because the fee follows it.
 */
async function razorpay(i: SyncInput): Promise<QuotaReading[]> {
  if (!i.apiKey || !i.apiSecret) {
    throw new UsageUnavailable(
      'Razorpay is not connected — add the key id and secret in Settings → Integrations. '
      + 'The same keys collect the UPI payments.',
    );
  }
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const r = await fetch(
    `https://api.razorpay.com/v1/payments?count=100&from=${Math.floor(from.getTime() / 1000)}`,
    { headers: { Authorization: 'Basic ' + Buffer.from(i.apiKey + ':' + i.apiSecret).toString('base64') } },
  );
  const body = (await r.json()) as {
    items?: Array<{ status: string; amount: number }>;
    error?: { description?: string };
  };
  if (!r.ok) throw new Error('Razorpay: ' + (body.error?.description || 'refused the request'));

  const captured = (body.items || []).filter((p) => p.status === 'captured');
  return [
    { label: 'Payments captured', used: captured.length, unit: 'this month' },
    {
      label: 'Value collected',
      used: Math.round(captured.reduce((a, p) => a + p.amount, 0) / 100),
      unit: 'rupees this month',
      note: 'charged per transaction — no ceiling to run out of',
    },
  ];
}

/* ------------------------------------------------------------------ router */

export async function readUsage(i: SyncInput): Promise<QuotaReading[]> {
  switch (i.service) {
    case 'Cloudflare R2': return cloudflareR2(i);
    case 'VPS': return vps();
    case 'Ola Maps': return olaMaps(i);
    case 'Razorpay': return razorpay(i);
    default:
      throw new UsageUnavailable(
        `No usage reader for ${i.service} — its figures cannot be fetched automatically`,
      );
  }
}

/** Which services can answer at all, so the screen only offers Sync where it works. */
export const SYNCABLE = ['Cloudflare R2', 'VPS', 'Ola Maps', 'Razorpay'];

/**
 * What each service needs before a sync is worth attempting — and where it
 * comes from. Nothing on this list is entered on the Credentials page itself.
 */
export const NEEDS: Record<string, string[]> = {
  'Cloudflare R2': [],  // the server environment
  Razorpay: ['apiKey', 'apiSecret'], // Settings → Integrations
  'Ola Maps': [],
  VPS: [],
};
