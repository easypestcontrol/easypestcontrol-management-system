/* The ₹1 invoice that broke on the first live payment.

   GST on ₹1 is 18 paise, so the total was 1.18 — but every screen renders
   through money(), which rounds, so the invoice SAID ₹1, and every collection
   path rounds, so the QR ASKED for ₹1. The customer paid ₹1 and the invoice
   was left owing eighteen paise: "Paid" inside the app, "PAYMENT DUE" on the
   customer's copy, and a Record payment button on a settled invoice.        */
import { docTotals } from './dist/index.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

const TN = 'Tamil Nadu';
const one = (rate) => docTotals([{ qty: 1, rate }], 0, TN, TN, 18);

/* ------------------------------------------------- the invoice that broke */
{
  const t = one(1);
  ok('a ₹1 invoice totals a whole ₹1', t.total === 1, 'total=' + t.total);
  ok('and says what it rounded', t.roundOff === -0.18, 'roundOff=' + t.roundOff);
  ok('paying it in full leaves nothing', t.total - 1 === 0, 'balance=' + (t.total - 1));
}

/* --------------------------------------- the ordinary case is untouched */
{
  const t = one(10000);
  ok('₹10,000 + 18% is still exactly ₹11,800', t.total === 11800, 'total=' + t.total);
  ok('with nothing rounded away', t.roundOff === 0, 'roundOff=' + t.roundOff);
}

/* ------------------------------------------------ rounding goes both ways */
{
  const up = one(3);      // 3.54 -> 4
  const down = one(7);    // 8.26 -> 8
  ok('3.54 rounds up to 4', up.total === 4, 'total=' + up.total);
  ok('8.26 rounds down to 8', down.total === 8, 'total=' + down.total);
  ok('and each reports the difference', up.roundOff === 0.46 && down.roundOff === -0.26,
    up.roundOff + ' / ' + down.roundOff);
}

/* --------------------------------- no float dust anywhere in the arithmetic */
{
  let dirty = 0;
  for (let r = 1; r <= 2000; r++) {
    const t = one(r);
    if (!Number.isInteger(t.total)) dirty++;
    if (String(t.roundOff).length > 5) dirty++;   // 0.17999999999999994 and friends
  }
  ok('2,000 invoice values, every total a whole rupee', dirty === 0, dirty + ' bad');
}

/* ------------------------------------- an out-of-state supply behaves the same */
{
  const t = docTotals([{ qty: 1, rate: 1 }], 0, 'Karnataka', TN, 18);
  ok('IGST rounds identically', t.total === 1 && t.tax.interState, 'total=' + t.total);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
