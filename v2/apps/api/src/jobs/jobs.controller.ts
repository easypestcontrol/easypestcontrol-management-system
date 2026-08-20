/* ============================================================================
   Jobs — the visit list, status transitions and the execution record.

   Ported from v1 assets/js/views/jobs.js + store.js. The exec record is a
   JSONB snapshot written by the technician: timings, geo stamp, before/after
   photos (data URLs), chemicals used, findings, the customer signature and a
   rating. Stock is only consumed at finish — never earlier (jobs.js:736-777,
   store.js:1394-1407).
   ========================================================================== */

import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, clientBranch, inScope } from '../branch.util';
import {
  addDays, canRecordService, collectionNote, daysBetween, docTotals,
  isFieldTech, isOffice, isOnCrew, toHHMM, toMin,
} from 'shared';
import { mintInvoiceId, raiseDueBilling } from '../billing.util';

/* ------------------------------------------------------------------ types */

export interface ExecChemical { id: string; qty: number }

/** One line of "in the kitchen I did this" — §6 of TECHNICIAN.md. */
export interface AreaFinding {
  area: string;
  text: string;
}

export interface ExecRecord {
  checkinAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMins: number;
  geo: string;
  photosBefore: string[];
  photosAfter: string[];
  chemicals: ExecChemical[];
  findings: string[];
  /** Free text per area of the property — replaces the canned findings list. */
  areaFindings: AreaFinding[];
  observations: string;
  /** The technician's own note, written before the customer signs. */
  techNotes: string;
  /** When the report went out, who it went to, and who did the work. */
  reportSentAt: string;
  reportSentTo: string;
  reportBy: string;
  /**
   * Proof each person arrived in uniform, keyed by user id. It is per-person
   * on purpose: the point is that everybody who turned up is in uniform, not
   * that one of them photographed himself.
   */
  uniformPhotos: Record<string, string>;
  signedBy: string;
  signature: boolean;
  signatureImage: string;
  rating: number;
  feedback: string;
}

interface AuthedRequest { user: { sub: string; role: string } }

/* ------------------------------------------------------------- constants */

/**
 * How accurate a fix has to be before we will save it as the site location.
 * 50 m is ordinary phone GPS outdoors: it accepts a mark made at the gate and
 * rejects one made from the office or from a car on the main road.
 */
const SITE_GEO_ACCURACY_M = 50;

/** The 10 canned findings — v1 data.js:674-680, exec.findings is a subset. */
export const FINDINGS_CATALOG = [
  'Cockroach activity — kitchen platform', 'Cockroach activity — sink area',
  'Rodent droppings observed', 'Rodent gnaw marks on packaging',
  'Ant trail — pantry shelf', 'Termite mud tube — door frame',
  'Mosquito breeding — stagnant water', 'Fly activity — waste bin area',
  'Spider webbing — ceiling corners', 'No activity observed',
];

const JOB_TYPES = ['AMC Visit', 'One-Time', 'Callback', 'Complaint', 'Inspection'];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const STATUSES = ['scheduled', 'enroute', 'inprogress', 'completed', 'cancelled'];

/** Fields a manager may PATCH directly — jobs.js reschedule/notes, board resize. */
const EDITABLE = ['mins', 'pinned', 'priority', 'notes', 'date', 'slot'] as const;

/* ---------------------------------------------------------------- helpers */

const pad2 = (n: number) => String(n).padStart(2, '0');

function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 'YYYY-MM-DDTHH:MM' local — v1 store.js nowStamp. */
function nowStamp(): string {
  const d = new Date();
  return todayISO() + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function minutesBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.round(
    (new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / 60000,
  ));
}

/** Random Chennai-ish stamp, same shape as v1 jobs.js:539-552 fallback. */
function geoFallback(): string {
  const r = () => 300 + Math.floor(Math.random() * 400);
  return '13.0' + r() + '° N, 80.2' + r() + '° E';
}

function blankExec(): ExecRecord {
  return {
    checkinAt: null, startedAt: null, finishedAt: null, durationMins: 0, geo: '',
    photosBefore: [], photosAfter: [], chemicals: [], findings: [], areaFindings: [],
    observations: '', techNotes: '', uniformPhotos: {},
    reportSentAt: '', reportSentTo: '', reportBy: '',
    signedBy: '', signature: false, signatureImage: '', rating: 0, feedback: '',
  };
}

function execOf(j: { exec: unknown }): ExecRecord {
  const x = j.exec as Partial<ExecRecord> | null;
  return x ? { ...blankExec(), ...x } : blankExec();
}

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  if ('priority' in data && PRIORITIES.indexOf(String(data.priority)) < 0) delete data.priority;
  if ('mins' in data) data.mins = Math.max(1, Math.round(Number(data.mins) || 60));
  if ('pinned' in data) data.pinned = !!data.pinned;
  return data;
}

/* ------------------------------------------------------------- controller */

@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private prisma: PrismaService) {}

  /* ------------------------------------------------------------- catalog */
  // Declared before ':id' so the literal path wins.
  @Get('findings-catalog')
  findingsCatalog() {
    return FINDINGS_CATALOG;
  }

  /* ---------------------------------------------------------------- list */
  // Tabs, filters and sort are v1 jobs.js:35-60. Counts are computed over the
  // SAME filtered set as the rows (minus the tab), so a technician's tabs
  // count their own work — not the whole company's.
  @Get()
  async list(
    @Query('tab') tab?: string,
    @Query('techId') techId?: string,
    @Query('q') q?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('branch') branch?: string,
    @Req() req?: AuthedRequest,
  ) {
    // A technician's list is his own work, decided here rather than by a
    // toggle in the browser. Hiding other people's services in the UI while
    // the endpoint still returns them is not a boundary, it is a curtain.
    const mine = isFieldTech(req?.user?.role) ? (req?.user?.sub || '') : '';
    const scope = clampScope(await branchScope(this.prisma, req?.user), branch);

    const [all, clients, services] = await Promise.all([
      this.prisma.job.findMany({
        where: { ...(mine ? { techIds: { has: mine } } : {}), ...branchWhere(scope) },
      }),
      this.prisma.client.findMany({ select: { id: true, name: true, area: true } }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
    ]);
    const cname = new Map(clients.map((c) => [c.id, c.name]));
    const carea = new Map(clients.map((c) => [c.id, c.area]));
    const sname = new Map(services.map((s) => [s.id, s.name]));
    const title = (j: { serviceIds: string[]; type: string }) =>
      j.serviceIds.map((id) => sname.get(id) || id).join(' + ') || j.type;

    const today = todayISO();
    const needle = (q || '').toLowerCase();

    // Everything except the tab: this is the set the person is looking at.
    const base = all.filter((j) => {
      if (techId && j.techIds.indexOf(techId) < 0) return false;
      if (clientId && j.clientId !== clientId) return false;
      if (status && STATUSES.indexOf(status) >= 0 && j.status !== status) return false;
      if (from && j.date < from) return false;
      if (to && j.date > to) return false;
      if (category === 'onetime' && j.contractId) return false;
      if (!needle) return true;
      return (j.id + (cname.get(j.clientId) || '') + title(j) + j.type)
        .toLowerCase().indexOf(needle) >= 0;
    });

    const live = (j: { status: string }) => j.status !== 'cancelled';
    const counts = {
      today: base.filter((j) => live(j) && j.date === today).length,
      upcoming: base.filter((j) => live(j) && daysBetween(today, j.date) > 0).length,
      open: base.filter((j) => live(j) && j.status !== 'completed').length,
      unassigned: base.filter((j) => live(j) && j.techIds.length === 0).length,
      completed: base.filter((j) => j.status === 'completed').length,
    };

    const rows = base
      .filter((j) => {
        // a cancelled visit only lives on the contract page, not in anyone's list
        if (j.status === 'cancelled' && tab !== 'completed') return false;
        if (tab === 'today' && j.date !== today) return false;
        if (tab === 'upcoming' && !(daysBetween(today, j.date) > 0)) return false;
        if (tab === 'open' && j.status === 'completed') return false;
        if (tab === 'completed' && j.status !== 'completed') return false;
        if (tab === 'unassigned' && j.techIds.length) return false;
        return true;
      })
      .sort((a, b) => (a.date + a.slot) < (b.date + b.slot)
        ? (tab === 'completed' ? 1 : -1)
        : (tab === 'completed' ? -1 : 1))
      .map((j) => ({
        ...j,
        clientName: cname.get(j.clientId) || j.clientId,
        clientArea: carea.get(j.clientId) || '',
        title: title(j),
      }));

    return { rows, counts };
  }

  /* -------------------------------------------------------------- detail */
  @Get(':id')
  async one(@Param('id') id: string, @Req() req?: AuthedRequest) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (req && !inScope(await branchScope(this.prisma, req.user), j.branch)) {
      throw new NotFoundException('No such service');
    }

    const exec = j.exec ? execOf(j) : null;
    const chemIds = exec ? exec.chemicals.map((c) => c.id) : [];

    const [client, contract, techs, services, inventory] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: j.clientId } }),
      j.contractId
        ? this.prisma.contract.findUnique({
            where: { id: j.contractId },
            select: {
              id: true, mode: true, freq: true, billing: true, totalVisits: true,
              start: true, end: true, quoteId: true, scope: true,
              plan: { select: { svId: true, rate: true } },
            },
          })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { id: { in: j.techIds } },
        select: { id: true, name: true, title: true, phone: true, skills: true, color: true, photo: true, rating: true },
      }),
      this.prisma.service.findMany({
        where: { id: { in: j.serviceIds } },
        select: { id: true, name: true, mins: true, warranty: true, desc: true, chem: true },
      }),
      // the technician's picker (Chemical category) plus anything already recorded
      this.prisma.inventoryItem.findMany({
        where: { OR: [{ cat: 'Chemical' }, { id: { in: chemIds } }] },
        select: { id: true, name: true, cat: true, unit: true, stock: true, note: true },
      }),
    ]);

    // keep techs in crew order, not DB order
    const byId = new Map(techs.map((t) => [t.id, t]));
    const crew = j.techIds.map((tid) => byId.get(tid)).filter(Boolean);

    // Everything this visit delivers, spelled out: the quoted service by
    // name, what it involves, its contracted rate, and the medicines the
    // catalogue defines for it — the ones stores issue and the technician
    // uses on site.
    const chemIdsAll = Array.from(new Set(services.flatMap((sv) => sv.chem || [])));
    const chemItems = chemIdsAll.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: chemIdsAll } },
          select: { id: true, name: true, unit: true, stock: true },
        })
      : [];
    const chemOf = new Map(chemItems.map((x) => [x.id, x]));
    const rateOf = new Map(((contract as { plan?: Array<{ svId: string; rate: number }> } | null)?.plan || [])
      .map((l) => [l.svId, l.rate]));
    const serviceInfo = j.serviceIds.map((sid) => {
      const sv = services.find((x) => x.id === sid);
      return {
        id: sid,
        name: sv?.name || sid,
        desc: sv?.desc || '',
        warranty: sv?.warranty || '',
        mins: sv?.mins || 60,
        rate: rateOf.get(sid) || 0,
        medicines: (sv?.chem || []).map((cid) => chemOf.get(cid)).filter(Boolean),
      };
    });

    /*
     * Whether this service has been billed — and nothing more than that.
     *
     * Deliberately just the number and the date: no amount, no paid-or-not. A
     * technician who knows the visit is invoiced knows enough, and showing him
     * whether the customer has paid would only invite him to chase it. The
     * office gets the same line and can click through.
     */
    const invoice = j.invoiceId
      ? await this.prisma.invoice.findUnique({
          where: { id: j.invoiceId }, select: { id: true, date: true, status: true },
        })
      : null;

    return {
      serviceInfo,
      ...j,
      exec,
      invoice: invoice && invoice.status !== 'cancelled'
        ? { id: invoice.id, date: invoice.date }
        : null,
      clientName: client?.name || j.clientId,
      title: services.length
        ? j.serviceIds.map((sid) => services.find((s) => s.id === sid)?.name || sid).join(' + ')
        : j.type,
      client, contract, techs: crew, services, inventory,
    };
  }

  /* -------------------------------------------------------------- create */
  // New-service modal — jobs.js:108-168. mins = Σ service.mins||60; status
  // scheduled; visitNo/ofVisits 0; exec null; notify the tech when assigned.
  @Post()
  @Roles('admin', 'ops', 'sales')
  async create(@Body() body: Record<string, unknown>) {
    const clientId = String(body.clientId || '');
    if (!clientId) throw new BadRequestException('Pick a customer');
    const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [];
    if (!serviceIds.length) throw new BadRequestException('Pick at least one service');

    const svcs = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
    const mins = serviceIds.reduce(
      (s, sid) => s + (svcs.find((x) => x.id === sid)?.mins || 60), 0);

    const type = JOB_TYPES.indexOf(String(body.type)) >= 0 ? String(body.type) : 'One-Time';
    const priority = PRIORITIES.indexOf(String(body.priority)) >= 0 ? String(body.priority) : 'normal';
    const techId = String(body.techId || '');

    // Nobody picked? A one-off booking starts with the customer's contract
    // crew — the people already serving this site. "I assigned the customer's
    // technicians, why is this visit empty" should never be a question again.
    let defaultCrew: string[] = [];
    if (!techId) {
      const own = await this.prisma.contract.findMany({
        where: { clientId }, include: { plan: true },
      });
      const matched: string[] = [];
      const anyCrew: string[] = [];
      for (const k of own) for (const l of k.plan) {
        for (const t of l.techIds) {
          if (anyCrew.indexOf(t) < 0) anyCrew.push(t);
          if (serviceIds.indexOf(l.svId) >= 0 && matched.indexOf(t) < 0) matched.push(t);
        }
      }
      // whoever does THIS service for them first; any of their crew otherwise
      defaultCrew = (matched.length ? matched : anyCrew).slice(0, 1);
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'job' },
      create: { key: 'job', value: 1001 }, // seed jobs live in the 900s
      update: { value: { increment: 1 } },
    });

    const j = await this.prisma.job.create({
      data: {
        id: 'SER-' + String(seq.value).padStart(4, '0'),
        type,
        contractId: '',
        clientId,
        branch: await clientBranch(this.prisma, clientId),
        serviceIds,
        date: String(body.date || '') || addDays(todayISO(), 1), // default tomorrow, v1 jobs.js:121
        slot: String(body.slot || '10:00'),
        mins,
        techIds: techId ? [techId] : defaultCrew,
        crewNeed: 1,
        status: 'scheduled',
        priority,
        visitNo: 0,
        ofVisits: 0,
        notes: String(body.notes || '').trim(),
      } as never,
    });

    if (techId) {
      const cl = await this.prisma.client.findUnique({ where: { id: clientId } });
      await this.prisma.notification.create({
        data: {
          userId: techId, at: nowStamp(),
          text: `New service ${j.id} — ${cl?.name || clientId}, ${j.date} ${j.slot}.`,
        },
      });
    }
    return j;
  }

  /* ---------------------------------------------------------------- edit */
  @Patch(':id')
  @Roles('admin', 'ops', 'sales')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    return this.prisma.job.update({ where: { id }, data: pick(body) as never });
  }

  /* -------------------------------------------------------------- cancel */
  /**
   * Cancelling a service REMOVES it — from the schedule, the technicians'
   * days, the billing plan and the numbering. The contract sheds that
   * service's worth, the remaining services renumber so "service 4 of 12"
   * stays honest, and everyone assigned is told.
   */
  @Post(':id/cancel')
  @Roles('admin', 'ops', 'sales')
  async cancel(@Param('id') id: string) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (j.status === 'completed') throw new BadRequestException('Completed services cannot be cancelled');

    // What this service was worth: its services' per-visit rates, or an
    // equal share when the plan carries no rates.
    let worth = 0;
    let newValue: number | null = null;
    const c = j.contractId
      ? await this.prisma.contract.findUnique({ where: { id: j.contractId }, include: { plan: true } })
      : null;
    if (c) {
      worth = j.serviceIds.reduce((a, sv) => {
        const l = c.plan.find((x) => x.svId === sv);
        return a + Math.max(0, (l as { rate?: number } | undefined)?.rate || 0);
      }, 0);
      if (!worth && c.totalVisits > 0) worth = Math.round(c.value / c.totalVisits);
      newValue = Math.max(0, c.value - worth);
    }

    await this.prisma.job.delete({ where: { id } });

    if (c) {
      // renumber what remains so the schedule reads 1..N with no gaps
      const rest = await this.prisma.job.findMany({
        where: { contractId: c.id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }, { id: 'asc' }],
      });
      for (let i2 = 0; i2 < rest.length; i2++) {
        if (rest[i2].visitNo !== i2 + 1 || rest[i2].ofVisits !== rest.length) {
          await this.prisma.job.update({
            where: { id: rest[i2].id },
            data: { visitNo: i2 + 1, ofVisits: rest.length },
          });
        }
      }
      await this.prisma.contract.update({
        where: { id: c.id },
        data: { value: newValue ?? c.value, totalVisits: rest.length },
      });
    }

    // Off the technicians' days — and they hear about it immediately.
    const cl = await this.prisma.client.findUnique({ where: { id: j.clientId } });
    for (const t of j.techIds) {
      await this.prisma.notification.create({
        data: {
          userId: t, at: nowStamp(),
          text: `Cancelled: ${j.id} — ${cl?.name || j.clientId}, ${j.date} ${j.slot}. It is off your schedule.`,
        },
      });
    }
    return { id, removed: true, worth, newValue };
  }

  /* ------------------------------------------------------- assign toggle */
  // jobs.js:817-869 — click a tech: already on -> remove; else if the crew is
  // full the OLDEST pick makes way, then append. Never a wholesale replace.
  // Direct mutation: no pin, no snap. Notify only on add.
  @Post(':id/assign-toggle')
  @Roles('admin', 'ops', 'sales')
  async assignToggle(@Param('id') id: string, @Body() body: { techId?: string }) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (j.status === 'completed') throw new BadRequestException('Completed services cannot be reassigned');
    const techId = String(body.techId || '');
    if (!techId) throw new BadRequestException('Pick a technician');
    const tech = await this.prisma.user.findUnique({ where: { id: techId } });
    if (!tech || !isFieldTech(tech.role)) throw new BadRequestException('Not a technician');

    // How many people this visit wants: the stored crewNeed; a standalone job
    // keeps whatever size it already has (v1 store.js jobCrewSize).
    const need = j.contractId
      ? Math.max(1, j.crewNeed)
      : Math.max(1, j.crewNeed, j.techIds.length);

    const on = j.techIds.slice();
    const at = on.indexOf(techId);
    let action: 'added' | 'removed';
    if (at >= 0) {
      on.splice(at, 1);
      action = 'removed';
    } else {
      if (on.length >= need) on.shift(); // the oldest pick makes way
      on.push(techId);
      action = 'added';
    }

    // The head must always be someone who is actually on the job. Removing the
    // head hands it to whoever is left; the first person added becomes head
    // without being asked, which is the single-technician case.
    let head = j.headTechId;
    if (!on.includes(head)) head = on[0] || '';

    const job = await this.prisma.job.update({
      where: { id }, data: { techIds: on, headTechId: head },
    });
    if (action === 'added') {
      const cl = await this.prisma.client.findUnique({ where: { id: j.clientId } });
      await this.prisma.notification.create({
        data: {
          userId: techId, at: nowStamp(),
          text: `New service assigned: ${j.id} — ${cl?.name || j.clientId} on ${j.date} at ${j.slot}.`,
        },
      });
    }
    return { job, action, need, count: on.length, headTechId: head };
  }

  /**
   * Name the head of the crew. Everything about recording the service hangs
   * off this one field, so it is set deliberately rather than inferred.
   */
  @Post(':id/head')
  @Roles('admin', 'ops', 'sales')
  async setHead(@Param('id') id: string, @Body() body: { techId?: string }) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (j.status === 'completed') throw new BadRequestException('This service is already completed');
    const techId = String(body.techId || '');
    if (!techId) throw new BadRequestException('Pick a technician');
    if (!j.techIds.includes(techId)) {
      throw new BadRequestException('The head has to be one of the crew on this service');
    }
    const job = await this.prisma.job.update({ where: { id }, data: { headTechId: techId } });
    await this.prisma.notification.create({
      data: {
        userId: techId, at: nowStamp(),
        text: `You are leading service ${j.id} on ${j.date}. You record the work for this visit.`,
      },
    });
    return job;
  }

  /* ---------------------------------------------------------- reschedule */
  // jobs.js:870-889 — direct date/slot set, NO pin; hidden once completed.
  @Post(':id/reschedule')
  @Roles('admin', 'ops', 'sales')
  async reschedule(
    @Param('id') id: string,
    @Body() body: { date?: string; slot?: string; reason?: string },
  ) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (j.status === 'completed') throw new BadRequestException('Completed services cannot be rescheduled');

    const slot = String((body as { slot?: string }).slot || '') || j.slot;
    const slotEnd = String((body as { slotEnd?: string }).slotEnd || '') || j.slotEnd || '';
    if (slotEnd && toMin(slotEnd) <= toMin(slot)) {
      throw new BadRequestException('The time window ends before it starts');
    }
    // The booked window is what schedule and dispatch plan around, so the
    // service's duration follows it.
    const win = slotEnd ? toMin(slotEnd) - toMin(slot) : 0;
    const job = await this.prisma.job.update({
      where: { id },
      data: {
        date: String(body.date || '') || j.date,
        slot,
        slotEnd,
        ...(win > 0 ? { mins: win } : {}),
      },
    });
    const reason = String(body.reason || '').trim();
    const winText = job.slotEnd ? `${job.slot}\u2013${job.slotEnd}` : job.slot;
    await this.prisma.notification.create({
      data: {
        userId: '', at: nowStamp(),
        text: `${j.id} rescheduled to ${job.date}, ${winText}.` + (reason ? ' ' + reason : ''),
      },
    });
    return job;
  }

  /* ============================================= board placement (v1 store) */
  // Put a job on a crew at a time — v1 store.js:636-651 placeJob. Slot snaps
  // to 15 minutes, the crew is deduped and clamped, and the job is PINNED so
  // the plan engine never moves a hand placement. Returns {job, before} so
  // the board can offer an exact undo.

  @Post(':id/place')
  @Roles('admin', 'ops', 'sales')
  async place(
    @Param('id') id: string,
    @Body() body: { techIds?: string[]; date?: string; startMin?: number },
  ) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    const before = { date: j.date, slot: j.slot, techIds: j.techIds.slice(), pinned: j.pinned };

    const data: Record<string, unknown> = { pinned: true };
    if (body.date) data.date = String(body.date);
    if (body.startMin != null) {
      data.slot = toHHMM(Math.round(Number(body.startMin) / 15) * 15); // SNAP 15
    }
    if (Array.isArray(body.techIds)) {
      const need = j.contractId
        ? Math.max(1, j.crewNeed)
        : Math.max(1, j.crewNeed, j.techIds.length);
      const seen: string[] = [];
      for (const t of body.techIds.map(String)) {
        if (t && seen.indexOf(t) < 0) seen.push(t);
      }
      data.techIds = seen.slice(0, need);
    }
    const job = await this.prisma.job.update({ where: { id }, data: data as never });
    return { job, before };
  }

  // Take a job off everybody and hand it back to the plan — store.js:654-662.
  @Post(':id/unassign')
  @Roles('admin', 'ops', 'sales')
  async unassign(@Param('id') id: string) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    const before = { date: j.date, slot: j.slot, techIds: j.techIds.slice(), pinned: j.pinned };
    const job = await this.prisma.job.update({
      where: { id }, data: { techIds: [], pinned: false },
    });
    return { job, before };
  }

  // Exact undo of a place/unassign — store.js:851-857.
  @Post(':id/restore')
  @Roles('admin', 'ops', 'sales')
  async restore(
    @Param('id') id: string,
    @Body() body: { before?: { date?: string; slot?: string; techIds?: string[]; pinned?: boolean } },
  ) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    const b = body.before;
    if (!b) throw new BadRequestException('Nothing to restore');
    return this.prisma.job.update({
      where: { id },
      data: {
        date: String(b.date || j.date),
        slot: String(b.slot || j.slot),
        techIds: Array.isArray(b.techIds) ? b.techIds.map(String) : j.techIds,
        pinned: !!b.pinned,
      },
    });
  }

  /* ================================================== execution — status */

  // scheduled -> enroute. "I'm on my way" — jobs.js:684-690.
  @Post(':id/exec/travel')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async travel(@Param('id') id: string, @Req() req: AuthedRequest) {
    const j = await this.mustBeMine(id, req);
    if (j.status !== 'scheduled' && j.status !== 'enroute') {
      throw new BadRequestException('Travel starts from a scheduled service');
    }
    return this.prisma.job.update({ where: { id }, data: { status: 'enroute' } });
  }

  // Stamp checkinAt + geo; status (re)set to enroute — jobs.js:692-701.
  @Post(':id/exec/checkin')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async checkin(@Param('id') id: string, @Body() body: { geo?: string }, @Req() req: AuthedRequest) {
    const j = await this.mustBeMine(id, req);
    if (j.status !== 'scheduled' && j.status !== 'enroute') {
      throw new BadRequestException('Already past check-in');
    }
    const x = execOf(j);
    x.geo = String(body.geo || '') || geoFallback();
    x.checkinAt = nowStamp();
    return this.prisma.job.update({
      where: { id }, data: { status: 'enroute', exec: x as never },
    });
  }

  // enroute -> inprogress; the clock starts — jobs.js:703-707.
  @Post(':id/exec/start')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async start(@Param('id') id: string, @Req() req: AuthedRequest) {
    const j = await this.mustBeMine(id, req);
    if (j.status !== 'enroute') throw new BadRequestException('Check in at the site first');
    const x = execOf(j);
    if (!x.checkinAt) throw new BadRequestException('Check in at the site first');
    x.startedAt = nowStamp();
    return this.prisma.job.update({
      where: { id }, data: { status: 'inprogress', exec: x as never },
    });
  }

  /* ================================================ execution — evidence */

  @Post(':id/exec/photos')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async addPhoto(
    @Param('id') id: string,
    @Body() body: { kind?: string; dataUrl?: string },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const kind = body.kind === 'after' ? 'after' : body.kind === 'before' ? 'before' : null;
    if (!kind) throw new BadRequestException('kind must be before or after');
    const src = String(body.dataUrl || '');
    if (src.indexOf('data:image') !== 0) throw new BadRequestException('Send the photo as an image data URL');
    const x = execOf(j);
    (kind === 'before' ? x.photosBefore : x.photosAfter).push(src);
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  @Delete(':id/exec/photos')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async removePhoto(
    @Param('id') id: string,
    @Query('kind') kind?: string,
    @Query('index') index?: string,
  ) {
    const j = await this.mustBeLive(id);
    const x = execOf(j);
    const list = kind === 'after' ? x.photosAfter : x.photosBefore;
    const i = Number(index);
    if (!(i >= 0 && i < list.length)) throw new BadRequestException('No such photo');
    list.splice(i, 1);
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  // Recorded now, deducted from stock only at finish — jobs.js:709-717.
  @Post(':id/exec/chemicals')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async addChemical(
    @Param('id') id: string,
    @Body() body: { itemId?: string; qty?: number },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const qty = Number(body.qty) || 0;
    if (qty <= 0) throw new BadRequestException('Enter a quantity');
    const itemId = String(body.itemId || '');
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('No such inventory item');

    // Only what is in the recorder's hand can be used — consumption at
    // finish comes off the head's holding, so the cap is checked against the
    // same person, counting what this service has already recorded.
    const who = j.headTechId || req.user?.sub || '';
    const holding = await this.prisma.techStock.findUnique({
      where: { userId_itemId: { userId: who, itemId } },
    });
    const x = execOf(j);
    const alreadyRecorded = x.chemicals
      .filter((c) => c.id === itemId)
      .reduce((a, c) => a + c.qty, 0);
    const left = (holding?.qty || 0) - alreadyRecorded;
    if (qty > left) {
      throw new BadRequestException(left > 0
        ? `Only ${left} ${item.unit} of ${item.name} in hand — that is the most that can be recorded`
        : `${item.name} is not in your hand — the store has to issue it to you first`);
    }

    x.chemicals.push({ id: itemId, qty });
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  @Delete(':id/exec/chemicals/:index')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async removeChemical(@Param('id') id: string, @Param('index') index: string, @Req() req: AuthedRequest) {
    const j = await this.mustBeMine(id, req);
    const x = execOf(j);
    const i = Number(index);
    if (!(i >= 0 && i < x.chemicals.length)) throw new BadRequestException('No such entry');
    x.chemicals.splice(i, 1);
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  // Findings chips + free-text observations — jobs.js:657-671. The parity
  // surface names this PUT; PATCH is aliased because the web client speaks
  // get/post/patch/del only.
  @Put(':id/exec/findings')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  setFindingsPut(
    @Param('id') id: string,
    @Body() body: { findings?: string[]; observations?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.setFindings(id, body, req);
  }

  @Patch(':id/exec/findings')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async setFindings(
    @Param('id') id: string,
    @Body() body: { findings?: string[]; observations?: string },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const x = execOf(j);
    if (Array.isArray(body.findings)) {
      // exec.findings is a subset of the canonical catalogue
      x.findings = body.findings.map(String).filter((f) => FINDINGS_CATALOG.indexOf(f) >= 0);
    }
    if (typeof body.observations === 'string') x.observations = body.observations.trim();
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  // savesig — requires ink client-side and a non-empty name; rating defaults
  // to 5 when the stars were never tapped — jobs.js:719-733.
  /**
   * The uniform photo. Taken before the service can be entered, so it proves
   * he turned up dressed for the job — the whole point is that it is today's
   * photo, which is why the client sends a camera capture and never a file
   * from the gallery.
   */
  @Post(':id/exec/uniform')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async uniform(
    @Param('id') id: string,
    @Body() body: { dataUrl?: string },
    @Req() req: AuthedRequest,
  ) {
    // Everyone on the crew submits their own — this one is not head-only.
    const j = await this.mustBeLive(id);
    const me = { id: req.user?.sub || '', role: req.user?.role || '' };
    if (!isOffice(me.role) && !isOnCrew(me, j)) {
      throw new ForbiddenException('This service is not assigned to you');
    }
    const url = String(body.dataUrl || '');
    if (!url.startsWith('data:image/')) throw new BadRequestException('A photo is required');
    const x = execOf(j);
    x.uniformPhotos = { ...(x.uniformPhotos || {}), [me.id]: url };
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  /**
   * Mark where the site actually is. Only accepted from close enough to be
   * standing there — a pin dropped from the office is worse than no pin,
   * because every later visit would navigate to the wrong place.
   */
  @Post(':id/exec/site-geo')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async siteGeo(
    @Param('id') id: string,
    @Body() body: { lat?: number; lng?: number; acc?: number },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const acc = Number(body.acc) || 0;
    if (!isFinite(lat) || !isFinite(lng)) throw new BadRequestException('No location from the device');
    if (acc > SITE_GEO_ACCURACY_M) {
      throw new BadRequestException(
        'Location is only accurate to ' + Math.round(acc) + ' m — step outside and try again',
      );
    }
    const cl = await this.prisma.client.findUnique({ where: { id: j.clientId } });
    if (!cl) throw new NotFoundException('No such customer');
    if (cl.siteLat != null && cl.siteLng != null) {
      // Already marked. Re-marking a site is an office decision, not a field one.
      return { alreadySet: true, lat: cl.siteLat, lng: cl.siteLng };
    }
    const up = await this.prisma.client.update({
      where: { id: j.clientId },
      data: {
        siteLat: lat, siteLng: lng,
        siteGeoAt: new Date().toISOString(),
        siteGeoBy: req.user?.sub || '',
      },
    });
    return { alreadySet: false, lat: up.siteLat, lng: up.siteLng };
  }

  /** Area-wise findings and the technician's note. */
  @Patch(':id/exec/notes')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async setNotes(
    @Param('id') id: string,
    @Body() body: { areaFindings?: Array<{ area?: string; text?: string }>; techNotes?: string },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const x = execOf(j);
    if (Array.isArray(body.areaFindings)) {
      x.areaFindings = body.areaFindings
        .map((r) => ({ area: String(r.area || '').trim(), text: String(r.text || '').trim() }))
        .filter((r) => r.area || r.text);
    }
    if (typeof body.techNotes === 'string') x.techNotes = body.techNotes.trim();
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  @Post(':id/exec/signature')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async signature(
    @Param('id') id: string,
    @Body() body: { signedBy?: string; signatureImage?: string; rating?: number; observations?: string },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    const signedBy = String(body.signedBy || '').trim();
    if (!signedBy) throw new BadRequestException('Enter the name of the person signing');
    const x = execOf(j);
    x.signature = true;
    x.signedBy = signedBy;
    x.signatureImage = String(body.signatureImage || '');
    const r = Math.round(Number(body.rating) || 0);
    x.rating = r >= 1 && r <= 5 ? r : 5;
    if (typeof body.observations === 'string') x.observations = body.observations.trim();
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  // Resign: clears signature/signedBy/rating, status untouched — jobs.js:720.
  @Delete(':id/exec/signature')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async resign(@Param('id') id: string) {
    const j = await this.mustBeLive(id);
    const x = execOf(j);
    x.signature = false;
    x.signedBy = '';
    x.signatureImage = '';
    x.rating = 0;
    return this.prisma.job.update({ where: { id }, data: { exec: x as never } });
  }

  /* ================================================== execution — finish */
  // Requires >=1 after photo AND the signature. Stamps finishedAt, computes
  // durationMins (floor 1), completes the job and atomically consumes stock:
  // stock floor 0 + one 'Consumed' StockMove per chemical — jobs.js:736-777,
  // store.js:1394-1407.
  /**
   * What the technician's screen says about money for this visit, and the
   * visit invoice to collect against when the contract bills per visit.
   */
  /** Same-contract services scheduled on the same date — one trip, listed together. */
  private async tripSiblings(job: { id: string; contractId: string; date: string }) {
    if (!job.contractId) return [];
    const sibs = await this.prisma.job.findMany({
      where: { contractId: job.contractId, date: job.date, NOT: { id: job.id }, status: { not: 'cancelled' } },
      orderBy: { slot: 'asc' },
    });
    if (!sibs.length) return [];
    const [svcs, ct] = await Promise.all([
      this.prisma.service.findMany({ select: { id: true, name: true } }),
      this.prisma.contract.findUnique({ where: { id: job.contractId }, include: { plan: true } }),
    ]);
    const nameOf = new Map(svcs.map((x) => [x.id, x.name]));
    return sibs.map((sj) => ({
      id: sj.id,
      status: sj.status,
      services: sj.serviceIds.map((x) => nameOf.get(x) || x).join(', '),
      amount: sj.serviceIds.reduce((a, sid) =>
        a + Math.max(0, (ct?.plan.find((l) => l.svId === sid) as { rate?: number } | undefined)?.rate || 0), 0),
    }));
  }

  @Get(':id/billing')
  async jobBilling(@Param('id') id: string, @Req() req?: AuthedRequest) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('No such job');

    // The technician sees the invoice only once "Finish service & send
    // report" is pressed — that click is what raises/links it. The office
    // sees it whenever it exists.
    const hideFromTech = isFieldTech(req?.user?.role) && job.status !== 'completed';

    const inv = hideFromTech ? null : await this.prisma.invoice.findFirst({
      where: { jobId: id }, include: { payments: true },
    });
    let invoice: { id: string; total: number; paid: number; balance: number } | null = null;
    if (inv) {
      const co = await this.prisma.company.findFirst();
      const items = (Array.isArray(inv.items) ? inv.items : []) as unknown as Array<{ qty?: number; rate?: number }>;
      const t = docTotals(items, inv.discount, inv.placeOfSupply, co?.state || 'Tamil Nadu', co?.gstRate || 18);
      const paid = inv.payments.reduce((a, x) => a + x.amount, 0);
      invoice = { id: inv.id, total: Math.round(t.total), paid, balance: Math.max(0, Math.round(t.total - paid)) };
    }

    if (!job.contractId) {
      return {
        mode: 'onetime',
        note: invoice
          ? 'Collect and record the payment against the invoice'
          : 'The invoice is raised the moment the service is finished',
        amount: invoice?.total || 0, invoice, trip: [],
      };
    }

    const ct = await this.prisma.contract.findUnique({
      where: { id: job.contractId }, include: { plan: true },
    });
    if (!ct) return { mode: 'onetime', note: '', amount: 0, invoice, trip: [] };
    const mode = (ct as { billingMode?: string }).billingMode || 'interval';

    let amount = 0;
    if (mode === 'pervisit') {
      amount = job.serviceIds.reduce(
        (a, sid) => a + ((ct.plan.find((l) => l.svId === sid) as { rate?: number } | undefined)?.rate || 0), 0);
      if (!amount) amount = Math.round((ct.value || 0) / Math.max(1, ct.totalVisits || 1));
    }

    // The rest of this trip: same contract, same date — the technician does
    // them in the one visit, each billed as its own service.
    const trip = await this.tripSiblings(job);
    return { mode, note: collectionNote(mode, amount || undefined), amount, invoice, trip };
  }

  @Post(':id/exec/finish')
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async finish(
    @Param('id') id: string,
    @Body() body: { observations?: string },
    @Req() req: AuthedRequest,
  ) {
    const j = await this.mustBeMine(id, req);
    if (j.status !== 'inprogress') throw new BadRequestException('Start the work before finishing it');
    const x = execOf(j);
    if (!x.photosAfter.length || !x.signature) {
      throw new BadRequestException('Add after-photos and the customer signature first');
    }
    if (typeof body.observations === 'string') x.observations = body.observations.trim();
    x.finishedAt = nowStamp();
    x.durationMins = minutesBetween(x.startedAt, x.finishedAt) || 1;

    const items = x.chemicals.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: x.chemicals.map((c) => c.id) } },
        })
      : [];

    const jobUpdate = this.prisma.job.update({
      where: { id }, data: { status: 'completed', exec: x as never },
    });
    /*
     * What was used comes off the TECHNICIAN'S holding, not the store. The
     * store was already debited when the stock was issued into his hands, so
     * taking it off again here would count the same litre twice.
     *
     * A holding is allowed to go negative: he records what he actually used,
     * and the office reconciles. Blocking it would only teach him to
     * under-report, which is the one outcome worse than a wrong number.
     */
    const who = j.headTechId || req.user?.sub || '';
    const stockOps: Prisma.PrismaPromise<unknown>[] = [];
    let issueNo = await this.nextIssueSeq();
    for (const c of x.chemicals) {
      const it = items.find((i) => i.id === c.id);
      if (!it) continue;
      const qty = Math.max(1, Math.round(c.qty));
      stockOps.push(
        this.prisma.techStock.upsert({
          where: { userId_itemId: { userId: who, itemId: it.id } },
          create: { userId: who, itemId: it.id, qty: -qty },
          update: { qty: { decrement: qty } },
        }),
        this.prisma.stockIssue.create({
          data: {
            id: 'ISS-' + issueNo++,
            userId: who, issuedBy: who, itemId: it.id, qty, dir: 'out',
            jobId: id, note: 'Used on ' + id,
          },
        }),
        this.prisma.stockMove.create({
          data: {
            itemId: it.id, date: todayISO(), qty, dir: 'out',
            jobId: id, note: 'Consumed · by ' + who,
          },
        }),
      );
    }
    const [job] = await this.prisma.$transaction([jobUpdate, ...stockOps]);

    // The finish click is what raises the service's invoice — and the answer
    // the technician sees. If the office raised it earlier (any screen, any
    // criteria), that one is reported as "already created" — never a second.
    let billing: { invoiceId: string; existed: boolean; planBilled: boolean } | null = null;
    const already = await this.prisma.invoice.findFirst({ where: { jobId: job.id } });
    if (already) {
      billing = { invoiceId: already.id, existed: true, planBilled: false };
    } else if (job.contractId) {
      const ct = await this.prisma.contract.findUnique({
        where: { id: job.contractId }, include: { plan: true },
      });
      if (ct && (ct as { billingMode?: string }).billingMode === 'pervisit') {
        // Per-visit billing: the completed visit raises its own invoice, once.
        // The technician collects on site; unpaid, it rides forward as arrears.
        const svcs = await this.prisma.service.findMany({
          where: { id: { in: job.serviceIds } }, select: { id: true, name: true },
        });
        let lines = job.serviceIds.map((sid) => ({
          desc: (svcs.find((sv) => sv.id === sid)?.name || sid) +
            (job.visitNo ? ' — visit ' + job.visitNo + ' of ' + job.ofVisits : ''),
          qty: 1,
          rate: (ct.plan.find((l) => l.svId === sid) as { rate?: number } | undefined)?.rate || 0,
        }));
        let sum = lines.reduce((a, l) => a + l.rate, 0);
        if (sum <= 0) {
          const per = Math.round((ct.value || 0) / Math.max(1, ct.totalVisits || 1));
          lines = [{ desc: 'Service ' + job.id, qty: 1, rate: per }];
          sum = per;
        }
        if (sum > 0) {
          const made = await this.prisma.invoice.create({
            data: {
              id: await mintInvoiceId(this.prisma),
              clientId: job.clientId,
              contractId: ct.id,
              branch: job.branch || ct.branch || '',
              kind: 'visit',
              jobId: job.id,
              date: todayISO(),
              due: addDays(todayISO(), 15),
              period: 'Visit ' + job.id,
              status: 'sent',
              placeOfSupply: ct.placeOfSupply || '',
              items: lines as never,
            },
          });
          billing = { invoiceId: made.id, existed: false, planBilled: false };
        }
      } else if (ct) {
        // MRR / upfront: the billing plan owns the invoices. Make sure
        // anything due by today exists, and tell the technician it is
        // plan-billed rather than per-service.
        await raiseDueBilling(this.prisma, ct.id).catch(() => {});
        billing = { invoiceId: '', existed: false, planBilled: true };
      }
    } else {
      // Standalone booking: finishing IS the billing moment — one invoice
      // from the catalogue rates of what was done.
      const svcs = await this.prisma.service.findMany({
        where: { id: { in: job.serviceIds } }, select: { id: true, name: true, price: true },
      });
      const lines = job.serviceIds.map((sid) => {
        const sv = svcs.find((s) => s.id === sid);
        return { desc: sv?.name || sid, qty: 1, rate: sv?.price || 0 };
      });
      if (lines.reduce((a, l) => a + l.rate, 0) > 0) {
        const made = await this.prisma.invoice.create({
          data: {
            id: await mintInvoiceId(this.prisma),
            clientId: job.clientId,
            contractId: '',
            branch: job.branch || '',
            kind: 'visit',
            jobId: job.id,
            date: todayISO(),
            due: addDays(todayISO(), 15),
            period: 'Service ' + job.id,
            status: 'sent',
            items: lines as never,
          },
        });
        billing = { invoiceId: made.id, existed: false, planBilled: false };
      }
    }

    /*
     * The report goes out on completion — to the office, and recorded against
     * the customer. A report is the thing a customer quotes back months later,
     * so who did it and when is stamped on it rather than inferred from the
     * job row, which can be edited afterwards.
     */
    const [cust, crew, admins] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: j.clientId } }),
      this.prisma.user.findMany({ where: { id: { in: j.techIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({
        where: { role: { in: ['admin', 'ops'] }, active: true }, select: { id: true },
      }),
    ]);
    const headName = crew.find((c) => c.id === who)?.name || 'the technician';
    const stamp = nowStamp();
    const line =
      `Service ${j.id} completed at ${cust?.name || j.clientId} — ` +
      `${x.durationMins} min on site, by ${headName}` +
      (crew.length > 1 ? ` with ${crew.length - 1} more` : '') +
      `. Report sent ${stamp}.`;

    await this.prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, at: stamp, text: line })),
    });

    // The send itself, stamped onto the record so it is provable later.
    x.reportSentAt = stamp;
    x.reportSentTo = [cust?.email || cust?.phone || j.clientId, 'office'].filter(Boolean).join(', ');
    x.reportBy = who;
    await this.prisma.job.update({ where: { id }, data: { exec: x as never } });

    return {
      job,
      billing,
      summary: {
        photos: x.photosBefore.length + x.photosAfter.length,
        chemicals: x.chemicals.length,
        rating: x.rating || 5,
        durationMins: x.durationMins,
        reportSentAt: stamp,
        reportSentTo: x.reportSentTo,
      },
    };
  }

  /* --------------------------------------------------------------- guard */
  /** Next free ISS- number, so a batch of consumptions can be numbered in one go. */
  private async nextIssueSeq() {
    const rows = await this.prisma.stockIssue.findMany({ select: { id: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number(String(r.id).replace('ISS-', '')) || 0), 0);
    return max + 1;
  }

  private async mustBeLive(id: string) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('No such service');
    if (j.status === 'completed') throw new BadRequestException('This service is already completed');
    if (j.status === 'cancelled') throw new BadRequestException('This service was cancelled');
    return j;
  }

  /**
   * The service is live AND this person may write to it.
   *
   * Hiding a button is not a permission model — a crew member with the URL
   * would otherwise be able to sign off a job that is not his to sign off.
   * The office may always record; a technician may only record the service
   * he is head of.
   */
  private async mustBeMine(id: string, req: AuthedRequest) {
    const j = await this.mustBeLive(id);
    const user = { id: req.user?.sub || '', role: req.user?.role || '' };
    if (canRecordService(user, j)) return j;
    if (isOnCrew(user, j)) {
      throw new ForbiddenException(
        'Only the head of this service records the work. You can start your trip and see the checklist.',
      );
    }
    throw new ForbiddenException('This service is not assigned to you');
  }
}
