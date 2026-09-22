'use client';

/* ============================================================================
   Correcting a chemical.

   A product enters the store by being bought, never by being typed — that rule
   is enforced in the API and nothing here loosens it. What this edits is the
   *description* of the thing on the shelf: what it is called, what it counts
   as, when to reorder it, and the pack it is usually bought in. None of that
   moves a single gram.

   Two fields are deliberately not editable, and both say why on screen rather
   than silently refusing:

     stock   moves only through the ledger — a purchase order in, an issue or
             a transfer out. A box that lets somebody type a new number is a
             box that lets somebody paper over a loss.

     unit    is the base every quantity ever recorded against this item is
             counted in. Changing it under existing stock would reinterpret
             all of them at once — 500 grams becoming 500 millilitres — so the
             server refuses once anything has moved, and so does this.
   ========================================================================== */

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import type { Item } from './move-dialog';

const CATS = ['Chemical', 'Equipment', 'Consumable'];

/* The units the API will actually accept. Anything outside this list is
   dropped by the server without complaint, so the field is only ever offered
   when it can be honoured — and the item's own unit is always in the list,
   because several were seeded outside it (nos, kg, blocks, sets). */
const BASE_UNITS = ['g', 'mg', 'ml', 'piece'];

const inputCls =
  'w-full h-11 lg:h-9 px-3 rounded border border-line text-[15px] lg:text-[13.5px] '
  + 'outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

export interface ItemDraft {
  name: string; cat: string; unit: string; reorder: string;
  lastPackUnit: string; lastPackSize: string; note: string;
}

export function toItemDraft(i: Item): ItemDraft {
  return {
    name: i.name || '', cat: i.cat || 'Chemical', unit: i.unit || 'ml',
    reorder: String(i.reorder ?? 0),
    lastPackUnit: i.lastPackUnit || '', lastPackSize: String(i.lastPackSize || 1),
    note: i.note || '',
  };
}

export default function ItemEditor({ item, moved, onClose, onSaved }: {
  item: Item;
  /** Whether any stock has ever moved. Locks the base unit, as the API does. */
  moved: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<ItemDraft>(() => toItemDraft(item));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));

  const unitLocked = moved || item.stock !== 0;
  const units = BASE_UNITS.includes(d.unit) ? BASE_UNITS : [d.unit, ...BASE_UNITS];

  async function save() {
    if (!d.name.trim()) { setErr('The name is required'); return; }
    setErr(''); setSaving(true);
    try {
      await api.patch('/inventory/' + item.id, {
        name: d.name.trim(),
        cat: d.cat,
        // Only sent when it can be honoured; the server drops it otherwise.
        ...(unitLocked ? {} : { unit: d.unit }),
        reorder: Math.max(0, Math.round(Number(d.reorder) || 0)),
        lastPackUnit: d.lastPackUnit.trim(),
        lastPackSize: Math.max(1, Math.round(Number(d.lastPackSize) || 1)),
        note: d.note,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally { setSaving(false); }
  }

  return (
    /* A sheet rising from the bottom on a phone, the desk's dialog above lg. */
    <div className="fixed inset-0 z-[80] flex items-end lg:items-start justify-center
      bg-navy/45 lg:overflow-y-auto lg:py-10"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full lg:w-[560px] lg:max-w-[94vw] bg-white rounded-t-[24px] lg:rounded-md
        shadow-pop lg:border border-line max-h-[92vh] lg:max-h-none flex flex-col lg:block">
        <div className="flex items-center justify-between px-5 h-[56px] lg:h-[52px]
          border-b border-line shrink-0">
          <h2 className="text-[16px] lg:text-[15px] font-bold lg:font-semibold truncate">
            Edit {item.name}
          </h2>
          <button onClick={onClose} aria-label="Close"
            className="w-9 h-9 -mr-2 flex items-center justify-center text-muted hover:text-navy shrink-0">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto lg:overflow-visible flex-1 min-h-0">
          {err && (
            <div className="mb-4 px-4 py-2.5 rounded border border-red-line bg-red-wash
              text-[13px] text-accent font-medium">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className={labelCls}>Name <span className="text-accent">*</span></span>
              <input className={inputCls} value={d.name}
                onChange={(e) => set('name', e.target.value)} />
            </label>

            <label className="block">
              <span className={labelCls}>Counts as</span>
              <select className={inputCls} value={d.cat}
                onChange={(e) => set('cat', e.target.value)}>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Reorder level ({item.unit})</span>
              <input type="number" min={0} className={inputCls} value={d.reorder}
                onChange={(e) => set('reorder', e.target.value)} />
            </label>

            <label className="block">
              <span className={labelCls}>Usually bought as</span>
              <input className={inputCls} value={d.lastPackUnit} placeholder="bottle, packet, box"
                onChange={(e) => set('lastPackUnit', e.target.value)} />
            </label>

            <label className="block">
              <span className={labelCls}>{item.unit} in one of those</span>
              <input type="number" min={1} className={inputCls} value={d.lastPackSize}
                onChange={(e) => set('lastPackSize', e.target.value)} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelCls}>Note</span>
              <input className={inputCls} value={d.note}
                placeholder="Dilution, where it is kept, what it is for…"
                onChange={(e) => set('note', e.target.value)} />
            </label>

            {/* The base unit, and why it is or is not yours to change. */}
            <label className="block sm:col-span-2">
              <span className={labelCls}>Counted in</span>
              {unitLocked ? (
                <>
                  <p className="h-11 lg:h-9 px-3 rounded border border-line bg-wash
                    flex items-center text-[15px] lg:text-[13.5px] text-muted">
                    {item.unit}
                  </p>
                  <p className="text-muted-2 text-[11.5px] mt-1.5 leading-relaxed">
                    Fixed now that stock has moved. Every quantity on every shelf and in
                    the whole movement history is counted in {item.unit}; changing it
                    would silently reinterpret all of them.
                  </p>
                </>
              ) : (
                <>
                  <select className={inputCls} value={d.unit}
                    onChange={(e) => set('unit', e.target.value)}>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <p className="text-muted-2 text-[11.5px] mt-1.5">
                    Changeable only while nothing has moved — which is now.
                  </p>
                </>
              )}
            </label>
          </div>

          <p className="mt-4 text-[12px] text-muted-2 leading-relaxed">
            Stock is not edited here. It moves by receiving a purchase order, issuing to
            a technician or transferring between branches, so the ledger and the shelf
            can never disagree.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 lg:px-5 pt-3 pb-3
          lg:h-[60px] lg:py-0 border-t border-line shrink-0
          pb-[calc(env(safe-area-inset-bottom)+12px)] lg:pb-0">
          <button onClick={onClose}
            className="max-lg:flex-1 h-12 lg:h-9 px-4 rounded-xl lg:rounded border border-line
              text-[15px] lg:text-[13px] font-bold lg:font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="max-lg:flex-1 flex items-center justify-center gap-1.5 h-12 lg:h-9 px-4
              rounded-xl lg:rounded bg-accent text-white text-[15px] lg:text-[13px] font-bold
              lg:font-semibold hover:brightness-90 disabled:opacity-60">
            <Icon name="check" size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
