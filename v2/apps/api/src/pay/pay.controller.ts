/* ============================================================================
   UPI collection through Razorpay QR codes. Until the keys are pasted in
   Settings → Integrations this answers with a clear "not connected" message;
   once they exist, the technician's UPI button shows a live QR and the
   payment records itself the moment it is captured.
   ========================================================================== */
import {
  BadRequestException, Controller, Get, NotFoundException, Param, Post,
  Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
    const items = (Array.isArray(inv.items) ? inv.items : []) as Array<{ qty: number; rate: number }>;
    const sub = items.reduce((a, i) => a + (i.qty || 1) * (i.rate || 0), 0) - (inv.discount || 0);
    const total = Math.round(sub * (1 + (co?.gstRate || 18) / 100));
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
}
