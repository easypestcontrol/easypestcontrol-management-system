'use client';

/* ============================================================================
   The money on a visit.

   What this service is worth, whether it has been billed, and — when the
   technician is standing there with the customer — taking the payment. It
   lives beside the service rather than in Finance because that is where the
   money actually changes hands.

   Lifted out of the job page so the phone's completed-service screen shows
   the same card, with the same rules, rather than a second version of them.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { money } from 'shared';
import { Icon } from '@/components/icons';
import UpiQr from '@/components/upi-qr';
import PaidTick from '@/components/paid-tick';
import type { JobDetail } from '../format';
import { Field, Modal, inputCls } from '../ui';

/**
 * What this visit is worth and how to take the money — Cash goes into the
 * technician's wallet, UPI opens a Razorpay QR once the keys are connected,
 * Bank transfer records the UTR. Every rupee lands against the collector's
 * name with date and time.
 */
export function TechMoney({ j }: { j: JobDetail }) {
  const router = useRouter();
  const [info, setInfo] = useState<{
    mode: string; note: string; amount: number;
    invoice: { id: string; total: number; paid: number; balance: number } | null;
    trip?: Array<{ id: string; status: string; services: string; amount: number }>;
  } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const load = () => api.get<typeof info>('/jobs/' + j.id + '/billing').then(setInfo).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [j.id, j.status]);

  if (!info || (!info.invoice && info.mode !== 'pervisit')) return null;

  return (
    <div className={'rounded-md border p-4 ' +
      (info.invoice && info.invoice.balance > 0 ? 'border-red-line bg-red-wash' : 'border-line')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Money</p>
      <p className="text-[13px] font-semibold">{info.note}</p>
      {info.invoice ? (
        <p className="text-[12.5px] text-ink-2 mt-1">
          Invoice{' '}
          <Link href={'/invoices/' + info.invoice.id}
            className="font-bold text-navy underline decoration-line whitespace-nowrap hover:text-accent">
            {info.invoice.id} ↗
          </Link>{' '}
          — {money(info.invoice.total)} incl. GST
          {info.invoice.balance <= 0
            ? <span className="text-navy font-semibold"> · collected ✓</span>
            : <> · to collect <b className="text-accent">{money(info.invoice.balance)}</b></>}
        </p>
      ) : (
        <p className="text-[12px] text-muted mt-1">The invoice raises itself when you finish the service.</p>
      )}
      {(info.trip?.length || 0) > 0 && (
        <div className="mt-2 rounded border border-line bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
            Same trip — also due on this visit
          </p>
          {info.trip!.map((tj) => (
            <Link key={tj.id} href={'/jobs/' + tj.id}
              className="flex justify-between gap-2 text-[12.5px] py-0.5 text-navy hover:text-accent">
              <span className="truncate">{tj.services} <span className="text-muted-2 font-mono text-[10.5px]">{tj.id}</span></span>
              <span className="font-semibold shrink-0">
                {tj.amount > 0 ? money(tj.amount) + ' + GST' : ''}
              </span>
            </Link>
          ))}
          <p className="text-[10.5px] text-muted-2 mt-1">
            Each service bills as its own invoice, so every amount tallies —
            collect them together on this one visit.
          </p>
        </div>
      )}
      {doneMsg && <p className="text-[12.5px] font-semibold text-navy mt-2">{doneMsg}</p>}
      {info.invoice && info.invoice.balance > 0 && (
        <button onClick={() => setCollecting(true)}
          className="mt-3 w-full h-10 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90">
          Collect {money(info.invoice.balance)}
        </button>
      )}
      {collecting && info.invoice && (
        <CollectDialog invoiceId={info.invoice.id} balance={info.invoice.balance} jobId={j.id}
          onClose={() => setCollecting(false)}
          onDone={(msg) => {
            setCollecting(false); setDoneMsg(msg); load();
            // The moment the money is recorded, the invoice itself opens —
            // the receipt is on it, no extra tap.
            router.push('/invoices/' + info.invoice!.id);
          }} />
      )}
    </div>
  );
}

function CollectDialog({ invoiceId, balance, jobId, onClose, onDone }: {
  invoiceId: string; balance: number; jobId: string;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'Cash' | 'UPI' | 'Transfer'>('Cash');
  const [amount, setAmount] = useState(String(balance));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState<{ qrId: string; image: string; amount: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [landed, setLanded] = useState<
    { amount: number; receiptId: string; note?: string } | null
  >(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  /* Let it be seen before the screen moves. */
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => onDone(
      money(landed.amount) + ' received on UPI — receipt ' + (landed.receiptId || '') + '.',
    ), 1900);
    return () => clearTimeout(t);
  }, [landed, onDone]);

  async function recordManual() {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { setErr('Enter the amount collected'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/invoices/' + invoiceId + '/payments', {
        amount: amt, mode,
        ref: (ref.trim() ? ref.trim() + ' · ' : '') + 'Collected on site — ' + jobId,
      });
      onDone(mode === 'Cash'
        ? money(amt) + ' recorded in your wallet — deposit it at the office.'
        : money(amt) + ' recorded against your name (' + (mode === 'Transfer' ? 'bank transfer' : mode) + ').');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not record'); setBusy(false); }
  }

  async function openQr() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ qrId: string; image: string; amount: number }>('/pay/upi/' + invoiceId, {});
      setQr(r); setBusy(false);
      pollRef.current = setInterval(async () => {
        try {
          const st = await api.get<{ paid: boolean; receipt?: string; amount?: number }>(
            '/pay/upi/' + r.qrId + '/status?invoiceId=' + invoiceId);
          if (st.paid) {
            if (pollRef.current) clearInterval(pollRef.current);
            /* The customer is standing right there. Say it, then stand aside. */
            setLanded({
              amount: st.amount || r.amount,
              receiptId: st.receipt || '',
              note: 'Receipt ' + (st.receipt || 'issued') + ' — the office has been told.',
            });
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the QR');
      setBusy(false);
    }
  }

  const modeBtn = (m: 'Cash' | 'UPI' | 'Transfer', label: string) => (
    <button key={m} onClick={() => { setMode(m); setErr(''); setQr(null); if (pollRef.current) clearInterval(pollRef.current); }}
      className={'h-10 rounded border text-[13px] font-semibold ' +
        (mode === m ? 'border-navy bg-wash text-navy' : 'border-line text-ink-2 hover:bg-wash')}>
      {label}
    </button>
  );

  return (
    <Modal title={'Collect payment'} sub={invoiceId + ' · balance ' + money(balance)} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {modeBtn('Cash', 'Cash')}
        {modeBtn('UPI', 'UPI')}
        {modeBtn('Transfer', 'Bank transfer')}
      </div>

      {mode === 'UPI' && !qr && (
        <button onClick={openQr} disabled={busy}
          className="w-full h-10 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-60 mb-3">
          {busy ? 'Opening…' : 'Show the QR code'}
        </button>
      )}
      {landed && <PaidTick {...landed} />}
      {qr && !landed && (
        <div className="text-center mb-3">
          {/* Held up to a customer at their door, so it wants the width it can
              get — the code inside Razorpay's poster is only a third of it. */}
          <UpiQr src={'/api/pay/upi/' + qr.qrId + '/image'}
            fallback={qr.image} size={250} />
          <p className="text-[13px] text-muted mt-2">
            {money(qr.amount)} — waiting for the customer to scan and pay…
          </p>
        </div>
      )}

      {(mode !== 'UPI' || err) && !landed && (
        <>
          <label className="block mb-3">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Amount collected (₹)</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 rounded border border-line text-[14px] outline-none focus:border-navy" />
          </label>
          {mode === 'Transfer' && (
            <label className="block mb-3">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">UTR / reference no.</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder="From the customer's transfer receipt"
                className="w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>
          )}
          {mode === 'UPI' && (
            <p className="text-[11.5px] text-muted-2 mb-2">
              …or record the UPI collection manually if the customer paid to the office UPI directly.
            </p>
          )}
          <button onClick={recordManual} disabled={busy}
            className="w-full h-10 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90 disabled:opacity-60">
            {busy ? 'Recording…' : 'Record ' + (mode === 'Transfer' ? 'bank transfer' : mode)}
          </button>
        </>
      )}
      {err && <p className="text-accent text-[12.5px] mt-2">{err}</p>}
      <p className="text-[11px] text-muted-2 mt-3">
        Every collection is stored with your name, the date and the exact time — visible to you and the office.
      </p>
    </Modal>
  );
}

/**
 * Start a tracked trip to this site and open the Ola map INSIDE the app —
 * no new tab. Falls back to an external link only when Ola is not connected.
 */
