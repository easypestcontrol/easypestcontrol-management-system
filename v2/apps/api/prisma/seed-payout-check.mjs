/* ============================================================================
   Two rupees of real data, so both directions of the money can be tried.

   Money IN — a technician holding ₹1 of collected cash. It shows in their
   wallet and can be transferred to the company's Razorpay account with the
   "Transfer to the office" button, which is the Payment Gateway path.

   Money OUT — an approved ₹1 expense claim by the same technician. Admin can
   settle it with "Pay via RazorpayX", which is the payouts path.

   Everything it creates is prefixed CHK- and titled so it is obvious, and
   `--undo` removes every trace including the receipt and the invoice.

     docker compose exec api node prisma/seed-payout-check.mjs
     docker compose exec api node prisma/seed-payout-check.mjs --undo
   ========================================================================== */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const undo = process.argv.includes('--undo');

const INVOICE = 'CHK-INV-1';
const RECEIPT = 'CHK-RCT-1';
const REPORT = 'CHK-EXR-1';
const EXPENSE = 'CHK-EXP-1';

async function remove() {
  await prisma.payment.deleteMany({ where: { id: RECEIPT } });
  await prisma.invoice.deleteMany({ where: { id: INVOICE } });
  await prisma.expense.deleteMany({ where: { id: EXPENSE } });
  await prisma.expenseReport.deleteMany({ where: { id: REPORT } });
  console.log('  removed: ' + [INVOICE, RECEIPT, REPORT, EXPENSE].join(', '));
}

if (undo) {
  await remove();
  await prisma.$disconnect();
  process.exit(0);
}

const tech = await prisma.user.findFirst({
  where: { role: { in: ['tech', 'senior_tech'] }, active: true },
});
if (!tech) throw new Error('No technician on this system to give the money to');

const client = await prisma.client.findFirst();
if (!client) throw new Error('No customer to raise the invoice against');

const today = new Date().toISOString().slice(0, 10);

// Start clean, so running it twice does not stack up.
await remove();

/* ------------------------------------------------- money in: the wallet
   A ₹1 cash collection by the technician, not yet handed over. The invoice
   exists because a receipt belongs to one — it is settled by the same rupee,
   so it leaves no balance chasing anybody.                                  */
await prisma.invoice.create({
  data: {
    id: INVOICE, clientId: client.id, date: today, due: today, status: 'paid',
    period: 'Payout check — safe to delete',
    items: [{ desc: 'Payout check — safe to delete', qty: 1, rate: 1 }],
    placeOfSupply: '',
    branch: tech.branches?.[0] || '',
  },
});
await prisma.payment.create({
  data: {
    id: RECEIPT, invoiceId: INVOICE, date: today, amount: 1,
    mode: 'Cash', ref: 'Payout check', by: tech.id, at: '09:00',
    settled: false,          // ← this is what puts it in the wallet
  },
});

/* --------------------------------------------- money out: the expense claim
   Approved already, so the only thing left is to pay it.                    */
await prisma.expenseReport.create({
  data: {
    id: REPORT, title: 'Payout check — safe to delete', date: today,
    by: tech.id, branch: tech.branches?.[0] || '',
    status: 'approved',
    submittedAt: today, decidedAt: today, approvedBy: 'seed',
    note: 'One rupee, so the RazorpayX payout can be tried end to end.',
  },
});
await prisma.expense.create({
  data: {
    id: EXPENSE, reportId: REPORT, kind: 'expense', date: today,
    category: 'Other', merchant: 'Payout check', amount: 1,
    note: 'Safe to delete once the payout has been tried.',
  },
});

console.log('');
console.log('  ' + tech.name + ' (' + tech.id + ')');
console.log('    holds ₹1 in their wallet   → Wallet → Transfer ₹1 to the office');
console.log('    is owed ₹1 on ' + REPORT + '   → Expenses → ' + REPORT + ' → Pay via RazorpayX');
console.log('');
console.log('  Undo with:  node prisma/seed-payout-check.mjs --undo');
await prisma.$disconnect();
