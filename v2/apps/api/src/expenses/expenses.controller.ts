/* ============================================================================
   Expenses — one date + one branch = one report.

   A report is a container an admin or a branch manager opens for a day; the
   whole branch's people drop their expenses into it. The lifecycle lives on
   each EXPENSE (pending → approved / rejected → processing → reimbursed /
   payment_failed), never on the folder. Reimbursement groups a report's
   approved expenses per employee and pays each through RazorpayX.

   The backend is the wall: an employee's expense takes its employee and
   branch from the logged-in account (never the request body), employees
   cannot open reports or touch anyone else's expense, a manager is held to
   their own branch, approved money cannot be edited and reimbursed money
   cannot be deleted, and a trip can never spawn two expenses.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Post, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';
import { open, seal } from '../secrets.util';
import { TripsService } from '../trips/trips.service';

interface AuthedReq { user?: { sub?: string; role?: string } }

const MAX_IMAGES = 4;
const MAX_IMAGE_B = 900 * 1024;

/** The categories the app shipped with. They seed the master-data table on
    first use; after that the table is the truth and this list is history. */
export const DEFAULT_CATEGORIES = [
  'Trip / Travel', 'Petrol / Fuel', 'Materials', 'Parking', 'Toll',
  'Vehicle Maintenance', 'Food', 'Tools / Equipment', 'Office', 'Miscellaneous',
];
/** Money that is still owed on an expense: approved and unpaid, part paid,
    or a payout that bounced and wants another go. */
const PAYABLE = ['approved', 'partial', 'payment_failed'];

interface Actors { approvedBy?: string; rejectedBy?: string; reviewedAt?: string; paidAt?: string; payments?: unknown }

interface Summary {
  count: number; employees: number; total: number;
  pending: number; approved: number; partial: number; reimbursed: number; rejected: number;
  paid: number; due: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const nowStamp = () => {
  const d = new Date();
  return `${todayISO()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (iso: string) => {
  const p = iso.split('-');
  return p.length === 3 ? `${Number(p[2])} ${MONTHS[Number(p[1]) - 1]} ${p[0]}` : iso;
};
const rupees = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-IN');

function cleanImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v || ''))
    .filter((v) => v.startsWith('data:image/') && v.length <= MAX_IMAGE_B * 1.4)
    .slice(0, MAX_IMAGES);
}

@Controller('expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(private prisma: PrismaService, private trips: TripsService) {}

  private manage(role?: string) { return role === 'admin' || role === 'ops'; }

  private async mint(key: string, prefix: string) {
    const seq = await this.prisma.seq.upsert({
      where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } },
    });
    return prefix + seq.value;
  }

  private async notify(userId: string, text: string) {
    if (!userId) return;
    await this.prisma.notification.create({ data: { userId, at: nowStamp(), text } }).catch(() => {});
  }

  /** Closed means closed: nothing is added, changed, approved or paid until
      the office reopens it. The same sentence everywhere it applies. */
  private async mustBeOpen(reportId: string) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (r?.status === 'closed') throw new BadRequestException('This report is closed - reopen it first');
  }

  /** A line into a report's audit diary. */
  private async hist(reportId: string, text: string) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id: reportId }, select: { history: true } });
    const h = Array.isArray(r?.history) ? (r!.history as Array<unknown>) : [];
    await this.prisma.expenseReport.update({
      where: { id: reportId }, data: { history: [...h, { at: nowStamp(), text }] as never },
    }).catch(() => {});
  }

  private async kmRate(): Promise<number> {
    const co = await this.prisma.company.findFirst({ select: { kmRate: true } });
    return co?.kmRate || 0;
  }

  private async branchName(id: string): Promise<string> {
    if (!id) return '—';
    const b = await this.prisma.branch.findUnique({ where: { id }, select: { name: true } });
    return b?.name || id;
  }

  /** The employee's own branch — an expense is always stamped from here. */
  private async myBranch(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { branches: true } });
    return u?.branches[0] || '';
  }

  private summarise(expenses: Array<{ userId: string; amount: number; status: string; paidAmount?: number }>): Summary {
    const by = (s: string) => expenses.filter((e) => e.status === s).reduce((a, e) => a + e.amount, 0);
    return {
      count: expenses.length,
      employees: new Set(expenses.map((e) => e.userId)).size,
      total: expenses.reduce((a, e) => a + e.amount, 0),
      pending: by('pending'),
      approved: by('approved'),
      partial: by('partial'),
      reimbursed: by('reimbursed'),
      rejected: by('rejected'),
      // Rupees actually paid out, and rupees still owed - the two numbers the
      // office wants at a glance, whatever the statuses underneath.
      paid: expenses.reduce((a, e) => a + (e.paidAmount || 0), 0),
      due: expenses.filter((e) => PAYABLE.includes(e.status)).reduce((a, e) => a + e.amount - (e.paidAmount || 0), 0),
    };
  }

  /** An expense the way a screen shows it: names on, receipt bytes off. */
  private shape<T extends { userId: string; images: unknown }>(e: T, uOf: Map<string, { name: string; color: string }>) {
    return {
      ...e,
      images: undefined, hasReceipt: Array.isArray(e.images) && e.images.length > 0,
      employeeName: uOf.get(e.userId)?.name || 'Former staff',
      employeeColor: uOf.get(e.userId)?.color || '#888',
      ...this.actors(e as unknown as Actors, uOf),
    };
  }

  /** Who approved, rejected and paid - by name, for the person who raised it
      and for the office. A payment's payer is whoever made the last one. */
  private actors(e: Actors, uOf: Map<string, { name: string }>) {
    const name = (id?: string) => (id ? uOf.get(id)?.name || 'The office' : '');
    const pays = Array.isArray(e.payments) ? (e.payments as Array<{ by?: string }>) : [];
    return {
      approvedByName: name(e.approvedBy),
      rejectedByName: name(e.rejectedBy),
      paidByName: pays.length ? name(pays[pays.length - 1].by) : '',
      // When: the review's own stamp, and the last payment's. Both are
      // "YYYY-MM-DD HH:MM", the office's clock, the way every diary line is.
      reviewedAt: e.reviewedAt || '',
      paidAt: pays.length ? String((pays[pays.length - 1] as { at?: string }).at || e.paidAt || '') : '',
    };
  }

  private async userMap() {
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, color: true } });
    return new Map(users.map((u) => [u.id, u]));
  }

  private async nameOf(id: string) {
    return (await this.prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name || 'The office';
  }

  /* ============================================================== CATEGORIES */

  private async seedCategories() {
    if (await this.prisma.expenseCategory.count()) return;
    let i = 0;
    for (const name of DEFAULT_CATEGORIES) {
      i += 1;
      await this.prisma.expenseCategory.create({ data: { id: 'EXC-' + i, name } }).catch(() => {});
    }
    await this.prisma.seq.upsert({
      where: { key: 'expense-category' },
      create: { key: 'expense-category', value: i }, update: { value: i },
    });
  }

  /**
   * The category as master data knows it - or, typed under "Others", as it
   * is from now on. Matching ignores case and spacing, so "petrol" is the
   * Petrol / Fuel that already exists and not a second one.
   */
  private async category(raw: unknown, by: string): Promise<string> {
    await this.seedCategories();
    const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) return 'Miscellaneous';
    const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const all = await this.prisma.expenseCategory.findMany();
    const hit = all.find((c) => key(c.name) === key(name));
    if (hit) return hit.name;
    const id = await this.mint('expense-category', 'EXC-');
    await this.prisma.expenseCategory.create({ data: { id, name, createdBy: by } });
    return name;
  }

  /** The list the form offers. Everyone sees it; only the office edits it. */
  @Get('categories')
  async listCategories() {
    await this.seedCategories();
    const rows = await this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
    return { rows: rows.map((c) => ({ id: c.id, name: c.name, active: c.active })) };
  }

  @Post('categories')
  @Roles('admin', 'ops')
  async addCategory(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const name = await this.category(body.name, req.user?.sub || '');
    const c = await this.prisma.expenseCategory.findUnique({ where: { name } });
    if (c && !c.active) await this.prisma.expenseCategory.update({ where: { name }, data: { active: true } });
    return { name };
  }

  /** Rename a category (its expenses follow) or take it off the form. */
  @Patch('categories/:id')
  @Roles('admin', 'ops')
  async editCategory(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const c = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('No such category');
    const data: Record<string, unknown> = {};
    if ('active' in body) data.active = !!body.active;
    if ('name' in body) {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name) throw new BadRequestException('Give it a name');
      const clash = await this.prisma.expenseCategory.findUnique({ where: { name } });
      if (clash && clash.id !== id) throw new BadRequestException('There is already a category called ' + name);
      if (name !== c.name) {
        await this.prisma.expense.updateMany({ where: { category: c.name }, data: { category: name } });
        data.name = name;
      }
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to change');
    await this.prisma.expenseCategory.update({ where: { id }, data });
    return { ok: true };
  }

  /* ================================================================= REPORTS */

  /** Open a report for a day + branch. Admin/manager only; never an employee. */
  @Post('reports')
  @Roles('admin', 'ops')
  async createReport(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const date = String(body.date || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Pick a valid date');
    const branch = String(body.branch || '').trim();
    if (!branch) throw new BadRequestException('Pick a branch');
    if (!inScope(await branchScope(this.prisma, req.user), branch)) {
      throw new ForbiddenException('That branch is outside your scope');
    }
    const dup = await this.prisma.expenseReport.findUnique({ where: { date_branch: { date, branch } } });
    if (dup) throw new BadRequestException('An expense report already exists for this date and branch.');

    const bn = await this.branchName(branch);
    const id = await this.mint('expense-report', 'EXR-');
    await this.prisma.expenseReport.create({
      data: {
        id, date, branch,
        title: String(body.title || '').trim() || `${niceDate(date)} — ${bn}`,
        description: String(body.description || '').trim(),
        createdBy: req.user?.sub || '',
        history: [{ at: nowStamp(), text: 'Report opened' }] as never,
      },
    });
    return { id };
  }

  /** Every report in the manager's scope, each with its live summary. */
  @Get('reports')
  @Roles('admin', 'ops')
  async listReports(@Req() req: AuthedReq, @Query('branch') branch?: string) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const reports = await this.prisma.expenseReport.findMany({
      where: branchWhere(scope) as never,
      orderBy: [{ date: 'desc' }, { branch: 'asc' }],
      include: { expenses: { select: { userId: true, amount: true, status: true, paidAmount: true } } },
      take: 200,
    });
    const branches = await this.prisma.branch.findMany({ select: { id: true, name: true } });
    const bn = new Map(branches.map((b) => [b.id, b.name]));
    return {
      rows: reports.map((r) => ({
        id: r.id, title: r.title, date: r.date, branch: r.branch,
        branchName: bn.get(r.branch) || r.branch, status: r.status,
        ...this.summarise(r.expenses),
      })),
    };
  }

  /** One report in full — the folder the manager reviews. Manager-in-scope only. */
  @Get('reports/:id')
  @Roles('admin', 'ops')
  async oneReport(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, include: { expenses: { orderBy: [{ userId: 'asc' }, { id: 'asc' }] } },
    });
    if (!r) throw new NotFoundException('No such report');
    if (!inScope(await branchScope(this.prisma, req.user), r.branch)) throw new NotFoundException('No such report');
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, color: true } });
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      id: r.id, title: r.title, date: r.date, branch: r.branch,
      branchName: await this.branchName(r.branch), status: r.status,
      description: r.description, createdBy: r.createdBy,
      history: r.history, rate: await this.kmRate(),
      summary: this.summarise(r.expenses),
      expenses: r.expenses.map((e) => this.shape(e, uOf)),
    };
  }

  /* ========================================================= THE CALENDAR */

  /**
   * A month, day by day: what each day cost and how much of it is paid, plus
   * the latest expenses - the office's first page. One number per day is
   * enough to see where the money is; the day itself is a tap away.
   */
  @Get('month')
  @Roles('admin', 'ops')
  async month(@Req() req: AuthedReq, @Query('ym') ym?: string, @Query('branch') branch?: string) {
    const m = /^\d{4}-\d{2}$/.test(String(ym || '')) ? String(ym) : todayISO().slice(0, 7);
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [reports, branches, users] = await Promise.all([
      this.prisma.expenseReport.findMany({
        where: { ...branchWhere(scope), date: { startsWith: m } } as never,
        include: { expenses: { select: { userId: true, amount: true, status: true, paidAmount: true } } },
        orderBy: [{ date: 'asc' }, { branch: 'asc' }],
      }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true, color: true } }),
    ]);
    const bn = new Map(branches.map((b) => [b.id, b.name]));
    const uOf = new Map(users.map((u) => [u.id, u]));
    type Day = Summary & {
      date: string; reports: Array<{ id: string; branch: string; branchName: string; status: string; total: number; pending: number; due: number; paid: number; count: number }>;
    };
    const days = new Map<string, Day>();
    const everything: Array<{ userId: string; amount: number; status: string; paidAmount?: number }> = [];
    for (const r of reports) {
      everything.push(...r.expenses);
      const s = this.summarise(r.expenses);
      const d = days.get(r.date) || { ...this.summarise([]), date: r.date, reports: [] };
      d.reports.push({ id: r.id, branch: r.branch, branchName: bn.get(r.branch) || r.branch, status: r.status, total: s.total, pending: s.pending, due: s.due, paid: s.paid, count: s.count });
      days.set(r.date, d);
    }
    // Each day's numbers are the sum over its branches, computed once from
    // the expenses themselves rather than by adding summaries.
    for (const d of days.values()) {
      const ex = reports.filter((r) => r.date === d.date).flatMap((r) => r.expenses);
      Object.assign(d, this.summarise(ex));
    }
    const recent = await this.prisma.expense.findMany({
      where: { ...branchWhere(scope), date: { startsWith: m } } as never,
      orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 12,
    });
    return {
      ym: m,
      totals: this.summarise(everything),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recent: recent.map((e) => ({
        id: e.id, date: e.date, category: e.category, merchant: e.merchant, amount: e.amount,
        paidAmount: e.paidAmount, status: e.status, source: e.source, branch: e.branch,
        branchName: bn.get(e.branch) || e.branch, reportId: e.reportId,
        employeeName: uOf.get(e.userId)?.name || 'Former staff', employeeColor: uOf.get(e.userId)?.color || '#888',
      })),
    };
  }

  /**
   * One day across every branch: each branch's report with its expenses,
   * so the office can approve the whole day, one branch, or one line.
   */
  @Get('day/:date')
  @Roles('admin', 'ops')
  async day(@Param('date') date: string, @Req() req: AuthedReq, @Query('branch') branch?: string) {
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Pick a valid date');
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [reports, branches, users, rate] = await Promise.all([
      this.prisma.expenseReport.findMany({
        where: { ...branchWhere(scope), date: d } as never,
        include: { expenses: { orderBy: [{ userId: 'asc' }, { id: 'asc' }] } },
        orderBy: { branch: 'asc' },
      }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true, color: true } }),
      this.kmRate(),
    ]);
    const bn = new Map(branches.map((b) => [b.id, b.name]));
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      date: d, rate,
      summary: this.summarise(reports.flatMap((r) => r.expenses)),
      reports: reports.map((r) => ({
        id: r.id, title: r.title, branch: r.branch, branchName: bn.get(r.branch) || r.branch, status: r.status,
        summary: this.summarise(r.expenses),
        expenses: r.expenses.map((e) => this.shape(e, uOf)),
      })),
    };
  }

  /**
   * Close every branch's report for a day in one go - or reopen them all.
   * The office settles a day once, not once per branch. Reopening pulls in
   * any trip that finished that day while the folders were shut, the same
   * as reopening one report does.
   */
  @Post('day/:date/close')
  @Roles('admin', 'ops')
  async closeDay(@Param('date') date: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Pick a valid date');
    const reopen = !!body.reopen;
    const scope = clampScope(await branchScope(this.prisma, req.user), undefined);
    const reports = await this.prisma.expenseReport.findMany({ where: { ...branchWhere(scope), date: d } as never });
    const who = await this.nameOf(req.user?.sub || '');
    let changed = 0, pulled = 0;
    for (const r of reports) {
      const want = reopen ? 'open' : 'closed';
      if (r.status === want) continue;
      await this.prisma.expenseReport.update({ where: { id: r.id }, data: { status: want } });
      await this.hist(r.id, (reopen ? 'Report reopened' : 'Report closed') + ' by ' + who + ' (whole day)');
      changed += 1;
      if (reopen) {
        const n = await this.trips.sweepIntoReport(r.date, r.branch).catch(() => 0);
        if (n) { pulled += n; await this.hist(r.id, `${n} trip expense(s) pulled in on reopening`); }
      }
    }
    return { reports: reports.length, changed, pulled, status: reopen ? 'open' : 'closed' };
  }

  /**
   * Approve every pending expense in a day, in one branch's report, or in a
   * list - the office verifying a whole day at once. A closed report is
   * skipped and said so: it has to be reopened first.
   */
  @Post('approve')
  @Roles('admin', 'ops')
  async approveMany(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const me = req.user?.sub || '';
    const reportId = String(body.reportId || '');
    const date = String(body.date || '').slice(0, 10);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
    if (!reportId && !date && !ids.length) throw new BadRequestException('Say what to approve');
    const scope = await branchScope(this.prisma, req.user);
    const targets = await this.prisma.expense.findMany({
      where: {
        status: 'pending',
        ...(reportId ? { reportId } : {}), ...(date ? { date } : {}), ...(ids.length ? { id: { in: ids } } : {}),
      },
      include: { report: { select: { status: true } } },
    });
    const ok = targets.filter((e) => inScope(scope, e.branch) && e.report.status !== 'closed');
    if (!ok.length) {
      throw new BadRequestException(targets.length
        ? 'That report is closed - reopen it to approve' : 'Nothing pending to approve');
    }
    const who = await this.nameOf(me);
    await this.prisma.expense.updateMany({
      where: { id: { in: ok.map((e) => e.id) } },
      data: { status: 'approved', approvedBy: me, rejectedBy: '', rejectReason: '', reviewedAt: nowStamp() },
    });
    const byReport = new Map<string, number>();
    const byUser = new Map<string, { n: number; sum: number }>();
    for (const e of ok) {
      byReport.set(e.reportId, (byReport.get(e.reportId) || 0) + 1);
      const u = byUser.get(e.userId) || { n: 0, sum: 0 };
      byUser.set(e.userId, { n: u.n + 1, sum: u.sum + e.amount });
    }
    for (const [rid, n] of byReport) await this.hist(rid, `${n} expense(s) approved together by ${who}`);
    for (const [uid, x] of byUser) {
      await this.notify(uid, x.n === 1
        ? `${who} approved your expense: ${rupees(x.sum)}.`
        : `${who} approved ${x.n} of your expenses: ${rupees(x.sum)}.`);
    }
    return { approved: ok.length, amount: ok.reduce((a, e) => a + e.amount, 0), skipped: targets.length - ok.length };
  }

  @Post('reports/:id/close')
  @Roles('admin', 'ops')
  async closeReport(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('No such report');
    if (!inScope(await branchScope(this.prisma, req.user), r.branch)) throw new NotFoundException('No such report');
    const reopening = r.status === 'closed';
    await this.prisma.expenseReport.update({ where: { id }, data: { status: reopening ? 'open' : 'closed' } });
    await this.hist(id, reopening ? 'Report reopened' : 'Report closed');
    // A trip that finished while the folder was shut had nowhere to go.
    // Reopening is the moment it gets in.
    const pulled = reopening ? await this.trips.sweepIntoReport(r.date, r.branch).catch(() => 0) : 0;
    if (pulled) await this.hist(id, `${pulled} trip expense(s) pulled in on reopening`);
    return { status: reopening ? 'open' : 'closed', pulled };
  }

  /** A report is deletable only while empty — money is never casually removed. */
  @Delete('reports/:id')
  @Roles('admin', 'ops')
  async removeReport(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id }, include: { expenses: { select: { id: true } } } });
    if (!r) throw new NotFoundException('No such report');
    if (!inScope(await branchScope(this.prisma, req.user), r.branch)) throw new NotFoundException('No such report');
    if (r.expenses.length) throw new BadRequestException('This report has expenses — close it instead of deleting.');
    await this.prisma.expenseReport.delete({ where: { id } });
    return { ok: true };
  }

  /* ================================================================ EXPENSES */

  /** Does my branch have an open report for this date? Guides the add form. */
  @Get('report-for')
  async reportFor(@Query('date') date?: string, @Req() req?: AuthedReq) {
    const d = String(date || '').slice(0, 10);
    const branch = await this.myBranch(req?.user?.sub || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !branch) return { found: false };
    const r = await this.prisma.expenseReport.findUnique({ where: { date_branch: { date: d, branch } } });
    return r ? { found: true, id: r.id, title: r.title, closed: r.status === 'closed' } : { found: false };
  }

  /** Add an expense. Employee + branch come from the token, not the body. */
  @Post()
  async addExpense(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const me = req.user?.sub || '';
    const date = String(body.date || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Pick a valid date');
    const branch = await this.myBranch(me);
    if (!branch) throw new BadRequestException('Your account has no branch — ask the office to set it');

    /*
     * The day's folder opens itself.
     *
     * This used to refuse the expense and tell the employee to go and find
     * their branch manager. A technician who paid for petrol at nine at night
     * is not going to do that — he is going to forget, and the company keeps
     * the money it owes him by accident. Opening the folder is bookkeeping,
     * not a decision, so the first expense of the day opens it and says who
     * it opened for.
     *
     * A CLOSED report still refuses: that one IS a decision, made by the
     * office when the day's money was settled.
     */
    let report = await this.prisma.expenseReport.findUnique({ where: { date_branch: { date, branch } } });
    if (!report) {
      const bn = await this.branchName(branch);
      report = await this.prisma.expenseReport.create({
        data: {
          id: await this.mint('expense-report', 'EXR-'),
          date, branch,
          title: `${niceDate(date)} — ${bn}`,
          createdBy: me,
          history: [{ at: nowStamp(), text: 'Report opened by the first expense of the day' }] as never,
        },
      });
    }
    if (report.status === 'closed') throw new BadRequestException('This report is closed.');

    const amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0) throw new BadRequestException('Enter the amount');
    const category = await this.category(body.category, me);

    const id = await this.mint('expense', 'EXP-');
    await this.prisma.expense.create({
      data: {
        id, reportId: report.id, userId: me, branch, date,
        category, source: 'manual', status: 'pending',
        merchant: String(body.merchant || '').trim(),
        note: String(body.note || '').trim(),
        amount, images: cleanImages(body.images) as never,
      },
    });
    const who = (await this.prisma.user.findUnique({ where: { id: me }, select: { name: true } }))?.name || me;
    await this.hist(report.id, `${who} added ${category} ${rupees(amount)} (${id})`);
    return { id, reportId: report.id };
  }

  /** My own expenses — the employee's history. Filterable. */
  @Get('mine')
  async mine(@Req() req: AuthedReq, @Query('status') status?: string, @Query('category') category?: string) {
    const me = req.user?.sub || '';
    const rows = await this.prisma.expense.findMany({
      where: {
        userId: me,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    const uOf = await this.userMap();
    return {
      rows: rows.map((e) => ({
        id: e.id, date: e.date, category: e.category, merchant: e.merchant, note: e.note,
        amount: e.amount, paidAmount: e.paidAmount, status: e.status, source: e.source, tripId: e.tripId,
        rejectReason: e.rejectReason, hasReceipt: Array.isArray(e.images) && e.images.length > 0,
        km: e.km, rate: e.rate,
        ...this.actors(e, uOf),
      })),
    };
  }

  /** Every expense in scope, for the admin's cross-report view. Filterable. */
  @Get('all')
  @Roles('admin', 'ops')
  async all(
    @Req() req: AuthedReq,
    @Query('branch') branch?: string, @Query('from') from?: string, @Query('to') to?: string,
    @Query('employee') employee?: string, @Query('category') category?: string,
    @Query('status') status?: string, @Query('source') source?: string,
  ) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const where: Record<string, unknown> = { ...branchWhere(scope) };
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (employee) where.userId = employee;
    if (category) where.category = category;
    if (status) where.status = status;
    if (source) where.source = source;
    const rows = await this.prisma.expense.findMany({
      where: where as never, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 500,
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, color: true } });
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      rows: rows.map((e) => ({
        id: e.id, date: e.date, category: e.category, amount: e.amount, paidAmount: e.paidAmount, status: e.status,
        source: e.source, branch: e.branch, reportId: e.reportId, tripId: e.tripId,
        employeeName: uOf.get(e.userId)?.name || 'Former staff',
        employeeColor: uOf.get(e.userId)?.color || '#888',
        hasReceipt: Array.isArray(e.images) && e.images.length > 0,
        ...this.actors(e, uOf),
      })),
    };
  }

  /** One expense in full — its owner, or a manager in its branch. */
  @Get(':id')
  async oneExpense(@Param('id') id: string, @Req() req: AuthedReq) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('No such expense');
    const me = req.user?.sub || '';
    const mine = e.userId === me;
    if (!mine) {
      if (!this.manage(req.user?.role) || !inScope(await branchScope(this.prisma, req.user), e.branch)) {
        throw new NotFoundException('No such expense');
      }
    }
    const [u, report] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: e.userId }, select: { name: true, color: true } }),
      this.prisma.expenseReport.findUnique({ where: { id: e.reportId }, select: { title: true, date: true } }),
    ]);
    return {
      ...e,
      employeeName: u?.name || 'Former staff', employeeColor: u?.color || '#888',
      ...this.actors(e, await this.userMap()),
      reportTitle: report?.title || '', branchName: await this.branchName(e.branch),
      images: (Array.isArray(e.images) ? e.images : []) as string[],
      canManage: this.manage(req.user?.role) && !mine,
      mine,
    };
  }

  /** Employee edits their own expense — only while it is still pending. */
  @Patch(':id')
  async editExpense(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('No such expense');
    if (e.userId !== (req.user?.sub || '')) throw new ForbiddenException('Not your expense');
    if (e.status !== 'pending') throw new BadRequestException('Only a pending expense can be changed');
    await this.mustBeOpen(e.reportId);
    const data: Record<string, unknown> = {};
    if ('amount' in body) { const a = Math.round(Number(body.amount) || 0); if (a <= 0) throw new BadRequestException('Enter the amount'); data.amount = a; }
    if ('category' in body) data.category = await this.category(body.category, e.userId);
    if ('merchant' in body) data.merchant = String(body.merchant || '').trim();
    if ('note' in body) data.note = String(body.note || '').trim();
    if ('images' in body) data.images = cleanImages(body.images) as never;
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to change');
    await this.prisma.expense.update({ where: { id }, data: data as never });
    return { ok: true };
  }

  /** Owner cancels their own pending expense. Nothing further can be deleted. */
  @Delete(':id')
  async removeExpense(@Param('id') id: string, @Req() req: AuthedReq) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('No such expense');
    if (e.userId !== (req.user?.sub || '')) throw new ForbiddenException('Not your expense');
    if (e.status !== 'pending') throw new BadRequestException('Only a pending expense can be withdrawn');
    if (e.source === 'auto_trip') throw new BadRequestException('A trip expense is withdrawn by rejecting the trip');
    await this.mustBeOpen(e.reportId);
    await this.prisma.expense.delete({ where: { id } });
    await this.hist(e.reportId, e.id + ' withdrawn by the employee');
    return { ok: true };
  }

  /** Approve or reject a single expense. Manager in the expense's branch. */
  @Post(':id/review')
  @Roles('admin', 'ops')
  async review(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('No such expense');
    if (!inScope(await branchScope(this.prisma, req.user), e.branch)) throw new NotFoundException('No such expense');
    if (e.status !== 'pending') throw new BadRequestException('This expense is not pending');
    await this.mustBeOpen(e.reportId);
    const approve = !!body.approve;
    const reason = String(body.reason || '').trim();
    if (!approve && !reason) throw new BadRequestException('Give a reason for rejecting');
    const me = req.user?.sub || '';
    const who = await this.nameOf(me);
    await this.prisma.expense.update({
      where: { id },
      data: approve
        ? { status: 'approved', approvedBy: me, rejectedBy: '', rejectReason: '', reviewedAt: nowStamp() }
        : { status: 'rejected', rejectedBy: me, rejectReason: reason, reviewedAt: nowStamp() },
    });
    await this.hist(e.reportId, `${e.id} ${approve ? 'approved' : 'rejected'} by ${who}${approve ? '' : ': ' + reason}`);
    // The employee hears WHO decided, not just what - the name is the point.
    await this.notify(e.userId, approve
      ? `${who} approved your expense: ${e.category} ${rupees(e.amount)}. (${e.id})`
      : `${who} rejected your expense: ${e.category} ${rupees(e.amount)} — ${reason}. (${e.id})`);
    return { ok: true };
  }

  /**
   * Pay what is owed - a whole day, one branch's report, a list, or one
   * expense, in part or in full. Grouped per employee so each person gets one
   * payout (RazorpayX to their bank, or marked paid by hand). What a person is
   * owed is amount minus what they have already had; a part payment on one
   * expense leaves it "partially reimbursed" until the rest arrives, and the
   * status is arithmetic, never a hand-set flag. A bounced payout lands on
   * payment_failed and is picked up by the next run; it never blocks others.
   */
  @Post('reimburse')
  @Roles('admin', 'ops')
  async reimburse(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const me = req.user?.sub || '';
    const mode = body.mode === 'razorpayx' ? 'razorpayx' : 'manual';
    const reportId = String(body.reportId || '');
    const date = String(body.date || '').slice(0, 10);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
    const part = body.amount != null && body.amount !== '' ? Math.round(Number(body.amount) || 0) : 0;
    if (!reportId && !date && !ids.length) throw new BadRequestException('Say what to pay');

    let targets = await this.prisma.expense.findMany({
      where: {
        status: { in: PAYABLE },
        ...(reportId ? { reportId } : {}), ...(date ? { date } : {}), ...(ids.length ? { id: { in: ids } } : {}),
      },
      include: { report: { select: { status: true } } },
    });
    const scope = await branchScope(this.prisma, req.user);
    targets = targets.filter((e) => inScope(scope, e.branch));
    if (!targets.length) throw new BadRequestException('Nothing approved and unpaid here');
    if (targets.some((e) => e.report.status === 'closed')) {
      throw new BadRequestException('That report is closed - reopen it to pay');
    }
    // A part payment is one expense at a time: "pay Rs 500 of this Rs 2,000".
    if (part) {
      if (targets.length !== 1) throw new BadRequestException('A part payment is for one expense at a time');
      const due = targets[0].amount - targets[0].paidAmount;
      if (part > due) throw new BadRequestException('That is more than the ' + rupees(due) + ' still owed');
    }

    const byUser = new Map<string, typeof targets>();
    for (const e of targets) {
      if (!byUser.has(e.userId)) byUser.set(e.userId, [] as never);
      byUser.get(e.userId)!.push(e);
    }

    const who = await this.nameOf(me);
    const results: Array<{ userId: string; amount: number; ok: boolean; payoutId?: string; error?: string }> = [];
    for (const [userId, list] of byUser) {
      const pays = list.map((e) => ({ e, pay: part || (e.amount - e.paidAmount) })).filter((x) => x.pay > 0);
      const sum = pays.reduce((a, x) => a + x.pay, 0);
      if (!sum) continue;
      const idList = pays.map((x) => x.e.id);
      await this.prisma.expense.updateMany({ where: { id: { in: idList } }, data: { status: 'processing' } });
      try {
        let payoutId = '';
        if (mode === 'razorpayx') payoutId = await this.razorpayxPayout(userId, sum, reportId || date || idList[0]);
        const at = nowStamp();
        for (const { e, pay } of pays) {
          const paidAmount = e.paidAmount + pay;
          const history = Array.isArray(e.payments) ? (e.payments as unknown[]) : [];
          await this.prisma.expense.update({
            where: { id: e.id },
            data: {
              paidAmount,
              status: paidAmount >= e.amount ? 'reimbursed' : 'partial',
              paidAt: at, payMode: mode, payoutId,
              payments: [...history, { at, amount: pay, mode, payoutId, by: me }] as never,
            },
          });
        }
        const partly = pays.some(({ e, pay }) => e.paidAmount + pay < e.amount);
        await this.notify(userId, `${who} ${partly ? 'part-paid' : 'paid'} you ${rupees(sum)} for ${pays.length} expense(s)` +
          (mode === 'razorpayx' ? ' via RazorpayX.' : ' (by hand).'));
        results.push({ userId, amount: sum, ok: true, payoutId });
      } catch (err) {
        await this.prisma.expense.updateMany({ where: { id: { in: idList } }, data: { status: 'payment_failed' } });
        results.push({ userId, amount: sum, ok: false, error: err instanceof Error ? err.message : 'Payment failed' });
      }
    }
    const touched = new Set(targets.map((e) => e.reportId));
    for (const rid of touched) {
      await this.hist(rid, `Payment run (${mode}): ${results.filter((r) => r.ok).length}/${results.length} employee(s) paid` +
        (part ? `, part payment ${rupees(part)}` : ''));
    }
    return { results, paid: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  }

  /** The employee's payout rails — admin/manager writes them; number sealed. */
  @Post('bank/:userId')
  @Roles('admin', 'ops')
  async setBank(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('No such person');
    const holder = String(body.holder || '').trim();
    const acc = String(body.acc || '').replace(/\s/g, '');
    const ifsc = String(body.ifsc || '').trim().toUpperCase();
    if (!holder || !acc || !ifsc) throw new BadRequestException('Name, account number and IFSC — all three');
    if (!/^\d{6,20}$/.test(acc)) throw new BadRequestException('That account number does not look right');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new BadRequestException('That IFSC does not look right');
    await this.prisma.user.update({ where: { id: userId }, data: { bankHolder: holder, bankAcc: seal(acc), bankIfsc: ifsc } });
    return { ok: true, accMasked: '••••' + acc.slice(-4) };
  }

  /** The three RazorpayX calls, ids cached for next time. */
  private async razorpayxPayout(userId: string, amount: number, ref: string): Promise<string> {
    const [u, co] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.company.findFirst(),
    ]);
    if (!u) throw new BadRequestException('No such person');
    const ig = (co?.integrations || {}) as Record<string, string>;
    const keyId = open(ig.rzpKeyId || '');
    const keySecret = open(ig.rzpKeySecret || '');
    const xAccount = open(ig.rzpxAccount || '');
    if (!keyId || !keySecret) throw new BadRequestException('Razorpay keys are not set — add them on the Credentials page, or reimburse manually');
    if (!xAccount) throw new BadRequestException('The RazorpayX account number is not set — add it on the Credentials page, or reimburse manually');
    const acc = open(u.bankAcc || '');
    if (!u.bankHolder || !acc || !u.bankIfsc) throw new BadRequestException('Add ' + u.name + "'s bank details first");

    const call = async (path: string, payload: unknown) => {
      const res = await fetch('https://api.razorpay.com/v1' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64') },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new BadRequestException('RazorpayX said: ' + ((data.error as { description?: string })?.description || res.statusText));
      return data as { id: string };
    };
    let contactId = u.rzpContactId;
    if (!contactId) contactId = (await call('/contacts', { name: u.bankHolder || u.name, type: 'employee', reference_id: u.id })).id;
    const fundKey = [u.bankHolder, acc.slice(-4), u.bankIfsc].join('|');
    let fundId = u.rzpFundKey === fundKey ? u.rzpFundId : '';
    if (!fundId) fundId = (await call('/fund_accounts', { contact_id: contactId, account_type: 'bank_account', bank_account: { name: u.bankHolder, ifsc: u.bankIfsc, account_number: acc } })).id;
    await this.prisma.user.update({ where: { id: u.id }, data: { rzpContactId: contactId, rzpFundId: fundId, rzpFundKey: fundKey } });
    const payout = await call('/payouts', {
      account_number: xAccount, fund_account_id: fundId, amount: amount * 100, currency: 'INR',
      mode: 'IMPS', purpose: 'payout', queue_if_low_balance: true, reference_id: ref, narration: 'Expense reimbursement ' + ref,
    });
    return payout.id;
  }
}
