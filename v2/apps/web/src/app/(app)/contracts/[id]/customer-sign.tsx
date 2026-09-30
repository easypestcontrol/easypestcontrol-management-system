'use client';

/* ============================================================================
   The customer's signature on a contract - is it there, and if not, the two
   ways to get it.

   Sign now hands the screen to the customer: the pad takes the whole of it
   and the signature is saved the moment they finish. Send link opens the
   share sheet for the public contract page, where the customer signs on
   their own phone. The same block sits on the desktop page and the phone
   page, so the answer to "did they sign?" is in one place on both.
   ========================================================================== */

import { useState } from 'react';
import { api } from '@/lib/api';
import SignFull from '@/components/sign-full';
import { fmtDate, fmtTime } from '../lib';

export default function CustomerSign({ c, canEdit, onChanged, onShare }: {
  c: {
    id: string; signCustomer?: string; agreedAt?: string;
    client: { name: string; contact?: string } | null;
  };
  /** Admin, ops and the salesperson may collect it; everyone may see it. */
  canEdit: boolean;
  onChanged: () => void;
  /** Open the share sheet for the signing link. */
  onShare: () => void;
}) {
  const [pad, setPad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const who = c.client?.contact || c.client?.name || 'The customer';

  async function save(dataUrl: string) {
    setPad(false); setErr(''); setBusy(true);
    try {
      await api.patch('/contracts/' + c.id, { signCustomer: dataUrl });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the signature');
    } finally {
      setBusy(false);
    }
  }

  if (c.signCustomer) {
    const at = String(c.agreedAt || '');
    return (
      <div data-customer-sign="signed">
        <div className="rounded-xl border border-line bg-white px-3 py-2 h-[92px] flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.signCustomer} alt="Customer signature" className="max-h-[76px] max-w-full object-contain" />
        </div>
        <p className="text-[13px] lg:text-[12px] text-muted mt-2 leading-relaxed">
          Signed by {who}
          {at.length >= 10 ? ' · ' + fmtDate(at.slice(0, 10)) : ''}
          {at.length >= 16 ? ', ' + fmtTime(at.slice(11, 16)) : ''}
        </p>
      </div>
    );
  }

  return (
    <div data-customer-sign="unsigned">
      <p className="text-[14px] lg:text-[12.5px] text-ink-2 leading-relaxed">
        {who} has not signed this agreement yet.
      </p>
      {canEdit && (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" onClick={() => setPad(true)} disabled={busy}
              className="h-11 lg:h-9 rounded-lg bg-accent text-white text-[14px] lg:text-[12.5px] font-semibold
                hover:brightness-90 active:brightness-90 disabled:opacity-60">
              {busy ? 'Saving…' : 'Sign now'}
            </button>
            <button type="button" onClick={onShare}
              className="h-11 lg:h-9 rounded-lg border border-line bg-white text-[14px] lg:text-[12.5px] font-semibold
                hover:bg-wash active:bg-wash">
              Send link to sign
            </button>
          </div>
          <p className="text-[12.5px] lg:text-[11.5px] text-muted mt-2.5 leading-relaxed">
            Sign now hands this screen to the customer. The link lets them sign on
            their own phone — you are told when they do.
          </p>
        </>
      )}
      {err && <p className="text-[13px] text-accent font-medium mt-2">{err}</p>}
      {pad && (
        <SignFull title="Customer signature" who={who}
          onCancel={() => setPad(false)} onDone={save} />
      )}
    </div>
  );
}
