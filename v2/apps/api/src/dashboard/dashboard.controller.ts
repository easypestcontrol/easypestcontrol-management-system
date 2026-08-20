import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope } from '../branch.util';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  /**
   * The state of the business. Not a technician's business: these figures are
   * what the company has billed and what it is still owed.
   */
  @Get()
  @Roles('admin', 'ops', 'sales', 'accounts')
  async stats(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('branch') branch?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const bw = branchWhere(clampScope(await branchScope(this.prisma, req.user), branch));
    const [clients, leads, quotes, contracts, jobsToday, waiting, invoices] = await Promise.all([
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
    ]);

    const billed = invoices.reduce(
      (a, i) => a + (i.items as Array<{ qty?: number; rate?: number }>)
        .reduce((s, x) => s + (x.qty || 0) * (x.rate || 0), 0),
      0,
    );
    const collected = invoices.reduce(
      (a, i) => a + i.payments.reduce((s, p) => s + p.amount, 0),
      0,
    );

    return {
      clients, leads, quotes, contracts,
      jobsToday: jobsToday.length,
      doneToday: jobsToday.filter((j) => j.status === 'completed').length,
      waiting,
      billed, collected, outstanding: billed - collected,
    };
  }
}
