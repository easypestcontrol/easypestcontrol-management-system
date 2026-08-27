'use client';

/* ============================================================================
   The standing instruction on a contract, offered where the billing plan is.

   An AMC is the one place in this business where the same amount is owed on a
   known date, over and over, by a customer who has already agreed to it. That
   is exactly what an auto-debit is for: the customer authorises once, and the
   quarterly phone call stops happening.

   Three states, and the wording of each matters more than the button:

     · nothing yet   — an offer, phrased as a convenience, not a demand
     · waiting       — the link exists; the customer has not signed it. The
                       contract bills exactly as before until they do, and the
                       card says so, because otherwise somebody stops chasing.
     · authorised    — collecting itself. Cancelling is a real decision, so it
                       asks first.

   Only admin and accounts see the controls. Asking a customer to authorise
   recurring debits against their bank account is not a field decision.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { money } from '@/components/mobile';

interface State { active: boolean; status: string; url: string; amount?: number }

/** Where auto-debit makes sense: a schedule of equal instalments. */
export function mandatePossible(billingMode: string): boolean {
  return billingMode !== 'upfront' && billingMode !== 'pervisit';
}

export default function Mandate({ contractId, role, variant = 'desk' }: {
  contractId: string;
  role: string;
  variant?: 'desk' | 'phone';
}) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const may = role === 'admin' || role === 'accounts';

  useEffect(() => {
    let alive = true;
    api.get<State>('/mandate/' + contractId)
      .then((r) => { if (alive) setS(r); })
      .catch(() => { if (alive) setS({ active: false, status: 'none', url: '' }); });
    return () => { alive = false; };
  }, [contractId]);

  async function offer() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ url: string; status: string }>('/mandate/' + contractId, {});
      setS({ active: false, status: r.status, url: r.url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set that up');
    } finally { setBusy(false); }
  }

  async function stop() {
    if (!window.confirm(
      'Withdraw the standing instruction? Instalments on this contract go back '
      + 'to being collected by hand.',
    )) return;
    setBusy(true); setErr('');
    try {
      await api.post('/mandate/' + contractId + '/cancel', {});
      setS({ active: false, status: 'cancelled', url: '' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not withdraw it');
    } finally { setBusy(false); }
  }

  if (!s) return null;
  const waiting = s.status === 'pending';
  const phone = variant === 'phone';

  /* Nothing on offer and nobody who could offer it — say nothing at all. */
  if (!s.active && !waiting && !may) return null;

  const label = s.active ? 'Collecting itself'
    : waiting ? 'Waiting for the customer'
    : 'Collected by hand';

  const line = s.active
    ? 'Each instalment is debited on its due date. The receipt lands here the '
      + 'same as any other payment.'
    : waiting
      ? 'The customer has been sent the authorisation. Until they sign it, keep '
        + 'collecting these instalments the usual way.'
      : 'Offer the customer an auto-debit and each instalment collects itself on '
        + 'its due date — UPI AutoPay or a card e-mandate, authorised once.';

  const btn = phone
    ? 'w-full h-11 rounded-xl text-[15px] font-bold active:brightness-90 disabled:opacity-60'
    : 'h-8 px-3 rounded text-[12.5px] font-semibold disabled:opacity-60';

  return (
    <div className={phone
      ? 'bg-white rounded-2xl p-4'
      : 'rounded-md border border-line-soft p-3.5 mt-4'}>
      <div className="flex items-center gap-2">
        <Icon name={s.active ? 'check' : 'receipt'} size={16}
          className={s.active ? 'text-green-ink' : 'text-muted'} />
        <span className={phone ? 'text-[15.5px] font-bold' : 'text-[12.5px] font-semibold'}>
          Auto-debit — {label}
        </span>
        {s.active && s.amount ? (
          <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-muted">
            {money(s.amount)} each
          </span>
        ) : null}
      </div>

      <p className={(phone ? 'text-[13px] ' : 'text-[11.5px] ') + 'text-muted mt-1.5 leading-relaxed'}>
        {line}
      </p>

      {waiting && s.url && (
        <a href={s.url} target="_blank" rel="noreferrer"
          className={(phone ? 'text-[14px] ' : 'text-[12px] ')
            + 'inline-block font-semibold text-navy mt-2'}>
          Open the authorisation page ↗
        </a>
      )}

      {may && (
        <div className={phone ? 'mt-3' : 'mt-2.5 flex gap-2'}>
          {!s.active && !waiting && (
            <button onClick={offer} disabled={busy}
              className={btn + (phone ? ' bg-navy text-white' : ' bg-navy text-white')}>
              {busy ? 'Setting up…' : 'Offer auto-debit'}
            </button>
          )}
          {(s.active || waiting) && (
            <button onClick={stop} disabled={busy}
              className={btn + ' border border-line text-accent bg-white'}>
              {busy ? 'Working…' : waiting ? 'Cancel the request' : 'Withdraw it'}
            </button>
          )}
        </div>
      )}

      {err && (
        <p className={(phone ? 'text-[13px] ' : 'text-[11.5px] ') + 'text-accent mt-2 leading-snug'}>
          {err}
        </p>
      )}
    </div>
  );
}
