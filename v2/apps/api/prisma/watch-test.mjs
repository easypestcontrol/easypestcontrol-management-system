/* Does the screen find out?

   A customer paid a real rupee, the webhook recorded it perfectly, and the
   dialog showed nothing — because it was watching the QR it had raised rather
   than the invoice the money landed on, and the QR's poll had been stopped
   when the picture was closed.

   The dialog asks one question every three seconds: does this invoice have
   more settled payments than it did a moment ago? So that is what is tested
   here — against the running server, with money arriving the way it really
   does, through a signed webhook.

   Needs the API running:  node --env-file=.env dist/main.js                 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seal } from '../dist/secrets.util.js';

const API = 'http://127.0.0.1:4000/api';
const SECRET = 'zz_watch_secret';
const prisma = new PrismaClient();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/** Sign in the way the browser does, so /pay/state can be asked. */
async function token() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@easypest.com', password: 'easypest@2026' }),
  });
  const j = await r.json();
  if (!j.token) throw new Error('could not sign in: ' + JSON.stringify(j).slice(0, 120));
  return j.token;
}

/** What the dialog's watcher sees. */
async function state(tok, invoiceId) {
  const r = await fetch(API + '/pay/state/' + invoiceId, {
    headers: { Authorization: 'Bearer ' + tok },
  });
  return r.json();
}

/** Money arriving, signed, exactly as Razorpay sends it. */
async function pay(payId, paise, notes) {
  const body = Buffer.from(JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: payId, amount: paise, notes } } },
  }), 'utf8');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const r = await fetch(API + '/pay/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body,
  });
  return r.json();
}

/* ------------------------------------------------------------- fixtures */
const co = await prisma.company.findFirst();
const keep = co?.integrations || {};
await prisma.company.update({
  where: { id: co.id },
  data: { integrations: { ...keep, rzpWebhookSecret: seal(SECRET) } },
});

const ID = 'ZZW-INV-1';
const clean = async () => {
  await prisma.payment.deleteMany({ where: { invoiceId: ID } });
  await prisma.invoice.deleteMany({ where: { id: ID } });
  await prisma.paymentIntent.deleteMany({ where: { invoiceId: ID } });
  await prisma.paymentIntent.deleteMany({ where: { paymentRef: { startsWith: 'pay_ZZW' } } });
};
await clean();

const anyClient = await prisma.client.findFirst();
await prisma.invoice.create({
  data: {
    id: ID, clientId: anyClient.id, date: '2026-08-27', due: '2026-09-11', status: 'sent',
    items: [{ desc: 'Watcher test', qty: 1, rate: 10000 }], placeOfSupply: 'Tamil Nadu',
  },
});

const tok = await token();
console.log('\n  DOES THE SCREEN FIND OUT?\n');

/* ------------------------------------- 1. the baseline the dialog takes */
const opened = await state(tok, ID);
const before = opened.history.filter((h) => h.status === 'paid').length;
ok('nothing settled when the dialog opens', before === 0, 'before=' + before);

/* --------------------- 2. money lands by webhook — nothing else involved */
{
  const res = await pay('pay_ZZW001', 500000, { invoiceId: ID, clientId: anyClient.id });
  ok('the webhook allocated it', (res.allocations || 0) === 1, JSON.stringify(res));

  const now = await state(tok, ID);
  const after = now.history.filter((h) => h.status === 'paid');
  ok('the watcher sees one more settled payment', after.length > before,
    before + ' -> ' + after.length);
  ok('and it can name the amount', after[0]?.amount === 5000, 'amount=' + after[0]?.amount);
  ok('AND THE RECEIPT, so the tick can show it',
    !!after[0]?.receipt && after[0].receipt.startsWith('RCT-'), 'receipt=' + after[0]?.receipt);
}

/* ------------- 3. a second payment moves the count again, not just once */
{
  const mid = (await state(tok, ID)).history.filter((h) => h.status === 'paid').length;
  await pay('pay_ZZW002', 300000, { invoiceId: ID, clientId: anyClient.id });
  const after = (await state(tok, ID)).history.filter((h) => h.status === 'paid').length;
  ok('a part payment is noticed too', after > mid, mid + ' -> ' + after);
}

/* --------------- 4. a redelivery must NOT look like fresh money arriving */
{
  const mid = (await state(tok, ID)).history.filter((h) => h.status === 'paid').length;
  await pay('pay_ZZW002', 300000, { invoiceId: ID, clientId: anyClient.id });
  const after = (await state(tok, ID)).history.filter((h) => h.status === 'paid').length;
  ok('a replay does not fire the tick a second time', after === mid, mid + ' -> ' + after);
}

/* ------------------------------------------------------------ put it back */
await clean();
await prisma.company.update({ where: { id: co.id }, data: { integrations: keep } });
await prisma.$disconnect();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
