/* ============================================================================
   The advance a customer pays when they approve a quotation.

   This is the only money in the system that arrives before there is an invoice
   to put it on, and that is the whole difficulty. A Payment row belongs to an
   invoice; at approval time no invoice exists, and inventing a placeholder one
   would put a document in the customer's history that nobody ever sent them.

   So it lands as a CustomerCredit — money held against the customer, real from
   the moment it arrives — and draws down automatically as invoices are raised.
   The credit keeps its own history, so "we already paid ₹7,000" has an answer
   that does not depend on anyone's memory.

   The approval page is public: a customer clicks a link in WhatsApp and is not
   signed in to anything. So these routes are public too, and are safe because
   they can only ever create a demand for money, never move it — the money
   itself moves through Razorpay and comes back through the signed webhook.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Post,
} from '@nestjs/common';
import { docTotals } from 'shared';
import { PrismaService } from '../prisma.service';
import { Public } from '../auth/auth.guard';
import { open } from '../secrets.util';

const RZP = 'https://api.razorpay.com/v1';

@Controller('advance')
export class AdvanceController {
  constructor(private prisma: PrismaService) {}

  private async auth() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    if (!ig.rzpKeyId || !ig.rzpKeySecret) {
      throw new BadRequestException('Online payment is not connected yet');
    }
    return 'Basic ' + Buffer.from(
      open(ig.rzpKeyId) + ':' + open(ig.rzpKeySecret),
    ).toString('base64');
  }

  /** What this quotation is worth, through the one tax engine. */
  private async quoteValue(quoteId: string) {
    const [q, co] = await Promise.all([
      // Quotation lines are their own rows, not a JSON column like an
      // invoice's — the engine takes qty and rate either way.
      this.prisma.quotation.findUnique({ where: { id: quoteId }, include: { items: true } }),
      this.prisma.company.findFirst(),
    ]);
    if (!q) throw new NotFoundException('No such quotation');
    const total = Math.round(docTotals(
      (q.items || []) as never,
      q.discount || 0,
      q.placeOfSupply || '',
      co?.state || 'Tamil Nadu',
      co?.gstRate ?? 18,
    ).total);
    return { q, total, co };
  }

  /**
   * What the customer is being asked for, and whether they have paid it.
   *
   * The approval page calls this before showing a Pay button, so a customer
   * who has already paid never sees the button again.
   */
  @Public()
  @Get(':quoteId')
  async state(@Param('quoteId') quoteId: string) {
    const { q, total } = await this.quoteValue(quoteId);
    const pct = Math.max(0, Math.min(100, q.advancePct || 0));
    const asked = Math.round((total * pct) / 100);

    const paid = await this.prisma.customerCredit.findFirst({ where: { quoteId } });
    const pending = await this.prisma.paymentIntent.findFirst({
      where: { quoteId, kind: 'link', status: 'pending' },
    });

    return {
      quoteId, pct, asked, total,
      paid: paid ? paid.amount / 100 : 0,
      url: paid ? '' : pending?.shortUrl || '',
    };
  }

  /**
   * Raise a link for the advance.
   *
   * No invoice is named, so the webhook will see money with a clientId and no
   * invoiceId and file it as credit. That is the intended path, not a
   * fallback.
   */
  @Public()
  @Post(':quoteId/link')
  async link(@Param('quoteId') quoteId: string, @Body() _body: unknown) {
    const { q, total, co } = await this.quoteValue(quoteId);
    const pct = Math.max(0, Math.min(100, q.advancePct || 0));
    const asked = Math.round((total * pct) / 100);
    if (asked <= 0) throw new BadRequestException('No advance is asked for on this quotation');

    const already = await this.prisma.customerCredit.findFirst({ where: { quoteId } });
    if (already) throw new BadRequestException('The advance on this quotation is already paid');

    const live = await this.prisma.paymentIntent.findFirst({
      where: { quoteId, kind: 'link', status: 'pending' },
    });
    if (live && live.amountPaise === asked * 100) {
      return { url: live.shortUrl, amount: asked, reused: true };
    }

    const client = q.clientId
      ? await this.prisma.client.findUnique({ where: { id: q.clientId } })
      : null;

    const r = await fetch(RZP + '/payment_links', {
      method: 'POST',
      headers: { Authorization: await this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: asked * 100,
        currency: 'INR',
        accept_partial: false,
        description: (co?.name || 'Pest control') + ' — advance on ' + quoteId,
        customer: {
          name: client?.name || '', contact: client?.phone || '', email: client?.email || '',
        },
        notify: { sms: !!client?.phone, email: !!client?.email },
        reminder_enable: true,
        // No invoiceId on purpose: the webhook files this as customer credit.
        notes: { quoteId, clientId: q.clientId || '' },
      }),
    });
    const link = (await r.json()) as { id?: string; short_url?: string; error?: { description?: string } };
    if (!r.ok || !link.id) {
      throw new BadRequestException('Razorpay refused: ' + (link.error?.description || 'unknown'));
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.paymentIntent.create({
      data: {
        id: 'PI-' + seq.value, gatewayRef: link.id, kind: 'link',
        quoteId, clientId: q.clientId || '',
        amountPaise: asked * 100, status: 'pending', shortUrl: link.short_url || '',
      },
    });
    return { url: link.short_url, amount: asked, reused: false };
  }
}
