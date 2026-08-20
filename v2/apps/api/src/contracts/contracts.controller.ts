/* ============================================================================
   Contracts — AMC + one-time, the heart of the product.

   A contract carries a service plan; the plan generates every dated visit as
   a Job row. The rules are ported 1:1 from v1 (amcform.js, contracts.js,
   store.js): qty means VISITS on an AMC line and UNITS SOLD on a one-time
   line (forcing it to 1 billed a 12-bedroom job as one bedroom — the money
   bug), same-day services merge into one trip, done/under-way/hand-placed
   visits are frozen against the engine, and a signed contract is the only
   thing that ever marks a lead won.
   ========================================================================== */

import { ConflictException,
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';
import { billingPlan,
  addDays, addMonths, cadenceLabel, dayOfMonth, daysBetween, docTotals, lineCrew,
  peakCrew, planVisits, staffing, toMin, toHHMM,
  type ContractInput, type VisitPlan,
} from 'shared';
import { raiseDueBilling } from '../billing.util';
import {
  contractStatus, contractToInput, dayDelta, fmtDate, lineToInput, nowStamp,
  phoneKey, planDiff, planSummary, planWarnings, syncCrew, todayISO,
  type DbPlanLine,
} from './plan';

/* ---------------------------------------------------------------- payloads */

interface DraftLine {
  svId: string;
  desc?: string;
  rate?: number;
  qty?: number;    // AMC: visits sold. One-time: units sold. Amount = qty × rate.
  months?: number; // 0 = the whole contract term
  startAt?: string;
  slot?: string;
  slotEnd?: string; // booked window end for every service this line makes
  crew?: number;
  dates?: string[]; // hand-picked visit dates by index; '' = automatic
}

interface ContractDraft {
  mode?: string;
  billingMode?: string; // upfront | pervisit | interval
  billing?: string;     // interval cycle: Monthly / Quarterly / Half-Yearly / Yearly
  no?: string;
  clientId?: string;
  branch?: string;
  owner?: string;
  refNo?: string;
  placeOfSupply?: string;
  billAddr?: string;
  siteAddr?: string;
  billingAmount?: number; // MRR: fixed monthly amount, 0 = automatic
  discount?: number;
  start?: string;
  end?: string;
  slot?: string;
  slotEnd?: string;
  subject?: string;
  notes?: string;
  terms?: string[];
  signCustomer?: string;
  signExec?: string;
  quoteId?: string;
  leadId?: string;
  lines?: DraftLine[];
}

interface PlanEditLine {
  svId: string;
  visits?: number;
  months?: number;
  mins?: number;
  dayRule?: string;
  startAt?: string;
  slot?: string;
  crew?: number;
  techIds?: string[];
}

interface PlanEditBody {
  plan?: PlanEditLine[];
  mergeSameDay?: boolean;
  workdaysOnly?: boolean;
}

const PATCHABLE = [
  'notes', 'scope', 'billing', 'refNo', 'placeOfSupply', 'terms',
  'slot', 'slotEnd', 'mergeSameDay', 'workdaysOnly', 'blackout',
  // the full-contract edit screen
  'billAddr', 'site', 'billingMode', 'owner', 'branch', 'end', 'billingAmount',
] as const;

const FALLBACK_TERMS = [
  'Services will be performed as per the scheduled appointments.',
  'Customer must provide access to all areas requiring treatment.',
  'Payment is due within 30 days of invoice date.',
  '24-hour advance notice required for rescheduling.',
  'Service warranty valid for 30 days after each treatment.',
];

function addMinsHHMM(hhmm: string, mins: number): string {
  return toHHMM((toMin(hhmm) + mins) % 1440);
}

@Controller('contracts')
@UseGuards(AuthGuard)
export class ContractsController {
  constructor(private prisma: PrismaService) {}

  /* -------------------------------------------------------------- sequences */

  /** Mint n ids off a named counter; returns the last value taken. */
  private async takeSeq(key: string, n = 1): Promise<number> {
    const base: Record<string, number> = { job: 1000, quote: 1000, invoice: 1000, receipt: 100, lead: 1000 };
    const row = await this.prisma.seq.upsert({
      where: { key },
      create: { key, value: (base[key] || 0) + n },
      update: { value: { increment: n } },
    });
    return row.value;
  }

  private async company() {
    const co = await this.prisma.company.findFirst();
    return {
      homeState: co?.state || 'Tamil Nadu',
      gstRate: co?.gstRate || 18,
      terms: co?.terms?.length ? co.terms : FALLBACK_TERMS,
    };
  }

  /* ------------------------------------------------------------------ list */

  /**
   * Everything sold, in one shape — contracts plus every contract-less job as
   * a synthetic one-time row (v1 contracts.js everything()). Leaving the
   * stand-alone bookings out made the One-time tab read zero while the
   * module showed sixty.
   */
  @Get()
  async list(@Req() req: { user?: { sub?: string; role?: string } }, @Query('branch') branch?: string) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [contracts, jobs, clients, services] = await Promise.all([
      this.prisma.contract.findMany({
        where: branchWhere(scope),
        include: { plan: { orderBy: { order: 'asc' } } },
      }),
      this.prisma.job.findMany(),
      this.prisma.client.findMany(),
      this.prisma.service.findMany(),
    ]);
    const clientOf: Record<string, (typeof clients)[number]> = {};
    for (const c of clients) clientOf[c.id] = c;
    const svcOf: Record<string, (typeof services)[number]> = {};
    for (const s of services) svcOf[s.id] = s;

    const byContract: Record<string, typeof jobs> = {};
    for (const j of jobs) {
      if (!j.contractId) continue;
      (byContract[j.contractId] = byContract[j.contractId] || []).push(j);
    }

    const rows = contracts.map((c) => {
      const one = c.mode === 'onetime';
      const cj = (byContract[c.id] || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      const done = cj.filter((j) => j.status === 'completed').length;
      const total = c.totalVisits || cj.length || 1;
      const st = contractStatus(c.end);
      const next = cj.filter((j) => j.status !== 'completed' && dayDelta(j.date) >= 0)[0];
      const cl = clientOf[c.clientId];
      const svIds: string[] = [];
      for (const l of c.plan) if (svIds.indexOf(l.svId) < 0) svIds.push(l.svId);
      const staff = c.plan.length ? staffing(c.plan.map(lineToInput)) : null;
      const firstTech = c.plan.map((l) => lineCrew(lineToInput(l))[0]).filter(Boolean)[0] || '';
      return {
        key: c.id, one, standalone: false,
        clientId: c.clientId,
        clientName: cl?.name || '—', clientCity: cl?.city || '', clientColor: cl?.color || '',
        techId: firstTech,
        shortCrew: staff ? staff.missing : 0,
        services: svIds.map((id) => ({ id, code: svcOf[id]?.code || id, name: svcOf[id]?.name || id })),
        start: c.start, end: c.end, slot: c.slot,
        planText: one ? '' : planSummary(c.plan as DbPlanLine[], c.freq, true, (id) => svcOf[id]?.code || id),
        done, total, pct: Math.min(100, Math.round((done / total) * 100)),
        value: c.value || 0,
        totalVisits: c.totalVisits || 0,
        statusKey: one ? (done >= total ? 'done' : 'booked') : st.key,
        statusLabel: one ? (done >= total ? 'Done' : 'Booked') : st.label,
        next: next ? next.date : '',
      };
    });

    const JOB_LABEL: Record<string, string> = {
      scheduled: 'Scheduled', enroute: 'En route', inprogress: 'In progress',
      completed: 'Completed', cancelled: 'Cancelled',
    };
    for (const j of jobs) {
      if (j.contractId) continue;
      const done = j.status === 'completed';
      const cl = clientOf[j.clientId];
      rows.push({
        key: j.id, one: true, standalone: true,
        clientId: j.clientId,
        clientName: cl?.name || '—', clientCity: cl?.city || '', clientColor: cl?.color || '',
        techId: (j.techIds || [])[0] || '',
        shortCrew: 0,
        services: (j.serviceIds || []).map((id) => ({
          id, code: svcOf[id]?.code || id, name: svcOf[id]?.name || id,
        })),
        start: j.date, end: j.date, slot: j.slot,
        planText: '',
        done: done ? 1 : 0, total: 1, pct: done ? 100 : 0,
        value: (j.serviceIds || []).reduce((a, id) => a + (svcOf[id]?.price || 0), 0),
        totalVisits: 0,
        statusKey: done ? 'done' : j.status === 'cancelled' ? 'expired' : 'booked',
        statusLabel: done ? 'Done' : JOB_LABEL[j.status] || 'Booked',
        next: done ? '' : j.date,
      });
    }

    return rows;
  }

  /* ------------------------------------------------------ the next number */

  @Get('next-number')
  async nextNumber(@Query('mode') mode?: string) {
    const seq = await this.prisma.seq.findUnique({ where: { key: 'contract' } });
    const prefix = mode === 'onetime' ? 'OTS-' : 'AMC-';
    return {
      no: prefix + new Date().getFullYear() + '-' +
        String((seq?.value || 0) + 1).padStart(2, '0'),
    };
  }

  /* -------------------------------------------------------- quote → draft */

  /**
   * A quotation carried across, ready to edit — everything commercial is
   * already agreed, so the contract starts as a copy of it and only the
   * schedule is new work. A quote raised on a lead has no customer yet, so
   * the lead is promoted first, exactly as v1 amcform.applyQuote did.
   */
  @Get('from-quote/:quoteId')
  @Roles('admin', 'ops', 'sales')
  async fromQuote(@Param('quoteId') quoteId: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!q) throw new NotFoundException('No such quotation');
    if (q.contractId) throw new BadRequestException('Already converted to ' + q.contractId);

    const one = q.mode === 'onetime';
    let clientId = q.clientId;

    if (!clientId && q.leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: q.leadId } });
      if (l) {
        const key = phoneKey(l.phone);
        const known = key
          ? (await this.prisma.client.findMany()).find((c) => phoneKey(c.phone) === key)
          : undefined;
        if (known) clientId = known.id;
        else {
          const v = await this.takeSeq('client');
          clientId = 'CL-' + String(v).padStart(3, '0');
          await this.prisma.client.create({
            data: {
              id: clientId, name: l.name, type: l.type, contact: l.name,
              phone: l.phone, email: l.email || '', addr: l.area || '',
              city: 'Chennai', since: todayISO(), color: '#0B7454', area: '—',
            },
          });
        }
        await this.prisma.lead.update({
          where: { id: l.id },
          data: { clientId, ...(l.stage !== 'won' ? { stage: 'contract' as const } : {}) },
        });
      }
    }

    const start = todayISO();
    const { no } = await this.nextNumber(q.mode);
    const co = await this.company();

    const draft: ContractDraft = {
      mode: q.mode,
      no,
      clientId: clientId || '',
      quoteId: q.id,
      leadId: q.leadId || '',
      subject: q.title || '',
      branch: q.branch || '',
      owner: q.owner || '',
      terms: q.terms?.length ? q.terms : co.terms,
      refNo: q.refNo || '',
      placeOfSupply: q.placeOfSupply || '',
      billAddr: String(q.billAddr || ''),
      siteAddr: String(q.shipAddr || ''),
      discount: q.discount || 0,
      notes: q.notes || '',
      signCustomer: q.signCustomer || '',
      signExec: q.signExec || '',
      start,
      // One-time: the agreed window is the quotation's own from-until —
      // its date through its valid-till (15 days). Never before the start.
      end: one
        ? (() => { const till = addDays(String(q.date || start), 15); return till >= start ? till : start; })()
        : addMonths(start, q.months || 12),
      slot: '10:00',
      slotEnd: '12:00',
      lines: q.items.filter((i) => i.svId).map((i) => ({
        svId: i.svId,
        desc: i.desc || '',
        rate: i.rate || 0,
        // AMC: the visit count the customer agreed to; one-time: the units
        // sold — bedrooms, tanks, square feet. Forcing it to 1 billed a
        // 12-bedroom job as one bedroom (THE money bug).
        qty: one ? Math.max(1, i.qty || 1) : Math.max(1, i.visits || i.qty || 1),
        // A line quoted over 6 months runs for 6, even in a 12-month contract.
        months: one ? 0 : i.months || 0,
        startAt: start,
        slot: '10:00',
        slotEnd: '12:00',
        crew: 1,
      })),
    };
    return { draft };
  }

  /** One-shot conversion — the prefilled draft created as-is (plus overrides). */
  @Post('from-quote/:quoteId')
  @Roles('admin', 'ops', 'sales')
  async convertQuote(
    @Param('quoteId') quoteId: string,
    @Body() body: ContractDraft,
    @Req() req: { user: { sub?: string; id?: string } },
  ) {
    // A quotation becomes a contract only once BOTH sides have accepted it —
    // our sign-off and the customer's. Same two-handed rule as signatures.
    const gate = await this.prisma.quotation.findUnique({ where: { id: quoteId } });
    if (!gate) throw new NotFoundException('No such quotation');
    if (gate.status !== 'approved' || !gate.approvedBy) {
      const missing = [
        gate.approvedBy ? '' : 'our acceptance',
        gate.status === 'approved' ? '' : "the customer's acceptance",
      ].filter(Boolean).join(' and ');
      throw new ConflictException('Not yet accepted: needs ' + missing + '.');
    }

    const { draft } = await this.fromQuote(quoteId);
    return this.createContract({ ...draft, ...body, quoteId, lines: body.lines?.length ? body.lines : draft.lines },
      req.user?.sub || req.user?.id || '');
  }

  /* ---------------------------------------------------------------- detail */

  @Get(':id')
  async one(@Param('id') id: string, @Req() req?: { user?: { sub?: string; role?: string } }) {
    // Anything the billing plan says is due by today gets raised on sight.
    await raiseDueBilling(this.prisma, id).catch(() => {});

    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');
    if (req && !inScope(await branchScope(this.prisma, req.user), c.branch)) {
      throw new NotFoundException('No such contract');
    }

    const [client, jobs, invoices, allOpenJobs, co, services, standaloneOpen] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: c.clientId } }),
      this.prisma.job.findMany({ where: { contractId: id } }),
      this.prisma.invoice.findMany({
        where: { contractId: id, status: { not: 'cancelled' } }, include: { payments: true },
      }),
      this.prisma.job.findMany({ where: { status: { not: 'completed' } }, select: { techIds: true } }),
      this.company(),
      this.prisma.service.findMany({ select: { id: true, code: true } }),
      // The customer's own one-off visits with nobody on them — the contract
      // crew does NOT cover these automatically, so the page must say so.
      this.prisma.job.findMany({
        where: {
          clientId: c.clientId, contractId: '',
          status: { in: ['scheduled', 'enroute'] }, techIds: { isEmpty: true },
        },
        select: { id: true, date: true, slot: true, serviceIds: true, type: true, crewNeed: true },
        orderBy: { date: 'asc' },
      }),
    ]);
    const codeOf: Record<string, string> = {};
    for (const s of services) codeOf[s.id] = s.code || s.id;

    // Deterministic order: date, then time, then the service number — so the
    // list always reads 1, 2, 3… even when two services share a trip.
    const sorted = jobs.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.slot !== b.slot) return a.slot < b.slot ? -1 : 1;
      if ((a.visitNo || 0) !== (b.visitNo || 0)) return (a.visitNo || 0) - (b.visitNo || 0);
      return a.id < b.id ? -1 : 1;
    });
    const done = sorted.filter((j) => j.status === 'completed').length;
    const total = c.totalVisits || sorted.length || 1;

    const lines = c.plan.map(lineToInput);
    const staff = staffing(lines);
    const visits = c.plan.length ? planVisits(contractToInput(c, c.plan as DbPlanLine[])) : [];
    const peak = c.plan.length ? peakCrew(lines, visits) : 0;

    // How loaded each technician is right now — feeds the assign dialog chips.
    const openJobsByTech: Record<string, number> = {};
    for (const j of allOpenJobs) {
      for (const t of j.techIds) openJobsByTech[t] = (openJobsByTech[t] || 0) + 1;
    }

    // Billed to date / collected — v1 contracts.js:707-709.
    const bills = invoices.map((inv) => {
      const items = inv.items as Array<{ qty?: number; rate?: number }>;
      const t = docTotals(items || [], 0, inv.placeOfSupply || c.placeOfSupply, co.homeState, co.gstRate);
      const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
      const balance = Math.max(0, t.total - paid);
      const status = balance <= 0.5 ? 'paid' : paid > 0 ? 'partial'
        : dayDelta(inv.due) < 0 ? 'overdue' : 'unpaid';
      return {
        id: inv.id, date: inv.date, period: inv.period, total: t.total, paid, status,
        kind: (inv as { kind?: string }).kind || 'manual',
        seq: (inv as { seq?: number }).seq || 0,
        jobId: (inv as { jobId?: string }).jobId || '',
      };
    });

    // The whole money story in one table: what SHOULD be invoiced (the pure
    // billing plan) against what HAS been — and the arrears that carry
    // forward instead of ever stopping service.
    const cMode = (c as { billingMode?: string }).billingMode || 'interval';
    const bplanRows = billingPlan({
      id: c.id, start: c.start, end: c.end, months: c.months,
      value: c.value, billingAmount: (c as { billingAmount?: number }).billingAmount || 0, billing: c.billing, billingMode: cMode,
      slot: c.slot, mergeSameDay: c.mergeSameDay, workdaysOnly: c.workdaysOnly,
      blackout: c.blackout,
      plan: c.plan.map((l) => ({ ...lineToInput(l), rate: (l as { rate?: number }).rate || 0 })),
    });
    const jobByRef: Record<string, string> = {};
    for (const j of sorted) jobByRef[j.date + '|' + j.slot] = j.id;
    let billingRows = bplanRows.map((r) => {
      const match = cMode === 'pervisit'
        ? bills.find((b) => b.kind === 'visit' && b.jobId === (r.jobRef ? jobByRef[r.jobRef] || '' : ''))
        : bills.find((b) => (b.kind === 'upfront' || b.kind === 'interval') && b.seq === r.seq);
      return { ...r, invoice: match || null };
    });
    if (cMode === 'pervisit') {
      // Per-service billing is read straight off the REAL schedule — one row
      // per live service, priced by its services' rates, so the plan and the
      // schedule can never disagree. Cancelled/removed services simply are
      // not here; the last row absorbs rounding so the sum stays the value.
      const rateOf: Record<string, number> = {};
      for (const l of c.plan) rateOf[l.svId] = (l as { rate?: number }).rate || 0;
      const live = sorted.filter((jx) => jx.status !== 'cancelled');
      const jobRows = live.map((jx, i) => {
        let amount = jx.serviceIds.reduce((a, sv) => a + Math.max(0, rateOf[sv] || 0), 0);
        if (!amount && live.length) amount = Math.round(c.value / live.length);
        return {
          seq: i + 1,
          due: jx.date,
          label: 'Service ' + (i + 1) + ' of ' + live.length +
            (jx.serviceIds.length > 1 ? ' (' + jx.serviceIds.length + ' services, one trip)' : '') +
            ' — collected on site',
          amount,
          jobRef: '',
          invoice: bills.find((b) => b.kind === 'visit' && b.jobId === jx.id) || null,
        };
      });
      const sum = jobRows.reduce((a, r) => a + r.amount, 0);
      const drift = c.value - sum;
      if (jobRows.length && drift) {
        const last = jobRows[jobRows.length - 1];
        jobRows[jobRows.length - 1] = { ...last, amount: Math.max(0, last.amount + drift) };
      }
      billingRows = jobRows as unknown as typeof billingRows;
    }
    const arrears = bills.reduce((a, b) => a + Math.max(0, b.total - b.paid), 0);

    return {
      ...c,
      client,
      jobs: sorted,
      progress: { done, total, pct: Math.min(100, Math.round((done / total) * 100)) },
      status: contractStatus(c.end),
      daysLeft: dayDelta(c.end),
      staffing: staff,
      peakCrew: peak,
      planSummaryText: planSummary(c.plan as DbPlanLine[], c.freq, false, (sv) => codeOf[sv] || sv),
      openJobsByTech,
      standaloneOpen,
      billingRows,
      arrears: Math.round(arrears),
      invoices: bills,
      billed: bills.reduce((a, b) => a + b.total, 0),
      collected: bills.reduce((a, b) => a + b.paid, 0),
      // How much of the work has actually been charged for. A contract billed
      // past its own value used to be invisible until someone added the
      // invoices up by hand — see INVOICING.md §1.
      servicesBilled: jobs.filter((j) => j.invoiceId).length,
      servicesTotal: jobs.length,
    };
  }

  /* ---------------------------------------------------------------- create */

  @Post()
  @Roles('admin', 'ops', 'sales')
  async create(@Body() body: ContractDraft, @Req() req: { user: { sub?: string; id?: string } }) {
    return this.createContract(body, req.user?.sub || req.user?.id || '');
  }

  /**
   * The unified form's save — contract + plan + every dated visit, then the
   * loop closed on the quotation and the lead. Ported from amcform.js create().
   */
  private async createContract(draft: ContractDraft, byUserId: string) {
    const isOne = draft.mode === 'onetime';
    const mode = isOne ? 'onetime' : 'amc';

    /* ------------------------------------------------------- validation */
    const client = draft.clientId
      ? await this.prisma.client.findUnique({ where: { id: draft.clientId } })
      : null;
    if (!client) throw new BadRequestException('Pick a customer');
    const subject = String(draft.subject || '').trim();
    if (!subject) throw new BadRequestException('A subject is required — it is what the customer sees on the contract');
    const lines = (draft.lines || []).filter((l) => l.svId);
    if (!lines.length) throw new BadRequestException('Add at least one service');

    const start = draft.start || todayISO();
    let end: string;
    let slot = draft.slot || '10:00';
    let slotEnd = '';
    if (isOne) {
      if (!draft.start) throw new BadRequestException('Pick a service date');
      if (!draft.slot) throw new BadRequestException('Pick a service time — it is what puts it on the calendar');
      if (draft.slotEnd && toMin(draft.slotEnd) <= toMin(draft.slot)) {
        throw new BadRequestException('The time window ends before it starts');
      }
      // The visit lands on the start date; the agreement can cover a longer
      // window (fetched from the quotation's validity when converted).
      end = draft.end && draft.end >= start ? draft.end : start;
      slotEnd = draft.slotEnd || addMinsHHMM(slot, 120);
    } else {
      end = draft.end || addMonths(start, 12);
      if (daysBetween(start, end) < 28) {
        throw new BadRequestException('The service period is too short — give it at least a month');
      }
    }

    /* ---------------------------------------------------------- pricing */
    const co = await this.company();
    const months = isOne ? 0 : Math.max(1, Math.round(daysBetween(start, end) / 30.44));
    const monthsTerm = Math.max(1, Math.round(daysBetween(start, end) / 30.44));
    const place = draft.placeOfSupply || '';
    // Amount = qty × rate in BOTH modes: an AMC line's qty is its visit count,
    // a one-time line's qty is the units sold.
    const t = docTotals(
      lines.map((l) => ({ qty: l.qty || 0, rate: l.rate || 0 })),
      draft.discount || 0, place || co.homeState, co.homeState, co.gstRate,
    );

    /* --------------------------------------------------------- the plan */
    const services = await this.prisma.service.findMany();
    const svcOf: Record<string, (typeof services)[number]> = {};
    for (const s of services) svcOf[s.id] = s;

    const planRows = lines.map((l, i) => {
      const qty = Math.max(1, Math.round(l.qty || 1));
      const lineMonths = isOne ? 1 : Math.max(1, l.months || monthsTerm);
      const startAt = isOne ? start : l.startAt || start;
      const lslot = isOne ? slot : l.slot || '10:00';
      const term = Math.max(1, daysBetween(startAt, addMonths(startAt, lineMonths)));
      return {
        svId: l.svId,
        visits: qty,
        months: lineMonths,
        mins: svcOf[l.svId]?.mins || 60,
        dayRule: 'dom:' + dayOfMonth(startAt),
        startAt,
        slot: lslot,
        slotEnd: /^\d{2}:\d{2}$/.test(String(l.slotEnd || '')) ? String(l.slotEnd) : '',
        freq: cadenceLabel(term / qty, qty),
        crew: Math.min(9, Math.max(1, l.crew || 1)),
        rate: Math.max(0, Math.round(l.rate || 0)),
        dates: isOne ? [] : (Array.isArray(l.dates) ? l.dates : [])
          .slice(0, qty)
          .map((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : ''),
        techIds: [] as string[],
        order: i,
      };
    });

    /* ---------------------------------------------------------- the id */
    const year = new Date().getFullYear();
    const prefix = isOne ? 'OTS-' : 'AMC-';
    const typed = String(draft.no || '').trim();
    let id = '';
    const typedTaken = typed
      ? !!(await this.prisma.contract.findUnique({ where: { id: typed } }))
      : true;
    // v1: the counter moves exactly once per contract; a typed number that is
    // free is kept, anything else falls back to the minted one.
    let v = await this.takeSeq('contract');
    if (typed && !typedTaken) id = typed;
    else {
      id = prefix + year + '-' + String(v).padStart(2, '0');
      while (await this.prisma.contract.findUnique({ where: { id } })) {
        v = await this.takeSeq('contract');
        id = prefix + year + '-' + String(v).padStart(2, '0');
      }
    }

    /* ---------------------------------------------- signatures on file */
    const owner = draft.owner
      ? await this.prisma.user.findUnique({ where: { id: draft.owner } })
      : null;
    // The exec signature prefers the owner's on-file profile signature.
    const signExec = owner?.sign || draft.signExec || '';

    /* ----------------------------------------------------------- write */
    const created = await this.prisma.contract.create({
      data: {
        id,
        clientId: client.id,
        quoteId: draft.quoteId || '',
        leadId: '',
        mode,
        start,
        end,
        months,
        freq: isOne ? 'One-time' : '',
        billing: isOne
          ? 'On completion'
          : (['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].includes(String(draft.billing))
              ? String(draft.billing) : 'Quarterly'),
        // How the money moves — the one decision that kills invoice confusion.
        billingMode: ['upfront', 'pervisit', 'interval'].includes(String(draft.billingMode))
          ? String(draft.billingMode)
          : (isOne ? 'pervisit' : 'interval'),
        billingAmount: Math.max(0, Math.round(Number(draft.billingAmount) || 0)),
        // Ex-GST: the billing plan splits this and each invoice adds GST once.
        value: Math.round(t.sub - t.disc),
        owner: draft.owner || byUserId,
        branch: draft.branch || '',
        site: String(draft.siteAddr || '').trim() || client.addr || '',
        billAddr: String(draft.billAddr || '').trim(),
        scope: subject,
        slot: isOne ? slot : planRows[0]?.slot || '10:00',
        slotEnd: isOne ? slotEnd : '',
        notes: draft.notes || '',
        terms: draft.terms?.length ? draft.terms : co.terms,
        refNo: draft.refNo || '',
        placeOfSupply: place,
        discount: Math.round(t.disc),
        // One TRIP = one job. Same-day services of one contract ride in a
        // single entry (the technician works once); the visit invoice still
        // lists every service as its own line, so the money stays separated.
        mergeSameDay: true,
        workdaysOnly: true,
        blackout: [],
        signCustomer: draft.signCustomer || '',
        signExec,
        agreedAt: nowStamp(),
        totalVisits: 0,
        plan: { create: planRows },
      },
      include: { plan: { orderBy: { order: 'asc' } } },
    });

    /* ------------------------------------------------------ the visits */
    let visitsCreated = 0;
    if (isOne) {
      // One dated service rather than a generated series. The booked window
      // is what the technician's day actually loses.
      const win = toMin(slotEnd) - toMin(slot);
      const jv = await this.takeSeq('job');
      await this.prisma.job.create({
        data: {
          id: 'SER-' + String(jv).padStart(4, '0'),
          type: 'One-Time',
          contractId: id,
          clientId: client.id,
          branch: draft.branch || client.branch || '',
          serviceIds: lines.map((l) => l.svId),
          date: start,
          slot,
          slotEnd,
          mins: win > 0 ? win : 120,
          techIds: [],
          crewNeed: planRows.reduce((a, l) => Math.max(a, l.crew), 1),
          status: 'scheduled',
          priority: 'normal',
          visitNo: 1,
          ofVisits: 1,
          notes: subject,
        },
      });
      visitsCreated = 1;
      await this.prisma.contract.update({ where: { id }, data: { totalVisits: 1 } });
    } else {
      visitsCreated = await this.generateVisits(
        created, created.plan as DbPlanLine[], created.notes,
      );
    }

    /* ---------------------------------- close the loop on the quotation */
    let leadId = draft.leadId || '';
    if (draft.quoteId) {
      const q = await this.prisma.quotation.findUnique({ where: { id: draft.quoteId } });
      if (q) {
        await this.prisma.quotation.update({
          where: { id: q.id },
          data: { contractId: id, status: 'approved' },
        });
        if (q.leadId) leadId = q.leadId;
      }
    }

    // A signed contract is the whole point of the pipeline, so the lead is
    // won here and nowhere else.
    if (leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (l) {
        const log = Array.isArray(l.log) ? (l.log as unknown[]) : [];
        const n = visitsCreated || 1;
        log.unshift({
          at: nowStamp(), by: byUserId,
          text: (isOne ? 'Service ' : 'Contract ') + id + ' created — ' +
            n + ' service' + (n === 1 ? '' : 's') + ' scheduled',
        });
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { stage: 'won', contractId: id, followUp: '', log: log as never },
        });
        await this.prisma.contract.update({ where: { id }, data: { leadId } });
      }
    }

    return { id, mode, value: created.value, totalVisits: visitsCreated || 1 };
  }

  /** Fresh generation for a contract with no jobs yet — v1 generateVisits. */
  private async generateVisits(
    c: { id: string; clientId: string; start: string; end: string; months: number;
      slot: string; mergeSameDay: boolean; workdaysOnly: boolean; blackout: string[];
      branch?: string },
    plan: DbPlanLine[], notes: string,
  ): Promise<number> {
    if (!plan.length) return 0;
    const input: ContractInput = contractToInput({ ...c, notes }, plan);
    const visits = planVisits(input);
    if (!visits.length) {
      await this.prisma.contract.update({ where: { id: c.id }, data: { totalVisits: 0 } });
      return 0;
    }
    // A line with a booked window passes it to every job it generates.
    const endOf: Record<string, string> = {};
    for (const pl of plan) {
      const se = (pl as { slotEnd?: string }).slotEnd || '';
      if (se) endOf[pl.svId] = se;
    }
    const last = await this.takeSeq('job', visits.length);
    await this.prisma.job.createMany({
      data: visits.map((pv, i) => {
        const se = endOf[pv.serviceIds[0]] || '';
        const win = se ? toMin(se) - toMin(pv.slot) : 0;
        return {
        id: 'SER-' + String(last - visits.length + 1 + i).padStart(4, '0'),
        type: 'AMC Visit',
        contractId: c.id,
        branch: c.branch || '',
        clientId: c.clientId,
        serviceIds: pv.serviceIds,
        date: pv.date,
        slot: pv.slot,
        mins: win > 0 ? win : pv.mins,
        techIds: pv.techIds,
        crewNeed: pv.crew,
        // A visit the plan puts in the past was already served.
        status: dayDelta(pv.date) < 0 ? ('completed' as const) : ('scheduled' as const),
        priority: 'normal' as const,
        visitNo: i + 1,
        ofVisits: visits.length,
        notes: notes || '',
        slotEnd: se,
      }; }),
    });
    await this.prisma.contract.update({
      where: { id: c.id }, data: { totalVisits: visits.length },
    });
    return visits.length;
  }

  /* ------------------------------------------------------------------ edit */

  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const k of PATCHABLE) if (k in body) data[k] = body[k];
    if ('billingMode' in data && !['upfront', 'pervisit', 'interval'].includes(String(data.billingMode))) {
      delete data.billingMode;
    }
    if ('billing' in data && !['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'On completion'].includes(String(data.billing))) {
      delete data.billing;
    }
    if ('billingAmount' in data) data.billingAmount = Math.max(0, Math.round(Number(data.billingAmount) || 0));
    return this.prisma.contract.update({ where: { id }, data });
  }

  /* ----------------------------------------------------- plan diff / apply */

  /** readPlan's clamps — v1 contracts.js:255-275 — applied to an edited plan. */
  private sanitizePlan(
    c: { start: string; months: number }, existing: DbPlanLine[], edit: PlanEditLine[],
  ): { rows: DbPlanLine[]; dropped: string[] } {
    const byId: Record<string, DbPlanLine> = {};
    for (const l of existing) if (!byId[l.svId]) byId[l.svId] = l;
    const dropped: string[] = [];

    const rows = edit.filter((e) => e.svId).map((e, i) => {
      const prev = byId[e.svId];
      const visits = Math.min(120, Math.max(1, Math.round(e.visits ?? prev?.visits ?? 1)));
      const line: DbPlanLine = {
        svId: e.svId,
        visits,
        months: Math.max(1, Math.round(e.months ?? prev?.months ?? 0) || c.months || 12),
        mins: Math.max(1, Math.round(e.mins ?? prev?.mins ?? 60)),
        dayRule: 'dom:' + Math.min(31, Math.max(1,
          parseInt((/^dom:(\d{1,2})$/.exec(e.dayRule || prev?.dayRule || '') || [])[1] || '1', 10) || 1)),
        startAt: e.startAt ?? prev?.startAt ?? '',
        slot: e.slot || prev?.slot || '10:00',
        freq: '',
        crew: Math.min(9, Math.max(1, Math.round(e.crew ?? prev?.crew ?? 1))),
        techIds: (e.techIds ?? prev?.techIds ?? []).filter(Boolean),
        dates: prev?.dates || [], // pins survive a plan edit
        slotEnd: (prev as { slotEnd?: string } | undefined)?.slotEnd || '',
        order: i,
      };
      // Dropping the crew has to drop people with it — otherwise a staffed
      // crew-3 service taken down to 2 keeps three names and reads "3 of 2".
      if (line.techIds.length > line.crew) {
        for (const cut of line.techIds.slice(line.crew)) {
          if (dropped.indexOf(cut) < 0) dropped.push(cut);
        }
        line.techIds = line.techIds.slice(0, line.crew);
      }
      return line;
    });
    return { rows, dropped };
  }

  private async warningsFor(contractId: string, proposed: VisitPlan[], contractJobs: Array<{
    id: string; date: string; slot: string; mins: number; serviceIds: string[];
    techIds: string[]; status: string; pinned: boolean; visitNo: number; ofVisits: number;
  }>) {
    const dates = Array.from(new Set(proposed.map((v) => v.date)));
    const others = dates.length
      ? await this.prisma.job.findMany({
          where: { date: { in: dates }, contractId: { not: contractId } },
          select: { date: true, techIds: true },
        })
      : [];
    const busy: Record<string, number> = {};
    for (const j of others) for (const t of j.techIds) busy[t + '|' + j.date] = (busy[t + '|' + j.date] || 0) + 1;
    const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const nameOf: Record<string, string> = {};
    for (const u of users) nameOf[u.id] = u.name;
    return planWarnings(
      proposed, contractJobs,
      (t, d) => busy[t + '|' + d] || 0,
      (u) => nameOf[u] || u,
      fmtDate,
    );
  }

  /** What applying this edited plan would change — nothing is written. */
  @Post(':id/plan-diff')
  @Roles('admin', 'ops')
  async diff(@Param('id') id: string, @Body() body: PlanEditBody) {
    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');

    const { rows, dropped } = this.sanitizePlan(c, c.plan as DbPlanLine[],
      body.plan?.length ? body.plan : (c.plan as DbPlanLine[]));
    const core = {
      ...c,
      mergeSameDay: body.mergeSameDay ?? c.mergeSameDay,
      workdaysOnly: body.workdaysOnly ?? c.workdaysOnly,
    };
    const jobs = await this.prisma.job.findMany({ where: { contractId: id } });
    const d = planDiff(core, rows, jobs);
    return {
      add: d.add.length, update: d.update.length, remove: d.remove.length,
      kept: d.keep.length, frozen: d.frozen.length,
      visits: d.proposed.length,
      warnings: await this.warningsFor(id, d.proposed, jobs),
      dropped,
    };
  }

  /**
   * Write the plan out: add what is missing, update what changed, drop the
   * rest — visits already served, under way, or hand-placed are never touched,
   * and the whole schedule is renumbered so "visit 4 of 12" stays honest.
   */
  @Post(':id/apply-plan')
  @Roles('admin', 'ops')
  async applyPlan(@Param('id') id: string, @Body() body: PlanEditBody) {
    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');

    const { rows, dropped } = this.sanitizePlan(c, c.plan as DbPlanLine[],
      body.plan?.length ? body.plan : (c.plan as DbPlanLine[]));
    const mergeSameDay = body.mergeSameDay ?? c.mergeSameDay;
    const workdaysOnly = body.workdaysOnly ?? c.workdaysOnly;
    const core = { ...c, mergeSameDay, workdaysOnly };

    // The freq label each line works out to is stamped on save, like readPlan.
    for (const l of rows) l.freq = cadenceLabel(
      Math.max(1, daysBetween(l.startAt || c.start,
        addMonths(l.startAt || c.start, l.months || c.months || 12))) / l.visits,
      l.visits,
    );

    const jobs = await this.prisma.job.findMany({ where: { contractId: id } });
    const d = planDiff(core, rows, jobs);

    // Replace the stored plan.
    await this.prisma.planLine.deleteMany({ where: { contractId: id } });
    await this.prisma.planLine.createMany({
      data: rows.map((l) => ({ ...l, contractId: id })),
    });
    await this.prisma.contract.update({
      where: { id }, data: { mergeSameDay, workdaysOnly },
    });

    // Remove, update, add.
    if (d.remove.length) {
      await this.prisma.job.deleteMany({ where: { id: { in: d.remove.map((j) => j.id) } } });
    }
    for (const { job, pv } of d.update) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          serviceIds: pv.serviceIds, techIds: pv.techIds,
          slot: pv.slot, mins: pv.mins, crewNeed: pv.crew,
        },
      });
    }
    let made = 0;
    if (d.add.length) {
      const last = await this.takeSeq('job', d.add.length);
      await this.prisma.job.createMany({
        data: d.add.map((pv, i) => ({
          id: 'SER-' + String(last - d.add.length + 1 + i).padStart(4, '0'),
          type: 'AMC Visit',
          contractId: id,
          clientId: c.clientId,
          branch: c.branch || '',
          serviceIds: pv.serviceIds,
          date: pv.date,
          slot: pv.slot,
          mins: pv.mins,
          techIds: pv.techIds,
          crewNeed: pv.crew,
          status: dayDelta(pv.date) < 0 ? ('completed' as const) : ('scheduled' as const),
          priority: 'normal' as const,
          notes: c.notes || '',
        })),
      });
      made = d.add.length;
    }

    // Renumber the whole schedule by date.
    const all = (await this.prisma.job.findMany({ where: { contractId: id } }))
      .sort((a, b) => (a.date === b.date ? (a.slot < b.slot ? -1 : 1) : a.date < b.date ? -1 : 1));
    for (let i = 0; i < all.length; i++) {
      if (all[i].visitNo !== i + 1 || all[i].ofVisits !== all.length) {
        await this.prisma.job.update({
          where: { id: all[i].id }, data: { visitNo: i + 1, ofVisits: all.length },
        });
      }
    }
    await this.prisma.contract.update({ where: { id }, data: { totalVisits: all.length } });

    return {
      added: made, updated: d.update.length, removed: d.remove.length,
      kept: d.keep.length, frozen: d.frozen.length, total: all.length, dropped,
    };
  }

  /* ---------------------------------------------------------------- assign */

  /**
   * Who actually goes — one crew per service, capped at the line's crew size,
   * then every pending unpinned visit re-stamped from the plan. Done,
   * under-way and hand-placed visits are left exactly where they are.
   */
  @Post(':id/assign')
  @Roles('admin', 'ops')
  async assign(
    @Param('id') id: string,
    @Body() body: {
      lines?: Array<{ svId: string; techIds: string[] }>;
      coverStandalone?: boolean;
    },
  ) {
    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');

    const picks: Record<string, string[]> = {};
    for (const l of body.lines || []) picks[l.svId] = (l.techIds || []).filter(Boolean);

    const updatedPlan: DbPlanLine[] = [];
    for (const l of c.plan) {
      const need = Math.max(1, l.crew || 1);
      const techIds = (picks[l.svId] ?? l.techIds).slice(0, need);
      if (techIds.join() !== l.techIds.join()) {
        await this.prisma.planLine.update({ where: { id: l.id }, data: { techIds } });
      }
      updatedPlan.push({ ...(l as DbPlanLine), techIds });
    }

    const jobs = await this.prisma.job.findMany({ where: { contractId: id } });
    const sync = syncCrew(updatedPlan, jobs);
    for (const wjob of sync.writes) {
      const j = jobs.find((x) => x.id === wjob.id);
      if (!j) continue;
      // First on the line leads — they record the work for the visit.
      const head = wjob.techIds[0] || '';
      if (j.techIds.join() !== wjob.techIds.join() || (j.headTechId || '') !== head) {
        await this.prisma.job.update({
          where: { id: wjob.id },
          data: { techIds: wjob.techIds, headTechId: head },
        });
      }
    }

    // Same stroke, same crew: the customer's standalone open visits.
    let covered = 0;
    if (body.coverStandalone) {
      const crew: string[] = [];
      for (const l of updatedPlan) for (const t of l.techIds) {
        if (crew.indexOf(t) < 0) crew.push(t);
      }
      if (crew.length) {
        const loose = await this.prisma.job.findMany({
          where: {
            clientId: c.clientId, contractId: '',
            status: { in: ['scheduled', 'enroute'] }, techIds: { isEmpty: true },
          },
        });
        for (const j of loose) {
          const on = crew.slice(0, Math.max(1, j.crewNeed || 1));
          await this.prisma.job.update({
            where: { id: j.id },
            data: { techIds: on, headTechId: on[0] || '' },
          });
          covered++;
        }
      }
    }

    const staff = staffing(updatedPlan.map(lineToInput));
    return {
      updated: sync.updated, held: sync.held, covered,
      missing: staff.missing, ok: staff.ok, staffing: staff,
    };
  }

  /* ----------------------------------------------------------------- renew */

  /**
   * A new contract starting the day this one ends, with the same scope,
   * plan, crews and value — and a fresh set of scheduled visits. The new id
   * is always AMC-year-NN, exactly as v1 minted it.
   */
  @Post(':id/renew')
  @Roles('admin', 'ops')
  async renew(@Param('id') id: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');

    const year = new Date().getFullYear();
    let v = await this.takeSeq('contract');
    let newId = 'AMC-' + year + '-' + String(v).padStart(2, '0');
    while (await this.prisma.contract.findUnique({ where: { id: newId } })) {
      v = await this.takeSeq('contract');
      newId = 'AMC-' + year + '-' + String(v).padStart(2, '0');
    }

    const start = c.end; // v1 code: the same day the old one ends
    const end = addMonths(start, c.months);
    const { plan, ...fields } = c;

    const made = await this.prisma.contract.create({
      data: {
        ...fields,
        createdAt: undefined,
        id: newId,
        start,
        end,
        quoteId: '',
        totalVisits: 0,
        plan: {
          create: plan.map((l, i) => ({
            svId: l.svId, visits: l.visits, months: l.months, mins: l.mins,
            dayRule: l.dayRule, startAt: '', slot: l.slot, freq: l.freq,
            crew: l.crew, rate: (l as { rate?: number }).rate || 0,
            techIds: l.techIds, order: i,
          })),
        },
      },
      include: { plan: { orderBy: { order: 'asc' } } },
    });

    const visitsCreated = await this.generateVisits(made, made.plan as DbPlanLine[], made.notes);
    return { id: newId, visitsCreated };
  }
}
