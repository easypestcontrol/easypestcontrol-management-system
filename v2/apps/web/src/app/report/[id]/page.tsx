'use client';

/* ============================================================================
   The service report — a proper document, like the quotation and the invoice.
   Opens from the Share link or the "View service report" button once a
   service is completed: what was done, by whom, when, with which chemicals,
   the photos, and the customer's own signature. No login, phone-first.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { waLink } from 'shared';

interface Doc {
  id: string; date: string; slot: string; contractId: string;
  visitNo: number; ofVisits: number;
  services: Array<{ name: string; warranty: string }>;
  crew: Array<{ name: string; title: string; head: boolean }>;
  exec: {
    checkinAt: string; startedAt: string; finishedAt: string; durationMins: number;
    geo: string; photosBefore: string[]; photosAfter: string[];
    chemicals: Array<{ name: string; qty: number; unit: string }>;
    findings: string[]; areaFindings: Array<{ area: string; text: string }>;
    observations: string; techNotes: string;
    signedBy: string; signature: boolean; signatureImage: string; rating: number;
    reportSentAt: string;
  };
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
const fmtT = (stamp: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(stamp || '');
  if (!m) return '—';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}` : `${m} min`);

const LABEL = 'text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold';

export default function PublicReport() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [zoom, setZoom] = useState('');

  /* Zoom, not media queries — the same treatment the invoice gets. The sheet
     is 820px of paper and the phone is not, so it is scaled by whatever the
     viewport can give it rather than rearranged into a stack of cards. A
     report the customer opens and the report the office prints have to be
     the same document. `zoom` reflows the surrounding height correctly,
     which `transform: scale` does not. */
  const [fit, setFit] = useState<{ zoom?: number }>({});
  useEffect(() => {
    const size = () => {
      const room = window.innerWidth - 24;
      setFit(room < 820 ? { zoom: Math.max(0.34, room / 820) } : {});
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, []);

  useEffect(() => {
    fetch('/api/public/docs/report/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDoc)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return <p className="p-10 text-center text-[14px] text-gray-500">This report is not available yet.</p>;
  }
  if (!doc) return <p className="p-10 text-center text-[14px] text-gray-500">Opening the report…</p>;

  const x = doc.exec;
  const co = doc.company;
  const head = doc.crew.find((c) => c.head) || doc.crew[0];

  /* WhatsApp, to this customer, with a link to this page. */
  const share = typeof window === 'undefined' ? '' : waLink(
    doc.client?.phone,
    'Service report ' + doc.id + ' from ' + doc.company.name
    + ' — what was done, the photos and your signed acknowledgement:\n'
    + window.location.href,
  );

  return (
    <div className="paper-page min-h-screen bg-[#f4f5f8] pb-10 px-3 sm:py-8">
      {/* The phone gets a bar of its own: back to wherever you came from, and
          the report named. The sheet below is a document, and a document
          should not have to carry navigation. */}
      <div className="lg:hidden no-print sticky top-0 z-10 -mx-3 px-2 h-[60px] bg-[#f4f5f8]
        flex items-center gap-1">
        <button onClick={() => history.back()} aria-label="Back" className="p-2 text-[#141414]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold leading-tight">Service report</span>
          <span className="block text-[12.5px] text-gray-500 leading-tight">{doc.id}</span>
        </span>
      </div>

      <div style={fit}
        className="paper bg-white border border-[#e3e6ee] rounded-lg w-[820px] max-w-full mx-auto
          shadow-sm max-lg:mt-2">
        <div className="p-10">
          {/* head */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2.5">
                {co.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={co.logo} alt="" className="h-9 sm:h-10 w-auto object-contain" />
                ) : (
                  <span className="w-10 h-10 rounded bg-[#141414] text-white flex items-center justify-center font-bold text-[16px]">
                    {(co.name || 'P').charAt(0)}
                  </span>
                )}
                <div className="text-[15px] sm:text-[16px] font-bold text-[#141414] leading-tight mt-1.5">{co.name}</div>
              </div>
              <div className="text-[11px] sm:text-[11.5px] text-gray-500 leading-relaxed">
                {[co.addr, co.city].filter(Boolean).join(', ')}{co.pin ? ` — ${co.pin}` : ''}<br />
                {co.phone}{co.email ? ` · ${co.email}` : ''}
              </div>
            </div>
            <span className="inline-block border-2 border-[#141414] text-[#141414] rounded px-3 py-1
              text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] shrink-0">
              Completed
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
            <div>
              <div className="text-[17px] sm:text-[19px] font-bold tracking-[0.11em] text-[#141414] leading-tight">
                SERVICE REPORT
              </div>
              <div className="text-[13px] font-semibold text-gray-500">{doc.id}</div>
            </div>
            <div className="text-[11.5px] text-gray-500 leading-relaxed sm:text-right">
              Service date: <strong className="text-gray-900">{fmtD(doc.date)}</strong><br />
              {doc.contractId && <>Contract: <strong className="text-gray-900">{doc.contractId}</strong></>}
            </div>
          </div>

          <div className="border-t-2 border-[#141414] my-4 sm:my-6" />

          {/* customer + crew */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className={LABEL + ' mb-1'}>Customer & site</div>
              <div className="text-[13.5px] font-bold break-words">{doc.client?.name || '—'}</div>
              <div className="text-[11.5px] text-gray-500 leading-relaxed mt-1 break-words">
                {[doc.client?.addr, doc.client?.city].filter(Boolean).join(', ')}
              </div>
            </div>
            <div className="min-w-0">
              <div className={LABEL + ' mb-1'}>Serviced by</div>
              <div className="text-[13.5px] font-bold break-words">{head?.name || '—'}</div>
              <div className="text-[11.5px] text-gray-500 leading-relaxed mt-1">
                {head?.title || 'Technician'}
                {doc.crew.length > 1 && <> · with {doc.crew.length - 1} more</>}
              </div>
            </div>
          </div>

          {/* services done */}
          <div className="mt-5">
            <div className={LABEL + ' mb-1.5'}>
              Services delivered{doc.visitNo ? ` — service ${doc.visitNo} of ${doc.ofVisits}` : ''}
            </div>
            <div className="rounded border border-[#e3e6ee] divide-y divide-[#eef0f5]">
              {doc.services.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-[13px] font-semibold">{s.name}</span>
                  {s.warranty && <span className="text-[11px] text-gray-500 shrink-0">warranty {s.warranty}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* timings */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              ['Checked in', fmtT(x.checkinAt)],
              ['Work started', fmtT(x.startedAt)],
              ['Completed', fmtT(x.finishedAt)],
              ['Time on site', dur(x.durationMins)],
            ].map(([l, v]) => (
              <div key={l} className="rounded border border-[#e3e6ee] px-3 py-2.5">
                <div className={LABEL}>{l}</div>
                <div className="text-[14px] font-bold mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          {x.geo && (
            <p className="text-[11px] text-gray-500 mt-2">GPS verified at check-in — {x.geo}</p>
          )}

          {/* chemicals */}
          {x.chemicals.length > 0 && (
            <div className="mt-5">
              <div className={LABEL + ' mb-1.5'}>Chemicals used (CIB&RC approved)</div>
              <div className="rounded border border-[#e3e6ee] divide-y divide-[#eef0f5]">
                {x.chemicals.map((c, i) => (
                  <div key={i} className="flex justify-between px-3.5 py-2 text-[12.5px]">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-500">{c.qty} {c.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* work area by area */}
          {x.areaFindings.length > 0 && (
            <div className="mt-5">
              <div className={LABEL + ' mb-1.5'}>Work carried out, area by area</div>
              <div className="rounded border border-[#e3e6ee] divide-y divide-[#eef0f5]">
                {x.areaFindings.map((a, i) => (
                  <div key={i} className="px-3.5 py-2">
                    <div className="text-[12px] font-bold">{a.area}</div>
                    <div className="text-[12px] text-gray-600">{a.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* pest activity */}
          {x.findings.length > 0 && (
            <div className="mt-5">
              <div className={LABEL + ' mb-1.5'}>Pest activity observed</div>
              <div className="flex flex-wrap gap-1.5">
                {x.findings.map((f) => (
                  <span key={f} className="text-[11.5px] px-2 py-1 rounded bg-[#fff1f1] text-[#c62828] font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* photos */}
          {(x.photosBefore.length > 0 || x.photosAfter.length > 0) && (
            <div className="mt-5 grid grid-cols-2 gap-4">
              {[['Before treatment', x.photosBefore] as const, ['After treatment', x.photosAfter] as const]
                .map(([label, list]) => list.length > 0 && (
                  <div key={label}>
                    <div className={LABEL + ' mb-1.5'}>{label}</div>
                    <div className="flex flex-wrap gap-2">
                      {list.map((p, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={p} alt={label}
                          onClick={() => setZoom(p)}
                          className="w-[104px] h-[78px] object-cover rounded border border-[#e3e6ee] cursor-zoom-in" />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* notes */}
          {(x.observations || x.techNotes) && (
            <div className="mt-5">
              <div className={LABEL + ' mb-1'}>Technician&rsquo;s notes</div>
              <p className="text-[12.5px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                {[x.observations, x.techNotes].filter(Boolean).join('\n')}
              </p>
            </div>
          )}

          <div className="border-t border-[#e3e6ee] my-5 sm:my-6" />

          {/* acknowledgement */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className={LABEL + ' mb-1'}>Customer acknowledgement</div>
              {x.signatureImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.signatureImage} alt="Signature"
                  className="h-[68px] w-[210px] max-w-full object-contain border border-[#e3e6ee]
                    rounded bg-white p-1" />
              )}
              <div className="text-[12.5px] font-semibold mt-1">{x.signedBy || doc.client?.contact || '—'}</div>
              <div className="text-[10.5px] text-gray-500">Digitally signed on completion</div>
            </div>
            {x.rating > 0 && (
              <div className="text-right">
                <div className={LABEL + ' mb-1'}>Customer rating</div>
                <div className="text-[18px] tracking-wide">
                  <span className="text-[#FF0000]">{'★'.repeat(x.rating)}</span>
                  <span className="text-gray-300">{'★'.repeat(5 - x.rating)}</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10.5px] text-gray-400 leading-relaxed mt-6">
            Service report generated by {co.name}
            {x.reportSentAt ? ` on ${fmtD(x.reportSentAt.slice(0, 10))}` : ''}.{' '}
            {(co.docTerms?.service || []).join(' ')}
          </p>
        </div>
      </div>

      {/* Under the sheet, not on it: things you do WITH the report. */}
      <div className="lg:hidden no-print mt-5 flex items-center justify-center gap-5">
        <button onClick={() => window.print()} aria-label="Download PDF"
          className="w-[54px] h-[54px] rounded-full bg-white border border-[#e3e6ee] shadow-sm
            flex items-center justify-center text-[#141414] active:bg-[#f2f2f2]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v11" /><path d="m8 10.5 4 4 4-4" />
            <path d="M4 16.5v2.2A2.3 2.3 0 0 0 6.3 21h11.4a2.3 2.3 0 0 0 2.3-2.3v-2.2" />
          </svg>
        </button>
        {share && (
          <a href={share} target="_blank" rel="noreferrer" aria-label="Share"
            className="w-[54px] h-[54px] rounded-full bg-[#141414] text-white shadow-sm
              flex items-center justify-center active:brightness-90">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="18.5" r="2.6" />
              <path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4" />
            </svg>
          </a>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom('')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-w-full max-h-full rounded" />
        </div>
      )}
    </div>
  );
}
