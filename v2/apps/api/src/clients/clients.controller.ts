import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope, inferBranch } from '../branch.util';

interface AuthedReq { user?: { sub?: string; role?: string } }

const EDITABLE = [
  'name', 'type', 'contact', 'phone', 'email', 'addr', 'city', 'pin',
  'gstin', 'color', 'area', 'branch',
  // identity
  'custKind', 'salutation', 'firstName', 'lastName', 'company', 'language',
  'workPhone', 'channels',
  // tax & terms — the GST split reads placeOfSupply from here
  'gstTreatment', 'placeOfSupply', 'pan', 'taxPref', 'currency',
  'openingBalance', 'payTerms', 'propertySize', 'portal',
  // detail blocks
  'billing', 'shipping', 'sites', 'contacts', 'docs', 'remarks',
] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  if ('openingBalance' in data) data.openingBalance = Number(data.openingBalance) || 0;
  if ('portal' in data) data.portal = !!data.portal;
  return data;
}

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthedReq, @Query('q') q?: string, @Query('branch') branch?: string) {
    /* Today, as the app writes dates. */
    const now = new Date();
    const today = now.getFullYear() + '-'
      + String(now.getMonth() + 1).padStart(2, '0') + '-'
      + String(now.getDate()).padStart(2, '0');
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const where = {
      ...branchWhere(scope),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              { city: { contains: q, mode: 'insensitive' as const } },
              { area: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.findMany({ where, orderBy: { id: 'asc' } });
    if (!rows.length) return rows;

    /*
     * What each customer is worth, in three numbers.
     *
     * The list used to be a directory: a name and an address. To decide who
     * to ring first you need to know who is live, who is worth something and
     * who has history — so the row carries a live-contract count, everything
     * ever billed, and how many services have been done.
     *
     * Three grouped queries rather than one per customer: a hundred rows
     * would otherwise be three hundred round trips to build one screen.
     */
    const ids = rows.map((r) => r.id);
    const [contracts, jobs, invoices] = await Promise.all([
      /* A contract has no status column — it is live while its end date has
         not passed, which is how every other screen decides it too. */
      this.prisma.contract.groupBy({
        by: ['clientId'],
        where: { clientId: { in: ids }, end: { gte: today } },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['clientId'],
        where: { clientId: { in: ids }, status: 'completed' },
        _count: true,
      }),
      this.prisma.invoice.findMany({
        where: { clientId: { in: ids }, status: { not: 'draft' } },
        select: { clientId: true, items: true },
      }),
    ]);

    const liveOf = new Map(contracts.map((c) => [c.clientId, c._count]));
    const doneOf = new Map(jobs.map((j) => [j.clientId, j._count]));
    const billedOf = new Map<string, number>();
    for (const inv of invoices) {
      const lines = (inv.items || []) as Array<{ qty?: number; rate?: number }>;
      const sum = lines.reduce((a, l) => a + (l.qty || 1) * (l.rate || 0), 0);
      billedOf.set(inv.clientId, (billedOf.get(inv.clientId) || 0) + sum);
    }

    return rows.map((r) => ({
      ...r,
      contracts: liveOf.get(r.id) || 0,
      services: doneOf.get(r.id) || 0,
      billed: Math.round(billedOf.get(r.id) || 0),
    }));
  }

  @Get(':id')
  async one(@Param('id') id: string, @Req() req: AuthedReq) {
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('No such customer');
    if (!inScope(await branchScope(this.prisma, req.user), c.branch)) {
      throw new NotFoundException('No such customer');
    }
    const [contracts, jobs, invoices] = await Promise.all([
      this.prisma.contract.findMany({ where: { clientId: id }, include: { plan: true } }),
      this.prisma.job.findMany({ where: { clientId: id }, orderBy: { date: 'desc' }, take: 50 }),
      this.prisma.invoice.findMany({
        where: { clientId: id, status: { not: 'cancelled' } }, include: { payments: true },
      }),
    ]);
    return { ...c, contracts, jobs, invoices };
  }

  @Post()
  @Roles('admin', 'ops', 'sales')
  async create(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'client' },
      create: { key: 'client', value: 1 },
      update: { value: { increment: 1 } },
    });
    const data = pick(body);
    // Every customer belongs somewhere: picked branch, area match, or the
    // creator's own branch.
    if (!data.branch) {
      const branches = await this.prisma.branch.findMany({ select: { id: true, areas: true } });
      const me = req.user?.sub
        ? await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { branches: true } })
        : null;
      data.branch = inferBranch(String(data.area || ''), branches) || me?.branches?.[0] || '';
    }
    return this.prisma.client.create({
      data: {
        id: 'CL-' + String(seq.value).padStart(3, '0'),
        since: new Date().toISOString().slice(0, 10),
        name: String(body.name || 'Unnamed'),
        ...data,
      } as never,
    });
  }

  @Patch(':id')
  @Roles('admin', 'ops', 'sales')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.client.update({ where: { id }, data: pick(body) });
  }

  /**
   * Remove a customer — but only one with nothing hanging off them.
   *
   * A customer is the anchor for contracts, visits and money. Deleting one
   * that still has any of those does not tidy anything up; it orphans an
   * invoice somebody is owed and a visit somebody is expecting, and the
   * money reports go quietly wrong. So this refuses and says what is in the
   * way, which is a thing the person can act on.
   *
   * Admins only. Anyone else can edit a customer, not erase one.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @Req() req: AuthedReq) {
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c || !inScope(await branchScope(this.prisma, req.user), c.branch)) {
      throw new NotFoundException('No such customer');
    }

    const [contracts, jobs, invoices, quotes] = await Promise.all([
      this.prisma.contract.count({ where: { clientId: id } }),
      this.prisma.job.count({ where: { clientId: id } }),
      this.prisma.invoice.count({ where: { clientId: id } }),
      this.prisma.quotation.count({ where: { clientId: id } }),
    ]);
    const blocking = [
      contracts && contracts + ' contract' + (contracts > 1 ? 's' : ''),
      invoices && invoices + ' invoice' + (invoices > 1 ? 's' : ''),
      jobs && jobs + ' service' + (jobs > 1 ? 's' : ''),
      quotes && quotes + ' quotation' + (quotes > 1 ? 's' : ''),
    ].filter(Boolean) as string[];

    if (blocking.length) {
      throw new BadRequestException(
        c.name + ' still has ' + blocking.join(', ')
        + '. Delete or move those first — removing the customer now would leave them orphaned.',
      );
    }

    await this.prisma.client.delete({ where: { id } });
    return { ok: true, id };
  }
}
