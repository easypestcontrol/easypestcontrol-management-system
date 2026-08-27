/* ============================================================================
   Invoices & Payments — GST tax invoices, receipts, collections.

   Ported from v1 assets/js/views/invoices.js + store.js:
     - invoiceTotals   (store.js:944-954): sub = Σ(qty×rate), total = sub+gst,
       paid = Σ payments, balance = max(0, total−paid)
     - syncInvoiceStatus (store.js:955-961): balance ≤ 0.5 → paid; paid > 0 →
       partial; due < today → overdue; else open. Derived — never trust stored.
       v2 adds a 'draft' state (schema enum); a draft with no payments stays a
       draft until it is issued, everything else derives exactly as v1.
     - invoiceFromContract (store.js:1364-1378): perCycle = round(value /
       cyclesPerYear); the single line's rate backs GST out at the HARDCODED
       1.18 regardless of gstRate; due = today+15; issued immediately.
     - recordPayment (store.js:1380-1391): amount Math.rounded, NOT capped at
       balance (overpay allowed — the balance clamps at 0), ids minted from
       the receipt sequence.
     - Ageing buckets (dashboard.js:300-310): on late = days past due,
       ≤0 not-due / ≤30 / ≤60 / 60+ over open issued invoices.
   ========================================================================== */

import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { addDays, billingPlan, daysBetween, docTotals, visitAmount } from 'shared';
import { PrismaService } from '../prisma.service';
import { raiseDueBilling } from '../billing.util';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, clientBranch, inScope } from '../branch.util';
import { drawCredit } from '../pay/credits';

interface Item { desc: string; qty: number; rate: number; svId?: string }

const EDITABLE = ['date', 'due', 'period', 'items', 'placeOfSupply', 'notes', 'discount'] as const;

/** Local calendar date — the whole product runs on "YYYY-MM-DD" local, as v1 did. */
function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function cleanItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const r = (x || {}) as Record<string, unknown>;
      const item: Item = {
        desc: String(r.desc ?? r.name ?? '').trim(),
        qty: Number(r.qty) || 1,
        rate: Math.round(Number(r.rate) || 0),
      };
      if (r.svId) item.svId = String(r.svId);
      return item;
    })
    .filter((i) => i.desc);
}

@Controller('invoices')
@UseGuards(AuthGuard)
export class InvoicesController {
  constructor(private prisma: PrismaService) {}

  /* ------------------------------------------------------------- helpers */

  private async company() {
    const co = await this.prisma.company.findFirst();
    return { state: co?.state || 'Tamil Nadu', gstRate: co?.gstRate || 18 };
  }

  private totalsFor(
    inv: { items: unknown; discount: number; placeOfSupply: string },
    payments: Array<{ amount: number }>,
    co: { state: string; gstRate: number },
  ) {
    const items = (Array.isArray(inv.items) ? inv.items : []) as unknown as Item[];
    const t = docTotals(items, inv.discount || 0, inv.placeOfSupply || co.state, co.state, co.gstRate);
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    return {
      sub: t.sub, disc: t.disc, gst: t.gst, total: t.total,
      rows: t.tax.rows, interState: t.tax.interState, place: t.tax.place, rate: t.tax.rate,
      paid, balance: Math.max(0, t.total - paid),
    };
  }

  /** v1 syncInvoiceStatus (store.js:955-961); 'draft' is sticky until issued or paid against. */
  private derive(current: InvoiceStatus, total: number, paid: number, due: string): InvoiceStatus {
    // A withdrawn invoice stays withdrawn. Every other status is derived from
    // the money, and re-deriving this one would quietly resurrect it into the
    // outstanding total the next time the list was read.
    if (current === 'cancelled') return 'cancelled';
    if (current === 'draft' && paid <= 0) return 'draft';
    const balance = Math.max(0, total - paid);
    if (balance <= 0.5) return 'paid';
    if (paid > 0) return 'partial';
    return daysBetween(due, todayISO()) > 0 ? 'overdue' : 'sent';
  }

  private async mint(key: 'invoice' | 'receipt', prefix: string) {
    // The counter can trail seeded ids — walk forward until the number is
    // free, so a collision can never turn a payment into a 500.
    for (let i = 0; i < 60; i++) {
      const seq = await this.prisma.seq.upsert({
        where: { key },
        create: { key, value: 1 },
        update: { value: { increment: 1 } },
      });
      const id = prefix + String(seq.value);
      const clash = key === 'invoice'
        ? await this.prisma.invoice.findUnique({ where: { id } })
        : await this.prisma.payment.findUnique({ where: { id } });
      if (!clash) return id;
    }
    throw new BadRequestException('Could not mint a document number');
  }

  /** The full document payload — items, client, contract, totals, payments. */
  private async detail(id: string, role?: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: { orderBy: [{ date: 'desc' }, { id: 'desc' }] } },
    });
    if (!inv) throw new NotFoundException('No such invoice');
    const [client, contract, co] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: inv.clientId } }),
      inv.contractId
        ? this.prisma.contract.findUnique({ where: { id: inv.contractId } })
        : Promise.resolve(null),
      this.company(),
    ]);
    const totals = this.totalsFor(inv, inv.payments, co);
    const status = this.derive(inv.status, totals.total, totals.paid, inv.due);

    // Non-payment never stops service — the balance rides on the next
    // invoice: "previous balance + this invoice = total payable". The old
    // invoices stay open underneath, so nothing is double-counted.
    let previousDue = 0;
    if (inv.contractId) {
      const older = await this.prisma.invoice.findMany({
        where: {
          contractId: inv.contractId,
          NOT: { id: inv.id },
          createdAt: { lt: inv.createdAt },
        },
        include: { payments: true },
      });
      for (const o of older) {
        const t = this.totalsFor(o, o.payments, co);
        previousDue += Math.max(0, t.total - t.paid);
      }
    }
    if (status !== inv.status) {
      await this.prisma.invoice.update({ where: { id }, data: { status } });
    }
    return {
      id: inv.id, clientId: inv.clientId, contractId: inv.contractId,
      date: inv.date, due: inv.due, period: inv.period, notes: inv.notes,
      placeOfSupply: inv.placeOfSupply, discount: inv.discount, status,
      items: (Array.isArray(inv.items) ? inv.items : []) as unknown as Item[],
      client: client
        ? {
            id: client.id, name: client.name, contact: client.contact, phone: client.phone,
            email: client.email, addr: client.addr, city: client.city, pin: client.pin,
            gstin: client.gstin,
          }
        : null,
      contract: contract
        ? {
            id: contract.id, mode: contract.mode, billing: contract.billing,
            months: contract.months, freq: contract.freq, value: contract.value,
            start: contract.start, end: contract.end,
          }
        : null,
      totals,
      payments: await (async () => {
        // WHO collected each rupee is the admin's eyes only — everyone else
        // sees the money and the mode, never the person.
        const admin = role === 'admin';
        const users = admin
          ? await this.prisma.user.findMany({ select: { id: true, name: true } })
          : [];
        const nameOf = new Map(users.map((u) => [u.id, u.name]));
        return inv.payments.map((p) => ({
          id: p.id, date: p.date, amount: p.amount, mode: p.mode, ref: p.ref,
          at: p.at,
          by: admin ? p.by : '',
          byName: admin && p.by ? nameOf.get(p.by) || p.by : '',
        }));
      })(),
      kind: (inv as { kind?: string }).kind || 'manual',
      jobId: (inv as { jobId?: string }).jobId || '',
      previousDue: Math.round(previousDue),
      totalPayable: Math.round(totals.total - totals.paid + previousDue),
      daysLate: daysBetween(inv.due, todayISO()),
    };
  }

  /* ---------------------------------------------------------------- list */

  // The list is the whole book. A technician needs the one record his own
  // screens link to, never the ledger — so the collection is gated and the
  // detail below is not.
  @Get()
  @Roles('admin', 'ops', 'sales', 'accounts')
  async list(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('branch') branch?: string,
  ) {
    // Raise anything the billing plans say is due before showing the list.
    await raiseDueBilling(this.prisma).catch(() => {});
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [invoices, clients, co] = await Promise.all([
      this.prisma.invoice.findMany({
        where: branchWhere(scope),
        include: { payments: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
      this.company(),
    ]);
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const today = todayISO();

    const updates: Array<Promise<unknown>> = [];
    const rows = invoices.map((i) => {
      const t = this.totalsFor(i, i.payments, co);
      const st = this.derive(i.status, t.total, t.paid, i.due);
      if (st !== i.status) {
        updates.push(this.prisma.invoice.update({ where: { id: i.id }, data: { status: st } }));
      }
      return {
        id: i.id, clientId: i.clientId, clientName: names.get(i.clientId) || '—',
        contractId: i.contractId, date: i.date, due: i.due, period: i.period,
        status: st, total: t.total, paid: t.paid, balance: t.balance,
        daysLate: daysBetween(i.due, today),
      };
    });
    await Promise.all(updates);

    const counts = {
      all: rows.length,
      draft: rows.filter((r) => r.status === 'draft').length,
      sent: rows.filter((r) => r.status === 'sent').length,
      partial: rows.filter((r) => r.status === 'partial').length,
      paid: rows.filter((r) => r.status === 'paid').length,
      overdue: rows.filter((r) => r.status === 'overdue').length,
      open: rows.filter((r) => r.status !== 'paid').length,
    };
    // Receivable = Σ balance over ALL invoices — v1 invoices.js:33, store.js kpis
    const receivable = rows.reduce((s, r) => s + r.balance, 0);

    // Receivables ageing over open, issued invoices — v1 dashboard.js:300-310
    const ageing = [
      { label: 'Not due yet', n: 0, v: 0 },
      { label: '1–30 days', n: 0, v: 0 },
      { label: '31–60 days', n: 0, v: 0 },
      { label: '60+ days', n: 0, v: 0 },
    ];
    for (const r of rows) {
      if (r.status === 'paid' || r.status === 'draft') continue;
      const b = r.daysLate <= 0 ? 0 : r.daysLate <= 30 ? 1 : r.daysLate <= 60 ? 2 : 3;
      ageing[b].n++;
      ageing[b].v += r.balance;
    }

    const ql = (q || '').toLowerCase();
    const filtered = rows.filter((r) => {
      if (status && status !== 'all') {
        if (status === 'open' ? r.status === 'paid' : r.status !== status) return false;
      }
      if (!ql) return true;
      // v1 search: id + clientName + period — invoices.js:24
      return (r.id + r.clientName + r.period).toLowerCase().includes(ql);
    });

    return { rows: filtered, counts, receivable, ageing };
  }

  /** Contracts a billing cycle can be raised from — keeps this module self-contained. */
  /**
   * The contracts there is actually something to bill on.
   *
   * A contract whose every service has been invoiced is not an option — it is
   * finished business, and listing it only to say "nothing left to raise" after
   * the person has clicked it wastes their time and invites them to raise
   * something anyway. The amount shown is what is genuinely billable, not the
   * next installment: the installment is a cadence, the services are the money.
   */
  @Get('contract-options')
  @Roles('admin', 'ops', 'accounts')
  async contractOptions() {
    const [contracts, clients, jobs] = await Promise.all([
      this.prisma.contract.findMany({
        orderBy: { id: 'asc' },
        include: { plan: true },
      }),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
      this.prisma.job.findMany({
        where: { contractId: { not: '' }, status: { not: 'cancelled' } },
        select: { id: true, contractId: true, serviceIds: true, invoiceId: true },
      }),
    ]);
    const names = new Map(clients.map((c) => [c.id, c.name]));

    const byContract = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const list = byContract.get(j.contractId) || [];
      list.push(j);
      byContract.set(j.contractId, list);
    }

    return contracts
      // Per-visit contracts bill themselves on visit completion — offering them
      // here is how installments got double-raised.
      .filter((c) => c.billingMode !== 'pervisit' && c.value > 0)
      .map((c) => {
        const mine = byContract.get(c.id) || [];
        const open = mine.filter((j) => !j.invoiceId);
        const plan = c.plan as Array<{ svId: string; rate?: number; months?: number; freq?: string }>;
        const totalVisits = c.totalVisits || mine.length || 1;
        const billable = open.reduce(
          (a, j) => a + visitAmount(
            { date: '', slot: '', serviceIds: j.serviceIds } as never,
            plan, c.value, totalVisits,
          ),
          0,
        );

        const rows = billingPlan({
          id: c.id, start: c.start, end: c.end, months: c.months,
          value: c.value, billingAmount: (c as { billingAmount?: number }).billingAmount || 0,
          billing: c.billing, billingMode: c.billingMode, slot: c.slot, plan: c.plan,
        });

        return {
          id: c.id, clientId: c.clientId, clientName: names.get(c.clientId) || '—',
          mode: c.mode, billing: c.billing, start: c.start, end: c.end, value: c.value,
          perCycle: rows.length ? rows[0].amount : c.value,
          services: mine.length,
          billableServices: open.length,
          billableValue: billable,
        };
      })
      // Nothing left to bill, nothing to offer. A contract with no services at
      // all still appears — there is nothing to tick, so it falls back to the
      // installment, which is right for an upfront contract.
      .filter((c) => c.billableServices > 0 || c.services === 0);
  }

  @Get(':id')
  async one(@Param('id') id: string, @Req() req: { user?: { sub?: string; role?: string } }) {
    const row = await this.prisma.invoice.findUnique({ where: { id }, select: { branch: true } });
    if (row && !inScope(await branchScope(this.prisma, req.user), row.branch)) {
      throw new NotFoundException('No such invoice');
    }
    return this.detail(id, req.user?.role);
  }

  /* -------------------------------------------------------------- writes */

  @Post()
  @Roles('admin', 'accounts')
  async create(@Body() body: Record<string, unknown>) {
    const clientId = String(body.clientId || '');
    const client = clientId
      ? await this.prisma.client.findUnique({ where: { id: clientId } })
      : null;
    if (!client) throw new BadRequestException('Pick a customer');
    const items = cleanItems(body.items);
    if (!items.length) throw new BadRequestException('Add at least one line item');

    const today = todayISO();
    // Invoices are the one document whose number may be typed; every other
    // document number is system-minted. Blank falls back to the counter.
    const typed = String(body.id || '').trim().slice(0, 24);
    if (typed && (await this.prisma.invoice.findUnique({ where: { id: typed } }))) {
      throw new BadRequestException(typed + ' is already used — pick another number or leave it blank');
    }
    const id = typed || (await this.mint('invoice', 'INV-'));
    await this.prisma.invoice.create({
      data: {
        id,
        clientId,
        contractId: String(body.contractId || ''),
        branch: await clientBranch(this.prisma, clientId),
        date: String(body.date || today),
        due: String(body.due || addDays(today, 15)), // v1 default: due = today+15 — store.js:1370
        period: String(body.period || ''),
        placeOfSupply: String(body.placeOfSupply || ''),
        notes: String(body.notes || ''),
        discount: Math.max(0, Math.round(Number(body.discount) || 0)),
        status: body.status === 'draft' ? 'draft' : 'sent',
        items: items as never,
      },
    });

    /*
     * Money the customer already handed over comes off immediately.
     *
     * An advance paid when a quotation was approved is real money sitting on
     * their record. If it did not apply itself here, the customer would be
     * invoiced for the full amount after having already paid part of it — and
     * somebody would have to remember. Drafts are left alone: a draft is not
     * a demand for money yet.
     */
    if (body.status !== 'draft') {
      const co = await this.company();
      const fresh = await this.prisma.invoice.findUnique({ where: { id } });
      if (fresh) {
        const total = Math.round(this.totalsFor(fresh, [], co).total);
        await drawCredit(this.prisma as never, id, clientId, total, today)
          .catch(() => { /* an invoice must exist even if credit cannot apply */ });
      }
    }
    return this.detail(id);
  }

  /** v1 invoiceFromContract — store.js:1364-1378. */
  /**
   * The services on a contract that have not been billed yet.
   *
   * This replaces "raise the next installment". An installment is a sequence
   * number — derived, unstable, and corresponding to nothing in the world. A
   * service has a date, a technician and a customer who watched it happen, and
   * it can be marked billed once and for all. Bill that instead and a contract
   * cannot be charged past its own value.
   *
   * Everything already carrying an invoice id is simply absent: settled
   * business, not a greyed-out row. "Already paid" needs no rule of its own,
   * because a paid service is an invoiced service and is gone by this rule.
   */
  @Get('billable/:contractId')
  @Roles('admin', 'ops', 'accounts')
  async billable(@Param('contractId') contractId: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { plan: true },
    });
    if (!c) throw new NotFoundException('No such contract');

    const [client, jobs, invoices, services, users] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: c.clientId } }),
      this.prisma.job.findMany({
        where: { contractId: c.id, status: { not: 'cancelled' } },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
      // A withdrawn invoice counts for nothing and holds no period.
      this.prisma.invoice.findMany({
        where: { contractId: c.id, status: { not: 'cancelled' } },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const sName = new Map(services.map((x) => [x.id, x.name]));
    const uName = new Map(users.map((x) => [x.id, x.name]));

    /* The cadence still decides when to bill and what to call the period — it
       just no longer decides what is on the invoice or what it costs. */
    const rows = billingPlan({
      id: c.id, start: c.start, end: c.end, months: c.months,
      value: c.value, billingAmount: (c as { billingAmount?: number }).billingAmount || 0,
      billing: c.billing, billingMode: c.billingMode, slot: c.slot, plan: c.plan,
    });
    const raised = new Set(invoices.filter((i) => i.seq > 0).map((i) => i.seq));
    const nextRow = rows.find((r) => !raised.has(r.seq)) || null;
    const prevDue = nextRow
      ? (rows[rows.indexOf(nextRow) - 1]?.due || c.start)
      : (rows[rows.length - 1]?.due || c.start);

    const plan = c.plan as Array<{ svId: string; rate?: number; months?: number; freq?: string }>;
    const priceOf = (serviceIds: string[]) =>
      visitAmount(
        { date: '', slot: '', serviceIds } as never,
        plan, c.value, c.totalVisits || jobs.length || 1,
      );

    const open = jobs.filter((j) => !j.invoiceId);
    const list = open.map((j) => ({
      jobId: j.id,
      visitNo: j.visitNo,
      ofVisits: j.ofVisits,
      date: j.date,
      slot: j.slot,
      status: j.status,
      serviceIds: j.serviceIds,
      title: j.serviceIds.map((x) => sName.get(x) || x).join(' + ') || j.type,
      crew: j.techIds.map((x) => uName.get(x) || x),
      amount: priceOf(j.serviceIds),
      // Inside the period being billed, so it comes pre-ticked. Anything older
      // and still unbilled shows above it, unticked — a visit that slipped a
      // month should be visible, not lost.
      inCycle: !!nextRow && j.date > prevDue && j.date <= nextRow.due,
      overdue: !!nextRow && j.date <= prevDue,
    }));

    const billedItems = invoices.reduce((a, i) => {
      const lines = (Array.isArray(i.items) ? i.items : []) as unknown as
        Array<{ qty?: number; rate?: number }>;
      return a + lines.reduce((x, l) => x + (l.qty || 1) * (l.rate || 0), 0);
    }, 0);

    return {
      contract: {
        id: c.id, clientId: c.clientId, clientName: client?.name || c.clientId,
        mode: c.mode, billing: c.billing, billingMode: c.billingMode,
        value: c.value, start: c.start, end: c.end,
        placeOfSupply: c.placeOfSupply || '', totalVisits: c.totalVisits || jobs.length,
      },
      cycle: nextRow
        ? { seq: nextRow.seq, label: nextRow.label, due: nextRow.due, amount: nextRow.amount }
        : null,
      services: list,
      billedServices: jobs.length - open.length,
      totalServices: jobs.length,
      // What has already been invoiced against this contract, so drift is
      // visible before it grows. See INVOICING.md §1.
      billedValue: Math.round(billedItems),
    };
  }

  /**
   * Raise an invoice for a set of services on a contract.
   *
   * Body: `{ jobIds: string[], label?: string }`. Each job becomes one line at
   * its own price, and each is stamped with the invoice — so it can never be
   * billed again. That single stamp is what stops a contract being charged past
   * its own value, which is exactly how AMC-2026-01 came to be invoiced
   * ₹1,12,983 against ₹66,000 (see INVOICING.md §1).
   *
   * With no `jobIds` this falls back to the old behaviour — one line for the
   * next installment — because upfront contracts have no services to tick and
   * a one-off contract may genuinely be a single lump.
   */
  @Post('from-contract/:contractId')
  @Roles('admin', 'accounts')
  async fromContract(
    @Param('contractId') contractId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { plan: true },
    });
    if (!c) throw new NotFoundException('No such contract');
    if (!(c.value > 0)) throw new BadRequestException('This contract has no value to bill');

    const jobIds = (Array.isArray(body.jobIds) ? body.jobIds : []).map(String).filter(Boolean);
    const today = todayISO();

    /* The cadence names the period and keeps a cycle from being raised twice;
       it no longer decides what is billed. */
    const rows = billingPlan({
      id: c.id, start: c.start, end: c.end, months: c.months,
      value: c.value, billingAmount: (c as { billingAmount?: number }).billingAmount || 0,
      billing: c.billing, billingMode: c.billingMode, slot: c.slot, plan: c.plan,
    });
    const raised = new Set(
      (await this.prisma.invoice.findMany({
        where: { contractId: c.id, seq: { gt: 0 }, status: { not: 'cancelled' } },
        select: { seq: true },
      })).map((x) => x.seq),
    );
    const next = rows.find((r) => !raised.has(r.seq)) || null;

    /* ------------------------------------------------- billing by service */
    if (jobIds.length) {
      const jobs = await this.prisma.job.findMany({ where: { id: { in: jobIds } } });
      if (jobs.length !== jobIds.length) throw new BadRequestException('One of those services no longer exists');

      const foreign = jobs.find((j) => j.contractId !== c.id);
      if (foreign) throw new BadRequestException(`${foreign.id} is not on this contract`);

      // The rule the whole design rests on, enforced here rather than trusted
      // to the screen that drew the checklist.
      const already = jobs.find((j) => j.invoiceId);
      if (already) {
        throw new BadRequestException(
          `${already.id} is already on invoice ${already.invoiceId}. A service is billed once.`,
        );
      }

      const services = await this.prisma.service.findMany({ select: { id: true, name: true } });
      const sName = new Map(services.map((x) => [x.id, x.name]));
      const plan = c.plan as Array<{ svId: string; rate?: number; months?: number; freq?: string }>;
      const totalVisits = c.totalVisits
        || (await this.prisma.job.count({ where: { contractId: c.id } }))
        || jobs.length;

      const ordered = [...jobs].sort((a, b) => (a.visitNo - b.visitNo) || a.date.localeCompare(b.date));
      const items = ordered.map((j) => {
        const title = j.serviceIds.map((x) => sName.get(x) || x).join(' + ') || j.type;
        const visit = j.ofVisits ? ` — visit ${j.visitNo} of ${j.ofVisits}` : '';
        return {
          desc: title + visit,
          qty: 1,
          rate: visitAmount(
            { date: j.date, slot: j.slot, serviceIds: j.serviceIds } as never,
            plan, c.value, totalVisits,
          ),
          // Carried so the document can print the date and reference, and so
          // cancelling the invoice knows what to release.
          jobId: j.id,
          date: j.date,
        };
      });

      const id = await this.mint('invoice', 'INV-');
      await this.prisma.$transaction([
        this.prisma.invoice.create({
          data: {
            id,
            clientId: c.clientId,
            contractId: c.id,
            branch: c.branch || '',
            kind: c.billingMode,
            seq: next ? next.seq : 0,
            date: today,
            due: addDays(today, 15),
            period: String(body.label || '') || (next ? next.label : 'Services billed'),
            placeOfSupply: c.placeOfSupply || '',
            status: 'sent',
            items: items as never,
          },
        }),
        this.prisma.job.updateMany({
          where: { id: { in: ordered.map((j) => j.id) } },
          data: { invoiceId: id },
        }),
      ]);
      return this.detail(id);
    }

    /* ---------------------------------- no services ticked: one lump line */
    if (c.billingMode === 'pervisit') {
      throw new BadRequestException(
        'This contract bills per service — tick the services to bill, or let each ' +
        'completed service raise its own invoice',
      );
    }
    if (!next) {
      throw new BadRequestException('Every installment on this contract has already been raised');
    }

    const id = await this.mint('invoice', 'INV-');
    await this.prisma.invoice.create({
      data: {
        id,
        clientId: c.clientId,
        contractId: c.id,
        branch: c.branch || '',
        kind: c.billingMode,
        seq: next.seq,
        date: today,
        due: addDays(today, 15),
        period: String(body.label || '') || next.label,
        placeOfSupply: c.placeOfSupply || '',
        status: 'sent',
        items: [{ desc: next.label + ' \u2014 ' + c.id, qty: 1, rate: next.amount }] as never,
      },
    });
    return this.detail(id);
  }

  /**
   * Withdraw an invoice raised in error.
   *
   * The document stays — a financial record is never deleted — but it leaves
   * every total, and **the services it billed go back on the checklist**.
   * Without that release a single mistaken invoice would permanently un-bill
   * work that was actually done, and the only way out would be to lie to the
   * system. See INVOICING.md §4.
   *
   * Refused once money has been taken against it: that is a refund or a credit
   * note, which is a different decision and a different document.
   */
  @Post(':id/cancel')
  @Roles('admin', 'accounts')
  async cancel(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id }, include: { payments: true },
    });
    if (!inv) throw new NotFoundException('No such invoice');
    if (inv.status === 'cancelled') return this.detail(id);
    if (inv.payments.length) {
      const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
      throw new BadRequestException(
        `Rs ${paid.toLocaleString('en-IN')} has been received against this invoice. ` +
        'Refund or credit it rather than cancelling.',
      );
    }

    const freed = await this.prisma.job.findMany({
      where: { invoiceId: id }, select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.job.updateMany({ where: { invoiceId: id }, data: { invoiceId: '' } }),
      this.prisma.invoice.update({ where: { id }, data: { status: 'cancelled' } }),
    ]);
    return { ...(await this.detail(id)), released: freed.map((j) => j.id) };
  }

  /** v1 recordPayment — store.js:1380-1391. Overpay allowed; balance clamps at 0. */
  @Post(':id/payments')
  async recordPayment(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req?: { user?: { sub?: string } },
  ) {
    const collector = String(req?.user?.sub || '');
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!inv) throw new NotFoundException('No such invoice');
    let amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0) throw new BadRequestException('Enter an amount');

    const co = await this.company();
    const date = String(body.date || todayISO());
    const mode = String(body.mode || 'UPI');
    const ref = String(body.ref || '');

    // A combined payment settles the oldest open invoice first (FIFO), so
    // arrears clear in order and nothing is ever counted twice. Whatever is
    // left after the chain lands on the invoice it was recorded from.
    const chain = inv.contractId
      ? await this.prisma.invoice.findMany({
          where: { contractId: inv.contractId },
          include: { payments: true },
          orderBy: { createdAt: 'asc' },
        })
      : [inv];

    /*
     * Work out the whole allocation first, write it in one transaction.
     *
     * This loop used to create each receipt as it went. A single payment
     * spread across six arrears invoices was six separate writes, and anything
     * that interrupted the request halfway — a restart, a dropped connection —
     * left some receipts banked and the browser showing a failure. The person
     * then clicks again and pays twice. Money moves all at once or not at all.
     */
    const planned: Array<{ invoiceId: string; receiptId: string; amount: number; status?: InvoiceStatus }> = [];
    for (const o of chain) {
      if (amount <= 0) break;
      const t = this.totalsFor(o, o.payments, co);
      const balance = Math.max(0, Math.round(t.total - t.paid));
      if (balance <= 0) continue;
      const take = Math.min(amount, balance);
      const status = this.derive(o.status, t.total, t.paid + take, o.due);
      planned.push({
        invoiceId: o.id,
        receiptId: await this.mint('receipt', 'RCT-'),
        amount: take,
        status: status !== o.status ? status : undefined,
      });
      amount -= take;
    }

    // Overpayment beyond every open balance still lands as a credit here.
    if (amount > 0) {
      planned.push({
        invoiceId: id,
        receiptId: await this.mint('receipt', 'RCT-'),
        amount,
      });
    }
    if (!planned.length) throw new BadRequestException('Nothing left to settle on this invoice');

    await this.prisma.$transaction([
      ...planned.map((a) => this.prisma.payment.create({
        data: {
          id: a.receiptId, invoiceId: a.invoiceId, date, amount: a.amount,
          mode, ref, by: collector, at: hhmm,
        },
      })),
      ...planned.filter((a) => a.status).map((a) => this.prisma.invoice.update({
        where: { id: a.invoiceId }, data: { status: a.status as InvoiceStatus },
      })),
    ]);

    const allocations = planned.map((a) => ({
      invoiceId: a.invoiceId, receiptId: a.receiptId, amount: a.amount,
    }));

    /*
     * Accounts and admin hear every rupee that lands, whoever collected it.
     *
     * Best-effort, and deliberately so. Telling someone about a payment is not
     * part of taking it: this used to run unguarded, and when it failed the
     * receipts were already written — so the browser showed "Internal server
     * error" while the money sat recorded in the database. Anyone who clicked
     * again paid twice. A notification must never be able to do that.
     */
    const paid = allocations.reduce((a, b) => a + b.amount, 0);
    try {
      const office = await this.prisma.user.findMany({
        where: { role: { in: ['admin', 'accounts'] }, id: { not: collector } },
      });
      await this.prisma.notification.createMany({
        data: office.map((u) => ({
          userId: u.id, at: date + ' ' + hhmm,
          text: `Rs ${paid.toLocaleString('en-IN')} received against ${id} via ${mode}.`,
        })),
      });
    } catch (e) {
      console.error('payment recorded but the notification failed', id, e);
    }

    return { allocations, settled: allocations.length };
  }

  @Patch(':id')
  @Roles('admin', 'accounts')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req?: { user?: { role?: string } },
  ) {
    const exists = await this.prisma.invoice.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('No such invoice');

    const data: Record<string, unknown> = {};
    for (const k of EDITABLE) if (k in body) data[k] = body[k];
    if ('items' in data) {
      const items = cleanItems(data.items);
      if (!items.length) throw new BadRequestException('Add at least one line item');
      data.items = items as never;
    }
    if ('discount' in data) data.discount = Math.max(0, Math.round(Number(data.discount) || 0));
    for (const k of ['date', 'due', 'period', 'placeOfSupply', 'notes']) {
      if (k in data) data[k] = String(data[k] ?? '');
    }
    // paid / partial / overdue are DERIVED — only the draft⇄sent step may be set by hand
    if (body.status === 'draft' || body.status === 'sent') data.status = body.status;

    await this.prisma.invoice.update({ where: { id }, data: data as never });
    return this.detail(id, req?.user?.role); // re-derives and persists the true status
  }
}
