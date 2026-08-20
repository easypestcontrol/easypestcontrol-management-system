/* ============================================================================
   Schedule — the month calendar and the per-tech day board.

   Ported from v1 assets/js/views/schedule.js. Month covers the full 42-cell
   grid (Sunday of the week containing the 1st, six weeks out) because the
   calendar shows neighbouring-month days too. Day returns per-technician
   columns plus the unassigned queue and the 14-day strip (-3..+10) counts.
   jobsOn includes cancelled jobs — v1 store.js:974-978 never filters status.
   ========================================================================== */

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { addDays, dayOfWeek } from 'shared';
import { branchScope, branchWhere, clampScope } from '../branch.util';

interface ScopedReq { user?: { sub?: string; role?: string } }

interface DayJob {
  id: string;
  type: string;
  contractId: string;
  clientId: string;
  clientName: string;
  title: string;
  date: string;
  slot: string;
  mins: number;
  techIds: string[];
  status: string;
  priority: string;
  visitNo: number;
  ofVisits: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

@Controller('schedule')
@UseGuards(AuthGuard)
export class ScheduleController {
  constructor(private prisma: PrismaService) {}

  private async nameMaps() {
    const [clients, services] = await Promise.all([
      this.prisma.client.findMany({ select: { id: true, name: true } }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
    ]);
    const cname = new Map(clients.map((c) => [c.id, c.name]));
    const sname = new Map(services.map((s) => [s.id, s.name]));
    return { cname, sname };
  }

  private row(
    j: {
      id: string; type: string; contractId: string; clientId: string; date: string;
      slot: string; mins: number; techIds: string[]; status: string; priority: string;
      visitNo: number; ofVisits: number; serviceIds: string[];
    },
    cname: Map<string, string>,
    sname: Map<string, string>,
  ): DayJob {
    return {
      id: j.id, type: j.type, contractId: j.contractId, clientId: j.clientId,
      clientName: cname.get(j.clientId) || j.clientId,
      title: j.serviceIds.map((s) => sname.get(s) || s).join(' + ') || j.type,
      date: j.date, slot: j.slot, mins: j.mins, techIds: j.techIds,
      status: j.status, priority: j.priority, visitNo: j.visitNo, ofVisits: j.ofVisits,
    };
  }

  /* ---------------------------------------------------------------- month */
  // ?month=YYYY-MM — all jobs across the 42-cell window, grouped by day and
  // sorted by slot within a day; plus the in-month visit count for the header.
  @Get('month')
  async month(@Req() req: ScopedReq, @Query('month') monthQ?: string, @Query('branch') branch?: string) {
    const month = /^\d{4}-\d{2}$/.test(monthQ || '') ? String(monthQ) : todayISO().slice(0, 7);
    const first = month + '-01';
    const start = addDays(first, -dayOfWeek(first)); // Sunday of the week with the 1st
    const end = addDays(start, 41);
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);

    const [{ cname, sname }, jobs] = await Promise.all([
      this.nameMaps(),
      this.prisma.job.findMany({
        where: { date: { gte: start, lte: end }, ...branchWhere(scope) },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
    ]);

    const days: Record<string, DayJob[]> = {};
    for (const j of jobs) {
      (days[j.date] = days[j.date] || []).push(this.row(j, cname, sname));
    }
    const total = jobs.filter((j) => j.date.slice(0, 7) === month).length;
    return { month, start, days, total, today: todayISO() };
  }

  /* ------------------------------------------------------------------ day */
  // ?date=YYYY-MM-DD — per-tech kanban columns (no branch filter, v1 parity),
  // the trailing unassigned queue, day totals, and the -3..+10 strip counts.
  @Get('day')
  async day(@Req() req: ScopedReq, @Query('date') dateQ?: string, @Query('branch') branch?: string) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateQ || '') ? String(dateQ) : todayISO();
    const stripStart = addDays(date, -3);
    const stripEnd = addDays(date, 10);
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);

    const [{ cname, sname }, techUsers, windowJobs] = await Promise.all([
      this.nameMaps(),
      this.prisma.user.findMany({
        where: {
          role: { in: ['tech', 'senior_tech'] },
          ...(scope === null ? {} : { branches: { hasSome: scope } }),
        },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, title: true, color: true, photo: true },
      }),
      this.prisma.job.findMany({
        where: { date: { gte: stripStart, lte: stripEnd }, ...branchWhere(scope) },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
    ]);

    const dayJobs = windowJobs.filter((j) => j.date === date);
    const rows = dayJobs.map((j) => this.row(j, cname, sname));

    const techs = techUsers.map((t) => {
      const js = rows.filter((j) => j.techIds.indexOf(t.id) >= 0);
      return {
        ...t,
        jobs: js,
        done: js.filter((j) => j.status === 'completed').length,
        mins: js.reduce((s, j) => s + (j.mins || 60), 0),
      };
    });

    const strip: Array<{ date: string; count: number }> = [];
    for (let i = -3; i <= 10; i++) {
      const d = addDays(date, i);
      strip.push({ date: d, count: windowJobs.filter((j) => j.date === d).length });
    }

    return {
      date,
      today: todayISO(),
      techs,
      unassigned: rows.filter((j) => !j.techIds.length),
      counts: {
        total: rows.length,
        completed: rows.filter((j) => j.status === 'completed').length,
        open: rows.filter((j) => j.status !== 'completed').length,
      },
      strip,
    };
  }
}
