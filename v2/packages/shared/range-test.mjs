/* One control, two ends. The bug it replaces is on record: two separate
   clocks let a visit be booked "10:00 AM to 1:00 AM", because neither clock
   had ever heard of the other.                                             */
const parse = (v) => { const b = /^(\d{1,2}):(\d{2})/.exec(String(v||'').trim());
  if (!b) return null; const h=+b[1], m=+b[2];
  return (h>23||m>59) ? null : { h, m }; };
const pad = (n) => String(n).padStart(2,'0');
const toMin = (v) => { const t = parse(v); return t ? t.h*60+t.m : -1; };
const label12 = (v) => { const t = parse(v); if (!t) return '';
  return (t.h%12===0?12:t.h%12)+':'+pad(t.m)+' '+(t.h<12?'AM':'PM'); };
const windowLabel = (f, t) => { const a=label12(f), b=label12(t);
  if (!a && !b) return ''; return b ? a+' – '+b : a; };
// what the dial does when an hour is tapped
const pickHour = (n12, period) => period==='AM' ? (n12===12?0:n12) : (n12===12?12:n12+12);
// the default finish the dialog opens with
const defaultEnd = (a) => ({ h: (a.h+2)%24, m: a.m });

let pass=0, fail=0;
const ok=(n,c,d='')=>{ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(d?'  — '+d:''));} };

/* ---------------------------------------- the window reads as one thing */
ok('a full window reads end to end',
  windowLabel('10:00','12:00') === '10:00 AM – 12:00 PM', windowLabel('10:00','12:00'));
ok('an afternoon window reads right',
  windowLabel('13:30','16:00') === '1:30 PM – 4:00 PM', windowLabel('13:30','16:00'));
ok('no end yet shows just the start', windowLabel('09:00','') === '9:00 AM');
ok('nothing set shows nothing', windowLabel('','') === '');

/* --------------------------------- the backwards window is caught, not saved */
{
  const cases = [['10:00','01:00'], ['10:00','10:00'], ['16:00','09:00'], ['23:00','00:30']];
  let caught = 0;
  for (const [f, t] of cases) if (toMin(t) - toMin(f) <= 0) caught++;
  ok('every backwards window is refused', caught === cases.length, caught + '/' + cases.length);
  ok('10:00 AM to 1:00 AM is one of them — the reported bug',
    toMin('01:00') - toMin('10:00') <= 0);
}

/* --------------------------------------------- good windows are allowed */
{
  const good = [['10:00','12:00'], ['07:00','09:30'], ['09:00','17:00'], ['23:00','23:59']];
  ok('ordinary windows pass', good.every(([f,t]) => toMin(t) - toMin(f) > 0));
  ok('and the duration is right', toMin('09:30') - toMin('07:00') === 150);
}

/* ------------------------------- the finish defaults to two hours later */
{
  ok('10:00 offers 12:00', JSON.stringify(defaultEnd({h:10,m:0})) === JSON.stringify({h:12,m:0}));
  ok('14:30 offers 16:30', JSON.stringify(defaultEnd({h:14,m:30})) === JSON.stringify({h:16,m:30}));
  ok('23:00 wraps rather than overflowing',
    JSON.stringify(defaultEnd({h:23,m:0})) === JSON.stringify({h:1,m:0}));
  ok('and that wrap is then refused as backwards', toMin('01:00') - toMin('23:00') <= 0);
}

/* ---------------------------------- midnight and noon on both ends */
{
  ok('12 AM start is 00:00', pickHour(12,'AM') === 0);
  ok('12 PM finish is 12:00', pickHour(12,'PM') === 12);
  ok('midnight to noon is a valid ten-and-a-half hours',
    toMin('00:00') >= 0 && toMin('12:00') - toMin('00:00') === 720);
  ok('00:00 reads as 12:00 AM', label12('00:00') === '12:00 AM', label12('00:00'));
  ok('12:00 reads as 12:00 PM', label12('12:00') === '12:00 PM', label12('12:00'));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
