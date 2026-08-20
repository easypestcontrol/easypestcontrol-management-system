/* ============================================================================
   The technician's home screen.

   Everything a person in the field is answerable for, in one request. The
   office dashboard answers "how is the business doing"; this one answers
   "what do I owe, what am I carrying, and what am I doing today" — which are
   different questions with different numbers, and mixing them was how a
   technician ended up reading the company's outstanding balance.

   Four things are recorded against a technician and all four appear here:
     · money  — cash he collected and has not yet handed over
     · stock  — chemicals issued to him and not yet used or returned
     · work   — the services he is on, and the execution record of each
     · trips  — distance driven along the actual GPS path

   One endpoint rather than six, because the first thing a phone does on a
   patchy connection is lose the fourth request.
   ========================================================================== */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { docTotals, isOffice } from 'shared';

interface AuthedRequest { user: { sub: string; role: string } }

interface ExecShape {
  checkinAt?: string; startedAt?: string; finishedAt?: string;
  durationMins?: number; rating?: number;
  photosBefore?: unknown[]; photosAfter?: unknown[];
  signature?: string; reportSentAt?: string;
  uniformPhotos?: Record<string, string>;
}

/**
 * 'YYYY-MM-DD' from the *local* clock, the same way the rest of the API writes
 * job dates. `toISOString()` is UTC: in IST it rolls the date back at 18:30, so
 * "tomorrow" came out as today for half of every day.
 */
const pad2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const shift = (base: string, days: number) => {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return iso(d);
};

@Controller('techdash')
@UseGuards(AuthGuard)
export class TechDashController {
  constructor(private prisma: PrismaService) {}

  /**
   * A technician's day. He may only ask about himself; the office may ask
   * about anyone, which is what makes this useful on the team page too.
   */
  @Get()
  @Roles('admin', 'ops', 'tech', 'senior_tech')
  async view(@Query('userId') userId: string | undefined, @Req() req: AuthedRequest) {
    const me = req.user?.sub || '';
    const who = isOffice(req.user?.role) && userId ? userId : me;

    const today = iso(new Date());
    const tomorrow = shift(today, 1);
    const monthStart = today.slice(0, 8) + '01';

    const [user, jobs, holding, items, cashPays, trips, clients, services] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: who } }),
      this.prisma.job.findMany({
        where: { techIds: { has: who }, status: { not: 'cancelled' } },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
      this.prisma.techStock.findMany({ where: { userId: who } }),
      this.prisma.inventoryItem.findMany({ select: { id: true, name: true, unit: true } }),
      this.prisma.payment.findMany({
        where: { by: who, mode: 'Cash' },
        include: { invoice: { select: { id: true, clientId: true } } },
      }),
      this.prisma.trip.findMany({ where: { userId: who } }),
      this.prisma.client.findMany({ select: { id: true, name: true, area: true, contact: true, phone: true } }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
    ]);

    const itemOf = new Map(items.map((i) => [i.id, i]));
    const clientOf = new Map(clients.map((c) => [c.id, c]));
    const serviceOf = new Map(services.map((s) => [s.id, s.name]));

    /* -------------------------------------------------------------- money */
    // Cash sits with him until the office marks it received. "Collected
    // today" is what he took in today whether or not it has been handed over.
    const inHand = cashPays.filter((p) => !p.settled).reduce((a, p) => a + p.amount, 0);
    const collectedToday = cashPays
      .filter((p) => p.date === today)
      .reduce((a, p) => a + p.amount, 0);

    /* -------------------------------------------------------------- stock */
    const stockList = holding
      .filter((h) => h.qty !== 0)
      .map((h) => ({
        itemId: h.itemId,
        name: itemOf.get(h.itemId)?.name || h.itemId,
        unit: itemOf.get(h.itemId)?.unit || '',
        qty: h.qty,
        short: h.qty < 0,
      }))
      .sort((a, b) => Number(b.short) - Number(a.short) || a.name.localeCompare(b.name));

    /* --------------------------------------------------------- the visits */
    // Everything money-related about a visit needs its contract and its
    // invoice, so both are fetched once for the whole set rather than per row.
    const relevant = jobs.filter((j) => j.date >= monthStart || j.date >= today);
    const contractIds = [...new Set(relevant.map((j) => j.contractId).filter(Boolean))] as string[];
    const [contracts, invoices] = await Promise.all([
      contractIds.length
        ? this.prisma.contract.findMany({ where: { id: { in: contractIds } }, include: { plan: true } })
        : Promise.resolve([]),
      this.prisma.invoice.findMany({
        where: { jobId: { in: relevant.map((j) => j.id) } },
        include: { payments: true },
      }),
    ]);
    const contractOf = new Map(contracts.map((c) => [c.id, c]));
    const invoiceOf = new Map(invoices.map((i) => [i.jobId, i]));
    const co = await this.prisma.company.findFirst();

    const row = (j: (typeof jobs)[number]) => {
      const cl = clientOf.get(j.clientId);
      const x = (j.exec || {}) as ExecShape;
      const ct = j.contractId ? contractOf.get(j.contractId) : null;
      const mode = ct ? ((ct as { billingMode?: string }).billingMode || 'interval') : 'onetime';

      // What he is expected to collect on site. Only per-visit contracts put
      // money in a technician's hands; anything else is billed from the office.
      let due = 0;
      if (mode === 'pervisit' && ct) {
        due = j.serviceIds.reduce(
          (a, sid) => a + ((ct.plan.find((l) => l.svId === sid) as { rate?: number } | undefined)?.rate || 0), 0);
        if (!due) due = Math.round((ct.value || 0) / Math.max(1, ct.totalVisits || 1));
      }

      const inv = invoiceOf.get(j.id);
      let invoice: { id: string; total: number; paid: number; balance: number } | null = null;
      if (inv) {
        const lines = (Array.isArray(inv.items) ? inv.items : []) as unknown as Array<{ qty?: number; rate?: number }>;
        const t = docTotals(lines, inv.discount, inv.placeOfSupply, co?.state || 'Tamil Nadu', co?.gstRate || 18);
        const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
        invoice = {
          id: inv.id, total: Math.round(t.total), paid,
          balance: Math.max(0, Math.round(t.total - paid)),
        };
      }

      return {
        id: j.id,
        date: j.date,
        slot: j.slot,
        type: j.type,
        status: j.status,
        title: j.serviceIds.map((s) => serviceOf.get(s) || s).join(' + ') || j.type,
        clientName: cl?.name || j.clientId,
        area: cl?.area || '',
        contact: cl?.contact || '',
        phone: cl?.phone || '',
        visitNo: j.visitNo,
        ofVisits: j.ofVisits,
        isHead: j.headTechId === who,
        crewSize: j.techIds.length,
        collectOnSite: mode === 'pervisit',
        due,
        invoice,
        started: !!x.startedAt,
        checkedIn: !!x.checkinAt,
        reportSent: !!x.reportSentAt,
        rating: x.rating || 0,
      };
    };

    const todays = jobs.filter((j) => j.date === today).map(row);
    const tomorrows = jobs.filter((j) => j.date === tomorrow).map(row);
    const upcoming = jobs
      .filter((j) => j.date > tomorrow && j.status !== 'completed')
      .slice(0, 12)
      .map(row);

    // To collect today: an invoice with a balance is the real figure; where a
    // per-visit service has not been invoiced yet, the contract rate is the
    // expectation. Never both — that would count the same money twice.
    const toCollectToday = todays.reduce(
      (a, r) => a + (r.invoice ? r.invoice.balance : (r.collectOnSite ? r.due : 0)), 0);

    /* --------------------------------------------------- needs attention */
    const attention: Array<{ kind: string; text: string; href: string }> = [];
    stockList.filter((s) => s.short).forEach((s) => attention.push({
      kind: 'stock',
      text: `${s.name} is ${Math.abs(s.qty)} ${s.unit} short — tell the store`,
      href: '/wallet',
    }));
    todays.filter((r) => r.status === 'completed' && !r.reportSent).forEach((r) => attention.push({
      kind: 'report', text: `${r.id} is finished but its report has not gone out`, href: '/jobs/' + r.id,
    }));
    if (inHand > 0) {
      attention.push({
        kind: 'cash',
        text: `Rs ${inHand.toLocaleString('en-IN')} of cash is with you — hand it in at the office`,
        href: '/wallet',
      });
    }

    /* ------------------------------------------------- the month so far */
    const monthJobs = jobs.filter((j) => j.date >= monthStart && j.date <= today && j.status === 'completed');
    const rated = monthJobs
      .map((j) => ((j.exec || {}) as ExecShape).rating || 0)
      .filter((r) => r > 0);
    const monthTrips = trips.filter((t) => iso(new Date(t.startAt)) >= monthStart);

    return {
      who: { id: who, name: user?.name || who, color: user?.color || '#888' },
      today,
      wallet: {
        inHand,
        unsettled: cashPays.filter((p) => !p.settled).length,
        collectedToday,
      },
      stock: {
        lines: stockList.length,
        shortages: stockList.filter((s) => s.short).length,
        list: stockList,
      },
      money: { toCollectToday, collectedToday },
      services: { today: todays, tomorrow: tomorrows, upcoming },
      attention,
      month: {
        completed: monthJobs.length,
        avgRating: rated.length
          ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
          : 0,
        ratedCount: rated.length,
        minutesOnSite: monthJobs.reduce(
          (a, j) => a + (((j.exec || {}) as ExecShape).durationMins || 0), 0),
        trips: monthTrips.length,
        distanceKm: Math.round(monthTrips.reduce((a, t) => a + t.distanceM, 0) / 100) / 10,
      },
    };
  }
}
