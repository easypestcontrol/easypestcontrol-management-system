/* ============================================================================
   Collecting money against a contract, before there is an invoice for it.

   The advance used to hang off the quotation, and that was the wrong document.
   A quotation is an offer: it may be accepted, it may be declined, and asking
   somebody to pay against something they have not agreed to is asking at the
   wrong moment. The accepted one becomes a contract, and the contract is where
   money is actually collected.

   There is deliberately no advance RULE — no percentage set in advance, no
   company policy, nothing computed. Whoever is collecting types the amount
   they agreed with the customer, on the spot, and shares the link. A two-lakh
   termite job and a one-visit spray are different conversations, and the
   person having the conversation is the only one who knows the number.

   Where the money goes: a capture that names a contract but no invoice lands
   as CustomerCredit tagged with that contract. It then draws itself down
   against that contract's instalments as they are raised — as a real receipt,
   not a discount — and it can never be spent on a different contract.
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

@Controller('collect')
@UseGuards(AuthGuard)
export class CollectController {
  constructor(private prisma: PrismaService) {}

  /**
   * The branch wall, applied before anything is read or asked for.
   *
   * What a customer has paid is a branch's own business. Without this any
   * signed-in technician could read another branch's contract value and the
   * money against it simply by knowing the id — which is the same hole that
   * was found on the dispatch board, and it does not get to happen twice.
   *
   * A contract outside your scope answers 404, not 403. Telling somebody
   * "you may not see this one" confirms it exists.
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
      throw new BadRequestException('Online payment is not connected yet');
    }
    return 'Basic ' + Buffer.from(
      open(ig.rzpKeyId) + ':' + open(ig.rzpKeySecret),
    ).toString('base64');
  }

  /**
   * What has been collected against this contract ahead of billing, and
   * whether a link is currently out with the customer.
   */
  @Get(':contractId')
  async state(@Param('contractId') contractId: string, @Req() req: Request & Jwt) {
    await this.reach(contractId, req);
    const [credits, live] = await Promise.all([
      this.prisma.customerCredit.findMany({ where: { contractId } }),
      this.prisma.paymentIntent.findFirst({
        where: { contractId, kind: 'link', status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const received = credits.reduce((a, c) => a + c.amount, 0) / 100;
    const spent = credits.reduce((a, c) => a + c.used, 0) / 100;

    return {
      received,
      // What is still sitting on the customer, not yet applied to a bill.
      unused: Math.max(0, received - spent),
      link: live ? { url: live.shortUrl, amount: live.amountPaise / 100 } : null,
    };
  }

  /**
   * Ask the customer for an amount, and hand back a link to share.
   *
   * The amount is whatever was agreed. It is not checked against the contract
   * value — a customer may pay a deposit, a round figure, or the whole thing
   * up front, and none of those is an error. Anything that ends up beyond what
   * the contract eventually bills stays on their account as credit.
   */
  @Post(':contractId/link')
  @Roles('admin', 'ops', 'sales', 'accounts')
  async link(
    @Param('contractId') contractId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & Jwt,
  ) {
    const c = await this.reach(contractId, req);

    const amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0) throw new BadRequestException('Enter the amount to collect');

    // One live link at a time. Two links out for one contract is two ways to
    // pay the same money twice, and the customer cannot tell them apart.
    const live = await this.prisma.paymentIntent.findFirst({
      where: { contractId, kind: 'link', status: 'pending' },
    });
    if (live) {
      if (live.amountPaise === amount * 100) {
        return { url: live.shortUrl, amount, reused: true };
      }
      await this.kill(live.gatewayRef).catch(() => {});
    }

    const [client, co] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: c.clientId } }),
      this.prisma.company.findFirst(),
    ]);

    const r = await fetch(RZP + '/payment_links', {
      method: 'POST',
      headers: { Authorization: await this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        accept_partial: false,
        description: (co?.name || 'Pest control') + ' — ' + contractId,
        customer: {
          name: client?.name || '', contact: client?.phone || '', email: client?.email || '',
        },
        notify: { sms: !!client?.phone, email: !!client?.email },
        reminder_enable: true,
        /*
         * No invoiceId, on purpose. The webhook reads this, finds a contract
         * and no invoice, and files the money as credit against the contract.
         * That is the intended path, not a fallback.
         */
        notes: { contractId, clientId: c.clientId, by: req.user?.sub || '' },
      }),
    });
    const link = (await r.json()) as {
      id?: string; short_url?: string; error?: { description?: string };
    };
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
        contractId, clientId: c.clientId,
        amountPaise: amount * 100, status: 'pending', shortUrl: link.short_url || '',
      },
    });
    return { url: link.short_url, amount, reused: false };
  }

  /** Withdraw the request. */
  @Post(':contractId/cancel')
  @Roles('admin', 'ops', 'sales', 'accounts')
  async cancel(@Param('contractId') contractId: string, @Req() req: Request & Jwt) {
    await this.reach(contractId, req);
    const live = await this.prisma.paymentIntent.findMany({
      where: { contractId, kind: 'link', status: 'pending' },
    });
    for (const l of live) await this.kill(l.gatewayRef).catch(() => {});
    return { cancelled: live.length };
  }

  private async kill(linkId: string) {
    await fetch(RZP + '/payment_links/' + linkId + '/cancel', {
      method: 'POST', headers: { Authorization: await this.auth() },
    });
    await this.prisma.paymentIntent.updateMany({
      where: { gatewayRef: linkId, status: 'pending' }, data: { status: 'cancelled' },
    });
  }
}
