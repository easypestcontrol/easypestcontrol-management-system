/* ============================================================================
   Contracts — pure server-side helpers around the shared visit engine.

   Everything here is a plain function over fetched rows: the controller does
   the Prisma I/O, these decide. Ported from v1 store.js (planDiff, applyPlan,
   planWarnings, syncCrew, contractStatus, planSummary) so a contract's
   schedule behaves exactly as it did before the rewrite.
   ========================================================================== */

import {
  cadenceLabel, daysBetween, lineCrew, lineSpread, planVisits,
  type ContractInput, type PlanLineInput, type VisitPlan,
} from 'shared';

/* ------------------------------------------------------------------ shapes */

/** A PlanLine row as stored (structural — matches the Prisma model). */
export interface DbPlanLine {
  svId: string;
  visits: number;
  months: number; // 0 = the whole contract term
  mins: number;
  dayRule: string;
  startAt: string;
  slot: string;
  freq: string;
  crew: number;
  techIds: string[];
  dates?: string[]; // hand-picked visit dates by index
  slotEnd?: string; // booked window end
  order?: number;
}

/** The slice of a Contract row the engine needs. */
export interface DbContractCore {
  id: string;
  start: string;
  end: string;
  months: number;
  slot: string;
  mergeSameDay: boolean;
  workdaysOnly: boolean;
  blackout: string[];
  notes: string;
}

/** The slice of a Job row the plan engine reads and writes. */
export interface DbJob {
  id: string;
  date: string;
  slot: string;
  mins: number;
  serviceIds: string[];
  techIds: string[];
  status: string;
  pinned: boolean;
  visitNo: number;
  ofVisits: number;
}

/* ------------------------------------------------------------------- dates */

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 'YYYY-MM-DDTHH:MM' local — the v1 nowStamp. */
export function nowStamp(): string {
  const d = new Date();
  return todayISO() + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Days from today to a date; negative = past. v1 store.js dayDelta. */
export function dayDelta(iso: string): number {
  return daysBetween(todayISO(), iso);
}

/* ------------------------------------------------------------- the bridge */

/** A stored plan line as the shared engine wants it. */
export function lineToInput(l: DbPlanLine): PlanLineInput {
  return {
    svId: l.svId,
    visits: l.visits,
    months: l.months || undefined, // 0 = whole term → engine falls back to c.months
    mins: l.mins,
    dayRule: l.dayRule,
    startAt: l.startAt || undefined,
    slot: l.slot,
    freq: l.freq,
    crew: l.crew,
    techIds: l.techIds,
    dates: l.dates || [],
  };
}

export function contractToInput(c: DbContractCore, plan: DbPlanLine[]): ContractInput {
  return {
    id: c.id,
    start: c.start,
    end: c.end,
    months: c.months || undefined,
    slot: c.slot,
    mergeSameDay: c.mergeSameDay,
    workdaysOnly: c.workdaysOnly,
    blackout: c.blackout,
    plan: plan.map(lineToInput),
  };
}

/* ------------------------------------------------------------------ status */

/** Expired / expiring soon / active — v1 store.js:410-415. */
export function contractStatus(end: string): { key: string; label: string } {
  const d = dayDelta(end);
  if (d < 0) return { key: 'expired', label: 'Expired' };
  if (d <= 30) return { key: 'expiring', label: 'Expiring soon' };
  return { key: 'active', label: 'Active' };
}

/**
 * How the cadence reads to a person — v1 planSummary. One interval across the
 * board says "Monthly"; a mixed plan names which service codes run how often.
 */
export function planSummary(
  plan: DbPlanLine[], legacyFreq: string, short: boolean,
  codeOf: (svId: string) => string,
): string {
  if (!plan.length) return legacyFreq || '—';
  const byFreq: Record<string, string[]> = {};
  for (const l of plan) (byFreq[l.freq] = byFreq[l.freq] || []).push(codeOf(l.svId));
  const keys = Object.keys(byFreq);
  if (keys.length === 1) return keys[0];
  if (short) return keys.length + ' intervals';
  return keys.map((f) => byFreq[f].join('/') + ' ' + f.toLowerCase()).join(', ');
}

/* --------------------------------------------------------------- freezing */

const FROZEN = ['completed', 'inprogress', 'enroute'];

/**
 * A visit the plan may not touch: one already being served, or one a
 * dispatcher has moved by hand on the board. Hand placement outranks the
 * engine — otherwise the next plan run quietly undoes the day's work.
 */
export function isFrozen(j: Pick<DbJob, 'status' | 'pinned'>): boolean {
  return FROZEN.indexOf(j.status) >= 0 || !!j.pinned;
}

/* ------------------------------------------------------------------- diff */

export interface PlanDiff {
  proposed: VisitPlan[];
  frozen: DbJob[];
  add: VisitPlan[];
  keep: Array<{ job: DbJob; pv: VisitPlan }>;
  update: Array<{ job: DbJob; pv: VisitPlan }>;
  remove: DbJob[];
}

/**
 * What applying the plan would do, without doing it — v1 store.js:1198-1228.
 * A proposed visit on a date holding a frozen job is skipped entirely; open
 * jobs are bucketed FIFO by date; kept only when nothing about them changes.
 */
export function planDiff(c: DbContractCore, plan: DbPlanLine[], jobs: DbJob[]): PlanDiff {
  const proposed = planVisits(contractToInput(c, plan));
  const sorted = jobs.slice().sort((a, b) => (a.date === b.date
    ? (a.slot === b.slot ? (a.id < b.id ? -1 : 1) : (a.slot < b.slot ? -1 : 1))
    : (a.date < b.date ? -1 : 1)));

  const frozen = sorted.filter(isFrozen);
  const frozenOn: Record<string, 1> = {};
  for (const j of frozen) frozenOn[j.date] = 1;

  const openOn: Record<string, DbJob[]> = {};
  for (const j of sorted) if (!isFrozen(j)) (openOn[j.date] = openOn[j.date] || []).push(j);

  const add: VisitPlan[] = [];
  const keep: Array<{ job: DbJob; pv: VisitPlan }> = [];
  const update: Array<{ job: DbJob; pv: VisitPlan }> = [];

  for (const pv of proposed) {
    if (frozenOn[pv.date]) continue; // that day is already done
    const list = openOn[pv.date];
    if (list && list.length) {
      const j = list.shift() as DbJob;
      const same = j.mins === pv.mins && j.slot === pv.slot &&
        (j.serviceIds || []).join() === pv.serviceIds.join() &&
        (j.techIds || []).join() === pv.techIds.join();
      (same ? keep : update).push({ job: j, pv });
    } else add.push(pv);
  }

  const remove: DbJob[] = [];
  for (const d of Object.keys(openOn)) for (const j of openOn[d]) remove.push(j);

  return { proposed, frozen, add, keep, update, remove };
}

/* --------------------------------------------------------------- warnings */

export interface PlanWarning { tone: 'ok' | 'warn' | 'crit'; text: string }

/**
 * Things worth telling the user before they commit — v1 store.js:1231-1259.
 * `busyOn(techId, date)` counts that technician's OTHER-contract services on
 * a date, `nameOf` turns a user id into a name for the clash line.
 */
export function planWarnings(
  proposed: VisitPlan[], contractJobs: DbJob[],
  busyOn: (techId: string, date: string) => number,
  nameOf: (id: string) => string,
  fmtDate: (iso: string) => string,
): PlanWarning[] {
  const out: PlanWarning[] = [];

  const pinned = contractJobs.filter((j) => j.pinned && FROZEN.indexOf(j.status) < 0).length;
  if (pinned) out.push({ tone: 'ok', text: pinned + ' service' + (pinned === 1 ? '' : 's') +
    ' placed by hand on the board will be left exactly where they are' });

  const moved = proposed.filter((v) => v.movedFrom).length;
  if (moved) out.push({ tone: 'warn', text: moved + ' service' + (moved === 1 ? '' : 's') +
    ' moved off a Sunday to the next working day' });

  const unassigned = proposed.filter((v) => !v.techIds.length).length;
  if (unassigned) out.push({ tone: 'warn', text: unassigned + ' service' +
    (unassigned === 1 ? '' : 's') + ' have no technician yet' });

  const clashes: string[] = [];
  for (const v of proposed) {
    for (const t of v.techIds) {
      const busy = busyOn(t, v.date);
      if (busy >= 4 && clashes.length < 3) {
        clashes.push(nameOf(t) + ' already has ' + busy + ' services on ' + fmtDate(v.date));
      }
    }
  }
  for (const t of clashes) out.push({ tone: 'crit', text: t });

  if (!proposed.length) out.push({ tone: 'crit', text: 'This plan produces no services at all' });
  return out;
}

/* ---------------------------------------------------------------- crew */

/** Peak-simultaneous people a job needs — max crew of the plan lines it covers. */
export function jobCrewSize(job: Pick<DbJob, 'serviceIds' | 'techIds'>, plan: DbPlanLine[]): number {
  if (!plan.length) return Math.max(1, (job.techIds || []).length);
  let n = 0;
  for (const l of plan) {
    if ((job.serviceIds || []).indexOf(l.svId) >= 0) n = Math.max(n, Math.max(1, l.crew || 1));
  }
  return Math.max(1, n);
}

export interface CrewSync {
  /** jobId → new techIds, for every pending visit the plan may re-stamp. */
  writes: Array<{ id: string; techIds: string[] }>;
  updated: number;
  held: number; // frozen (done, under way, or hand-placed) — left alone
}

/**
 * Re-stamp the technicians on every visit still to come, from the plan —
 * v1 store.js syncCrew. A merged trip covers more than one service, so it
 * gets everyone on any service due that day, clamped at the trip's peak.
 */
export function syncCrew(plan: DbPlanLine[], jobs: DbJob[]): CrewSync {
  const byService: Record<string, string[]> = {};
  for (const l of plan) byService[l.svId] = lineCrew(lineToInput(l));

  const writes: Array<{ id: string; techIds: string[] }> = [];
  let held = 0;
  for (const j of jobs) {
    if (isFrozen(j)) { held++; continue; }
    const ids: string[] = [];
    for (const sv of j.serviceIds || []) {
      for (const id of byService[sv] || []) if (ids.indexOf(id) < 0) ids.push(id);
    }
    writes.push({ id: j.id, techIds: ids.slice(0, Math.max(1, jobCrewSize(j, plan))) });
  }
  return { writes, updated: writes.length, held };
}

/* ------------------------------------------------------------ line cadence */

/** The freq label a line works out to — what v1 readPlan/planFromQuote stamp. */
export function lineFreq(l: DbPlanLine, c: DbContractCore): string {
  const sp = lineSpread(lineToInput(l), contractToInput(c, []));
  return cadenceLabel(sp.gap, sp.visits);
}

/* ----------------------------------------------------------------- format */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'D Mon YYYY' — the v1 fmtDate. */
export function fmtDate(iso: string): string {
  const p = String(iso || '').split('-').map(Number);
  if (!p[0]) return '—';
  return p[2] + ' ' + (MONTHS_SHORT[(p[1] || 1) - 1] || '') + ' ' + p[0];
}

/** Last 10 digits — how v1 matches a lead's phone to an existing customer. */
export function phoneKey(p: string): string {
  return String(p || '').replace(/\D/g, '').slice(-10);
}
