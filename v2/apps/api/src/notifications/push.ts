/* ============================================================================
   Push delivery. One watcher on the Notification table: every row anyone
   writes — assignment, reschedule, cash confirmed, all of it — fans out to
   the phones registered in Device, via FCM. No controller has to know push
   exists; writing the bell row IS sending the notification.

   FCM needs a Firebase service account. Drop the JSON at
   apps/api/firebase-sa.json (or point FIREBASE_SA_PATH at it) and pushes
   start on the next tick — no restart, no code change. Until then the
   watcher idles and the bell + in-app banners still work. Ready for the VPS:
   nothing here assumes a LAN.

   Also owns the two daily schedules (each writes rows, so they push too):
   ~07:00 the technician's day digest; ~18:00 the unassigned-tomorrow check.
   ========================================================================== */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';

/* ------------------------------------------------------- service account */

interface SA { client_email: string; private_key: string; project_id: string; token_uri?: string }

let saLoaded = false;
let sa: SA | null = null;
let oauth: { token: string; exp: number } | null = null;

function serviceAccount(): SA | null {
  // Re-check the file while unconfigured, so dropping it in just works.
  if (saLoaded && sa) return sa;
  const p = process.env.FIREBASE_SA_PATH || path.join(process.cwd(), 'firebase-sa.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as SA;
    sa = j.client_email && j.private_key && j.project_id ? j : null;
  } catch { sa = null; }
  saLoaded = true;
  if (!sa) saLoaded = false; // keep watching for the file
  return sa;
}

/** OAuth for FCM v1 — a self-signed RS256 JWT swapped for an access token. */
async function fcmToken(): Promise<string | null> {
  const s = serviceAccount();
  if (!s) return null;
  const now = Math.floor(Date.now() / 1000);
  if (oauth && oauth.exp > now + 60) return oauth.token;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const aud = s.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: s.client_email, aud, iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(s.private_key)
    .toString('base64url');
  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='
      + unsigned + '.' + sig,
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  oauth = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return oauth.token;
}

/* --------------------------------------------------------------- sending */

// The document id inside the text becomes the deep link on tap.
const REF = /\b(?:JOB|SER|TSK|EXR|INV|QUO|AMC|CON|SVC|TR|LD|RCT|RCPT)-[A-Za-z0-9-]+/;

async function pushRow(prisma: PrismaClient, row: { userId: string; text: string }) {
  const s = serviceAccount();
  if (!s) return;
  const tok = await fcmToken();
  if (!tok) return;
  const devices = await prisma.device.findMany(
    row.userId ? { where: { userId: row.userId } } : undefined,
  );
  for (const d of devices) {
    try {
      const r = await fetch(
        'https://fcm.googleapis.com/v1/projects/' + s.project_id + '/messages:send',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title: 'PestOps', body: row.text },
              android: {
                priority: 'high',
                notification: { channel_id: 'pestops-alerts', default_sound: true },
              },
              data: { ref: (REF.exec(row.text) || [''])[0] },
            },
          }),
        },
      );
      // Google says the phone is gone — stop addressing it.
      if (r.status === 404 || r.status === 410) {
        await prisma.device.delete({ where: { id: d.id } }).catch(() => {});
      }
    } catch { /* one dead send never stalls the loop */ }
  }
}

/* ------------------------------------------------------------- schedules */

function stampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function isoDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Once-a-day gate on a Seq row (value = yyyymmdd of the last firing). */
async function onceToday(prisma: PrismaClient, key: string): Promise<boolean> {
  const d = new Date();
  const stamp = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const s = await prisma.seq.findUnique({ where: { key } });
  if (s && s.value >= stamp) return false;
  if (s) await prisma.seq.update({ where: { key }, data: { value: stamp } });
  else await prisma.seq.create({ data: { key, value: stamp } });
  return true;
}

/** ~07:00 — each field technician hears what their day looks like. */
async function morningDigest(prisma: PrismaClient) {
  const jobs = await prisma.job.findMany({
    where: { date: isoDay(0), status: { notIn: ['completed', 'cancelled'] } },
    orderBy: { slot: 'asc' },
  });
  if (!jobs.length) return;
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const byTech = new Map<string, typeof jobs>();
  for (const j of jobs) {
    for (const t of j.techIds) {
      if (!byTech.has(t)) byTech.set(t, []);
      byTech.get(t)!.push(j);
    }
  }
  const at = stampNow();
  for (const [techId, list] of byTech) {
    const first = list[0];
    await prisma.notification.create({
      data: {
        userId: techId, at,
        text: `Today: ${list.length} service${list.length > 1 ? 's' : ''}. First at ${first.slot} — ${nameOf.get(first.clientId) || first.clientId}. (${first.id})`,
      },
    });
  }
}

/** ~18:00 — tomorrow's services still without a technician, to the office. */
async function eveningUnassigned(prisma: PrismaClient) {
  const open = await prisma.job.findMany({
    where: { date: isoDay(1), status: { notIn: ['completed', 'cancelled'] }, techIds: { isEmpty: true } },
  });
  if (!open.length) return;
  const office = await prisma.user.findMany({ where: { role: { in: ['admin', 'ops'] } } });
  const at = stampNow();
  await prisma.notification.createMany({
    data: office.map((u) => ({
      userId: u.id, at,
      text: `${open.length} service${open.length > 1 ? 's' : ''} tomorrow still ${open.length > 1 ? 'have' : 'has'} no technician. (${open[0].id})`,
    })),
  });
}

/* ------------------------------------------------------------- the loop */

export function startPushWatcher(prisma: PrismaClient) {
  let cursor = -1;
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (cursor < 0) {
        // First run ever starts at the current tail — history is not blasted
        // to phones; restarts resume exactly where the last send stopped.
        const s = await prisma.seq.findUnique({ where: { key: 'push-cursor' } });
        if (s) cursor = s.value;
        else {
          const last = await prisma.notification.findFirst({ orderBy: { id: 'desc' } });
          cursor = last?.id || 0;
          await prisma.seq.create({ data: { key: 'push-cursor', value: cursor } });
        }
      }
      const rows = await prisma.notification.findMany({
        where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 40,
      });
      for (const row of rows) {
        await pushRow(prisma, row);
        cursor = row.id;
      }
      if (rows.length) {
        await prisma.seq.update({ where: { key: 'push-cursor' }, data: { value: cursor } });
      }

      const hour = new Date().getHours();
      if (hour >= 7 && (await onceToday(prisma, 'digest-am'))) await morningDigest(prisma);
      if (hour >= 18 && (await onceToday(prisma, 'digest-pm'))) await eveningUnassigned(prisma);
    } catch { /* transient — next tick retries */ }
    busy = false;
  };

  setInterval(tick, 15000);
  void tick();
}
