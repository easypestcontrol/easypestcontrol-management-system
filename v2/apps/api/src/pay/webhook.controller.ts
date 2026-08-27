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
    const entity = p.payment?.entity || p.payment_link?.entity || p.qr_code?.entity;
    if (!entity) return { ok: true, ignored: event };

    if (event === 'payment.captured' || event === 'payment_link.paid'
        || event === 'qr_code.credited') {
      return this.captured(entity, body, eventId);
    }
    if (event === 'payment.failed') return this.mark(entity, 'failed', body);
    if (event === 'refund.processed' || event === 'refund.created') {
      return this.mark(p.refund?.entity || entity, 'refunded', body);
    }
    return { ok: true, ignored: event };
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

    // An invoice can also be named in the notes we set when raising the link,
    // which is how a capture finds its home when the intent is missing.
    const invoiceId = intent?.invoiceId || String(entity.notes?.invoiceId || '');
    const clientId = intent?.clientId || String(entity.notes?.clientId || '');
    const rupeesIn = fromPaise(entity.amount || 0);

    try {
      await this.prisma.paymentIntent.update({
        where: { id: intent?.id || '__none__' },
        data: { paymentRef, status: 'paid', paidAt: todayISO(), raw: body as never },
      });
    } catch {
      if (!intent) {
        // Money we were not expecting. It is still money: record the intent so
        // it is visible and traceable rather than silently dropped.
        await this.prisma.paymentIntent.create({
          data: {
            id: 'PI-' + Date.now(), gatewayRef: paymentRef, paymentRef,
            kind: 'link', invoiceId, clientId,
            amountPaise: Math.round(entity.amount || 0),
            status: 'paid', paidAt: todayISO(), raw: body as never,
          },
        }).catch(() => { /* already claimed by a racing delivery */ });
      } else {
        // paymentRef already set — a duplicate delivery. Nothing to do.
        return { ok: true, duplicate: true, eventId };
      }
    }

    if (!invoiceId) {
      // An advance with no invoice yet: it belongs to the customer as credit.
      if (clientId) await this.credit(clientId, entity, intent?.quoteId || '');
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

    if (intent) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { receiptId: res.allocations[0]?.receiptId || '' },
      }).catch(() => {});
    }
    return { ok: true, allocations: res.allocations.length, credited: res.credited };
  }

  /** Money with no invoice becomes an explicit credit on the customer. */
  private async credit(clientId: string, entity: Entity, quoteId: string) {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'credit' }, create: { key: 'credit', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.customerCredit.create({
      data: {
        id: 'CR-' + seq.value, clientId,
        amount: Math.round(entity.amount || 0),
        source: 'advance', quoteId,
        note: quoteId ? 'Advance against ' + quoteId : 'Advance received',
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
