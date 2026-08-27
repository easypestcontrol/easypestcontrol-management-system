/* An advance is the easiest money in this system to lose: it arrives before
   the document it belongs to. These cases prove it cannot be spent twice,
   cannot exceed itself, and always lands on the invoice as a real receipt.  */
import { PrismaClient } from '@prisma/client';
import { drawCredit, creditBalance } from '../dist/pay/credits.js';

const prisma = new PrismaClient();
const TODAY = new Date().toISOString().slice(0, 10);
const TAG = 'ZZCR-';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

async function clean() {
  await prisma.payment.deleteMany({ where: { invoiceId: { startsWith: TAG } } });
  await prisma.invoice.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.customerCredit.deleteMany({ where: { clientId: TAG + 'c' } });
}
const invoice = (id) => prisma.invoice.create({
  data: { id: TAG + id, clientId: TAG + 'c', date: TODAY, due: TODAY, status: 'sent',
          items: [{ desc: 'x', qty: 1, rate: 1000 }], placeOfSupply: 'Tamil Nadu' },
});
const credit = (id, rupees, quote = '') => prisma.customerCredit.create({
  data: { id: TAG + id, clientId: TAG + 'c', amount: rupees * 100, source: 'advance', quoteId: quote },
});

await clean();

/* ------------------------------- 1. an advance comes off the first invoice */
{
  await credit('1', 5000, 'QT-9001');
  const inv = await invoice('A');
  const r = await drawCredit(prisma, inv.id, TAG + 'c', 11800, TODAY);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } });
  ok('advance applied to the invoice', r.applied === 5000, 'applied=' + r.applied);
  ok('it is a real receipt, not a discount', after.payments.length === 1
    && after.payments[0].mode === 'Advance');
  ok('the receipt names the quotation', (after.payments[0].ref || '').includes('QT-9001'),
    after.payments[0].ref);
  ok('invoice reads part paid', after.status === 'partial', after.status);
  ok('nothing left to spend', (await creditBalance(prisma, TAG + 'c')) === 0);
}

/* ------------------------------------- 2. the same advance cannot go twice */
{
  await clean();
  await credit('2', 5000);
  const a = await invoice('B');
  const b = await invoice('C');
  const r1 = await drawCredit(prisma, a.id, TAG + 'c', 11800, TODAY);
  const r2 = await drawCredit(prisma, b.id, TAG + 'c', 11800, TODAY);
  ok('first invoice takes it', r1.applied === 5000, 'r1=' + r1.applied);
  ok('second invoice gets nothing', r2.applied === 0, 'r2=' + r2.applied);
}

/* ------------------------- 3. a credit bigger than the bill is not overspent */
{
  await clean();
  await credit('3', 20000);
  const inv = await invoice('D');
  const r = await drawCredit(prisma, inv.id, TAG + 'c', 11800, TODAY);
  const left = await creditBalance(prisma, TAG + 'c');
  ok('only what the invoice needed', r.applied === 11800, 'applied=' + r.applied);
  ok('the rest stays as credit', left === 8200, 'left=' + left);
  const after = await prisma.invoice.findUnique({ where: { id: inv.id } });
  ok('invoice fully settled by credit', after.status === 'paid', after.status);
}

/* ------------------------------- 4. two invoices raised at the same instant */
{
  await clean();
  await credit('4', 5000);
  const a = await invoice('E');
  const b = await invoice('F');
  const [r1, r2] = await Promise.all([
    drawCredit(prisma, a.id, TAG + 'c', 11800, TODAY),
    drawCredit(prisma, b.id, TAG + 'c', 11800, TODAY),
  ]);
  const spent = r1.applied + r2.applied;
  ok('the advance is spent once, not twice', spent === 5000, 'spent=' + spent);
  ok('nothing left over', (await creditBalance(prisma, TAG + 'c')) === 0);
}

/* ------------------------------------- 5. oldest advance spends first */
{
  await clean();
  await credit('5a', 3000);
  await new Promise((r) => setTimeout(r, 20));
  await credit('5b', 3000);
  const inv = await invoice('G');
  await drawCredit(prisma, inv.id, TAG + 'c', 4000, TODAY);
  const rows = await prisma.customerCredit.findMany({
    where: { clientId: TAG + 'c' }, orderBy: { createdAt: 'asc' },
  });
  ok('oldest advance emptied first', rows[0].used === 300000, 'used=' + rows[0].used);
  ok('newer advance only partly used', rows[1].used === 100000, 'used=' + rows[1].used);
}

await clean();
await prisma.$disconnect();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
