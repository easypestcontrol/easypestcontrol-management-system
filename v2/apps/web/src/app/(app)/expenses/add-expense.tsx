'use client';

/* The employee's Add-Expense flow: pick the date, the system finds the
   branch+date report for the logged-in user, and the expense drops in. There
   is no "create folder" here — if no report is open, the employee is told to
   ask their manager. Employee and branch are set by the server from the token. */

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { CATEGORIES, catIcon } from './ui';

const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export default function AddExpense({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [report, setReport] = useState<{ found: boolean; title?: string; closed?: boolean } | null>(null);
  const [category, setCategory] = useState(CATEGORIES[1]); // Petrol / Fuel
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReport(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    api.get<{ found: boolean; title?: string; closed?: boolean }>('/expenses/report-for?date=' + date)
      .then(setReport).catch(() => setReport({ found: false }));
  }, [date]);

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

  const canAdd = report?.found && !report.closed && Number(amount) > 0;

  async function submit() {
    if (busy || !canAdd) return;
    setBusy(true); setErr('');
    try {
      await api.post('/expenses', { date, category, amount: Number(amount), merchant, note, images });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add the expense'); setBusy(false); }
  }

  const input = 'w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[460px] sm:rounded-xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-line-soft sticky top-0 bg-white">
          <h2 className="text-[15px] font-bold">Add an expense</h2>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Date</span>
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>

          {/* the branch+date report the system found for me */}
          {report && (report.found
            ? <div className={'rounded-lg border px-3 py-2 text-[12.5px] ' + (report.closed ? 'border-red-line bg-red-wash text-accent' : 'border-navy/25 bg-wash')}>
                {report.closed
                  ? <>This report is closed — no new expenses.</>
                  : <>Adding to <b>{report.title}</b></>}
              </div>
            : <div className="rounded-lg border border-red-line bg-red-wash px-3 py-2 text-[12.5px] text-accent">
                Expense report for this date has not been opened yet. Please contact your branch manager.
              </div>)}

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1">Amount (₹)</span>
              <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={input} />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1">Shop / vendor</span>
              <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="optional" className={input} />
            </label>
          </div>

          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1">Description</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what it was for" className={input} />
          </label>

          <div>
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Receipt</span>
            <div className="flex items-center gap-2 flex-wrap">
              {images.map((img, i) => (
                <span key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" className="w-14 h-14 rounded object-cover border border-line" />
                  <button onClick={() => setImages((xs) => xs.filter((_, k) => k !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center"><Icon name="x" size={10} /></button>
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

          {err && <p className="text-[12.5px] text-accent">{err}</p>}
          <button onClick={submit} disabled={!canAdd || busy}
            className="h-11 rounded-md bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-50">
            Submit expense
          </button>
        </div>
      </div>
    </div>
  );
}
