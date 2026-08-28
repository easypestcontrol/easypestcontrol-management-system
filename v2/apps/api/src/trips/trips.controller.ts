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
import { AuthGuard } from '../auth/auth.guard';
import { branchScope, clampScope } from '../branch.util';
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

@Controller('trips')
@UseGuards(AuthGuard)
export class TripsController {
  constructor(private prisma: PrismaService) {}

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
    await this.prisma.trip.create({
      data: {
        id, userId, purpose,
        jobId: String(body.jobId || ''),
        dest: String(body.dest || '').trim().slice(0, 200),
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
  async end(@Param('id') id: string, @Req() req: Request & Jwt) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t || t.userId !== (req.user?.sub || '')) throw new NotFoundException('Not your trip');
    const up = await this.prisma.trip.update({
      where: { id }, data: { status: 'done', endAt: new Date() },
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
    return {
      id: t.id, userId: t.userId, purpose: t.purpose, jobId: t.jobId, status: t.status,
      startAt: t.startAt.toISOString(), endAt: t.endAt ? t.endAt.toISOString() : null,
      distanceM: t.distanceM,
      dest: (t as { dest?: string }).dest || '',
      mins: Math.max(0, Math.round((end - t.startAt.getTime()) / 60000)),
      points: pts.length,
      last: pts.length ? pts[pts.length - 1] : null,
    };
  }
}
