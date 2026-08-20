/* ============================================================================
   Purchase orders — the only door stock comes in through.

   Nothing else may add to a shelf. That is the rule the whole module exists to
   enforce, and it is what turns the inventory from a number someone typed into
   a figure with a vendor, a date, a rate and a document number behind it.

   Three states worth understanding:

     draft     editable, affects nothing
     ordered   sent to the vendor, lines frozen. Any *new* product on the order
               is created in inventory now, at zero stock, so "what have we got
               coming" is answerable before the van arrives
     received  the goods are on a branch's shelf — and only receiving moves stock

   Stock is per branch. An order fills the branch it ships to, and the company
   total on the item is kept in step inside the same transaction.

   **No money.** A purchase order here says what we want and how much of it —
   the price is whatever the vendor invoices later, and inventing a figure at
   ordering time would only be a number nobody checked. Every line is a product
   from the chemical master, a pack, and a count.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';

interface AuthedRequest { user: { sub: string; role: string } }

interface LineInput {
  itemId?: string;
  packUnit?: string; packSize?: number; qty?: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};
const nowStamp = () => {
  const d = new Date();
  return todayISO() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

/**
 * The only units stock is ever counted in. Always the smallest unit an item is
 * issued in — litres and kilograms are pack sizes, not bases, because stock is
 * a whole number and half a litre of a litre-based item has nowhere to go.
 */
const BASE_UNITS = ['g', 'mg', 'ml', 'piece'];

@Controller('purchase-orders')
@UseGuards(AuthGuard)
export class PurchaseOrdersController {
  constructor(private prisma: PrismaService) {}

  /* ------------------------------------------------------------- helpers */

  private async nextPoId() {
    const year = new Date().getFullYear();
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { id: { startsWith: `PO-${year}-` } }, select: { id: true },
    });
    const n = rows.reduce((a, r) => Math.max(a, Number(String(r.id).split('-')[2]) || 0), 0);
    return `PO-${year}-${String(n + 1).padStart(2, '0')}`;
  }

  /**
   * Clean one line off the wire.
   *
   * The product has to be one from the chemical master — its name, category and
   * base unit are copied onto the line so the printed order still reads right
   * years later, even if the master record is renamed. What the line adds is
   * only how it is being bought: a pack, its size, and how many.
   */
  private async line(l: LineInput, order: number) {
    const itemId = String(l.itemId || '');
    if (!itemId) throw new BadRequestException('Every line needs a product from the chemical list');
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('That product is not in the chemical list');

    const packSize = Math.max(1, Math.round(Number(l.packSize) || 1));
    const qty = Math.max(1, Math.round(Number(l.qty) || 1));
    return {
      itemId,
      name: item.name,
      cat: item.cat,
      baseUnit: item.unit,
      packUnit: String(l.packUnit || '').trim() || item.unit,
      packSize, qty,
      rate: 0,
      order,
    };
  }

  private lines(input: unknown) {
    const arr = (Array.isArray(input) ? input : []) as LineInput[];
    return Promise.all(arr.map((l, i) => this.line(l, i)));
  }

  private mustBeDraft(status: string) {
    if (status !== 'draft') {
      throw new BadRequestException(
        'This order has already gone to the vendor. Cancel it and raise a new one if it has to change.',
      );
    }
  }

  /* ---------------------------------------------------------------- read */

  @Get()
  @Roles('admin', 'ops', 'accounts')
  async list(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('status') status?: string,
    @Query('vendorId') vendorId?: string,
    @Query('q') q?: string,
    @Query('branch') branch?: string,
  ) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [orders, vendors] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { ...(vendorId ? { vendorId } : {}), ...branchWhere(scope) },
        include: { items: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.vendor.findMany({ select: { id: true, name: true } }),
    ]);
    const vName = new Map(vendors.map((v) => [v.id, v.name]));
    const needle = (q || '').toLowerCase();

    const rows = orders
      .filter((o) => !status || status === 'all' || o.status === status)
      .filter((o) => !needle
        || (o.id + (vName.get(o.vendorId) || '') + o.items.map((i) => i.name).join(' ')).toLowerCase().includes(needle))
      .map((o) => ({
        id: o.id, vendorId: o.vendorId, vendorName: vName.get(o.vendorId) || o.vendorId,
        date: o.date, expected: o.expected, status: o.status, branch: o.branch,
        lines: o.items.length,
        packsOrdered: o.items.reduce((a, i) => a + i.qty, 0),
        packsReceived: o.items.reduce((a, i) => a + i.receivedQty, 0),
        // What the order is actually worth to a store: base units, not rupees.
        baseOrdered: o.items.reduce((a, i) => a + i.qty * i.packSize, 0),
      }));

    const count = (s: string) => orders.filter((o) => o.status === s).length;
    return {
      rows,
      counts: {
        all: orders.length, draft: count('draft'), ordered: count('ordered'),
        partial: count('partial'), received: count('received'), cancelled: count('cancelled'),
      },
    };
  }

  @Get(':id')
  @Roles('admin', 'ops', 'accounts')
  async one(@Param('id') id: string, @Req() req?: { user?: { sub?: string; role?: string } }) {
    const o = await this.prisma.purchaseOrder.findUnique({
      where: { id }, include: { items: { orderBy: { order: 'asc' } }, vendor: true },
    });
    if (!o) throw new NotFoundException('No such purchase order');
    if (req && !inScope(await branchScope(this.prisma, req.user), o.branch)) {
      throw new NotFoundException('No such purchase order');
    }
    return o;
  }

  /* --------------------------------------------------------------- write */

  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>, @Req() req: AuthedRequest) {
    const vendorId = String(body.vendorId || '');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new BadRequestException('Pick a vendor to order from');

    return this.prisma.purchaseOrder.create({
      data: {
        id: await this.nextPoId(),
        vendorId,
        date: String(body.date || todayISO()),
        expected: String(body.expected || ''),
        branch: String(body.branch || ''),
        notes: String(body.notes || ''),
        terms: Array.isArray(body.terms) ? (body.terms as string[]).map(String) : [],
        raisedBy: req.user?.sub || '',
        items: { create: await this.lines(body.items) },
      },
      include: { items: true },
    });
  }

  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('No such purchase order');
    this.mustBeDraft(o.status);

    const data: Record<string, unknown> = {};
    if (body.vendorId !== undefined) data.vendorId = String(body.vendorId);
    if (body.date !== undefined) data.date = String(body.date);
    if (body.expected !== undefined) data.expected = String(body.expected);
    if (body.branch !== undefined) data.branch = String(body.branch);
    if (body.notes !== undefined) data.notes = String(body.notes);
    if (body.terms !== undefined) data.terms = Array.isArray(body.terms) ? (body.terms as string[]).map(String) : [];

    if (Array.isArray(body.items)) {
      const lines = await this.lines(body.items);
      await this.prisma.poItem.deleteMany({ where: { poId: id } });
      data.items = { create: lines };
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data: data as never, include: { items: true } });
  }

  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('No such purchase order');
    if (o.status !== 'draft') {
      throw new BadRequestException('Only a draft can be deleted. Cancel this one instead.');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Send it to the vendor.
   *
   * Every line that introduces a product we have never bought creates the
   * inventory item here, at zero stock — so ordering the same new product on two
   * drafts cannot create it twice, and the item list can show what is coming.
   */
  @Post(':id/place')
  @Roles('admin', 'ops')
  async place(@Param('id') id: string) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!o) throw new NotFoundException('No such purchase order');
    this.mustBeDraft(o.status);
    if (!o.items.length) throw new BadRequestException('Add at least one line before ordering');
    if (!o.branch) throw new BadRequestException('Choose the branch this order ships to');

    // Every product came from the chemical master, so there is nothing to
    // create here — placing an order is now purely a change of state.
    if (o.items.some((l) => !l.itemId)) {
      throw new BadRequestException('Every line needs a product from the chemical list');
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'ordered', orderedAt: nowStamp() },
      include: { items: true },
    });
  }

  @Post(':id/cancel')
  @Roles('admin', 'ops')
  async cancel(@Param('id') id: string) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!o) throw new NotFoundException('No such purchase order');
    if (o.status === 'received') throw new BadRequestException('This order has already been received');
    if (o.status === 'cancelled') return o;
    if (o.items.some((l) => l.receivedQty > 0)) {
      throw new BadRequestException(
        'Part of this order is already on the shelf. Receive the rest or close it short instead.',
      );
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'cancelled' } });
  }

  /**
   * The goods turned up.
   *
   * Body: `{ lines: [{ id, received }] }` — packs, per line. Omit it and every
   * outstanding pack is taken as received, which is the common case.
   *
   * One transaction moves four things: the branch's shelf, the company total on
   * the item, the ledger row, and the line's received count. Either all of it
   * happens or none of it does — a half-written receipt is how an inventory
   * stops being trustworthy.
   */
  @Post(':id/receive')
  @Roles('admin', 'ops')
  async receive(
    @Param('id') id: string,
    @Body() body: { lines?: Array<{ id: number; received: number }> },
    @Req() req: AuthedRequest,
  ) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!o) throw new NotFoundException('No such purchase order');
    if (o.status === 'draft') throw new BadRequestException('Send this order to the vendor before receiving it');
    if (o.status === 'cancelled') throw new BadRequestException('This order was cancelled');
    if (o.status === 'received') throw new BadRequestException('This order is already fully received');
    if (!o.branch) throw new BadRequestException('This order has no branch to receive into');

    const asked = new Map((body.lines || []).map((l) => [Number(l.id), Math.round(Number(l.received) || 0)]));
    const work: Array<{ line: (typeof o.items)[number]; packs: number }> = [];

    for (const l of o.items) {
      const outstanding = l.qty - l.receivedQty;
      const packs = asked.size ? Math.max(0, asked.get(l.id) ?? 0) : outstanding;
      if (packs === 0) continue;
      if (packs > outstanding) {
        throw new BadRequestException(
          `${l.name || l.itemId}: ${packs} ${l.packUnit} received but only ${outstanding} outstanding. ` +
          'Amend the order if the vendor sent more.',
        );
      }
      if (!l.itemId) throw new BadRequestException(`${l.name} has no inventory item — re-place the order`);
      work.push({ line: l, packs });
    }
    if (!work.length) throw new BadRequestException('Nothing to receive — enter what turned up');

    const date = todayISO();
    await this.prisma.$transaction(async (tx) => {
      for (const { line, packs } of work) {
        const base = packs * line.packSize; // packs → the item's own unit

        await tx.branchStock.upsert({
          where: { branchId_itemId: { branchId: o.branch, itemId: line.itemId } },
          create: { branchId: o.branch, itemId: line.itemId, qty: base },
          update: { qty: { increment: base } },
        });
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: {
            stock: { increment: base },
            // Remember how it actually arrived, so the next order fills itself in.
            lastPackUnit: line.packUnit,
            lastPackSize: line.packSize,
          },
        });
        await tx.stockMove.create({
          data: {
            itemId: line.itemId, branchId: o.branch, date, qty: base, dir: 'in', poId: o.id,
            note: `${packs} ${line.packUnit} received on ${o.id}`,
          },
        });
        await tx.poItem.update({
          where: { id: line.id }, data: { receivedQty: { increment: packs } },
        });
      }

      const fresh = await tx.poItem.findMany({ where: { poId: o.id } });
      const full = fresh.every((l) => l.receivedQty >= l.qty);
      await tx.purchaseOrder.update({
        where: { id: o.id },
        data: {
          status: full ? 'received' : 'partial',
          receivedBy: req.user?.sub || '',
          receivedAt: nowStamp(),
        },
      });
    });

    return this.one(id);
  }
}
