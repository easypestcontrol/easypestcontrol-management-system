import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param,
  Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { toISO } from 'shared';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope } from '../branch.util';

/*
 * Inventory — chemicals, equipment and consumables, plus the stock ledger.
 *
 * v1 parity (inventory.js):
 *   - low stock  = stock < reorder level            (inventory.js:12-17)
 *   - purchases  add stock and carry a PO reference (inventory.js:26-66)
 *   - issues     subtract stock, may never exceed what is on hand
 *   - every change writes a StockMove row — the ledger is the audit trail
 * v1 minted 'SM-'+random ids (collision-prone); here the ledger is a real
 * autoincrement table. Item ids keep the INnn shape via the Seq counter.
 */

const CATS = ['Chemical', 'Equipment', 'Consumable'] as const;

/**
 * The chemical master. `unit` is the base unit and only editable while the item
 * has never moved — changing it under existing stock would silently reinterpret
 * every number on every shelf.
 *
 * `lastPackUnit` / `lastPackSize` are how it is usually bought. They start as
 * the default set in master data and are then kept up to date by whatever the
 * last purchase order actually said.
 */
const EDITABLE = [
  'name', 'cat', 'unit', 'reorder', 'note', 'lastPackUnit', 'lastPackSize',
] as const;

const BASE_UNITS = ['g', 'mg', 'ml', 'piece'] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  if ('reorder' in data) data.reorder = Math.max(0, Math.round(Number(data.reorder) || 0));
  if ('lastPackSize' in data) data.lastPackSize = Math.max(1, Math.round(Number(data.lastPackSize) || 1));
  if ('lastPackUnit' in data) data.lastPackUnit = String(data.lastPackUnit || '').trim();
  if ('cat' in data && CATS.indexOf(String(data.cat) as never) < 0) delete data.cat;
  if ('unit' in data && BASE_UNITS.indexOf(String(data.unit) as never) < 0) delete data.unit;
  if ('name' in data) data.name = String(data.name || '').trim();
  return data;
}

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('cat') cat?: string,
    @Query('q') q?: string,
    @Query('branchId') branchId?: string,
  ) {
    const where = {
      ...(cat ? { cat } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { note: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, shelves, open] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where, orderBy: { id: 'asc' } }),
      this.prisma.branchStock.findMany(),
      // Placed but not yet fully received: what is coming, and to which branch.
      this.prisma.purchaseOrder.findMany({
        where: { status: { in: ['ordered', 'partial'] } },
        include: { items: true },
      }),
    ]);

    const byItem = new Map<string, Array<{ branchId: string; qty: number; reorder: number }>>();
    for (const b of shelves) {
      const list = byItem.get(b.itemId) || [];
      list.push({ branchId: b.branchId, qty: b.qty, reorder: b.reorder });
      byItem.set(b.itemId, list);
    }

    const onOrder = new Map<string, number>();
    for (const o of open) {
      for (const l of o.items) {
        if (!l.itemId) continue;
        const outstanding = (l.qty - l.receivedQty) * l.packSize;
        if (outstanding > 0) onOrder.set(l.itemId, (onOrder.get(l.itemId) || 0) + outstanding);
      }
    }

    /*
     * The per-branch breakdown is behind the same wall as everything else: a
     * Madurai storekeeper counts Madurai's shelves. `stock` stays the company
     * total — it is what the reorder level is set against, and it reveals no
     * one branch's position.
     */
    const scope = await branchScope(this.prisma, req?.user);
    return items.map((i) => {
      const all = byItem.get(i.id) || [];
      const branches = scope === null ? all : all.filter((b) => scope.includes(b.branchId));
      const here = branchId ? (branches.find((b) => b.branchId === branchId)?.qty ?? 0) : null;
      return {
        ...i,
        branches,
        onOrder: onOrder.get(i.id) || 0,
        // When a branch is named, `stock` still means the company total and this
        // says what is actually reachable from there.
        branchStock: here,
      };
    });
  }

  /** The whole ledger, newest first — the "Stock movements" tab. */
  @Get('moves')
  moves() {
    return this.prisma.stockMove.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 300,
    });
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No such inventory item');

    const [moves, shelves, branches, orders] = await Promise.all([
      this.prisma.stockMove.findMany({
        where: { itemId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.branchStock.findMany({ where: { itemId: id } }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
      this.prisma.purchaseOrder.findMany({
        where: { items: { some: { itemId: id } } },
        include: { items: { where: { itemId: id } }, vendor: { select: { name: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);
    const bName = new Map(branches.map((b) => [b.id, b.name]));
    const vOf = new Map(orders.map((o) => [o.id, o.vendor.name]));

    return {
      ...item,
      // Every shelf, including the ones sitting at zero. "Coimbatore has none"
      // is an answer worth showing, not a row that quietly vanishes.
      shelves: branches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        qty: shelves.find((x) => x.branchId === b.id)?.qty || 0,
        reorder: shelves.find((x) => x.branchId === b.id)?.reorder || 0,
      })),
      onOrder: orders
        .filter((o) => o.status === 'ordered' || o.status === 'partial')
        .reduce((a, o) => a + o.items.reduce((sum, l) => sum + (l.qty - l.receivedQty) * l.packSize, 0), 0),
      purchases: orders.map((o) => ({
        id: o.id, date: o.date, status: o.status, vendor: o.vendor.name,
        packs: o.items.reduce((a, l) => a + l.qty, 0),
        received: o.items.reduce((a, l) => a + l.receivedQty, 0),
        packUnit: o.items[0]?.packUnit || '',
        rate: o.items[0]?.rate || 0,
      })),
      moves: moves.map((m) => ({
        ...m,
        branchName: bName.get(m.branchId) || '',
        vendor: m.poId ? vOf.get(m.poId) || '' : '',
      })),
    };
  }

  /**
   * Move stock from one branch shelf to another. The company total does not
   * change; two ledger rows record where it left and where it landed.
   *
   * Without this, chemicals delivered to the wrong branch can only be corrected
   * by lying to the system, which is how a stock figure stops being believed.
   */
  @Post(':id/transfer')
  @Roles('admin', 'ops')
  async transfer(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const from = String(body.from || '');
    const to = String(body.to || '');
    const qty = Math.round(Number(body.qty) || 0);
    if (!from || !to) throw new BadRequestException('Pick both branches');
    if (from === to) throw new BadRequestException('That is the same branch');
    if (qty <= 0) throw new BadRequestException('Enter a quantity');

    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No such inventory item');

    const [shelf, branches] = await Promise.all([
      this.prisma.branchStock.findUnique({ where: { branchId_itemId: { branchId: from, itemId: id } } }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);
    const bName = new Map(branches.map((b) => [b.id, b.name]));
    if ((shelf?.qty || 0) < qty) {
      throw new BadRequestException(
        'Only ' + (shelf?.qty || 0) + ' ' + item.unit + ' of ' + item.name
        + ' at ' + (bName.get(from) || from),
      );
    }

    const date = toISO(new Date());
    await this.prisma.$transaction([
      this.prisma.branchStock.update({
        where: { branchId_itemId: { branchId: from, itemId: id } },
        data: { qty: { decrement: qty } },
      }),
      this.prisma.branchStock.upsert({
        where: { branchId_itemId: { branchId: to, itemId: id } },
        create: { branchId: to, itemId: id, qty },
        update: { qty: { increment: qty } },
      }),
      this.prisma.stockMove.create({
        data: {
          itemId: id, branchId: from, date, qty, dir: 'out',
          note: 'Transferred to ' + (bName.get(to) || to),
        },
      }),
      this.prisma.stockMove.create({
        data: {
          itemId: id, branchId: to, date, qty, dir: 'in',
          note: 'Transferred from ' + (bName.get(from) || from),
        },
      }),
    ]);
    return this.one(id);
  }

  /**
   * Define a chemical. This is the master-data door: it creates the *product*,
   * never any stock. Stock arrives only by receiving a purchase order, which is
   * what gives every gram on a shelf a vendor and a document behind it.
   */
  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Item name is required');
    if (Number(body.stock) > 0) {
      throw new BadRequestException(
        'A product cannot start with stock. Raise a purchase order and receive it.',
      );
    }
    const clash = await this.prisma.inventoryItem.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) {
      throw new BadRequestException(
        `${clash.name} is already in the list. Order more of it instead of adding it twice.`,
      );
    }
    // v1 minted 'IN'+(length+30); the Seq row starts past the seeded IN01–IN25.
    const seq = await this.prisma.seq.upsert({
      where: { key: 'item' },
      create: { key: 'item', value: 30 },
      update: { value: { increment: 1 } },
    });
    return this.prisma.inventoryItem.create({
      data: {
        id: 'IN' + String(seq.value).padStart(2, '0'),
        name,
        cat: CATS.indexOf(String(body.cat) as never) >= 0 ? String(body.cat) : 'Chemical',
        unit: BASE_UNITS.indexOf(String(body.unit) as never) >= 0 ? String(body.unit) : 'ml',
        stock: 0,
        lastPackUnit: String(body.lastPackUnit || '').trim(),
        lastPackSize: Math.max(1, Math.round(Number(body.lastPackSize) || 1)),
        reorder: Math.max(0, Math.round(Number(body.reorder) || 0)),
        note: String(body.note || ''),
      },
    });
  }

  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data = pick(body);
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No such inventory item');

    // Changing the base unit under existing stock would silently reinterpret
    // every number recorded against it — 500 grams becoming 500 millilitres.
    if (data.unit && data.unit !== item.unit) {
      const moved = await this.prisma.stockMove.count({ where: { itemId: id } });
      if (moved || item.stock !== 0) {
        throw new BadRequestException(
          `${item.name} is already counted in ${item.unit}. Its unit cannot change once stock has moved.`,
        );
      }
    }
    // stock is deliberately NOT editable here — it only moves via the ledger
    return this.prisma.inventoryItem.update({ where: { id }, data });
  }

  /**
   * Remove a chemical from the master list. Only ever one nothing has happened
   * to: the moment it has stock, a movement or a purchase order behind it, it
   * is part of the record.
   */
  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No such inventory item');
    const [moved, ordered] = await Promise.all([
      this.prisma.stockMove.count({ where: { itemId: id } }),
      this.prisma.poItem.count({ where: { itemId: id } }),
    ]);
    if (item.stock !== 0 || moved || ordered) {
      throw new BadRequestException(
        `${item.name} has stock or history against it and cannot be removed.`,
      );
    }
    await this.prisma.branchStock.deleteMany({ where: { itemId: id } });
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Stock out only.
   *
   * Stock **in** used to be a number someone typed. It no longer is: the only
   * way onto a shelf is a received purchase order, which carries a vendor, a
   * rate and a document number. Closing this door in the API and not merely in
   * the UI is the point — a hidden button is not a rule.
   *
   * Stock is per branch, so an adjustment has to say which shelf it came off.
   */
  @Post(':id/move')
  @Roles('admin', 'ops')
  async move(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    if (body.kind === 'in') {
      throw new BadRequestException(
        'Stock only enters through a received purchase order. Raise one against the vendor instead.',
      );
    }
    const qty = Math.round(Number(body.qty) || 0);
    if (qty <= 0) throw new BadRequestException('Enter a quantity');

    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No such inventory item');

    const branchId = String(body.branchId || '');
    if (!branchId) throw new BadRequestException('Which branch is this coming off?');

    const shelf = await this.prisma.branchStock.findUnique({
      where: { branchId_itemId: { branchId, itemId: id } },
    });
    if ((shelf?.qty || 0) < qty) {
      throw new BadRequestException(
        `Only ${shelf?.qty || 0} ${item.unit} of ${item.name} on that branch's shelf`,
      );
    }

    const [updated, , move] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({ where: { id }, data: { stock: { decrement: qty } } }),
      this.prisma.branchStock.update({
        where: { branchId_itemId: { branchId, itemId: id } },
        data: { qty: { decrement: qty } },
      }),
      this.prisma.stockMove.create({
        data: {
          itemId: id,
          branchId,
          date: toISO(new Date()),
          qty,
          dir: 'out',
          note: String(body.note || ''),
          jobId: String(body.jobId || ''),
        },
      }),
    ]);
    return { item: updated, move };
  }
}
