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
  return (
    <Modal title={'Collect payment'} sub={invoiceId + ' · balance ' + money(balance)} onClose={onClose}>
      <CollectForm invoiceId={invoiceId} balance={balance} jobId={jobId} onDone={onDone} />
    </Modal>
  );
}

/**
 * How the money is taken: Cash (it goes into the technician's wallet, to be
 * paid in at the office), UPI (a Razorpay QR the customer scans; it ticks
 * itself when the payment lands), or a bank transfer with its UTR. Every
 * rupee is recorded against the collector's name, date and time.
 */
export function CollectForm({ invoiceId, balance, jobId, onDone }: {
  invoiceId: string; balance: number; jobId: string; onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'Cash' | 'UPI' | 'Transfer'>('Cash');

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
    const amt = Math.round(balance);   // always the full amount
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
      className={'h-11 px-1 rounded-xl border text-[12.5px] font-semibold whitespace-nowrap ' +
        (mode === m ? 'border-accent bg-red-wash text-accent' : 'border-line bg-white text-ink-2 hover:bg-wash')}>
      {label}
    </button>
  );

  return (
    <div data-collect>
      {/* Cash or UPI only - the technician collects on site; a bank transfer
          is the office's business. */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {modeBtn('Cash', 'Cash')}
        {modeBtn('UPI', 'UPI / QR')}
      </div>

      {mode === 'UPI' && !qr && (
        <button onClick={openQr} disabled={busy}
          className="w-full h-11 rounded-xl bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-60 mb-3">
          {busy ? 'Opening…' : 'Show the QR code to the customer'}
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

      {mode === 'Cash' && !landed && (
        <p className="text-[12px] text-muted mb-3">
          Cash goes into your wallet — pay it in at the office.
        </p>
      )}
      {(mode !== 'UPI' || err) && !landed && (
        <>
          {/* The full amount, always - not a figure to type. A technician does
              not take part-payments on site. */}
          <div className="mb-3">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Amount to collect</span>
            <div data-amount-fixed className="h-11 px-3 rounded-lg border border-line bg-wash flex items-center justify-between">
              <span className="text-[15px] font-bold tabular-nums">{money(balance)}</span>
              <span className="text-[11.5px] text-muted">full amount</span>
            </div>
          </div>
          {mode === 'Transfer' && (
            <label className="block mb-3">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">UTR / reference no.</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder="From the customer's transfer receipt"
                className="w-full h-11 px-3 rounded-lg border border-line text-[13.5px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]" />
            </label>
          )}
          {mode === 'UPI' && (
            <p className="text-[11.5px] text-muted-2 mb-2">
              …or record the UPI collection manually if the customer paid to the office UPI directly.
            </p>
          )}
          <button onClick={recordManual} disabled={busy}
            className="w-full h-11 rounded-xl bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-60">
            {busy ? 'Recording…' : mode === 'Cash' ? 'Record cash received' : 'Record ' + (mode === 'Transfer' ? 'bank transfer' : 'UPI payment')}
          </button>
        </>
      )}
      {err && <p className="text-accent text-[12.5px] mt-2">{err}</p>}
      <p className="text-[11px] text-muted-2 mt-3">
        Every collection is stored with your name, the date and the exact time — visible to you and the office.
      </p>
    </div>
  );
}

interface Billing {
  mode: string; note: string; amount: number;
  invoice: { id: string; total: number; paid: number; balance: number } | null;
}

/**
 * The payment step of a service, before the customer signs.
 *
 * What this visit is worth is collected on site, before the service can be
 * finished: the bill is raised here (not at the finish any more), and the
 * technician takes it by cash, UPI QR or bank transfer. A contract billed by
 * its plan (monthly or upfront) has nothing to take on the visit, and says so.
 * Tells the runner whether the step is settled through onSettled.
 */
export function CollectStep({ j, onSettled }: { j: JobDetail; onSettled: (ok: boolean) => void }) {
  const [info, setInfo] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [said, setSaid] = useState('');

  const load = () => api.get<Billing>('/jobs/' + j.id + '/billing').then(setInfo).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [j.id]);

  const [raised, setRaised] = useState(false);
  // A contract billed by its plan (monthly / upfront) takes nothing on the visit.
  const planBilled = !!info && !!j.contractId && info.mode !== 'pervisit';
  const nothing = !!info && !info.invoice && (planBilled || raised);
  const settled = !!info && (nothing || (!!info.invoice && info.invoice.balance <= 0));
  useEffect(() => { onSettled(settled); }, [settled, onSettled]);

  /* The bill is raised the moment this step opens - the amount the customer
     is asked for is the real invoice, GST and all, never an estimate. */
  useEffect(() => {
    if (!info || info.invoice || planBilled || raised || busy) return;
    void raise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, planBilled]);

  async function raise() {
    setBusy(true); setErr('');
    try { setInfo(await api.post<Billing>('/jobs/' + j.id + '/exec/bill', {})); setRaised(true); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not raise the bill'); }
    setBusy(false);
  }

  if (!info) return <p className="text-[13px] text-muted">Checking what this visit collects…</p>;

  if (nothing) {
    return (
      <div className="rounded-lg bg-mint/60 px-3.5 py-3 flex items-start gap-2.5">
        <Icon name="check" size={16} className="text-mint-ink shrink-0 mt-0.5" />
        <p className="text-[13px] text-ink-2">
          Nothing to collect on this visit — {planBilled
            ? 'this contract is billed by its plan, and the office sends that invoice.'
            : 'there is no price set for it.'}
        </p>
      </div>
    );
  }

  const inv = info.invoice;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-line bg-wash px-3.5 py-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            {inv ? (inv.balance > 0 ? 'To collect' : 'Collected') : 'This visit'}
          </span>
          <span className="block text-[12px] text-muted mt-0.5 truncate">
            {inv ? inv.id + ' · total ' + money(inv.total) + ' incl. GST' : busy ? 'Preparing the bill…' : info.note}
          </span>
        </span>
        <span className={'text-[20px] font-bold tabular-nums shrink-0 ' + (inv && inv.balance <= 0 ? 'text-mint-ink' : 'text-accent')}>
          {inv ? money(inv.balance > 0 ? inv.balance : inv.paid) : money(info.amount)}
          {!inv && <span className="text-[11px] font-semibold text-muted"> + GST</span>}
        </span>
      </div>

      {!inv && (
        <button type="button" onClick={raise} disabled={busy}
          className="h-11 rounded-xl border border-line bg-white text-[14px] font-semibold active:bg-wash disabled:opacity-60">
          {busy ? 'Preparing the bill…' : 'Try again'}
        </button>
      )}

      {inv && inv.balance > 0 && (
        <CollectForm invoiceId={inv.id} balance={inv.balance} jobId={j.id}
          onDone={(msg) => { setSaid(msg); load(); }} />
      )}

      {inv && inv.balance <= 0 && (
        <div className="rounded-lg bg-mint/60 px-3.5 py-3 flex items-start gap-2.5">
          <Icon name="check" size={16} className="text-mint-ink shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink-2">
            {said || 'Payment collected — ' + money(inv.paid) + ' against ' + inv.id + '.'}
          </p>
        </div>
      )}
      {err && <p className="text-[12.5px] font-semibold text-accent">{err}</p>}
    </div>
  );
}

/**
 * Start a tracked trip to this site and open the Ola map INSIDE the app —
 * no new tab. Falls back to an external link only when Ola is not connected.
 */
