'use client';

/* ============================================================================
   The public contract — what the Share link opens. The customer sees their
   own agreement: services, the visit schedule with what is done and what is
   coming, the period and the value. No login, phone-first.
   ========================================================================== */

import { SignArea } from '@/components/sign-area';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { money } from 'shared';

interface Doc {
  id: string; mode: string; billing: string; value: number;
  start: string; end: string; months: number; site: string; billAddr: string;
  plan: Array<{
    service: string; visits: number; freq: string; crew: number;
    rate: number; amount: number;
  }>;
  scope?: string;
  notes?: string;
  place?: string;
  totals?: { sub: number; disc: number; rows: Array<[string, number]>; total: number };
  schedule: Array<{
    id: string; date: string; slot: string; slotEnd?: string;
    status: string; services: string; techs?: string;
  }>;
  terms?: string[];
  signCustomer?: string;
  signExec?: string;
  client: { name: string; contact: string; phone: string; addr: string; city: string } | null;
  company: {
    name: string; tagline: string; logo: string; addr: string; city: string; pin: string;
    phone: string; email: string; gstin: string; sign?: string; seal?: string;
    docTerms?: { quotation?: string[]; invoice?: string[]; contract?: string[]; service?: string[] };
  };
}

const fmtD = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso || '—';
};

export default function PublicContract() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch('/api/public/docs/contract/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDoc)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return <p className="p-10 text-center text-[14px] text-gray-500">This contract is not available.</p>;
  }
  if (!doc) return <p className="p-10 text-center text-[14px] text-gray-500">Opening the contract…</p>;

  const co = doc.company;
  const done = doc.schedule.filter((s) => s.status === 'completed').length;
  const open = doc.schedule.filter((s) => s.status !== 'completed' && s.status !== 'cancelled');

  return (
    <div className="min-h-screen bg-[#f4f5f8] py-4 px-3 sm:py-8">
      <div className="bg-white border border-[#e3e6ee] rounded-lg max-w-[820px] mx-auto shadow-sm">
        <div className="p-5 sm:p-10">
          {/* head */}
          <div className="flex justify-between gap-6 flex-wrap">
            <div>
              <div className="mb-3">
                {co.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={co.logo} alt="" className="h-10 w-auto object-contain" />
                ) : (
                  <span className="w-10 h-10 rounded bg-[#141414] text-white flex items-center justify-center font-bold text-[16px]">
                    {(co.name || 'P').charAt(0)}
                  </span>
                )}
                <div className="text-[16px] font-bold text-[#141414] leading-tight mt-1.5">{co.name}</div>
              </div>
              <div className="text-[11.5px] text-gray-500 leading-relaxed">
                {co.addr}{co.city ? `, ${co.city}` : ''}{co.pin ? ` — ${co.pin}` : ''}<br />
                {co.phone}{co.email ? ` · ${co.email}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[18px] font-bold tracking-[0.1em] text-[#141414]">
                {doc.mode === 'amc' ? 'SERVICE CONTRACT (AMC)' : 'SERVICE CONTRACT'}
              </div>
              <div className="text-[13px] font-semibold text-gray-500">{doc.id}</div>
              <div className="text-[11.5px] text-gray-500 mt-2 leading-relaxed">
                Period: <strong className="text-gray-900">{fmtD(doc.start)} → {fmtD(doc.end)}</strong><br />
                Value: <strong className="text-gray-900">{money(doc.value)}</strong> · {doc.billing} billing
              </div>
            </div>
          </div>

          <div className="border-t-2 border-[#141414] my-5 sm:my-6" />

          {/* customer + site */}
          <div className="flex justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Customer</div>
              <div className="text-[14.5px] font-bold">{doc.client?.name || '—'}</div>
              <div className="text-[11.5px] text-gray-500 leading-relaxed mt-1">
                {doc.client?.contact && <>{doc.client.contact}<br /></>}
                {doc.client?.phone}
              </div>
            </div>
            {/* Both addresses, the way the quotation prints them — where the
                bill goes and where the work happens are not always the same
                place, and the agreement is the document that has to say so. */}
            <div className="max-w-[300px]">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Billing address
              </div>
              <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">
                {doc.billAddr || [doc.client?.addr, doc.client?.city].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
            <div className="max-w-[300px]">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Service site</div>
              <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">
                {doc.site || [doc.client?.addr, doc.client?.city].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>

          {/* services */}
          <div className="mt-5 sm:mt-6 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-[380px]">
              <thead>
                <tr>
                  {['Service', 'Visits', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h}
                      className={'bg-[#141414] text-white text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2 '
                        + (i === 0 ? 'text-left' : i >= 2 ? 'text-right' : 'text-center')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.plan.map((l, i) => (
                  <tr key={i} className="border-b border-[#eef0f5]">
                    <td className="px-3 py-2.5 font-semibold">{l.service}</td>
                    <td className="px-3 py-2.5 text-center">{l.visits}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(l.rate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ------------------------------------------------- what it costs

              The agreement used to print a single "Value" in its header and
              nothing else, while the quotation it came from broke the same
              figure into a subtotal, a discount and the tax split. A customer
              could not check the contract the way they had checked the quote.
              Same numbers, same engine, same layout. */}
          {doc.totals && (
            <div className="flex justify-end mt-5">
              <div className="w-full sm:w-[300px] text-[12.5px]">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="tabular-nums">{money(doc.totals.sub)}</span>
                </div>
                {doc.totals.disc > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Discount</span>
                    <span className="tabular-nums text-[#FF0000]">− {money(doc.totals.disc)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Taxable value</span>
                  <span className="tabular-nums">{money(doc.totals.sub - doc.totals.disc)}</span>
                </div>
                {doc.totals.rows.map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1">
                    <span className="text-gray-500">{l}</span>
                    <span className="tabular-nums">{money(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1.5 mt-1 border-t-2 border-[#141414] font-bold text-[13.5px]">
                  <span>Total</span>
                  <span className="tabular-nums">{money(doc.totals.total)}</span>
                </div>
                <p className="text-[10.5px] text-gray-400 mt-1 leading-relaxed">
                  {doc.billing} billing{doc.place ? ' · place of supply ' + doc.place : ''}
                </p>
              </div>
            </div>
          )}

          {(doc.scope || doc.notes) && (
            <div className="mt-6">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Scope of work
              </div>
              <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">
                {doc.scope || doc.notes}
              </p>
            </div>
          )}

          {/* schedule */}
          <div className="mt-6">
            <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
              Service schedule — {done} of {doc.schedule.length} completed
              {open.length ? `, next on ${fmtD(open[0].date)}` : ''}
            </div>
            <div className="rounded border border-[#e3e6ee] divide-y divide-[#eef0f5]">
              {doc.schedule.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]">
                  <span className="text-gray-400 w-5 shrink-0">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{s.services}</span>
                    <span className="block text-[11px] text-gray-500">
                      {fmtD(s.date)} · {s.slot}{s.slotEnd ? '–' + s.slotEnd : ''}
                      {/* Who is coming is the first thing a customer looks
                          for on a schedule, and it was the one thing the
                          agreement did not say. */}
                      {s.techs ? ' · ' + s.techs : ' · technician to be assigned'}
                    </span>
                  </span>
                  <span className={'text-[10.5px] font-bold uppercase tracking-wide shrink-0 '
                    + (s.status === 'completed' ? 'text-[#141414]'
                      : s.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-500')}>
                    {s.status === 'completed' ? 'Done' : s.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* The agreement's OWN terms first — the ones agreed on the
              quotation and carried across — and the company's standing list
              only when the agreement has none of its own. Reading the
              company default alone meant an account with an empty default
              printed a signed agreement with no terms on it whatsoever. */}
          {(() => {
            const terms = (doc.terms && doc.terms.length)
              ? doc.terms
              : (co.docTerms?.contract || []);
            if (!terms.length) return null;
            return (
              <div className="mt-6">
                <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                  Terms &amp; conditions
                </div>
                <ol className="text-[11px] text-gray-600 leading-relaxed list-decimal pl-4">
                  {terms.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </div>
            );
          })()}
          {/* An agreement is signed by two people. Only the company's side
              was ever printed, so the customer had nowhere to sign — on the
              one document in this app where that is the entire point. */}
          <div className="flex justify-between items-end gap-8 mt-8 flex-wrap">
            <div className="text-center min-w-[180px]">
              {doc.signCustomer ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doc.signCustomer} alt="" className="h-14 mx-auto object-contain" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-[#e3e6ee] pt-2 text-[11.5px] font-semibold">
                {doc.client?.name || 'Customer'}
              </div>
              <div className="text-[10.5px] text-gray-400">
                {doc.signCustomer ? 'Accepted' : 'Customer signature'}
              </div>
            </div>
            <div className="text-center min-w-[180px]">
              <SignArea sign={doc.signExec || co.sign} seal={co.seal} />
              <div className="border-t border-[#e3e6ee] pt-2 text-[11.5px] font-semibold">For {co.name}</div>
              <div className="text-[10.5px] text-gray-400">Authorised signatory</div>
            </div>
          </div>

          <p className="text-[10.5px] text-gray-400 leading-relaxed mt-6">
            This is a live view of your service contract with {co.name} — the schedule
            updates as services are completed.
          </p>
        </div>
      </div>
    </div>
  );
}
