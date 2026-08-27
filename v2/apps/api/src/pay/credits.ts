/* ============================================================================
   Drawing down what a customer has already paid.

   A credit that sits on a customer's record and never comes off an invoice is
   worse than no credit at all: the customer believes they have paid, the
   invoice says they have not, and somebody has to remember. So the moment an
   invoice is raised for a customer holding credit, the credit applies itself
   and the invoice shows what was already received.

   Two rules make this safe:

     · `used` never exceeds `amount`. Every draw-down is checked against what
       is left, inside the same transaction that records it, so the same
       advance cannot be spent on two invoices.

     · A draw-down is a real Payment row. Not a discount, not an adjustment to
       the total — the invoice was for what it was for, and this is money
       received against it. That keeps the accounts honest and the receipt
       trail complete.

     · Money taken against a contract stays with that contract. A customer who
       pays an advance on their factory AMC has not paid anything towards the
       one-off treatment at their house, and an invoice for the house must not
       help itself to it. Only an untagged credit — an overpayment, which
       belongs to nobody in particular — is spendable anywhere.
   ========================================================================== */
import type { PrismaClient } from '@prisma/client';

type Tx = Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

/** Paise on the ledger, rupees on an invoice. Converted once, here. */
const toRupees = (paise: number) => Math.round(paise) / 100;

export interface DrawResult {
  applied: number;
  receipts: string[];
}

/**
 * Apply any credit a customer holds to an invoice that has just been raised.
 *
 * Returns quietly with nothing applied when there is no credit — the caller
 * raises invoices whether or not an advance exists, and should not have to ask
 * first.
 */
export async function drawCredit(
  prisma: PrismaClient,
  invoiceId: string,
  clientId: string,
  balance: number,
  today: string,
  /** The contract this invoice belongs to, if it belongs to one. */
  contractId = '',
): Promise<DrawResult> {
  if (balance <= 0) return { applied: 0, receipts: [] };

  return prisma.$transaction(async (tx) => {
    // Lock the customer's credits: two invoices raised in the same second
    // must not both spend the same advance.
    await tx.$queryRawUnsafe(
      'SELECT id FROM "CustomerCredit" WHERE "clientId" = $1 FOR UPDATE', clientId,
    );
    const credits = await tx.customerCredit.findMany({
      where: contractId
        // This contract's own advance, plus anything unattached.
        ? { clientId, contractId: { in: [contractId, ''] } }
        // A one-off invoice may only spend unattached credit.
        : { clientId, contractId: '' },
      orderBy: { createdAt: 'asc' }, // oldest advance spends first
    });

    let left = balance;
    const receipts: string[] = [];
    let applied = 0;

    for (const c of credits) {
      if (left <= 0) break;
      const available = toRupees(c.amount - c.used);
      if (available <= 0) continue;
      const take = Math.min(left, available);

      const receiptId = await mintReceipt(tx);
      await tx.payment.create({
        data: {
          id: receiptId, invoiceId, date: today, amount: take,
          mode: 'Advance',
          ref: c.contractId
            ? 'Advance ' + c.id + ' (' + c.contractId + ')'
            : 'Advance ' + c.id,
          by: '', at: '',
        },
      });
      await tx.customerCredit.update({
        where: { id: c.id },
        data: { used: c.used + Math.round(take * 100) },
      });
      receipts.push(receiptId);
      applied += take;
      left -= take;
    }

    if (applied > 0) {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId }, include: { payments: true },
      });
      const paid = (inv?.payments || []).reduce((a, p) => a + p.amount, 0);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: paid >= balance ? 'paid' : 'partial' },
      });
    }

    return { applied, receipts };
  });
}

async function mintReceipt(tx: Tx): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const seq = await tx.seq.upsert({
      where: { key: 'receipt' }, create: { key: 'receipt', value: 900 },
      update: { value: { increment: 1 } },
    });
    const id = 'RCT-' + seq.value;
    if (!(await tx.payment.findUnique({ where: { id } }))) return id;
  }
  throw new Error('Could not mint a receipt id');
}

/** What a customer has left to spend, in rupees. */
export async function creditBalance(prisma: PrismaClient, clientId: string): Promise<number> {
  const rows = await prisma.customerCredit.findMany({ where: { clientId } });
  return rows.reduce((a, c) => a + toRupees(c.amount - c.used), 0);
}
