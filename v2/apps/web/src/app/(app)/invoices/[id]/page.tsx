'use client';

/* ============================================================================
   Invoice document view — the printable A4 GST tax invoice.

   v1: invoiceDoc + invoicesDetail (assets/js/views/invoices.js:156-334).
   Banners, payment history, record-payment, then the sheet itself: company
   head, status stamp, bill-to, billing period + contract, item table with the
   hardcoded SAC 998531, totals with CGST/SGST vs IGST rows, amount paid and
   balance when partly settled, amount in words, declaration, footer terms.
   Print via window.print — the shell chrome is hidden by the print stylesheet.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError, type Bootstrap, type Company, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import ShareLink from '@/components/share-link';
import {
  PayDialog, STATUS_LABEL, amountInWords, fmtDate, pillClass,
  type InvoiceDetail,
} from '../ui';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  aside, header, .no-print { display: none !important; }
  html, body { height: auto !important; background: #fff !important; }
  div, main { height: auto !important; overflow: visible !important; }
  .print-doc { border: none !important; border-radius: 0 !important; max-width: none !important; margin: 0 !important; }
}`;

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [co, setCo] = useState<Company | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get<InvoiceDetail>('/invoices/' + id)
      .then(setInv)
      .catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true); });
  }, [id]);

  useEffect(() => {
    load();
    api.get<Bootstrap>('/org/bootstrap').then((b) => setCo(b.company)).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, [load]);

  if (missing) {
    return (
      <div className="p-6">
        <BackLink />
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">Invoice not found</p>
          <p className="text-muted text-[13px] mt-1">It may have been removed.</p>
        </div>
      </div>
    );
  }
  if (!inv) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  const t = inv.totals;
  const canBill = !!me && (me.role === 'admin' || me.role === 'accounts');
  const lastPay = inv.payments[0]; // newest first
  // v1 hardcodes 'Tamil Nadu (33)' — keep the state code for the home case
  const placeLabel = t.place + (t.place === 'Tamil Nadu' ? ' (33)' : '');
  const stamp =
    inv.status === 'overdue' ? 'text-accent border-accent'
    : inv.status === 'paid' ? 'text-navy border-navy'
    : 'text-muted border-line';

  return (
    <div className="p-4 sm:p-6">
      <style>{PRINT_CSS}</style>
      <div className="no-print"><BackLink /></div>

      {/* ------------------------------------------------------- header */}
      <div className="no-print flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold">{inv.id}</h1>
            <span className={pillClass(inv.status)}>{STATUS_LABEL[inv.status]}</span>
          </div>
          <p className="text-muted text-[13px] mt-1">
            {inv.client?.name || '—'} · {money(t.total)} · due {fmtDate(inv.due)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ShareLink path={'/invoice/' + inv.id} title={'Invoice ' + inv.id}
            phone={inv.client?.phone}
            text={`Invoice ${inv.id} — ${money(t.total)}${t.balance > 0 ? ' (balance ' + money(t.balance) + ')' : ' (paid)'}. View it here:`} />
          <button onClick={() => window.print()}
            className="h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Print / PDF
          </button>
          {canBill && t.balance > 0 && (
            <button onClick={() => setPaying(true)}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="check" size={14} /> Record payment
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="no-print mb-4 rounded-md border border-line bg-wash px-4 py-2.5 text-[12.5px] text-ink-2">
          {notice}
        </div>
      )}

      {/* ------------------------------------------------------ banners */}
      {(inv as { previousDue?: number }).previousDue! > 0 && (
        <div className="max-w-[820px] mx-auto mb-4 rounded border border-line bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Balance carried forward — service never stopped
          </p>
          <div className="flex items-baseline gap-x-5 gap-y-1 text-[13px] flex-wrap">
            <span>Previous balance <b>{money((inv as { previousDue?: number }).previousDue || 0)}</b></span>
            <span className="text-muted-2">+</span>
            <span>This invoice <b>{money(inv.totals.total - inv.totals.paid)}</b></span>
            <span className="text-muted-2">=</span>
            <span className="text-[15px] font-bold text-accent">
              Total payable {money((inv as { totalPayable?: number }).totalPayable || 0)}
            </span>
          </div>
          <p className="text-[11.5px] text-muted mt-1">
            One payment of the total settles everything, oldest month first.
          </p>
        </div>
      )}

      {inv.status === 'overdue' && (
        <div className="no-print mb-4 rounded-md border border-red-line bg-red-wash p-4">
          <p className="text-[13.5px] font-semibold text-accent">Overdue by {inv.daysLate} days</p>
          <p className="text-[13px] text-ink-2 mt-0.5">
            {money(t.balance)} is still outstanding. Send a reminder or record the
            payment if already received.
          </p>
        </div>
      )}
      {inv.status === 'paid' && (
        <div className="no-print mb-4 rounded-md border border-line bg-wash p-4">
          <p className="text-[13.5px] font-semibold">Fully paid</p>
          <p className="text-[13px] text-muted mt-0.5">
            Settled on {fmtDate(lastPay?.date)} via {lastPay?.mode || '—'}.
          </p>
        </div>
      )}

      {/* ----------------------------------------------- payment history */}
      {inv.payments.length > 0 && (
        <div className="no-print mb-5 rounded-md border border-line">
          <div className="flex items-center justify-between px-4 h-11 border-b border-line-soft">
            <h2 className="text-[13.5px] font-semibold">Payment history</h2>
            <span className="zpill navy">{money(t.paid)} received</span>
          </div>
          <div className="px-4">
            {inv.payments.map((p, i) => (
              <div key={p.id}
                className={'flex items-center gap-3 py-2.5 ' +
                  (i < inv.payments.length - 1 ? 'border-b border-line-soft' : '')}>
                <span className="w-8 h-8 rounded bg-wash text-navy flex items-center justify-center shrink-0">
                  <Icon name="invoice" size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {money(p.amount)} · {p.mode}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {p.id} · {fmtDate(p.date)}{p.at ? ' ' + p.at : ''}
                    {p.byName ? ' · collected by ' + p.byName : ''} · {p.ref || '—'}
                  </span>
                </span>
                <span className="zpill outline">Receipt</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================== A4 */}
      <div className="print-doc bg-white border border-line rounded-md max-w-[820px] mx-auto shadow-card">
        <div className="p-5 sm:p-10">
          {/* head — stamp beside the company, so the phone reads like a
              document and not a form that wrapped. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2.5">
                {co?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={co.logo} alt="" className="h-9 sm:h-10 w-auto object-contain" />
                ) : (
                  <span className="w-10 h-10 rounded bg-navy text-white flex items-center justify-center font-bold text-[16px]">
                    {(co?.name || 'P').charAt(0)}
                  </span>
                )}
                <div className="text-[15px] sm:text-[16px] font-bold text-navy leading-tight mt-1.5">{co?.name || '—'}</div>
              </div>
              <div className="text-[11px] sm:text-[11.5px] text-muted leading-relaxed">
                {[co?.addr, co?.city].filter(Boolean).join(', ')}{co?.pin ? <> — {co.pin}</> : null}<br />
                {co?.phone}{co?.email ? <> · {co.email}</> : null}<br />
                GSTIN: {co?.gstin || '—'}
              </div>
            </div>
            <span className={'inline-block border-2 rounded px-3 py-1 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] shrink-0 ' + stamp}>
              {STATUS_LABEL[inv.status]}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
            <div>
              <div className="text-[17px] sm:text-[20px] font-bold tracking-[0.13em] text-navy leading-tight">TAX INVOICE</div>
              <div className="text-[13px] font-semibold text-muted">{inv.id}</div>
            </div>
            <div className="text-[11.5px] text-muted leading-relaxed sm:text-right">
              Invoice date: <strong className="text-ink">{fmtDate(inv.date)}</strong><br />
              Due date: <strong className="text-ink">{fmtDate(inv.due)}</strong>
            </div>
          </div>

          <div className="border-t-2 border-navy my-4 sm:my-6" />

          {/* parties — two columns even on a phone; both blocks are short */}
          <div className="grid grid-cols-2 gap-4 sm:gap-8">
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold mb-1">Bill to</div>
              <div className="text-[13.5px] sm:text-[14.5px] font-bold break-words">{inv.client?.name || '—'}</div>
              <div className="text-[11.5px] text-muted leading-relaxed mt-1 break-words">
                {inv.client?.contact && <>{inv.client.contact}<br /></>}
                {[inv.client?.addr, inv.client?.city].filter(Boolean).join(', ')}
                {inv.client?.pin ? <> — {inv.client.pin}</> : null}<br />
                {inv.client?.phone}
                {inv.client?.gstin && <><br />GSTIN: {inv.client.gstin}</>}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold mb-1">Billing period</div>
              <div className="text-[13px] font-semibold">{inv.period || '—'}</div>
              <div className="text-[11.5px] text-muted leading-relaxed mt-1.5">
                {inv.contract ? (
                  <>
                    Contract: <strong className="text-ink">{inv.contract.id}</strong><br />
                    {inv.contract.billing} billing<br />
                    Place of supply: <strong className="text-ink">{placeLabel}</strong>
                  </>
                ) : (
                  <>
                    Place of supply: <strong className="text-ink">{placeLabel}</strong><br />
                    SAC: <strong className="text-ink">998531</strong>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* items — cards on a phone, the classic table from tablet up
              (and always in print, where the page is A4-wide). */}
          <div className="sm:hidden mt-6 border border-line rounded divide-y divide-line-soft print:hidden">
            {inv.items.map((it, i) => (
              <div key={i} className="px-3.5 py-2.5">
                <p className="text-[13px] font-semibold">{it.desc}</p>
                {(it.date || it.jobId) && (
                  <p className="text-[11px] text-muted mt-0.5">
                    {[it.date && fmtDate(it.date), it.jobId].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-[12.5px] mt-1 flex justify-between">
                  <span className="text-muted">{it.qty} × {money(it.rate)} · SAC 998531</span>
                  <span className="font-bold">{money(it.qty * it.rate)}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 overflow-x-auto max-sm:hidden print:block">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr>
                  {['#', 'Description of service', 'SAC', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h}
                      className={'bg-navy text-white text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2 ' +
                        (i >= 4 ? 'text-right' : i >= 2 ? 'text-center' : 'text-left')}
                      style={i === 0 ? { width: 34 } : i === 2 ? { width: 64 } : i === 3 ? { width: 50 } : i === 4 ? { width: 92 } : i === 5 ? { width: 104 } : undefined}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={i} className="border-b border-line-soft">
                    <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold">{it.desc}</span>
                      {/* A service line carries the date it was delivered and its
                          reference, so the customer can match the charge to the
                          visit they actually watched happen. */}
                      {(it.date || it.jobId) && (
                        <span className="block text-[11px] text-muted mt-0.5">
                          {[it.date && fmtDate(it.date), it.jobId].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted">998531</td>
                    <td className="px-3 py-2.5 text-center">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right">{money(it.rate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{money(it.qty * it.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* declaration + totals — the declaration is print furniture; on a
              phone the money block leads. */}
          <div className="flex justify-between gap-8 flex-wrap mt-5">
            <div className="flex-1 min-w-[230px] max-w-[360px] max-sm:hidden print:block">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold mb-1">Declaration</div>
              <p className="text-[10.5px] text-muted leading-relaxed">
                We declare that this invoice shows the actual price of the services
                described and that all particulars are true and correct. Services
                rendered under CIB&amp;RC approved chemicals by licensed applicators.
              </p>
            </div>
            <div className="w-full sm:w-[300px] text-[12.5px]">
              <div className="flex justify-between py-1">
                <span className="text-muted">Taxable value</span><span>{money(t.sub - t.disc)}</span>
              </div>
              {t.rows.map(([l, v]) => (
                <div key={l} className="flex justify-between py-1">
                  <span className="text-muted">{l}</span><span>{money(v)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5 mt-1 border-t-2 border-navy font-bold text-[13.5px]">
                <span>Invoice total</span><span>{money(t.total)}</span>
              </div>
              {t.paid > 0 && (
                <>
                  <div className="flex justify-between py-1 text-muted">
                    <span>Amount paid</span><span>− {money(t.paid)}</span>
                  </div>
                  <div className={'flex justify-between py-1.5 border-t border-line font-bold ' +
                    (t.balance > 0 ? 'text-accent' : '')}>
                    <span>Balance due</span><span>{money(t.balance)}</span>
                  </div>
                </>
              )}
              <p className="text-[10.5px] text-muted mt-2 leading-snug">{amountInWords(t.total)}</p>
            </div>
          </div>

          <div className="border-t border-line my-6" />

          {/* footer */}
          <div className="flex justify-between gap-8 flex-wrap">
            <p className="text-[10.5px] text-muted leading-relaxed max-w-[330px]">
              {(co?.docTerms?.invoice?.length
                ? co.docTerms.invoice
                : ['Payment due within 15 days of invoice date.',
                  'Interest at 18% p.a. applies on overdue amounts.',
                  'Subject to Chennai jurisdiction.']).join(' ')}
            </p>
            <div className="text-center min-w-[180px] max-sm:hidden print:block">
              <div className="h-[42px]" />
              <div className="border-t border-line pt-2 text-[11.5px] font-semibold">
                For {co?.name || '—'}
              </div>
              <div className="text-[10.5px] text-muted">Authorised signatory</div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- dialog */}
      {paying && inv.client && (
        <PayDialog
          inv={{ id: inv.id, clientName: inv.client.name, total: t.total, paid: t.paid, balance: t.balance }}
          onClose={() => setPaying(false)}
          onDone={(rid, amt, settled) => {
            setPaying(false);
            setNotice(
              `Receipt ${rid} issued — ${money(amt)} recorded`
              + (settled && settled > 1
                ? `, settling ${settled} invoices oldest first`
                : ` against ${inv.id}`),
            );
            setTimeout(() => setNotice(''), 5000);
            load();
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/invoices"
      className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-navy mb-3">
      ← All invoices
    </Link>
  );
}
