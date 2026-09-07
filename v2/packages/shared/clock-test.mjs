/* A picker that shows the wrong half of the day books a visit at the wrong
   time and nobody notices until a technician turns up. Midnight and noon are
   where twelve-hour clocks go wrong, so they are tested hardest.           */
const pad = (n) => String(n).padStart(2, '0');

function parse(v) {
  const b = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
  if (!b) return null;
  const h = Number(b[1]), m = Number(b[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}
function label(v) {
  const t = parse(v); if (!t) return '';
  const period = t.h < 12 ? 'AM' : 'PM';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return h12 + ':' + pad(t.m) + ' ' + period;
}
// what pickHour does
const pickHour = (n12, period) =>
  period === 'AM' ? (n12 === 12 ? 0 : n12) : (n12 === 12 ? 12 : n12 + 12);
// what the AM/PM toggle does
const flip = (h24, to) => (to === 'AM' ? h24 - 12 : h24 + 12);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/* ------------------------------------------------- reading a stored time */
for (const [v, want] of [
  ['00:00', '12:00 AM'], ['00:30', '12:30 AM'], ['01:00', '1:00 AM'],
  ['09:05', '9:05 AM'],  ['11:59', '11:59 AM'], ['12:00', '12:00 PM'],
  ['12:45', '12:45 PM'], ['13:00', '1:00 PM'],  ['23:00', '11:00 PM'],
  ['23:59', '11:59 PM'],
]) ok(v + ' reads as ' + want, label(v) === want, label(v));

for (const bad of ['', null, undefined, 'nonsense', '25:00', '10:75'])
  ok('nothing shown for ' + JSON.stringify(bad), label(bad) === '', label(bad));

/* --------------------------------------------- tapping an hour on the dial */
ok('12 in the AM half is midnight', pickHour(12, 'AM') === 0, String(pickHour(12, 'AM')));
ok('12 in the PM half is noon',     pickHour(12, 'PM') === 12, String(pickHour(12, 'PM')));
ok('1 AM is 01',  pickHour(1, 'AM') === 1);
ok('1 PM is 13',  pickHour(1, 'PM') === 13);
ok('11 PM is 23', pickHour(11, 'PM') === 23);

/* ----------------------------------------------------- flipping AM and PM */
ok('9 AM to PM is 21', flip(9, 'PM') === 21);
ok('21 back to AM is 9', flip(21, 'AM') === 9);
ok('midnight to PM is noon', flip(0, 'PM') === 12);
ok('noon to AM is midnight', flip(12, 'AM') === 0);

/* ------------------- every hour of the day survives a round trip unchanged */
{
  let bad = 0;
  for (let h = 0; h < 24; h++) for (const m of [0, 5, 30, 55]) {
    const stored = pad(h) + ':' + pad(m);
    const t = parse(stored);
    const per = t.h < 12 ? 'AM' : 'PM';
    const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
    const back = pad(pickHour(h12, per)) + ':' + pad(t.m);
    if (back !== stored) { bad++; if (bad < 3) console.log('    ' + stored + ' -> ' + back); }
  }
  ok('all 96 times round-trip to the same string', bad === 0, bad + ' wrong');
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
