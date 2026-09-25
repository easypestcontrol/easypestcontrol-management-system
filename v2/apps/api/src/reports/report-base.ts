/* ============================================================================
   What every report definition is written against.

   The books are loaded once per run (the money always; expenses, trips,
   purchases, stock, visits, contracts, leads, audits and notices only when a
   report says it needs them) and handed to the report's `run` as one context.
   The helpers here are the few every report reaches for: rounding, dates,
   the issued-invoice rule, the ageing buckets.
   ========================================================================== */
import type { Col, ReportMeta, ReportResult, Row, RunParams, Stat } from './report.types';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const niceDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : iso;
export const monthLabel = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const r0 = (n: number) => Math.round(n || 0);
export const r1 = (n: number) => Math.round((n || 0) * 10) / 10;
/** A Date as the product's local "YYYY-MM-DD". */
export const isoDay = (d: Date | null | undefined) =>
  d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';

/** Pest control services carry one SAC on every line today. */
export const SAC = '998531';

export interface Item { desc?: string; qty?: number; rate?: number; svId?: string }

/** An invoice with its money worked out and its status derived. */
export interface Inv {
  id: string; clientId: string; clientName: string; contractId: string; kind: string;
  date: string; due: string; period: string; stored: string; status: string;
  items: Item[]; sub: number; disc: number; taxable: number; gst: number;
  cgst: number; sgst: number; igst: number; interState: boolean; total: number;
  paid: number; balance: number; owner: string;
  payments: Array<{ id: string; date: string; amount: number; mode: string; ref: string; by: string; at: string; settled: boolean }>;
}

/* ------------------------------------------------- the optional books */

export type Need = 'expenses' | 'trips' | 'purchases' | 'stock' | 'jobs' | 'contracts' | 'leads' | 'audits' | 'notes';

export interface ExpenseRow {
  id: string; reportId: string; userId: string; branch: string; date: string; category: string;
  merchant: string; note: string; amount: number; km: number; rate: number; source: string; tripId: string;
  status: string; approvedBy: string; rejectedBy: string; reviewedAt: string; paidAt: string; payMode: string;
  paidAmount: number; payments: Array<{ at?: string; amount?: number; mode?: string; by?: string }>;
}
export interface TripRow {
  id: string; userId: string; branch: string; purpose: string; dest: string; status: string;
  startAt: Date; endAt: Date | null; distanceM: number; review: string; flagged: boolean; claimId: string; jobId: string;
}
export interface PoLine { itemId: string; name: string; cat: string; baseUnit: string; packUnit: string; packSize: number; qty: number; rate: number; receivedQty: number }
export interface PoRow {
  id: string; vendorId: string; vendorName: string; date: string; expected: string; status: string; branch: string;
  placeOfSupply: string; discount: number; raisedBy: string; receivedAt: string; items: PoLine[];
}
export interface ItemRow { id: string; name: string; cat: string; unit: string; stock: number; reorder: number; lastRate: number; lastPackUnit: string; lastPackSize: number }
export interface StockBooks {
  items: ItemRow[];
  branchStock: Array<{ branchId: string; itemId: string; qty: number; reorder: number }>;
  techStock: Array<{ userId: string; itemId: string; qty: number }>;
  moves: Array<{ itemId: string; branchId: string; date: string; qty: number; dir: string; jobId: string; poId: string; note: string }>;
}
export interface JobRow {
  id: string; type: string; contractId: string; clientId: string; branch: string; serviceIds: string[]; date: string; slot: string;
  mins: number; techIds: string[]; headTechId: string; status: string; invoiceId: string;
  exec: { durationMins?: number; rating?: number; chemicals?: Array<{ id: string; qty: number }> } | null;
}
export interface PlanLineRow {
  svId: string; visits: number; months: number; mins: number; dayRule: string; startAt: string; slot: string; slotEnd: string;
  freq: string; crew: number; rate: number; techIds: string[]; dates: string[]; times?: string[]; timeEnds?: string[];
}
export interface ContractRow {
  id: string; clientId: string; mode: string; start: string; end: string; months: number; billing: string; value: number;
  owner: string; branch: string; billingMode: string; billingAmount: number; totalVisits: number; slot: string;
  mergeSameDay: boolean; workdaysOnly: boolean; blackout: string[]; plan: PlanLineRow[]; createdAt: Date;
}
export interface LeadRow {
  id: string; name: string; type: string; source: string; stage: string; value: number; owner: string; branch: string;
  clientId: string; contractId: string; createdAt: Date;
}
export interface AuditRow { id: string; clientId: string; date: string; auditor: string; score: number; status: string; findings: Array<{ severity?: string; closed?: boolean }> }
export interface NoteRow { id: number; userId: string; at: string; text: string }

export interface Extra {
  expenses?: ExpenseRow[];
  trips?: TripRow[];
  /** The rupees-per-km a person's trip pays, by the office's cascade. */
  rateOf?: (branch: string, userId: string) => number;
  purchases?: PoRow[];
  stock?: StockBooks;
  jobs?: JobRow[];
  contracts?: ContractRow[];
  leads?: LeadRow[];
  audits?: AuditRow[];
  notes?: NoteRow[];
}

export interface Ctx extends RunParams {
  today: string;
  co: { name: string; gstin: string; state: string; gstRate: number };
  clients: Map<string, { id: string; name: string; gstin: string; openingBalance: number; phone: string; branch: string }>;
  users: Map<string, string>;
  /** Every person's branches, for the wall on records that carry none. */
  userBranches: Map<string, string[]>;
  branches: Map<string, string>;
  services: Map<string, { name: string; code: string }>;
  invoices: Inv[];
  quotes: Row[];
  x: Extra;
}

export interface Def extends ReportMeta {
  needs?: Need[];
  run: (c: Ctx) => Partial<ReportResult> & { columns: Col[]; rows: Row[]; stats: Stat[] };
}

/** Which of the four ageing buckets a lateness falls in. */
export const bucketOf = (late: number) => (late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3);
export const BUCKETS = ['Not due', '1–30 days', '31–60 days', '60+ days'];

/** Issued = counts as a sale: not a draft, not withdrawn. */
export const issued = (i: Inv) => i.status !== 'draft' && i.status !== 'cancelled';

export const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

/** Σ of a numeric column over rows, rounded. */
export const sumOf = (rows: Row[], k: string) => r0(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));

/** A percentage, whole. */
export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
