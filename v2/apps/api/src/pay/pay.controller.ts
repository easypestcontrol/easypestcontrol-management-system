/* ============================================================================
   UPI collection through Razorpay QR codes. Until the keys are pasted in
   Settings → Integrations this answers with a clear "not connected" message;
   once they exist, the technician's UPI button shows a live QR and the
   payment records itself the moment it is captured.
   ========================================================================== */
import {
  BadRequestException, Controller, Get, NotFoundException, Param, Post,
  Query, Req, UseGuards, Res,
} from '@nestjs/common';
import type { Request, Response} from 'express';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { open } from '../secrets.util';
import { docTotals } from 'shared';
import { allocate, fromPaise } from './allocate';

interface Jwt { user?: { sub?: string; role?: string } }
const RZP = 'https://api.razorpay.com/v1';

@Controller('pay')
@UseGuards(AuthGuard)
export class PayController {
  constructor(private prisma: PrismaService) {}

  private async keys() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    if (!ig.rzpKeyId || !ig.rzpKeySecret) {
      throw new BadRequestException(
        'Razorpay is not connected yet — an admin can paste the keys on the Credentials page. ' +
        'Until then, record the UPI collection manually.');
    }
    return {
      auth: 'Basic ' + Buffer.from(open(ig.rzpKeyId) + ':' + open(ig.rzpKeySecret)).toString('base64'),
    };
  }

  private async balanceOf(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId }, include: { payments: true },
    });
    if (!inv) throw new NotFoundException('No such invoice');
    const co = await this.prisma.company.findFirst();
    /*
     * The shared engine, not a second copy of the tax rules.
     *
     * This used to be sub * (1 + gstRate/100), which ignores place of supply:
     * an inter-state invoice splits into IGST rather than CGST + SGST, and a
     * discount applies before tax, not after. The QR could therefore ask a
     * customer for an amount the invoice did not say. One set of tax rules,
     * in one file.
     */
    const total = Math.round(docTotals(
      (Array.isArray(inv.items) ? inv.items : []) as never,
      inv.discount || 0,
      inv.placeOfSupply || '',
      co?.state || 'Tamil Nadu',
      co?.gstRate ?? 18,
    ).total);
    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
    return { inv, balance: Math.max(0, total - paid) };
  }

  /** Open a single-use QR for the invoice balance. */
  @Post('upi/:invoiceId')
  async openQr(@Param('invoiceId') invoiceId: string, @Req() req: Request & Jwt) {
    const { auth } = await this.keys();
    const { balance } = await this.balanceOf(invoiceId);
    if (balance <= 0) throw new BadRequestException('Nothing left to collect on this invoice');

    const r = await fetch(RZP + '/payments/qr_codes', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'upi_qr', usage: 'single_use', fixed_amount: true,
        payment_amount: balance * 100,
        name: 'PestOps ' + invoiceId,
        notes: { invoiceId, by: req.user?.sub || '' },
      }),
    });
    const qr = (await r.json()) as { id?: string; image_url?: string; error?: { description?: string } };
    if (!r.ok || !qr.id) {
      throw new BadRequestException('Razorpay refused: ' + (qr.error?.description || 'unknown error'));
    }
    return { qrId: qr.id, image: qr.image_url, amount: balance };
  }

  /**
   * The QR image, served from our own origin.
   *
   * Razorpay hands back a whole branded poster — header, UPI logos, the
   * company name — with the actual code about a third of it. The screen wants
   * just the code, and cropping means reading the pixels, and reading the
   * pixels of an image from rzp.io taints the canvas. So it comes through
   * here instead, same-origin, and the browser can look at it.
   *
   * The id is looked up at Razorpay rather than trusting a URL from the
   * client: a server that fetches whatever address it is handed is a server
   * that can be pointed at things it should not see.
   */
  @Get('upi/:qrId/image')
  async qrImage(@Param('qrId') qrId: string, @Res() res: Response) {
    const { auth } = await this.keys();
    const r = await fetch(RZP + '/payments/qr_codes/' + qrId, { headers: { Authorization: auth } });
    const qr = (await r.json()) as { image_url?: string };
    const url = String(qr.image_url || '');
    if (!r.ok || !/^https:\/\/(rzp\.io|[a-z0-9.-]+\.razorpay\.com)\//.test(url)) {
      throw new NotFoundException('No image for that QR');
    }
    const img = await fetch(url);
    if (!img.ok) throw new NotFoundException('No image for that QR');
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/png');
    // A single-use QR is worth caching for as long as it can be paid.
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.send(buf);
  }

  /** Poll until the customer pays; the first captured payment records itself. */
  @Get('upi/:qrId/status')
  async status(
    @Param('qrId') qrId: string,
    @Query('invoiceId') invoiceId: string,
    @Req() req: Request & Jwt,
  ) {
    const { auth } = await this.keys();
    const r = await fetch(RZP + '/payments/qr_codes/' + qrId + '/payments', {
      headers: { Authorization: auth },
    });
    const data = (await r.json()) as { items?: Array<{ id: string; status: string; amount: number }> };
    const hit = (data.items || []).find((p) => p.status === 'captured');
    if (!hit) return { paid: false };

    /*
     * Claim the capture through the intent's unique index, then allocate.
     *
     * This used to be a findFirst on the ref followed by a create, which two
     * simultaneous polls both pass before either writes — the classic
     * check-then-act race, banking the same rupees twice. Now the database
     * decides who won.
     *
     * And it goes through the SAME allocator as cash, so a gateway payment
     * clears the oldest arrears first instead of landing wherever the QR
     * happened to be raised.
     */
    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    try {
      await this.prisma.paymentIntent.create({
        data: {
          id: 'PI-' + seq.value, gatewayRef: qrId, paymentRef: hit.id,
          kind: 'qr', invoiceId,
          amountPaise: Math.round(hit.amount), status: 'paid',
          paidAt: new Date().toISOString().slice(0, 10),
        },
      });
    } catch {
      // Somebody else claimed this capture — a second tab, or the webhook
      // arriving first. Report their receipt rather than making another.
      const already = await this.prisma.payment.findFirst({
        where: { ref: 'Razorpay ' + hit.id },
      });
      return {
        paid: true,
        receipt: already?.id || '',
        amount: already?.amount ?? Math.round(hit.amount / 100),
      };
    }

    const co = await this.prisma.company.findFirst();
    const res = await allocate(
      this.prisma as never,
      {
        invoiceId, amount: fromPaise(hit.amount), mode: 'UPI',
        ref: 'Razorpay ' + hit.id, by: req.user?.sub || '',
      },
      (inv) => {
        const i = inv as { items: unknown; discount: number; placeOfSupply: string };
        return docTotals(
          (i.items || []) as never, i.discount || 0, i.placeOfSupply || '',
          co?.state || 'Tamil Nadu', co?.gstRate ?? 18,
        ).total;
      },
      new Date().toISOString().slice(0, 10),
    );
    const receipt = res.allocations[0]?.receiptId || '';
    await this.prisma.paymentIntent.updateMany({
      where: { paymentRef: hit.id }, data: { receiptId: receipt },
    }).catch(() => {});

    return {
      paid: true, receipt, amount: fromPaise(hit.amount),
      allocations: res.allocations, credited: res.credited,
    };
  }

  /* ======================================================= payment links */

  /**
   * A link the customer can pay from anywhere, at any hour.
   *
   * The QR needs somebody standing there holding a phone. A link is the same
   * money without the appointment — which is the whole point: most invoices
   * are settled in the evening, not at the door.
   *
   * The link is raised for the balance AT THIS MOMENT and recorded as an
   * intent. If the invoice is edited afterwards the link is cancelled rather
   * than left quietly asking for the wrong figure.
   */
  @Post('link/:invoiceId')
  async openLink(@Param('invoiceId') invoiceId: string, @Req() req: Request & Jwt) {
    const { auth } = await this.keys();
    const { inv, balance } = await this.balanceOf(invoiceId);
    if (balance <= 0) throw new BadRequestException('Nothing left to collect on this invoice');

    // An open link for this invoice is reused rather than duplicated: two live
    // links for one balance is two ways to pay the same money twice.
    const live = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId, kind: 'link', status: 'pending' },
    });
    if (live && live.amountPaise === balance * 100) {
      return { linkId: live.gatewayRef, url: live.shortUrl, amount: balance, reused: true };
    }
    if (live) await this.cancelLink(live.gatewayRef, auth).catch(() => {});

    const client = await this.prisma.client.findUnique({ where: { id: inv.clientId } });
    const co = await this.prisma.company.findFirst();

    const r = await fetch(RZP + '/payment_links', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: balance * 100,
        currency: 'INR',
        accept_partial: false,
        description: (co?.name || 'Pest control') + ' — invoice ' + invoiceId,
        customer: {
          name: client?.name || '',
          contact: client?.phone || '',
          email: client?.email || '',
        },
        // Razorpay chases it too. A reminder we do not have to write.
        notify: { sms: !!client?.phone, email: !!client?.email },
        reminder_enable: true,
        // The webhook reads these when an intent cannot be found, so a
        // capture can still find its way home.
        notes: { invoiceId, clientId: inv.clientId, by: req.user?.sub || '' },
      }),
    });
    const link = (await r.json()) as {
      id?: string; short_url?: string; error?: { description?: string };
    };
    if (!r.ok || !link.id) {
      throw new BadRequestException('Razorpay refused: ' + (link.error?.description || 'unknown error'));
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.paymentIntent.create({
      data: {
        id: 'PI-' + seq.value, gatewayRef: link.id, kind: 'link',
        invoiceId, clientId: inv.clientId,
        amountPaise: balance * 100, status: 'pending',
        shortUrl: link.short_url || '',
      },
    });
    return { linkId: link.id, url: link.short_url, amount: balance, reused: false };
  }

  private async cancelLink(linkId: string, auth: string) {
    await fetch(RZP + '/payment_links/' + linkId + '/cancel', {
      method: 'POST', headers: { Authorization: auth },
    });
    await this.prisma.paymentIntent.updateMany({
      where: { gatewayRef: linkId, status: 'pending' }, data: { status: 'cancelled' },
    });
  }

  /** Withdraw a link — used when an invoice is edited, or by hand. */
  @Post('link/:invoiceId/cancel')
  async killLink(@Param('invoiceId') invoiceId: string) {
    const { auth } = await this.keys();
    const live = await this.prisma.paymentIntent.findMany({
      where: { invoiceId, kind: 'link', status: 'pending' },
    });
    for (const l of live) await this.cancelLink(l.gatewayRef, auth).catch(() => {});
    return { cancelled: live.length };
  }

  /** Where an invoice's collection stands, for the screen to show. */
  @Get('state/:invoiceId')
  async state(@Param('invoiceId') invoiceId: string) {
    const intents = await this.prisma.paymentIntent.findMany({
      where: { invoiceId }, orderBy: { createdAt: 'desc' }, take: 5,
    });
    return {
      link: intents.find((i) => i.kind === 'link' && i.status === 'pending')
        ? {
            url: intents.find((i) => i.kind === 'link' && i.status === 'pending')!.shortUrl,
            amount: intents.find((i) => i.kind === 'link' && i.status === 'pending')!.amountPaise / 100,
          }
        : null,
      history: intents.map((i) => ({
        kind: i.kind, status: i.status,
        amount: i.amountPaise / 100, at: i.paidAt || '',
        receipt: i.receiptId,
      })),
    };
  }
}
