/* ============================================================================
   Remove the payments that were written by requests which then failed.

   The record-payment endpoint wrote its receipts and *then* sent a
   notification. The notification text began with a rupee sign, which this
   database cannot store, so the request died with a 500 — after the money was
   already recorded. Every click that showed "Internal server error" therefore
   banked the payment, and every retry banked it again.

   This removes those receipts and re-derives the status of the invoices they
   touched. Pass the ids to remove as arguments:

     node prisma/remove-phantom-payments.mjs RCT-894 RCT-895 …

   With no arguments it only reports, and changes nothing.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ids = process.argv.slice(2);

function totalsFor(inv, payments, co) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const sub = items.reduce((a, i) => a + (i.qty || 1) * (i.rate || 0), 0) - (inv.discount || 0);
  const total = Math.round(sub * (1 + (co?.gstRate || 18) / 100));
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  return { total, paid };
}

function derive(current, total, paid, due) {
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (current === 'draft') return 'draft';
  const today = new Date();
  const d = due ? new Date(due + 'T00:00:00') : null;
  return d && d < today ? 'overdue' : 'sent';
}

async function main() {
  const co = await prisma.company.findFirst();
  const rows = await prisma.payment.findMany({
    where: ids.length ? { id: { in: ids } } : { date: new Date().toISOString().slice(0, 10) },
    orderBy: { id: 'asc' },
  });

  if (!ids.length) {
    console.log('Report only — pass receipt ids to actually remove them.\n');
    rows.forEach((r) => console.log(`  ${r.id}  ${r.invoiceId}  ${r.amount}  ${r.mode}  at ${r.at}  by ${r.by}`));
    return;
  }

  const touched = [...new Set(rows.map((r) => r.invoiceId))];
  console.log(`removing ${rows.length} receipt(s): ${rows.map((r) => r.id).join(', ')}`);
  await prisma.payment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });

  for (const invId of touched) {
    const inv = await prisma.invoice.findUnique({ where: { id: invId }, include: { payments: true } });
    if (!inv) continue;
    const t = totalsFor(inv, inv.payments, co);
    const status = derive(inv.status, t.total, t.paid, inv.due);
    if (status !== inv.status) {
      await prisma.invoice.update({ where: { id: invId }, data: { status } });
    }
    console.log(`  ${invId}: paid ${t.paid} of ${t.total} → ${status}`);
  }
}

main().finally(() => prisma.$disconnect());
