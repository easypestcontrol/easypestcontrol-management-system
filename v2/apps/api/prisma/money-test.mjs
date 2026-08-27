/* Prove the allocator on real rows, then leave the database as it was.

   Six cases, each one a way money goes wrong:
     1. exact payment settles and marks paid
     2. part payment marks partial and leaves the right balance
     3. arrears clear oldest-first across a contract
     4. overpayment becomes a customer credit, not a wrong invoice
     5. the same gateway capture cannot be banked twice
     6. two concurrent allocations do not both spend the same balance          */
import { PrismaClient } from '@prisma/client';
import { docTotals } from 'shared';
import { allocate } from '../dist/pay/allocate.js';

const prisma = new PrismaClient();
const TODAY = new Date().toISOString().slice(0, 10);
const TAG = 'ZZTEST-';
const total = (inv) => docTotals(inv.items || [], inv.discount || 0, inv.placeOfSupply || '', 'Tamil Nadu', 18).total;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

async function invoice(id, items, opts = {}) {
  return prisma.invoice.create({
    data: {
      id: TAG + id, clientId: TAG + 'client', contractId: opts.contract || '',
      date: TODAY, due: opts.due || TODAY, status: 'sent',
      items, discount: 0, placeOfSupply: 'Tamil Nadu',
      createdAt: opts.createdAt || new Date(),
    },
  });
}

async function cleanup() {
  await prisma.payment.deleteMany({ where: { invoiceId: { startsWith: TAG } } });
  await prisma.invoice.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.customerCredit.deleteMany({ where: { clientId: TAG + 'client' } });
  await prisma.paymentIntent.deleteMany({ where: { gatewayRef: { startsWith: TAG } } });
}

await cleanup();

/* ---------------------------------------------------- 1. exact settlement */
{
  const inv = await invoice('A', [{ desc: 'Cockroach control', qty: 1, rate: 10000 }]);
  const t = total(inv);                                   // 10,000 + 18% = 11,800
  const r = await allocate(prisma, { invoiceId: inv.id, amount: t, mode: 'Cash', ref: 't1' }, total, TODAY);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } });
  ok('exact payment marks the invoice paid', after.status === 'paid', 'status=' + after.status);
  ok('one receipt for one payment', after.payments.length === 1);
  ok('nothing left over', r.credited === 0, 'credited=' + r.credited);
}

/* --------------------------------------------------------- 2. part payment */
{
  const inv = await invoice('B', [{ desc: 'Termite treatment', qty: 1, rate: 10000 }]);
  const t = total(inv);
  await allocate(prisma, { invoiceId: inv.id, amount: 5000, mode: 'Cash', ref: 't2' }, total, TODAY);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } });
  const paid = after.payments.reduce((a, p) => a + p.amount, 0);
  ok('part payment marks partial', after.status === 'partial', 'status=' + after.status);
  ok('balance is exactly right', t - paid === t - 5000, 'balance=' + (t - paid));
}

/* ------------------------------------------------- 3. arrears, oldest first */
{
  const old = await invoice('C1', [{ desc: 'Visit 1', qty: 1, rate: 1000 }],
    { contract: TAG + 'ct', createdAt: new Date(Date.now() - 86400000 * 30) });
  const mid = await invoice('C2', [{ desc: 'Visit 2', qty: 1, rate: 1000 }],
    { contract: TAG + 'ct', createdAt: new Date(Date.now() - 86400000 * 15) });
  const now = await invoice('C3', [{ desc: 'Visit 3', qty: 1, rate: 1000 }],
    { contract: TAG + 'ct', createdAt: new Date() });
  const each = total(old);                                // 1,180 each

  // Pay two invoices' worth, offered against the NEWEST one.
  const r = await allocate(prisma, { invoiceId: now.id, amount: each * 2, mode: 'UPI', ref: 't3' }, total, TODAY);
  const [a, b, c] = await Promise.all([old, mid, now].map((x) =>
    prisma.invoice.findUnique({ where: { id: x.id }, include: { payments: true } })));

  ok('oldest arrear cleared first', a.status === 'paid', 'oldest=' + a.status);
  ok('second arrear cleared next', b.status === 'paid', 'middle=' + b.status);
  ok('newest left untouched', c.payments.length === 0 && c.status === 'sent',
    'newest=' + c.status + ' payments=' + c.payments.length);
  ok('split across exactly two receipts', r.allocations.length === 2, 'n=' + r.allocations.length);
}

/* ------------------------------------------------------- 4. overpayment */
{
  const inv = await invoice('D', [{ desc: 'Rodent control', qty: 1, rate: 1000 }]);
  const t = total(inv);
  const r = await allocate(prisma, { invoiceId: inv.id, amount: t + 500, mode: 'Cash', ref: 't4' }, total, TODAY);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } });
  const paid = after.payments.reduce((a, p) => a + p.amount, 0);
  const credits = await prisma.customerCredit.findMany({ where: { clientId: TAG + 'client' } });
  ok('invoice takes only what it is owed', paid === t, 'paid=' + paid + ' of ' + t);
  ok('the surplus became a credit', r.credited === 500 && credits.length === 1,
    'credited=' + r.credited + ' rows=' + credits.length);
  ok('credit stored in paise', credits[0]?.amount === 50000, 'amount=' + credits[0]?.amount);
}

/* --------------------------------------------- 5. a capture banked once */
{
  const inv = await invoice('E', [{ desc: 'Disinfection', qty: 1, rate: 1000 }]);
  const write = () => prisma.paymentIntent.create({
    data: {
      id: 'PI-' + Math.random().toString(36).slice(2, 9),
      gatewayRef: TAG + 'qr1', paymentRef: TAG + 'pay1',
      kind: 'qr', invoiceId: inv.id, amountPaise: 118000, status: 'paid',
    },
  });
  await write();
  let blocked = false;
  try { await write(); } catch { blocked = true; }
  ok('the same capture cannot be claimed twice', blocked);
}

/* ------------------------------------- 6. two allocations, one balance */
{
  const inv = await invoice('F', [{ desc: 'Bed bug treatment', qty: 1, rate: 10000 }]);
  const t = total(inv);
  // Both try to pay the whole balance at the same instant.
  const results = await Promise.allSettled([
    allocate(prisma, { invoiceId: inv.id, amount: t, mode: 'Cash', ref: 'race-a' }, total, TODAY),
    allocate(prisma, { invoiceId: inv.id, amount: t, mode: 'UPI', ref: 'race-b' }, total, TODAY),
  ]);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } });
  const paid = after.payments.reduce((a, p) => a + p.amount, 0);
  const credits = await prisma.customerCredit.count({ where: { clientId: TAG + 'client' } });
  // Whatever the interleaving, the invoice must never be paid MORE than it is
  // owed: any surplus has to have landed as credit instead.
  ok('the invoice is never over-allocated', paid <= t, 'paid=' + paid + ' owed=' + t);
  console.log('        (both allocations ' + results.map((r) => r.status).join(', ')
    + '; credits now ' + credits + ')');
}

await cleanup();
await prisma.$disconnect();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
