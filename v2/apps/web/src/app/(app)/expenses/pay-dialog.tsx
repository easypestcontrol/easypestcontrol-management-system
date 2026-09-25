'use client';

/* ============================================================================
   Paying what is owed.

   One dialog for every "Pay" in the module: a single expense (where a part
   payment is allowed and the rest stays owed), a branch's report, or a whole
   day. The amount box only appears for a single expense — a part payment on
   a whole day would mean nothing. Manual or RazorpayX, the way it always was.
   ========================================================================== */

import { useState } from 'react';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { inputCls } from './ui';

export interface PayTarget {
  /** What the server pays: one of these. */
  ids?: string[]; reportId?: string; date?: string;
  /** What the title says. */
  title: string;
  /** Rupees still owed on the target. */
  due: number;
  /** A single expense may be part-paid. */
  single?: boolean;
}

export default function PayDialog({ target, onClose, onDone }: {
  target: PayTarget;
  onClose: () => void;
  onDone: (out: { paid: number; failed: number }) => void;
}) {
  const [amount, setAmount] = useState(String(target.due));
  const [mode, setMode] = useState<'manual' | 'razorpayx'>('manual');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = Math.round(Number(amount) || 0);
  const partial = target.single && n > 0 && n < target.due;
  const canPay = !busy && (!target.single || (n > 0 && n <= target.due));

  async function pay() {
    if (!canPay) return;
    setBusy(true); setErr('');
    try {
      const body: Record<string, unknown> = { mode };
      if (target.ids) body.ids = target.ids;
      if (target.reportId) body.reportId = target.reportId;
      if (target.date) body.date = target.date;
      if (target.single && n < target.due) body.amount = n;
      const out = await api.post<{ paid: number; failed: number }>('/expenses/reimburse', body);
      onDone(out);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not pay'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[420px] sm:rounded-xl rounded-t-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-line-soft">
          <h2 className="text-[15px] font-bold truncate">Pay · {target.title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="text-[13px] text-muted">Still owed: <b className="text-ink">{money(target.due)}</b></p>

          {target.single ? (
            <label className="block">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1">Amount to pay now (₹)</span>
              <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
                min={1} max={target.due} className={inputCls} />
              <span className="block text-[11.5px] text-muted mt-1">
                {partial ? 'A part payment — ' + money(target.due - n) + ' stays owed and the expense reads Partly paid.'
                  : 'The full amount — the expense reads Paid.'}
              </span>
            </label>
          ) : (
            <p className="text-[12.5px] text-muted">Each person gets one payout for everything they are owed here.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {([['manual', 'Paid by hand'], ['razorpayx', 'RazorpayX to bank']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={'h-11 rounded-[12px] border text-[13px] font-semibold transition-colors '
                  + (mode === k ? 'border-accent bg-rose text-accent' : 'border-line hover:bg-wash')}>{l}</button>
            ))}
          </div>

          {err && <p className="text-[12.5px] text-accent">{err}</p>}
          <button onClick={pay} disabled={!canPay}
            className="h-12 lg:h-11 rounded-xl lg:rounded-md bg-accent text-white text-[15px] lg:text-[14px] font-bold hover:brightness-90 disabled:opacity-50">
            {busy ? 'Paying…' : 'Pay ' + money(target.single ? n : target.due)}
          </button>
        </div>
      </div>
    </div>
  );
}
