/* ============================================================================
   Money and GST — Indian rupees, statutory split.

   Home-state supply splits into CGST + SGST at half the rate each; any other
   state is one combined IGST line. Ported from v1 store.js taxSplit/taxRows.
   ========================================================================== */

export function money(n: number): string {
  const v = Math.round(n || 0);
  // en-IN grouping: last three digits, then pairs — 12,34,567
  const s = String(Math.abs(v));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (v < 0 ? '-₹' : '₹') + (rest ? rest + ',' : '') + last3;
}

export function moneyShort(n: number): string {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  if (Math.abs(v) >= 1e3) return '₹' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return money(v);
}

export interface TaxSplit {
  rate: number;
  gst: number;
  interState: boolean;
  place: string;
  /** Rendered rows: [label, amount][]. Two rows in-state, one row inter-state. */
  rows: Array<[string, number]>;
}

export function taxSplit(taxable: number, place: string, homeState: string, rate = 18): TaxSplit {
  const gst = Math.max(0, taxable) * rate / 100;
  const inter = String(place || homeState).trim().toLowerCase() !== homeState.trim().toLowerCase();
  const rows: Array<[string, number]> = inter
    ? [[`IGST ${rate}%`, gst]]
    : [[`CGST ${rate / 2}%`, gst / 2], [`SGST ${rate / 2}%`, gst / 2]];
  return { rate, gst, interState: inter, place: place || homeState, rows };
}

export interface DocTotals {
  sub: number;
  disc: number;
  gst: number;
  total: number;
  tax: TaxSplit;
}

/** Quotation / invoice totals: sum(qty × rate) − discount, then GST on top. */
export function docTotals(
  items: Array<{ qty?: number; rate?: number }>,
  discount: number,
  place: string,
  homeState: string,
  rate = 18,
): DocTotals {
  const sub = items.reduce((a, i) => a + (i.qty || 0) * (i.rate || 0), 0);
  const disc = Math.min(Math.max(0, discount || 0), sub);
  const tax = taxSplit(sub - disc, place, homeState, rate);
  return { sub, disc, gst: tax.gst, total: sub - disc + tax.gst, tax };
}
