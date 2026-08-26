'use client';

/* ============================================================================
   /invoices/print?ids=INV-1,INV-2,…  — the selected invoices as ONE
   document, a page per invoice, ready for Save as PDF. This is the finance
   team's export: select on the list, Download PDF, file it with the
   accounts. The print dialog opens by itself once everything has loaded.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { money } from 'shared';
import { api, type Bootstrap, type Company } from '@/lib/api';
import { SignArea } from '@/components/sign-area';
import { amountInWords, fmtDate, type InvoiceDetail } from '../ui';

const PRINT_CSS = `
@media print {
  /* Zero page margin ALSO silences the browser's own header and footer —
     the localhost URL and the date it writes into that margin. The sheet
     brings its own padding instead. */
  @page { size: A4; margin: 0; }
  /* nav too: the mobile bottom bar "shows" in print because the paper is
     narrower than the lg breakpoint. */
  aside, header, nav, .no-print { display: none !important; }
  html, body { height: auto !important; background: #fff !important; margin: 0 !important; }
  div, main { height: auto !important; overflow: visible !important; }
  main { padding: 0 !important; }
  .inv-wrap { padding: 0 !important; }
  .inv-flow { gap: 0 !important; }
  .inv-page { border: none !important; border-radius: 0 !important; box-shadow: none !important;
    max-width: none !important; margin: 0 !important; page-break-after: always;
    /* a shade smaller, so a full year of visits stays on ONE page */
    zoom: 0.8; }
  .inv-page:last-child { page-break-after: auto; }
  .inv-page > div { padding: 12mm 14mm !important; }
}`;

export default function InvoicesPrint() {
  const [docs, setDocs] = useState<InvoiceDetail[] | null>(null);
  const [co, setCo] = useState<Company | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    const ids = (new URLSearchParams(window.location.search).get('ids') || '')
      .split(',').map((x) => x.trim()).filter(Boolean).slice(0, 100);
    api.get<Bootstrap>('/org/bootstrap').then((b) => setCo(b.company)).catch(() => {});
    (async () => {
      const out: InvoiceDetail[] = [];
      const gone: string[] = [];
      for (const id of ids) {
        try { out.push(await api.get<InvoiceDetail>('/invoices/' + id)); }
        catch { gone.push(id); }
      }
      setDocs(out);
      setMissing(gone);
    })();
  }, []);

  // Everything on the page → straight into the print dialog, once.
  useEffect(() => {
    if (docs && docs.length && co) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [docs, co]);

  if (!docs || !co) {
    return <p className="p-10 text-center text-[13px] text-muted">Preparing the invoices…</p>;
  }
  if (!docs.length) {
    return <p className="p-10 text-center text-[13px] text-muted">Nothing to print — no invoices found.</p>;
  }

  return (
    <div className="inv-wrap p-4 lg:p-6 max-lg:overflow-x-auto">
      <style>{PRINT_CSS}</style>

      <div className="no-print max-w-[820px] mx-auto mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-[13.5px] font-semibold">
          {docs.length} invoice{docs.length === 1 ? '' : 's'} — one page each.
        </span>
        <button onClick={() => window.print()}
          className="h-9 px-4 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110">
          Print / Save as PDF
        </button>
        <span className="text-[12px] text-muted">
          In the print dialog choose “Save as PDF” to download the single file.
        </span>
        {missing.length > 0 && (
          <span className="text-[12px] text-accent">Not found: {missing.join(', ')}</span>
        )}
      </div>

      <div className="inv-flow flex flex-col gap-6">
        {docs.map((inv) => <InvoiceSheet key={inv.id} inv={inv} co={co} />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- one A4 invoice */

function InvoiceSheet({ inv, co }: { inv: InvoiceDetail; co: Company }) {
  const t = inv.totals;
  const placeLabel = t.place + (t.place === 'Tamil Nadu' ? ' (33)' : '');

  return (
    <div className="inv-page bg-white border border-line rounded-md max-w-[820px] mx-auto shadow-card">
      <div className="p-8">
        {/* head */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2.5">
              {co.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={co.logo} alt="" className="h-10 w-auto object-contain" />
              ) : (
                <span className="w-10 h-10 rounded bg-navy text-white flex items-center justify-center font-bold text-[16px]">
                  {(co.name || 'P').charAt(0)}
                </span>
              )}
              <div className="text-[15px] font-bold text-navy leading-tight mt-1.5">{co.name}</div>
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              {[co.addr, co.city].filter(Boolean).join(', ')}{co.pin ? <> — {co.pin}</> : null}<br />
              {co.phone}{co.email ? <> · {co.email}</> : null}<br />
              GSTIN: {co.gstin || '—'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[17px] font-bold tracking-[0.13em] text-navy leading-tight">TAX INVOICE</div>
            <div className="text-[13px] font-semibold text-muted">{inv.id}</div>
          </div>
          <div className="text-[11.5px] text-muted leading-relaxed text-right">
            Invoice date: <strong className="text-ink">{fmtDate(inv.date)}</strong><br />
            Due date: <strong className="text-ink">{fmtDate(inv.due)}</strong>
          </div>
        </div>

        <div className="border-t-2 border-navy my-4" />

        {/* parties */}
        <div className="grid grid-cols-2 gap-6">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold mb-1">Bill to</div>
            <div className="text-[13.5px] font-bold break-words">{inv.client?.name || '—'}</div>
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
            <div className="text-[13px] font-semibold break-words">{inv.period || '—'}</div>
            <div className="text-[11.5px] text-muted leading-relaxed mt-1.5">
              {inv.contract && <>Contract: <strong className="text-ink">{inv.contract.id}</strong><br /></>}
              Place of supply: <strong className="text-ink">{placeLabel}</strong><br />
              SAC: <strong className="text-ink">998531</strong>
            </div>
          </div>
        </div>

        {/* items */}
        <table className="w-full text-[12px] border-collapse mt-5">
          <thead>
            <tr>
              {['#', 'Description of service', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                <th key={h}
                  className={'bg-navy text-white text-[10px] uppercase tracking-wider font-semibold px-3 py-1.5 '
                    + (i >= 3 ? 'text-right' : i === 2 ? 'text-center' : 'text-left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-line-soft">
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{it.desc}</td>
                <td className="px-3 py-2 text-center">{it.qty}</td>
                <td className="px-3 py-2 text-right">{money(it.rate)}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(it.qty * it.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* totals */}
        <div className="flex justify-end mt-4">
          <div className="w-[290px] text-[12px]">
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Taxable value</span><span>{money(t.sub - t.disc)}</span>
            </div>
            {t.rows.map(([l, v]) => (
              <div key={l} className="flex justify-between py-0.5">
                <span className="text-muted">{l}</span><span>{money(v)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 mt-1 border-t-2 border-navy font-bold text-[13px]">
              <span>Invoice total</span><span>{money(t.total)}</span>
            </div>
            <p className="text-[10px] text-muted mt-1.5 leading-snug">{amountInWords(t.total)}</p>
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <div className="text-center min-w-[180px]">
            <SignArea sign={co.sign} seal={co.seal} />
            <div className="border-t border-line pt-2 text-[11.5px] font-semibold">For {co.name}</div>
            <div className="text-[10.5px] text-muted">Authorised signatory</div>
          </div>
        </div>

        <p className="text-[10px] text-muted leading-relaxed mt-5 pt-3 border-t border-line">
          {(co.docTerms?.invoice || []).join(' ')} — {co.name}
        </p>
      </div>
    </div>
  );
}
