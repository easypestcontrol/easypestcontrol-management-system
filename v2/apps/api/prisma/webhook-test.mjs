/* A signed webhook, end to end, against the running server.

   This is the one path that cannot be proved by a unit test: the signature is
   computed over the bytes that actually travel, and the only way to know the
   raw body survives the parser is to send real bytes at a real socket.

   It also proves the thing that matters most about a payment webhook — that a
   redelivery moves no money. Razorpay redelivers as a matter of course, and
   the first version of this file caught the claim quietly failing to claim:
   an advance credited twice, an invoice allocated twice.

   Needs the API running:  node --env-file=.env dist/main.js
   Then:                   node --env-file=.env prisma/webhook-test.mjs

   Sets a test webhook secret on the company for the duration and puts the
   real one back at the end, including on failure paths that reach the tail.  */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seal } from '../dist/secrets.util.js';

const API = 'http://127.0.0.1:4000/api';
const SECRET = 'zz_test_webhook_secret';
const prisma = new PrismaClient();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/** Send a payload the way Razorpay does: exact bytes, signature over them. */
async function send(obj, { sign = true } = {}) {
  const bytes = Buffer.from(JSON.stringify(obj), 'utf8');
  const sig = crypto.createHmac('sha256', SECRET).update(bytes).digest('hex');
  const res = await fetch(API + '/pay/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sign ? sig : crypto.randomBytes(32).toString('hex'),
    },
    body: bytes,
  });
  return { status: res.status, body: await res.json() };
}

const capture = (payId, amountPaise, notes) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: payId, amount: amountPaise, notes } } },
});

/* ------------------------------------------------------------- fixtures */
const co = await prisma.company.findFirst();
const before = (co?.integrations || {});
await prisma.company.update({
  where: { id: co.id },
  data: { integrations: { ...before, rzpWebhookSecret: seal(SECRET) } },
});

const contract = await prisma.contract.findUnique({ where: { id: 'AMC-2026-01' } });
const clientId = contract.clientId;

const clean = async () => {
  await prisma.paymentIntent.deleteMany({ where: { id: { startsWith: 'PI-ZZ' } } });
  await prisma.paymentIntent.deleteMany({ where: { paymentRef: { startsWith: 'pay_ZZ' } } });
  await prisma.customerCredit.deleteMany({ where: { note: { contains: 'ZZLIVE' } } });
  await prisma.customerCredit.deleteMany({ where: { id: { startsWith: 'CR-' }, contractId: 'AMC-2026-01', used: 0 } });
};
await clean();

console.log('\n  A SIGNED WEBHOOK, AGAINST THE RUNNING SERVER\n');

/* ------------------------------------ 1. a wrong signature moves nothing */
{
  const r = await send(capture('pay_ZZBAD', 100000, { contractId: 'AMC-2026-01', clientId }), { sign: false });
  const landed = await prisma.paymentIntent.count({ where: { paymentRef: 'pay_ZZBAD' } });
  ok('a forged signature is refused', r.body.ok === false && r.body.why === 'bad signature',
    JSON.stringify(r.body));
  ok('and it moves no money', landed === 0, 'intents=' + landed);
  ok('but still answers 200, so Razorpay stops retrying', r.status === 200, 'status=' + r.status);
}

/* -------------------------- 2. a real capture against a contract, no invoice */
{
  const r = await send(capture('pay_ZZ001', 1000000, { contractId: 'AMC-2026-01', clientId }));
  const credit = await prisma.customerCredit.findFirst({
    where: { contractId: 'AMC-2026-01' }, orderBy: { createdAt: 'desc' },
  });
  ok('a signed capture is accepted', r.body.ok === true, JSON.stringify(r.body));
  ok('money with no invoice becomes credit', r.body.credited === true, JSON.stringify(r.body));
  ok('the credit is 10,000 in paise', credit?.amount === 1000000, 'amount=' + credit?.amount);
  ok('it is tagged with the contract', credit?.contractId === 'AMC-2026-01', credit?.contractId);
  ok('and named so a human can read it', (credit?.note || '').includes('AMC-2026-01'), credit?.note);
}

/* ------------------------------------- 3. the same capture delivered twice */
{
  const countBefore = await prisma.customerCredit.count({ where: { contractId: 'AMC-2026-01' } });
  const r = await send(capture('pay_ZZ001', 1000000, { contractId: 'AMC-2026-01', clientId }));
  const countAfter = await prisma.customerCredit.count({ where: { contractId: 'AMC-2026-01' } });
  ok('a replay is answered', r.status === 200);
  ok('and credits nothing a second time', countAfter === countBefore,
    'before=' + countBefore + ' after=' + countAfter);
}

/* --------------------------------- 4. a capture against a real open invoice

   The dangerous replay. An advance credited twice is embarrassing; an invoice
   ALLOCATED twice is money the business thinks it has and does not.          */
{
  await prisma.payment.deleteMany({ where: { invoiceId: 'ZZ-INV-1' } });
  await prisma.invoice.deleteMany({ where: { id: 'ZZ-INV-1' } });
  const inv = await prisma.invoice.create({
    data: {
      id: 'ZZ-INV-1', clientId, date: '2026-08-01', due: '2026-08-15', status: 'sent',
      items: [{ desc: 'Quarterly service', qty: 1, rate: 10000 }],
      placeOfSupply: 'Tamil Nadu',
    },
  });

  const r1 = await send(capture('pay_ZZ002', 500000, { invoiceId: inv.id, clientId }));
  const mid = await prisma.invoice.findUnique({
    where: { id: inv.id }, include: { payments: true },
  });
  const paid1 = mid.payments.reduce((a, p) => a + p.amount, 0);
  ok('a capture on an invoice allocates', (r1.body.allocations || 0) === 1, JSON.stringify(r1.body));
  ok('the invoice is paid 5,000', paid1 === 5000, 'paid=' + paid1);
  ok('and reads part paid', mid.status === 'partial', mid.status);
  ok('one real receipt exists', mid.payments.length === 1, 'receipts=' + mid.payments.length);

  // Razorpay delivers the same capture again, as it routinely does.
  const r2 = await send(capture('pay_ZZ002', 500000, { invoiceId: inv.id, clientId }));
  const after = await prisma.invoice.findUnique({
    where: { id: inv.id }, include: { payments: true },
  });
  const paid2 = after.payments.reduce((a, p) => a + p.amount, 0);
  ok('the replay is recognised', r2.body.duplicate === true, JSON.stringify(r2.body));
  ok('THE INVOICE IS NOT PAID TWICE', paid2 === 5000, 'paid=' + paid2);
  ok('and no second receipt was minted', after.payments.length === 1,
    'receipts=' + after.payments.length);

  // Five deliveries at once, which is what a retry storm looks like.
  await Promise.all([1, 2, 3, 4, 5].map(() =>
    send(capture('pay_ZZ003', 300000, { invoiceId: inv.id, clientId }))));
  const storm = await prisma.invoice.findUnique({
    where: { id: inv.id }, include: { payments: true },
  });
  const paid3 = storm.payments.reduce((a, p) => a + p.amount, 0);
  ok('five simultaneous deliveries pay 3,000 once', paid3 === 8000, 'paid=' + paid3);

  await prisma.payment.deleteMany({ where: { invoiceId: 'ZZ-INV-1' } });
  await prisma.invoice.deleteMany({ where: { id: 'ZZ-INV-1' } });
}

/* ------------------------------------------------------------- put it back */
await clean();
await prisma.company.update({ where: { id: co.id }, data: { integrations: before } });
await prisma.$disconnect();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
