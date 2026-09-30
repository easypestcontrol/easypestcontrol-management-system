'use client';

/* ============================================================================
   The public invoice — what the Share link opens. No login, phone-first:
   the customer taps the link in WhatsApp and reads their own tax invoice,
   with the paid / balance state exactly as the office sees it.
   ========================================================================== */

import { SignArea } from '@/components/sign-area';
import DocBack from '@/components/doc-back';
import { DownloadPdfCard } from '@/components/download-pdf-card';
import { usePaperFit } from '@/components/paper-fit';
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

  /* One sheet of paper, zoomed to the screen (components/paper-fit.ts). */
  const sheet = useRef<HTMLDivElement>(null);
  const fit = usePaperFit();

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
    <div className="paper-page min-h-screen bg-wash">
      <DocBack title="Invoice" sub={doc.id} fallback={'/invoices/' + doc.id} />
      <div className="max-w-[860px] mx-auto px-4 py-8 max-sm:py-4 print:p-0 print:max-w-none">

      {/* Where the bill stands, and - when something is owed - the way to pay
          it at a size a thumb can press. The same button sits inside the sheet,
          but the sheet is zoomed down on a phone and a button a fifth of an
          inch tall is not one anybody pays with. */}
      {paid ? (
        <div data-doc-banner="paid" className="no-print rounded border border-line bg-white p-4 mb-4">
          <p className="text-[14px] font-semibold text-navy">This invoice is paid</p>
          <p className="text-[13px] text-muted mt-1">
            {money(t.total)} received by {co.name} — thank you. The receipt details are on the invoice below.
          </p>
        </div>
      ) : (
        <div data-doc-banner="due" className="no-print rounded border border-line bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-navy">
              {money(t.balance)} {t.paid > 0 ? 'still to pay' : 'to pay'}
            </p>
            <p className="text-[13px] text-muted mt-1">
              Invoice {doc.id} from {co.name}, due {fmtD(doc.due)}. UPI, card, net banking or a wallet.
            </p>
            {payErr && <p className="text-[12.5px] text-accent font-medium mt-1.5">{payErr}</p>}
          </div>
          <button onClick={payNow} disabled={paying}
            className="h-10 px-5 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90
              disabled:opacity-60 shrink-0 max-sm:w-full">
            {paying ? 'Opening…' : 'Pay ' + money(t.balance) + ' now'}
          </button>
        </div>
      )}
      <DownloadPdfCard label="The full invoice, as a PDF" shareHref={share || undefined} />

      <div ref={sheet} style={fit} data-paper
        className="paper bg-white border border-line rounded-sm w-[820px] max-w-full mx-auto shadow-card">
        <div className="p-10">
          {/* head — the stamp rides beside the company so the phone reads
              like a document, not a wrapped form. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2.5">
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
                {[co.addr, co.city].filter(Boolean).join(', ')}{co.pin ? ` — ${co.pin}` : ''}<br />
                {co.phone}{co.email ? ` · ${co.email}` : ''}<br />
                GSTIN: {co.gstin || '—'}
              </div>
            </div>
            <span className={'inline-block border-2 rounded px-3 py-1 text-[12px] font-bold uppercase tracking-[0.18em] shrink-0 '
              + (paid ? 'text-[#141414] border-[#141414]' : 'text-[#FF0000] border-[#FF0000]')}>
              {paid ? 'Paid' : 'Payment due'}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
            <div>
              <div className="text-[19px] font-bold tracking-[0.13em] text-[#141414] leading-tight">TAX INVOICE</div>
              <div className="text-[13px] font-semibold text-gray-500">{doc.id}</div>
            </div>
            <div className="text-[11.5px] text-gray-500 leading-relaxed text-right">
              Invoice date: <strong className="text-gray-900">{fmtD(doc.date)}</strong><br />
              Due date: <strong className="text-gray-900">{fmtD(doc.due)}</strong>
            </div>
          </div>

          <div className="border-t-2 border-[#141414] my-6" />

          {/* parties — two columns even on a phone */}
          <div className="grid grid-cols-2 gap-6">
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Bill to</div>
              <div className="text-[14.5px] font-bold break-words">{doc.client?.name || '—'}</div>
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
            <div className="w-[300px] text-[12.5px]">
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

      </div>
    </div>
  );
}
