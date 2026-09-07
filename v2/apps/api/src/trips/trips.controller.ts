/* ============================================================================
   Trips — GPS breadcrumb tracking for anyone on the team. The browser sends
   a position ping every few seconds; distance is the sum of the segments
   actually driven, so it follows the real road, never a straight line.
   When an Ola Maps key is connected (Settings → Integrations) the same data
   feeds the live map.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';
import { open } from '../secrets.util';

interface Jwt { user?: { sub?: string; role?: string } }
interface Pt { lat: number; lng: number; t: string }

/** Metres between two coordinates — plain haversine. */
function metres(a: Pt, b: Pt): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};
const nowStamp = () => {
  const d = new Date();
  return todayISO() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

@Controller('trips')
@UseGuards(AuthGuard)
export class TripsController {
  constructor(private prisma: PrismaService) {}

  private async notify(userId: string, text: string) {
    if (!userId) return;
    await this.prisma.notification.create({ data: { userId, at: nowStamp(), text } }).catch(() => {});
  }

  /** The ₹/km rate the whole business runs on — shared with Expenses. */
  private async kmRate(): Promise<number> {
    const co = await this.prisma.company.findFirst({ select: { kmRate: true } });
    return co?.kmRate || 0;
  }

  /** Shortest-route metres between two points — one Ola call, best-effort.
      Returns 0 if Ola is off or the call fails; the caller treats 0 as
      "nothing to compare" and never flags on it. */
  private async plannedMetres(a: Pt, b: Pt): Promise<number> {
    try {
      const key = await this.ola();
      const r = await fetch(
        'https://api.olamaps.io/routing/v1/directions?origin=' + a.lat + ',' + a.lng +
        '&destination=' + b.lat + ',' + b.lng + '&overview=false&api_key=' + key,
        { method: 'POST' },
      );
      if (!r.ok) return 0;
      const data = (await r.json()) as { routes?: Array<{ legs?: Array<{ distance?: number | { value?: number } }> }> };
      const legs = (data.routes || []).map((rt) => {
        const d = rt.legs?.[0]?.distance;
        return typeof d === 'number' ? d : (d && typeof d.value === 'number' ? d.value : 0);
      }).filter((m) => m > 0);
      return legs.length ? Math.round(Math.min(...legs)) : 0;
    } catch { return 0; }
  }

  /** Start a trip. Any still-active trip of mine is closed first. */
  @Post()
  async start(@Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const userId = req.user?.sub || '';
    const purpose = String(body.purpose || '').trim();
    if (!purpose) throw new BadRequestException('Say what the trip is for');

    await this.prisma.trip.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'done', endAt: new Date() },
    });
    const seq = await this.prisma.seq.upsert({
      where: { key: 'trip' }, create: { key: 'trip', value: 1 },
      update: { value: { increment: 1 } },
    });
    const id = 'TRIP-' + seq.value;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { branches: true } });
    await this.prisma.trip.create({
      data: {
        id, userId, purpose,
        branch: user?.branches[0] || '',
        jobId: String(body.jobId || ''),
        dest: String(body.dest || '').trim().slice(0, 200),
        // The app already knows where the driver is standing and the road
        // distance to the destination — passing them here means no extra
        // Ola call, and a planned figure to measure the real drive against.
        startPlace: String(body.startPlace || '').trim().slice(0, 200),
        plannedM: Math.max(0, Math.round(Number(body.plannedM) || 0)),
      },
    });
    return { id };
  }

  /**
   * My services scheduled today — each one is a one-tap trip starter with
   * the customer's site as the destination.
   */
  @Get('today-services')
  async todayServices(@Req() req: Request & Jwt) {
    const me = req.user?.sub || '';
    const today = new Date();
    const iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    const jobs = await this.prisma.job.findMany({
      where: { date: iso, techIds: { has: me }, status: { in: ['scheduled', 'enroute', 'inprogress'] } },
      orderBy: { slot: 'asc' },
    });
    const clients = await this.prisma.client.findMany({ select: { id: true, name: true, addr: true, city: true } });
    const clientOf = new Map(clients.map((c) => [c.id, c]));
    const svcs = await this.prisma.service.findMany({ select: { id: true, name: true } });
    const svcOf = new Map(svcs.map((x) => [x.id, x.name]));
    return jobs.map((j) => {
      const c = clientOf.get(j.clientId);
      return {
        jobId: j.id, slot: j.slot,
        client: c?.name || '—',
        dest: [c?.addr, c?.city].filter(Boolean).join(', '),
        services: j.serviceIds.map((x) => svcOf.get(x) || x).join(', '),
      };
    });
  }

  /** Known places for the Add-trip picker — every customer site. */
  @Get('places')
  async places() {
    const clients = await this.prisma.client.findMany({
      select: { id: true, name: true, addr: true, city: true },
      orderBy: { name: 'asc' },
    });
    return clients.map((c) => ({
      id: c.id, name: c.name, dest: [c.addr, c.city].filter(Boolean).join(', '),
    }));
  }

  private async ola(): Promise<string> {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    if (!ig.olaKey) {
      throw new BadRequestException('Ola Maps is not connected — Settings → Integrations');
    }
    /*
     * Count it. Ola publishes no usage endpoint, so the only honest figure for
     * the Credentials page is the one we keep ourselves — and it is the number
     * that matters, because it is what they bill. One counter per month, so a
     * new month starts clean without anything having to reset it.
     */
    const key = 'ola.calls.' + new Date().toISOString().slice(0, 7);
    await this.prisma.seq.upsert({
      where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } },
    }).catch(() => { /* metering must never break the call it is counting */ });

    return open(ig.olaKey);
  }

  /**
   * Free place search for the Add-trip picker — a bank, a supplier, anywhere
   * that is not a customer site. Exactly ONE Ola autocomplete call per
   * request, and the app fires it only on an explicit Search tap — never per
   * keystroke — so the quota is safe.
   */
  @Get('search')
  async search(@Query('q') q?: string) {
    const query = String(q || '').trim();
    if (query.length < 3) throw new BadRequestException('Type at least 3 letters of the place');
    const key = await this.ola();
    const r = await fetch(
      'https://api.olamaps.io/places/v1/autocomplete?input=' + encodeURIComponent(query) +
      '&language=en&api_key=' + key,
    );
    const data = (await r.json()) as {
      predictions?: Array<{
        description?: string;
        geometry?: { location?: { lat: number; lng: number } };
      }>;
      reason?: string;
    };
    if (!r.ok) return { results: [], reason: data.reason || 'Ola could not search right now' };
    return {
      results: (data.predictions || []).slice(0, 6)
        .map((p) => ({ label: p.description || '' }))
        .filter((p) => p.label),
    };
  }

  /**
   * One address → one pair of coordinates. Exactly ONE Ola call per request,
   * no retries — the caller caches the answer.
   */
  @Get('geocode')
  async geocode(@Query('q') q?: string) {
    const query = String(q || '').trim();
    if (!query) throw new BadRequestException('Give an address to look up');
    const key = await this.ola();
    const r = await fetch(
      'https://api.olamaps.io/places/v1/geocode?address=' + encodeURIComponent(query) +
      '&language=en&api_key=' + key,
    );
    const data = (await r.json()) as {
      geocodingResults?: Array<{ formatted_address?: string; geometry?: { location?: { lat: number; lng: number } } }>;
      reason?: string;
    };
    const g = data.geocodingResults?.[0];
    if (!r.ok || !g?.geometry?.location) {
      return { found: false, reason: data.reason || 'No match for that address' };
    }
    return {
      found: true,
      lat: g.geometry.location.lat,
      lng: g.geometry.location.lng,
      formatted: g.formatted_address || query,
    };
  }

  /**
   * Road route between two points — distance and time along the actual roads
   * from Ola's routing engine. ONE call per request, no retries.
   */
  @Get('route')
  async route(@Query('from') from?: string, @Query('to') to?: string) {
    const f = String(from || '').trim();
    const t = String(to || '').trim();
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(f) || !/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(t)) {
      throw new BadRequestException('from/to must be lat,lng');
    }
    const key = await this.ola();
    const r = await fetch(
      // overview=full — 'simplified' collapses the geometry to almost nothing,
      // which drew a straight line instead of the road.
      // alternatives=true — Ola will offer several ways there, and we were
      // taking whichever it happened to list first. Asking costs the same
      // call; not asking meant never having the choice.
      'https://api.olamaps.io/routing/v1/directions?origin=' + encodeURIComponent(f) +
      '&destination=' + encodeURIComponent(t) +
      '&alternatives=true&overview=full&api_key=' + key,
      { method: 'POST' },
    );
    const data = (await r.json()) as {
      routes?: Array<{ overview_polyline?: string; legs?: Array<{
        distance?: number | { value?: number }; duration?: number | { value?: number };
        steps?: Array<{
          instructions?: string; distance?: number; duration?: number; maneuver?: string;
          end_location?: { lat: number; lng: number };
        }>;
      }> }>;
      reason?: string; status?: string;
    };
    const num = (v: number | { value?: number } | undefined) =>
      typeof v === 'number' ? v : (v && typeof v.value === 'number' ? v.value : 0);

    /*
     * Pick the shortest way, not the first one listed.
     *
     * Distance decides, because distance is what the business pays for — a
     * trip is reimbursed by the kilometre, and a route two kilometres longer
     * costs real money on every visit.
     *
     * The tie-break matters as much as the rule. Two roads within five per
     * cent of each other are the same length as far as anybody cares, and
     * between those the faster one wins: nobody thanks you for saving two
     * hundred metres down a lane that takes ten minutes longer.
     */
    const options = (data.routes || [])
      .map((rt) => ({
        rt,
        leg: rt.legs?.[0],
        m: Math.round(num(rt.legs?.[0]?.distance)),
        s: Math.round(num(rt.legs?.[0]?.duration)),
      }))
      .filter((o) => o.leg && o.m > 0);

    if (!r.ok || !options.length) {
      throw new BadRequestException('Ola could not route this: ' + (data.reason || data.status || r.status));
    }

    const shortest = Math.min(...options.map((o) => o.m));
    const best = options
      .filter((o) => o.m <= shortest * 1.05)
      .sort((a, b) => a.s - b.s)[0];
    const leg = best.leg!;

    return {
      distanceM: best.m,
      durationS: best.s,
      polyline: best.rt.overview_polyline || '',
      /* What was rejected, so a screen can say "shortest of 3" rather than
         asking anybody to take it on faith. */
      considered: options.length,
      alternatives: options
        .filter((o) => o !== best)
        .map((o) => ({ distanceM: o.m, durationS: o.s })),
      // Turn-by-turn steps from the SAME call — following them costs nothing.
      steps: (leg.steps || []).map((st) => ({
        text: String(st.instructions || ''),
        distanceM: Math.round(st.distance || 0),
        durationS: Math.round(st.duration || 0),
        maneuver: String(st.maneuver || ''),
        lat: st.end_location?.lat ?? 0,
        lng: st.end_location?.lng ?? 0,
      })),
    };
  }

  /** The breadcrumb trail of one trip — feeds the live map, one read, no Ola call. */
  @Get(':id/path')
  async path(@Param('id') id: string, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    const role = req.user?.role || '';
    if (!t || (t.userId !== (req.user?.sub || '') && role !== 'admin' && role !== 'ops')) {
      throw new NotFoundException('Not your trip');
    }
    return { points: (Array.isArray(t.points) ? t.points : []) as unknown as Pt[] };
  }

  /** My running trip, if any. */
  @Get('active')
  async active(@Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findFirst({
      where: { userId: req.user?.sub || '', status: 'active' },
      orderBy: { startAt: 'desc' },
    });
    return t ? this.shape(t) : null;
  }

  /** One GPS breadcrumb. Distance grows along the actual path driven. */
  @Post(':id/ping')
  async ping(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t || t.userId !== (req.user?.sub || '')) throw new NotFoundException('Not your trip');
    if (t.status !== 'active') throw new BadRequestException('This trip has ended');

    const lat = Number(body.lat), lng = Number(body.lng);
    const acc = Number(body.acc) || 0;
    if (!isFinite(lat) || !isFinite(lng)) throw new BadRequestException('Bad coordinates');
    /*
     * A fix this vague cannot measure anything. 150 m of uncertainty on a
     * city street is not a position, it is a neighbourhood — and it was being
     * accepted and differenced against the last one as though it were.
     */
    if (acc > 60) return { distanceM: t.distanceM, points: (t.points as unknown as Pt[]).length };

    const pts = (Array.isArray(t.points) ? t.points : []) as unknown as Pt[];
    const cur: Pt = { lat, lng, t: new Date().toISOString() };
    let add = 0;
    if (pts.length) {
      const step = metres(pts[pts.length - 1], cur);
      /*
       * How far is far enough to be real?
       *
       * A flat three metres was the wrong question. A phone reporting twenty
       * metres of accuracy can report positions fifteen metres apart while
       * sitting in a parked van, and every one of those used to be counted —
       * a trip that never moved could accumulate a kilometre. Meanwhile a
       * genuinely accurate phone creeping through traffic gets thrown away
       * for moving only two metres.
       *
       * So the bar is the accuracy of the fix itself: movement has to be
       * bigger than the uncertainty before it counts as movement. A good fix
       * measures small steps; a poor one is not trusted with them.
       *
       * Set to the full accuracy rather than a fraction of it, because two
       * independent fixes each uncertain by twenty metres routinely land
       * twenty metres apart while the handbrake is on — a fraction of that
       * still lets a stationary van clock a hundred metres, which the test
       * below caught on the first attempt.
       */
      const floor = Math.max(5, acc);
      if (step > floor && step <= 2000) add = Math.round(step);
      else if (step <= floor) { return { distanceM: t.distanceM, points: pts.length }; }
    }
    pts.push(cur);
    const up = await this.prisma.trip.update({
      where: { id },
      data: { points: pts as never, distanceM: t.distanceM + add },
    });
    return { distanceM: up.distanceM, points: pts.length };
  }

  @Post(':id/end')
  async end(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t || t.userId !== (req.user?.sub || '')) throw new NotFoundException('Not your trip');

    // A planned figure to measure against: whatever the app sent at start,
    // else the shortest route between the first and last GPS fix (one Ola
    // call, best-effort). Without one there is nothing to compare.
    const pts = (Array.isArray(t.points) ? t.points : []) as unknown as Pt[];
    let plannedM = t.plannedM;
    if (!plannedM && pts.length >= 2) {
      plannedM = await this.plannedMetres(pts[0], pts[pts.length - 1]);
    }

    // Flag the drive against the shortest route: more than 40% + 2 km longer
    // is worth the office's eyes. No planned figure (Ola off, or a free-form
    // trip) means nothing to compare — it passes through as auto-approved.
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
        endPlace: String(body.endPlace || t.dest || '').trim().slice(0, 200),
        flagged, flagReason,
        review: flagged ? 'pending' : 'auto',
      },
    });
    return this.shape(up);
  }

  /** My history — admin and ops can see everyone with ?all=1. */
  @Get()
  async list(@Req() req: Request & Jwt, @Query('all') all?: string, @Query('branch') branch?: string) {
    const role = req.user?.role || '';
    const everyone = all === '1' && (role === 'admin' || role === 'ops');
    // "Everyone" is everyone in your scope: ops see their branch's trips,
    // admin sees all — narrowed by the filter dropdown when asked.
    let scopeIds: string[] | null = null;
    if (everyone) {
      const scope = clampScope(await branchScope(this.prisma, req.user), branch);
      if (scope !== null) {
        scopeIds = (await this.prisma.user.findMany({
          where: { branches: { hasSome: scope } }, select: { id: true },
        })).map((u) => u.id);
      }
    }
    const rows = await this.prisma.trip.findMany({
      where: everyone
        ? (scopeIds ? { userId: { in: scopeIds } } : {})
        : { userId: req.user?.sub || '' },
      orderBy: { startAt: 'desc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((t) => ({ ...this.shape(t), userName: nameOf.get(t.userId) || '—' }));
  }

  private shape(t: {
    id: string; userId: string; purpose: string; jobId: string; status: string;
    startAt: Date; endAt: Date | null; distanceM: number; points: unknown;
  }) {
    const pts = (Array.isArray(t.points) ? t.points : []) as Pt[];
    const end = t.endAt ? t.endAt.getTime() : Date.now();
    const x = t as Record<string, unknown>;
    return {
      id: t.id, userId: t.userId, purpose: t.purpose, jobId: t.jobId, status: t.status,
      startAt: t.startAt.toISOString(), endAt: t.endAt ? t.endAt.toISOString() : null,
      distanceM: t.distanceM,
      plannedM: Number(x.plannedM) || 0,
      dest: String(x.dest || ''),
      startPlace: String(x.startPlace || ''),
      endPlace: String(x.endPlace || ''),
      review: String(x.review || 'pending'),
      flagged: !!x.flagged,
      flagReason: String(x.flagReason || ''),
      reviewNote: String(x.reviewNote || ''),
      claimId: String(x.claimId || ''),
      mins: Math.max(0, Math.round((end - t.startAt.getTime()) / 60000)),
      points: pts.length,
      last: pts.length ? pts[pts.length - 1] : null,
    };
  }

  /* ==================================================================
     THE OFFICE SIDE — monitor, review/reject, daily report, claim.
     ================================================================== */

  /** userIds inside the caller's branch scope (null = admin, everyone). */
  private async scopedUserIds(req: Request & Jwt, branch?: string): Promise<string[] | null> {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    if (scope === null) return null;
    const us = await this.prisma.user.findMany({
      where: { branches: { hasSome: scope } }, select: { id: true },
    });
    return us.map((u) => u.id);
  }

  private manage(role?: string) { return role === 'admin' || role === 'ops'; }

  /** The dashboard: today's KPIs and every trip today, branch-scoped. */
  @Get('dashboard')
  async dashboard(@Req() req: Request & Jwt, @Query('branch') branch?: string) {
    if (!this.manage(req.user?.role)) throw new NotFoundException('Not found');
    const ids = await this.scopedUserIds(req, branch);
    const day = todayISO();
    const start = new Date(day + 'T00:00:00');
    const rate = await this.kmRate();
    const rows = await this.prisma.trip.findMany({
      where: {
        ...(ids ? { userId: { in: ids } } : {}),
        OR: [{ startAt: { gte: start } }, { status: 'active' }],
      },
      orderBy: { startAt: 'desc' },
      take: 200,
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, color: true } });
    const uOf = new Map(users.map((u) => [u.id, u]));

    const active = rows.filter((t) => t.status === 'active');
    const doneToday = rows.filter((t) => t.status !== 'active');
    const distM = doneToday.filter((t) => t.review !== 'rejected').reduce((a, t) => a + t.distanceM, 0);
    return {
      rate,
      kpi: {
        trips: rows.length,
        onRoad: active.length,
        distanceKm: Math.round(distM / 1000),
        cost: Math.round((distM / 1000) * rate),
        needsReview: doneToday.filter((t) => t.review === 'pending').length,
      },
      rows: rows.map((t) => ({
        ...this.shape(t),
        userName: uOf.get(t.userId)?.name || 'Former staff',
        userColor: uOf.get(t.userId)?.color || '#888',
        cost: Math.round((t.distanceM / 1000) * rate),
      })),
    };
  }

  /** One trip in full, for the review screen — manager in scope, or its owner. */
  @Get(':id/detail')
  async detail(@Param('id') id: string, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such trip');
    const mine = t.userId === (req.user?.sub || '');
    if (!mine) {
      if (!this.manage(req.user?.role) || !inScope(await branchScope(this.prisma, req.user), t.branch)) {
        throw new NotFoundException('No such trip');
      }
    }
    const [u, rate] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: t.userId }, select: { name: true, color: true } }),
      this.kmRate(),
    ]);
    return {
      ...this.shape(t),
      userName: u?.name || 'Former staff',
      userColor: u?.color || '#888',
      cost: Math.round((t.distanceM / 1000) * rate),
      rate,
      canManage: this.manage(req.user?.role),
    };
  }

  /** Approve or reject a finished trip. Rejecting drops it from the claim. */
  @Post(':id/review')
  @Roles('admin', 'ops')
  async reviewTrip(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such trip');
    if (!inScope(await branchScope(this.prisma, req.user), t.branch)) throw new NotFoundException('No such trip');
    if (t.claimId) throw new BadRequestException('This trip is already on a claim — decide it there');
    const approve = !!body.approve;
    const note = String(body.note || '').trim();
    if (!approve && !note) throw new BadRequestException('Give a reason for rejecting');
    await this.prisma.trip.update({
      where: { id },
      data: {
        review: approve ? 'approved' : 'rejected',
        reviewNote: note, reviewedBy: req.user?.sub || '', reviewedAt: new Date(),
        flagged: approve ? false : t.flagged,
      },
    });
    const km = (t.distanceM / 1000).toFixed(1);
    await this.notify(t.userId, approve
      ? `Trip approved: ${t.startPlace || 'trip'} \u2192 ${t.endPlace || t.dest} (${km} km). (${t.id})`
      : `Trip rejected: ${note} \u2014 ${t.startPlace || 'trip'} \u2192 ${t.endPlace || t.dest}. (${t.id})`);
    return { ok: true };
  }

  /** The office ends someone's running trip remotely. */
  @Post(':id/cancel')
  @Roles('admin', 'ops')
  async cancelTrip(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such trip');
    if (!inScope(await branchScope(this.prisma, req.user), t.branch)) throw new NotFoundException('No such trip');
    const note = String(body.note || '').trim() || 'Cancelled by the office';
    await this.prisma.trip.update({
      where: { id },
      data: {
        status: 'cancelled', endAt: t.endAt || new Date(),
        review: 'rejected', reviewNote: note, reviewedBy: req.user?.sub || '', reviewedAt: new Date(),
      },
    });
    await this.notify(t.userId, `Trip cancelled by the office: ${note}. (${t.id})`);
    return { ok: true };
  }

  /**
   * The daily report: each person's driving for a day, totalled. Rejected
   * trips fall out; everything else counts, whether the admin looked or not
   * \u2014 exactly the client's rule.
   */
  @Get('report')
  async report(@Req() req: Request & Jwt, @Query('date') date?: string, @Query('branch') branch?: string) {
    if (!this.manage(req.user?.role)) throw new NotFoundException('Not found');
    const day = String(date || todayISO()).slice(0, 10);
    const ids = await this.scopedUserIds(req, branch);
    const start = new Date(day + 'T00:00:00');
    const end = new Date(day + 'T23:59:59.999');
    const rate = await this.kmRate();
    const rows = await this.prisma.trip.findMany({
      where: {
        ...(ids ? { userId: { in: ids } } : {}),
        status: { not: 'active' },
        startAt: { gte: start, lte: end },
      },
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, color: true } });
    const uOf = new Map(users.map((u) => [u.id, u]));
    const per = new Map<string, { trips: number; distM: number; review: number; claimed: number }>();
    for (const t of rows) {
      if (t.review === 'rejected') continue;
      const g = per.get(t.userId) || { trips: 0, distM: 0, review: 0, claimed: 0 };
      g.trips += 1; g.distM += t.distanceM;
      if (t.review === 'pending') g.review += 1;
      if (t.claimId) g.claimed += 1;
      per.set(t.userId, g);
    }
    const people = Array.from(per.entries()).map(([uid, g]) => ({
      userId: uid,
      name: uOf.get(uid)?.name || 'Former staff',
      color: uOf.get(uid)?.color || '#888',
      trips: g.trips,
      distanceKm: +(g.distM / 1000).toFixed(1),
      cost: Math.round((g.distM / 1000) * rate),
      toReview: g.review,
      claimed: g.claimed,
    })).sort((a, b) => b.cost - a.cost);
    return {
      date: day, rate,
      people,
      total: {
        trips: people.reduce((a, p) => a + p.trips, 0),
        distanceKm: +people.reduce((a, p) => a + p.distanceKm, 0).toFixed(1),
        cost: people.reduce((a, p) => a + p.cost, 0),
        toReview: people.reduce((a, p) => a + p.toReview, 0),
      },
    };
  }

  /**
   * Push a day's un-rejected, un-claimed trips into each person's expense
   * folder \u2014 one trip line each, locked to the GPS distance \u00d7 the ₹/km rate.
   * From there it is the ordinary Expenses \u2192 approve \u2192 RazorpayX payout.
   */
  @Post('report/push')
  @Roles('admin', 'ops')
  async pushToClaim(@Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const day = String(body.date || todayISO()).slice(0, 10);
    const ids = await this.scopedUserIds(req, String(body.branch || '') || undefined);
    const rate = await this.kmRate();
    if (!rate) throw new BadRequestException('Set the ₹-per-km rate first (Settings \u2192 Organisation)');
    const start = new Date(day + 'T00:00:00');
    const end = new Date(day + 'T23:59:59.999');
    const rows = await this.prisma.trip.findMany({
      where: {
        ...(ids ? { userId: { in: ids } } : {}),
        status: { not: 'active' },
        startAt: { gte: start, lte: end },
        review: { not: 'rejected' },
        claimId: '',
        distanceM: { gt: 0 },
      },
      orderBy: { startAt: 'asc' },
    });
    if (!rows.length) return { pushed: 0, folders: 0 };

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = day.split('-');
    const title = 'Trips \u2014 ' + Number(parts[2]) + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];

    const byUser = new Map<string, typeof rows>();
    for (const t of rows) {
      if (!byUser.has(t.userId)) byUser.set(t.userId, [] as never);
      byUser.get(t.userId)!.push(t);
    }
    let folders = 0, pushed = 0;
    for (const [uid, trips] of byUser) {
      const seq = await this.prisma.seq.upsert({
        where: { key: 'expense-report' }, create: { key: 'expense-report', value: 1 },
        update: { value: { increment: 1 } },
      });
      const reportId = 'EXR-' + seq.value;
      await this.prisma.expenseReport.create({
        data: {
          id: reportId, title, date: day, by: uid, branch: trips[0].branch,
          note: 'Auto-built from the day\u2019s trips',
          history: [{ at: nowStamp(), text: 'Created from ' + trips.length + ' trip(s) by the office' }] as never,
        },
      });
      folders += 1;
      for (const t of trips) {
        const eseq = await this.prisma.seq.upsert({
          where: { key: 'expense' }, create: { key: 'expense', value: 1 },
          update: { value: { increment: 1 } },
        });
        const km = +(t.distanceM / 1000).toFixed(1);
        await this.prisma.expense.create({
          data: {
            id: 'EXP-' + eseq.value, reportId, kind: 'trip', date: day,
            category: 'Trip allowance',
            merchant: (t.startPlace || 'Trip') + ' \u2192 ' + (t.endPlace || t.dest || ''),
            note: t.id, amount: Math.round(km * rate), km, rate,
          },
        });
        await this.prisma.trip.update({ where: { id: t.id }, data: { claimId: reportId } });
        pushed += 1;
      }
      await this.notify(uid, 'Your trips for ' + title.replace('Trips \u2014 ', '') +
        ' are ready to claim \u2014 ' + trips.length + ' trip(s). (' + reportId + ')');
    }
    return { pushed, folders };
  }
}
