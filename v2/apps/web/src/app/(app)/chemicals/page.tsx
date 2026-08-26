'use client';

/* ============================================================================
   Chemicals — the master list of everything we buy and issue.

   This page defines the *product*. It never touches stock: a chemical added
   here starts at zero and stays there until a purchase order is received. That
   split is the whole point — the catalogue is a decision, stock is a fact with
   a vendor and a document behind it.

   The base unit is the important field and the one people get wrong. It is the
   smallest unit the chemical is ever *issued* in, and it is frozen the moment
   anything moves: changing grams to millilitres under existing stock would
   silently reinterpret every number ever recorded against it.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import { Modal, Field, inputCls, selectCls } from '../jobs/ui';
import { ListScreen } from '@/components/mobile';

interface Chem {
  id: string; name: string; cat: string; unit: string; note: string;
  stock: number; reorder: number; onOrder: number;
  lastPackUnit: string; lastPackSize: number;
  branches: Array<{ branchId: string; qty: number }>;
}

interface Draft {
  name: string; cat: string; unit: string; reorder: number;
  lastPackUnit: string; lastPackSize: number; note: string;
}

const CATS = ['Chemical', 'Equipment', 'Consumable'];

const BASE_UNITS = [
  { v: 'ml', label: 'millilitres (ml)', hint: 'liquids — sprays, concentrates' },
  { v: 'g', label: 'grams (g)', hint: 'gels, powders, granules' },
  { v: 'mg', label: 'milligrams (mg)', hint: 'measured in very small doses' },
  { v: 'piece', label: 'pieces', hint: 'traps, blocks, kits' },
];

/** How each base unit is usually delivered, and how many base units a pack holds. */
const PACKS: Record<string, Array<{ v: string; size: number }>> = {
  ml: [{ v: 'ml', size: 1 }, { v: 'bottle', size: 500 }, { v: 'litre', size: 1000 }, { v: 'can', size: 5000 }],
  g: [{ v: 'g', size: 1 }, { v: 'packet', size: 500 }, { v: 'kg', size: 1000 }, { v: 'box', size: 5000 }],
  mg: [{ v: 'mg', size: 1 }, { v: 'sachet', size: 100 }, { v: 'g', size: 1000 }],
  piece: [{ v: 'piece', size: 1 }, { v: 'pair', size: 2 }, { v: 'box', size: 12 }],
};

function toDraft(c: Chem | null): Draft {
  return {
    name: c?.name || '', cat: c?.cat || 'Chemical', unit: c?.unit || 'ml',
    reorder: c?.reorder ?? 0,
    lastPackUnit: c?.lastPackUnit || 'litre',
    lastPackSize: c?.lastPackSize || 1000,
    note: c?.note || '',
  };
}

export default function Chemicals() {
  const router = useRouter();
  const [rows, setRows] = useState<Chem[] | null>(null);
  const pg = usePager(rows || []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Chem | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (cat) p.set('cat', cat);
    if (q) p.set('q', q);
    api.get<Chem[]>('/inventory?' + p.toString()).then(setRows).catch(() => setRows([]));
  }, [q, cat]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  function pickUnit(u: string) {
    const first = (PACKS[u] || [])[0];
    setDraft((d) => (d ? {
      ...d, unit: u,
      lastPackUnit: (PACKS[u] || [])[1]?.v || first?.v || u,
      lastPackSize: (PACKS[u] || [])[1]?.size || 1,
    } : d));
  }

  function pickPack(pu: string) {
    const known = (PACKS[draft?.unit || 'ml'] || []).find((p) => p.v === pu);
    setDraft((d) => (d ? { ...d, lastPackUnit: pu, lastPackSize: known ? known.size : d.lastPackSize } : d));
  }

  async function save() {
    if (!draft) return;
    setErr(''); setBusy(true);
    try {
      if (editing) await api.patch('/inventory/' + editing.id, draft);
      else await api.post('/inventory', draft);
      setDraft(null); setEditing(null); load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally { setBusy(false); }
  }

  async function remove(c: Chem) {
    setErr('');
    try { await api.del('/inventory/' + c.id); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not remove'); }
  }

  const unitOf = (u: string) => BASE_UNITS.find((x) => x.v === u);

  return (
    <>
      {/* What is on the shelf and what is running out. Editing a chemical is set-up work and stays on the desktop. */}
      <ListScreen
        title="Chemicals"
        loading={!rows}
        search={q}
        onSearch={setQ}
        rows={(rows || []).map((c) => ({
          id: c.id,
          title: c.name,
          right: c.stock + ' ' + c.unit,
          meta: [c.cat, c.onOrder ? c.onOrder + ' ' + c.unit + ' on order' : ''].filter(Boolean).join(' \u00b7 '),
          tone: (c.stock <= 0 ? 'bad' : c.stock < c.reorder ? 'warn' : 'good') as 'bad' | 'warn' | 'good',
          state: c.stock <= 0 ? 'Out of stock'
            : c.stock < c.reorder ? 'Below reorder level' : 'In stock',
        }))}
        empty="No chemicals yet"
        emptyHint="Add what you treat with, then they can be put on a purchase order."
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Chemicals</h1>
          {rows && <span className="text-muted-2 text-[12.5px]">{rows.length} in the list</span>}
        </div>
        <button onClick={() => { setDraft(toDraft(null)); setEditing(null); }}
          className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> Add chemical
        </button>
      </div>

      <div className="px-4 lg:px-6 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 lg:max-w-[320px] flex-1 h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search chemicals…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="h-10 lg:h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
          <option value="">All categories</option>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="mx-4 lg:mx-6 mt-3 rounded border border-line bg-wash px-4 py-2.5">
        <p className="text-[12.5px] text-ink-2">
          This is the list a purchase order chooses from. Adding a chemical here does not
          add any stock — <b>stock only arrives by receiving a purchase order</b>.
        </p>
      </div>

      {err && !draft && <p className="px-4 lg:px-6 py-2 text-[12.5px] text-accent">{err}</p>}

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">Nothing in the list yet</p>
          <p className="text-muted text-[13px] mt-1">
            Add the chemicals you buy — then order them from a vendor.
          </p>
        </div>
      ) : (
        <>
          <div className="lg:hidden flex flex-col gap-2.5 p-3">
            {pg.pageRows.map((c) => (
              <div key={c.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-navy truncate">{c.name}</span>
                    <span className="block text-[12px] text-muted">
                      {c.cat} · counted in {c.unit}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-[12.5px]">
                  <span><b>{c.stock.toLocaleString('en-IN')}</b> {c.unit} in hand</span>
                  {c.onOrder > 0 && (
                    <span className="text-navy font-semibold">+{c.onOrder.toLocaleString('en-IN')} coming</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-line-soft">
                  <button onClick={() => router.push('/purchase-orders/new')}
                    className="flex-1 h-10 rounded bg-navy text-white text-[12.5px] font-semibold">
                    Order this
                  </button>
                  <button onClick={() => { setDraft(toDraft(c)); setEditing(c); }}
                    className="h-10 px-4 rounded border border-line text-[12.5px] font-semibold">
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          <table className="ztable max-lg:hidden mt-3">
            <thead>
              <tr>
                <th>Chemical</th><th>Category</th><th>Counted in</th>
                <th>Usually bought as</th><th className="text-right">In hand</th>
                <th className="text-right">On order</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pg.pageRows.map((c) => (
                <tr key={c.id} className="zrow">
                  <td onClick={() => { setDraft(toDraft(c)); setEditing(c); }}>
                    <span className="block font-semibold text-navy">{c.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {c.id}{c.note ? ' · ' + c.note : ''}
                    </span>
                  </td>
                  <td>{c.cat}</td>
                  <td>
                    <span className="font-medium">{c.unit}</span>
                    <span className="block text-[11px] text-muted-2">{unitOf(c.unit)?.hint || ''}</span>
                  </td>
                  <td className="text-[12.5px]">
                    {c.lastPackUnit
                      ? <>{c.lastPackUnit} of {c.lastPackSize.toLocaleString('en-IN')} {c.unit}</>
                      : <span className="text-muted-2">—</span>}
                  </td>
                  <td className="text-right font-semibold">
                    {c.stock.toLocaleString('en-IN')} <span className="text-muted font-normal">{c.unit}</span>
                  </td>
                  <td className="text-right">
                    {c.onOrder > 0
                      ? <span className="font-semibold text-navy">{c.onOrder.toLocaleString('en-IN')}</span>
                      : <span className="text-muted-2">—</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => router.push('/purchase-orders/new')}
                      className="h-7 px-2.5 rounded bg-navy text-white text-[11.5px] font-semibold hover:brightness-110">
                      Order
                    </button>
                    {c.stock === 0 && c.onOrder === 0 && (
                      <button onClick={() => remove(c)} title="Remove from the list"
                        className="ml-1.5 h-7 px-2 rounded border border-line text-[11.5px] text-muted hover:text-accent">
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        {pg.el}
        </>
      )}

      {draft && (
        <Modal title={editing ? 'Edit chemical' : 'Add chemical'}
          sub={editing ? editing.id + ' · ' + editing.stock.toLocaleString('en-IN') + ' ' + editing.unit + ' in hand' : 'It starts at zero — stock comes from a purchase order'}
          onClose={() => { setDraft(null); setEditing(null); setErr(''); }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Name" required>
                <input value={draft.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="Fipronil 2.92% SC" className={inputCls} autoFocus />
              </Field>
            </div>
            <Field label="Category">
              <select value={draft.cat} onChange={(e) => set('cat', e.target.value)} className={selectCls}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Counted in" required>
              <select value={draft.unit} onChange={(e) => pickUnit(e.target.value)}
                disabled={!!editing && (editing.stock !== 0)} className={selectCls}>
                {BASE_UNITS.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2 -mt-1">
              <p className="text-[11.5px] text-muted">
                The smallest unit you ever issue it in — a technician is given{' '}
                <b>{draft.unit}</b>, and every record uses that.
                {editing && editing.stock !== 0 && (
                  <> This cannot change now: there is stock counted in {editing.unit}.</>
                )}
              </p>
            </div>

            <Field label="Usually bought as">
              <select value={draft.lastPackUnit} onChange={(e) => pickPack(e.target.value)} className={selectCls}>
                {(PACKS[draft.unit] || []).map((p) => <option key={p.v} value={p.v}>{p.v}</option>)}
                {!(PACKS[draft.unit] || []).some((p) => p.v === draft.lastPackUnit) && (
                  <option value={draft.lastPackUnit}>{draft.lastPackUnit}</option>
                )}
              </select>
            </Field>
            <Field label={'Each holds (' + draft.unit + ')'}>
              <input type="number" min={1} value={draft.lastPackSize}
                onChange={(e) => set('lastPackSize', Math.max(1, Number(e.target.value) || 1))}
                className={inputCls} />
            </Field>
            <div className="sm:col-span-2 -mt-1">
              <p className="text-[11.5px] text-muted">
                Only a default — it fills in the purchase order, which can still say
                otherwise. One <b>{draft.lastPackUnit}</b> ={' '}
                <b>{draft.lastPackSize.toLocaleString('en-IN')} {draft.unit}</b>.
              </p>
            </div>

            <Field label={'Reorder level (' + draft.unit + ')'}>
              <input type="number" min={0} value={draft.reorder}
                onChange={(e) => set('reorder', Math.max(0, Number(e.target.value) || 0))}
                className={inputCls} />
            </Field>
            <Field label="Note">
              <input value={draft.note} onChange={(e) => set('note', e.target.value)}
                placeholder="Active ingredient, what it treats…" className={inputCls} />
            </Field>
          </div>

          {err && <p className="mt-3 text-[12.5px] text-accent">{err}</p>}

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => { setDraft(null); setEditing(null); setErr(''); }}
              className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
              Cancel
            </button>
            <button onClick={save} disabled={busy || !draft.name.trim()}
              className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save' : 'Add chemical'}
            </button>
          </div>
        </Modal>
      )}
    </div>
    </>
  );
}
