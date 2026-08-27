/* ============================================================================
   The development database — real PostgreSQL, no system install.

   Downloads platform binaries on first run, keeps its data in v2/.pgdata, and
   listens on 5455 (matching apps/api/.env). Ctrl+C stops it cleanly. On the
   VPS this is replaced by the docker-compose Postgres — see deploy/DEPLOY.md.
   ========================================================================== */
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, '.pgdata'),
  user: 'pestops',
  password: 'pestops',
  port: 5455,
  persistent: true,
});

const fresh = !(await import('node:fs')).existsSync(path.join(root, '.pgdata', 'PG_VERSION'));

if (fresh) {
  console.log('First run — initialising the cluster…');
  await pg.initialise();
}
await pg.start();
/*
 * Always attempt — a crash between initialise and create leaves a cluster
 * with no database, and "already exists" is a fine answer.
 *
 * The database MUST be UTF8. `createDatabase` inherits the cluster default,
 * which on a Windows machine set to English (India) is WIN1252 — an encoding
 * with no rupee sign and no Tamil script at all. A note containing "₹" or a
 * customer named in Tamil then fails the INSERT outright, and the first
 * symptom is a 500 from somewhere that looks unrelated.
 */
try {
  await pg.createDatabase('pestops');
} catch { /* exists */ }

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query(
  "select pg_encoding_to_char(encoding) enc from pg_database where datname = 'pestops'",
);
const enc = rows[0]?.enc;
if (enc && enc !== 'UTF8') {
  console.error(`
  WARNING: the 'pestops' database is ${enc}, not UTF8.`);
  console.error("  It cannot store ₹ or Tamil text — writes containing them fail with a 500.");
  console.error('  Fix: node scripts/to-utf8.mjs (copies everything into a UTF8 database).');
}
await client.end();

console.log('PostgreSQL ready on postgresql://pestops:pestops@127.0.0.1:5455/pestops');
console.log('Leave this running. Ctrl+C to stop.');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\nStopping…');
    await pg.stop();
    process.exit(0);
  });
}
