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
    return this.prisma.client.findMany({ where, orderBy: { id: 'asc' } });
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
