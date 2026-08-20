/* ============================================================================
   Quotations module — local types and the v1 helpers that are not part of
   the shared engine (statuses, date formatting, amount-in-words, the legacy
   visits fallback). Formulas that ARE in the engine are imported, never
   reimplemented.
   ========================================================================== */
import { addDays, daysBetween } from 'shared';

/* ----------------------------------------------------------------- types */

export type QuoteStatusKey = 'draft' | 'sent' | 'approved' | 'rejected';

export interface QuoteItem {
  id?: number;
  svId: string;
  desc: string;
  qty: number;
  rate: number;
  visits: number;
  months: number;
  order?: number;
  /** resolved server-side from the catalogue; 'Custom service' when svId '' */
  name?: string;
  unit?: string;
}

export interface Quote {
  id: string;
  clientId: string;
  leadId: string;
  date: string;
  status: QuoteStatusKey;
  mode: 'amc' | 'onetime';
  months: number;
  freq: string;
  title: string;
  refNo: string;
  placeOfSupply: string;
  // addresses as printed on the document (server falls back to the party record)
  billAddr: string;
  shipAddr: string;
  discount: number;
  notes: string;
  terms: string[];
  signCustomer: string;
  signExec: string;
  // the two-handed acceptance: our sign-off, then the customer's
  approvedBy: string;
  approvedAt: string;
  // service information sheets uploaded on the catalogue, one per quoted service
  sheets?: Array<{ id: string; name: string; pdf: string }>;
  owner: string;
  branch: string;
  contractId: string;
  items: QuoteItem[];
  partyName?: string;
}

export interface Party {
  name: string; contact: string; addr: string; city: string; pin: string;
  gstin: string; phone: string; email: string;
}

export interface QuoteFull extends Quote {
  party: Party | null;
  ownerName: string;
  ownerSign: string;
}

export interface DocCompany {
  name: string; tagline: string; phone: string; email: string; gstin: string;
  addr: string; city: string; state: string; pin: string; gstRate: number;
  logo: string; terms: string[];
}

export interface PublicQuote extends QuoteFull {
  valid: string;
  company: DocCompany | null;
}

/* -------------------------------------------------------------- statuses */

/** v1 store.js:389-395, mapped onto the three-color pill system. */
export const QUOTE_STATUS: Record<QuoteStatusKey, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'zpill outline' },
  sent: { label: 'Sent', cls: 'zpill' },
  approved: { label: 'Approved', cls: 'zpill navy' },
  rejected: { label: 'Rejected', cls: 'zpill red' },
};

/* ----------------------------------------------------------------- dates */

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-08-18' -> '18 Aug 2026' — v1 store.js fmtDate. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-').map(Number);
  if (!p[0]) return '—';
  return p[2] + ' ' + (MON[(p[1] || 1) - 1] || '') + ' ' + p[0];
}

/** Days from today; negative = past — v1 store.js:336 dayDelta. */
export function dayDelta(iso: string): number {
  return daysBetween(todayISO(), iso);
}

/**
 * v2's Quotation table has no `valid` column, so validity is fixed at
 * date + 15 days — exactly v1's default (quotations.js:269, Seed.D(15)).
 */
export function validOf(q: { date: string }): string {
  return addDays(q.date || todayISO(), 15);
}

/* ------------------------------------------------------------ line rules */

/**
 * How many times a quoted line is delivered — quotations.js:98-103.
 * Newer lines say it outright; legacy lines put it in the quantity, which
 * was fine while every service was charged per visit. Custom lines (svId '')
 * always fall back to the quantity, like a missing catalogue entry in v1.
 */
export function lineVisits(
  i: { svId?: string; visits?: number; qty?: number; unit?: string },
  unitOf?: (svId: string) => string | undefined,
): number {
  if (i.visits) return i.visits;
  const unit = i.unit !== undefined ? i.unit : (i.svId && unitOf ? unitOf(i.svId) : undefined);
  if (i.svId && unit !== undefined && !/per visit/i.test(unit || '')) return 1;
  return Math.max(1, Math.round(i.qty || 1));
}

/* --------------------------------------------------------------- rupees */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function two(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function three(n: number): string {
  if (n < 100) return two(n);
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '');
}

/** Indian numbering: crore / lakh / thousand — v1 store.js:304-316. */
export function amountInWords(n: number): string {
  let v = Math.round(Number(n) || 0);
  if (v === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const cr = Math.floor(v / 10000000); v %= 10000000;
  const lk = Math.floor(v / 100000); v %= 100000;
  const th = Math.floor(v / 1000); v %= 1000;
  if (cr) parts.push(three(cr) + ' Crore');
  if (lk) parts.push(three(lk) + ' Lakh');
  if (th) parts.push(three(th) + ' Thousand');
  if (v) parts.push(three(v));
  return parts.join(' ') + ' Rupees Only';
}

/* -------------------------------------------------------------- whatsapp */

/**
 * A dialable wa.me number, or null. A bare 10-digit number is Indian;
 * anything 11-15 digits is taken as already carrying its country code.
 */
export function waNumber(raw: string): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export function phonePretty(num: string): string {
  if (num.length === 12 && num.startsWith('91')) {
    return '+91 ' + num.slice(2, 7) + ' ' + num.slice(7);
  }
  return '+' + num;
}

/* -------------------------------------------------------- place of supply */

/** v1 data.js:147-155 — the GST state list. */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
