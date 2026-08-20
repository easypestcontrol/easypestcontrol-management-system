/* ============================================================================
   Move the database to UTF8.

   The dev cluster was initialised on a Windows machine set to English (India),
   so `createdb` inherited WIN1252. That encoding has no rupee sign and no Tamil
   script — a note containing "₹" or a customer named in Tamil fails the INSERT
   outright, and Postgres answers with a 500 from wherever the write happened.

   The bundled Postgres ships no pg_dump, so this copies row by row through
   Prisma instead. It is deliberately additive and reversible:

     · the new database is created alongside the old one
     · everything is copied and the row counts are compared
     · the old database is left untouched as the backup
     · .env is only rewritten once every table matches

   If anything goes wrong, nothing has been lost: point DATABASE_URL back at
   `pestops` and you are where you started.

   Run it with the API stopped, from v2:   node scripts/to-utf8.mjs
   ========================================================================== */
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV = path.join(root, 'apps', 'api', '.env');
const OLD = 'pestops';
const NEW = 'pestops_utf8';
const BASE = 'postgresql://pestops:pestops@127.0.0.1:5455/';

/* Parents before children: every table is copied after whatever it points at. */
const ORDER = [
  'company', 'branch', 'user', 'seq', 'service', 'client', 'lead',
  'quotation', 'quoteItem', 'contract', 'planLine', 'job',
  'invoice', 'payment',
  'inventoryItem', 'branchStock', 'stockMove', 'stockIssue', 'techStock',
  'vendor', 'purchaseOrder', 'poItem',
  'trip', 'training', 'audit', 'notification', 'device',
];

async function main() {
  /* ---------------------------------------------- 1. make the new database */
  const admin = new pg.Client({ connectionString: BASE + OLD });
  await admin.connect();
  const { rows: cur } = await admin.query(
    'select pg_encoding_to_char(encoding) enc from pg_database where datname = $1', [OLD],
  );
  console.log(`${OLD} is ${cur[0]?.enc}`);
  if (cur[0]?.enc === 'UTF8') {
    console.log('Already UTF8 — nothing to do.');
    await admin.end();
    return;
  }
  await admin.query(`drop database if exists ${NEW}`);
  await admin.query(
    `create database ${NEW} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`,
  );
  await admin.end();
  console.log(`created ${NEW} in UTF8`);

  /* ------------------------------------------- 2. put the schema on it */
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: path.join(root, 'apps', 'api'),
    env: { ...process.env, DATABASE_URL: BASE + NEW },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  /* ------------------------------------------------- 3. copy every row */
  const src = new PrismaClient({ datasources: { db: { url: BASE + OLD } } });
  const dst = new PrismaClient({ datasources: { db: { url: BASE + NEW } } });

  const counts = [];
  for (const model of ORDER) {
    if (!src[model]) { console.log(`  (no model ${model}, skipped)`); continue; }
    const rows = await src[model].findMany();
    if (rows.length) {
      // One at a time: createMany skips nested types on some providers, and a
      // row that will not copy should name itself rather than fail a batch.
      for (const r of rows) {
        try {
          await dst[model].create({ data: r });
        } catch (e) {
          console.error(`  ! ${model} ${r.id ?? ''}: ${e.message.split('\n')[0]}`);
        }
      }
    }
    const got = await dst[model].count();
    counts.push({ model, from: rows.length, to: got, ok: rows.length === got });
    console.log(`  ${rows.length === got ? '✓' : '✗'} ${model}: ${rows.length} → ${got}`);
  }

  /* ------------------------------------- 3b. move the id sequences forward

     Copying rows with their original ids leaves every `autoincrement()`
     sequence sitting at zero, so the next insert asks for id 1 — which already
     exists. The table looks perfect and the very next write fails on a unique
     constraint. Set each sequence past the largest id it has to beat.        */
  const seqs = await dst.$queryRawUnsafe(`
    select s.relname as seq, t.relname as tbl, a.attname as col
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype = 'a'
    join pg_class t on t.oid = d.refobjid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S'
    order by t.relname
  `);
  for (const q of seqs) {
    const [{ max }] = await dst.$queryRawUnsafe(
      `select coalesce(max("${q.col}"), 0) as max from "${q.tbl}"`,
    );
    const next = Number(max);
    await dst.$queryRawUnsafe(
      `select setval('"${q.seq}"', ${next > 0 ? next : 1}, ${next > 0})`,
    );
    console.log(`  seq ${q.tbl}.${q.col} → next id ${next + 1}`);
  }

  await src.$disconnect();
  await dst.$disconnect();

  /* ------------------------------------------------------- 4. the verdict */
  const bad = counts.filter((c) => !c.ok);
  if (bad.length) {
    console.error('\nNOT switching over — these tables did not copy cleanly:');
    bad.forEach((c) => console.error(`  ${c.model}: ${c.from} → ${c.to}`));
    console.error(`\n${OLD} is untouched. Fix the cause and run again.`);
    process.exit(1);
  }

  const env = fs.readFileSync(ENV, 'utf8');
  fs.writeFileSync(ENV + '.win1252.bak', env);
  fs.writeFileSync(ENV, env.replace(`/${OLD}"`, `/${NEW}"`));
  console.log(`\nEverything copied. .env now points at ${NEW}; the old .env is at .env.win1252.bak`);
  console.log(`${OLD} is still there as the backup — drop it once you are happy.`);
  console.log('Restart the API.');
}

main().catch((e) => { console.error(e); process.exit(1); });
