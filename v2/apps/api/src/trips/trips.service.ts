/* ============================================================================
   Ending a trip.

   A trip is money — the kilometres become the technician's allowance — so
   closing one is not a status flip: it measures the drive against the
   shortest route, flags what is worth the office's eyes, and turns a clean
   one into its expense.

   It lives here rather than inside the Trips controller because a service
   ends trips too. A trip cannot outlive the job it was made for: arriving at
   the site ends it, finishing the service ends anything still open, and
   neither of those happens on the Trips screen. The rule belongs somewhere
   both can reach.
   ========================================================================== */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};
const nowStamp = () => {
  const d = new Date();
  return todayISO() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  async notify(userId: string, text: string) {
    if (!userId) return;
    await this.prisma.notification.create({ data: { userId, at: nowStamp(), text } }).catch(() => {});
  }

  /** The rupees-per-km rate the whole business runs on — shared with Expenses. */
  async kmRate(): Promise<number> {
    const co = await this.prisma.company.findFirst({ select: { kmRate: true } });
    return co?.kmRate || 0;
  }

  /**
   * Close one trip: measure it, flag it if it is long, pay it if it is clean.
   *
   * `plannedM` is the shortest route to compare against. The Trips screen
   * works one out from Ola when it has none; a trip closed by arriving at the
   * site passes whatever it already had, and zero means "nothing to compare",
   * which never flags.
   */
  async finish(id: string, opts: { plannedM?: number; endPlace?: string } = {}) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t || t.status !== 'active') return t;

    const plannedM = opts.plannedM ?? t.plannedM;
    let flagged = false;
    let flagReason = '';
    if (plannedM > 0 && t.distanceM > plannedM * 1.4 + 2000) {
      flagged = true;
      const over = ((t.distanceM - plannedM) / 1000).toFixed(1);
      flagReason = over + ' km longer than the shortest route (' +
        (t.distanceM / 1000).toFixed(1) + ' km driven vs ' + (plannedM / 1000).toFixed(1) + ' km).';
    }
    const up = await this.prisma.trip.update({
      where: { id },
      data: {
        status: 'done', endAt: new Date(), plannedM,
        endPlace: String(opts.endPlace || t.endPlace || t.dest || '').trim().slice(0, 200),
        flagged, flagReason,
        review: flagged ? 'pending' : 'auto',
      },
    });
    // A clean, auto-approved trip becomes its expense straight away — if the
    // branch+date report is open. Best-effort: never break ending a trip.
    if (up.review === 'auto') await this.autoExpenseForTrip(up.id).catch(() => {});
    return up;
  }

  /**
   * Close whatever is still running for a service.
   *
   * The technician's phone used to be the only thing that ended a trip, so a
   * service finished hours ago could still be "on the road" — the trip kept
   * counting through the treatment and out the other side, and the map went
   * on offering directions to a site he was standing in.
   */
  async endForJob(jobId: string, userId?: string): Promise<number> {
    if (!jobId) return 0;
    const running = await this.prisma.trip.findMany({
      where: { jobId, status: 'active', ...(userId ? { userId } : {}) },
      select: { id: true },
    });
    for (const t of running) await this.finish(t.id).catch(() => {});
    return running.length;
  }

  /**
   * Turn a finished trip into its expense - always.
   *
   * The rules the office set: a trip that started and finished produces a
   * line even at 0 km (an amount of zero, so the day shows the trip was
   * made and nothing is owed), and it lands in the day's report even when
   * that report is CLOSED - the office is told, by name, and reopens the day
   * to review it. What still produces nothing: a trip that was cancelled,
   * one the office rejected, or one that already has its line.
   */
  async autoExpenseForTrip(tripId: string): Promise<'created' | 'exists' | 'no-report' | 'skip'> {
    const t = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!t || t.status === 'active' || t.status === 'cancelled') return 'skip';
    if (t.review === 'rejected') return 'skip';
    const existing = await this.prisma.expense.findFirst({ where: { tripId } });
    if (existing) return 'exists';
    const rate = await this.kmRate();
    // The day the trip FINISHED is the day its money belongs to - that is
    // the folder the office reviews it in. And the folder opens itself, the
    // way a manual expense opens it: bookkeeping is not a decision. Only a
    // closed folder refuses; reopening it pulls the trip in (sweepIntoReport).
    const d = new Date(t.endAt || t.startAt);
    const date = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    let report = await this.prisma.expenseReport.findUnique({ where: { date_branch: { date, branch: t.branch } } });
    if (!report) {
      if (!t.branch) return 'no-report';
      const b = await this.prisma.branch.findUnique({ where: { id: t.branch }, select: { name: true } });
      const rseq = await this.prisma.seq.upsert({
        where: { key: 'expense-report' }, create: { key: 'expense-report', value: 1 }, update: { value: { increment: 1 } },
      });
      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      report = await this.prisma.expenseReport.create({
        data: {
          id: 'EXR-' + rseq.value, date, branch: t.branch,
          title: `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()} \u2014 ${b?.name || t.branch}`,
          createdBy: t.userId,
          history: [{ at: nowStamp(), text: 'Report opened by trip ' + t.id }] as never,
        },
      });
    }
    const wasClosed = report.status === 'closed';

    const km = +(t.distanceM / 1000).toFixed(1);
    const eseq = await this.prisma.seq.upsert({
      where: { key: 'expense' }, create: { key: 'expense', value: 1 }, update: { value: { increment: 1 } },
    });
    const expId = 'EXP-' + eseq.value;
    await this.prisma.$transaction([
      this.prisma.expense.create({
        data: {
          id: expId, reportId: report.id, userId: t.userId, branch: t.branch, date,
          category: 'Trip / Travel', source: 'auto_trip', tripId: t.id, status: 'pending',
          merchant: (t.startPlace || 'Trip') + ' \u2192 ' + (t.endPlace || t.dest || ''),
          note: t.id, amount: Math.round(km * rate), km, rate,
        },
      }),
      this.prisma.trip.update({ where: { id: t.id }, data: { claimId: report.id } }),
    ]);
    const hist = Array.isArray(report.history) ? (report.history as Array<unknown>) : [];
    await this.prisma.expenseReport.update({
      where: { id: report.id },
      data: { history: [...hist, { at: nowStamp(), text: expId + ' auto-generated from trip ' + t.id + ' (' + km + ' km)' + (wasClosed ? ' - into a CLOSED report' : '') }] as never },
    }).catch(() => {});
    const amount = Math.round(km * rate);
    await this.notify(t.userId, 'Trip allowance added to your expenses: ' + km + ' km \u00d7 \u20b9' + rate +
      ' = \u20b9' + amount.toLocaleString('en-IN') + '. (' + expId + ')');
    // A line in a closed report is one the office did not know was coming.
    // Every admin and manager hears, by the employee's name, with the report
    // to open - reopening the day and reviewing it is one click from there.
    if (wasClosed) {
      const [who, office] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: t.userId }, select: { name: true } }),
        this.prisma.user.findMany({ where: { role: { in: ['admin', 'ops'] }, active: true }, select: { id: true } }),
      ]);
      const text = (who?.name || t.userId) + "'s trip " + t.id + ' added \u20b9' + amount.toLocaleString('en-IN') + ' (' + km + ' km) to the CLOSED report for ' + date + ' - reopen the day to review it. (' + report.id + ')';
      for (const u of office) await this.notify(u.id, text);
    }
    return 'created';
  }

  /**
   * Every finished, unrejected trip of a branch that ended on a day and has
   * no expense yet - the ones a closed folder turned away. Called when the
   * folder reopens. Returns how many got in.
   */
  async sweepIntoReport(date: string, branch: string): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: { branch, status: 'done', claimId: '', review: { in: ['auto', 'approved'] } },
      select: { id: true, endAt: true, startAt: true },
      orderBy: { startAt: 'desc' }, take: 300,
    });
    let n = 0;
    for (const t of trips) {
      const d = new Date(t.endAt || t.startAt);
      const day = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (day !== date) continue;
      if ((await this.autoExpenseForTrip(t.id).catch(() => 'skip')) === 'created') n += 1;
    }
    return n;
  }
}
