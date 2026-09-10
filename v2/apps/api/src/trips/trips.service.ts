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

  async autoExpenseForTrip(tripId: string): Promise<'created' | 'exists' | 'no-report' | 'skip'> {
    const t = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!t || t.status === 'active' || t.status === 'cancelled') return 'skip';
    if (t.review === 'rejected' || t.distanceM <= 0) return 'skip';
    const existing = await this.prisma.expense.findFirst({ where: { tripId } });
    if (existing) return 'exists';
    const rate = await this.kmRate();
    if (!rate) return 'skip';
    const d = new Date(t.startAt);
    const date = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const report = await this.prisma.expenseReport.findUnique({ where: { date_branch: { date, branch: t.branch } } });
    if (!report || report.status === 'closed') return 'no-report';

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
      data: { history: [...hist, { at: nowStamp(), text: expId + ' auto-generated from trip ' + t.id + ' (' + km + ' km)' }] as never },
    }).catch(() => {});
    await this.notify(t.userId, 'Trip allowance added to your expenses: ' + km + ' km \u00d7 \u20b9' + rate +
      ' = \u20b9' + Math.round(km * rate).toLocaleString('en-IN') + '. (' + expId + ')');
    return 'created';
  }
}
