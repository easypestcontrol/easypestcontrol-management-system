'use client';

/* ============================================================================
   Shared invoice bits — API payload types, status pills, the record-payment
   dialog (used from the list's quick-pay flow and the document view), and the
   Indian-numbering amount-in-words, ported 1:1 from v1 store.js:290-316.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { money } from 'shared';
import { waLink } from 'shared';
import PaidTick from '@/components/paid-tick';
import UpiQr from '@/components/upi-qr';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';

/* ---------------------------------------------------------------- types */

/* 'cancelled' exists in the database — an invoice raised in error is
   withdrawn, never deleted, because a financial record is never deleted.
   The client type had never been widened to match, so a cancelled row
   fell through every status branch and rendered as nothing. */
export type InvStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceRow {
  id: string; clientId: string; clientName: string; clientPhone?: string;
  contractId: string;
  date: string; due: string; period: string; status: InvStatus;
  total: number; paid: number; balance: number; daysLate: number;
}

export interface ListResponse {
  rows: InvoiceRow[];
  counts: { all: number; draft: number; sent: number; partial: number; paid: number; overdue: number; open: number };
  receivable: number;
  ageing: Array<{ label: string; n: number; v: number }>;
}

/**
 * What recording a payment answers with. A payment settles the oldest open
 * invoice first and carries forward, so several receipts can come back from
 * one collection.
 */
/** What /pay/state answers: what is still asking, and what has been paid. */
interface PayState {
  link: { url: string; amount: number } | null;
  history: { kind: string; status: string; amount: number; at: string; receipt: string }[];
}

export interface PaymentResult {
  allocations: Array<{ invoiceId: string; receiptId: string; amount: number }>;
  settled: number;
  /** Rupees that found no open balance and are now held on the customer. */
  credited?: number;
}

export interface InvoiceItem {
  desc: string; qty: number; rate: number; svId?: string;
  /** Set on a line billed from a service: the visit it charges for. */
  jobId?: string; date?: string;
}

export interface PaymentRow {
  id: string; date: string; amount: number; mode: string; ref: string;
  at?: string; by?: string; byName?: string;
}

export interface Totals {
  sub: number; disc: number; gst: number; total: number; paid: number; balance: number;
  rows: Array<[string, number]>; interState: boolean; place: string; rate: number;
}

export interface InvoiceDetail {
  id: string; clientId: string; contractId: string; date: string; due: string;
  period: string; notes: string; placeOfSupply: string; discount: number;
  status: InvStatus; items: InvoiceItem[];
  client: {
    id: string; name: string; contact: string; phone: string; email: string;
    addr: string; city: string; pin: string; gstin: string;
  } | null;
  contract: {
    id: string; mode: string; billing: string; months: number; freq: string;
    value: number; start: string; end: string;
  } | null;
  totals: Totals; payments: PaymentRow[]; daysLate: number;
}

export interface ContractOption {
  id: string; clientId: string; clientName: string; mode: string; billing: string;
  start: string; end: string; value: number; perCycle: number;
  /** What is genuinely left to bill — the installment is only the cadence. */
  services: number; billableServices: number; billableValue: number;
}

/* ------------------------------------------------------------- statuses */

export const STATUS_LABEL: Record<InvStatus, string> = {
  draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export function pillClass(s: InvStatus): string {
  if (s === 'overdue') return 'zpill red';
  if (s === 'paid') return 'zpill navy';
  // Withdrawn money should not look like money still expected.
  if (s === 'draft' || s === 'cancelled') return 'zpill outline';
  return 'zpill';
}

export const MODES = ['UPI', 'Cash', 'Cheque', 'Transfer'];

/* ---------------------------------------------------------------- dates */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-18" -> "18 Aug 2026" — v1 fmtDate. */
export function fmtDate(ds?: string): string {
  if (!ds) return '—';
  const p = String(ds).slice(0, 10).split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return '—';
  return p[2] + ' ' + MON[p[1] - 1] + ' ' + p[0];
}

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* ------------------------------------------------ amount in words (v1) */

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

/** Indian numbering: crore / lakh / thousand — v1 store.js amountInWords. */
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

/* --------------------------------------------------------------- dialog */

export function Dialog({ title, sub, wide, onClose, children, footer }: {
  title: string; sub?: string; wide?: boolean; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-navy/40" onClick={onClose} />
      <div className={'relative bg-white rounded-md shadow-pop w-full flex flex-col max-h-[90vh] ' +
        (wide ? 'max-w-[680px]' : 'max-w-[480px]')}>
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line-soft">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {sub && <p className="text-muted text-[12.5px] mt-0.5">{sub}</p>}
          </div>
          <button onClick={onClose} className="text-muted-2 hover:text-ink mt-0.5" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-line-soft">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------- record-payment dialog */

export function PayDialog({ inv, onClose, onDone }: {
  inv: {
    id: string; clientName: string; total: number; paid: number; balance: number;
    /** So the WhatsApp send lands on THIS customer, not the contact picker. */
    phone?: string;
  };
  onClose: () => void;
  /** receipt, amount, and how many invoices that amount settled. */
  onDone: (receiptId: string, amount: number, settled?: number) => void;
}) {
  // v1 defaults: amount = round(balance), date = today — invoices.js:96-104
  const [amt, setAmt] = useState(String(Math.round(inv.balance)));
  const [mode, setMode] = useState('UPI');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* Set the instant money is confirmed, from whichever path confirmed it.
     The dialog then shows the tick and closes itself. */
  const [landed, setLanded] = useState<
    { amount: number; receiptId: string; settled?: number } | null
  >(null);

  /* ---------------------------------------------------------- the UPI QR

     Picking UPI should let the customer scan, not make someone type a UTR off
     a phone screen. The QR is a Razorpay single-use code for the *full*
     balance, and the payment records itself the moment Razorpay reports it
     captured — which is the whole point: no one has to remember to come back
     and mark it paid.

     The manual fields stay right there underneath. Not every UPI payment
     happens through our QR, and a dialog that only works one way is a dialog
     people work around.                                                      */
  const [qr, setQr] = useState<{ qrId: string; image: string; amount: number } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrErr, setQrErr] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Let it be seen before the screen moves. */
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(
      () => onDone(landed.receiptId, landed.amount, landed.settled), 1900,
    );
    return () => clearTimeout(t);
  }, [landed, onDone]);

  const stopPolling = () => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  };
  useEffect(() => stopPolling, []);

  async function openQr() {
    setQrBusy(true); setQrErr('');
    try {
      const r = await api.post<{ qrId: string; image: string; amount: number }>(
        `/pay/upi/${inv.id}`, {},
      );
      setQr(r);
      setQrBusy(false);
      poll.current = setInterval(async () => {
        try {
          const st = await api.get<{ paid: boolean; receipt?: string; amount?: number }>(
            `/pay/upi/${r.qrId}/status?invoiceId=${inv.id}`,
          );
          if (st.paid) {
            stopPolling();
            setLanded({ receiptId: st.receipt || '', amount: st.amount || r.amount });
          }
        } catch { /* a blip should not kill the wait — keep polling */ }
      }, 4000);
    } catch (e) {
      setQrErr(e instanceof ApiError ? e.message : 'Could not open the QR');
      setQrBusy(false);
    }
  }

  /* ------------------------------------------------------ a link to pay by

     The QR needs somebody standing there. Most invoices are settled in the
     evening, by whoever actually signs the cheques, from a message on their
     phone — so the same dialog offers a link that can be sent.

     It is watched the same way the QR is: when the pending intent stops being
     pending and a receipt appears against it, the payment recorded itself and
     this window says so rather than making anyone refresh.                   */
  const [link, setLink] = useState<{ url: string; amount: number } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState('');
  const [copied, setCopied] = useState(false);
  const watch = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWatch = () => {
    if (watch.current) { clearInterval(watch.current); watch.current = null; }
  };
  useEffect(() => stopWatch, []);

  /* A link raised earlier is still live and still asking — show that one
     rather than quietly raising a second way to pay the same money. */
  useEffect(() => {
    let alive = true;
    api.get<PayState>(`/pay/state/${inv.id}`)
      .then((r) => { if (alive && r.link) setLink(r.link); })
      .catch(() => {});
    return () => { alive = false; };
  }, [inv.id]);

  useEffect(() => {
    if (!link) { stopWatch(); return; }
    watch.current = setInterval(async () => {
      try {
        const st = await api.get<PayState>(`/pay/state/${inv.id}`);
        if (st.link) return;                       // still waiting
        const done = st.history.find((h) => h.status === 'paid' && h.receipt);
        stopWatch();
        if (done) setLanded({ receiptId: done.receipt || '', amount: done.amount });
        else setLink(null);                        // withdrawn elsewhere
      } catch { /* a blip should not kill the wait */ }
    }, 6000);
    return stopWatch;
  }, [link, inv.id, onDone]);

  async function openLink() {
    setLinkBusy(true); setLinkErr('');
    try {
      const r = await api.post<{ url: string; amount: number }>(`/pay/link/${inv.id}`, {});
      setLink({ url: r.url, amount: r.amount });
    } catch (e) {
      setLinkErr(e instanceof ApiError ? e.message : 'Could not raise the link');
    } finally { setLinkBusy(false); }
  }

  async function killLink() {
    setLinkBusy(true); setLinkErr('');
    try {
      await api.post(`/pay/link/${inv.id}/cancel`, {});
      setLink(null); stopWatch();
    } catch (e) {
      setLinkErr(e instanceof ApiError ? e.message : 'Could not withdraw it');
    } finally { setLinkBusy(false); }
  }

  function changeMode(m: string) {
    setMode(m);
    setErr('');
    setQrErr('');
    setQr(null);
    stopPolling();
  }

  async function submit() {
    const amount = parseFloat(amt) || 0;
    if (amount <= 0) { setErr('Enter an amount'); return; }
    setBusy(true); setErr('');
    stopPolling();
    try {
      /*
       * One payment can settle several invoices: it goes against the oldest
       * open balance first and works forward, so the answer is a list of
       * allocations, not a single receipt.
       *
       * This used to read `res.payment.id`, which the endpoint has never
       * returned. The write succeeded, the browser threw reading the reply,
       * and the catch below reported "could not record the payment" over money
       * that was already banked. Reading a response you did not check is the
       * same class of mistake as not checking the response at all.
       */
      const res = await api.post<PaymentResult>(
        `/invoices/${inv.id}/payments`,
        { amount, mode, ref: ref.trim(), date },
      );
      const parts = res?.allocations || [];
      /*
       * Everything landed as credit — nothing on this contract was open.
       * Almost always the same payment entered twice, so it is said plainly
       * here rather than reported as a receipt that does not exist.
       */
      if (!parts.length) {
        setErr(
          'Nothing was owed on this invoice, so ' + money(res?.credited || amount)
          + ' is now held as credit on the customer. It comes off the next '
          + 'invoice raised. If that was not intended, check whether this '
          + 'payment has already been recorded.',
        );
        setBusy(false);
        return;
      }
      // The receipt for this invoice if there is one, else the first raised.
      const mine = parts.find((a) => a.invoiceId === inv.id) || parts[0];
      setLanded({ receiptId: mine?.receiptId || '', amount, settled: parts.length });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not record the payment');
      setBusy(false);
    }
  }

  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
  const input = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';

  /* Nothing to argue with once the money is in — no buttons, no form. */
  if (landed) {
    return (
      <Dialog title="Payment received" sub={inv.id + ' · ' + inv.clientName}
        onClose={() => onDone(landed.receiptId, landed.amount, landed.settled)}
        footer={null}>
        <PaidTick {...landed} />
      </Dialog>
    );
  }

  return (
    <Dialog title="Record payment" sub={inv.id + ' · ' + inv.clientName} onClose={onClose}
      footer={
        <>
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            <Icon name="check" size={14} /> Record &amp; issue receipt
          </button>
        </>
      }>
      <div className="rounded-md bg-wash p-4 mb-4 text-[13px]">
        <div className="flex justify-between mb-1.5">
          <span className="text-muted">Invoice total</span>
          <strong>{money(inv.total)}</strong>
        </div>
        <div className="flex justify-between mb-1.5">
          <span className="text-muted">Already paid</span>
          <strong>{money(inv.paid)}</strong>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5">
          <strong>Balance due</strong>
          <strong className="text-accent text-[15px]">{money(inv.balance)}</strong>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Amount received (₹) *</span>
          <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Payment mode</span>
          <select value={mode} onChange={(e) => changeMode(e.target.value)} className={input + ' bg-white'}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Reference</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)}
            placeholder="UTR / cheque no. / txn id" className={input} />
        </label>
        <label className="block">
          <span className={label}>Date received</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
      </div>

      {/* ------------------------------------------------------- the UPI QR */}
      {mode === 'UPI' && inv.balance > 0 && (
        <div className="mt-4 rounded-md border border-line overflow-hidden">
          {qr ? (
            <div className="p-4 text-center">
              {/*
                * Razorpay hands back a whole branded poster, not a bare code —
                * header, UPI logos, the company name, and the actual QR maybe a
                * third of its height. This used to be forced into a 190px
                * SQUARE, which both squashed a portrait image and left the
                * scannable part around 60px. Phones could not read it.
                *
                * So: natural aspect ratio, as wide as the dialog sensibly
                * allows, and a way to open it full size for a customer holding
                * their phone across a counter.
                */}
              <UpiQr src={'/api/pay/upi/' + qr.qrId + '/image'}
            fallback={qr.image} size={236} />
              <p className="text-[14px] font-semibold mt-3">
                Show this to the customer — {money(qr.amount)}
              </p>
              <p className="text-[12px] text-muted mt-1">
                Any UPI app. The receipt is issued by itself the moment it is paid;
                this window is watching.
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button onClick={() => { setQr(null); stopPolling(); }}
                  className="h-8 px-3 rounded border border-line text-[12px] font-medium hover:bg-wash">
                  Close the QR
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[170px]">
                <span className="block text-[12.5px] font-semibold">Let them scan and pay</span>
                <span className="block text-[11.5px] text-muted">
                  A UPI QR for the full balance of {money(inv.balance)} — it records itself.
                </span>
              </span>
              <button onClick={openQr} disabled={qrBusy}
                className="h-9 px-3.5 rounded bg-navy text-white text-[12.5px] font-semibold hover:brightness-110 disabled:opacity-60">
                {qrBusy ? 'Opening…' : 'Show UPI QR'}
              </button>
            </div>
          )}
          {qrErr && (
            <p className="px-3.5 pb-3 text-accent text-[12px] leading-relaxed">{qrErr}</p>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- pay by link */}
      {inv.balance > 0 && (
        <div className="mt-3 rounded-md border border-line overflow-hidden">
          {link ? (
            <div className="p-3.5">
              <p className="text-[12.5px] font-semibold">
                A link for {money(link.amount)} is out with the customer
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <input readOnly value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-[190px] h-9 px-3 rounded border border-line bg-wash text-[12.5px] outline-none" />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(link.url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }).catch(() => {});
                  }}
                  className="h-9 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a target="_blank" rel="noreferrer"
                  href={waLink(
                    inv.phone,
                    inv.clientName + ', here is the payment link for invoice ' + inv.id
                    + ' — ' + money(link.amount) + '.' + String.fromCharCode(10) + link.url,
                  )}
                  className="h-9 px-3 rounded bg-navy text-white text-[12.5px] font-semibold
                    flex items-center hover:brightness-110">
                  WhatsApp
                </a>
              </div>
              <p className="text-[11.5px] text-muted mt-2 leading-relaxed">
                Razorpay reminds them by SMS and email. The receipt is issued by
                itself the moment it is paid — this window is watching.
              </p>
              <button onClick={killLink} disabled={linkBusy}
                className="mt-2.5 h-8 px-3 rounded border border-line text-[12px] font-medium
                  text-accent hover:bg-wash disabled:opacity-60">
                Withdraw the link
              </button>
            </div>
          ) : (
            <div className="p-3.5 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[170px]">
                <span className="block text-[12.5px] font-semibold">Not in front of them?</span>
                <span className="block text-[11.5px] text-muted">
                  Send a link for {money(inv.balance)} — it records itself when they pay.
                </span>
              </span>
              <button onClick={openLink} disabled={linkBusy}
                className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold
                  hover:bg-wash disabled:opacity-60">
                {linkBusy ? 'Raising…' : 'Send a payment link'}
              </button>
            </div>
          )}
          {linkErr && (
            <p className="px-3.5 pb-3 text-accent text-[12px] leading-relaxed">{linkErr}</p>
          )}
        </div>
      )}

      {err && <p className="text-accent text-[12.5px] mt-3">{err}</p>}
    </Dialog>
  );
}
