/* Opening WhatsApp is not the job — opening it on the right conversation is.
   These are the shapes Indian numbers actually arrive in.                   */
import { waNumber, waLink } from './dist/index.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

const cases = [
  ['9750977532',        '919750977532', 'a bare ten-digit mobile'],
  ['+91 97509 77532',   '919750977532', 'written with +91 and spaces'],
  ['+919750977532',     '919750977532', 'already carrying +91'],
  ['919750977532',      '919750977532', 'twelve digits, no plus'],
  ['09750977532',       '919750977532', 'a trunk zero in front'],
  ['0 97509 77532',     '919750977532', 'trunk zero and spaces'],
  ['97509-77532',       '919750977532', 'written with a dash'],
  ['+91 (97509) 77532', '919750977532', 'brackets, because people do that'],
  ['+971 50 123 4567',  '971501234567', 'a UAE number keeps its own code'],
];
for (const [raw, want, why] of cases) {
  const got = waNumber(raw);
  ok(why, got === want, JSON.stringify(raw) + ' -> ' + got);
}

for (const bad of ['', null, undefined, '—', 'not a number', '12345']) {
  ok('no number for ' + JSON.stringify(bad), waNumber(bad) === null, String(waNumber(bad)));
}

/* --------------------------------------------------------------- the link */
{
  const l = waLink('9750977532', 'Invoice INV-1 — ₹100');
  ok('the link carries the number', l.startsWith('https://wa.me/919750977532?text='), l);
  ok('and the message is escaped', l.includes('%E2%82%B9'), l);

  const none = waLink('', 'hello');
  ok('no number falls back to the picker rather than a dead button',
    none === 'https://wa.me/?text=hello', none);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
