'use client';

/* ============================================================================
   The purchase order as a document.

   Same A4 sheet as the quotation, and deliberately so — a vendor should
   recognise it as the same kind of paper the customer gets, and there should be
   one house style, not two. The differences are only the ones that matter:

     quotation             purchase order
     ─────────             ──────────────
     QUOTATION FOR         ORDER TO          (the vendor — we are the customer)
     shipping address      DELIVER TO        (our branch, the shelf it fills)
     service description   chemical          (with the pack arithmetic spelled out)
     valid till            expected by
     rate and amount       — nothing —       (see below)

   **There is no money on this document.** An order says what we want and how
   much of it; the price is whatever the vendor invoices. A figure typed in at
   ordering time is one nobody checked, and printing it invites an argument
   about a number we never agreed.

   The pack line is the part a vendor actually reads: "10 packet × 500 g =
   5,000 g". It says what we ordered in *their* units and what it means in ours,
   so a short delivery is obvious to both sides.

   Printing works the same way as the quotation: the print CSS isolates the
   sheet and the browser's print dialog saves it as A4.
   ========================================================================== */

import { fmtDate, type DocCompany } from '../quotations/lib';

export interface PoDocLine {
  id: number; itemId: string; name: string; cat: string; baseUnit: string;
  packUnit: string; packSize: number; qty: number; receivedQty: number;
}

export interface PoDocOrder {
  id: string; date: string; expected: string; status: string;
  branch: string; notes: string;
  terms: string[]; orderedAt: string; receivedAt: string;
  items: PoDocLine[];
  vendor: {
    name: string; gstin: string; contact: string; phone: string; email: string;
    addr: string; city: string; state: string; pincode: string; terms: string;
  };
}

const STAMP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'text-muted-2 border-line' },
  ordered: { label: 'Ordered', cls: 'text-navy border-navy' },
  partial: { label: 'Part received', cls: 'text-accent border-red-line' },
  received: { label: 'Received', cls: 'text-navy border-navy' },
  cancelled: { label: 'Cancelled', cls: 'text-accent border-red-line' },
};

/* The vendor-facing terms. A quotation prints the company's customer terms,
   which are about visits and warranties and mean nothing to a supplier — so a
   purchase order carries its own. The order's own `terms` win when set. */
const PURCHASE_TERMS = [
  'Goods must be delivered to the address shown above, within the expected date.',
  'The invoice must quote this purchase order number.',
  'Quantities are in the pack sizes stated. Short or excess supply is to be advised before despatch.',
  'Material found damaged, expired or below specification will be returned at the supplier’s cost.',
  'Payment as per the agreed terms, from the date of a correct invoice.',
];

export default function PoDoc({ po, company, branchName, branchAddr }: {
  po: PoDocOrder;
  company: DocCompany;
  branchName: string;
  branchAddr?: string;
}) {
  const st = STAMP[po.status] || STAMP.draft;
  // What the order is worth to a store: base units, not rupees.
  const totalBase = po.items.reduce((a, l) => a + l.qty * l.packSize, 0);
  const units = [...new Set(po.items.map((l) => l.baseUnit))];
  const v = po.vendor;
  const terms = po.terms?.length ? po.terms : PURCHASE_TERMS;
  const anyReceived = po.items.some((l) => l.receivedQty > 0);

  return (
    <div className="qdoc bg-white border border-line rounded-sm max-w-[820px] mx-auto shadow-card">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qdoc, .qdoc * { visibility: visible; }
          .qdoc {
            position: absolute; left: 0; top: 0; width: 100%;
            max-width: none; margin: 0; border: 0; border-radius: 0; box-shadow: none;
            padding: 14mm !important;
          }
          .no-print { display: none !important; }
          /* margin 0 drops the browser's URL/date header-footer;
             the 14mm lives on .qdoc instead */
          @page { size: A4; margin: 0; }
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
            <span className={'inline-block border-2 rounded px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ' + st.cls}>
              {st.label}
            </span>
            <div className="text-[23px] font-bold tracking-[0.18em] text-navy mt-2.5">PURCHASE ORDER</div>
            <div className="text-[13px] font-mono text-ink-2">{po.id}</div>
            <div className="text-[11.5px] text-muted mt-2 leading-relaxed">
              Date: <span className="font-semibold text-ink">{fmtDate(po.date)}</span><br />
              {po.expected && (
                <>Expected by: <span className="font-semibold text-ink">{fmtDate(po.expected)}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="border-t-2 border-accent my-6" />

        {/* ----------------------------------------- who, and where it goes */}
        <div className="flex flex-wrap justify-between gap-6">
          <div className="min-w-[220px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Order to
            </div>
            <div className="text-[14.5px] font-bold text-navy">{v.name}</div>
            <div className="text-[11.5px] text-muted leading-relaxed mt-1 whitespace-pre-line">
              {[
                v.contact && v.contact !== v.name ? v.contact : '',
                v.addr,
                [v.city, v.state].filter(Boolean).join(', ') + (v.pincode ? ' — ' + v.pincode : ''),
                [v.phone, v.email].filter(Boolean).join(' · '),
                v.gstin ? 'GSTIN: ' + v.gstin : '',
              ].filter((x) => x && x.trim() && x.trim() !== '—').join('\n')}
            </div>
          </div>
          <div className="min-w-[200px] max-w-[300px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Deliver to
            </div>
            <div className="text-[13px] font-semibold text-navy">
              {company.name}{branchName ? ' — ' + branchName : ''}
            </div>
            <div className="text-[11.5px] text-muted leading-relaxed mt-1 whitespace-pre-line">
              {branchAddr
                || [company.addr, [company.city, company.pin].filter(Boolean).join(' ')]
                  .filter(Boolean).join('\n') || '—'}
            </div>
            {v.terms && (
              <div className="text-[11.5px] text-muted mt-2">Payment: {v.terms}</div>
            )}
          </div>
        </div>

        {/* -------------------------------------------------- the chemicals */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-navy">
                <th className="text-left py-2 pr-2 w-[34px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">#</th>
                <th className="text-left py-2 pr-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Chemical</th>
                <th className="text-center py-2 px-2 w-[86px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Quantity</th>
                <th className="text-center py-2 px-2 w-[96px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Pack size</th>
                <th className="text-right py-2 pl-2 w-[112px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((l, i) => {
                const left = l.qty - l.receivedQty;
                return (
                  <tr key={l.id ?? i} className="border-b border-line-soft align-top">
                    <td className="py-2.5 pr-2 text-muted">{i + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-ink">{l.name}</div>
                      {l.cat && <div className="text-[11.5px] text-muted mt-0.5">{l.cat}</div>}
                      {anyReceived && (
                        <div className={'text-[10.5px] mt-1 font-semibold '
                          + (left === 0 ? 'text-navy' : 'text-accent')}>
                          {left === 0
                            ? `Received in full`
                            : `${l.receivedQty} of ${l.qty} ${l.packUnit} received · ${left} outstanding`}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="text-[14px] font-bold">{l.qty}</span>
                      <div className="text-[10.5px] text-muted-2">{l.packUnit}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {l.packSize.toLocaleString('en-IN')} {l.baseUnit}
                      <div className="text-[10.5px] text-muted-2">per {l.packUnit}</div>
                    </td>
                    <td className="py-2.5 pl-2 text-right font-semibold">
                      {(l.qty * l.packSize).toLocaleString('en-IN')} {l.baseUnit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* --------------------------------------- terms | totals, in words */}
        <div className="flex flex-wrap justify-between gap-6 mt-5">
          <div className="flex-1 min-w-[230px] max-w-[380px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
              Terms &amp; conditions
            </div>
            <ol className="text-[11px] text-muted leading-[1.75] pl-4 list-decimal">
              {terms.map((x, i) => <li key={i}>{x}</li>)}
            </ol>
            {po.notes && (
              <>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted mt-3.5 mb-1">
                  Special notes
                </div>
                <div className="text-[11.5px] text-ink-2 leading-relaxed whitespace-pre-line">{po.notes}</div>
              </>
            )}
          </div>
          <div className="w-full sm:w-[260px] sm:shrink-0">
            <div className="flex justify-between text-[12.5px] py-1">
              <span className="text-muted">Lines</span>
              <span>{po.items.length}</span>
            </div>
            <div className="flex justify-between text-[12.5px] py-1">
              <span className="text-muted">Packs ordered</span>
              <span>{po.items.reduce((a, l) => a + l.qty, 0)}</span>
            </div>
            {units.length === 1 && (
              <div className="flex justify-between items-baseline border-t border-navy mt-1.5 pt-2">
                <span className="text-[13px] font-bold text-navy">Total quantity</span>
                <span className="text-[16px] font-bold text-accent">
                  {totalBase.toLocaleString('en-IN')} {units[0]}
                </span>
              </div>
            )}
            {units.length > 1 && (
              <div className="border-t border-navy mt-1.5 pt-2">
                <div className="text-[13px] font-bold text-navy mb-1">Total quantity</div>
                {units.map((u) => (
                  <div key={u} className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-muted">{u}</span>
                    <span className="font-semibold">
                      {po.items.filter((l) => l.baseUnit === u)
                        .reduce((a, l) => a + l.qty * l.packSize, 0)
                        .toLocaleString('en-IN')} {u}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10.5px] text-muted leading-relaxed mt-2">
              Prices are not stated on this order. Invoice as per your quotation,
              quoting {po.id}.
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
          <div className="text-center min-w-[180px]">
            <div className="h-[42px]" />
            <div className="border-t border-line pt-1.5 mt-1 text-[11.5px] font-semibold">
              For {company.name}
            </div>
            <div className="text-[10.5px] text-muted">Authorised signatory</div>
          </div>
        </div>

        <div className="text-[10px] text-muted-2 mt-8">
          This is a computer-generated purchase order and does not require a signature.
          {po.receivedAt && <> Goods received {fmtDate(po.receivedAt.slice(0, 10))}.</>}
        </div>
      </div>
    </div>
  );
}
