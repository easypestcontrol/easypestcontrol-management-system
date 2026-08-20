/* ============================================================================
   Chemicals in a technician's hands.

   The store is not a shared cupboard people help themselves from. Stock is
   *issued* to a named person, sits in their holding until it is used on a
   service or returned, and every movement is written down. That is what makes
   the question "who has our chemicals right now" answerable — and chemicals
   signed out and unaccounted for are money walking around.

   Consumption is deliberately permissive: a technician records what he
   actually used, even if it is more than he was issued, and the excess is
   flagged for the office. Blocking it would only teach him to under-report,
   which is worse than a holding that needs reconciling.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { canIssueStock, isFieldTech, isOffice } from 'shared';

interface AuthedRequest { user: { sub: string; role: string } }

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};
const nowStamp = () => {
  const d = new Date();
  return todayISO() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

@Controller('techstock')
@UseGuards(AuthGuard)
export class TechStockController {
  constructor(private prisma: PrismaService) {}

  /** Next issue id — ISS-1, ISS-2, … */
  private async nextIssueId() {
    const last = await this.prisma.stockIssue.findFirst({ orderBy: { at: 'desc' } });
    const n = last ? Number(String(last.id).replace('ISS-', '')) || 0 : 0;
    return 'ISS-' + (n + 1);
  }

  /**
   * What one person is carrying. A technician may only ask about themselves;
   * the office may ask about anyone.
   */
  @Get()
  async holding(@Query('userId') userId: string | undefined, @Req() req: AuthedRequest) {
    const me = req.user?.sub || '';
    const who = isOffice(req.user?.role) && userId ? userId : me;

    const rows = await this.prisma.techStock.findMany({ where: { userId: who } });
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: rows.map((r) => r.itemId) } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    return {
      userId: who,
      holding: rows
        .map((r) => ({
          itemId: r.itemId,
          name: byId.get(r.itemId)?.name || r.itemId,
          unit: byId.get(r.itemId)?.unit || '',
          qty: r.qty,
          // Negative means he recorded using more than he was ever issued.
          short: r.qty < 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Everyone's holding at a glance — chemicals out in the field. */
  @Get('all')
  @Roles('admin', 'ops', 'senior_tech')
  async everyone() {
    const rows = await this.prisma.techStock.findMany({ where: { NOT: { qty: 0 } } });
    const [users, items] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } } }),
      this.prisma.inventoryItem.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.itemId))] } } }),
    ]);
    const uById = new Map(users.map((u) => [u.id, u]));
    const iById = new Map(items.map((i) => [i.id, i]));

    const byUser = new Map<string, Array<{ itemId: string; name: string; unit: string; qty: number }>>();
    rows.forEach((r) => {
      const list = byUser.get(r.userId) || [];
      list.push({
        itemId: r.itemId,
        name: iById.get(r.itemId)?.name || r.itemId,
        unit: iById.get(r.itemId)?.unit || '',
        qty: r.qty,
      });
      byUser.set(r.userId, list);
    });

    return [...byUser.entries()]
      .map(([userId, holding]) => ({
        userId,
        name: uById.get(userId)?.name || userId,
        color: uById.get(userId)?.color || '#888',
        holding: holding.sort((a, b) => a.name.localeCompare(b.name)),
        shortages: holding.filter((h) => h.qty < 0).length,
      }))
      .sort((a, b) => b.shortages - a.shortages || a.name.localeCompare(b.name));
  }

  /** The trail — every issue, return and consumption. */
  @Get('issues')
  async issues(@Query('userId') userId: string | undefined, @Req() req: AuthedRequest) {
    const who = isOffice(req.user?.role) && userId ? userId : (userId || req.user?.sub || '');
    const rows = await this.prisma.stockIssue.findMany({
      where: { userId: who }, orderBy: { at: 'desc' }, take: 100,
    });
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.itemId))] } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    return rows.map((r) => ({
      ...r,
      name: byId.get(r.itemId)?.name || r.itemId,
      unit: byId.get(r.itemId)?.unit || '',
    }));
  }

  /**
   * Release stock from a branch's shelf into someone's hands, or take it back.
   * `dir: 'out'` issues, `dir: 'in'` returns. Both move the shelf the other way,
   * so the two figures always add up.
   *
   * Stock is per branch, so this draws from the technician's own branch unless
   * one is named. A company total big enough to cover him means nothing if the
   * chemicals are at the other end of the state.
   */
  @Post('issue')
  @Roles('admin', 'ops', 'senior_tech')
  async issue(
    @Body() body: {
      userId?: string; itemId?: string; qty?: number; dir?: string;
      note?: string; branchId?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    if (!canIssueStock(req.user?.role)) {
      throw new BadRequestException('You cannot issue stock');
    }
    const userId = String(body.userId || '');
    const itemId = String(body.itemId || '');
    const qty = Math.round(Number(body.qty) || 0);
    const dir = body.dir === 'in' ? 'in' : 'out';
    if (!userId) throw new BadRequestException('Who is taking it?');
    if (qty <= 0) throw new BadRequestException('Enter a quantity');

    const [tech, item] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.inventoryItem.findUnique({ where: { id: itemId } }),
    ]);
    if (!tech || !isFieldTech(tech.role)) throw new BadRequestException('Not a technician');
    if (!item) throw new NotFoundException('No such inventory item');

    const branchId = String(body.branchId || tech.branches[0] || '');
    if (!branchId) {
      throw new BadRequestException(`${tech.name} is not attached to a branch — set one on their profile`);
    }

    const shelf = await this.prisma.branchStock.findUnique({
      where: { branchId_itemId: { branchId, itemId } },
    });
    const onShelf = shelf?.qty || 0;
    if (dir === 'out' && onShelf < qty) {
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
      const elsewhere = item.stock - onShelf;
      throw new BadRequestException(
        `Only ${onShelf} ${item.unit} of ${item.name} at ${branch?.name || branchId}`
        + (elsewhere > 0
          ? ` — the other ${elsewhere} ${item.unit} is at another branch. Transfer it first.`
          : '. Raise a purchase order.'),
      );
    }

    const delta = dir === 'out' ? qty : -qty;
    const [holding] = await this.prisma.$transaction([
      this.prisma.techStock.upsert({
        where: { userId_itemId: { userId, itemId } },
        create: { userId, itemId, qty: delta },
        update: { qty: { increment: delta } },
      }),
      // The branch shelf and the company total move together, always.
      this.prisma.branchStock.upsert({
        where: { branchId_itemId: { branchId, itemId } },
        create: { branchId, itemId, qty: -delta },
        update: { qty: { increment: -delta } },
      }),
      this.prisma.inventoryItem.update({
        where: { id: itemId }, data: { stock: { increment: -delta } },
      }),
      this.prisma.stockMove.create({
        data: {
          itemId, branchId, date: todayISO(), qty, dir: dir === 'out' ? 'out' : 'in',
          note: (dir === 'out' ? 'Issued to ' : 'Returned by ') + tech.name,
        },
      }),
      this.prisma.stockIssue.create({
        data: {
          id: await this.nextIssueId(),
          userId, issuedBy: req.user?.sub || '', itemId, qty, dir,
          note: String(body.note || ''),
        },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          at: nowStamp(),
          text: dir === 'out'
            ? `${qty} ${item.unit} of ${item.name} issued to you.`
            : `${qty} ${item.unit} of ${item.name} returned to the store.`,
        },
      }),
    ]);

    return { holding: holding.qty, item: item.name, unit: item.unit, dir, branchId };
  }

  /**
   * Consume from a technician's holding against a service. Called when a visit
   * is finished, once, for everything recorded on it.
   */
  async consume(userId: string, itemId: string, qty: number, jobId: string) {
    if (qty <= 0) return null;
    const [holding] = await this.prisma.$transaction([
      this.prisma.techStock.upsert({
        where: { userId_itemId: { userId, itemId } },
        create: { userId, itemId, qty: -qty },
        update: { qty: { decrement: qty } },
      }),
      this.prisma.stockIssue.create({
        data: {
          id: await this.nextIssueId(),
          userId, issuedBy: userId, itemId, qty, dir: 'out', jobId,
          note: 'Used on ' + jobId,
        },
      }),
    ]);
    return holding;
  }
}
