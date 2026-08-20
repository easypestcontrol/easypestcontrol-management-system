/* ============================================================================
   The visit engine — a contract's plan becomes the trips on the calendar.

   Ported 1:1 from v1 (data.js planVisits / lineSpread), with the one addition
   the v1 design review demanded: every generated visit now carries `crew`,
   the peak-simultaneous headcount, stamped at generation.

   Two different units, deliberately:
     mins  = SUM  across merged services — minutes on site are ELAPSED, the
             crew does the spray, then the fly treatment, sequentially.
     crew  = MAX  across merged services — people are PEAK-SIMULTANEOUS, the
             three who do the gel are two of the same three who do the termite.
   Summing crew gave "7 technicians required" for a trip four people make.
   ========================================================================== */

import {
  addDays, addMonths, applyDayRule, daysBetween, nextAllowedDay, FREQ_MONTHS,
} from './time';

export interface PlanLineInput {
  svId: string;
  visits?: number;
  months?: number;
  mins?: number;
  dayRule?: string;
  startAt?: string;
  slot?: string;
  freq?: string;
  crew?: number;
  techIds?: string[];
  /** Hand-picked visit dates by index; an empty slot falls back to the spread. */
  dates?: string[];
}

export interface ContractInput {
  id?: string;
  start: string;
  end?: string;
  months?: number;
  slot?: string;
  mergeSameDay?: boolean;
  workdaysOnly?: boolean;
  blackout?: string[];
  plan: PlanLineInput[];
}

export interface VisitPlan {
  date: string;
  movedFrom: string; // '' when the wanted date was allowed as-is
  serviceIds: string[];
  techIds: string[]; // union of the merged lines' crews, clamped per line first
  planRef: string[]; // "<contractId>#<svId>" per contributing line
  mins: number; // SUM — elapsed time on site
  crew: number; // MAX — peak-simultaneous people
  slot: string;
  lines: number;
}

/** The people actually standing on a line, clamped to what the line asks for. */
export function lineCrew(l: PlanLineInput | null | undefined): string[] {
  if (!l) return [];
  const list = (l.techIds || []).filter(Boolean);
  return list.slice(0, Math.max(1, l.crew || 1));
}

export interface LineSpread {
  months: number;
  term: number; // days
  visits: number;
  gap: number; // days between visits
}

export function lineSpread(line: PlanLineInput, c: ContractInput): LineSpread {
  const months = line.months || c.months || 12;
  const from = line.startAt || c.start;
  const term = Math.max(1, daysBetween(from, addMonths(from, months)));
  const visits = Math.max(1, line.visits ||
    Math.round(months / (FREQ_MONTHS[line.freq || ''] || 1)));
  return { months, term, visits, gap: term / visits };
}

/**
 * Turn a contract's plan into the visits it should produce.
 * Services falling on the same date at the same site become ONE visit carrying
 * every service due — duration is the sum, technicians the union, crew the max.
 */
/**
 * One line's visit dates in generation order. A month or more between visits
 * keeps the calendar-month rhythm and the "always the 18th" anchor; anything
 * faster is spread evenly in days. A hand-picked date (line.dates[v]) is
 * honoured exactly — even on a Sunday — because someone chose it.
 */
export function lineVisitDates(
  line: PlanLineInput, c: ContractInput,
): Array<{ date: string; movedFrom: string }> {
  const sp = lineSpread(line, c);
  const n = sp.visits;
  const byMonth = sp.gap >= 28;
  const step = byMonth ? Math.max(1, Math.round(sp.months / n)) : 0;
  const from = line.startAt || c.start;
  const out: Array<{ date: string; movedFrom: string }> = [];
  for (let v = 0; v < n; v++) {
    const pinned = line.dates && line.dates[v] ? String(line.dates[v]).slice(0, 10) : '';
    if (pinned) { out.push({ date: pinned, movedFrom: '' }); continue; }
    const wanted = byMonth
      ? applyDayRule(addMonths(from, v * step), line.dayRule)
      : addDays(from, Math.round(v * sp.term / n));
    const date = nextAllowedDay(wanted, c.blackout || [], c.workdaysOnly !== false);
    out.push({ date, movedFrom: date === wanted ? '' : wanted });
  }
  return out;
}

export function planVisits(c: ContractInput): VisitPlan[] {
  const merge = c.mergeSameDay !== false;
  const groups: Record<string, { date: string; movedFrom: string; lines: PlanLineInput[] }> = {};

  for (const line of c.plan || []) {
    for (const { date, movedFrom } of lineVisitDates(line, c)) {
      if (c.end && date > c.end) continue; // never schedule past the term
      const key = merge ? date : date + '|' + line.svId;
      if (!groups[key]) groups[key] = { date, movedFrom, lines: [] };
      groups[key].lines.push(line);
    }
  }

  return Object.keys(groups).map((k) => {
    const g = groups[k];
    const serviceIds: string[] = [];
    const techIds: string[] = [];
    const planRef: string[] = [];
    let mins = 0;
    let crew = 1;
    let slot = '';

    for (const l of g.lines) {
      if (serviceIds.indexOf(l.svId) < 0) serviceIds.push(l.svId);
      mins += l.mins || 60;
      crew = Math.max(crew, Math.max(1, l.crew || 1));
      if (!slot) slot = l.slot || '';
      for (const id of lineCrew(l)) if (techIds.indexOf(id) < 0) techIds.push(id);
      planRef.push((c.id || 'NEW') + '#' + l.svId);
    }

    return {
      date: g.date, movedFrom: g.movedFrom, serviceIds,
      techIds: techIds.slice(0, crew), // a trip never carries more than its peak
      planRef, mins, crew,
      slot: slot || c.slot || '10:00',
      lines: g.lines.length,
    };
  }).sort((a, b) => (a.date === b.date ? (a.slot < b.slot ? -1 : 1) : (a.date < b.date ? -1 : 1)));
}

/* ------------------------------------------------------------------ crew */

/**
 * The most people this contract ever needs on site at once: each visit-day
 * needs its BIGGEST service (one crew works through the merged trip), and the
 * contract needs its biggest day.
 */
export function peakCrew(lines: PlanLineInput[], visits: VisitPlan[]): number {
  const need: Record<string, number> = {};
  for (const l of lines || []) need[l.svId] = Math.max(1, l.crew || 1);

  let peak = 0;
  for (const v of visits || []) {
    let day = 0;
    for (const id of v.serviceIds) day = Math.max(day, need[id] || 1);
    peak = Math.max(peak, day);
  }
  if (!peak) for (const l of lines || []) peak = Math.max(peak, Math.max(1, l.crew || 1));
  return peak;
}

export interface StaffingRow {
  svId: string;
  need: number;
  have: string[];
  short: number;
  over: number;
}

export interface Staffing {
  rows: StaffingRow[];
  missing: number;
  extra: number;
  ok: boolean;
}

/** Which services are short of people, and which somehow hold too many. */
export function staffing(lines: PlanLineInput[]): Staffing {
  const rows = (lines || []).map((l) => {
    const need = Math.max(1, l.crew || 1);
    const have = lineCrew(l);
    return {
      svId: l.svId, need, have,
      short: Math.max(0, need - have.length),
      over: Math.max(0, have.length - need),
    };
  });
  const missing = rows.reduce((a, r) => a + r.short, 0);
  const extra = rows.reduce((a, r) => a + r.over, 0);
  return { rows, missing, extra, ok: rows.length > 0 && missing === 0 && extra === 0 };
}
