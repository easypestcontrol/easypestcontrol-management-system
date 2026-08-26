'use client';

/* ============================================================================
   Quotation detail — the document with its actions. Ported from v1
   V.quotationsDetail (quotations.js:1364-1467) and the WhatsApp share modal
   (quotations.js:1090-1290). Print IS the PDF story in v2: the Print button
   opens the browser dialog and the document's print CSS isolates the sheet.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, type Bootstrap, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { docTotals, money } from 'shared';
import QuoteDoc from '../quote-doc';
import ShareLink from '@/components/share-link';
import {
  QUOTE_STATUS, fmtDate, phonePretty, validOf, waNumber,
  type DocCompany, type QuoteFull,
} from '../lib';
import QuoteMobile from './mobile';

const BTN_GHOST = 'flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash';
const BTN_RED = 'flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90';

/* ------------------------------------------------------- WhatsApp share */

function messageFor(q: QuoteFull, co: DocCompany, total: number): string {
  const party = q.party;
  const lines = q.items
    .map((i) => '• ' + (i.name || 'Custom service') + ' — ' + i.qty + ' × ' + money(i.rate))
    .join('\n');
  const approve = window.location.origin + '/approve/' + q.id;
  // v1 quote_sent template (data.js:1066-1078) — the {customer} placeholder
  // quirk is fixed here: the greeting carries the actual name.
  return 'Hello ' + (party?.contact || party?.name || 'there') + ',\n\n' +
    'Thank you for your enquiry. Your quotation ' + q.id + ' is ready.\n\n' +
    'What we have quoted:\n' + lines + '\n\n' +
    'Total: ' + money(total) + ' incl. GST\n' +
    'Valid till: ' + fmtDate(validOf(q)) + '\n\n' +
    'Open the full quotation at the link below. You can read it on your phone and save it as a PDF.\n\n' +
    'Accept or decline it there in one tap:\n' + approve + '\n\n' +
    'If the link does not open on your phone, simply reply to this message with ACCEPT or DECLINE and we will take it forward.\n\n' +
    '— ' + co.name + '\n' + co.phone;
}

function ShareModal({ q, co, total, onClose, onSent }: {
  q: QuoteFull; co: DocCompany; total: number;
  onClose: () => void; onSent: () => void;
}) {
  const [num, setNum] = useState(q.party?.phone || '');
  const [msg, setMsg] = useState(() => messageFor(q, co, total));
  const [copied, setCopied] = useState(false);
  const approve = window.location.origin + '/approve/' + q.id;
  const dial = waNumber(num);

  async function openChat() {
    if (!dial) return;
    // draft→sent; resending never regresses — quotations.js:1203-1209
    try { await api.post('/quotations/' + q.id + '/status', { action: 'sent', to: dial }); } catch { /* keep going — the chat still opens */ }
    window.open('https://wa.me/' + dial + '?text=' + encodeURIComponent(msg), '_blank');
    onSent();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-start justify-center p-6 overflow-y-auto no-print"
      onClick={onClose}>
      <div className="bg-white rounded-md shadow-pop w-full max-w-[560px] my-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[15px] font-semibold">Send quotation on WhatsApp</div>
          <div className="text-[12.5px] text-muted mt-0.5">
            {q.id} · {q.party?.name || '—'} · {money(total)} incl. GST
          </div>
        </div>
        <div className="px-5 py-4">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Send to</span>
            <input value={num} onChange={(e) => setNum(e.target.value)}
              placeholder="10-digit number, or +country code"
              className="w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
          </label>
          <p className="text-[11.5px] mt-1 mb-4">
            {!num.trim() ? (
              <span className="text-muted-2">The lead or customer number this goes to.</span>
            ) : dial ? (
              <span className="text-muted">Opens the chat with <strong>{phonePretty(dial)}</strong> — no contact picker.</span>
            ) : (
              <span className="text-accent">Add the country code, or type a 10-digit Indian number.</span>
            )}
          </p>

          <div className="rounded border border-line bg-wash p-3 text-[12px] text-muted leading-relaxed mb-4">
            <span className="font-semibold text-ink-2">A WhatsApp link cannot carry a file.</span>{' '}
            The message holds two links instead: the customer reads the full document at the first and
            taps Accept or Decline right there. Want a file too? Use <span className="font-semibold text-ink-2">Print / PDF</span>{' '}
            on this page, save it, and add it in the chat with the paperclip.
          </div>

          <label className="block mb-4">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Message</span>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)}
              className="w-full min-h-[210px] p-3 rounded border border-line text-[12.5px] leading-relaxed outline-none focus:border-navy" />
            <span className="block text-[11.5px] text-muted-2 mt-1">Edit anything you like before it goes.</span>
          </label>

          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Accept / decline link</span>
            <span className="flex gap-2">
              <input readOnly value={approve}
                className="flex-1 h-8 px-3 rounded border border-line bg-wash text-[12px] font-mono outline-none" />
              <button onClick={() => {
                navigator.clipboard?.writeText(approve);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }} className={BTN_GHOST}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </span>
            <span className="block text-[11.5px] text-muted-2 mt-1">
              Opens a page where the customer taps Accept or Decline — the quotation updates here straight away.
            </span>
          </label>
        </div>
        <div className="px-5 py-3.5 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={openChat} disabled={!dial}
            className={BTN_RED + ' disabled:opacity-50'}>
            Open chat{dial ? ' with ' + phonePretty(dial) : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the page */

export default function QuotationDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [q, setQ] = useState<QuoteFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [share, setShare] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<QuoteFull>('/quotations/' + id).then(setQ).catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    load();
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, [id, load]);

  // The customer decides on THEIR phone, via the public link. While that
  // decision is still open, this page quietly re-checks every 5 seconds so
  // the acceptance appears here the moment they tap — no reload needed.
  // Polling stops once the quotation is approved or rejected, and pauses
  // while the tab is hidden.
  useEffect(() => {
    if (!q || q.status === 'approved' || q.status === 'rejected') return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load();
    }, 5000);
    return () => clearInterval(t);
  }, [q, load]);

  const co: DocCompany | null = useMemo(() => (boot ? {
    name: boot.company.name, tagline: boot.company.tagline, phone: boot.company.phone,
    email: boot.company.email, gstin: boot.company.gstin, addr: boot.company.addr,
    city: boot.company.city, state: boot.company.state, pin: boot.company.pin,
    gstRate: boot.company.gstRate, logo: boot.company.logo, terms: boot.company.terms || [],
    sign: boot.company.sign, seal: boot.company.seal,
  } : null), [boot]);

  function say(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  async function approveInternal() {
    try {
      const updated = await api.post<QuoteFull>('/quotations/' + q!.id + '/status', { action: 'approve-internal' });
      setQ(updated);
      say('Approved on our side — now the customer’s turn');
    } catch (e) { say(e instanceof Error ? e.message : 'Could not approve'); }
  }

  async function act(action: 'approved' | 'rejected') {
    if (!q || busy) return;
    setBusy(true);
    try {
      const updated = await api.post<QuoteFull>('/quotations/' + q.id + '/status', { action });
      setQ(updated);
      say(action === 'approved'
        ? 'Marked as approved — ' + (q.mode === 'amc'
            ? 'you can now generate the AMC contract'
            : 'you can now book the service')
        : 'Marked as rejected');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not update');
    }
    setBusy(false);
  }

  /** v1 'Move to contract' — quotations.js:1424-1449. */
  async function convert() {
    if (!q || busy) return;
    if (q.status === 'draft' || q.status === 'sent') {
      const ok = window.confirm(
        'Move ' + q.id + ' to a contract?\n\n' +
        (q.status === 'draft'
          ? 'This quotation has not been sent. Moving it to a contract marks it approved and treats it as agreed — right for a quote you typed up for a customer who already said yes.'
          : 'This marks the quotation approved and carries it into the contract.'),
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api.post('/quotations/' + q.id + '/status', { action: 'approved' });
      } catch (e) {
        say(e instanceof Error ? e.message : 'Could not update');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    router.push('/contracts/new?quote=' + encodeURIComponent(q.id));
  }

  async function duplicate() {
    if (!q || busy) return;
    setBusy(true);
    try {
      const copy = await api.post<QuoteFull>('/quotations/' + q.id + '/duplicate', {});
      router.push('/quotations/' + copy.id);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not duplicate');
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Quotation not found</p>
        <p className="text-muted text-[13px] mt-1">It may have been deleted.</p>
        <Link href="/quotations" className="inline-block mt-4 text-[13px] text-navy font-medium hover:underline">
          All quotations
        </Link>
      </div>
    );
  }
  if (!q || !co) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  const t = docTotals(q.items, q.discount, q.placeOfSupply, co.state || 'Tamil Nadu', co.gstRate || 18);
  const st = QUOTE_STATUS[q.status];
  // Once a contract exists the quotation is the record of what was agreed.
  const canEdit = me?.role !== 'client' && !q.contractId;

  return (
    <>
      {/* Opened to send it, chase it, or read the price out loud. Composing
          one is desk work and stays there. */}
      <QuoteMobile q={q} total={t.total}
        rows={[['Subtotal', t.sub] as [string, number]]
          .concat(t.disc ? [['Discount', -t.disc] as [string, number]] : [])
          .concat(t.tax.rows)}
        {...(typeof window === 'undefined'
          ? { approveUrl: '', waText: '' }
          : { approveUrl: window.location.origin + '/approve/' + q.id,
              waText: messageFor(q, co, t.total) })} />

    <div className="max-lg:hidden p-6 bg-wash min-h-full">
      <div className="no-print max-w-[820px] mx-auto">
        <Link href="/quotations"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-navy font-medium">
          ← All quotations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[19px] font-semibold font-mono">{q.id}</h1>
              <span className={st.cls}>{st.label}</span>
            </div>
            <p className="text-muted text-[13px] mt-1 truncate">
              {q.title} · {money(t.total)} incl. GST
            </p>
            {toast && <p className="text-[12.5px] text-navy font-medium mt-1">{toast}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link href={'/quotations/' + q.id + '/edit'} className={BTN_GHOST}>Edit</Link>
            )}
            <ShareLink path={'/approve/' + q.id} title={'Quotation ' + q.id}
              phone={q.party?.phone}
              text={`Quotation ${q.id} — open it here to review and accept:`} />
            <button onClick={() => window.print()} className={BTN_GHOST}>Print / PDF</button>
            <button onClick={duplicate} className={BTN_GHOST}>Duplicate</button>
            {q.status === 'sent' && (
              <>
                <button onClick={() => act('rejected')} className={BTN_GHOST}>
                  <Icon name="x" size={13} /> Mark rejected
                </button>
                <button onClick={() => act('approved')} className={BTN_RED}>
                  <Icon name="check" size={13} /> Customer accepted
                </button>
              </>
            )}
            {!q.contractId && (
              <button onClick={convert} className={BTN_RED}>
                <Icon name="contract" size={13} /> Move to contract
              </button>
            )}
            {q.contractId && (
              <Link href={'/contracts/' + q.contractId} className={BTN_GHOST}>
                <Icon name="contract" size={13} /> {q.contractId}
              </Link>
            )}
            <button onClick={() => setShare(true)} className={BTN_RED}>
              {q.status === 'draft' ? 'Send to customer' : 'Send again'}
            </button>
          </div>
        </div>

        {!q.contractId && q.status !== 'rejected' && (
          <div className="rounded border border-line bg-white p-4 mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2.5">
              Acceptance — two-handed, like the signatures
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className={'rounded border p-3 ' + (q.approvedBy ? 'border-navy/40' : 'border-line')}>
                <div className="flex items-center gap-2">
                  <span className={'w-5 h-5 rounded-full flex items-center justify-center ' +
                    (q.approvedBy ? 'bg-navy text-white' : 'bg-wash text-muted-2')}>
                    <Icon name="check" size={12} />
                  </span>
                  <span className="text-[13px] font-semibold">Accepted by us</span>
                </div>
                {q.approvedBy ? (
                  <p className="text-[12px] text-muted mt-1.5">Signed off {q.approvedAt}</p>
                ) : (
                  <button onClick={approveInternal}
                    className="mt-2 h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
                    Approve this quotation
                  </button>
                )}
              </div>
              <div className={'rounded border p-3 ' + (q.status === 'approved' ? 'border-navy/40' : 'border-line')}>
                <div className="flex items-center gap-2">
                  <span className={'w-5 h-5 rounded-full flex items-center justify-center ' +
                    (q.status === 'approved' ? 'bg-navy text-white' : 'bg-wash text-muted-2')}>
                    <Icon name="check" size={12} />
                  </span>
                  <span className="text-[13px] font-semibold">Accepted by the customer</span>
                </div>
                <p className="text-[12px] text-muted mt-1.5">
                  {q.status === 'approved'
                    ? 'They agreed — via the link or marked here.'
                    : 'Send it on WhatsApp; the link lets them accept, or mark it here after the call.'}
                </p>
              </div>
            </div>
            {q.approvedBy && q.status === 'approved' && (
              <p className="text-[12.5px] text-navy font-medium mt-2.5">
                Both sides have accepted — <b>Move to contract</b> is unlocked
                ({q.mode === 'amc' ? 'AMC: every service generates automatically' : 'one-time service'}).
              </p>
            )}
          </div>
        )}
      </div>

      <QuoteDoc q={q} company={co} />

      {share && (
        <ShareModal q={q} co={co} total={t.total}
          onClose={() => setShare(false)}
          onSent={() => { load(); say('Chat opened — the quotation is marked sent'); }} />
      )}
    </div>
    </>
  );
}
