'use client';

/* ============================================================================
   Asking the customer for money against a contract.

   This is where an advance is taken now — not on the quotation. A quotation is
   an offer that may be declined; the contract is the agreement, and asking
   somebody to pay against something they have signed is asking at the right
   moment.

   There is no percentage and no rule. Whoever is collecting types the figure
   they agreed, on the spot, and shares the link. Anything the system decided
   for them would be wrong for half the jobs.

   What the money does afterwards is the part worth stating plainly on screen,
   because it is the question that gets asked: it sits on the customer as
   credit, and it comes off this contract's instalments as they are raised —
   as a real receipt, not a discount, and never on a different contract.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { money } from '@/components/mobile';

interface State {
  received: number;
  unused: number;
  link: { url: string; amount: number } | null;
}

export default function Collect({ contractId, clientName, phone, role, variant = 'desk' }: {
  contractId: string;
  clientName: string;
  phone?: string;
  role: string;
  variant?: 'desk' | 'phone';
}) {
  const [s, setS] = useState<State | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  // Sales close the deal and take the advance; ops and accounts chase the
  // rest. A technician does not ask a customer for money on a contract.
  const may = ['admin', 'ops', 'sales', 'accounts'].includes(role);
  const phone_ = variant === 'phone';

  const load = () => api.get<State>('/collect/' + contractId)
    .then(setS)
    .catch(() => setS({ received: 0, unused: 0, link: null }));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contractId]);

  async function raise() {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { setErr('Enter the amount you agreed'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ url: string; amount: number }>(
        '/collect/' + contractId + '/link', { amount: amt },
      );
      setS((prev) => ({ ...(prev || { received: 0, unused: 0 }), link: r }));
      setAmount('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not raise the link');
    } finally { setBusy(false); }
  }

  async function withdraw() {
    setBusy(true); setErr('');
    try {
      await api.post('/collect/' + contractId + '/cancel', {});
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not withdraw it');
    } finally { setBusy(false); }
  }

  if (!s) return null;
  /* Nothing collected, nothing out, and nobody here who could ask. */
  if (!may && s.received <= 0 && !s.link) return null;

  const wrap = phone_
    ? 'bg-white rounded-2xl p-4'
    : 'rounded-md border border-line-soft p-3.5 mt-4';
  const input = phone_
    ? 'w-full h-11 px-3 rounded-xl border border-line text-[15.5px] outline-none focus:border-navy'
    : 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';
  const btn = phone_
    ? 'h-11 px-4 rounded-xl text-[15px] font-bold active:brightness-90 disabled:opacity-60'
    : 'h-9 px-3.5 rounded text-[12.5px] font-semibold disabled:opacity-60';

  const share = 'https://wa.me/' + (phone ? phone.replace(/\D/g, '') : '')
    + '?text=' + encodeURIComponent(
      clientName + ', here is the payment link for ' + contractId
      + (s.link ? ' — ' + money(s.link.amount) + '.' : '.')
      + String.fromCharCode(10) + (s.link?.url || ''),
    );

  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        <Icon name="receipt" size={16} className="text-muted" />
        <span className={phone_ ? 'text-[15.5px] font-bold' : 'text-[12.5px] font-semibold'}>
          Collect a payment
        </span>
        {s.received > 0 && (
          <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-muted">
            {money(s.received)} received
          </span>
        )}
      </div>

      {/* What is already sitting on the customer, waiting for a bill. */}
      {s.unused > 0 && (
        <p className={(phone_ ? 'text-[13px] ' : 'text-[11.5px] ')
          + 'text-muted mt-1.5 leading-relaxed'}>
          <b className="text-ink">{money(s.unused)}</b> of it has not been billed against yet.
          It comes off this contract&apos;s next instalment automatically.
        </p>
      )}

      {s.link ? (
        <div className="mt-2.5">
          <p className={phone_ ? 'text-[14px] font-semibold' : 'text-[12.5px] font-semibold'}>
            A link for {money(s.link.amount)} is out with {clientName}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <input readOnly value={s.link.url}
              onFocus={(e) => e.currentTarget.select()}
              className={input + ' flex-1 min-w-[180px] bg-wash'} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(s.link!.url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }).catch(() => {});
              }}
              className={btn + ' border border-line bg-white'}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={share} target="_blank" rel="noreferrer"
              className={btn + ' bg-navy text-white flex items-center'}>
              WhatsApp
            </a>
          </div>
          <p className={(phone_ ? 'text-[12.5px] ' : 'text-[11.5px] ')
            + 'text-muted mt-2 leading-relaxed'}>
            Razorpay reminds them by SMS and email. The moment it is paid the money
            lands on this contract — nobody has to mark anything.
          </p>
          {may && (
            <button onClick={withdraw} disabled={busy}
              className={(phone_ ? 'mt-3 ' : 'mt-2.5 ')
                + 'h-8 px-3 rounded border border-line text-[12px] font-medium text-accent bg-white disabled:opacity-60'}>
              Withdraw the link
            </button>
          )}
        </div>
      ) : may ? (
        <div className="mt-2.5">
          <div className={phone_ ? 'flex flex-col gap-2' : 'flex items-end gap-2 flex-wrap'}>
            <label className={phone_ ? 'block' : 'block flex-1 min-w-[150px]'}>
              <span className={(phone_ ? 'text-[13px] ' : 'text-[11.5px] ')
                + 'block font-semibold text-ink-2 mb-1'}>
                Amount agreed (₹)
              </span>
              <input type="number" inputMode="numeric" min={0} value={amount}
                onChange={(e) => { setAmount(e.target.value); setErr(''); }}
                placeholder="whatever you agreed" className={input} />
            </label>
            <button onClick={raise} disabled={busy}
              className={btn + (phone_ ? ' w-full bg-navy text-white' : ' bg-navy text-white')}>
              {busy ? 'Raising…' : 'Raise a link'}
            </button>
          </div>
          <p className={(phone_ ? 'text-[12.5px] ' : 'text-[11.5px] ')
            + 'text-muted mt-2 leading-relaxed'}>
            An advance, a deposit, or the whole contract up front — whatever was
            agreed. It is held against this contract and comes off its invoices
            as they are raised.
          </p>
        </div>
      ) : null}

      {err && (
        <p className={(phone_ ? 'text-[13px] ' : 'text-[11.5px] ')
          + 'text-accent mt-2 leading-snug'}>{err}</p>
      )}
    </div>
  );
}
