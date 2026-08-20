'use client';

/* ============================================================================
   The quotation as a document — an A4-styled sheet in the three-color system:
   white paper, navy ink, red accents. Ported from v1 docHtml
   (quotations.js:630-760); the same component paints the staff detail page
   and the public approve page, and IS the PDF: the print CSS below isolates
   the sheet, and the browser's print dialog saves it as an A4 PDF.

   Preserved v1 quirk: the printed Terms & Conditions come from the COMPANY
   settings, not the quotation's own terms — quotations.js:710 (V2_PARITY 1.9).
   ========================================================================== */

import dynamic from 'next/dynamic';
import { docTotals, money } from 'shared';

// pdf.js runs in the browser only
const SheetPages = dynamic(() => import('./sheet-pages'), { ssr: false });
import {
  QUOTE_STATUS, amountInWords, fmtDate, lineVisits, validOf,
  type DocCompany, type QuoteFull,
} from './lib';

const STAMP: Record<string, string> = {
  draft: 'text-muted-2 border-line',
  sent: 'text-navy border-navy',
  approved: 'text-navy border-navy',
  rejected: 'text-accent border-red-line',
};

export default function QuoteDoc({ q, company }: { q: QuoteFull; company: DocCompany }) {
  const t = docTotals(
    q.items, q.discount, q.placeOfSupply,
    company.state || 'Tamil Nadu', company.gstRate || 18,
  );
  const party = q.party;
  const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
  const totalVisits = q.items.reduce((n, i) => n + lineVisits(i), 0);

  return (
    <div className="qdoc bg-white border border-line rounded-sm max-w-[820px] mx-auto shadow-card">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qdoc, .qdoc * { visibility: visible; }
          .qdoc {
            position: absolute; left: 0; top: 0; width: 100%;
            max-width: none; margin: 0; border: 0; border-radius: 0; box-shadow: none;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <div className="p-5 sm:p-10">

        {/* ------------------------------------------------------- header */}
        <div className="flex flex-wrap justify-between gap-6">
          <div className="min-w-[230px] flex-1">
            <div className="mb-3">
              {company.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo} alt="" className="h-10 max-w-[120px] object-contain" />
              ) : (
                <span className="w-10 h-10 rounded bg-navy text-white flex items-center justify-center font-bold text-[17px]">
                  {(company.name || 'P').charAt(0)}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-[18px] font-bold text-navy leading-tight">{company.name}</div>
              </div>
            </div>
            <div className="text-[11.5px] text-muted leading-relaxed">
              {company.addr && <>{company.addr}<br /></>}
              {[company.city, company.state].filter(Boolean).join(', ')}
              {company.pin ? ' — ' + company.pin : ''}<br />
              {[company.phone, company.email].filter(Boolean).join(' · ')}<br />
              {company.gstin && <>GSTIN: {company.gstin}</>}
            </div>
          </div>
          <div className="text-right sm:shrink-0">
            <span className={'inline-block border-2 rounded px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ' + (STAMP[q.status] || STAMP.draft)}>
              {st.label}
            </span>
            <div className="text-[23px] font-bold tracking-[0.18em] text-navy mt-2.5">QUOTATION</div>
            <div className="text-[13px] font-mono text-ink-2">{q.id}</div>
            <div className="text-[11.5px] text-muted mt-2 leading-relaxed">
              Date: <span className="font-semibold text-ink">{fmtDate(q.date)}</span><br />
              Valid till: <span className="font-semibold text-ink">{fmtDate(validOf(q))}</span>
            </div>
          </div>
        </div>

        <div className="border-t-2 border-accent my-6" />

        {/* -------------------------------------------- for whom, and what */}
        <div className="flex flex-wrap justify-between gap-6">
          <div className="min-w-[220px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Quotation for
            </div>
            <div className="text-[14.5px] font-bold text-navy">{party?.name || '—'}</div>
            <div className="text-[11.5px] text-muted leading-relaxed mt-1 whitespace-pre-line">
              {[
                party?.contact && party.contact !== party.name ? party.contact : '',
                q.billAddr ||
                  [party?.addr, [party?.city, party?.pin].filter(Boolean).join(' ')]
                    .filter(Boolean).join('\n'),
                [party?.phone, party?.email].filter(Boolean).join(' · '),
                party?.gstin ? 'GSTIN: ' + party.gstin : '',
              ].filter(Boolean).join('\n')}
            </div>
          </div>
          <div className="min-w-[200px] max-w-[300px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Shipping address
            </div>
            <div className="text-[13px] font-semibold text-navy">{party?.name || '—'}</div>
            <div className="text-[11.5px] text-muted leading-relaxed mt-1 whitespace-pre-line">
              {q.shipAddr ||
                [party?.addr, [party?.city, party?.pin].filter(Boolean).join(' ')]
                  .filter(Boolean).join('\n') || '—'}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- items */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-navy">
                <th className="text-left py-2 pr-2 w-[34px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">#</th>
                <th className="text-left py-2 pr-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Service description</th>
                <th className="text-center py-2 px-2 w-[64px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Qty</th>
                <th className="text-right py-2 px-2 w-[92px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Rate</th>
                <th className="text-right py-2 pl-2 w-[104px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Amount</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={it.id ?? i} className="border-b border-line-soft align-top">
                  <td className="py-2.5 pr-2 text-muted">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-ink">{it.name}</div>
                    {it.desc && (
                      <div className="text-[11.5px] text-muted leading-relaxed mt-0.5">{it.desc}</div>
                    )}
                    <div className="text-[10.5px] text-muted-2 mt-0.5">{it.unit || ''}</div>
                  </td>
                  <td className="py-2.5 px-2 text-center">{it.qty}</td>
                  <td className="py-2.5 px-2 text-right">{money(it.rate)}</td>
                  <td className="py-2.5 pl-2 text-right font-semibold">{money(it.qty * it.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --------------------------------------- terms | totals, in words */}
        <div className="flex flex-wrap justify-between gap-6 mt-5">
          <div className="flex-1 min-w-[230px] max-w-[380px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Terms &amp; conditions
            </div>
            {/* v1 quirk preserved: the printed T&C are the company's, not q.terms */}
            <ol className="text-[11px] text-muted leading-[1.75] pl-4 list-decimal">
              {(company.terms || []).map((x, i) => <li key={i}>{x}</li>)}
            </ol>
            {q.notes && (
              <>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mt-3.5 mb-1">
                  Special notes
                </div>
                <div className="text-[11.5px] text-ink-2 leading-relaxed whitespace-pre-line">{q.notes}</div>
              </>
            )}
          </div>
          <div className="w-full sm:w-[260px] sm:shrink-0">
            <div className="flex justify-between text-[12.5px] py-1">
              <span className="text-muted">Subtotal</span><span>{money(t.sub)}</span>
            </div>
            {t.disc > 0 && (
              <div className="flex justify-between text-[12.5px] py-1">
                <span className="text-muted">Discount</span>
                <span className="text-accent">− {money(t.disc)}</span>
              </div>
            )}
            <div className="flex justify-between text-[12.5px] py-1">
              <span className="text-muted">Taxable value</span><span>{money(t.sub - t.disc)}</span>
            </div>
            {t.tax.rows.map((r) => (
              <div key={r[0]} className="flex justify-between text-[12.5px] py-1">
                <span className="text-muted">{r[0]}</span><span>{money(r[1])}</span>
              </div>
            ))}
            <div className="flex justify-between items-baseline border-t border-navy mt-1.5 pt-2">
              <span className="text-[13px] font-bold text-navy">Total</span>
              <span className="text-[16px] font-bold text-accent">{money(t.total)}</span>
            </div>
            <div className="text-[10.5px] text-muted leading-relaxed mt-2">
              {amountInWords(t.total)}
            </div>
          </div>
        </div>

        <div className="border-t border-line my-6" />

        {/* -------------------------------------- contact | signature blocks */}
        <div className="flex flex-wrap justify-between gap-6">
          <div className="text-[11px] text-muted leading-[1.7]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Questions
            </div>
            {company.name}<br />
            {[company.phone, company.email].filter(Boolean).join(' · ')}
          </div>
          <div className="flex flex-wrap gap-8">
            {q.signCustomer && (
              <div className="text-center min-w-[170px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={q.signCustomer} alt="Customer signature" className="h-[42px] max-w-[200px] object-contain mx-auto block" />
                <div className="border-t border-line pt-1.5 mt-1 text-[11.5px] font-semibold">Accepted by</div>
                <div className="text-[10.5px] text-muted">{party?.name || 'Customer'}</div>
              </div>
            )}
            <div className="text-center min-w-[180px]">
              {q.signExec || q.ownerSign ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.signExec || q.ownerSign} alt="Signature" className="h-[42px] max-w-[200px] object-contain mx-auto block" />
              ) : (
                <div className="h-[42px]" />
              )}
              <div className="border-t border-line pt-1.5 mt-1 text-[11.5px] font-semibold">
                For {company.name}
              </div>
              <div className="text-[10.5px] text-muted">{q.ownerName} · Authorised signatory</div>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-muted-2 mt-8">
          This is a computer-generated quotation and does not require a signature.
        </div>

        {/* On paper, the sheets are named; on screen, they are shown below. */}
        {(q.sheets?.length || 0) > 0 && (
          <div className="text-[10.5px] text-muted mt-2 print:block hidden">
            Attached: {q.sheets!.map((x) => x.name + ' — service information sheet').join(' · ')}
          </div>
        )}
      </div>

      {/* ------------------------- the service information sheets ---------- */}
      {(q.sheets?.length || 0) > 0 && (
        <div className="mt-5 print:hidden">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">
            Service information sheets — part of this quotation
          </p>
          {q.sheets!.map((sh) => {
            const sheetUrl = '/api/public/quotes/' + q.id + '/sheet/' + sh.id;
            return (
              <div key={sh.id} className="rounded-md border border-line bg-white mb-4 overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-line-soft">
                  <span className="w-8 h-8 rounded bg-red-wash text-accent flex items-center justify-center font-bold text-[10px] shrink-0">
                    PDF
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{sh.name}</span>
                    <span className="block text-[10.5px] text-muted">Service information sheet — part of this quotation</span>
                  </span>
                  <a href={sheetUrl + '?dl=1'}
                    className="h-8 px-3 rounded bg-navy text-white text-[12px] font-semibold hover:brightness-110 inline-flex items-center shrink-0">
                    Download
                  </a>
                </div>
                {/* the pages themselves, flowing like any other content */}
                <SheetPages url={sheetUrl} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
