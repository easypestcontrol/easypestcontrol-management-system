/* A visit given its own hour must keep it, and must not be folded into
   another visit on the same day. Merging exists so nobody drives to one site
   twice in a morning; two services at different hours are two journeys.    */
import { planVisits } from './dist/index.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

const base = {
  id: 'CN-T', start: '2026-09-07', end: '2027-09-06', slot: '10:00',
  mergeSameDay: true, workdaysOnly: false, blackout: [],
};

/* ------------------------------------ nothing set: the line's slot is used */
{
  const v = planVisits({ ...base, plan: [
    { svId: 'S1', visits: 2, mins: 60, crew: 1, slot: '09:00', freq: '', dayRule: '', techIds: [] },
  ] });
  ok('every visit takes the line slot', v.every((x) => x.slot === '09:00'),
    v.map((x) => x.slot).join(','));
}

/* ---------------------------------- one visit is moved to a different hour */
{
  const v = planVisits({ ...base, plan: [
    { svId: 'S1', visits: 3, mins: 60, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [],
      times: ['07:00', '', ''] },
  ] });
  ok('the hand-picked hour is kept', v.some((x) => x.slot === '07:00'),
    v.map((x) => x.date + '@' + x.slot).join(' '));
  ok('the others keep the line slot',
    v.filter((x) => x.slot === '10:00').length === 2,
    v.map((x) => x.slot).join(','));
}

/* ---------- two services on ONE day at the SAME hour still share the trip */
{
  const v = planVisits({ ...base, plan: [
    { svId: 'S1', visits: 1, mins: 60, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [], dates: ['2026-09-10'] },
    { svId: 'S2', visits: 1, mins: 30, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [], dates: ['2026-09-10'] },
  ] });
  const day = v.filter((x) => x.date === '2026-09-10');
  ok('same day, same hour = one trip', day.length === 1, String(day.length));
  ok('and it carries both services', day[0] && day[0].serviceIds.length === 2,
    JSON.stringify(day[0] && day[0].serviceIds));
  ok('with the minutes added up', day[0] && day[0].mins === 90, String(day[0] && day[0].mins));
}

/* -------- two services on ONE day at DIFFERENT hours are two separate trips */
{
  const v = planVisits({ ...base, plan: [
    { svId: 'S1', visits: 1, mins: 60, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [],
      dates: ['2026-09-10'] },
    { svId: 'S2', visits: 1, mins: 30, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [],
      dates: ['2026-09-10'], times: ['16:00'] },
  ] });
  const day = v.filter((x) => x.date === '2026-09-10');
  ok('same day, different hours = two trips', day.length === 2, String(day.length));
  const hours = day.map((x) => x.slot).sort();
  ok('and each keeps its own hour', hours.join(',') === '10:00,16:00', hours.join(','));
  ok('neither swallowed the other',
    day.every((x) => x.serviceIds.length === 1), JSON.stringify(day.map((x) => x.serviceIds)));
}

/* ------------------------------------------- the day is still sorted by time */
{
  const v = planVisits({ ...base, plan: [
    { svId: 'S1', visits: 1, mins: 60, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [],
      dates: ['2026-09-10'], times: ['16:00'] },
    { svId: 'S2', visits: 1, mins: 30, crew: 1, slot: '10:00', freq: '', dayRule: '', techIds: [],
      dates: ['2026-09-10'], times: ['08:00'] },
  ] });
  const day = v.filter((x) => x.date === '2026-09-10');
  ok('the earlier visit comes first', day[0].slot === '08:00', day.map((x) => x.slot).join(','));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
