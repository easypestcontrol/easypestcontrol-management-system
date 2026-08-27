/* ============================================================================
   The one allocator.

   Every rupee this business receives — cash handed over at a door, a UPI QR
   scanned on a technician's phone, a payment link paid at midnight, a mandate
   debited automatically — comes through this function and nowhere else.

   That is not tidiness. Before this existed the QR path wrote straight to the
   invoice it was raised from while cash went through a first-open-first-cleared
   chain, so the SAME customer settled in a different order depending on how
   they happened to pay. Two ways of counting money is one too many.

   Three properties this guarantees, and they are the reason it is one function:

     · Oldest first. A payment clears the oldest open invoice on the contract
       before touching a newer one, so arrears never sit behind current bills.

     · All or nothing. The whole allocation is planned, then written in a
       single transaction. A payment spread across six arrears used to be six
       separate writes; anything that interrupted it left some receipts banked
       and the browser showing failure, and the next click paid twice.

     · Nothing is invented. What cannot be allocated to an open balance becomes
       an explicit credit on the customer, not a rounding difference somebody
       discovers three months later.
   ========================================================================== */
import type { PrismaClient, InvoiceStatus } from '@prisma/client';

/** Either the client or a transaction handle — the body works on both. */
type Tx = Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

export interface Allocation {
  invoiceId: string;
  receiptId: string;
  amount: number;
}

export interface AllocateInput {
  /** The invoice the money was offered against. Anchors the FIFO chain. */
  invoiceId: string;
  /** Rupees. Callers holding paise convert once, at their boundary. */
  amount: number;
  mode: string;
  ref: string;
  /** User id of whoever took it; blank for money that arrived on its own. */
  by?: string;
  date?: string;
}

/** Rupees, always whole. Money is never carried as a fraction. */
const rupees = (n: number) => Math.round(Number(n) || 0);

/** Paise from the gateway → rupees, converted once and only here. */
export const fromPaise = (paise: number) => Math.round(Number(paise) || 0) / 100;

export const toPaise = (rs: number) => Math.round((Number(rs) || 0) * 100);

/**
 * Mint the next id for a counter, skipping any that a seeded row already took.
 *
 * Seeded rows were inserted with explicit ids and never counted into the
 * sequence, so a fresh counter collides with them. Scanning past a collision
 * is cheaper than reconciling a duplicate receipt number later.
 */
async function mint(prisma: Tx, key: string, prefix: string, from: number) {
  for (let i = 0; i < 200; i++) {
    const seq = await prisma.seq.upsert({
      where: { key }, create: { key, value: from }, update: { value: { increment: 1 } },
    });
    const id = prefix + seq.value;
    const taken = key === 'receipt'
      ? await prisma.payment.findUnique({ where: { id } })
      : null;
    if (!taken) return id;
  }
  throw new Error('Could not mint a ' + key + ' id');
}

/** What an invoice is worth and what has been paid against it. */
function totalsOf(
  inv: { items: unknown; discount: number; placeOfSupply: string },
  payments: Array<{ amount: number }>,
  docTotal: (inv: unknown) => number,
) {
  return {
    total: rupees(docTotal(inv)),
    paid: payments.reduce((a, p) => a + rupees(p.amount), 0),
  };
}

/**
 * Where an invoice stands once a given amount has been paid against it.
 *
 * Draft and cancelled are decisions somebody made and money does not overrule
 * them: paying against a cancelled invoice is a problem to surface, not a
 * status to quietly flip.
 */
export function deriveStatus(
  current: string, total: number, paid: number, due: string, today: string,
): InvoiceStatus {
  if (current === 'draft' || current === 'cancelled') return current as InvoiceStatus;
  if (paid >= total && total > 0) return 'paid' as InvoiceStatus;
  if (paid > 0) return 'partial' as InvoiceStatus;
  if (due && due < today) return 'overdue' as InvoiceStatus;
  return 'sent' as InvoiceStatus;
}

export interface AllocateResult {
  allocations: Allocation[];
  /** Rupees that found no open balance and became a credit on the customer. */
  credited: number;
  settled: boolean;
}

/**
 * Apply money to a customer's open invoices.
 *
 * `docTotal` is injected rather than imported so this file has no opinion on
 * GST: the tax rules live in the shared money engine and there must be exactly
 * one copy of them.
 */
export async function allocate(
  prisma: PrismaClient,
  input: AllocateInput,
  docTotal: (inv: unknown) => number,
  today: string,
): Promise<AllocateResult> {
  const amountIn = rupees(input.amount);
  if (amountIn <= 0) throw new Error('Nothing to allocate');

  /*
   * Read and write inside ONE transaction, with the invoice rows locked.
   *
   * Planning outside the transaction was a real defect, caught by a test that
   * ran two allocations at the same instant: both read a balance of 11,800,
   * both allocated it, and an invoice owed 11,800 was paid 23,600. Money
   * cannot be decided on a stale read.
   *
   * SELECT ... FOR UPDATE makes the second caller wait for the first to
   * commit, then re-read what the first one did. Cash recorded at the counter
   * and a link paid on a sofa can now land in the same second and still add up.
   */
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: input.invoiceId }, include: { payments: true },
    });
    if (!inv) throw new Error('No such invoice');

    // Arrears clear in the order they were raised.
    const chain = inv.contractId
      ? await tx.invoice.findMany({
          where: { contractId: inv.contractId, status: { notIn: ['draft', 'cancelled'] } },
          include: { payments: true },
          orderBy: { createdAt: 'asc' },
        })
      : [inv];

    // The lock, and the re-read that makes it worth taking.
    const ids = chain.map((c) => c.id);
    await tx.$queryRawUnsafe(
      'SELECT id FROM "Invoice" WHERE id = ANY($1::text[]) FOR UPDATE', ids,
    );
    const fresh = await tx.invoice.findMany({
      where: { id: { in: ids } }, include: { payments: true }, orderBy: { createdAt: 'asc' },
    });

    const date = input.date || today;
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':'
      + String(now.getMinutes()).padStart(2, '0');

    let left = amountIn;
    const planned: Array<Allocation & { status?: InvoiceStatus }> = [];

    for (const o of fresh) {
      if (left <= 0) break;
      const t = totalsOf(o, o.payments, docTotal);
      const balance = Math.max(0, t.total - t.paid);
      if (balance <= 0) continue;
      const take = Math.min(left, balance);
      const next = deriveStatus(o.status, t.total, t.paid + take, o.due, today);
      planned.push({
        invoiceId: o.id,
        receiptId: await mint(tx, 'receipt', 'RCT-', 900),
        amount: take,
        status: next !== o.status ? next : undefined,
      });
      left -= take;
    }

    /*
     * Anything left over is a credit, not a payment against nothing.
     *
     * Writing the surplus onto the invoice would make the invoice read as
     * overpaid and the customer's balance read as wrong. As a credit it stays
     * visible, keeps its history, and applies to the next invoice raised.
     */
    const credited = left;
    if (credited > 0) {
      const creditId = await mint(tx, 'credit', 'CR-', 0);
      await tx.customerCredit.create({
        data: {
          id: creditId, clientId: inv.clientId, amount: toPaise(credited),
          source: 'overpayment',
          note: 'More than was owed on ' + input.invoiceId + ' (' + input.mode + ')',
        },
      });
    }

    for (const a of planned) {
      await tx.payment.create({
        data: {
          id: a.receiptId, invoiceId: a.invoiceId, date, amount: a.amount,
          mode: input.mode, ref: input.ref, by: input.by || '', at: hhmm,
        },
      });
      if (a.status) {
        await tx.invoice.update({ where: { id: a.invoiceId }, data: { status: a.status } });
      }
    }

    const allocations = planned.map((a) => ({
      invoiceId: a.invoiceId, receiptId: a.receiptId, amount: a.amount,
    }));
    const after = await tx.invoice.findUnique({
      where: { id: input.invoiceId }, select: { status: true },
    });
    return { allocations, credited, settled: after?.status === 'paid' };
  });
}

