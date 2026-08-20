'use client';

/* ============================================================================
   The public invoice — what the Share link opens. No login, phone-first:
   the customer taps the link in WhatsApp and reads their own tax invoice,
   with the paid / balance state exactly as the office sees it.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { money } from 'shared';

interface Doc {
  id: string; date: string; due: string; period: string; status: string; place: string;
  items: Array<{ desc: string; qty: number; rate: number; date: string; jobId: string }>;
  totals: { sub: number; disc: number; rows: Array<[string, number]>; total: number; paid: number; balance: number };
  payments: Array<{ id: string; amount: number; mode: string; date: string }>;
  client: { name: string; contact: string; phone: string; addr: string; city: string; pin: string; gstin: string } | null;
  company: {
    name: string; tagline: string; logo: string; addr: string; city: string; pin: string;
    phone: string; email: string; gstin: string;
  };
}

const fmtD = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso || '—';
};

export default function PublicInvoice() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch('/api/public/docs/invoice/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDoc)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return <p className="p-10 text-center text-[14px] text-muted">This invoice is not available.</p>;
  }
  if (!doc) return <p className="p-10 text-center text-[14px] text-muted">Opening the invoice…</p>;

  const t = doc.totals;
  const co = doc.company;
  const paid = t.balance <= 0;

  return (
    <div className="min-h-screen bg-[#f4f5f8] py-4 px-3 sm:py-8">
      <div className="bg-white border border-[#e3e6ee] rounded-lg max-w-[820px] mx-auto shadow-sm">
        <div className="p-5 sm:p-10">
          {/* head — the stamp rides beside the company so the phone reads
              like a document, not a wrapped form. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2.5">
                {co.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={co.logo} alt="" className="h-9 sm:h-10 w-auto object-contain" />
                ) : (
                  <span className="w-10 h-10 rounded bg-[#1B2E65] text-white flex items-center justify-center font-bold text-[16px]">
                    {(co.name || 'P').charAt(0)}
                  </span>
                )}
                <div>
                  <div className="text-[15px] sm:text-[16px] font-bold text-[#1B2E65] leading-tight">{co.name}</div>
                </div>
              </div>
              <div className="text-[11px] sm:text-[11.5px] text-gray-500 leading-relaxed">
                {[co.addr, co.city].filter(Boolean).join(', ')}{co.pin ? ` — ${co.pin}` : ''}<br />
                {co.phone}{co.email ? ` · ${co.email}` : ''}<br />
                GSTIN: {co.gstin || '—'}
              </div>
            </div>
            <span className={'inline-block border-2 rounded px-3 py-1 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] shrink-0 '
              + (paid ? 'text-[#1B2E65] border-[#1B2E65]' : 'text-[#FF0000] border-[#FF0000]')}>
              {paid ? 'Paid' : 'Payment due'}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
            <div>
              <div className="text-[17px] sm:text-[19px] font-bold tracking-[0.13em] text-[#1B2E65] leading-tight">TAX INVOICE</div>
              <div className="text-[13px] font-semibold text-gray-500">{doc.id}</div>
            </div>
            <div className="text-[11.5px] text-gray-500 leading-relaxed sm:text-right">
              Invoice date: <strong className="text-gray-900">{fmtD(doc.date)}</strong><br />
              Due date: <strong className="text-gray-900">{fmtD(doc.due)}</strong>
            </div>
          </div>

          <div className="border-t-2 border-[#1B2E65] my-4 sm:my-6" />

          {/* parties — two columns even on a phone */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Bill to</div>
              <div className="text-[13.5px] sm:text-[14.5px] font-bold break-words">{doc.client?.name || '—'}</div>
              <div className="text-[11.5px] text-gray-500 leading-relaxed mt-1 break-words">
                {doc.client?.contact && <>{doc.client.contact}<br /></>}
                {[doc.client?.addr, doc.client?.city].filter(Boolean).join(', ')}
                {doc.client?.pin ? ` — ${doc.client.pin}` : ''}<br />
                {doc.client?.phone}
                {doc.client?.gstin && <><br />GSTIN: {doc.client.gstin}</>}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Billing period</div>
              <div className="text-[13px] font-semibold break-words">{doc.period || '—'}</div>
              <div className="text-[11.5px] text-gray-500 mt-1.5">
                Place of supply: <strong className="text-gray-900">{doc.place}</strong><br />
                SAC: <strong className="text-gray-900">998531</strong>
              </div>
            </div>
          </div>

          {/* items — stacked cards on a phone, the table from tablet up */}
          <div className="sm:hidden mt-5 border border-[#e3e6ee] rounded divide-y divide-[#eef0f5]">
            {doc.items.map((it, i) => (
              <div key={i} className="px-3.5 py-2.5">
                <p className="text-[13px] font-semibold">{it.desc}</p>
                {(it.date || it.jobId) && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {[it.date && fmtD(it.date), it.jobId].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-[12.5px] mt-1 flex justify-between">
                  <span className="text-gray-500">{it.qty} × {money(it.rate)}</span>
                  <span className="font-bold">{money(it.qty * it.rate)}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 sm:mt-6 overflow-x-auto max-sm:hidden">
            <table className="w-full text-[12.5px] border-collapse min-w-[440px]">
              <thead>
                <tr>
                  {['#', 'Description of service', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h}
                      className={'bg-[#1B2E65] text-white text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2 '
                        + (i >= 3 ? 'text-right' : i === 2 ? 'text-center' : 'text-left')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.items.map((it, i) => (
                  <tr key={i} className="border-b border-[#eef0f5]">
                    <td className="px-3 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold">{it.desc}</span>
                      {(it.date || it.jobId) && (
                        <span className="block text-[11px] text-gray-500 mt-0.5">
                          {[it.date && fmtD(it.date), it.jobId].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right">{money(it.rate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{money(it.qty * it.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* totals */}
          <div className="flex justify-end mt-5">
            <div className="w-full sm:w-[300px] text-[12.5px]">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Taxable value</span><span>{money(t.sub - t.disc)}</span>
              </div>
              {t.rows.map(([l, v]) => (
                <div key={l} className="flex justify-between py-1">
                  <span className="text-gray-500">{l}</span><span>{money(v)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5 mt-1 border-t-2 border-[#1B2E65] font-bold text-[13.5px]">
                <span>Invoice total</span><span>{money(t.total)}</span>
              </div>
              {t.paid > 0 && (
                <>
                  <div className="flex justify-between py-1 text-gray-500">
                    <span>Amount paid</span><span>− {money(t.paid)}</span>
                  </div>
                  <div className={'flex justify-between py-1.5 border-t border-[#e3e6ee] font-bold '
                    + (t.balance > 0 ? 'text-[#FF0000]' : 'text-[#1B2E65]')}>
                    <span>Balance due</span><span>{money(t.balance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {doc.payments.length > 0 && (
            <div className="mt-5 rounded border border-[#e3e6ee] px-4 py-3">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
                Payments received
              </div>
              {doc.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-[12px] py-0.5">
                  <span className="text-gray-500">{fmtD(p.date)} · {p.mode} · {p.id}</span>
                  <span className="font-semibold">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10.5px] text-gray-400 leading-relaxed mt-6">
            Payment due within 15 days of invoice date. This is a computer-generated
            invoice from {co.name}.
          </p>
        </div>
      </div>
    </div>
  );
}
