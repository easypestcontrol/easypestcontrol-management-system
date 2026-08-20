/* ============================================================================
   The dispatch API — everything the board needs in one read, and the writes
   a dispatcher makes: place, unassign, restore (undo), auto-assign, balance,
   and the advisory drop-check that paints the drag tooltip.

   The maths itself lives in packages/shared (dispatch.ts, ported from v1
   store.js) — this controller only fetches the day and applies the answers.
   Every mutating endpoint hands back the job's before-state {date, slot,
   techIds, pinned} so the board's undo stack can restore it exactly
   (v1 board.js:420-431, store.js:845-857).
   ========================================================================== */

import {
  BadRequestException, Body, Controller, Get, NotFoundException, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import {
  autoAssignPlan, balancePlan, dropCheck, freeGaps, suggestTechs, workHours,
  addDays, dayOfWeek, toISO, toMin, toHHMM,
  type CompanyHours, type DropWarning, type Gap, type JobLike, type TechLike,
} from 'shared';
import {
  jobBranch, jobCrewSize,
  type BranchLite, type ClientLite, type PlanLineLite,
} from './dispatch.util';

const SNAP = 15; // minutes — the grain every drop snaps to (v1 store.js:514)

/* ------------------------------------------------------------ payload types */

interface BeforeState { date: string; slot: string; techIds: string[]; pinned: boolean }

interface DayTech {
  id: string; name: string; color: string; title: string;
  skills: string[]; branches: string[];
  hours: { from: string; to: string; days: number[] };
  off: boolean; booked: number; avail: number; pct: number; over: boolean;
  gaps: Gap[];
}

interface DayJob {
  id: string; clientId: string; clientName: string; addr: string; city: string;
  serviceIds: string[]; serviceNames: string[];
  date: string; slot: string; mins: number; techIds: string[];
  crewNeed: number; status: string; priority: string; pinned: boolean;
  branchId: string; branchName: string;
}

interface TechRow {
  id: string; name: string; color: string; title: string;
  skills: string[]; branches: string[];
  hoursFrom: string; hoursTo: string; hoursDays: number[];
}

@Controller('dispatch')
@UseGuards(AuthGuard)
export class DispatchController {
  constructor(private prisma: PrismaService) {}

  /* -------------------------------------------------------------- the day */

  /**
   * Everything one day's board paints, loaded once: company hours, the tech
   * roster with load + free gaps, jobs enriched with names/crew/branch, and
   * the maps the engine calls need.
   */
  private async loadDay(date: string) {
    const [company, branches, users, services, jobs] = await Promise.all([
      this.prisma.company.findFirst(),
      this.prisma.branch.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.user.findMany({
        where: { role: { in: ['tech', 'senior_tech'] }, active: true },
        orderBy: { id: 'asc' },
        select: {
          id: true, name: true, color: true, title: true, skills: true,
          branches: true, hoursFrom: true, hoursTo: true, hoursDays: true,
        },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
      this.prisma.job.findMany({
        where: { date, status: { not: 'cancelled' } },
        orderBy: { slot: 'asc' },
      }),
    ]);

    const co: CompanyHours = {
      hoursFrom: company?.hoursFrom || '09:00',
      hoursTo: company?.hoursTo || '18:00',
      hoursDays: company?.hoursDays?.length ? company.hoursDays : [1, 2, 3, 4, 5, 6],
    };

    const svcNames: Record<string, string> = {};
    for (const s of services) svcNames[s.id] = s.name;

    const clientIds = Array.from(new Set(jobs.map((j) => j.clientId).filter(Boolean)));
    const contractIds = Array.from(new Set(jobs.map((j) => j.contractId).filter(Boolean)));
    const [clients, contracts, planLines] = await Promise.all([
      clientIds.length
        ? this.prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, name: true, addr: true, city: true, branch: true },
          })
        : Promise.resolve([] as ClientLite[]),
      contractIds.length
        ? this.prisma.contract.findMany({
            where: { id: { in: contractIds } },
            select: { id: true, branch: true },
          })
        : Promise.resolve([] as Array<{ id: string; branch: string }>),
      contractIds.length
        ? this.prisma.planLine.findMany({
            where: { contractId: { in: contractIds } },
            select: { contractId: true, svId: true, crew: true },
          })
        : Promise.resolve([] as PlanLineLite[]),
    ]);

    const clientsById = new Map(clients.map((c) => [c.id, c]));
    const contractBranch = new Map(contracts.map((c) => [c.id, c.branch]));
    const branchLites: BranchLite[] = branches.map((b) => ({ id: b.id, name: b.name, areas: b.areas }));

    const branchOf = (j: { contractId: string; clientId: string }) =>
      jobBranch(
        j.contractId ? contractBranch.get(j.contractId) || '' : '',
        clientsById.get(j.clientId),
        branchLites,
      );
    const crewOf = (j: { contractId: string; serviceIds: string[]; techIds: string[] }) =>
      jobCrewSize(j, planLines);

    const jobLike = (j: (typeof jobs)[number]): JobLike => ({
      id: j.id, contractId: j.contractId || '', date: j.date, slot: j.slot, mins: j.mins || 60,
      techIds: j.techIds || [], serviceIds: j.serviceIds || [],
      status: String(j.status), crewNeed: crewOf(j),
      priority: String(j.priority), pinned: j.pinned,
    });

    return {
      co, branches, users: users as TechRow[], svcNames, jobs, planLines,
      jobLikes: jobs.map(jobLike), clientsById, branchOf, crewOf, jobLike,
    };
  }

  /** Crew size for a job the day snapshot may not cover (cross-date safety). */
  private async crewOfJob(job: { contractId: string; serviceIds: string[]; techIds: string[] }) {
    const lines = job.contractId
      ? await this.prisma.planLine.findMany({
          where: { contractId: job.contractId },
          select: { contractId: true, svId: true, crew: true },
        })
      : [];
    return jobCrewSize(job, lines);
  }

  /**
   * placeJob, exactly as v1 wrote it (store.js:636-651): slot snapped to the
   * 15-minute grain, techIds deduped then clamped to the crew the job wants,
   * pinned = true so the plan engine never moves a hand placement. Returns
   * the before-state so the board can undo it.
   */
  private async placeOne(
    jobId: string,
    techIds: string[] | null | undefined,
    dateISO: string | undefined,
    startMin: number | null | undefined,
    linesPool?: PlanLineLite[],
  ) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No such job');
    const before: BeforeState = {
      date: job.date, slot: job.slot, techIds: [...job.techIds], pinned: job.pinned,
    };

    const data: { date?: string; slot?: string; techIds?: string[]; pinned: boolean } = {
      pinned: true,
    };
    if (dateISO) data.date = String(dateISO);
    if (startMin != null && Number.isFinite(Number(startMin))) {
      data.slot = toHHMM(Math.round(Number(startMin) / SNAP) * SNAP);
    }
    if (Array.isArray(techIds)) {
      const seen: string[] = [];
      for (const id of techIds) {
        const s = String(id || '');
        if (s && seen.indexOf(s) < 0) seen.push(s);
      }
      const crew = linesPool ? jobCrewSize(job, linesPool) : await this.crewOfJob(job);
      data.techIds = seen.slice(0, Math.max(1, crew));
    }

    const updated = await this.prisma.job.update({ where: { id: jobId }, data });
    return { job: updated, before };
  }

  /* ------------------------------------------------------------------ read */

  /** The whole board in one call: roster grouped by branch, jobs, queue, week. */
  @Get('day')
  async day(@Query('date') dateQ?: string) {
    const date = dateQ || toISO(new Date());
    const c = await this.loadDay(date);

    // The 7-day strip: counts for the surrounding days (v1 board.js:184-201).
    const weekDates: string[] = [];
    for (let i = -3; i <= 3; i++) weekDates.push(addDays(date, i));
    const others = weekDates.filter((d) => d !== date);
    const windowJobs = await this.prisma.job.findMany({
      where: { date: { in: others }, status: { not: 'cancelled' } },
      select: { date: true, techIds: true },
    });
    const week = weekDates.map((d) => {
      const js = d === date ? c.jobs : windowJobs.filter((x) => x.date === d);
      return {
        date: d,
        jobs: js.length,
        unassigned: js.filter((x) => !(x.techIds || []).length).length,
      };
    });

    // Per-technician load: booked minutes vs available (v1 board.js:116-127).
    const dow = dayOfWeek(date);
    const techRows: DayTech[] = c.users.map((u) => {
      const h = workHours(u as TechLike, c.co);
      const off = h.days.indexOf(dow) < 0;
      const booked = c.jobLikes
        .filter((j) => j.techIds.indexOf(u.id) >= 0)
        .reduce((a, j) => a + (j.mins || 60), 0);
      const avail = Math.max(60, toMin(h.to) - toMin(h.from));
      return {
        id: u.id, name: u.name, color: u.color, title: u.title,
        skills: u.skills, branches: u.branches,
        hours: h, off, booked, avail,
        pct: Math.round((booked / avail) * 100),
        over: booked > avail,
        gaps: off ? [] : freeGaps(u as TechLike, c.co, date, c.jobLikes),
      };
    });

    // Grouped in branch order, first branch wins a shared tech, leftovers
    // under a pseudo "No branch" band (v1 board.js:92-102).
    const seen = new Set<string>();
    const groups: Array<{ branchId: string; branchName: string; techs: DayTech[] }> = [];
    for (const b of c.branches) {
      const techs = techRows.filter((t) => t.branches.indexOf(b.id) >= 0 && !seen.has(t.id));
      techs.forEach((t) => seen.add(t.id));
      if (techs.length) groups.push({ branchId: b.id, branchName: b.name, techs });
    }
    const rest = techRows.filter((t) => !seen.has(t.id));
    if (rest.length) groups.push({ branchId: '_none', branchName: 'No branch', techs: rest });

    const jobsOut: DayJob[] = c.jobs.map((j) => {
      const cl = c.clientsById.get(j.clientId);
      const br = c.branchOf(j);
      return {
        id: j.id, clientId: j.clientId,
        clientName: cl?.name || '', addr: cl?.addr || '', city: cl?.city || '',
        serviceIds: j.serviceIds,
        serviceNames: j.serviceIds.map((id) => c.svcNames[id] || id),
        date: j.date, slot: j.slot, mins: j.mins || 60, techIds: j.techIds,
        crewNeed: c.crewOf(j), status: String(j.status), priority: String(j.priority),
        pinned: j.pinned, branchId: br?.id || '', branchName: br?.name || '',
      };
    });

    return {
      date,
      company: c.co,
      branches: c.branches.map((b) => ({ id: b.id, name: b.name })),
      groups,
      jobs: jobsOut,
      queue: jobsOut.filter((j) => !j.techIds.length),
      week,
    };
  }

  /** Advisory drop warnings for the drag tooltip — never a refusal. */
  @Post('check')
  async check(
    @Body() body: { jobId?: string; techId?: string; startMin?: number; date?: string },
  ): Promise<DropWarning[]> {
    const jobId = String(body.jobId || '');
    const techId = String(body.techId || '');
    const startMin = Number(body.startMin);
    if (!jobId || !techId || !Number.isFinite(startMin)) {
      throw new BadRequestException('jobId, techId and startMin are required');
    }
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No such job');
    const date = String(body.date || job.date);
    const c = await this.loadDay(date);
    const tech = c.users.find((u) => u.id === techId);
    if (!tech) throw new NotFoundException('No such technician');

    const jl = c.jobLike(job);
    if (job.date !== date || (job.contractId && !c.planLines.some((l) => l.contractId === job.contractId))) {
      jl.crewNeed = await this.crewOfJob(job);   // job from outside the loaded day
    }
    const br = c.branchOf(job);
    return dropCheck(jl, tech as TechLike, c.co, date, startMin, c.jobLikes, c.svcNames, br?.id);
  }

  /** Rank everybody for one job, reasoning shown (v1 suggest modal). */
  @Get('suggest')
  async suggest(
    @Query('jobId') jobId?: string,
    @Query('date') dateQ?: string,
    @Query('limit') limitQ?: string,
  ) {
    if (!jobId) throw new BadRequestException('jobId is required');
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No such job');
    const date = dateQ || job.date;
    const c = await this.loadDay(date);

    const jl = c.jobLike(job);
    if (job.date !== date || (job.contractId && !c.planLines.some((l) => l.contractId === job.contractId))) {
      jl.crewNeed = await this.crewOfJob(job);   // job from outside the loaded day
    }
    const br = c.branchOf(job);
    // People already on this customer's contracts rank first, with the reason shown.
    const own = await this.prisma.contract.findMany({
      where: { clientId: job.clientId }, include: { plan: true },
    });
    const preferIds: string[] = [];
    for (const k of own) for (const l of k.plan) for (const t of l.techIds) {
      if (preferIds.indexOf(t) < 0) preferIds.push(t);
    }
    const rows = suggestTechs(jl, c.users as TechLike[], c.co, date, c.jobLikes, c.svcNames, br?.id, preferIds);
    const limit = Math.max(1, Number(limitQ) || 6);
    return rows.slice(0, limit).map((r) => ({
      tech: {
        id: r.tech.id,
        name: r.tech.name,
        color: (r.tech as TechRow).color || '',
      },
      score: r.score,
      at: r.at,
      why: r.why,
      bookedPct: r.bookedPct,
    }));
  }

  /* ---------------------------------------------------------------- writes */

  /** Put a job on a crew at a minute. Clamps to crewNeed, pins, returns undo state. */
  @Post('place')
  @Roles('admin', 'ops', 'sales')
  async place(
    @Body() body: { jobId?: string; techIds?: string[] | null; date?: string; startMin?: number | null },
  ) {
    const jobId = String(body.jobId || '');
    if (!jobId) throw new BadRequestException('jobId is required');
    return this.placeOne(jobId, body.techIds, body.date, body.startMin);
  }

  /** Take a job off everybody and let the plan own it again (pinned = false). */
  @Post('unassign')
  @Roles('admin', 'ops', 'sales')
  async unassign(@Body() body: { jobId?: string }) {
    const jobId = String(body.jobId || '');
    if (!jobId) throw new BadRequestException('jobId is required');
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No such job');
    const before: BeforeState = {
      date: job.date, slot: job.slot, techIds: [...job.techIds], pinned: job.pinned,
    };
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { techIds: [], pinned: false },
    });
    return { job: updated, before };
  }

  /** Put jobs back exactly as they were — the board's undo (v1 undoBatch). */
  @Post('restore')
  @Roles('admin', 'ops', 'sales')
  async restore(
    @Body() body: {
      jobId?: string; before?: BeforeState;
      entries?: Array<{ jobId: string; before: BeforeState }>;
    },
  ) {
    const entries = Array.isArray(body.entries)
      ? body.entries
      : body.jobId && body.before
        ? [{ jobId: body.jobId, before: body.before }]
        : [];
    if (!entries.length) throw new BadRequestException('Nothing to restore');

    let restored = 0;
    for (const e of entries) {
      const id = String(e?.jobId || '');
      const b = e?.before;
      if (!id || !b || !b.date || !b.slot) continue;
      const exists = await this.prisma.job.findUnique({ where: { id }, select: { id: true } });
      if (!exists) continue;
      await this.prisma.job.update({
        where: { id },
        data: {
          date: String(b.date),
          slot: String(b.slot),
          techIds: Array.isArray(b.techIds) ? b.techIds.map(String) : [],
          pinned: !!b.pinned,
        },
      });
      restored++;
    }
    return { restored };
  }

  /**
   * Place everything waiting on a day — the shared engine plans (urgent and
   * long first, one at a time so each placement is visible to the next), this
   * applies. Returns placed with before-states, and skipped with reasons.
   */
  @Post('auto')
  @Roles('admin', 'ops', 'sales')
  async auto(@Body() body: { date?: string }) {
    const date = String(body.date || '') || toISO(new Date());
    const c = await this.loadDay(date);
    const queue = c.jobLikes.filter((j) => !j.techIds.length);
    if (!queue.length) return { placed: [], skipped: [] };

    const branchIdByJob = new Map(c.jobs.map((j) => [j.id, c.branchOf(j)?.id]));
    const plan = autoAssignPlan(
      queue, c.users as TechLike[], c.co, date, c.jobLikes, c.svcNames,
      (j) => branchIdByJob.get(j.id),
    );

    const placed: Array<{ jobId: string; techIds: string[]; startMin: number; before: BeforeState }> = [];
    for (const p of plan.placed) {
      const r = await this.placeOne(p.jobId, p.techIds, date, p.startMin, c.planLines);
      placed.push({ jobId: p.jobId, techIds: p.techIds, startMin: p.startMin, before: r.before });
    }
    return { placed, skipped: plan.skipped };
  }

  /**
   * Move work off anybody over their hours onto anybody with room. Only
   * single-person, not-yet-started jobs move — the engine decides, this applies.
   */
  @Post('balance')
  @Roles('admin', 'ops', 'sales')
  async balance(@Body() body: { date?: string }) {
    const date = String(body.date || '') || toISO(new Date());
    const c = await this.loadDay(date);
    const plan = balancePlan(c.users as TechLike[], c.co, date, c.jobLikes);

    const moved: Array<{ jobId: string; techIds: string[]; startMin: number; before: BeforeState }> = [];
    for (const p of plan) {
      const r = await this.placeOne(p.jobId, p.techIds, date, p.startMin, c.planLines);
      moved.push({ jobId: p.jobId, techIds: p.techIds, startMin: p.startMin, before: r.before });
    }
    return { moved };
  }
}
