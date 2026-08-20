'use client';

/* ============================================================================
   The purchase order form.

   Same anatomy as the quotation builder, pointed the other way — here we are
   the customer. Two deliberate differences:

   **No money.** An order says what we want and how much of it. What it costs is
   whatever the vendor invoices, and a price typed in at ordering time is a
   number nobody checked.

   **Products come from the chemical list**, not from typing. That list is
   master data; the order picks from it. Anything else and "Deltamethrin 2.5%",
   "Deltamethrin 2.5 WP" and "deltamethrin" end up as three products with a
   third of the stock each.

   What the line adds is the pack arithmetic, and it is spelled out as you type:

     you order    10 packets of 500 ml
     you receive             5,000 ml
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { inputCls, selectCls, Field } from '../jobs/ui';

export interface PoLine {
  id?: number;
  itemId: string;
  name?: string;
  baseUnit?: string;
  packUnit: string;
  packSize: number;
  qty: number;
  receivedQty?: number;
}

export interface PoDraft {
  vendorId: string;
  date: string;
  expected: string;
  branch: string;
  notes: string;
  items: PoLine[];
}

interface VendorLite { id: string; name: string; state: string; gstin: string; terms: string }
interface BranchLite { id: string; name: string }
interface ItemLite {
  id: string; name: string; cat: string; unit: string; stock: number;
  onOrder: number; lastPackUnit: string; lastPackSize: number;
}

/** How each base unit is usually delivered, and what one pack holds. */
const PACKS: Record<string, Array<{ v: string; size: number }>> = {
  ml: [{ v: 'ml', size: 1 }, { v: 'bottle', size: 500 }, { v: 'litre', size: 1000 }, { v: 'can', size: 5000 }],
  g: [{ v: 'g', size: 1 }, { v: 'packet', size: 500 }, { v: 'kg', size: 1000 }, { v: 'box', size: 5000 }],
  mg: [{ v: 'mg', size: 1 }, { v: 'sachet', size: 100 }, { v: 'g', size: 1000 }],
  piece: [{ v: 'piece', size: 1 }, { v: 'pair', size: 2 }, { v: 'box', size: 12 }],
};

export function blankLine(): PoLine {
  return { itemId: '', packUnit: '', packSize: 1, qty: 1 };
}

export default function PoBuilder({ initial, poId, onSaved }: {
  initial: PoDraft;
  /** Present when editing an existing draft. */
  poId?: string;
  onSaved: (id: string) => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<PoDraft>(initial);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<VendorLite[]>('/vendors').then(setVendors).catch(() => {});
    api.get<BranchLite[]>('/branches').then(setBranches).catch(() => {});
    api.get<ItemLite[]>('/inventory').then(setItems).catch(() => {});
  }, []);

  const set = <K extends keyof PoDraft>(k: K, v: PoDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  function setLine(i: number, patch: Partial<PoLine>) {
    setD((x) => ({ ...x, items: x.items.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  }

  const itemOf = (id: string) => items.find((x) => x.id === id);

  /** Choosing a chemical brings its unit and how it was last bought. */
  function pickItem(i: number, itemId: string) {
    const it = itemOf(itemId);
    if (!it) { setLine(i, { itemId: '', packUnit: '', packSize: 1 }); return; }
    setLine(i, {
      itemId: it.id,
      name: it.name,
      baseUnit: it.unit,
      packUnit: it.lastPackUnit || it.unit,
      packSize: it.lastPackSize || 1,
    });
  }

  function pickPack(i: number, packUnit: string) {
    const l = d.items[i];
    const base = itemOf(l.itemId)?.unit || 'ml';
    const known = (PACKS[base] || []).find((p) => p.v === packUnit);
    setLine(i, { packUnit, packSize: known ? known.size : l.packSize });
  }

  const vendor = vendors.find((v) => v.id === d.vendorId);
  const chosen = new Set(d.items.map((l) => l.itemId).filter(Boolean));

  async function save(thenPlace: boolean) {
    setErr(''); setBusy(true);
    try {
      const body = {
        ...d,
        items: d.items.map((l) => ({
          itemId: l.itemId, packUnit: l.packUnit, packSize: l.packSize, qty: l.qty,
        })),
      };
      const saved = poId
        ? await api.patch<{ id: string }>('/purchase-orders/' + poId, body)
        : await api.post<{ id: string }>('/purchase-orders', body);
      if (thenPlace) await api.post('/purchase-orders/' + saved.id + '/place', {});
      onSaved(saved.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save this order');
    } finally { setBusy(false); }
  }

  const blocker = !d.vendorId
    ? 'Choose the vendor you are buying from'
    : !d.branch ? 'Choose the branch this order ships to'
    : !d.items.length ? 'Add at least one line'
    : d.items.some((l) => !l.itemId) ? 'Every line needs a chemical'
    : '';

  return (
    <div className="p-4 lg:p-6 max-w-[1000px] flex flex-col gap-4">
      {/* ------------------------------------------------------- the header */}
      <section className="rounded-xl border border-line bg-white shadow-card p-4 lg:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Field label="Vendor" required>
              <select value={d.vendorId} onChange={(e) => set('vendorId', e.target.value)}
                className={selectCls}>
                <option value="">Choose a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Order date">
            <input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Expected delivery">
            <input type="date" value={d.expected} onChange={(e) => set('expected', e.target.value)} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Ship to branch" required>
              {/* Not documentation — this decides which shelf the goods land on. */}
              <select value={d.branch} onChange={(e) => set('branch', e.target.value)} className={selectCls}>
                <option value="">Choose a branch…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
        {vendor && (
          <p className="mt-3 text-[12px] text-muted">
            {vendor.gstin && <>GSTIN {vendor.gstin} · </>}
            {[vendor.state, vendor.terms].filter(Boolean).join(' · ') || 'no terms set'}
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- the lines */}
      <section className="rounded-xl border border-line bg-white shadow-card overflow-hidden">
        <header className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-bold">What we are buying</h2>
          <button onClick={() => setD((x) => ({ ...x, items: [...x.items, blankLine()] }))}
            className="flex items-center gap-1.5 h-9 px-3 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            <Icon name="plus" size={13} /> Add line
          </button>
        </header>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-medium">No chemicals in the list yet</p>
            <p className="text-[12.5px] text-muted mt-1">
              An order can only contain chemicals from master data.
            </p>
            <Link href="/chemicals"
              className="inline-flex items-center gap-1.5 h-10 px-4 mt-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
              <Icon name="plus" size={13} /> Add chemicals
            </Link>
          </div>
        ) : d.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-muted">
            Nothing on this order yet. Add a line.
          </p>
        ) : (
          <div className="divide-y divide-line-soft">
            {d.items.map((l, i) => {
              const it = itemOf(l.itemId);
              const base = it?.unit || '';
              const total = l.qty * l.packSize;
              return (
                <div key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                      Line {i + 1}
                    </span>
                    <button onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, n) => n !== i) }))}
                      className="text-muted-2 hover:text-accent" title="Remove line">
                      <Icon name="x" size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
                    <div className="col-span-2 lg:col-span-5">
                      <Field label="Chemical" required>
                        <select value={l.itemId} onChange={(e) => pickItem(i, e.target.value)} className={selectCls}>
                          <option value="">Choose a chemical…</option>
                          {items
                            .filter((x) => x.id === l.itemId || !chosen.has(x.id))
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name} — {x.stock.toLocaleString('en-IN')} {x.unit} in hand
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>

                    <div className="lg:col-span-2">
                      <Field label="How many">
                        <input type="number" min={1} value={l.qty}
                          onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className={inputCls} />
                      </Field>
                    </div>
                    <div className="lg:col-span-2">
                      <Field label="Pack">
                        <select value={l.packUnit} onChange={(e) => pickPack(i, e.target.value)}
                          disabled={!it} className={selectCls}>
                          {(PACKS[base] || []).map((p) => <option key={p.v} value={p.v}>{p.v}</option>)}
                          {l.packUnit && !(PACKS[base] || []).some((p) => p.v === l.packUnit) && (
                            <option value={l.packUnit}>{l.packUnit}</option>
                          )}
                        </select>
                      </Field>
                    </div>
                    <div className="lg:col-span-3">
                      <Field label={base ? 'Each holds (' + base + ')' : 'Each holds'}>
                        <input type="number" min={1} value={l.packSize} disabled={!it}
                          onChange={(e) => setLine(i, { packSize: Math.max(1, Number(e.target.value) || 1) })}
                          className={inputCls} />
                      </Field>
                    </div>
                  </div>

                  {it && (
                    /* The arithmetic, spelled out. A number you cannot check is a
                       number you will eventually get wrong. */
                    <p className="mt-3 text-[13px] text-ink-2">
                      <b>{l.qty}</b> {l.packUnit} × {l.packSize.toLocaleString('en-IN')} {base}
                      {' = '}
                      <b className="text-navy">{total.toLocaleString('en-IN')} {base}</b>
                      {' '}into {branches.find((b) => b.id === d.branch)?.name || 'the branch'} when received
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- the notes */}
      <section className="rounded-xl border border-line bg-white shadow-card p-4 lg:p-5">
        <Field label="Notes for the vendor">
          <textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
            placeholder="Delivery instructions, reference numbers…"
            className="w-full px-3 py-2 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white resize-none" />
        </Field>
        <p className="mt-2 text-[11.5px] text-muted">
          No prices on a purchase order — this says what we want and how much. What it
          costs is whatever the vendor invoices.
        </p>
      </section>

      {err && <p className="text-[12.5px] text-accent">{err}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => router.back()}
          className="h-11 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
          Cancel
        </button>
        <span className="flex-1" />
        <button onClick={() => save(false)} disabled={busy || !d.vendorId}
          className="h-11 px-4 rounded border border-navy text-navy text-[13px] font-semibold hover:bg-wash disabled:opacity-50">
          Save draft
        </button>
        <button onClick={() => save(true)} disabled={busy || !!blocker}
          className="h-11 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
          {busy ? 'Working…' : 'Place order'}
        </button>
      </div>
      {blocker && <p className="text-[11.5px] text-muted text-right -mt-2">{blocker}</p>}
    </div>
  );
}
