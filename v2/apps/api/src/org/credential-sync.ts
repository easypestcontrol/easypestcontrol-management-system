/* ============================================================================
   Reading real usage off the providers.

   Nobody types a usage figure. A number somebody typed is out of date the
   moment they stop typing, and the whole reason to look at this page is to
   trust what it says. So each service knows how to fetch its own.

   What is actually possible differs by provider, and pretending otherwise
   would be worse than saying so:

     Cloudflare R2  real. The GraphQL analytics API reports stored bytes and
                    operation counts against an account id.
     VPS            real, and better than an API — *provided the app is
                    actually running on the VPS*. It reads the machine it is
                    on, so on a development laptop it would report the laptop.
                    It refuses rather than doing that, because a real number
                    about the wrong machine is worse than no number.
     Ola Maps       no usage endpoint exists. We count our own calls instead —
                    every geocode and route this app makes, per month. That is
                    the number that matters anyway, since it is what they bill.
     Razorpay       no quota to run out of. We report the month's captured
                    payments so the transaction fee is predictable.

   A sync that cannot work says why, in `syncError`, rather than leaving a
   stale figure looking current.
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

async function cloudflareR2(i: SyncInput): Promise<QuotaReading[]> {
  if (!i.apiKey) throw new UsageUnavailable('Add a Cloudflare API token with Account Analytics read access');
  if (!i.accountRef) throw new UsageUnavailable('Add the Cloudflare account id');

  const since = new Date();
  since.setDate(1);
  const from = since.toISOString().slice(0, 10);

  const query = `
    query R2($account: String!, $from: Date!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          storage: r2StorageAdaptiveGroups(
            limit: 1, filter: { date_geq: $from },
            orderBy: [date_DESC]
          ) { max { payloadSize objectCount } }
          ops: r2OperationsAdaptiveGroups(
            limit: 100, filter: { date_geq: $from }
          ) { sum { requests } dimensions { actionType } }
        }
      }
    }`;

  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + i.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: i.accountRef, from } }),
  });
  const body = (await r.json()) as {
    errors?: Array<{ message: string }>;
    data?: { viewer?: { accounts?: Array<{
      storage?: Array<{ max?: { payloadSize?: number; objectCount?: number } }>;
      ops?: Array<{ sum?: { requests?: number }; dimensions?: { actionType?: string } }>;
    }> } };
  };
  if (body.errors?.length) throw new Error('Cloudflare: ' + body.errors[0].message);

  const acct = body.data?.viewer?.accounts?.[0];
  if (!acct) throw new Error('Cloudflare returned no account — check the account id and the token scope');

  const bytes = acct.storage?.[0]?.max?.payloadSize || 0;
  // Class A is the expensive write-shaped set; everything else is Class B.
  const CLASS_A = new Set(['PutObject', 'CopyObject', 'CompleteMultipartUpload', 'CreateMultipartUpload', 'UploadPart', 'ListObjects', 'ListBuckets', 'PutBucket']);
  let a = 0;
  let b = 0;
  for (const row of acct.ops || []) {
    const n = row.sum?.requests || 0;
    if (CLASS_A.has(row.dimensions?.actionType || '')) a += n; else b += n;
  }

  return [
    { label: 'Storage', used: round1(bytes / GB), limit: 10, unit: 'GB' },
    { label: 'Class A operations', used: a, limit: 1000000, unit: 'ops / month' },
    { label: 'Class B operations', used: b, limit: 10000000, unit: 'ops / month' },
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

async function razorpay(i: SyncInput): Promise<QuotaReading[]> {
  if (!i.apiKey || !i.apiSecret) throw new UsageUnavailable('Add the Razorpay key id and secret');
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

/** What each one needs before a sync is worth attempting. */
export const NEEDS: Record<string, string[]> = {
  'Cloudflare R2': ['apiKey', 'accountRef'],
  Razorpay: ['apiKey', 'apiSecret'],
  'Ola Maps': [],
  VPS: [],
};
