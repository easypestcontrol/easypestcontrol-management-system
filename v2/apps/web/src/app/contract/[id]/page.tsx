'use client';

/* ============================================================================
   The public contract — what the Share link opens. The customer sees their
   own agreement: services, the visit schedule with what is done and what is
   coming, the period and the value. No login, phone-first.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { money } from 'shared';

interface Doc {
  id: string; mode: string; billing: string; value: number;
  start: string; end: string; months: number; site: string; billAddr: string;
  plan: Array<{ service: string; visits: number; freq: string; crew: number }>;
  schedule: Array<{ id: string; date: string; slot: string; status: string; services: string }>;
  client: { name: string; contact: string; phone: string; addr: string; city: string } | null;
  company: {
    name: string; tagline: string; logo: string; addr: string; city: string; pin: string;
    phone: string; email: string; gstin: string;
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
            <div className="max-w-[300px]">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Service site</div>
              <div className="text-[12px] text-gray-700 leading-relaxed">
                {doc.site || [doc.client?.addr, doc.client?.city].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>

          {/* services */}
          <div className="mt-5 sm:mt-6 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-[380px]">
              <thead>
                <tr>
                  {['Service', 'Visits', 'Frequency'].map((h, i) => (
                    <th key={h}
                      className={'bg-[#141414] text-white text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2 '
                        + (i > 0 ? 'text-center' : 'text-left')}>
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
                    <td className="px-3 py-2.5 text-center">{l.freq || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
                    <span className="block text-[11px] text-gray-500">{fmtD(s.date)} · {s.slot}</span>
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

          {(co.docTerms?.contract || []).length > 0 && (
            <div className="mt-6">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Terms</div>
              <ul className="text-[10.5px] text-gray-500 leading-relaxed list-disc pl-4">
                {co.docTerms!.contract!.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[10.5px] text-gray-400 leading-relaxed mt-6">
            This is a live view of your service contract with {co.name} — the schedule
            updates as services are completed.
          </p>
        </div>
      </div>
    </div>
  );
}
