import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope } from '../branch.util';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  /**
   * The state of the business. Not a technician's business: these figures are
   * what the company has billed and what it is still owed.
   *
   * One call feeds the whole home page — the KPI cards AND the charts. The
   * chart series are computed from the same invoice set the totals use, so
   * the numbers can never disagree with each other.
   */
  @Get()
  @Roles('admin', 'ops', 'sales', 'accounts')
  async stats(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('branch') branch?: string,
  ) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const bw = branchWhere(clampScope(await branchScope(this.prisma, req.user), branch));

    const [
      clients, leads, quotes, contracts, jobsToday, waiting, invoices,
      recentJobs, upcomingJobs, svcCatalog, clientRows, branchRows, userRows,
    ] = await Promise.all([
      this.prisma.client.count({ where: bw }),
      this.prisma.lead.count({ where: { stage: { notIn: ['won', 'lost'] }, ...bw } }),
      this.prisma.quotation.count({ where: { status: { in: ['draft', 'sent'] }, ...bw } }),
      this.prisma.contract.count({ where: bw }),
      this.prisma.job.findMany({ where: { date: today, status: { not: 'cancelled' }, ...bw } }),
      this.prisma.job.count({
        where: { date: today, status: 'scheduled', techIds: { isEmpty: true }, ...bw },
      }),
      // A withdrawn invoice is out of every total, including this one.
      this.prisma.invoice.findMany({
        where: { ...bw, status: { not: 'cancelled' } }, include: { payments: true },
      }),
      this.prisma.job.findMany({
        where: { date: { gte: d90 }, status: { not: 'cancelled' }, ...bw },
        select: { serviceIds: true },
      }),
      this.prisma.job.findMany({
        where: { date: { gte: today }, status: { in: ['scheduled', 'enroute', 'inprogress'] }, ...bw },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
        take: 6,
        select: { id: true, date: true, slot: true, clientId: true, type: true, techIds: true },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
      this.prisma.client.findMany({ where: bw, select: { id: true, name: true } }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true } }),
    ]);

    const itemsTotal = (i: { items: unknown }) =>
      (i.items as Array<{ qty?: number; rate?: number }>)
        .reduce((s, x) => s + (x.qty || 0) * (x.rate || 0), 0);
    const billed = invoices.reduce((a, i) => a + itemsTotal(i), 0);
    const collected = invoices.reduce(
      (a, i) => a + i.payments.reduce((s, p) => s + p.amount, 0),
      0,
    );

    /* ------------------------ billed vs collected, month by month (6) */
    const months: Array<{ key: string; label: string; invoiced: number; collected: number }> = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MONTH_NAMES[d.getMonth()],
        invoiced: 0,
        collected: 0,
      });
    }
    const mOf = new Map(months.map((m) => [m.key, m]));
    for (const i of invoices) {
      const m = mOf.get(String(i.date).slice(0, 7));
      if (m) m.invoiced += itemsTotal(i);
      for (const p of i.payments) {
        const pm = mOf.get(String(p.date).slice(0, 7));
        if (pm) pm.collected += p.amount;
      }
    }

    /* ---------------------------------- the invoice book, sliced by state */
    const mixOf = new Map<string, { n: number; value: number }>();
    for (const i of invoices) {
      const slot = mixOf.get(i.status) || { n: 0, value: 0 };
      slot.n += 1;
      slot.value += itemsTotal(i) - i.payments.reduce((s, p) => s + p.amount, 0);
      mixOf.set(i.status, slot);
    }
    const invoiceMix = ['overdue', 'partial', 'sent', 'draft', 'paid']
      .filter((k) => mixOf.has(k))
      .map((k) => ({ status: k, n: mixOf.get(k)!.n, value: Math.max(0, mixOf.get(k)!.value) }));

    /* --------------------- which services actually get booked (90 days) */
    const svcName = new Map(svcCatalog.map((s) => [s.id, s.name]));
    const svcCount = new Map<string, number>();
    for (const j of recentJobs) {
      for (const sid of j.serviceIds) {
        const name = svcName.get(sid) || sid;
        svcCount.set(name, (svcCount.get(name) || 0) + 1);
      }
    }
    const serviceMix = Array.from(svcCount.entries())
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);

    /* ------------------------------------------- branch vs branch money */
    const brName = new Map(branchRows.map((b) => [b.id, b.name]));
    const brMoney = new Map<string, { collected: number; outstanding: number }>();
    for (const i of invoices) {
      const key = brName.get(i.branch) || i.branch || 'Unassigned';
      const slot = brMoney.get(key) || { collected: 0, outstanding: 0 };
      const paid = i.payments.reduce((s, p) => s + p.amount, 0);
      slot.collected += paid;
      slot.outstanding += Math.max(0, itemsTotal(i) - paid);
      brMoney.set(key, slot);
    }
    const branchSplit = Array.from(brMoney.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.collected + b.outstanding - (a.collected + a.outstanding));

    /* ------------------------------------------------- the two feed lists */
    const clName = new Map(clientRows.map((c) => [c.id, c.name]));
    const uName = new Map(userRows.map((u) => [u.id, u.name]));
    const upcoming = upcomingJobs.map((j) => ({
      id: j.id, date: j.date, slot: j.slot, type: j.type,
      client: clName.get(j.clientId) || j.clientId,
      techs: j.techIds.map((t) => uName.get(t) || t).join(', '),
    }));
    const recentPayments = invoices
      .flatMap((i) => i.payments.map((p) => ({
        id: p.id, date: p.date, amount: p.amount, mode: p.mode,
        invoiceId: i.id, client: clName.get(i.clientId) || i.clientId,
      })))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, 6);

    return {
      clients, leads, quotes, contracts,
      jobsToday: jobsToday.length,
      doneToday: jobsToday.filter((j) => j.status === 'completed').length,
      waiting,
      billed, collected, outstanding: billed - collected,
      months: months.map(({ label, invoiced, collected: c }) => ({ label, invoiced, collected: c })),
      invoiceMix, serviceMix, branchSplit, upcoming, recentPayments,
    };
  }
}
