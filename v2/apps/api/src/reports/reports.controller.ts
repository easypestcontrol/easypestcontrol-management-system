import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { daysBetween, docTotals, toISO } from 'shared';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope } from '../branch.util';

/*
 * Reports — every series the reports screen paints, in one call.
 *
 * v1 parity (reports.js / dashboard.js / store.js):
 *   - revenue by month: billed = Σ invoice totals by date prefix 'YYYY-MM'
 *     (store.js:1033-1049), collected = Σ payments by the payment's own date
 *   - service mix: completed jobs count once per serviceId, top 6 (store.js:1052-1060)
 *   - leaderboard: rating = mean exec.rating of rated completed jobs else the
 *     user's seed rating (store.js:1062-1078). v1's onTime was a deliberately
 *     fake placeholder — dropped here per the parity contract.
 *   - funnel: lead count + Σ value per stage; win rate = won/(won+lost)
 *     (dashboard.js:230); pipeline value = Σ open-stage lead values
 *   - ageing: buckets on late = days past due over the DERIVED invoice status
 *     (dashboard.js:293-368, store.js:955-961) — a snapshot as of today,
 *     independent of the requested range, exactly like v1.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STAGES = [
  { id: 'new', label: 'New Lead' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'contract', label: 'Contract' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];
const OPEN_STAGES = ['new', 'followup', 'inspection', 'quoted', 'contract'];

interface MonthPoint { key: string; label: string; billed: number; collected: number }
interface MixSlice { svId: string; name: string; code: string; n: number; pct: number }
interface TechRow {
  id: string; name: string; color: string; skills: string[];
  total: number; done: number; open: number; today: number; todayDone: number; rating: number;
}
interface FunnelStage { id: string; label: string; n: number; value: number }
interface AgeBucket { label: string; n: number; value: number }

export interface ReportSummary {
  range: { from: string; to: string };
  totals: {
    billed: number; collected: number; outstanding: number; overdue: number;
    visitsDone: number; completionRatePct: number; avgRating: number; openInvoices: number;
  };
  revenueByMonth: MonthPoint[];
  serviceMix: MixSlice[];
  leaderboard: TechRow[];
  funnel: { stages: FunnelStage[]; winRatePct: number; pipelineValue: number };
  ageing: AgeBucket[];
}

function execRating(exec: unknown): number {
  const ex = exec as { rating?: unknown } | null;
  return ex && typeof ex.rating === 'number' ? ex.rating : 0;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  async summary(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
    @Query('branch') branch?: string,
  ): Promise<ReportSummary> {
    const today = toISO(new Date());
    const from = ISO_DAY.test(fromQ || '') ? String(fromQ) : today.slice(0, 7) + '-01';
    const to = ISO_DAY.test(toQ || '') && String(toQ) >= from ? String(toQ) : today;
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const bw = branchWhere(scope);

    const [company, invoices, jobs, leads, techs, services] = await Promise.all([
      this.prisma.company.findFirst(),
      this.prisma.invoice.findMany({ where: bw, include: { payments: true } }),
      this.prisma.job.findMany({ where: bw }),
      this.prisma.lead.findMany({ where: bw }),
      this.prisma.user.findMany({
        where: {
          role: { in: ['tech', 'senior_tech'] }, active: true,
          ...(scope === null ? {} : { branches: { hasSome: scope } }),
        },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, color: true, rating: true, skills: true },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true, code: true } }),
    ]);
    const homeState = company?.state || 'Tamil Nadu';
    const gstRate = company?.gstRate || 18;
    const inRange = (d: string) => d >= from && d <= to;

    // ----- invoices enriched with totals, paid, balance and DERIVED status
    const inv = invoices.map((i) => {
      const items = (i.items as unknown as Array<{ qty?: number; rate?: number }>) || [];
      const t = docTotals(items, i.discount, i.placeOfSupply, homeState, gstRate);
      const paid = i.payments.reduce((s, p) => s + p.amount, 0);
      const balance = Math.max(0, t.total - paid);
      const status =
        balance <= 0.5 ? 'paid'
        : paid > 0 ? 'partial'
        : daysBetween(i.due, today) > 0 ? 'overdue'
        : 'unpaid';
      return { date: i.date, due: i.due, payments: i.payments, total: t.total, paid, balance, status };
    });

    // ----- revenue by month: billed vs collected, over the requested months
    const months: Array<{ key: string; label: string }> = [];
    {
      let y = Number(from.slice(0, 4));
      let m = Number(from.slice(5, 7));
      const endKey = to.slice(0, 7);
      const multiYear = from.slice(0, 4) !== to.slice(0, 4);
      for (let i = 0; i < 24; i++) {
        const key = y + '-' + String(m).padStart(2, '0');
        months.push({ key, label: MON[m - 1] + (multiYear ? ' ' + String(y).slice(2) : '') });
        if (key >= endKey) break;
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const revenueByMonth: MonthPoint[] = months.map(({ key, label }) => ({
      key,
      label,
      billed: Math.round(
        inv.filter((i) => i.date.slice(0, 7) === key).reduce((s, i) => s + i.total, 0),
      ),
      collected: inv.reduce(
        (s, i) => s + i.payments.filter((p) => p.date.slice(0, 7) === key)
          .reduce((a, p) => a + p.amount, 0),
        0,
      ),
    }));

    // ----- service delivery within the range
    const rangeJobs = jobs.filter((j) => inRange(j.date));
    const done = rangeJobs.filter((j) => j.status === 'completed');

    const mixMap: Record<string, number> = {};
    for (const j of done) for (const sid of j.serviceIds || []) mixMap[sid] = (mixMap[sid] || 0) + 1;
    const svc = new Map(services.map((s) => [s.id, s]));
    const mixTotal = Object.values(mixMap).reduce((a, b) => a + b, 0);
    const serviceMix: MixSlice[] = Object.keys(mixMap)
      .map((sid) => ({
        svId: sid,
        name: svc.get(sid)?.name || sid,
        code: svc.get(sid)?.code || '',
        n: mixMap[sid],
        pct: mixTotal ? Math.round((mixMap[sid] / mixTotal) * 100) : 0,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);

    // ----- technician leaderboard
    const leaderboard: TechRow[] = techs
      .map((u) => {
        const js = rangeJobs.filter((j) => (j.techIds || []).indexOf(u.id) >= 0);
        const doneJ = js.filter((j) => j.status === 'completed');
        const rated = doneJ.filter((j) => execRating(j.exec) > 0);
        const todayJobs = jobs.filter(
          (j) => j.date === today && (j.techIds || []).indexOf(u.id) >= 0,
        );
        const rating = rated.length
          ? rated.reduce((s, j) => s + execRating(j.exec), 0) / rated.length
          : u.rating || 0;
        return {
          id: u.id, name: u.name, color: u.color, skills: u.skills,
          total: js.length,
          done: doneJ.length,
          open: js.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length,
          today: todayJobs.length,
          todayDone: todayJobs.filter((j) => j.status === 'completed').length,
          rating: Math.round(rating * 10) / 10,
        };
      })
      .sort((a, b) => b.done - a.done);

    // ----- pipeline funnel — current snapshot, like v1's pipeline cards
    const stages: FunnelStage[] = STAGES.map((s) => {
      const ls = leads.filter((l) => l.stage === s.id);
      return { id: s.id, label: s.label, n: ls.length, value: ls.reduce((a, l) => a + l.value, 0) };
    });
    const won = stages.find((s) => s.id === 'won')?.n || 0;
    const lost = stages.find((s) => s.id === 'lost')?.n || 0;
    const winRatePct = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    const pipelineValue = stages
      .filter((s) => OPEN_STAGES.indexOf(s.id) >= 0)
      .reduce((a, s) => a + s.value, 0);

    // ----- receivables ageing — snapshot as of today
    const ageing: AgeBucket[] = [
      { label: 'Not due yet', n: 0, value: 0 },
      { label: '1–30 days', n: 0, value: 0 },
      { label: '31–60 days', n: 0, value: 0 },
      { label: '60+ days', n: 0, value: 0 },
    ];
    const open = inv.filter((i) => i.status !== 'paid');
    for (const i of open) {
      const late = daysBetween(i.due, today);
      const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
      ageing[b].n++;
      ageing[b].value += i.balance;
    }
    for (const b of ageing) b.value = Math.round(b.value);

    // ----- headline totals
    const dueToDate = rangeJobs.filter((j) => j.date <= today).length;
    const ratedAll = done.filter((j) => execRating(j.exec) > 0);
    return {
      range: { from, to },
      totals: {
        billed: Math.round(inv.filter((i) => inRange(i.date)).reduce((s, i) => s + i.total, 0)),
        collected: Math.round(
          inv.reduce(
            (s, i) => s + i.payments.filter((p) => inRange(p.date)).reduce((a, p) => a + p.amount, 0),
            0,
          ),
        ),
        outstanding: Math.round(inv.reduce((s, i) => s + i.balance, 0)),
        overdue: Math.round(
          inv.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0),
        ),
        visitsDone: done.length,
        completionRatePct: Math.round((done.length / Math.max(1, dueToDate)) * 100),
        avgRating: ratedAll.length
          ? Math.round((ratedAll.reduce((s, j) => s + execRating(j.exec), 0) / ratedAll.length) * 10) / 10
          : 0,
        openInvoices: open.length,
      },
      revenueByMonth,
      serviceMix,
      leaderboard,
      funnel: { stages, winRatePct, pipelineValue },
      ageing,
    };
  }
}
