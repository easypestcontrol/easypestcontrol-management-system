/* ============================================================================
   Point every already-billed service at its invoice.

   Per-service contracts have always recorded the link the other way round —
   `Invoice.jobId`. Now that a service carries its own `invoiceId`, the two have
   to agree, or a visit that was billed months ago would reappear on the billing
   checklist as though it never was.

   Interval contracts have no such link to copy: their invoices were raised
   against a sequence number, not a service. Those services are left billable,
   which is the honest answer — nothing recorded which of them any given
   installment covered, and inventing an answer now would be a guess written
   into the ledger.

   Safe to run twice.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const linked = await prisma.invoice.findMany({
    where: { jobId: { not: '' } },
    select: { id: true, jobId: true, status: true },
  });
  console.log(`${linked.length} invoice(s) name a service directly`);

  let set = 0;
  for (const inv of linked) {
    const job = await prisma.job.findUnique({ where: { id: inv.jobId } });
    if (!job) { console.log(`  ! ${inv.id} points at ${inv.jobId}, which does not exist`); continue; }
    if (job.invoiceId === inv.id) continue;
    if (job.invoiceId) {
      console.log(`  ! ${job.id} already says ${job.invoiceId}, not overwriting with ${inv.id}`);
      continue;
    }
    await prisma.job.update({ where: { id: job.id }, data: { invoiceId: inv.id } });
    console.log(`  ${job.id} → ${inv.id}`);
    set += 1;
  }

  const billed = await prisma.job.count({ where: { invoiceId: { not: '' } } });
  const contracts = await prisma.contract.findMany({ select: { id: true, billingMode: true } });
  console.log(`\n${set} stamped, ${billed} service(s) now carry an invoice.`);

  for (const c of contracts) {
    const total = await prisma.job.count({ where: { contractId: c.id } });
    const done = await prisma.job.count({ where: { contractId: c.id, invoiceId: { not: '' } } });
    if (total) console.log(`  ${c.id} (${c.billingMode}): ${done} of ${total} services billed`);
  }
}

main().finally(() => prisma.$disconnect());
