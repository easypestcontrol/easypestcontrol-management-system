'use client';

/* ============================================================================
   One invoice, on a phone.

   This is the end of the money path: a customer has asked what they owe, and
   the answer has to be on screen in one tap with a way to take the payment
   underneath it.

   So the balance leads — not the total, the balance, because "what is left"
   is the question actually being asked. Then who owes it with a call button,
   then what the invoice was for, then what has already been received. The
   document itself is rendered below, as a document, because a customer
   standing next to you will want to see it rather than a summary of it.
   ========================================================================== */

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Screen, money, niceDate, type Tone } from '@/components/mobile';
import type { InvoiceDetail, Totals } from '../ui';

function stateOf(inv: InvoiceDetail): { tone: Tone; label: string } {
  if (inv.status === 'paid') return { tone: 'good', label: 'Paid in full' };
  if (inv.status === 'draft') return { tone: 'plain', label: 'Draft' };
  if (inv.status === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (inv.daysLate > 0) {
    return {
      tone: 'bad',
      label: inv.daysLate === 1 ? 'Overdue by a day' : `Overdue by ${inv.daysLate} days`,
    };
  }
  if (inv.totals.paid > 0) return { tone: 'warn', label: 'Part paid' };
  return { tone: 'info', label: inv.due ? `Due ${niceDate(inv.due)}` : 'Awaiting payment' };
}

/** A round action under the amount. Four is the most a thumb reaches easily. */
function Act({ icon, label, onClick, href }: {
  icon: 'upload' | 'phone' | 'receipt' | 'invoice';
  label: string; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      <span className="w-[46px] h-[46px] rounded-full bg-wash flex items-center justify-center">
        <Icon name={icon} size={19} />
      </span>
      <span className="text-[12.5px] text-muted font-medium">{label}</span>
    </>
  );
  const cls = 'flex flex-col items-center gap-1.5 active:opacity-60';
  return href
    ? <a href={href} className={cls}>{inner}</a>
    : <button onClick={onClick} className={cls}>{inner}</button>;
}

export default function InvoiceMobile({ inv, t, onPay, canPay, shareHref }: {
  inv: InvoiceDetail;
  t: Totals;
  onPay: () => void;
  canPay: boolean;
  shareHref: string;
}) {
  const st = stateOf(inv);
  const owed = t.balance > 0;

  /*
   * A link the customer can pay from anywhere.
   *
   * The QR needs them standing next to you. Most invoices are settled in the
   * evening by somebody who was not at the door, so this is the button that
   * actually collects money.
   */
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function makeLink() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ url: string; amount: number }>('/pay/link/' + inv.id, {});
      setLink(r.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the link');
    } finally { setBusy(false); }
  }

  const waLink = link && inv.client?.phone
    ? 'https://wa.me/91' + inv.client.phone.replace(/\D/g, '').slice(-10)
      + '?text=' + encodeURIComponent(
        'Invoice ' + inv.id + ' — ' + money(t.balance) + ' due.'
        + '\n\nPay here: ' + link)
    : '';

  return (
    <Screen>
      <BackBar title={inv.id} fallback={'/invoices'} sub={inv.client?.name || undefined} />
      {/* ------------------------------------------------------- the money */}
      <div className="bg-white px-4 pt-3 pb-5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
          {owed ? 'Amount due' : 'Invoice total'}
        </p>
        <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">
          {money(owed ? t.balance : t.total)}
        </p>
        {t.paid > 0 && owed && (
          <p className="text-[13.5px] text-muted mt-1">
            of {money(t.total)} · {money(t.paid)} received
          </p>
        )}
        <div className="mt-2.5"><Chip tone={st.tone}>{st.label}</Chip></div>

        <div className="grid grid-cols-4 gap-1.5 mt-5">
          {inv.client?.phone && (
            <Act icon="phone" label="Call" href={'tel:' + inv.client.phone} />
          )}
          <Act icon="invoice" label="Open" href={shareHref} />
          <Act icon="upload" label="Share"
            onClick={() => {
              const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
              const url = window.location.origin + shareHref;
              if (nav.share) nav.share({ title: inv.id, url }).catch(() => {});
              else navigator.clipboard?.writeText(url).catch(() => {});
            }} />
          {canPay && owed && <Act icon="receipt" label="Payment" onClick={onPay} />}
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {/* --------------------------------------------- a way to pay it */}
        {canPay && owed && (
          <Card title="Collect this">
            {link ? (
              <>
                <button onClick={() => navigator.clipboard?.writeText(link).catch(() => {})}
                  className="w-full text-left rounded-xl bg-ground px-3.5 py-3 active:brightness-95">
                  <span className="block text-[13px] break-all">{link}</span>
                  <span className="block text-[12.5px] text-accent font-semibold mt-1.5">Tap to copy</span>
                </button>
                {waLink && (
                  <a href={waLink}
                    className="mt-2.5 flex items-center justify-center h-12 rounded-xl bg-mint
                      text-mint-ink font-bold text-[15px] active:brightness-95">
                    Send on WhatsApp
                  </a>
                )}
              </>
            ) : (
              <button onClick={makeLink} disabled={busy}
                className="w-full h-12 rounded-xl bg-wash font-bold text-[15px]
                  active:brightness-95 disabled:opacity-60">
                {busy ? 'Creating…' : 'Send a payment link'}
              </button>
            )}
            {err && <p className="text-accent text-[13px] mt-2 leading-snug">{err}</p>}
            <p className="text-muted text-[12.5px] mt-2 leading-relaxed">
              They can pay by UPI or card, whenever suits them. It records itself.
            </p>
          </Card>
        )}

        {/* ------------------------------------------------- the customer */}
        {inv.client && (
          <Card>
            <Link href={'/customers/' + inv.client.id} className="flex items-center gap-3 -m-1 p-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold truncate">{inv.client.name}</span>
                <span className="block text-[13px] text-muted truncate mt-0.5">
                  {[inv.client.addr, inv.client.city].filter(Boolean).join(', ') || inv.client.id}
                </span>
              </span>
              <Icon name="chevRight" size={16} className="text-muted-2 shrink-0" />
            </Link>
          </Card>
        )}

        {/* ------------------------------------------------ what it is for */}
        <Card title="What this is for" flush>
          {inv.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 px-4 py-3 border-b border-line-soft">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-medium">{it.desc}</span>
                {(it.qty > 1 || it.date) && (
                  <span className="block text-[12.5px] text-muted mt-0.5">
                    {[it.qty > 1 ? it.qty + ' × ' + money(it.rate) : '',
                      it.date ? niceDate(it.date) : ''].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="text-[14.5px] font-semibold tabular-nums shrink-0">
                {money(it.qty * it.rate)}
              </span>
            </div>
          ))}
          <div className="px-4 py-3 flex flex-col gap-1.5">
            {t.rows.map(([label, value]) => (
              <span key={label} className="flex justify-between text-[13.5px]">
                <span className="text-muted">{label}</span>
                <span className="font-semibold tabular-nums">{money(value)}</span>
              </span>
            ))}
            <span className="flex justify-between text-[17px] font-bold mt-1 pt-2 border-t border-line">
              <span>Total</span><span className="tabular-nums">{money(t.total)}</span>
            </span>
          </div>
        </Card>

        {/* --------------------------------------------------- what is in */}
        {inv.payments.length > 0 && (
          <Card title="Payments received" flush>
            {inv.payments.map((p) => (
              <div key={p.id} className="px-4 py-3 border-b border-line-soft last:border-b-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15.5px] font-bold tabular-nums">{money(p.amount)}</span>
                  <span className="text-[13px] text-muted">{niceDate(p.date)}</span>
                </span>
                <span className="block text-[13px] text-muted mt-0.5">
                  {[p.mode, p.byName ? 'collected by ' + p.byName : '', p.ref]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </Card>
        )}

        <div className="h-2" />
      </div>

      {/* The one button this screen exists for, where the thumb already is. */}
      {canPay && owed && (
        <div className="lg:hidden fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-line
          px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)]">
          <button onClick={onPay}
            className="w-full h-[52px] rounded-xl bg-accent text-white font-bold text-[16px]
              active:brightness-90">
            Record payment
          </button>
        </div>
      )}
    </Screen>
  );
}
