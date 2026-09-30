/* ============================================================================
   Reading a trip.

   A trip is a list of GPS fixes. Everything the office wants to know about it
   - how far, by which road, was it the planned road, how much on foot, where
   did they stop, and how much of it the phone actually saw - is worked out
   from that list here, in one place, by functions that take data and return
   data. Nothing in this file talks to the database or to the map provider,
   so the same trip always reads the same way, on the review screen, in the
   flag that sends it for review, and in a test.

   What it cannot do is invent what the phone did not record. A stretch where
   the GPS was silent is carried as ESTIMATED - its distance comes from the
   road map between the fixes on either side - and it is never judged for
   being on or off the route, because nobody knows which road was taken.
   ========================================================================== */

export interface Pt {
  lat: number; lng: number; t: string;
  /** Accuracy of the fix, metres. */
  a?: number;
  /** The phone's own speed, m/s, when it reported one. */
  s?: number;
  /** Not a fix: a point of the road route bridging a stretch the GPS missed. */
  e?: 1;
  /** The first real fix after such a stretch. */
  g?: 1;
}

/** The longest silence that is still "tracking": beyond it, and with real
    ground covered, the stretch is a gap. */
export const GAP_S = 45;
export const GAP_M = 150;
/** Three minutes in one place is a stop. */
export const STOP_S = 180;
export const STOP_M = 150;
/** Under about 7 km/h somebody is walking (or crawling in traffic). */
export const WALK_MS = 2.0;
/** Further than this from the planned road is another road. */
export const OFF_M = 120;
/** Nothing on a road does 160 km/h in this business: a jump this fast is a bad fix. */
export const MAX_MS = 45;

/** Metres between two coordinates - plain haversine. */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** An encoded polyline (precision 5, what the directions API returns) as points. */
export function decodePolyline(str: string): Array<{ lat: number; lng: number }> {
  let index = 0; let lat = 0; let lng = 0;
  const out: Array<{ lat: number; lng: number }> = [];
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let shift = 0; let result = 0; let b = 0x20;
      while (b >= 0x20 && index < str.length) {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      }
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/**
 * How far a point is from a line drawn on the ground, in metres.
 *
 * The line is projected flat around the point - fine over the few kilometres
 * a trip covers - and the answer is the distance to the nearest point ON a
 * segment, not to the nearest vertex: a straight two-kilometre stretch of
 * highway has a vertex at each end and nothing between.
 */
export function distToLine(p: { lat: number; lng: number }, line: Array<{ lat: number; lng: number }>): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return metres(p, line[0]);
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let best = Infinity;
  let ax = (line[0].lng - p.lng) * kx;
  let ay = (line[0].lat - p.lat) * ky;
  for (let i = 1; i < line.length; i++) {
    const bx = (line[i].lng - p.lng) * kx;
    const by = (line[i].lat - p.lat) * ky;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // Where along a->b the point falls, clamped to the segment.
    const u = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const cx = ax + u * dx; const cy = ay + u * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best) best = d;
    ax = bx; ay = by;
  }
  return best;
}

export type Kind = 'd' | 'w' | 'g';

export interface Stop { lat: number; lng: number; at: string; mins: number }

export interface Check { tone: 'good' | 'warn' | 'bad' | 'plain'; text: string }

export interface TripReading {
  /** Per point: how the stretch ENDING at it was covered, and whether it left the planned road. */
  kinds: Kind[];
  off: boolean[];
  stops: Stop[];
  stats: {
    fixes: number;          // real GPS fixes
    measuredM: number;      // covered between real fixes
    estimatedM: number;     // bridged from the road map
    driveM: number;
    walkM: number;
    offRouteM: number;
    judgedM: number;        // driven and recorded: what can be compared with the planned road
    onRoutePct: number | null;
    maxOffM: number;
    gaps: number;
    gapS: number;
    stoppedS: number;
    movingS: number;
    maxKmh: number;
    avgKmh: number;
    endToDestM: number | null;
    reached: boolean | null;
  };
}

const secs = (a: Pt, b: Pt) => Math.max(0, (Date.parse(b.t) - Date.parse(a.t)) / 1000);

/**
 * Read a trip: classify every stretch, find the stops, and measure it
 * against the planned road.
 */
export function readTrip(
  pts: Pt[], planned: Array<{ lat: number; lng: number }>, dest: { lat: number; lng: number } | null,
): TripReading {
  const n = pts.length;
  const kinds: Kind[] = new Array(n).fill('d');
  const off: boolean[] = new Array(n).fill(false);
  const stops: Stop[] = [];
  const d: number[] = new Array(n).fill(0);   // metres of the pair ending at i
  const dt: number[] = new Array(n).fill(0);  // its seconds
  const isStop: boolean[] = new Array(n).fill(false);

  for (let i = 1; i < n; i++) {
    d[i] = metres(pts[i - 1], pts[i]);
    dt[i] = secs(pts[i - 1], pts[i]);
    if (pts[i].e || pts[i].g || pts[i - 1].e) { kinds[i] = 'g'; continue; }
    if (dt[i] >= STOP_S && d[i] < STOP_M) {
      isStop[i] = true;
      stops.push({ lat: pts[i - 1].lat, lng: pts[i - 1].lng, at: pts[i - 1].t, mins: Math.round(dt[i] / 60) });
    }
  }

  /* Walking or driving, by the speed over the stretches around it rather
     than one pair alone: a single slow pair is a red light, five in a row is
     somebody on foot. */
  let maxMs = 0;
  for (let i = 1; i < n; i++) {
    if (kinds[i] === 'g') continue;
    if (isStop[i]) { kinds[i] = 'w'; continue; } // the few metres drifted while standing
    let m = 0; let s = 0;
    for (let j = Math.max(1, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      if (kinds[j] === 'g' || isStop[j]) continue;
      m += d[j]; s += dt[j];
    }
    const v = s > 0 ? m / s : 0;
    kinds[i] = v < WALK_MS ? 'w' : 'd';
    if (v > maxMs && v <= MAX_MS) maxMs = v;
  }

  // On the planned road, or another one - judged only where the phone saw it.
  const hasPlan = planned.length >= 2;
  const far: boolean[] = new Array(n).fill(false);
  let maxOffM = 0;
  if (hasPlan) {
    for (let i = 0; i < n; i++) {
      if (pts[i].e) continue;
      const away = distToLine(pts[i], planned);
      const slack = OFF_M + Math.min(40, pts[i].a || 0);
      far[i] = away > slack;
      if (far[i] && away > maxOffM) maxOffM = away;
    }
    /* Only a DRIVEN stretch can be "another road". Somebody on foot a hundred
       metres from the planned line is inside the customer's compound, not
       on a detour. */
    for (let i = 1; i < n; i++) off[i] = kinds[i] === 'd' && !isStop[i] && far[i] && far[i - 1];
  }

  let measuredM = 0; let estimatedM = 0; let driveM = 0; let walkM = 0;
  let offRouteM = 0; let gapS = 0; let stoppedS = 0; let gaps = 0; let movingS = 0;
  for (let i = 1; i < n; i++) {
    if (kinds[i] === 'g') {
      estimatedM += d[i]; gapS += dt[i];
      if (pts[i].g) gaps += 1;
      continue;
    }
    measuredM += d[i];
    if (isStop[i]) { stoppedS += dt[i]; continue; }
    movingS += dt[i];
    if (kinds[i] === 'w') walkM += d[i]; else driveM += d[i];
    if (off[i]) offRouteM += d[i];
  }
  const judgedM = hasPlan ? driveM : 0;
  const last = n ? pts[n - 1] : null;
  const endToDestM = dest && last ? Math.round(metres(last, dest)) : null;

  return {
    kinds, off, stops,
    stats: {
      fixes: pts.filter((p) => !p.e).length,
      measuredM: Math.round(measuredM), estimatedM: Math.round(estimatedM),
      driveM: Math.round(driveM), walkM: Math.round(walkM),
      offRouteM: Math.round(offRouteM), judgedM: Math.round(judgedM),
      onRoutePct: judgedM > 50 ? Math.max(0, Math.round(((judgedM - offRouteM) / judgedM) * 100)) : null,
      maxOffM: Math.round(maxOffM),
      gaps, gapS: Math.round(gapS), stoppedS: Math.round(stoppedS), movingS: Math.round(movingS),
      maxKmh: Math.round(maxMs * 3.6),
      avgKmh: movingS > 0 ? Math.round(((driveM + walkM) / movingS) * 3.6) : 0,
      endToDestM,
      reached: endToDestM === null ? null : endToDestM <= 300,
    },
  };
}

const km1 = (m: number) => (m / 1000).toFixed(1) + ' km';

/**
 * The reading, said in sentences - what the office reads first. Each line is
 * a fact with a colour: nothing here is a guess dressed up as a finding.
 */
export function tripChecks(
  r: TripReading, t: { distanceM: number; plannedM: number; estM: number; hasDest: boolean; hasPlan: boolean; done: boolean },
): Check[] {
  const s = r.stats;
  const out: Check[] = [];

  if (s.fixes < 2) {
    out.push({
      tone: 'bad',
      text: s.fixes === 0
        ? 'The phone sent no GPS position for this trip, so there is no route to show and no distance.'
        : 'The phone sent a single GPS position, so there is no route to show and no distance.',
    });
    out.push({
      tone: 'plain',
      text: 'GPS is recorded only while the app is open on the screen with Location allowed. A trip started on a computer records nothing.',
    });
    return out;
  }

  // The road taken
  if (!t.hasPlan) {
    out.push({
      tone: 'plain',
      text: t.hasDest
        ? 'No planned route to compare with - the destination could not be placed on the map.'
        : 'No planned route to compare with - the trip had no destination.',
    });
  } else if (s.onRoutePct === null) {
    out.push({ tone: 'plain', text: 'Too little was recorded by GPS to compare with the planned route.' });
  } else if (s.offRouteM < 300 || s.onRoutePct >= 90) {
    /* "Followed the route" is a claim about the whole drive. When the phone
       saw only part of it, the claim is only about that part - and says so. */
    const seenAll = t.estM <= 0 || s.judgedM >= t.distanceM * 0.8;
    out.push(seenAll
      ? { tone: 'good', text: 'Followed the planned route (' + s.onRoutePct + '% of the driven distance was on it).' }
      : { tone: 'plain', text: 'On the planned route for the ' + km1(s.judgedM) + ' the GPS recorded - the rest of the ' + km1(t.distanceM) + ' was not seen.' });
  } else {
    out.push({
      tone: s.onRoutePct < 60 ? 'bad' : 'warn',
      text: 'Took a different road for ' + km1(s.offRouteM) + ' of the ' + km1(s.judgedM)
        + ' driven - up to ' + (s.maxOffM >= 1000 ? km1(s.maxOffM) : s.maxOffM + ' m') + ' away from the planned route.',
    });
  }

  // The distance
  if (t.plannedM > 0 && t.distanceM > 0) {
    const diff = t.distanceM - t.plannedM;
    if (diff > Math.max(500, t.plannedM * 0.15)) {
      out.push({
        tone: diff > t.plannedM * 0.4 + 2000 ? 'bad' : 'warn',
        text: km1(diff) + ' longer than the shortest route (' + km1(t.distanceM) + ' against ' + km1(t.plannedM) + ').',
      });
    } else if (diff < -Math.max(500, t.plannedM * 0.25) && t.done) {
      out.push({
        tone: 'warn',
        text: km1(-diff) + ' shorter than the shortest route (' + km1(t.distanceM) + ' against ' + km1(t.plannedM)
          + ') - the trip ended early or part of it was not recorded.',
      });
    } else {
      out.push({ tone: 'good', text: 'Distance matches the shortest route (' + km1(t.distanceM) + ' against ' + km1(t.plannedM) + ').' });
    }
  }

  // What the phone did not see
  if (t.estM > 0) {
    out.push({
      tone: t.estM > t.distanceM * 0.5 ? 'bad' : 'warn',
      text: km1(t.estM) + ' of the ' + km1(t.distanceM) + ' is estimated from the road map: the GPS was silent '
        + s.gaps + (s.gaps === 1 ? ' time' : ' times') + ', ' + Math.round(s.gapS / 60) + ' min in all. The road taken in those stretches is not known.',
    });
  }

  if (s.walkM >= 200) out.push({ tone: 'plain', text: km1(s.walkM) + ' was at walking pace (under 7 km/h).' });
  if (r.stops.length) {
    const total = r.stops.reduce((a, x) => a + x.mins, 0);
    out.push({
      tone: 'plain',
      text: r.stops.length + (r.stops.length === 1 ? ' stop' : ' stops') + ' of three minutes or more, ' + total + ' min in all.',
    });
  }
  if (t.done && s.reached === false && s.endToDestM !== null) {
    out.push({
      tone: 'warn',
      text: 'The trip ended ' + (s.endToDestM >= 1000 ? km1(s.endToDestM) : s.endToDestM + ' m') + ' from the destination.',
    });
  } else if (t.done && s.reached) {
    out.push({ tone: 'good', text: 'Ended at the destination.' });
  }
  return out;
}
