'use client';

/* ============================================================================
   Expense categories — master data.

   The list the Add-Expense form offers. It started as ten names in the code;
   now the office owns it: add one, rename one (every expense under it
   follows), or take one off the form without losing the history filed under
   it. "Others…" on the form adds to this list too.

   Each category is a card: its name in full, its code, whether the form
   offers it, and what has been filed under it (how many expenses, how much,
   the latest). Adding and renaming happen in a sheet - the + button, or
   Rename on a card - not in a box that sat open at the top of the page.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar, Fab, SearchBox, fullDate } from '@/components/mobile';
import { catIcon, type Category } from '../expenses/ui';

type Row = Category & { count?: number; total?: number; last?: string };

export default function ExpenseCategoriesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  // The sheet: adding a new one, or renaming one.
  const [sheet, setSheet] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.get<{ rows: Row[] }>('/expenses/categories').then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setErr('');
    try { await fn(); load(); setBusy(false); return true; } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
      setBusy(false); return false;
    }
  }
  async function save() {
    if (!sheet) return;
    const name = sheet.name.trim();
    if (!name) { setErr('Give the category a name'); return; }
    const ok = await act(() => sheet.id
      ? api.patch('/expenses/categories/' + sheet.id, { name })
      : api.post('/expenses/categories', { name }));
    if (ok) setSheet(null);
  }
  const toggle = (c: Row) => act(() => api.patch('/expenses/categories/' + c.id, { active: !c.active }));

  const needle = q.trim().toLowerCase();
  const match = (c: Row) => !needle || (c.name + ' ' + c.id).toLowerCase().includes(needle);
  const live = useMemo(() => (rows || []).filter((c) => c.active && match(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, needle]);
  const off = useMemo(() => (rows || []).filter((c) => !c.active && match(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, needle]);
  const onForm = (rows || []).filter((c) => c.active).length;
  const hidden = (rows || []).length - onForm;

  return (
    <div className="lg:p-6 max-w-[980px] max-lg:bg-ground max-lg:min-h-full max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <BackBar title="Expense categories" sub={rows ? onForm + ' on the form · ' + hidden + ' hidden' : undefined}
        fallback="/expenses" />
      <div className="lg:hidden">
        <SearchBox value={q} onChange={setQ} placeholder="Search a category" />
        <div className="h-2.5 bg-white border-b border-line" />
      </div>

      {/* desk header */}
      <div className="max-lg:hidden flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense categories</h1>
          <p className="text-muted text-[13px] mt-0.5">
            What the Add-Expense form offers. Anything typed under &ldquo;Others&rdquo; lands here too.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 h-9 w-[240px] px-3 rounded-lg border border-line bg-wash focus-within:bg-white">
            <Icon name="search" size={14} className="text-muted-2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a category"
              className="flex-1 bg-transparent outline-none text-[13px]" />
          </label>
          <button onClick={() => { setErr(''); setSheet({ id: '', name: '' }); }}
            className="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold hover:brightness-90 inline-flex items-center gap-1.5">
            <Icon name="plus" size={14} /> Add category
          </button>
        </div>
      </div>

      <div className="max-lg:px-4 max-lg:pt-3">
        {err && !sheet && <p className="text-sm text-accent mb-3">{err}</p>}
        {!rows ? (
          <div className="grid lg:grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[112px] rounded-xl bg-white animate-pulse" />)}
          </div>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted px-1 mb-2">
              On the form · {live.length}
            </p>
            {live.length === 0 ? (
              <div className="row-card text-center py-8 mb-4">
                <p className="text-base font-bold">{needle ? 'Nothing matches' : 'No categories on the form'}</p>
                <p className="text-sm text-muted mt-1">{needle ? 'Try another word.' : 'Add one with the + button.'}</p>
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-2.5 mb-5">
                {live.map((c) => (
                  <CategoryCard key={c.id} c={c} busy={busy}
                    onRename={() => { setErr(''); setSheet({ id: c.id, name: c.name }); }}
                    onToggle={() => toggle(c)} />
                ))}
              </div>
            )}

            {off.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted px-1 mb-2">
                  Hidden from the form · {off.length}
                </p>
                <div className="grid lg:grid-cols-2 gap-2.5 mb-4">
                  {off.map((c) => (
                    <CategoryCard key={c.id} c={c} busy={busy}
                      onRename={() => { setErr(''); setSheet({ id: c.id, name: c.name }); }}
                      onToggle={() => toggle(c)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Fab onClick={() => { setErr(''); setSheet({ id: '', name: '' }); }} label="Add category" />

      {/* --------------------------------------------- add / rename sheet */}
      {sheet && (
        <div className="fixed inset-0 z-[80] bg-navy/45 flex items-end lg:items-center lg:justify-center"
          onClick={() => !busy && setSheet(null)}>
          <div className="w-full lg:max-w-[420px] bg-white rounded-t-[22px] lg:rounded-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] lg:pb-4"
            onClick={(e) => e.stopPropagation()}>
            <span className="lg:hidden block w-10 h-1 rounded-full bg-line mx-auto mb-3" />
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-rose text-rose-ink flex items-center justify-center shrink-0">
                <Icon name={catIcon(sheet.name || 'Other')} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold">{sheet.id ? 'Rename category' : 'New category'}</p>
                <p className="text-xs text-muted">
                  {sheet.id ? 'Every expense filed under it moves to the new name.' : 'It appears on the Add-Expense form straight away.'}
                </p>
              </div>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-ink-2 mb-1.5">Category name</span>
              <input value={sheet.name} autoFocus maxLength={40}
                onChange={(e) => setSheet({ ...sheet, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setSheet(null); }}
                placeholder="e.g. Cab fare, Printing, Courier"
                className="w-full h-[42px] px-3 rounded-lg border border-line bg-wash text-sm outline-none focus:border-accent focus:bg-white" />
              <span className="block text-right text-xs text-muted-2 mt-1">{sheet.name.length}/40</span>
            </label>
            {err && <p className="text-sm text-accent mt-1">{err}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setSheet(null)} disabled={busy}
                className="flex-1 h-[42px] rounded-lg border border-line text-sm font-semibold active:bg-wash">Cancel</button>
              <button type="button" onClick={save} disabled={busy || !sheet.name.trim()}
                className="flex-1 h-[42px] rounded-lg bg-accent text-white text-sm font-bold disabled:opacity-50">
                {busy ? 'Saving…' : sheet.id ? 'Save name' : 'Add category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ c, busy, onRename, onToggle }: {
  c: Row; busy: boolean; onRename: () => void; onToggle: () => void;
}) {
  return (
    <div data-row-card
      className={'rounded-xl bg-white border border-[#cfd4de] overflow-hidden '
        + 'shadow-[0_1px_3px_rgba(20,20,20,0.08),0_4px_12px_rgba(20,20,20,0.08)] '
        + (c.active ? '' : 'opacity-75')}>
      <div className="px-3.5 pt-3 pb-2.5 flex items-start gap-3">
        <span className={'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 '
          + (c.active ? 'bg-rose text-rose-ink' : 'bg-wash text-muted')}>
          <Icon name={catIcon(c.name)} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="flex-1 min-w-0 text-base font-bold truncate">{c.name}</p>
            <span className={'shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-xs font-semibold '
              + (c.active ? 'bg-mint text-mint-ink' : 'bg-wash text-muted')}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{c.active ? 'On the form' : 'Hidden'}
            </span>
          </div>
          <p className="text-sm text-ink-2 truncate mt-0.5">
            {c.count ? c.count + (c.count === 1 ? ' expense' : ' expenses') + ' · ' + money(c.total || 0) : 'Nothing filed under it yet'}
          </p>
          <p className="text-xs text-muted truncate mt-0.5">
            {c.last ? 'Latest ' + fullDate(c.last) : 'No expenses yet'}
          </p>
        </div>
      </div>
      <div className="px-3.5 py-2 border-t border-line-soft bg-[#fafbfc] flex items-center gap-2">
        <span className="flex-1 text-xs font-mono text-muted-2">{c.id}</span>
        <button type="button" onClick={onRename} disabled={busy}
          className="h-[28px] px-3 rounded-md border border-line bg-white text-xs font-semibold active:bg-wash inline-flex items-center gap-1">
          <Icon name="edit" size={12} /> Rename
        </button>
        <button type="button" onClick={onToggle} disabled={busy}
          className={'h-[28px] px-3 rounded-md text-xs font-semibold inline-flex items-center '
            + (c.active ? 'border border-line bg-white text-muted active:bg-wash' : 'bg-accent text-white')}>
          {c.active ? 'Hide' : 'Show again'}
        </button>
      </div>
    </div>
  );
}
