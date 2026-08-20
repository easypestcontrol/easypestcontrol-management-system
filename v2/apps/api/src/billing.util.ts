/* ============================================================================
   Billing sweep — raises the invoices the plan says are due.

   Idempotent by (contractId, kind, seq): run it as often as you like — on the
   invoice list, on a contract view — and each installment is only ever raised
   once. Upfront is simply installment 1 falling due on the start date.
   Per-visit invoices are not raised here; they belong to visit completion.
   ========================================================================== */
import { PrismaService } from './prisma.service';
import { billingPlan, addDays } from 'shared';

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export async function mintInvoiceId(prisma: PrismaService): Promise<string> {
  // The counter can trail seeded ids — walk forward until the number is free,
  // so a collision can never silently kill an auto-raised invoice.
  for (let i = 0; i < 60; i++) {
    const seq = await prisma.seq.upsert({
      where: { key: 'invoice' },
      create: { key: 'invoice', value: 3316 },
      update: { value: { increment: 1 } },
    });
    const id = 'INV-' + seq.value;
    if (!(await prisma.invoice.findUnique({ where: { id } }))) return id;
  }
  throw new Error('Could not mint an invoice number');
}

/**
 * Raise anything that genuinely raises itself.
 *
 * **Upfront contracts only, and deliberately so.** This used to sweep interval
 * contracts too, matching already-raised installments by sequence number — and
 * a sequence number is derived from the contract's *current* billing label. The
 * day someone switched AMC-2026-01 from Quarterly to Monthly the sequence
 * re-based: three quarters had been raised, the plan now counted in months, and
 * months 4 onward looked unraised. Six of them were raised in a single sweep.
 * That contract now carries ₹1,12,983 of invoices against a value of ₹66,000.
 *
 * Interval contracts are billed by ticking the services delivered — see
 * INVOICING.md. Nothing bills itself by counting, because counting is what went
 * wrong. An upfront contract has exactly one installment, due at signing, and
 * no services to choose between; there is nothing there to drift.
 */
export async function raiseDueBilling(prisma: PrismaService, contractId?: string) {
  const contracts = await prisma.contract.findMany({
    where: {
      billingMode: 'upfront',
      value: { gt: 0 },
      ...(contractId ? { id: contractId } : {}),
    },
    include: { plan: { select: { svId: true, months: true } } },
  });
  const today = todayISO();
  let raised = 0;

  for (const c of contracts) {
    const rows = billingPlan({
      id: c.id, start: c.start, end: c.end, months: c.months,
      value: c.value, billingAmount: (c as { billingAmount?: number }).billingAmount || 0, billing: c.billing, billingMode: c.billingMode,
      slot: c.slot, plan: c.plan,
    }).filter((r) => r.due <= today);
    if (!rows.length) continue;

    const have = new Set(
      (await prisma.invoice.findMany({
        where: { contractId: c.id, kind: 'upfront' },
        select: { seq: true },
      })).map((x) => x.seq),
    );

    for (const r of rows) {
      if (have.has(r.seq)) continue;
      await prisma.invoice.create({
        data: {
          id: await mintInvoiceId(prisma),
          clientId: c.clientId,
          contractId: c.id,
          branch: c.branch || '',
          kind: c.billingMode,
          seq: r.seq,
          date: r.due,
          due: addDays(r.due, 15),
          period: r.label,
          status: 'sent',
          placeOfSupply: c.placeOfSupply || '',
          items: [{ desc: r.label + ' — ' + c.id, qty: 1, rate: r.amount }] as never,
        },
      });
      raised++;
    }
  }
  return raised;
}
