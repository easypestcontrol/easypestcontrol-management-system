'use client';

/* ============================================================================
   Expense categories — master data.

   The list the Add-Expense form offers. It started as ten names in the code;
   now the office owns it: add one, rename one (every expense under it
   follows), or take one off the form without losing the history filed under
   it. "Others…" on the form adds to this list too.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { catIcon, inputCls, type Category } from '../expenses/ui';

export default function ExpenseCategoriesPage() {
  const [rows, setRows] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.get<{ rows: Category[] }>('/expenses/categories').then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }
  const add = () => { if (!name.trim()) return; act(async () => { await api.post('/expenses/categories', { name: name.trim() }); setName(''); }); };
  const rename = () => { if (!editing || !editing.name.trim()) return; act(async () => { await api.patch('/expenses/categories/' + editing.id, { name: editing.name.trim() }); setEditing(null); }); };
  const toggle = (c: Category) => act(() => api.patch('/expenses/categories/' + c.id, { active: !c.active }));

  const live = (rows || []).filter((c) => c.active);
  const off = (rows || []).filter((c) => !c.active);

  return (
    <div className="p-4 lg:p-6 max-w-[760px] max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <div className="mb-4">
        <h1 className="text-[17px] lg:text-2xl font-bold tracking-tight">Expense categories</h1>
        <p className="text-muted text-[13px] mt-0.5">What the Add-Expense form offers. Anything typed under &ldquo;Others&rdquo; lands here too.</p>
      </div>

      <div className="card p-4 mb-4">
        <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Add a category</label>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="e.g. Cab fare, Printing, Courier" className={inputCls} />
          <button onClick={add} disabled={busy || !name.trim()}
            className="h-12 lg:h-10 px-4 rounded-xl lg:rounded-lg bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50 shrink-0">Add</button>
        </div>
        {err && <p className="text-[12.5px] text-accent mt-2">{err}</p>}
      </div>

      {!rows ? <div className="text-muted text-[13px]">Loading…</div> : (
        <>
          <div className="card divide-y divide-line-soft mb-4">
            {live.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-9 h-9 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0"><Icon name={catIcon(c.name)} size={16} /></span>
                {editing?.id === c.id ? (
                  <>
                    <input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} autoFocus maxLength={40}
                      onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
                      className={inputCls + ' flex-1'} />
                    <button onClick={rename} disabled={busy} className="h-9 px-3 rounded bg-accent text-white text-[12.5px] font-semibold">Save</button>
                    <button onClick={() => setEditing(null)} className="h-9 px-3 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 text-[13.5px] font-medium truncate">{c.name}</span>
                    <span className="text-[11px] text-muted-2">{c.id}</span>
                    <button onClick={() => setEditing({ id: c.id, name: c.name })} className="h-8 px-2.5 rounded border border-line text-[12px] font-semibold hover:bg-wash">Rename</button>
                    <button onClick={() => toggle(c)} disabled={busy} className="h-8 px-2.5 rounded border border-line text-[12px] font-semibold text-muted hover:bg-wash">Hide</button>
                  </>
                )}
              </div>
            ))}
            {live.length === 0 && <p className="px-4 py-8 text-center text-muted text-[13px]">No categories on the form.</p>}
          </div>

          {off.length > 0 && (
            <>
              <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-muted-2 mb-2">Hidden from the form</h2>
              <div className="card divide-y divide-line-soft">
                {off.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-muted">
                    <span className="w-9 h-9 rounded-lg bg-wash flex items-center justify-center shrink-0"><Icon name={catIcon(c.name)} size={16} /></span>
                    <span className="flex-1 min-w-0 text-[13.5px] truncate">{c.name}</span>
                    <button onClick={() => toggle(c)} disabled={busy} className="h-8 px-2.5 rounded border border-line text-[12px] font-semibold hover:bg-wash">Show again</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
