import {
  Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards,
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
  'billing', 'shipping', 'contacts', 'docs', 'remarks',
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
}
