/* ============================================================================
   Billing — when the money is asked for, decided once at signing.

   Three modes, one invoice shape (the user's three types):
     upfront   one invoice, full value, at signing — nothing collected on site
     pervisit  each completed visit raises its own invoice — technician collects
     interval  equal installments on the billing cycle — office collects, MRR

   Like planVisits, billingPlan is PURE: it computes what SHOULD exist, and the
   UI compares that against the invoices that DO — so the plan can never drift.

   Amounts are ex-GST; every invoice adds GST itself via docTotals, exactly as
   the from-contract invoices always have.

   Non-payment never stops service: dues carry forward. The next invoice shows
   "previous balance + this invoice = total payable", and payments settle the
   oldest open invoice first (FIFO) — so nothing is ever double-counted.
   ========================================================================== */

import { addMonths } from './time';
import { planVisits, type ContractInput, type PlanLineInput, type VisitPlan } from './engine';

export type BillingMode = 'upfront' | 'pervisit' | 'interval';

/** Months per cycle for the interval labels the contract already carries. */
export const BILLING_CYCLE: Record<string, number> = {
  Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12,
};

export interface BillingRow {
  seq: number;
  due: string; // ISO date the installment falls due
  amount: number; // ex-GST
  label: string;
  jobRef?: string; // pervisit: the visit date+slot key this row belongs to
}

export interface BillingContract extends ContractInput {
  value: number;
  billingMode?: string;
  billing?: string; // interval label: Monthly / Quarterly / …
  billingAmount?: number; // MRR: fixed monthly amount set by the admin; 0 = value / months
}

/** Per-visit price of one generated visit — the rates of the services due. */
export function visitAmount(
  v: VisitPlan, lines: Array<PlanLineInput & { rate?: number }>,
  contractValue: number, totalVisits: number,
): number {
  const rated = v.serviceIds.reduce((a, sid) => {
    const l = lines.find((x) => x.svId === sid);
    return a + (l?.rate || 0);
  }, 0);
  if (rated > 0) return rated;
  // Legacy lines without rates: an even split keeps the total honest.
  return totalVisits > 0 ? Math.round(contractValue / totalVisits) : contractValue;
}

/**
 * Every invoice this contract should ever raise. The sum ALWAYS equals the
 * contract value — the last row absorbs the rounding remainder, so the plan
 * and the price can never disagree by a rupee.
 */
export function billingPlan(c: BillingContract): BillingRow[] {
  const mode = (c.billingMode || 'interval') as BillingMode;
  const value = Math.max(0, Math.round(c.value || 0));

  if (mode === 'upfront' || !value) {
    return [{
      seq: 1, due: c.start, amount: value,
      label: 'Full contract value — payable at signing',
    }];
  }

  if (mode === 'pervisit') {
    const visits = planVisits(c);
    const lines = (c.plan || []) as Array<PlanLineInput & { rate?: number }>;
    const rows = visits.map((v, i) => ({
      seq: i + 1,
      due: v.date,
      amount: visitAmount(v, lines, value, visits.length),
      label: 'Service ' + (i + 1) + ' of ' + visits.length + ' — collected on site',
      jobRef: v.date + '|' + v.slot,
    }));
    // The split must land exactly on the contract value.
    const drift = value - rows.reduce((a, r) => a + r.amount, 0);
    if (rows.length && drift !== 0) rows[rows.length - 1].amount += drift;
    return rows;
  }

  // interval — MRR: monthly installments. A contract signed on the 19th pays
  // its first installment on the 19th of the NEXT month. The admin may fix
  // the monthly amount; left at 0 it is value / months, last row absorbing
  // the rounding remainder.
  // Installments run only while service runs: the longest line span decides
  // how many monthly payments there are, so the whole value lands by the
  // month the services end (a 6-month service = 6 installments).
  const term = Math.max(1, Math.round(c.months || 12));
  const lines = (c.plan || []) as PlanLineInput[];
  const n = lines.length
    ? Math.max(...lines.map((l) => {
        const m = Math.round(l.months || 0);
        return m > 0 ? Math.min(m, term) : term;
      }))
    : term;
  const custom = Math.max(0, Math.round(c.billingAmount || 0));
  const base = custom || Math.floor(value / n);
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    due: addMonths(c.start, i + 1),
    amount: custom ? custom : (i === n - 1 ? value - base * (n - 1) : base),
    label: 'Monthly installment ' + (i + 1) + ' of ' + n,
  }));
}

/** What the technician screen says about money, per mode. */
export function collectionNote(mode: string, amount?: number): string {
  if (mode === 'pervisit') {
    return 'Collect ' + (amount != null ? '₹' + amount.toLocaleString('en-IN') + ' + GST' : 'this service’s amount') + ' on site';
  }
  if (mode === 'upfront') return 'Nothing to collect — paid in full at signing';
  return 'Nothing to collect — billed on the office cycle';
}
