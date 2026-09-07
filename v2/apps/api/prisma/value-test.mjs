/* What a contract is worth, and when the answer is "don't ask".

   `Contract.value` is the ex-GST figure every invoice, instalment, per-visit
   share and report reads. Two screens can move it — the discount field and
   the service-plan editor — and both go through `contractValue`, so this is
   the arithmetic the whole money side stands on.

   The case that matters most is the one that returns null. Contracts written
   before a plan line carried a rate keep their money in `value` alone, with
   every line at zero. Computing from those lines would not be arithmetic, it
   would be deletion: a ₹186,000 agreement rewritten to nothing the first
   time somebody nudged its schedule.

   Run:  node prisma/value-test.mjs        (after: npm run -w api build)  */
import { contractValue } from '../dist/contracts/plan.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };
const eq = (n, got, want) => ok(n, got === want, 'got ' + got + ', wanted ' + want);

console.log('\nA priced plan prices the contract');
eq('one line, five visits at 1800', contractValue([{ rate: 1800, visits: 5 }], 0), 9000);
eq('two lines add up',
  contractValue([{ rate: 1800, visits: 5 }, { rate: 3000, visits: 10 }], 0), 39000);
eq('the discount comes off',
  contractValue([{ rate: 1800, visits: 5 }, { rate: 3000, visits: 10 }], 4000), 35000);
eq('a price change moves it', contractValue([{ rate: 2000, visits: 5 }], 0), 10000);
eq('halving the visits halves it', contractValue([{ rate: 3000, visits: 5 }], 0), 15000);

console.log('\nAn unpriced plan says nothing about the money');
eq('every line at zero', contractValue([{ rate: 0, visits: 4 }, { rate: 0, visits: 8 }], 0), null);
eq('rates absent entirely', contractValue([{ visits: 4 }, { visits: 8 }], 0), null);
eq('an empty plan', contractValue([], 0), null);
eq('a discount cannot conjure a price', contractValue([{ rate: 0, visits: 4 }], 5000), null);
ok('one priced line among unpriced ones is enough to count',
  contractValue([{ rate: 0, visits: 4 }, { rate: 500, visits: 2 }], 0) === 1000);

console.log('\nThe edges');
eq('a discount larger than the work never goes negative',
  contractValue([{ rate: 1000, visits: 1 }], 99999), 0);
eq('a negative discount is treated as none',
  contractValue([{ rate: 1000, visits: 2 }], -500), 2000);
eq('a negative rate cannot subtract from the total',
  contractValue([{ rate: 1000, visits: 2 }, { rate: -900, visits: 3 }], 0), 2000);
eq('a line with no visit count still bills once',
  contractValue([{ rate: 1200, visits: 0 }], 0), 1200);
eq('fractions land on the rupee', contractValue([{ rate: 1499.6, visits: 3 }], 0), 4500);

console.log('\nThe figures from the contract this was found on');
eq('AMC-2026-05 as written', contractValue(
  [{ rate: 1800, visits: 5 }, { rate: 3000, visits: 10 }], 0), 39000);
eq('after SV01 goes to 2000', contractValue(
  [{ rate: 2000, visits: 5 }, { rate: 3000, visits: 10 }], 0), 40000);
eq('after SV10 is halved', contractValue(
  [{ rate: 2000, visits: 5 }, { rate: 3000, visits: 5 }], 0), 25000);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
