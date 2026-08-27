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
  /** A WHOLE number of rupees. See the note in docTotals. */
  total: number;
  /** What rounding moved, so a tax invoice can show it. Usually 0. */
  roundOff: number;
  tax: TaxSplit;
}

/**
 * Quotation / invoice totals: sum(qty × rate) − discount, then GST on top,
 * and the total rounded to a whole rupee.
 *
 * That rounding is not cosmetic, and leaving it out was a real defect. GST on
 * ₹1 is 18 paise, so the total was 1.18 — but every screen renders through
 * money(), which rounds, so the invoice SAID ₹1. Every collection path rounds
 * too, so the QR ASKED for ₹1. The customer paid ₹1, and the invoice was left
 * quietly owing eighteen paise: marked paid inside the app, "PAYMENT DUE" on
 * the copy the customer sees. Two answers to the same question.
 *
 * A rupee is the smallest unit this business actually moves. Rounding the
 * total here means the figure billed, the figure asked for, the figure paid
 * and the figure displayed are the same number everywhere, which is the whole
 * point of having one tax engine. It is also what an Indian tax invoice does
 * — hence roundOff, so the document can say so.
 */
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
  const exact = sub - disc + tax.gst;
  const total = Math.round(exact);
  // Guard the float: 1.18 - 1 is 0.17999999999999994, and money that reads
  // like that in a ledger is money somebody stops trusting.
  const roundOff = Math.round((total - exact) * 100) / 100;
  return { sub, disc, gst: tax.gst, total, roundOff, tax };
}

/* ---------------------------------------------------------------- whatsapp

   Opening WhatsApp is not the job. Opening it ON THE RIGHT CONVERSATION is.

   wa.me without a number shows the contact picker, and whoever is sharing
   then has to find the customer by hand — impossible if the number was never
   saved to the phone, which for a customer it usually has not been. Every
   share in this app goes to a person we already know the number of, so there
   is no excuse for asking.

   The rules are the ones Indian numbers actually arrive in: a bare ten
   digits, a leading zero from a landline habit, a +91 already attached, or a
   number written with spaces and dashes.                                    */

/** A dialable wa.me number, or null when we genuinely do not know one. */
export function waNumber(raw: string | null | undefined): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  // A trunk zero is for dialling inside India and means nothing to WhatsApp.
  while (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) return '91' + d;                 // bare Indian mobile
  if (d.length === 12 && d.startsWith('91')) return d;  // already +91
  if (d.length >= 11 && d.length <= 15) return d;       // some other country
  return null;
}

/**
 * A WhatsApp link that lands on the right conversation.
 *
 * Falls back to the contact picker only when there is truly no number —
 * better than a dead button, and rare enough to notice.
 */
export function waLink(phone: string | null | undefined, message: string): string {
  const n = waNumber(phone);
  return 'https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(message);
}
