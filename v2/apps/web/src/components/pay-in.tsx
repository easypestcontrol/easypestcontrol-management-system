'use client';

/* ============================================================================
   Paying collected cash in, without the trip to the office.

   Note the direction, because it decides everything: the technician OWES this
   money to the company, so they pay it in exactly as a customer would. It is
   the Payment Gateway, not a payout, and nothing leaves the company account.

   Two ways in, one behaviour:

     · the technician, on their own wallet, pressing it themselves
     · the office, who are usually the ones who notice cash sitting out,
       raising the link and sending it — because a button only the technician
       can find is a button that waits for the technician to think of it

   Handing the notes over at the office still settles the old way. That is
   what actually happened, and the ledger should say so.
   ========================================================================== */

import { useState } from 'react';
import { api } from '@/lib/api';
import { money, waLink } from 'shared';

export default function PayIn({ amount, forUser, name, phone, compact }: {
  amount: number;
  /** Omit to raise it for yourself; pass a user id to ask somebody else. */
  forUser?: string;
  name?: string;
  phone?: string;
  compact?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const mine = !forUser;

  async function raise() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ url: string }>(
        '/wallet/settle-online' + (forUser ? '/' + forUser : ''), {},
      );
      if (!r.url) throw new Error('No payment page came back');
      setUrl(r.url);
      // Paying your own: go straight there. Asking somebody else: keep the
      // link on screen so it can be sent.
      if (mine) window.location.href = r.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the payment page');
    } finally { setBusy(false); }
  }

  const btn = compact
    ? 'h-8 px-3 rounded border border-line text-[12px] font-semibold hover:bg-wash disabled:opacity-60'
    : 'h-11 px-5 rounded-xl bg-accent text-white text-[15px] font-bold active:brightness-90 disabled:opacity-60';

  if (!url) {
    return (
      <div className={compact ? '' : 'text-center'}>
        <button onClick={raise} disabled={busy} className={btn + (compact ? '' : ' w-full')}>
          {busy ? 'Opening…'
            : mine ? 'Transfer ' + money(amount) + ' to the office'
            : 'Send a pay-in link'}
        </button>
        {err && <p className="text-accent text-[12.5px] mt-2 leading-snug">{err}</p>}
        {!compact && (
          <p className="text-muted text-[12.5px] mt-2 leading-relaxed">
            Pay it in by UPI and your wallet clears. Handing the notes over at the
            office works exactly as before.
          </p>
        )}
      </div>
    );
  }

  const msg = (name ? name + ', ' : '')
    + 'please pay in the ' + money(amount) + ' cash you are holding — it clears your wallet:'
    + String.fromCharCode(10) + url;

  return (
    <div className={compact ? 'mt-2' : 'mt-2 text-left'}>
      <div className="flex items-center gap-2 flex-wrap">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-[170px] h-8 px-2.5 rounded border border-line bg-wash
            text-[12px] outline-none" />
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }).catch(() => {});
          }}
          className="h-8 px-3 rounded border border-line text-[12px] font-medium hover:bg-wash">
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a href={waLink(phone, msg)} target="_blank" rel="noreferrer"
          className="h-8 px-3 rounded bg-navy text-white text-[12px] font-semibold
            flex items-center hover:brightness-110">
          WhatsApp
        </a>
      </div>
      <p className="text-[11.5px] text-muted mt-1.5 leading-relaxed">
        Their wallet clears by itself the moment it is paid — nobody has to mark
        anything.
      </p>
    </div>
  );
}
