import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { branchScope, branchWhere } from '../branch.util';

export interface Hit { id: string; title: string; sub: string; href: string }

/**
 * Global search — one query across everything the topbar can reach.
 * Five hits per group keeps the dropdown scannable; the group pages
 * carry the full lists.
 */
@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async search(
    @Query('q') q: string,
    @Req() req?: { user?: { sub?: string; role?: string } },
  ): Promise<Record<string, Hit[]>> {
    const t = (q || '').trim();
    if (t.length < 2) return {};
    const c = { contains: t, mode: 'insensitive' as const };
    // Search respects the branch wall — a hit you may not open is a leak.
    const bw = branchWhere(await branchScope(this.prisma, req?.user));

    const [clients, leads, quotes, contracts, jobs, invoices] = await Promise.all([
      this.prisma.client.findMany({
        where: { ...bw, OR: [{ name: c }, { phone: { contains: t } }, { area: c }, { id: c }] }, take: 5,
      }),
      this.prisma.lead.findMany({
        where: { ...bw, OR: [{ name: c }, { phone: { contains: t } }, { area: c }, { id: c }] }, take: 5,
      }),
      this.prisma.quotation.findMany({ where: { ...bw, OR: [{ id: c }, { title: c }] }, take: 5 }),
      this.prisma.contract.findMany({ where: { ...bw, OR: [{ id: c }, { scope: c }, { site: c }] }, take: 5 }),
      this.prisma.job.findMany({ where: { ...bw, OR: [{ id: c }, { notes: c }] }, take: 5 }),
      this.prisma.invoice.findMany({ where: { ...bw, id: c }, take: 5 }),
    ]);

    const names = new Map(
      (await this.prisma.client.findMany({ select: { id: true, name: true } }))
        .map((x) => [x.id, x.name]),
    );
    const nm = (id: string) => names.get(id) || id;

    return {
      customers: clients.map((x) => ({
        id: x.id, title: x.name, sub: `${x.area || x.city} · ${x.phone}`, href: '/customers',
      })),
      leads: leads.map((x) => ({
        id: x.id, title: x.name, sub: `${x.stage} · ${x.area}`, href: '/leads',
      })),
      quotations: quotes.map((x) => ({
        id: x.id, title: x.id, sub: `${x.status} · ${x.title || nm(x.clientId)}`, href: `/quotations/${x.id}`,
      })),
      contracts: contracts.map((x) => ({
        id: x.id, title: x.id, sub: `${nm(x.clientId)} · ${x.start} → ${x.end}`, href: `/contracts/${x.id}`,
      })),
      jobs: jobs.map((x) => ({
        id: x.id, title: x.id, sub: `${nm(x.clientId)} · ${x.date} ${x.slot} · ${x.status}`, href: `/jobs/${x.id}`,
      })),
      invoices: invoices.map((x) => ({
        id: x.id, title: x.id, sub: `${nm(x.clientId)} · ${x.status}`, href: `/invoices/${x.id}`,
      })),
    };
  }
}
