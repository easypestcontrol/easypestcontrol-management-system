'use client';

/* ============================================================================
   Vendors — who we buy from.

   The list is deliberately about money rather than addresses: what has been
   received from each vendor, and what is still on its way. That is the question
   someone actually opens this screen to answer.

   Clicking a vendor opens them; the primary action there is raising an order,
   which is the "click the vendor and buy from him" the whole module exists for.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import { Modal, Field, inputCls, selectCls } from '../jobs/ui';

interface Vendor {
  id: string; name: string; gstin: string; contact: string; phone: string;
  email: string; addr: string; city: string; state: string; pincode: string;
  terms: string; cat: string; note: string; active: boolean;
  received: number; open: number; orders: number;
}

interface Draft {
  name: string; gstin: string; contact: string; phone: string; email: string;
  addr: string; city: string; state: string; pincode: string;
  terms: string; cat: string; note: string; active: boolean;
}

const CATS = ['Chemical', 'Equipment', 'Consumable', 'Mixed'];
const TERMS = ['Advance', 'On delivery', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

function toDraft(v: Vendor | null): Draft {
  return {
    name: v?.name || '', gstin: v?.gstin || '', contact: v?.contact || '',
    phone: v?.phone || '', email: v?.email || '', addr: v?.addr || '',
    city: v?.city || '', state: v?.state || 'Tamil Nadu', pincode: v?.pincode || '',
    terms: v?.terms || 'Net 30', cat: v?.cat || 'Chemical', note: v?.note || '',
    active: v ? v.active : true,
  };
}

export default function Vendors() {
  const router = useRouter();
  const [rows, setRows] = useState<Vendor[] | null>(null);
  const pg = usePager(rows || []);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<Vendor[]>('/vendors' + (q ? '?q=' + encodeURIComponent(q) : ''))
      .then(setRows).catch(() => setRows([]));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft) return;
    setErr(''); setBusy(true);
    try {
      if (editing) await api.patch('/vendors/' + editing, draft);
      else await api.post('/vendors', draft);
      setDraft(null); setEditing(''); load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally { setBusy(false); }
  }

  async function remove(v: Vendor) {
    setErr('');
    try { await api.del('/vendors/' + v.id); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not remove'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Vendors</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {rows.length} · {rows.reduce((a, v) => a + v.open, 0)} packs on order
            </span>
          )}
        </div>
        <button onClick={() => { setDraft(toDraft(null)); setEditing(''); }}
          className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> New vendor
        </button>
      </div>

      <div className="px-4 lg:px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 lg:max-w-[340px] h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, city, GSTIN or contact…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {err && !draft && <p className="px-4 lg:px-6 py-2 text-[12.5px] text-accent">{err}</p>}

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No vendors yet</p>
          <p className="text-muted text-[13px] mt-1">
            Add the people you buy chemicals from — stock can only come in against one.
          </p>
        </div>
      ) : (
        <>
          {/* phones get cards; a desk gets the table */}
          <div className="lg:hidden flex flex-col gap-2.5 p-3">
            {pg.pageRows.map((v) => (
              <div key={v.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-navy truncate">{v.name}</span>
                    <span className="block text-[12px] text-muted">
                      {[v.city, v.cat].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  {!v.active && <span className="zpill">Inactive</span>}
                </div>
                <div className="flex items-center gap-4 mt-3 text-[12px]">
                  <span><b>{v.received}</b> <span className="text-muted">packs received</span></span>
                  {v.open > 0 && <span className="text-accent font-semibold">{v.open} on order</span>}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-line-soft">
                  <button onClick={() => router.push('/purchase-orders/new?vendor=' + v.id)}
                    className="flex-1 h-10 rounded bg-navy text-white text-[12.5px] font-semibold">
                    New order
                  </button>
                  <button onClick={() => { setDraft(toDraft(v)); setEditing(v.id); }}
                    className="h-10 px-4 rounded border border-line text-[12.5px] font-semibold">
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          <table className="ztable max-lg:hidden">
            <thead>
              <tr>
                <th>Vendor</th><th>Contact</th><th>GSTIN</th><th>Terms</th>
                <th className="text-right">Packs received</th><th className="text-right">On order</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pg.pageRows.map((v) => (
                <tr key={v.id} className="zrow">
                  <td onClick={() => { setDraft(toDraft(v)); setEditing(v.id); }}>
                    <span className="block font-semibold text-navy">{v.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {[v.city, v.cat].filter(Boolean).join(' · ') || '—'}
                      {!v.active && ' · inactive'}
                    </span>
                  </td>
                  <td>
                    <span className="block">{v.contact || '—'}</span>
                    <span className="block text-[11.5px] text-muted">{v.phone}</span>
                  </td>
                  <td className="font-mono text-[11.5px]">{v.gstin || '—'}</td>
                  <td>{v.terms || '—'}</td>
                  <td className="text-right font-medium">{v.received || '—'}</td>
                  <td className="text-right">
                    {v.open > 0
                      ? <span className="font-semibold text-accent">{v.open}</span>
                      : <span className="text-muted-2">—</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => router.push('/purchase-orders/new?vendor=' + v.id)}
                      className="h-7 px-2.5 rounded bg-navy text-white text-[11.5px] font-semibold hover:brightness-110">
                      New order
                    </button>
                    {v.orders === 0 && (
                      <button onClick={() => remove(v)} title="Remove"
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
        <Modal title={editing ? 'Edit vendor' : 'New vendor'}
          sub={editing || 'Who we buy from'}
          onClose={() => { setDraft(null); setEditing(''); setErr(''); }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Vendor name" required>
                <input value={draft.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="Bayer Environmental Science" className={inputCls} autoFocus />
              </Field>
            </div>
            <Field label="Contact person">
              <input value={draft.contact} onChange={(e) => set('contact', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input value={draft.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
            </Field>
            <Field label="GSTIN">
              <input value={draft.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())}
                placeholder="33AABCB1234C1Z5" className={inputCls + ' font-mono'} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <input value={draft.addr} onChange={(e) => set('addr', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="City">
              <input value={draft.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
            </Field>
            <Field label="State">
              {/* The state decides CGST/SGST versus IGST on every order raised. */}
              <input value={draft.state} onChange={(e) => set('state', e.target.value)}
                placeholder="Tamil Nadu" className={inputCls} />
            </Field>
            <Field label="Payment terms">
              <select value={draft.terms} onChange={(e) => set('terms', e.target.value)} className={selectCls}>
                {TERMS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="They mainly supply">
              <select value={draft.cat} onChange={(e) => set('cat', e.target.value)} className={selectCls}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note">
                <input value={draft.note} onChange={(e) => set('note', e.target.value)}
                  placeholder="Delivery lead time, minimum order, who to chase…" className={inputCls} />
              </Field>
            </div>
            {editing && (
              <label className="sm:col-span-2 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={draft.active}
                  onChange={(e) => set('active', e.target.checked)} />
                Still buying from them
              </label>
            )}
          </div>

          {err && <p className="mt-3 text-[12.5px] text-accent">{err}</p>}

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => { setDraft(null); setEditing(''); setErr(''); }}
              className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
              Cancel
            </button>
            <button onClick={save} disabled={busy || !draft.name.trim()}
              className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save vendor' : 'Add vendor'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
