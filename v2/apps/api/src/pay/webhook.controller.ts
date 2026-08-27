/* ============================================================================
   What Razorpay tells us, and the only thing that turns a gateway capture into
   money in this system.

   Before this existed, a payment was recorded only if a browser happened to be
   polling when it landed. A customer paying after the technician closed the
   app left the money at Razorpay and the invoice reading unpaid — nothing was
   listening. Now the gateway calls us, and polling is a courtesy for the
   person standing there watching a QR code.

   Two properties matter more than anything else here:

     · It is PUBLIC, so it is authenticated by signature instead. Anyone can
       reach this URL; only Razorpay can sign a body with the shared secret.
       An unsigned or wrongly-signed request is refused before it is read.

     · It is idempotent by database constraint. Razorpay retries — that is
       documented behaviour, not a fault — and a retry must never bank the
       same rupees twice. The second write hits a unique index and stops. We
       do not check-then-write, because between the check and the write is
       exactly where the money is lost.
   ========================================================================== */
import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import * as crypto from 'crypto';
import { docTotals } from 'shared';
import { PrismaService } from '../prisma.service';
import { Public } from '../auth/auth.guard';
import { open } from '../secrets.util';
import { allocate, fromPaise } from './allocate';

const todayISO = () => new Date().toISOString().slice(0, 10);

interface Entity {
  id?: string;
  amount?: number;
  status?: string;
  order_id?: string;
  invoice_id?: string;
  payment_link_id?: string;
  notes?: Record<string, string>;
  description?: string;
}
interface Hook {
  event?: string;
  payload?: {
    payment?: { entity?: Entity };
    payment_link?: { entity?: Entity };
    qr_code?: { entity?: Entity };
    refund?: { entity?: Entity };
    subscription?: { entity?: Entity };
  };
}

@Controller('pay/webhook')
export class PayWebhookController {
  constructor(private prisma: PrismaService) {}

  /**
   * The shared secret Razorpay signs with. Set on the Razorpay dashboard when
   * the webhook is created, and pasted here — it is NOT the API key secret.
   */
  private async secret(): Promise<string> {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    return open(ig.rzpWebhookSecret || '');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: Hook,
    // The raw bytes, captured by the body parser — a signature is over what
    // was SENT, and re-serialising an object does not reproduce it.
    @Headers('x-razorpay-event-id') eventId: string,
  ) {
    const secret = await this.secret();
    if (!secret) {
      // Nothing is configured, so nothing can be trusted. Answer 200 so
      // Razorpay stops retrying into a system that is not listening yet.
      return { ok: false, why: 'no webhook secret configured' };
    }

    const raw = (body as unknown as { rawBody?: Buffer }).rawBody;
    const payload = raw ? raw.toString('utf8') : JSON.stringify(body);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!signature || signature.length !== expected.length
        || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      // Refused, but with 200: a 4xx makes Razorpay retry a request that will
      // never become valid, and the retries are indistinguishable from an
      // attack in the logs.
      return { ok: false, why: 'bad signature' };
    }

    const event = String(body.event || '');
    const p = body.payload || {};
    const entity = p.payment?.entity || p.payment_link?.entity || p.qr_code?.entity
      || p.subscription?.entity;
    if (!entity) return { ok: true, ignored: event };

    /*
     * An auto-debit went through.
     *
     * Handled before the generic capture, because a mandate's intent names the
     * CONTRACT, not an invoice — allocating to it directly would look for an
     * invoice with a contract's id and find nothing. The charge belongs to
     * whichever instalment is oldest and still open.
     */
    if (event === 'subscription.charged') {
      const charge = p.payment?.entity;
      const sub = p.subscription?.entity;
      if (!charge || !sub) return { ok: true, ignored: event };
      const target = await this.instalmentFor(String(sub.id || ''));
      if (!target) {
        // Money arrived with nothing open to put it against: hold it as
        // credit rather than inventing somewhere for it to go.
        const m = await this.prisma.paymentIntent.findFirst({
          where: { kind: 'mandate', gatewayRef: String(sub.id || '') },
        });
        if (m?.clientId) await this.credit(m.clientId, charge, '');
        return { ok: true, credited: true };
      }
      return this.captured({ ...charge, notes: { invoiceId: target } }, body, eventId);
    }
    if (event === 'payment.captured' || event === 'payment_link.paid'
        || event === 'qr_code.credited') {
      return this.captured(entity, body, eventId);
    }
    // The customer signed the mandate. It collects from here on.
    if (event === 'subscription.activated' || event === 'subscription.authenticated') {
      await this.prisma.paymentIntent.updateMany({
        where: { kind: 'mandate', gatewayRef: String(entity.id || '') },
        data: { status: 'paid', paidAt: todayISO(), raw: body as never },
      });
      return { ok: true, mandate: 'active' };
    }
    /*
     * A debit that did not go through has to reach a person.
     *
     * This is the failure mode that makes standing instructions dangerous: the
     * business believes it is being paid, the bank quietly declined, and
     * nobody notices for a quarter. A task with a name on it is the only
     * honest response.
     */
    if (event === 'subscription.halted' || event === 'subscription.pending') {
      await this.prisma.paymentIntent.updateMany({
        where: { kind: 'mandate', gatewayRef: String(entity.id || '') },
        data: { status: 'failed', raw: body as never },
      });
      await this.flagMandate(String(entity.id || ''), event);
      return { ok: true, mandate: 'needs attention' };
    }
    if (event === 'payment.failed') return this.mark(entity, 'failed', body);
    if (event === 'refund.processed' || event === 'refund.created') {
      return this.mark(p.refund?.entity || entity, 'refunded', body);
    }
    return { ok: true, ignored: event };
  }

  /** The oldest instalment on a mandate's contract that is still owed. */
  private async instalmentFor(subId: string): Promise<string> {
    const m = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'mandate', gatewayRef: subId },
    });
    if (!m?.invoiceId) return '';
    const open = await this.prisma.invoice.findFirst({
      where: {
        contractId: m.invoiceId,
        status: { in: ['sent', 'partial', 'overdue'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return open?.id || '';
  }

  /* ------------------------------------------------------------- captured */

  private async captured(entity: Entity, body: Hook, eventId: string) {
    const paymentRef = String(entity.id || '');
    if (!paymentRef) return { ok: false, why: 'no payment id' };

    /*
     * Claim this capture, or discover somebody already has.
     *
     * The unique index on paymentRef is what makes this safe. A retry, a
     * concurrent poll and a second webhook all race here, and exactly one
     * wins — the losers get a constraint violation and stop. This is the
     * difference between idempotent and usually-idempotent.
     */
    const link = String(entity.payment_link_id || entity.order_id || '');
    const intent = await this.prisma.paymentIntent.findFirst({
      where: link
        ? { OR: [{ gatewayRef: link }, { gatewayRef: paymentRef }] }
        : { gatewayRef: paymentRef },
    });

    /*
     * A technician handing in the cash they are carrying.
     *
     * Not a customer payment: no invoice moves, no receipt is minted. What
     * clears is the settled flag on the cash they already collected, which is
     * exactly what happens when they walk the notes into the office.
     */
    const settleUser = intent?.userId || String(entity.notes?.settleUserId || '');
    if (settleUser && (intent?.kind === 'settlement' || entity.notes?.settleUserId)) {
      await this.prisma.paymentIntent.updateMany({
        where: { gatewayRef: intent?.gatewayRef || link || paymentRef },
        data: { paymentRef, status: 'paid', paidAt: todayISO(), raw: body as never },
      }).catch(() => {});
      const held = await this.prisma.payment.findMany({
        where: { mode: 'Cash', by: settleUser, settled: false },
      });
      await this.prisma.payment.updateMany({
        where: { id: { in: held.map((h) => h.id) } }, data: { settled: true },
      });
      return { ok: true, settled: held.length };
    }

    // An invoice can also be named in the notes we set when raising the link,
    // which is how a capture finds its home when the intent is missing.
    const invoiceId = intent?.invoiceId || String(entity.notes?.invoiceId || '');
    const clientId = intent?.clientId || String(entity.notes?.clientId || '');
    const rupeesIn = fromPaise(entity.amount || 0);

    /*
     * Claim this capture, exactly once.
     *
     * This block used to be a plain update wrapped in a try/catch, on the
     * assumption that a second delivery would violate the unique index and
     * land in the catch. It does not. Writing the SAME paymentRef onto the
     * SAME row is a perfectly legal update — so every redelivery fell through
     * and credited the customer again. Razorpay redelivers as a matter of
     * course, and a live test caught this crediting an advance twice.
     *
     * The claim is now conditional: it matches only while the intent is
     * unclaimed. Two deliveries racing each other both try, the second blocks
     * on the row lock, re-reads what the first committed, matches nothing, and
     * stops. One capture, one claim, no arithmetic involved.
     */
    if (intent) {
      const claim = await this.prisma.paymentIntent.updateMany({
        where: { id: intent.id, OR: [{ paymentRef: null }, { paymentRef: '' }] },
        data: { paymentRef, status: 'paid', paidAt: todayISO(), raw: body as never },
      });
      if (claim.count === 0) {
        // Somebody got here first. If it was this same payment, we are simply
        // being told twice and there is nothing to do.
        if (intent.paymentRef === paymentRef) {
          return { ok: true, duplicate: true, eventId };
        }
        /*
         * A DIFFERENT payment against the same gateway object. Should not
         * happen — our links are single-use — but money that arrived is money
         * that arrived, and dropping it silently would be the worse mistake.
         * It gets its own intent and carries on below.
         */
        const spare = await this.record(paymentRef, invoiceId, clientId, entity, body);
        if (!spare) return { ok: true, duplicate: true, eventId };
      }
    } else {
      // Money we were not expecting. It is still money: record it so it is
      // visible and traceable rather than silently dropped.
      const fresh = await this.record(paymentRef, invoiceId, clientId, entity, body);
      // The unique index refused it, so a racing delivery already has it.
      if (!fresh) return { ok: true, duplicate: true, eventId };
    }

    if (!invoiceId) {
      /*
       * Money collected against a contract before it has been billed — the
       * advance taken at signing, or a part payment. It belongs to the
       * customer as credit, tagged with the contract so it can only ever be
       * spent on that contract's own instalments.
       */
      const contractId = intent?.contractId || String(entity.notes?.contractId || '');
      if (clientId) await this.credit(clientId, entity, contractId);
      return { ok: true, credited: true };
    }

    const co = await this.prisma.company.findFirst();
    const rate = co?.gstRate ?? 18;
    const home = co?.state || 'Tamil Nadu';

    const res = await allocate(
      this.prisma as never,
      {
        invoiceId, amount: rupeesIn, mode: 'UPI',
        ref: 'Razorpay ' + paymentRef, by: '',
      },
      (inv) => {
        const i = inv as { items: unknown; discount: number; placeOfSupply: string };
        return docTotals(
          (i.items || []) as never, i.discount || 0, i.placeOfSupply || '', home, rate,
        ).total;
      },
      todayISO(),
    );

    /*
     * Stamp the receipt onto whichever intent carries this capture.
     *
     * By id would have missed the common case: money we did not raise an
     * intent for — a QR paid at a door — has its intent created a few lines
     * above, so `intent` is null here and the receipt was never written back.
     * The screen watching for that receipt then saw a paid intent with no
     * receipt on it. By paymentRef there is exactly one row, whoever made it.
     */
    await this.prisma.paymentIntent.updateMany({
      where: { paymentRef },
      data: { receiptId: res.allocations[0]?.receiptId || '' },
    }).catch(() => {});
    return { ok: true, allocations: res.allocations.length, credited: res.credited };
  }

  /**
   * Put a failed standing instruction in front of somebody.
   *
   * Deliberately a Task rather than a notification: a notification is read
   * once and gone, and this needs to stay on a list until a human has dealt
   * with the customer's bank.
   */
  private async flagMandate(subId: string, event: string) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'mandate', gatewayRef: subId },
    });
    if (!intent) return;
    const client = intent.clientId
      ? await this.prisma.client.findUnique({ where: { id: intent.clientId } })
      : null;
    const seq = await this.prisma.seq.upsert({
      where: { key: 'task' }, create: { key: 'task', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.task.create({
      data: {
        id: 'TSK-' + seq.value,
        title: 'Auto-debit failed — ' + (client?.name || intent.clientId),
        notes: 'The standing instruction on contract ' + intent.invoiceId
          + ' reported "' + event + '". The instalment has NOT been collected. '
          + 'Ring the customer, then either take the payment another way or ask '
          + 'them to re-authorise.',
        priority: 'high',
        due: todayISO(),
        branch: '',
      },
    }).catch(() => { /* a task failing must not lose the webhook */ });
  }

  /** Money with no invoice becomes an explicit credit on the customer. */
  /**
   * Write an intent for a capture we did not raise ourselves.
   *
   * Returns false when the unique index refuses it — which means another
   * delivery of this same payment already recorded it, and the caller must
   * stop rather than count the money again.
   */
  private async record(
    paymentRef: string, invoiceId: string, clientId: string, entity: Entity, body: Hook,
  ): Promise<boolean> {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    try {
      await this.prisma.paymentIntent.create({
        data: {
          id: 'PI-' + seq.value, gatewayRef: paymentRef, paymentRef,
          kind: 'link', invoiceId, clientId,
          amountPaise: Math.round(entity.amount || 0),
          status: 'paid', paidAt: todayISO(), raw: body as never,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async credit(clientId: string, entity: Entity, contractId: string) {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'credit' }, create: { key: 'credit', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.customerCredit.create({
      data: {
        id: 'CR-' + seq.value, clientId,
        amount: Math.round(entity.amount || 0),
        source: 'advance', contractId,
        note: contractId ? 'Advance against ' + contractId : 'Advance received',
      },
    }).catch(() => {});
  }

  /* ------------------------------------------------- failed and refunded */

  private async mark(entity: Entity, status: string, body: Hook) {
    const ref = String(entity.id || '');
    if (!ref) return { ok: false };
    await this.prisma.paymentIntent.updateMany({
      where: { OR: [{ gatewayRef: ref }, { paymentRef: ref }] },
      data: { status, raw: body as never },
    });
    // A refund does not delete the receipt. The money did arrive and did go
    // back; both are facts, and a ledger that erases the first is lying.
    return { ok: true, status };
  }
}
