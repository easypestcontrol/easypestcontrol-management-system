/* ============================================================================
   Standing instruction on an AMC, so the instalment collects itself.

   The customer authorises once — UPI AutoPay, or a card e-mandate — and each
   instalment is debited on its due date without anybody asking. For an annual
   contract billed quarterly that is three phone calls a year that stop
   happening.

   What matters here, and the reason this is not simply "call Razorpay":

     · A mandate is CONSENT, not a payment. It is created against the contract
       and does nothing until the customer signs it on Razorpay's page. Until
       then the contract bills exactly as it did before.

     · An auto-debit comes back through the same webhook and the same
       allocator as every other rupee. There is no second way of counting
       money in this system, and a subscription charge is not going to be the
       thing that introduces one.

     · A FAILED debit raises a task for a person. A mandate that silently
       stops collecting is worse than no mandate: the business believes it is
       being paid and is not. Somebody has to be told.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, inScope } from '../branch.util';
import { open } from '../secrets.util';

const RZP = 'https://api.razorpay.com/v1';
interface Jwt { user?: { sub?: string; role?: string } }

/** Razorpay counts a period and an interval; a contract states a frequency. */
function cadence(freq: string): { period: string; interval: number } {
  const f = (freq || '').toLowerCase();
  if (f.includes('month')) return { period: 'monthly', interval: 1 };
  if (f.includes('quarter')) return { period: 'monthly', interval: 3 };
  if (f.includes('half') || f.includes('six')) return { period: 'monthly', interval: 6 };
  if (f.includes('year') || f.includes('annual')) return { period: 'yearly', interval: 1 };
  return { period: 'monthly', interval: 1 };
}

@Controller('mandate')
@UseGuards(AuthGuard)
export class MandateController {
  constructor(private prisma: PrismaService) {}

  /**
   * The branch wall. A contract outside your scope answers 404, not 403 —
   * telling somebody "you may not see this one" confirms it exists.
   */
  private async reach(contractId: string, req: Request & Jwt) {
    const c = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundException('No such contract');
    if (!inScope(await branchScope(this.prisma, req.user), c.branch)) {
      throw new NotFoundException('No such contract');
    }
    return c;
  }

  private async auth() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    if (!ig.rzpKeyId || !ig.rzpKeySecret) {
      throw new BadRequestException('Razorpay is not connected yet');
    }
    return 'Basic ' + Buffer.from(
      open(ig.rzpKeyId) + ':' + open(ig.rzpKeySecret),
    ).toString('base64');
  }

  /** Where a contract's standing instruction stands. */
  @Get(':contractId')
  async state(@Param('contractId') contractId: string, @Req() req: Request & Jwt) {
    await this.reach(contractId, req);
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'mandate', invoiceId: contractId },
      orderBy: { createdAt: 'desc' },
    });
    if (!intent) return { active: false, status: 'none', url: '' };
    return {
      active: intent.status === 'paid',
      status: intent.status,
      url: intent.shortUrl,
      amount: intent.amountPaise / 100,
    };
  }

  /**
   * Offer the customer a standing instruction on this contract.
   *
   * Only admin and accounts: this asks somebody to authorise recurring debits
   * against their bank account, which is not a technician's decision to make.
   */
  @Post(':contractId')
  @Roles('admin', 'accounts')
  async create(@Param('contractId') contractId: string, @Req() req: Request & Jwt) {
    const c = await this.reach(contractId, req);
    if (c.billingMode === 'upfront') {
      throw new BadRequestException(
        'This contract is billed in full up front — there is nothing recurring to authorise',
      );
    }

    const live = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'mandate', invoiceId: contractId, status: { in: ['pending', 'paid'] } },
    });
    if (live) return { url: live.shortUrl, status: live.status, reused: true };

    const amount = Math.round(c.billingAmount || 0);
    if (amount <= 0) {
      throw new BadRequestException('This contract has no instalment amount to charge');
    }

    const auth = await this.auth();
    const co = await this.prisma.company.findFirst();
    const client = await this.prisma.client.findUnique({ where: { id: c.clientId } });
    const { period, interval } = cadence(c.billing || c.freq || '');

    // A plan is the shape of the charge; the subscription is this customer's
    // agreement to it. Razorpay wants both, in that order.
    const planRes = await fetch(RZP + '/plans', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period, interval,
        item: {
          name: (co?.name || 'Pest control') + ' — ' + contractId,
          amount: Math.round(amount * (1 + (co?.gstRate ?? 18) / 100)) * 100,
          currency: 'INR',
        },
        notes: { contractId, clientId: c.clientId },
      }),
    });
    const plan = (await planRes.json()) as { id?: string; error?: { description?: string } };
    if (!planRes.ok || !plan.id) {
      throw new BadRequestException('Razorpay refused the plan: '
        + (plan.error?.description || 'unknown'));
    }

    // How many charges remain on this contract, so the instruction ends when
    // the contract does rather than running for ever.
    const count = Math.max(1, Math.round(c.totalVisits || 12));

    const subRes = await fetch(RZP + '/subscriptions', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: plan.id,
        total_count: count,
        customer_notify: 1,
        notes: { contractId, clientId: c.clientId, by: req.user?.sub || '' },
      }),
    });
    const sub = (await subRes.json()) as {
      id?: string; short_url?: string; error?: { description?: string };
    };
    if (!subRes.ok || !sub.id) {
      throw new BadRequestException('Razorpay refused the mandate: '
        + (sub.error?.description || 'unknown'));
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.paymentIntent.create({
      data: {
        id: 'PI-' + seq.value, gatewayRef: sub.id, kind: 'mandate',
        // The contract, not an invoice: a mandate outlives any single bill.
        invoiceId: contractId, clientId: c.clientId,
        amountPaise: amount * 100, status: 'pending', shortUrl: sub.short_url || '',
      },
    });

    return {
      url: sub.short_url, status: 'pending', reused: false,
      customer: client?.name || '', amount,
    };
  }

  /** Withdraw the standing instruction. */
  @Post(':contractId/cancel')
  @Roles('admin', 'accounts')
  async cancel(@Param('contractId') contractId: string, @Req() req: Request & Jwt) {
    await this.reach(contractId, req);
    const live = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'mandate', invoiceId: contractId, status: { in: ['pending', 'paid'] } },
    });
    if (!live) throw new NotFoundException('No standing instruction on this contract');
    await fetch(RZP + '/subscriptions/' + live.gatewayRef + '/cancel', {
      method: 'POST',
      headers: { Authorization: await this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    }).catch(() => {});
    await this.prisma.paymentIntent.update({
      where: { id: live.id }, data: { status: 'cancelled' },
    });
    return { ok: true };
  }
}
