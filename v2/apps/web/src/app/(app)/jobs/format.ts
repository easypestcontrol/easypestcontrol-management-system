/* ============================================================================
   Jobs + Schedule module — local formatting helpers and API payload types.

   Date/label helpers ported from v1 store.js:320-374 (fmtTime, relDay,
   durationText…). Anything the shared package exports (daysBetween, addDays,
   dayOfWeek) is imported, never reimplemented.
   ========================================================================== */

import { daysBetween } from 'shared';

/* ------------------------------------------------------------- constants */

/** Bookable time slots — v1 jobs.js:14. */
export const SLOTS = ['06:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '14:00', '15:30', '17:00', '18:30', '20:00', '22:00'];

export const JOB_TYPES = ['One-Time', 'Callback', 'Complaint', 'Inspection', 'AMC Visit'];

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * Status meta in the three-color system. `pill` is the zpill variant for
 * tables; `cal` tints calendar/kanban chips: in-progress wears the red (the
 * active state), en-route the navy, the rest are washes of the ink.
 */
export const STATUS: Record<string, { label: string; pill: string; cal: string; bar: string }> = {
  scheduled:  { label: 'Scheduled',   pill: 'zpill outline', cal: 'bg-white text-ink border-line',                       bar: 'var(--color-muted-2)' },
  enroute:    { label: 'En route',    pill: 'zpill navy',    cal: 'bg-navy text-white border-navy',                      bar: 'var(--color-navy)' },
  inprogress: { label: 'In progress', pill: 'zpill red',     cal: 'bg-red-wash text-accent border-red-line',             bar: 'var(--color-accent)' },
  completed:  { label: 'Completed',   pill: 'zpill',         cal: 'bg-wash text-muted border-line-soft',                 bar: 'var(--color-line)' },
  cancelled:  { label: 'Cancelled',   pill: 'zpill',         cal: 'bg-white text-muted-2 border-line-soft line-through', bar: 'var(--color-line-soft)' },
};

/* --------------------------------------------------------------- helpers */

const pad2 = (n: number) => String(n).padStart(2, '0');

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function parse(ds?: string | null): Date | null {
  if (!ds) return null;
  const p = String(ds).slice(0, 10).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function fmtDate(ds?: string | null): string {
  const d = parse(ds);
  return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : '—';
}

export function fmtLong(ds?: string | null): string {
  const d = parse(ds);
  return d ? DOWL[d.getDay()] + ', ' + d.getDate() + ' ' + MONL[d.getMonth()] + ' ' + d.getFullYear() : '—';
}

export function dayDelta(ds: string): number {
  return daysBetween(todayISO(), ds);
}

export function relDay(ds: string): string {
  const n = dayDelta(ds);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return 'In ' + n + ' days';
  if (n < -1 && n > -7) return -n + ' days ago';
  return fmtDate(ds);
}

/** '14:30' -> '2:30 PM'; also accepts a full 'YYYY-MM-DDTHH:MM' stamp. */
export function fmtTime(hhmm?: string | null): string {
  if (!hhmm) return '—';
  const t = String(hhmm).slice(-5);
  let h = parseInt(t.split(':')[0], 10);
  const m = t.split(':')[1];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}

export function durationText(mins?: number | null): string {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

/* ----------------------------------------------------------- API payloads */

export interface ExecChemical { id: string; qty: number }

/** One line of "in the kitchen I did this" — the area-wise findings. */
export interface AreaFinding { area: string; text: string }

export interface ExecRecord {
  checkinAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMins: number;
  geo: string;
  photosBefore: string[];
  photosAfter: string[];
  chemicals: ExecChemical[];
  findings: string[];
  areaFindings: AreaFinding[];
  observations: string;
  techNotes: string;
  reportSentAt: string;
  reportSentTo: string;
  reportBy: string;
  uniformPhotos: Record<string, string>;
  signedBy: string;
  signature: boolean;
  signatureImage: string;
  rating: number;
  feedback: string;
}

export interface JobRow {
  id: string;
  type: string;
  contractId: string;
  clientId: string;
  serviceIds: string[];
  date: string;
  slot: string;
  slotEnd: string;
  mins: number;
  techIds: string[];
  /** Who records the work on this service. Always set when there is a crew. */
  headTechId: string;
  crewNeed: number;
  status: string;
  priority: string;
  visitNo: number;
  ofVisits: number;
  notes: string;
  pinned: boolean;
  clientName: string;
  clientArea?: string;
  title: string;
}

export interface JobCounts {
  today: number; upcoming: number; open: number; unassigned: number; completed: number;
}

export interface JobsList { rows: JobRow[]; counts: JobCounts }

export interface JobTech {
  id: string; name: string; title: string; phone: string;
  skills: string[]; color: string; photo: string; rating: number;
}

export interface JobDetail extends JobRow {
  exec: ExecRecord | null;
  /**
   * Whether this service has been billed, and nothing more.
   *
   * Deliberately carries no amount and no payment status: a technician who
   * knows the visit is invoiced knows enough, and showing him whether the
   * customer has paid would only invite him to chase it. Null while the
   * service is still billable, or if its invoice was withdrawn.
   */
  invoice: { id: string; date: string } | null;
  client: {
    id: string; name: string; type: string; contact: string; phone: string;
    addr: string; city: string; pin: string; area: string; color: string;
    // Marked once by the first technician to stand there — §4.1.
    siteLat?: number | null; siteLng?: number | null;
    siteGeoAt?: string; siteGeoBy?: string;
  } | null;
  contract: {
    id: string; mode: string; freq: string; billing: string;
    totalVisits: number; start: string; end: string;
  } | null;
  techs: JobTech[];
  services: Array<{ id: string; name: string; mins: number; warranty: string }>;
  inventory: Array<{ id: string; name: string; cat: string; unit: string; stock: number; note: string }>;
}

export interface DayJob {
  id: string; type: string; contractId: string; clientId: string; clientName: string;
  title: string; date: string; slot: string; mins: number; techIds: string[];
  status: string; priority: string; visitNo: number; ofVisits: number;
}

export interface MonthData {
  month: string; start: string; days: Record<string, DayJob[]>; total: number; today: string;
}

export interface DayBoard {
  date: string;
  today: string;
  techs: Array<{
    id: string; name: string; title: string; color: string; photo: string;
    jobs: DayJob[]; done: number; mins: number;
  }>;
  unassigned: DayJob[];
  counts: { total: number; completed: number; open: number };
  strip: Array<{ date: string; count: number }>;
}
