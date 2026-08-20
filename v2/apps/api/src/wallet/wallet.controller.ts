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
}
