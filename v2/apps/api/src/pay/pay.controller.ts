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

    // Record once — the ref carries the Razorpay payment id, so a second poll
    // finding the same capture never books it twice.
    const dupe = await this.prisma.payment.findFirst({ where: { ref: 'Razorpay ' + hit.id } });
    if (dupe) return { paid: true, receipt: dupe.id, amount: dupe.amount };

    let receipt = '';
    for (let i = 0; i < 60; i++) {
      const seq = await this.prisma.seq.upsert({
        where: { key: 'receipt' }, create: { key: 'receipt', value: 900 },
        update: { value: { increment: 1 } },
      });
      const id = 'RCT-' + seq.value;
      if (!(await this.prisma.payment.findUnique({ where: { id } }))) { receipt = id; break; }
    }
    if (!receipt) throw new BadRequestException('Could not mint a receipt number');

    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    await this.prisma.payment.create({
      data: {
        id: receipt, invoiceId, date: now.toISOString().slice(0, 10),
        amount: Math.round(hit.amount / 100), mode: 'UPI',
        ref: 'Razorpay ' + hit.id, by: req.user?.sub || '', at: hhmm,
      },
    });
    // settle the invoice status
    const { balance } = await this.balanceOf(invoiceId);
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: balance <= 0 ? 'paid' : 'partial' },
    }).catch(() => {});
    return { paid: true, receipt, amount: Math.round(hit.amount / 100) };
  }
}
