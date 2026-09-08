'use client';

/* ============================================================================
   The public invoice — what the Share link opens. No login, phone-first:
   the customer taps the link in WhatsApp and reads their own tax invoice,
   with the paid / balance state exactly as the office sees it.
   ========================================================================== */

import { SignArea } from '@/components/sign-area';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { money, waLink } from 'shared';

interface Doc {
  id: string; date: string; due: string; period: string; status: string; place: string;
  items: Array<{ desc: string; qty: number; rate: number; date: string; jobId: string }>;
  totals: { sub: number; disc: number; rows: Array<[string, number]>; total: number; paid: number; balance: number };
  payments: Array<{ id: string; amount: number; mode: string; date: string }>;
  client: { name: string; contact: string; phone: string; addr: string; city: string; pin: string; gstin: string } | null;
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

export default function PublicInvoice() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  /* Paying from the document itself. Most of these are read on a phone in the
     evening by whoever signs the cheques; making them find somebody to ask
     for a link is how a settled invoice becomes a fortnight of chasing. */
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');

  /* Zoom, not media queries: the sheet is 820px wide and the phone is not,
     so it is scaled by whatever the viewport can give it. `zoom` reflows the
     surrounding height correctly, which `transform: scale` does not. */
  const sheet = useRef<HTMLDivElement>(null);
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
    fetch('/api/public/docs/invoice/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDoc)
      .catch(() => setMissing(true));
  }, [id]);

  async function payNow() {
    if (paying) return;
    setPaying(true); setPayErr('');
    try {
      const r = await fetch('/api/public/docs/invoice/' + id + '/pay', { method: 'POST' });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.message || 'Could not open the payment page');
      // Straight to Razorpay. Nothing about the money is handled on this page.
      window.location.href = data.url;
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : 'Could not open the payment page');
      setPaying(false);
    }
  }

  if (missing) {
    return <p className="p-10 text-center text-[14px] text-muted">This invoice is not available.</p>;
  }
  if (!doc) return <p className="p-10 text-center text-[14px] text-muted">Opening the invoice…</p>;

  const t = doc.totals;

  /* WhatsApp, to this customer, with a link to this page. */

  const share = typeof window === 'undefined' ? '' : waLink(
    doc.client?.phone,
    'Invoice ' + doc.id + ' from ' + doc.company.name + ' — ' + money(doc.totals.total)
    + '\n' + window.location.href,
  );
  const co = doc.company;
  const paid = t.balance <= 0;

  return (
    /* One document, not two.
       The page used to reflow into a stack of cards on a phone, which is a
       web page, not an invoice. A tax invoice is a piece of paper with a
       fixed shape, so the sheet keeps that shape at every size and is zoomed
       down to whatever the screen can take. Smaller is fine; rearranged is
       not — the customer and the office should be looking at the same
       document. */
    <div className="paper-page min-h-screen bg-[#f4f5f8] pb-10 px-3 sm:py-8">
      {/* The phone gets a bar of its own: back to wherever you came from,
          and the invoice named. The sheet below it is a document, and a
          document should not have to carry navigation. */}
      <div className="lg:hidden no-print sticky top-0 z-10 -mx-3 px-2 h-[60px] bg-[#f4f5f8]
        flex items-center gap-1">
        <button onClick={() => history.back()} aria-label="Back" className="p-2 text-[#141414]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold leading-tight">Invoice</span>
          <span className="block text-[12.5px] text-gray-500 leading-tight">{doc.id}</span>
        </span>
      </div>

      <div ref={sheet} style={fit}
        className="paper bg-white border border-[#e3e6ee] rounded-lg w-[820px] max-w-full mx-auto shadow-sm
          max-lg:mt-2">
        <div className="p-10">
          {/* head — the stamp rides beside the company so the phone reads
              like a document, not a wrapped form. */}
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
                {co.phone}{co.email ? ` · ${co.email}` : ''}<br />
                GSTIN: {co.gstin || '—'}
              </div>
            </div>
            <span className={'inline-block border-2 rounded px-3 py-1 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] shrink-0 '
              + (paid ? 'text-[#141414] border-[#141414]' : 'text-[#FF0000] border-[#FF0000]')}>
              {paid ? 'Paid' : 'Payment due'}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
            <div>
              <div className="text-[17px] sm:text-[19px] font-bold tracking-[0.13em] text-[#141414] leading-tight">TAX INVOICE</div>
              <div className="text-[13px] font-semibold text-gray-500">{doc.id}</div>
            </div>
            <div className="text-[11.5px] text-gray-500 leading-relaxed sm:text-right">
              Invoice date: <strong className="text-gray-900">{fmtD(doc.date)}</strong><br />
              Due date: <strong className="text-gray-900">{fmtD(doc.due)}</strong>
            </div>
          </div>

          <div className="border-t-2 border-[#141414] my-4 sm:my-6" />

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
          <div className="hidden">
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
          <div className="mt-6">
            <table className="w-full text-[12.5px] border-collapse min-w-[440px]">
              <thead>
                <tr>
                  {['#', 'Description of service', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h}
                      className={'bg-[#141414] text-white text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2 '
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
              <div className="flex justify-between py-1.5 mt-1 border-t-2 border-[#141414] font-bold text-[13.5px]">
                <span>Invoice total</span><span>{money(t.total)}</span>
              </div>
              {t.paid > 0 && (
                <>
                  <div className="flex justify-between py-1 text-gray-500">
                    <span>Amount paid</span><span>− {money(t.paid)}</span>
                  </div>
                  <div className={'flex justify-between py-1.5 border-t border-[#e3e6ee] font-bold '
                    + (t.balance > 0 ? 'text-[#FF0000]' : 'text-[#141414]')}>
                    <span>Balance due</span><span>{money(t.balance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>


          {/* The bill and the way to pay it belong on the same page. Hidden
              when printed — a piece of paper cannot be tapped. */}
          {!paid && (
            <div className="no-print mt-6 rounded-lg border border-[#e3e6ee] bg-[#f8f9fb] p-4 sm:p-5 text-center">
              <p className="text-[13px] text-gray-600">
                {t.paid > 0 ? 'Balance outstanding' : 'Amount payable'}
              </p>
              <p className="text-[26px] font-bold text-[#141414] leading-tight mt-0.5">
                {money(t.balance)}
              </p>
              <button onClick={payNow} disabled={paying}
                className="mt-3 w-full sm:w-auto sm:min-w-[280px] h-12 px-8 rounded-md
                  bg-[#141414] text-white text-[15px] font-bold
                  hover:brightness-125 active:brightness-90 disabled:opacity-60">
                {paying ? 'Opening…' : 'Pay ' + money(t.balance) + ' now'}
              </button>
              <p className="text-[11.5px] text-gray-500 mt-2.5 leading-relaxed">
                UPI, card, net banking or a wallet. Your receipt is issued the moment
                it goes through.
              </p>
              {payErr && (
                <p className="text-[12px] text-[#FF0000] mt-2 leading-relaxed">{payErr}</p>
              )}
            </div>
          )}

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

          <div className="flex justify-end mt-8">
            <div className="text-center min-w-[180px]">
              <SignArea sign={co.sign} seal={co.seal} />
              <div className="border-t border-[#e3e6ee] pt-2 text-[11.5px] font-semibold">For {co.name}</div>
              <div className="text-[10.5px] text-gray-400">Authorised signatory</div>
            </div>
          </div>

          <p className="text-[10.5px] text-gray-400 leading-relaxed mt-6">
            {(co.docTerms?.invoice || []).join(' ')} This is a computer-generated
            invoice from {co.name}.
          </p>

          {/* Download and Share, at the END of the document and on the phone
              only. The web app prints from the browser and shares by URL, so
              a pair of buttons in the middle of a tax invoice was noise on a
              screen that did not need them. */}
        </div>
      </div>

      {/* Under the sheet, not on it. They are things you do WITH the invoice,
          so they belong on the page beside it rather than printed into the
          middle of a tax document. */}
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
            {/* The share glyph: two nodes joined to a third. */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="18.5" r="2.6" />
              <path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
