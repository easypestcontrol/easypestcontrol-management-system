/* ============================================================================
   Technician wallets — cash collected on site sits in the collector's wallet
   until the office marks it deposited. Every entry keeps who / when / which
   invoice, so both the technician and the admin see the same ledger.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, Post, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope } from '../branch.util';
import { open as open2 } from '../secrets.util';

interface Jwt { user?: { sub?: string; role?: string } }

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private prisma: PrismaService) {}

  /**
   * A technician sees their own wallet; admin, ops and accounts see everyone's.
   */
  @Get()
  async view(@Req() req: Request & Jwt) {
    const me = req.user?.sub || '';
    const role = req.user?.role || '';
    const office = ['admin', 'ops', 'accounts'].includes(role);

    const pays = await this.prisma.payment.findMany({
      where: { mode: 'Cash', by: office ? { not: '' } : me },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      include: { invoice: { select: { id: true, clientId: true } } },
    });
    const [users, clients] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, name: true, color: true } }),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
    ]);
    const userOf = new Map(users.map((u) => [u.id, u]));
    const clientOf = new Map(clients.map((c) => [c.id, c.name]));

    const entry = (p: (typeof pays)[number]) => ({
      receipt: p.id, invoiceId: p.invoiceId,
      customer: clientOf.get(p.invoice?.clientId || '') || '—',
      amount: p.amount, date: p.date, at: p.at, settled: p.settled,
    });

    if (!office) {
      const mine = pays.filter((p) => p.by === me);
      return {
        kind: 'mine',
        inHand: mine.filter((p) => !p.settled).reduce((a, b) => a + b.amount, 0),
        entries: mine.slice(0, 50).map(entry),
      };
    }

    // The branch wall: an office login sees the wallets of THEIR branch's
    // technicians; admin sees every branch.
    const scope = await branchScope(this.prisma, req.user);
    const allowed = scope === null
      ? null
      : new Set((await this.prisma.user.findMany({
          where: { branches: { hasSome: scope } }, select: { id: true },
        })).map((u) => u.id));

    const byTech = new Map<string, typeof pays>();
    for (const p of pays) {
      if (allowed && !allowed.has(p.by)) continue;
      if (!byTech.has(p.by)) byTech.set(p.by, []);
      byTech.get(p.by)!.push(p);
    }
    return {
      kind: 'office',
      techs: Array.from(byTech.entries()).map(([id, list]) => ({
        techId: id,
        // A deleted account still owes its history a readable name.
        name: userOf.get(id)?.name || 'Former staff (' + id + ')',
        color: userOf.get(id)?.color || '#888',
        inHand: list.filter((p) => !p.settled).reduce((a, b) => a + b.amount, 0),
        entries: list.slice(0, 30).map(entry),
      })).sort((a, b) => b.inHand - a.inHand),
    };
  }

  /** The office takes the cash: every unsettled entry of that person clears. */
  @Post('settle')
  @Roles('admin', 'ops', 'accounts')
  async settle(@Body() body: Record<string, unknown>) {
    const techId = String(body.techId || '');
    if (!techId) throw new BadRequestException('Whose wallet?');
    const open = await this.prisma.payment.findMany({
      where: { mode: 'Cash', by: techId, settled: false },
    });
    if (!open.length) throw new BadRequestException('Nothing to deposit — the wallet is empty');
    await this.prisma.payment.updateMany({
      where: { id: { in: open.map((p) => p.id) } },
      data: { settled: true },
    });
    const total = open.reduce((a, b) => a + b.amount, 0);
    // The technician hears the money answer — that trust is the wallet.
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    await this.prisma.notification.create({
      data: {
        userId: techId,
        at: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
        text: `Rs ${total.toLocaleString('en-IN')} you deposited is confirmed by accounts (${open.length} receipt${open.length > 1 ? 's' : ''}).`,
      },
    });
    return { settled: open.length, amount: total };
  }

  /* ================================================= settle without travel */

  /**
   * Let a technician transfer in the cash they are holding.
   *
   * Note the DIRECTION. The technician owes the company money; a payout would
   * send money the other way. So this raises a link for them to pay, exactly
   * as a customer would — the money lands in the company account and the cash
   * entries clear.
   *
   * It saves a trip that otherwise happens for no reason other than physically
   * moving notes. Cash actually handed over at the office still settles the
   * old way, because that is what happened and the ledger should say so.
   */
  @Post('settle-online')
  async settleOnline(@Req() req: Request & Jwt) {
    const techId = req.user?.sub || '';
    if (!techId) throw new BadRequestException('Who are you?');

    const open = await this.prisma.payment.findMany({
      where: { mode: 'Cash', by: techId, settled: false },
    });
    const total = open.reduce((a, b) => a + b.amount, 0);
    if (total <= 0) throw new BadRequestException('You are not holding any cash');

    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    if (!ig.rzpKeyId || !ig.rzpKeySecret) {
      throw new BadRequestException(
        'Online transfer is not connected yet — hand the cash in at the office',
      );
    }
    const auth = 'Basic ' + Buffer.from(
      open2(ig.rzpKeyId) + ':' + open2(ig.rzpKeySecret),
    ).toString('base64');

    const live = await this.prisma.paymentIntent.findFirst({
      where: { kind: 'settlement', userId: techId, status: 'pending' },
    });
    if (live && live.amountPaise === total * 100) {
      return { url: live.shortUrl, amount: total, reused: true };
    }

    const me = await this.prisma.user.findUnique({ where: { id: techId } });
    const r = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: total * 100,
        currency: 'INR',
        accept_partial: false,
        description: 'Cash handover — ' + (me?.name || techId),
        customer: { name: me?.name || '', contact: me?.phone || '' },
        notify: { sms: false, email: false }, // they are standing here
        notes: { settleUserId: techId },
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
        id: 'PI-' + seq.value, gatewayRef: link.id, kind: 'settlement',
        userId: techId, amountPaise: total * 100,
        status: 'pending', shortUrl: link.short_url || '',
      },
    });
    return { url: link.short_url, amount: total, reused: false };
  }
}
