'use client';

/* ============================================================================
   The customer approval page — where the WhatsApp link lands.

   Deliberately plain: one document, two buttons, no navigation — the customer
   is not a user of the system. Lives outside the (app) group so it carries no
   shell, and talks only to the @Public endpoints. Ported from v1 V.approve
   (quotations.js:1476-1622).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { docTotals, money } from 'shared';
import QuoteDoc from '@/app/(app)/quotations/quote-doc';
import { dayDelta, fmtDate, type PublicQuote } from '@/app/(app)/quotations/lib';

const BTN_GHOST = 'inline-flex items-center gap-1.5 h-9 px-4 rounded border border-line bg-white text-[13px] font-medium hover:bg-wash';
const BTN_RED = 'inline-flex items-center gap-1.5 h-10 px-5 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90';

export default function ApprovePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [q, setQ] = useState<PublicQuote | null>(null);
  const [missing, setMissing] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState('');
  /*
   * The advance, if this quotation asks for one.
   *
   * Fetched rather than assumed: a customer who has already paid must never
   * be shown the button again, and the only place that knows is the server.
   */
  const [adv, setAdv] = useState<{ asked: number; paid: number; url: string } | null>(null);
  const [advBusy, setAdvBusy] = useState(false);

  const load = useCallback(() => {
    api.get<PublicQuote>('/public/quotes/' + id).then(setQ).catch(() => setMissing(true));
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  useEffect(() => {
    if (!id) return;
    api.get<{ asked: number; paid: number; url: string }>('/advance/' + id)
      .then((r) => setAdv(r.asked > 0 ? r : null))
      .catch(() => setAdv(null));
  }, [id, thanks]);

  async function payAdvance() {
    if (advBusy) return;
    setAdvBusy(true);
    try {
      const r = await api.post<{ url: string }>('/advance/' + id + '/link', {});
      // Straight to Razorpay's page. Nothing about the money is handled here.
      if (r.url) window.location.href = r.url;
    } catch {
      setThanks('Could not open the payment page — please reply on WhatsApp.');
    }
    setAdvBusy(false);
  }

  async function decide(decision: 'approved' | 'rejected', why = '') {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api.post<PublicQuote>(
        '/public/quotes/' + id + '/decision',
        { decision, note: why },
      );
      setQ(updated);
      setThanks(decision === 'approved'
        ? 'Thank you — quotation accepted. We will contact you to schedule.'
        : 'Quotation declined — thank you for letting us know.');
      setDeclineOpen(false);
    } catch {
      setThanks('That did not go through — please try again, or reply on WhatsApp.');
    }
    setBusy(false);
  }

  function accept() {
    const ok = window.confirm(
      'Accept this quotation?\n\nWe will treat this as your confirmation and get in touch to schedule the first service.',
    );
    if (ok) decide('approved');
  }

  if (missing) {
    return (
      <div className="min-h-screen bg-wash flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[15px] font-medium">Quotation not found</p>
          <p className="text-muted text-[13px] mt-1">
            This link may have expired, or the quotation was withdrawn.
          </p>
        </div>
      </div>
    );
  }
  if (!q || !q.company) {
    return (
      <div className="min-h-screen bg-wash flex items-center justify-center">
        <p className="text-muted text-[13px]">Loading your quotation…</p>
      </div>
    );
  }

  const co = q.company;
  const t = docTotals(q.items, q.discount, q.placeOfSupply, co.state || 'Tamil Nadu', co.gstRate || 18);
  const expired = dayDelta(q.valid) < 0;
  const decided = q.status === 'approved' || q.status === 'rejected';

  return (
    <div className="min-h-screen bg-wash">
      <div className="max-w-[860px] mx-auto px-4 py-8">

        {/* ------------------------------------------------------ banners */}
        {decided ? (
          <div className={'no-print rounded border p-4 mb-4 bg-white ' +
            (q.status === 'approved' ? 'border-line' : 'border-red-line')}>
            <p className="text-[14px] font-semibold text-navy">
              {q.status === 'approved' ? 'You accepted this quotation' : 'You declined this quotation'}
            </p>
            <p className="text-[13px] text-muted mt-1">
              {q.status === 'approved'
                ? co.name + ' has been notified and will contact you to schedule the first service.'
                : 'Thank you for letting us know. ' + co.name + ' may be in touch to understand what would work better.'}
            </p>
            {thanks && <p className="text-[12.5px] text-navy font-medium mt-1.5">{thanks}</p>}

            {/* Asked for at the moment of agreement, which is when it is
                easiest to pay and hardest to forget. */}
            {q.status === 'approved' && adv && adv.paid <= 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="text-[13.5px] font-semibold">
                  Advance of {money(adv.asked)} to confirm the booking
                </p>
                <button onClick={payAdvance} disabled={advBusy}
                  className="mt-2 h-11 px-5 rounded bg-accent text-white text-[14px] font-bold
                    hover:brightness-90 disabled:opacity-60">
                  {advBusy ? 'Opening…' : 'Pay ' + money(adv.asked) + ' now'}
                </button>
                <p className="text-[12px] text-muted mt-1.5">
                  UPI or card. It comes off your first invoice automatically.
                </p>
              </div>
            )}
            {adv && adv.paid > 0 && (
              <p className="mt-3 pt-3 border-t border-line text-[13.5px] font-semibold text-navy">
                Advance of {money(adv.paid)} received — thank you.
              </p>
            )}
          </div>
        ) : expired ? (
          <div className="no-print rounded border border-red-line bg-red-wash p-4 mb-4">
            <p className="text-[14px] font-semibold text-accent">
              This quotation expired on {fmtDate(q.valid)}
            </p>
            <p className="text-[13px] text-ink-2 mt-1">
              Reply on WhatsApp and we will send you a fresh one at current rates.
            </p>
          </div>
        ) : (
          <div className="no-print rounded border border-line bg-white p-5 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-navy">
                  Hello {q.party?.contact || q.party?.name || 'there'}
                </p>
                <p className="text-[13px] text-muted mt-1">
                  Your quotation from {co.name} is below. Valid till {fmtDate(q.valid)}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button onClick={() => setDeclineOpen(true)} className={BTN_GHOST} disabled={busy}>
                  Decline
                </button>
                <button onClick={accept} className={BTN_RED} disabled={busy}>
                  Accept quotation
                </button>
              </div>
            </div>
            {thanks && <p className="text-[12.5px] text-accent font-medium mt-2">{thanks}</p>}
          </div>
        )}

        {/* -------------------------------------------------- save as PDF */}
        <div className="no-print rounded border border-line bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">The full quotation, as a PDF</p>
            <p className="text-[12px] text-muted mt-0.5">
              Download opens your device’s print dialog — choose “Save as PDF” to keep a copy.
            </p>
          </div>
          <button onClick={() => window.print()} className={BTN_GHOST}>Download PDF</button>
        </div>

        {/* ----------------------------------------------------- document */}
        <FitDoc>
          <QuoteDoc q={q} company={co} />
        </FitDoc>

        {/* -------------------------------------------------- bottom card */}
        {!decided && !expired && (
          <div className="no-print rounded border border-line bg-white p-6 mt-4 text-center">
            <p className="text-[13px] text-muted mb-3.5">Happy with this quotation?</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <button onClick={() => setDeclineOpen(true)} className={BTN_GHOST} disabled={busy}>
                Decline
              </button>
              <button onClick={accept} className={BTN_RED} disabled={busy}>
                Accept {money(t.total)}
              </button>
            </div>
            {co.phone && (
              <p className="text-[12px] text-muted mt-3.5">
                Or reply ACCEPT or DECLINE on WhatsApp to {co.phone}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------- decline modal */}
      {declineOpen && (
        <div className="no-print fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6"
          onClick={() => setDeclineOpen(false)}>
          <div className="bg-white rounded-md shadow-pop w-full max-w-[440px]"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line">
              <p className="text-[15px] font-semibold">Decline this quotation</p>
              <p className="text-[12.5px] text-muted mt-0.5">
                A line about why helps us do better next time
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Reason</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Price is above our budget this year"
                  className="w-full min-h-[88px] p-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
              </label>
            </div>
            <div className="px-5 py-3.5 border-t border-line flex justify-end gap-2">
              <button onClick={() => setDeclineOpen(false)} className={BTN_GHOST}>Cancel</button>
              <button onClick={() => decide('rejected', note.trim())} disabled={busy}
                className="inline-flex items-center h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ============================================================== fit-to-width */

/**
 * The quotation is designed as an A4 sheet (~800px). On a phone the whole
 * sheet is scaled down to the screen width — like a zoomed-out PDF page —
 * so nothing ever overflows sideways. Printing resets the scale, so the
 * saved PDF stays full size.
 */
function FitDoc({ children }: { children: React.ReactNode }) {
  const NATURAL = 800;
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const fit = () => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      const s = Math.min(1, box.clientWidth / NATURAL);
      setScale(s);
      setHeight(inner.scrollHeight * s);
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro && innerRef.current) ro.observe(innerRef.current);
    return () => { window.removeEventListener('resize', fit); ro?.disconnect(); };
  }, []);

  return (
    <div ref={boxRef} style={{ height }} className="overflow-hidden">
      <style>{`
        @media print {
          .fitdoc { transform: none !important; width: auto !important; }
        }
      `}</style>
      <div ref={innerRef} className="fitdoc"
        style={{ width: NATURAL, transform: 'scale(' + scale + ')', transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}
