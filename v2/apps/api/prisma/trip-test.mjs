/* Distance is money — it becomes a kilometre reimbursement — so the two ways
   it goes wrong are both tested here, against the running server.

     · a van that never moved must not accumulate distance from GPS jitter
     · a van that did move must not have that movement thrown away

   Needs the API running:  node --env-file=.env dist/main.js                 */
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:4000/api';
const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

async function token() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@easypest.com', password: 'easypest@2026' }),
  });
  return (await r.json()).token;
}
const tok = await token();

/** Metres → degrees, near Chennai. */
const dLat = (m) => m / 111320;

async function trip() {
  const r = await fetch(API + '/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({ purpose: 'distance test' }),
  });
  const j = await r.json();
  if (!j.id) throw new Error('could not start a trip: ' + JSON.stringify(j).slice(0, 160));
  return j.id;
}
async function ping(id, lat, lng, acc) {
  const r = await fetch(API + '/trips/' + id + '/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({ lat, lng, acc }),
  });
  return r.json();
}
const cleanup = async (id) => {
  await prisma.trip.deleteMany({ where: { id } });
};

console.log('\n  WHAT THE ODOMETER COUNTS\n');

/* ------------------------- 1. parked, poor signal: jitter is not a journey */
{
  const id = await trip();
  const base = 13.0000, lng = 80.2000;
  let last;
  // twenty fixes, each wandering up to ±12 m, accuracy 20 m — a parked van
  const wobble = [7, -9, 11, -6, 4, -12, 8, -3, 10, -7, 5, -11, 9, -4, 6, -8, 12, -5, 3, -10];
  for (const w of wobble) last = await ping(id, base + dLat(w), lng, 20);
  ok('a parked van accumulates nothing', last.distanceM === 0, 'distanceM=' + last.distanceM);
  await cleanup(id);
}

/* ------------------------------ 2. actually driving, with a good fix */
{
  const id = await trip();
  const lng = 80.2000;
  let last;
  // ten hops of 120 m — four seconds apart at about 100 km/h
  for (let i = 0; i <= 10; i++) last = await ping(id, 13.0000 + dLat(i * 120), lng, 8);
  const km = (last.distanceM / 1000).toFixed(2);
  ok('1.2 km driven is 1.2 km counted', Math.abs(last.distanceM - 1200) <= 20,
    'distanceM=' + last.distanceM + ' (' + km + ' km)');
  await cleanup(id);
}

/* ------------------- 3. crawling in traffic with an accurate phone counts */
{
  const id = await trip();
  const lng = 80.2000;
  let last;
  // 6 m every four seconds — about 5 km/h, accuracy 5 m
  for (let i = 0; i <= 20; i++) last = await ping(id, 13.0000 + dLat(i * 6), lng, 5);
  ok('a slow crawl is still movement', last.distanceM >= 110,
    'distanceM=' + last.distanceM + ' of 120');
  await cleanup(id);
}

/* ---------------------------- 4. a wild fix is refused outright */
{
  const id = await trip();
  await ping(id, 13.0000, 80.2000, 10);
  const r = await ping(id, 13.5000, 80.2000, 400);   // 55 km away, useless accuracy
  ok('an unusable fix adds nothing', r.distanceM === 0, 'distanceM=' + r.distanceM);
  await cleanup(id);
}

await prisma.$disconnect();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
