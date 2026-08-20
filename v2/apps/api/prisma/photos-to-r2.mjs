/* ============================================================================
   Move the photographs already in PostgreSQL out to R2.

   Everything taken before storage was wired lives as base64 inside each job's
   `exec` column. New photographs go straight to R2; these do not, and they are
   the bulk of the database.

   Run it on the VPS, with the API's environment, after R2 is configured:

       docker compose exec api node prisma/photos-to-r2.mjs --dry-run
       docker compose exec api node prisma/photos-to-r2.mjs

   `--dry-run` reports what it would move and touches nothing.

   Safe to run twice: anything already stored as a key is skipped. Each job is
   written back only after every one of its photographs has uploaded, so an
   interruption leaves that job entirely un-migrated rather than half of it —
   and running again picks it up.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

const account = process.env.R2_ACCOUNT_ID || '';
const bucket = process.env.R2_BUCKET || '';
const s3 = account && bucket && process.env.R2_ACCESS_KEY_ID
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const kb = (n) => Math.round(n / 1024);
const isData = (v) => typeof v === 'string' && v.startsWith('data:');

async function put(dataUrl, folder) {
  const [head, b64] = dataUrl.split(';base64,');
  if (!b64) return dataUrl;
  const type = head.slice(5) || 'application/octet-stream';
  const ext = type.split('/')[1]?.split('+')[0] || 'bin';
  const key = `${folder}/${randomUUID()}.${ext}`;
  if (DRY) return 'r2:' + key;
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: Buffer.from(b64, 'base64'), ContentType: type,
  }));
  return 'r2:' + key;
}

async function main() {
  if (!s3 && !DRY) {
    console.error('R2 is not configured — set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and');
    console.error('R2_SECRET_ACCESS_KEY, or run with --dry-run to see what would move.');
    process.exit(1);
  }
  if (DRY) console.log('DRY RUN — nothing will be uploaded or written.\n');

  // `exec` is optional Json. Prisma will not take `NOT: { exec: null }` on a
  // nullable Json column, so filter in code — there are not enough jobs for it
  // to matter, and a wrong query is worse than a full scan.
  const jobs = (await prisma.job.findMany()).filter((j) => j.exec);
  let moved = 0;
  let bytes = 0;
  let touched = 0;

  for (const j of jobs) {
    const x = j.exec;
    if (!x || typeof x !== 'object') continue;
    let changed = false;

    for (const kind of ['photosBefore', 'photosAfter']) {
      const list = Array.isArray(x[kind]) ? x[kind] : [];
      for (let i = 0; i < list.length; i += 1) {
        if (!isData(list[i])) continue;
        bytes += list[i].length;
        list[i] = await put(list[i], `jobs/${j.id}/${kind === 'photosBefore' ? 'before' : 'after'}`);
        moved += 1;
        changed = true;
      }
    }

    if (isData(x.signatureImage)) {
      bytes += x.signatureImage.length;
      x.signatureImage = await put(x.signatureImage, `jobs/${j.id}/signature`);
      moved += 1;
      changed = true;
    }

    if (x.uniformPhotos && typeof x.uniformPhotos === 'object') {
      for (const [who, v] of Object.entries(x.uniformPhotos)) {
        if (!isData(v)) continue;
        bytes += v.length;
        x.uniformPhotos[who] = await put(v, `jobs/${j.id}/uniform`);
        moved += 1;
        changed = true;
      }
    }

    // Written once, after every photograph on this job is safely uploaded.
    if (changed) {
      if (!DRY) await prisma.job.update({ where: { id: j.id }, data: { exec: x } });
      touched += 1;
      console.log(`  ${j.id}`);
    }
  }

  console.log(`\n${moved} photograph(s) across ${touched} service(s), ${kb(bytes)} KB of base64.`);
  if (DRY) {
    console.log('Nothing was changed. Run without --dry-run to move them.');
  } else {
    console.log('Reclaim the space PostgreSQL is still holding:');
    console.log('  docker compose exec db psql -U pestops -d pestops -c \'VACUUM FULL "Job";\'');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
