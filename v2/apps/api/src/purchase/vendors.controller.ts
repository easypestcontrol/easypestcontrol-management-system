/* ============================================================================
   Vendors — who we buy from.

   Small on purpose. A vendor is a name, a way to reach them, and the tax details
   needed to print an order they will accept. Everything interesting about a
   vendor is really about the orders placed against them, so this controller also
   answers "what have we bought from this one, and what is still coming".

   Deleting a vendor with orders against them is refused. The orders are the
   record of money spent; a vendor who is no longer used is deactivated, not
   erased, and the history stays readable.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

const FIELDS = [
  'name', 'gstin', 'contact', 'phone', 'email', 'addr', 'city', 'state',
  'pincode', 'terms', 'cat', 'note', 'active',
] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    out[f] = f === 'active' ? !!body[f] : String(body[f] ?? '').trim();
  }
  return out;
}

@Controller('vendors')
@UseGuards(AuthGuard)
export class VendorsController {
  constructor(private prisma: PrismaService) {}

  private async nextId() {
    const rows = await this.prisma.vendor.findMany({ select: { id: true } });
    const n = rows.reduce((a, r) => Math.max(a, Number(String(r.id).replace('VN-', '')) || 0), 0);
    return 'VN-' + String(n + 1).padStart(2, '0');
  }

  /**
   * The list, each with what has been received and what is still on its way.
   * Counted in packs rather than rupees — a purchase order carries no prices,
   * so "how much have we had from them" is a question about goods.
   */
  @Get()
  @Roles('admin', 'ops', 'accounts')
  async list(@Query('q') q?: string) {
    const [vendors, orders] = await Promise.all([
      this.prisma.vendor.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.purchaseOrder.findMany({
        where: { status: { not: 'cancelled' } },
        include: { items: true },
      }),
    ]);

    const stat = new Map<string, { received: number; open: number; orders: number }>();
    for (const o of orders) {
      const s = stat.get(o.vendorId) || { received: 0, open: 0, orders: 0 };
      s.orders += 1;
      s.received += o.items.reduce((a, i) => a + i.receivedQty, 0);
      if (o.status !== 'draft') {
        s.open += o.items.reduce((a, i) => a + (i.qty - i.receivedQty), 0);
      }
      stat.set(o.vendorId, s);
    }

    const needle = (q || '').toLowerCase();
    return vendors
      .filter((v) => !needle
        || (v.name + v.city + v.gstin + v.contact + v.phone).toLowerCase().includes(needle))
      .map((v) => ({ ...v, ...(stat.get(v.id) || { received: 0, open: 0, orders: 0 }) }));
  }

  /** One vendor, with every order ever placed against them. */
  @Get(':id')
  @Roles('admin', 'ops', 'accounts')
  async one(@Param('id') id: string) {
    const v = await this.prisma.vendor.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('No such vendor');
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { vendorId: id }, include: { items: true }, orderBy: { date: 'desc' },
    });
    return {
      ...v,
      orders: orders.map((o) => ({
        id: o.id, date: o.date, expected: o.expected, status: o.status,
        branch: o.branch, lines: o.items.length,
        packs: o.items.reduce((a, i) => a + i.qty, 0),
      })),
    };
  }

  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>) {
    const data = pick(body);
    if (!data.name) throw new BadRequestException('A vendor needs a name');
    return this.prisma.vendor.create({ data: { id: await this.nextId(), ...data } as never });
  }

  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data = pick(body);
    if (data.name === '') throw new BadRequestException('A vendor needs a name');
    return this.prisma.vendor.update({ where: { id }, data: data as never });
  }

  /**
   * Only ever removes a vendor nothing was bought from. Anyone else is
   * deactivated — the orders against them are the record of money spent.
   */
  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const used = await this.prisma.purchaseOrder.count({ where: { vendorId: id } });
    if (used) {
      throw new BadRequestException(
        `${used} purchase order(s) reference this vendor. Deactivate them instead so the history stays readable.`,
      );
    }
    await this.prisma.vendor.delete({ where: { id } });
    return { ok: true };
  }
}
