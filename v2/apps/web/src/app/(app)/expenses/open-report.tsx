'use client';

/* The office opens a day's folder for a branch by hand — before anyone has
   spent anything, or for a day the calendar shows empty. */

import { useEffect, useState } from 'react';
import { api, ApiError, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { inputCls, todayISO } from './ui';

export default function OpenReport({ date: initial, onClose, onDone }: {
  date?: string;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [date, setDate] = useState(initial || todayISO());
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get<Bootstrap>('/org/bootstrap').then((b) => {
      setBranches(b.branches); if (b.branches[0]) setBranch(b.branches[0].id);
    }).catch(() => {});
  }, []);
  async function create() {
    if (busy || !branch) return;
    setBusy(true); setErr('');
    try { const r = await api.post<{ id: string }>('/expenses/reports', { date, branch }); onDone(r.id); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not open the report'); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-[400px] rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-line-soft">
          <h2 className="text-[15px] font-bold">Open an expense report</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <label className="block"><span className="block text-[12px] font-semibold text-ink-2 mb-1">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="block text-[12px] font-semibold text-ink-2 mb-1">Branch</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <p className="text-[11.5px] text-muted">One report per branch per day. The branch&rsquo;s people then add their expenses into it.</p>
          {err && <p className="text-[12.5px] text-accent">{err}</p>}
          <button onClick={create} disabled={busy} className="h-11 rounded-md bg-accent text-white text-[14px] font-bold hover:brightness-90 disabled:opacity-50">Open report</button>
        </div>
      </div>
    </div>
  );
}
