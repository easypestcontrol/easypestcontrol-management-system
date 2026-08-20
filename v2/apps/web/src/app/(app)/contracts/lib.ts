/* ============================================================================
   Contracts pages — shared types, formats and constants.
   Domain math (visits, money, crew) comes from the shared package; only
   display helpers and the API payload shapes live here.
   ========================================================================== */

import { toMin, toHHMM } from 'shared';

/* --------------------------------------------------------------- constants */

/** Place of supply — the GST state decides CGST+SGST vs IGST (v1 data.js). */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Booking slots, labelled as two-hour windows (v1 amcform.js SLOTS). */
export const SLOTS = ['06:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '14:00', '15:30', '17:00', '18:30', '20:00', '22:00'];

/* ----------------------------------------------------------------- formats */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 'D Mon YYYY'. */
export function fmtDate(iso: string): string {
  const p = String(iso || '').split('-').map(Number);
  if (!p[0]) return '—';
  return p[2] + ' ' + (MON[(p[1] || 1) - 1] || '') + ' ' + p[0];
}

/** 'D Mon'. */
export function fmtShort(iso: string): string {
  const p = String(iso || '').split('-').map(Number);
  if (!p[0]) return '—';
  return p[2] + ' ' + (MON[(p[1] || 1) - 1] || '');
}

/** 12-hour clock: '10:00' → '10:00 AM'. */
export function fmtTime(hhmm: string): string {
  const p = String(hhmm || '').split(':').map(Number);
  if (isNaN(p[0])) return '—';
  const h = p[0] % 12 || 12;
  return h + ':' + String(p[1] || 0).padStart(2, '0') + ' ' + (p[0] < 12 ? 'AM' : 'PM');
}

function daysFromToday(iso: string): number {
  const t = todayISO().split('-').map(Number);
  const p = String(iso).split('-').map(Number);
  return Math.round((new Date(p[0], p[1] - 1, p[2]).getTime() -
    new Date(t[0], t[1] - 1, t[2]).getTime()) / 86400000);
}

/** Today / Tomorrow / In n days / n days ago / date (v1 relDay). */
export function relDay(iso: string): string {
  const n = daysFromToday(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return 'In ' + n + ' days';
  if (n < -1 && n > -7) return -n + ' days ago';
  return fmtDate(iso);
}

/** 45 → '45 min', 90 → '1h 30m'. */
export function durationText(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

export function addMinsHHMM(hhmm: string, mins: number): string {
  return toHHMM((toMin(hhmm) + mins) % 1440);
}

/** '10:00' → '10:00 AM – 12:00 PM' (every slot is a two-hour window). */
export function slotLabel(t: string): string {
  return fmtTime(t) + ' – ' + fmtTime(addMinsHHMM(t, 120));
}

export function ordinal(n: number | string): string {
  const x = Number(n);
  if (x === 1 || x === 21 || x === 31) return x + 'st';
  if (x === 2 || x === 22) return x + 'nd';
  if (x === 3 || x === 23) return x + 'rd';
  return x + 'th';
}

export function initials(name: string): string {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
}

/* --------------------------------------------------------------- API types */

export interface BootUser {
  id: string; name: string; role: string; color: string; sign?: string;
  branches: string[]; skills: string[];
}
export interface BootService {
  id: string; code: string; name: string; cat: string; price: number;
  unit: string; mins: number; desc: string;
}
export interface BootBranch { id: string; name: string; code: string }
export interface Boot {
  company: {
    name: string; state: string; gstRate: number; terms: string[];
    docTerms?: { quotation?: string[]; invoice?: string[]; contract?: string[]; service?: string[] };
  };
  branches: BootBranch[];
  users: BootUser[];
  services: BootService[];
}

export interface ClientLite {
  id: string; name: string; phone: string; addr: string; city: string;
  pin: string; color: string; contact: string;
}

export interface ContractRow {
  key: string;
  one: boolean;
  standalone: boolean;
  clientId: string;
  clientName: string;
  clientCity: string;
  clientColor: string;
  techId: string;
  shortCrew: number;
  services: Array<{ id: string; code: string; name: string }>;
  start: string;
  end: string;
  slot: string;
  planText: string;
  done: number;
  total: number;
  pct: number;
  value: number;
  totalVisits: number;
  statusKey: string;
  statusLabel: string;
  next: string;
}

export interface PlanLineDto {
  id: number;
  svId: string;
  visits: number;
  months: number;
  mins: number;
  dayRule: string;
  startAt: string;
  slot: string;
  freq: string;
  crew: number;
  techIds: string[];
}

export interface JobDto {
  id: string;
  type: string;
  date: string;
  slot: string;
  slotEnd: string;
  mins: number;
  serviceIds: string[];
  techIds: string[];
  status: string;
  pinned: boolean;
  visitNo: number;
  ofVisits: number;
}

export interface StaffingRowDto { svId: string; need: number; have: string[]; short: number; over: number }

export interface ContractDetail {
  id: string;
  clientId: string;
  quoteId: string;
  leadId: string;
  mode: 'amc' | 'onetime';
  start: string;
  end: string;
  months: number;
  freq: string;
  billing: string;
  value: number;
  owner: string;
  branch: string;
  site: string;
  scope: string;
  slot: string;
  slotEnd: string;
  notes: string;
  terms: string[];
  refNo: string;
  placeOfSupply: string;
  billAddr: string;  // billing address as printed on the agreement
  siteAddr: string;  // site / shipping address (stored as Contract.site)
  discount: number;
  mergeSameDay: boolean;
  workdaysOnly: boolean;
  blackout: string[];
  totalVisits: number;
  plan: PlanLineDto[];
  client: ClientLite | null;
  jobs: JobDto[];
  progress: { done: number; total: number; pct: number };
  status: { key: string; label: string };
  daysLeft: number;
  staffing: { rows: StaffingRowDto[]; missing: number; extra: number; ok: boolean };
  peakCrew: number;
  planSummaryText: string;
  openJobsByTech: Record<string, number>;
  billingMode: string;
  billingAmount: number;
  billingRows: Array<{
    seq: number; due: string; amount: number; label: string;
    invoice: { id: string; total: number; paid: number; status: string } | null;
  }>;
  arrears: number;
  standaloneOpen: Array<{
    id: string; date: string; slot: string; serviceIds: string[];
    type: string; crewNeed: number;
  }>;
  invoices: Array<{ id: string; date: string; period: string; total: number; paid: number; status: string }>;
  billed: number;
  collected: number;
  /** How much of the work has actually been charged for. */
  servicesBilled?: number;
  servicesTotal?: number;
}

export interface DraftLine {
  svId: string;
  desc: string;
  rate: number;
  qty: number;    // AMC: visits. One-time: units sold. Amount = qty × rate.
  months: number; // 0 = the whole contract term
  startAt: string;
  slot: string;
  slotEnd?: string; // booked window end
  crew: number;
  dates?: string[]; // hand-picked visit dates by index; '' = automatic
}

export interface Draft {
  mode: 'amc' | 'onetime';
  billingMode: string; // upfront | pervisit | interval — the money decision
  billing: string;     // interval label (MRR is always Monthly)
  billingAmount: number; // MRR: fixed monthly amount; 0 = automatic
  no: string;
  clientId: string;
  branch: string;
  owner: string;
  refNo: string;
  placeOfSupply: string;
  billAddr: string;  // billing address as printed on the agreement
  siteAddr: string;  // site / shipping address (stored as Contract.site)
  discount: number;
  start: string;
  end: string;
  slot: string;
  slotEnd: string;
  subject: string;
  notes: string;
  terms: string[];
  signCustomer: string;
  signExec: string;
  quoteId: string;
  leadId: string;
  lines: DraftLine[];
}

/** The status pill class inside the three-color system. */
export function statusPill(key: string): string {
  if (key === 'active' || key === 'done') return 'zpill navy';
  if (key === 'expiring') return 'zpill red';
  if (key === 'expired') return 'zpill';
  return 'zpill outline'; // booked
}
