'use client';

/* ============================================================================
   One expense folder, worn like a Zoho report: the status journey as a
   stepper up top, the lines with category glyphs and receipt thumbnails, a
   category summary, and the folder's own history trail at the bottom. The
   owner fills and submits; the admin decides and pays here too.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { catIcon, STATUS_CHIP } from '../ui';

interface Item {
  id: string; kind: string; date: string; category: string; merchant: string;
  note: string; amount: number; km: number; rate: number; images: string[];
}
interface Folder {
  id: string; title: string; date: string; by: string; byName: string;
  status: string; note: string; adminNote: string;
  submittedAt: string; decidedAt: string; paidAt: string;
  payMode: string; payoutId: string;
  history: Array<{ at: string; text: string }>;
  expenses: Item[]; total: number; kmRate: number;
  canManage: boolean; mine: boolean;
  bank?: { holder: string; ifsc: string; accMasked: string; has: boolean };
}

const CATEGORIES = [
  'Fuel / Petrol', 'Food & tea', 'Travel (bus / train / auto)',
  'Materials & supplies', 'Vehicle repair', 'Mobile recharge',
  'Accommodation', 'Other',
];

const fmtDate = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

export default function ExpenseFolder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<Folder | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<Folder>('/expenses/reports/' + id)
      .then((r) => { setF(r); setMissing(false); })
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }

  if (missing) {
    return (
      <div className="p-10 text-center">
        <p className="text-[14px] font-semibold">No such folder</p>
        <Link href="/expenses" className="text-[13px] text-accent font-medium">← All expenses</Link>
      </div>
    );
  }
  if (!f) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const editable = f.mine && (f.status === 'open' || f.status === 'rejected');
  const chip = STATUS_CHIP[f.status] || STATUS_CHIP.open;

  // The category summary Zoho puts beside the lines.
  const catSum = new Map<string, number>();
  let kmTotal = 0;
  for (const e of f.expenses) {
    catSum.set(e.category, (catSum.get(e.category) || 0) + e.amount);
    kmTotal += e.km;
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1100px] max-lg:bg-ground max-lg:min-h-full">
      <Link href="/expenses" className="text-[12.5px] text-muted hover:text-ink">← All expenses</Link>

      {/* ------------------------------------------------------- header */}
      <div className="mt-2 rounded-md border border-line bg-white shadow-card p-4 lg:p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-semibold">{f.title}</h1>
              <span className={'inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ' + chip.cls}>
                {chip.label}
              </span>
            </div>
            <p className="text-muted text-[12.5px] mt-0.5">{f.id} · {f.byName} · {fmtDate(f.date)}</p>
          </div>
          <span className="text-right">
            <span className="block text-[24px] font-bold leading-none">{money(f.total)}</span>
            <span className="block text-[11.5px] text-muted mt-1">
              {f.expenses.length} expense{f.expenses.length === 1 ? '' : 's'}
              {kmTotal > 0 && <> · {kmTotal} km</>}
            </span>
          </span>
        </div>

        <Stepper f={f} />

        {f.status === 'rejected' && f.adminNote && (
          <p className="mt-3 text-[12.5px] text-accent font-semibold">
            Returned: {f.adminNote} — fix the folder and submit it again.
          </p>
        )}
        {f.status === 'paid' && (
          <p className="mt-3 text-[12px] text-muted">
            Paid {f.paidAt}{f.payMode === 'razorpayx'
              ? <> via RazorpayX{f.payoutId ? <> · payout <b>{f.payoutId}</b></> : null}</>
              : ' — recorded as paid by hand'}
          </p>
        )}
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* --------------------------------------------------- the lines */}
        <div className="lg:col-span-2">
          <div className="rounded-md border border-line bg-white shadow-card max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
            {f.expenses.length === 0 ? (
              <p className="p-6 text-center text-[12.5px] text-muted">
                Empty folder — add the first expense below.
              </p>
            ) : f.expenses.map((e, i) => (
              <div key={e.id}
                className={'flex items-start gap-3 px-4 py-3 ' + (i < f.expenses.length - 1 ? 'border-b border-line-soft' : '')}>
                <span className="w-10 h-10 rounded-lg bg-red-wash text-accent flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name={catIcon(e.category)} size={17} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {e.kind === 'trip' ? <>Trip — {e.km} km × {money(e.rate)}/km</> : e.category}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {[e.merchant, e.note, e.id].filter(Boolean).join(' · ')}
                  </span>
                  {e.images.length > 0 && (
                    <span className="flex gap-1.5 mt-1.5">
                      {e.images.map((img, k) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={k} src={img} alt="" onClick={() => window.open()?.document.write(
                          '<img src="' + img + '" style="max-width:100%">')}
                          className="w-12 h-12 rounded object-cover border border-line cursor-zoom-in" />
                      ))}
                    </span>
                  )}
                </span>
                <span className="text-[13.5px] font-bold shrink-0">{money(e.amount)}</span>
                {editable && (
                  <button onClick={() => act(() => api.del('/expenses/items/' + e.id))}
                    className="w-7 h-7 rounded border border-line flex items-center justify-center text-accent hover:bg-red-wash shrink-0"
                    title="Remove">
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {editable && (
            <div className="mt-4">
              <AddForm folderId={f.id} kmRate={f.kmRate} onAdded={load} />
              {f.expenses.length > 0 && (
                <button disabled={busy}
                  onClick={() => act(() => api.post('/expenses/reports/' + f.id + '/submit', {}),
                    'Submit this folder to the admin?\nAfter that nothing in it can be changed.')}
                  className="mt-4 w-full h-11 rounded-md bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-60">
                  Submit {money(f.total)} for approval
                </button>
              )}
              <button disabled={busy}
                onClick={() => act(async () => {
                  await api.del('/expenses/reports/' + f.id);
                  router.push('/expenses');
                }, 'Delete this folder and everything in it?')}
                className="mt-2 w-full h-9 rounded-md border border-line text-[12.5px] font-medium text-muted hover:bg-wash">
                Delete folder
              </button>
            </div>
          )}

          {f.canManage && f.status === 'submitted' && <DecidePanel folder={f} busy={busy} act={act} />}
          {f.canManage && f.status === 'approved' && <PayPanel folder={f} busy={busy} act={act} onSaved={load} />}
        </div>

        {/* ---------------------------------------- summary + the diary */}
        <div className="flex flex-col gap-4">
          {f.expenses.length > 0 && (
            <section className="rounded-md border border-line bg-white shadow-card p-4 max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
              <h2 className="text-[12.5px] font-bold mb-2.5">Summary</h2>
              {Array.from(catSum.entries()).map(([cat, v]) => (
                <div key={cat} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon name={catIcon(cat)} size={13} className="text-muted shrink-0" />
                    <span className="truncate">{cat}</span>
                  </span>
                  <span className="font-semibold shrink-0">{money(v)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-1 border-t-2 border-navy text-[13px] font-bold">
                <span>Total claimed</span><span>{money(f.total)}</span>
              </div>
            </section>
          )}

          {f.history.length > 0 && (
            <section className="rounded-md border border-line bg-white shadow-card p-4 max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
              <h2 className="text-[12.5px] font-bold mb-3">History</h2>
              <div className="flex flex-col">
                {f.history.slice().reverse().map((h, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="flex flex-col items-center">
                      <span className={'w-2 h-2 rounded-full mt-1 shrink-0 ' + (i === 0 ? 'bg-accent' : 'bg-line')} />
                      {i < f.history.length - 1 && <span className="w-px flex-1 bg-line-soft" />}
                    </span>
                    <span className="pb-3 min-w-0">
                      <span className="block text-[12px] leading-snug">{h.text}</span>
                      <span className="block text-[10.5px] text-muted-2">{h.at}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ the status journey strip */

function Stepper({ f }: { f: Folder }) {
  const rejected = f.status === 'rejected';
  const steps = [
    { label: 'Created', at: f.date, done: true },
    rejected
      ? { label: 'Returned', at: f.decidedAt, done: true, bad: true }
      : { label: 'Submitted', at: f.submittedAt, done: ['submitted', 'approved', 'paid'].includes(f.status) },
    { label: 'Approved', at: rejected ? '' : f.decidedAt, done: !rejected && ['approved', 'paid'].includes(f.status) },
    { label: 'Paid', at: f.paidAt, done: f.status === 'paid' },
  ] as Array<{ label: string; at: string; done: boolean; bad?: boolean }>;

  return (
    <div className="mt-4 flex items-start">
      {steps.map((s, i) => (
        <div key={s.label} className="flex-1 flex flex-col items-center relative">
          {i > 0 && (
            <span className={'absolute top-[11px] right-1/2 left-[-50%] h-[2px] '
              + (s.done ? (s.bad ? 'bg-accent' : 'bg-navy') : 'bg-line')} />
          )}
          <span className={'relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 '
            + (s.done
              ? s.bad ? 'bg-accent border-accent text-white' : 'bg-navy border-navy text-white'
              : 'bg-white border-line text-transparent')}>
            {s.bad ? <Icon name="x" size={11} /> : <Icon name="check" size={11} />}
          </span>
          <span className={'mt-1.5 text-[10.5px] font-bold uppercase tracking-wide '
            + (s.done ? (s.bad ? 'text-accent' : 'text-navy') : 'text-muted-2')}>
            {s.label}
          </span>
          {s.at && <span className="text-[9.5px] text-muted-2">{s.at.slice(0, 10)}</span>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ the add form */

function AddForm({ folderId, kmRate, onAdded }: {
  folderId: string; kmRate: number; onAdded: () => void;
}) {
  const [kind, setKind] = useState<'expense' | 'trip'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [km, setKm] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  function addPhoto(fl: File) {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(1100, img.width);
      const h = Math.round(img.height * (w / img.width));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
      setImages((xs) => [...xs, cv.toDataURL('image/jpeg', 0.78)].slice(0, 4));
    };
    img.src = URL.createObjectURL(fl);
  }

  async function add() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await api.post('/expenses/reports/' + folderId + '/items',
        kind === 'trip'
          ? { kind, km: Number(km) || 0, note }
          : { kind, amount: Number(amount) || 0, category, merchant, note, images });
      setAmount(''); setMerchant(''); setNote(''); setKm(''); setImages([]);
      onAdded();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add'); }
    setBusy(false);
  }

  const input = 'w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';
  const tripAmount = Math.round((Number(km) || 0) * kmRate);

  return (
    <div className="rounded-md border border-line bg-white shadow-card p-4 max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
      <div className="flex gap-2 mb-3">
        {(['expense', 'trip'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={'h-9 px-4 rounded-md text-[13px] font-semibold border transition-colors '
              + (kind === k ? 'border-navy bg-wash text-navy' : 'border-line text-muted hover:bg-wash')}>
            <Icon name={k === 'expense' ? 'receipt' : 'road'} size={14} className="inline mr-1.5 align-[-2px]" />
            {k === 'expense' ? 'Expense with bill' : 'Trip (km allowance)'}
          </button>
        ))}
      </div>

      {kind === 'expense' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Amount (₹)</span>
            <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0" className={input} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Shop / merchant</span>
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)}
              placeholder="where it was spent" className={input} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="what it was for" className={input} />
          </label>
          <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
            {images.map((img, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="w-14 h-14 rounded object-cover border border-line" />
                <button onClick={() => setImages((xs) => xs.filter((_, k) => k !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center">
                  <Icon name="x" size={10} />
                </button>
              </span>
            ))}
            {images.length < 4 && (
              <button onClick={() => file.current?.click()}
                className="flex items-center gap-1.5 h-9 px-3 rounded border border-dashed border-line text-[12.5px] font-medium text-muted hover:bg-wash">
                <Icon name="upload" size={14} /> Bill photo
              </button>
            )}
            <input ref={file} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) addPhoto(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Distance (km)</span>
            <input type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)}
              placeholder="0" className={input} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="where to where" className={input} />
          </label>
          <p className="sm:col-span-2 text-[12.5px] text-muted">
            {kmRate > 0
              ? <>Rate <b>{money(kmRate)}/km</b> → this trip pays <b className="text-ink">{money(tripAmount)}</b>.</>
              : <>The ₹-per-km rate is not set yet — the admin sets it in Settings → Organisation.</>}
          </p>
        </div>
      )}

      {err && <p className="text-[12.5px] text-accent mt-2">{err}</p>}
      <button onClick={add} disabled={busy}
        className="mt-3 h-10 px-5 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-60">
        Add to folder
      </button>
    </div>
  );
}

/* -------------------------------------------------------- admin: decision */

function DecidePanel({ folder, busy, act }: {
  folder: Folder; busy: boolean;
  act: (fn: () => Promise<unknown>, confirm?: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="mt-4 rounded-md border-2 border-navy bg-white shadow-card p-4">
      <h2 className="text-[13.5px] font-bold mb-1">Your decision</h2>
      <p className="text-[12.5px] text-muted mb-3">
        {folder.byName} is claiming {money(folder.total)}. Approve it for payment, or
        return it with a reason.
      </p>
      <input value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (required to reject)"
        className="w-full h-10 px-3 rounded border border-line text-[13px] outline-none focus:border-navy mb-3" />
      <div className="flex gap-2">
        <button disabled={busy}
          onClick={() => act(() => api.post('/expenses/reports/' + folder.id + '/decide', { approve: true, note }))}
          className="flex-1 h-10 rounded bg-navy text-white text-[13px] font-bold hover:brightness-110 disabled:opacity-60">
          Approve {money(folder.total)}
        </button>
        <button disabled={busy}
          onClick={() => act(() => api.post('/expenses/reports/' + folder.id + '/decide', { approve: false, note }))}
          className="flex-1 h-10 rounded border border-line text-[13px] font-semibold text-accent hover:bg-red-wash disabled:opacity-60">
          Return it
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- admin: payment */

function PayPanel({ folder, busy, act, onSaved }: {
  folder: Folder; busy: boolean;
  act: (fn: () => Promise<unknown>, confirm?: string) => void;
  onSaved: () => void;
}) {
  const bank = folder.bank;
  const [editing, setEditing] = useState(!bank?.has);
  const [holder, setHolder] = useState(bank?.holder || '');
  const [acc, setAcc] = useState('');
  const [ifsc, setIfsc] = useState(bank?.ifsc || '');
  const [err, setErr] = useState('');
  const input = 'w-full h-10 px-3 rounded border border-line text-[13px] outline-none focus:border-navy';

  async function saveBank() {
    setErr('');
    try {
      // One route, on the person — the same one the profile page uses.
      await api.post('/team/' + folder.by + '/bank', { holder, acc, ifsc });
      setEditing(false); setAcc('');
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); }
  }

  return (
    <div className="mt-4 rounded-md border-2 border-navy bg-white shadow-card p-4">
      <h2 className="text-[13.5px] font-bold mb-1">Pay {folder.byName} back</h2>
      <p className="text-[12.5px] text-muted mb-3">
        {money(folder.total)} approved. Send it through RazorpayX to their bank
        account, or mark it paid if the cash changed hands outside.
      </p>

      {!editing && bank?.has ? (
        <p className="text-[12.5px] mb-3">
          Bank: <b>{bank.holder}</b> · {bank.accMasked} · {bank.ifsc}{' '}
          <button onClick={() => setEditing(true)} className="text-accent font-semibold ml-1">change</button>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
          <input value={holder} onChange={(e) => setHolder(e.target.value)}
            placeholder="Account holder name" className={input} />
          <input value={acc} onChange={(e) => setAcc(e.target.value)}
            placeholder="Account number" className={input} />
          <input value={ifsc} onChange={(e) => setIfsc(e.target.value)}
            placeholder="IFSC" className={input} />
          <div className="sm:col-span-3">
            <button onClick={saveBank}
              className="h-9 px-4 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
              Save bank details (stored encrypted)
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-[12.5px] text-accent mb-2">{err}</p>}

      <div className="flex gap-2 flex-wrap">
        <button disabled={busy}
          onClick={() => act(() => api.post('/expenses/reports/' + folder.id + '/pay', { mode: 'razorpayx' }),
            'Send ' + money(folder.total) + ' to ' + folder.byName + '’s bank account via RazorpayX?')}
          className="flex-1 min-w-[180px] h-10 rounded bg-accent text-white text-[13px] font-bold hover:brightness-90 disabled:opacity-60">
          Pay via RazorpayX
        </button>
        <button disabled={busy}
          onClick={() => act(() => api.post('/expenses/reports/' + folder.id + '/pay', { mode: 'manual' }),
            'Mark ' + money(folder.total) + ' as paid by hand?')}
          className="flex-1 min-w-[180px] h-10 rounded border border-line text-[13px] font-semibold hover:bg-wash disabled:opacity-60">
          Mark paid manually
        </button>
      </div>
    </div>
  );
}
