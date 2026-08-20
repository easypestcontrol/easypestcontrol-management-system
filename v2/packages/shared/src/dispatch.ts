/* ============================================================================
   Dispatch — who can take a job, when, and who should.

   Ported from v1 store.js (dropCheck, freeGaps, firstFree, suggestTechs,
   autoAssign, balanceDay) as PURE functions: the caller fetches the day's
   jobs and the roster, these decide. Warnings never refuse — a dispatcher
   usually knows something the system does not.
   ========================================================================== */

import { toMin, toHHMM, dayOfWeek } from './time';

export interface WorkHours { from: string; to: string; days: number[] }

export interface TechLike {
  id: string;
  name: string;
  skills?: string[];
  branches?: string[];
  hoursFrom?: string;
  hoursTo?: string;
  hoursDays?: number[];
}

export interface CompanyHours { hoursFrom: string; hoursTo: string; hoursDays: number[] }

export interface JobLike {
  id: string;
  contractId?: string; // same-contract jobs may share one trip
  date: string;
  slot: string;
  mins: number;
  techIds: string[];
  serviceIds: string[];
  status: string;
  crewNeed?: number;
  priority?: string;
  pinned?: boolean;
}

/** A technician's day; nothing recorded means the company default. */
export function workHours(u: TechLike | null, co: CompanyHours): WorkHours {
  return {
    from: (u?.hoursFrom) || co.hoursFrom || '09:00',
    to: (u?.hoursTo) || co.hoursTo || '18:00',
    days: (u?.hoursDays?.length ? u.hoursDays : co.hoursDays) || [1, 2, 3, 4, 5, 6],
  };
}

export function onDuty(
  u: TechLike, co: CompanyHours, dateISO: string, fromMin: number, toMinute: number,
): { ok: boolean; why?: string } {
  const h = workHours(u, co);
  if (h.days.indexOf(dayOfWeek(dateISO)) < 0) return { ok: false, why: 'not a working day' };
  if (fromMin < toMin(h.from)) return { ok: false, why: 'starts before ' + h.from };
  if (toMinute > toMin(h.to)) return { ok: false, why: 'runs past ' + h.to };
  return { ok: true };
}

export interface DropWarning { level: 'block' | 'warn'; text: string }

/**
 * Can this technician take this job at this minute? `dayJobs` is every job on
 * that date (any technician); `svcNames` maps service ids to display names for
 * the skill check; `jobBranchId` is the branch the customer belongs to.
 */
export function dropCheck(
  job: JobLike, tech: TechLike, co: CompanyHours, dateISO: string, startMin: number,
  dayJobs: JobLike[], svcNames: Record<string, string>, jobBranchId?: string,
): DropWarning[] {
  const out: DropWarning[] = [];
  const mins = job.mins || 60;
  const end = startMin + mins;
  const mine = dayJobs.filter((o) => o.id !== job.id && o.techIds.indexOf(tech.id) >= 0);

  // Already somewhere else at that moment — UNLESS it is the same contract:
  // one trip to the site covers every service of that contract, so the same
  // technician doing two of them at the same time is the plan, not a clash.
  for (const o of mine) {
    const a = toMin(o.slot); const b = a + (o.mins || 60);
    if (startMin < b && end > a) {
      if (o.contractId && job.contractId && o.contractId === job.contractId) {
        out.push({ level: 'warn', text: `Same trip as ${o.id} — one visit covers both services` });
      } else {
        out.push({ level: 'block', text: `Clashes with ${o.id} (${o.slot}) — needs a different time` });
      }
    }
  }

  const duty = onDuty(tech, co, dateISO, startMin, end);
  if (!duty.ok) out.push({ level: 'warn', text: 'Outside working hours — ' + duty.why });

  // Trained for the work?
  const names = (job.serviceIds || []).map((id) => svcNames[id] || id);
  const skills = (tech.skills || []).map((x) => x.toLowerCase());
  if (skills.length && names.length) {
    const matched = names.filter((n) =>
      skills.some((sk) => n.toLowerCase().includes(sk) || sk.includes(n.toLowerCase())));
    if (!matched.length) out.push({ level: 'warn', text: 'Not listed for ' + names.join(', ') });
  }

  // The right side of town.
  if (jobBranchId && tech.branches?.length && tech.branches.indexOf(jobBranchId) < 0) {
    out.push({ level: 'warn', text: 'Different branch to the customer' });
  }

  // Short-handed is a fact worth saying, never a refusal.
  const need = Math.max(1, job.crewNeed || 1);
  if (need > 1) {
    const others = job.techIds.filter((x) => x !== tech.id).length;
    if (others + 1 < need) {
      out.push({ level: 'warn', text: `Needs ${need} people — going out ${need - others - 1} short` });
    }
  }

  // Enough of a gap to actually travel.
  const day = mine
    .map((o) => ({ a: toMin(o.slot), b: toMin(o.slot) + (o.mins || 60), id: o.id }))
    .sort((x, y) => x.a - y.a);
  const before = day.filter((x) => x.b <= startMin).pop();
  const after = day.filter((x) => x.a >= end)[0];
  const GAP = 30;
  if (before && startMin - before.b < GAP) {
    out.push({ level: 'warn', text: `Only ${startMin - before.b} min after ${before.id} to travel` });
  }
  if (after && after.a - end < GAP) {
    out.push({ level: 'warn', text: `Only ${after.a - end} min before ${after.id}` });
  }
  return out;
}

export interface Gap { from: number; to: number }

/** The free windows in somebody's day, with a travel buffer off each edge. */
export function freeGaps(
  tech: TechLike, co: CompanyHours, dateISO: string, dayJobs: JobLike[], buffer = 20,
): Gap[] {
  const h = workHours(tech, co);
  if (h.days.indexOf(dayOfWeek(dateISO)) < 0) return [];

  const busy = dayJobs
    .filter((o) => o.techIds.indexOf(tech.id) >= 0)
    .map((o) => ({ a: toMin(o.slot) - buffer, b: toMin(o.slot) + (o.mins || 60) + buffer }))
    .sort((x, y) => x.a - y.a);

  const out: Gap[] = [];
  let at = toMin(h.from);
  const close = toMin(h.to);
  for (const b of busy) {
    if (b.a > at) out.push({ from: at, to: Math.min(b.a, close) });
    at = Math.max(at, b.b);
  }
  if (at < close) out.push({ from: at, to: close });
  return out.filter((g) => g.to - g.from > 0);
}

const SNAP = 15;

/** The earliest minute this person could start a job of `mins`, or null. */
export function firstFree(
  tech: TechLike, co: CompanyHours, dateISO: string, dayJobs: JobLike[],
  mins: number, notBefore = 0,
): number | null {
  const need = mins || 60;
  const hit = freeGaps(tech, co, dateISO, dayJobs)
    .find((g) => Math.max(g.from, notBefore) + need <= g.to);
  if (!hit) return null;
  return Math.ceil(Math.max(hit.from, notBefore) / SNAP) * SNAP;
}

export interface SuggestReason { good: boolean; text: string }
export interface SuggestRow {
  tech: TechLike;
  score: number;
  at: number | null;
  why: SuggestReason[];
  bookedPct: number;
}

/**
 * Rank everybody for one job. The scoring is deliberately readable — a
 * dispatcher should be able to see why somebody came top.
 */
export function suggestTechs(
  job: JobLike, techs: TechLike[], co: CompanyHours, dateISO: string,
  dayJobs: JobLike[], svcNames: Record<string, string>, jobBranchId?: string,
  preferIds?: string[],
): SuggestRow[] {
  const names = (job.serviceIds || []).map((id) => svcNames[id] || id);
  const mins = job.mins || 60;

  const rows = techs.map((u) => {
    const why: SuggestReason[] = [];
    let score = 100;

    const h = workHours(u, co);
    const working = h.days.indexOf(dayOfWeek(dateISO)) >= 0;
    if (!working) { score -= 80; why.push({ good: false, text: 'Not working today' }); }

    if (jobBranchId && (u.branches || []).indexOf(jobBranchId) >= 0) {
      score += 26; why.push({ good: true, text: 'Covers this branch' });
    } else if (jobBranchId && u.branches?.length) {
      score -= 22; why.push({ good: false, text: 'Different branch' });
    }

    // Somebody already serving this customer's contract knows the site, the
    // gate pass and the paperwork — the strongest signal there is.
    if (preferIds?.length && preferIds.indexOf(u.id) >= 0) {
      score += 30; why.push({ good: true, text: "On this customer's contract" });
    }

    const skills = (u.skills || []).map((x) => x.toLowerCase());
    if (skills.length && names.length) {
      const match = names.filter((n) =>
        skills.some((sk) => n.toLowerCase().includes(sk) || sk.includes(n.toLowerCase())));
      if (match.length) { score += 18; why.push({ good: true, text: 'Does ' + match[0] }); }
      else { score -= 16; why.push({ good: false, text: 'Not listed for this work' }); }
    }

    const booked = dayJobs
      .filter((o) => o.techIds.indexOf(u.id) >= 0)
      .reduce((a, o) => a + (o.mins || 60), 0);
    const avail = Math.max(60, toMin(h.to) - toMin(h.from));
    const pct = booked / avail;
    score -= Math.round(pct * 45);
    why.push({ good: pct < 0.8, text: Math.round(pct * 100) + '% booked' });

    const at = working ? firstFree(u, co, dateISO, dayJobs, mins) : null;
    if (at == null) { score -= 55; why.push({ good: false, text: 'No gap long enough' }); }
    else why.push({ good: true, text: 'Free from ' + toHHMM(at) });

    return { tech: u, score, at, why, bookedPct: Math.round(pct * 100) };
  });

  return rows.sort((a, b) => b.score - a.score);
}

export interface Placement { jobId: string; techIds: string[]; startMin: number }

/**
 * Place everything waiting on a day. Urgent and long jobs first, one at a
 * time so each placement is visible to the next — assign them all against
 * the same snapshot and everybody lands on 9 AM.
 */
export function autoAssignPlan(
  queue: JobLike[], techs: TechLike[], co: CompanyHours, dateISO: string,
  dayJobs: JobLike[], svcNames: Record<string, string>,
  branchOf: (j: JobLike) => string | undefined,
): { placed: Placement[]; skipped: Array<{ jobId: string; reason: string }> } {
  const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const todo = [...queue].sort((a, b) => {
    const d = (rank[a.priority || 'normal'] ?? 2) - (rank[b.priority || 'normal'] ?? 2);
    return d || (b.mins || 60) - (a.mins || 60);
  });

  // A virtual copy of the day that each placement is appended to.
  const day = dayJobs.map((j) => ({ ...j, techIds: [...j.techIds] }));
  const placed: Placement[] = [];
  const skipped: Array<{ jobId: string; reason: string }> = [];

  for (const j of todo) {
    const crew = Math.max(1, j.crewNeed || 1);
    const ranked = suggestTechs(j, techs, co, dateISO, day, svcNames, branchOf(j))
      .filter((r) => r.at != null);
    if (ranked.length < crew) {
      skipped.push({
        jobId: j.id,
        reason: crew > techs.length
          ? `needs ${crew}, only ${techs.length} on the roster`
          : `nobody free and qualified (needs ${crew})`,
      });
      continue;
    }

    const take = ranked.slice(0, crew);
    // Everyone on the crew has to be free at the same moment.
    let start = take.reduce((m, r) => Math.max(m, r.at as number), 0);
    let ok = false;
    for (let tries = 0; tries < 8; tries++) {
      const ats = take.map((r) => firstFree(r.tech, co, dateISO, day, j.mins || 60, start));
      if (ats.some((x) => x == null)) break;
      const highest = Math.max(...(ats as number[]));
      if (highest === start) { ok = true; break; }
      start = highest;
    }
    if (!ok) { skipped.push({ jobId: j.id, reason: 'no shared free window for the crew' }); continue; }

    const ids = take.map((r) => r.tech.id);
    placed.push({ jobId: j.id, techIds: ids, startMin: start });
    day.push({ ...j, slot: toHHMM(start), techIds: ids });
  }

  return { placed, skipped };
}

/**
 * Move work off anybody over their hours onto anybody with room. Only
 * single-person, not-yet-started jobs move — splitting a crew automatically
 * is the kind of help nobody asked for.
 */
export function balancePlan(
  techs: TechLike[], co: CompanyHours, dateISO: string, dayJobs: JobLike[],
): Placement[] {
  const day = dayJobs.map((j) => ({ ...j, techIds: [...j.techIds] }));
  const moved: Placement[] = [];

  const state = (u: TechLike) => {
    const h = workHours(u, co);
    const avail = Math.max(60, toMin(h.to) - toMin(h.from));
    const booked = day.filter((o) => o.techIds.indexOf(u.id) >= 0)
      .reduce((a, o) => a + (o.mins || 60), 0);
    return { u, booked, avail, over: booked - avail };
  };

  for (let pass = 0; pass < 12; pass++) {
    const rows = techs.map(state).sort((a, b) => b.over - a.over);
    const worst = rows[0];
    if (!worst || worst.over <= 0) break;

    const cand = day
      .filter((o) => o.techIds.indexOf(worst.u.id) >= 0 &&
        o.status !== 'completed' && o.status !== 'inprogress' && o.techIds.length === 1)
      .sort((a, b) => toMin(b.slot) - toMin(a.slot))[0];
    if (!cand) break;

    const taker = rows.slice(1)
      .map((r) => ({ r, at: firstFree(r.u, co, dateISO, day.filter((x) => x.id !== cand.id), cand.mins || 60) }))
      .filter((x) => x.at != null && x.r.booked + (cand.mins || 60) <= x.r.avail)
      .sort((a, b) => a.r.booked - b.r.booked)[0];
    if (!taker) break;

    cand.techIds = [taker.r.u.id];
    cand.slot = toHHMM(taker.at as number);
    moved.push({ jobId: cand.id, techIds: [taker.r.u.id], startMin: taker.at as number });
  }
  return moved;
}
