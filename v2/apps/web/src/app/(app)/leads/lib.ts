/* ============================================================================
   Leads — types, stage list and the date/phone helpers the board, drawer and
   capture form all share. Ported from v1 leads.js + store.js.
   ========================================================================== */

import { daysBetween } from 'shared';

/* ------------------------------------------------------------------ types */

export interface LogEntry { at: string; text: string; by: string }

export interface Lead {
  id: string; name: string; phone: string; email: string; type: string;
  area: string; source: string; stage: string; value: number;
  followUp: string; notes: string; owner: string; branch: string;
  clientId: string; contractId: string; log: LogEntry[]; createdAt: string;
}

export interface LeadQuote {
  id: string; status: string; mode: string; freq: string; title: string;
  date: string; valid?: string; total: number;
}

export interface LeadContract {
  id: string; mode: string; start: string; end: string; value: number;
  billing: string; totalVisits: number;
}

export interface HistoryLead {
  id: string; name: string; phone: string; clientId: string; stage: string;
  value: number; area: string; createdAt: string;
}

export interface LeadDetail extends Lead {
  quotes: LeadQuote[];
  contracts: LeadContract[];
  history: HistoryLead[];
  client: { id: string; name: string } | null;
}

export interface BootUser {
  id: string; name: string; role: string; title: string; color: string;
  branches: string[];
}
export interface BootBranch { id: string; name: string; code: string; areas: string[] }
export interface BootService { id: string; code: string; name: string; price: number }

/* ------------------------------------------------------------- stage data */

// v1 LEAD_STAGES (data.js:372-380) — ids and labels kept; the per-stage hues
// are gone on purpose: this UI is navy, red and white only.
export const STAGES = [
  { id: 'new', label: 'New Lead' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'contract', label: 'Contract' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
] as const;

export const stageLabel = (id: string) =>
  STAGES.find((s) => s.id === id)?.label || id;

/** Stages that still count as live pipeline (store.js:194). */
export const OPEN_STAGES = ['new', 'followup', 'inspection', 'quoted', 'contract'];
export const isOpen = (l: { stage: string }) => OPEN_STAGES.indexOf(l.stage) >= 0;

// Master lists — v1 kept these under Master Data (data.js:368-370); the v2
// schema has no table for them yet, so they live here.
export const LEAD_SOURCES = ['WhatsApp', 'Call', 'Website', 'Referral', 'Walk-in', 'Instagram', 'JustDial'];
export const PROPERTY_TYPES = ['Residential', 'Society', 'Commercial', 'Retail', 'Industrial',
  'Healthcare', 'Education', 'Corporate', 'Hospitality'];

/* ------------------------------------------------------------------ phone */

/** Last 10 digits — the only reliable way to match a phone (store.js:199). */
export const phoneKey = (v: string) => String(v || '').replace(/\D/g, '').slice(-10);

/* ------------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0');
export function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export const dayDelta = (iso: string) => daysBetween(todayISO(), iso);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso: string) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return '—';
  return p[2] + ' ' + MON[p[1] - 1] + ' ' + p[0];
}
export function fmtShort(iso: string) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return '—';
  return p[2] + ' ' + MON[p[1] - 1];
}
export function fmtTime(hhmm: string) {
  if (!hhmm) return '—';
  const t = String(hhmm).slice(-5);
  let h = parseInt(t.split(':')[0], 10);
  const m = t.split(':')[1];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}

/** 'Today' / 'Tomorrow' / 'In 3 days' / '2 days ago' / a date (store.js:338). */
export function relDay(iso: string) {
  const d = String(iso || '').slice(0, 10);
  if (!d) return '—';
  const n = dayDelta(d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return 'In ' + n + ' days';
  if (n < -1 && n > -7) return -n + ' days ago';
  return fmtDate(d);
}

/* ------------------------------------------------------------- due states */

/**
 * The dated commitment a lead is sitting on (leads.js:63-71). In v2 the one
 * followUp column carries both kinds of date: a call-back when the lead is in
 * Follow-up, the site visit when it is in Inspection.
 */
export function commitment(l: { stage: string; followUp: string }) {
  if (l.stage === 'followup' && l.followUp) return { kind: 'Follow up', date: l.followUp };
  if (l.stage === 'inspection' && l.followUp) return { kind: 'Inspect', date: l.followUp };
  return null;
}

/** Overdue and due-today burn red; everything further out stays muted (leads.js:73-82). */
export function dueState(l: { stage: string; followUp: string }) {
  const c = commitment(l);
  if (!c) return null;
  const n = dayDelta(c.date);
  const when = fmtShort(c.date);
  if (n < 0) return { ...c, when, text: 'Overdue ' + -n + 'd', cls: 'text-accent font-semibold' };
  if (n === 0) return { ...c, when, text: 'Due today', cls: 'text-accent' };
  if (n === 1) return { ...c, when, text: 'Tomorrow', cls: 'text-muted' };
  return { ...c, when, text: 'In ' + n + ' days', cls: 'text-muted' };
}

/* -------------------------------------------------------------- territory */

const areaKey = (v: string) =>
  String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Which branch looks after this locality — exact area match first, then a
 * substring match, then the branch name itself (store.js:168-190).
 */
export function branchForArea(branches: BootBranch[], area: string): BootBranch | null {
  const k = areaKey(area);
  if (!k) return null;
  let hit = branches.find((b) => (b.areas || []).some((a) => areaKey(a) === k));
  if (hit) return hit;
  hit = branches.find((b) => (b.areas || []).some((a) => {
    const ak = areaKey(a);
    return !!ak && (ak.indexOf(k) >= 0 || k.indexOf(ak) >= 0);
  }));
  if (hit) return hit;
  return branches.find((b) => {
    const nk = areaKey(b.name);
    return !!nk && nk.indexOf(k) >= 0;
  }) || null;
}

/* ------------------------------------------------------------------ owners */

/**
 * Who can own a lead: sales first, then ops, then admin — technicians and
 * accounts never chase customers (store.js:142-147).
 */
export function assignableUsers(users: BootUser[]): BootUser[] {
  const rank: Record<string, number> = { sales: 0, ops: 1, admin: 2 };
  return users
    .filter((u) => rank[u.role] != null)
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

/* -------------------------------------------------------------- avatar bits */

export const initials = (name: string) =>
  String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
