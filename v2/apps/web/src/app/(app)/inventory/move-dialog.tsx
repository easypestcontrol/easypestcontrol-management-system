'use client';

/* Shared inventory bits: the item/move types, the stock math from v1, and the
   two dialogs (stock in / issue out, add item) used by the list and detail
   pages. v1 source: assets/js/views/inventory.js. */

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { isFieldTech } from 'shared';

export interface Item {
  id: string; name: string; cat: string; unit: string;
  /** Total across every branch. `branches` is the split behind it. */
  stock: number; reorder: number; note: string;
  onOrder: number;
  branches: Array<{ branchId: string; qty: number; reorder: number }>;
  lastRate: number; lastPackUnit: string; lastPackSize: number;
}

export interface Move {
  id: number; itemId: string; date: string; qty: number;
  dir: string; jobId: string; note: string;
  branchId: string; poId: string;
  /** Filled by the item endpoint, which resolves the names. */
  branchName?: string; vendor?: string;
}

export const CATS = ['Chemical', 'Equipment', 'Consumable'] as const;

/** v1 inventory.js:12 — bar fills at twice the reorder level. */
export function stockPct(i: Item) {
  return Math.min(100, Math.round((i.stock / Math.max(1, i.reorder * 2)) * 100));
}

export function isLow(i: Item) {
  return i.stock < i.reorder;
}

/** How a ledger row reads: purchases in, job consumption, manual issues. */
export function moveLabel(m: Move) {
  if (m.dir === 'in') return 'Purchase';
  return m.jobId ? 'Consumed' : 'Issued';
}

/* ------------------------------------------------------------ modal chrome */

function Modal({ title, sub, children }: {
  title: string; sub?: string; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
      <div className="w-full max-w-[440px] rounded-md bg-white shadow-pop">
        <div className="px-5 pt-4 pb-3 border-b border-line-soft">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {sub && <p className="text-muted text-[12.5px] mt-0.5">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

/* --------------------------------------------------------- issue dialog

   There is no stock-in dialog any more. Stock arrives by receiving a purchase
   order, which carries a vendor, a rate and a document number; a box where
   someone types a number is exactly what that rule exists to remove.

   Issuing is branch-aware. A technician draws from his own branch's shelf, so
   a company total big enough to cover him proves nothing — the chemicals might
   be 500 km away. The dialog says which shelf and how much is on it.        */

export function MoveDialog({ item, onClose, onDone }: {
  item: Item;
  /** Only ever an issue now. Kept in the signature so callers read clearly. */
  kind?: 'out';
  onClose: () => void;
  onDone: (updated: Item) => void;
}) {
  const [qty, setQty] = useState('100');
  const [techs, setTechs] = useState<Array<{ id: string; name: string; branches: string[] }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [techId, setTechId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Bootstrap>('/org/bootstrap')
      .then((b) => {
        const t = (b.users as Array<{ id: string; name: string; role: string; branches?: string[] }>)
          .filter((u) => isFieldTech(u.role))
          .map((u) => ({ id: u.id, name: u.name, branches: u.branches || [] }));
        setTechs(t);
        if (t.length) {
          setTechId(t[0].id);
          setBranchId(t[0].branches[0] || '');
        }
        setBranches((b.branches as Array<{ id: string; name: string }>) || []);
      })
      .catch(() => {});
  }, []);

  const onShelf = item.branches?.find((b) => b.branchId === branchId)?.qty ?? 0;
  const elsewhere = item.stock - onShelf;

  async function save() {
    const n = Math.round(parseFloat(qty) || 0);
    if (n <= 0) { setErr('Enter a quantity'); return; }
    if (!techId) { setErr('Pick who is taking it'); return; }
    if (!branchId) { setErr('Pick the branch it comes off'); return; }
    if (n > onShelf) { setErr(`Only ${onShelf} ${item.unit} on that shelf`); return; }
    setBusy(true);
    setErr('');
    try {
      /*
       * Issuing is not a note against the store — the stock moves into that
       * technician's holding and comes back off it when he uses it on a
       * service. One endpoint does both sides so the two never disagree.
       */
      await api.post('/techstock/issue', {
        userId: techId, itemId: item.id, qty: n, dir: 'out', branchId,
      });
      onDone(await api.get<Item>(`/inventory/${item.id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not issue the stock');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Issue stock to technician"
      sub={`${item.name} · ${item.stock.toLocaleString('en-IN')} ${item.unit} across all branches`}
    >
      <div className="px-5 py-4 space-y-4">
        <label className="block">
          <span className={labelCls}>Issue to</span>
          <select value={techId}
            onChange={(e) => {
              setTechId(e.target.value);
              const t = techs.find((x) => x.id === e.target.value);
              setBranchId(t?.branches[0] || branchId);
            }}
            className={inputCls}>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span className="block text-[11.5px] text-muted mt-1.5">
            It goes into their holding and comes off when they use it on a service.
          </span>
        </label>

        <label className="block">
          <span className={labelCls}>Off which shelf</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            <option value="">Choose a branch…</option>
            {branches.map((b) => {
              const q = item.branches?.find((x) => x.branchId === b.id)?.qty ?? 0;
              return (
                <option key={b.id} value={b.id}>
                  {b.name} — {q.toLocaleString('en-IN')} {item.unit}
                </option>
              );
            })}
          </select>
          {branchId && (
            <span className={'block text-[11.5px] mt-1.5 ' + (onShelf === 0 ? 'text-accent' : 'text-muted')}>
              {onShelf.toLocaleString('en-IN')} {item.unit} here
              {elsewhere > 0 && ` · ${elsewhere.toLocaleString('en-IN')} ${item.unit} at other branches`}
              {onShelf === 0 && ' — transfer some in, or order more'}
            </span>
          )}
        </label>

        <label className="block">
          <span className={labelCls}>Quantity ({item.unit}) *</span>
          <input type="number" min={1} value={qty}
            onChange={(e) => setQty(e.target.value)} className={inputCls} />
        </label>

        {err && <p className="text-accent text-[12.5px] font-medium">{err}</p>}
      </div>
      <div className="px-5 py-3.5 border-t border-line-soft flex justify-end gap-2">
        <button onClick={onClose}
          className="h-9 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !branchId || onShelf === 0}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          <Icon name="check" size={14} /> Issue
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------ transfer dialog

   Stock landed at the wrong branch, or one branch is out while another has
   plenty. Without this the only fix is to lie to the system — issue it to
   nobody at one end and invent it at the other — and a stock figure that has
   been lied to once stops being believed.                                  */

export function TransferDialog({ item, onClose, onDone }: {
  item: Item;
  onClose: () => void;
  onDone: () => void;
}) {
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('100');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>('/branches')
      .then((b) => {
        setBranches(b);
        // Default to moving out of wherever most of it is sitting.
        const fullest = [...(item.branches || [])].sort((x, y) => y.qty - x.qty)[0];
        setFrom(fullest?.branchId || b[0]?.id || '');
        setTo(b.find((x) => x.id !== (fullest?.branchId || b[0]?.id))?.id || '');
      })
      .catch(() => {});
  }, [item.branches]);

  const on = (id: string) => item.branches?.find((b) => b.branchId === id)?.qty ?? 0;
  const n = Math.round(parseFloat(qty) || 0);

  async function save() {
    if (n <= 0) { setErr('Enter a quantity'); return; }
    if (!from || !to) { setErr('Pick both branches'); return; }
    if (from === to) { setErr('That is the same branch'); return; }
    if (n > on(from)) { setErr(`Only ${on(from)} ${item.unit} there`); return; }
    setBusy(true); setErr('');
    try {
      await api.post(`/inventory/${item.id}/transfer`, { from, to, qty: n });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not transfer');
      setBusy(false);
    }
  }

  return (
    <Modal title="Move stock between branches"
      sub={`${item.name} · ${item.stock.toLocaleString('en-IN')} ${item.unit} in total`}>
      <div className="px-5 py-4 space-y-4">
        <label className="block">
          <span className={labelCls}>Out of</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {on(b.id).toLocaleString('en-IN')} {item.unit}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Into</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {on(b.id).toLocaleString('en-IN')} {item.unit}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Quantity ({item.unit}) *</span>
          <input type="number" min={1} value={qty}
            onChange={(e) => setQty(e.target.value)} className={inputCls} />
        </label>
        {from && to && from !== to && n > 0 && n <= on(from) && (
          <p className="text-[12px] text-muted">
            Leaves {(on(from) - n).toLocaleString('en-IN')} {item.unit} at the first branch,
            {' '}{(on(to) + n).toLocaleString('en-IN')} {item.unit} at the second.
          </p>
        )}
        {err && <p className="text-accent text-[12.5px] font-medium">{err}</p>}
      </div>
      <div className="px-5 py-3.5 border-t border-line-soft flex justify-end gap-2">
        <button onClick={onClose}
          className="h-9 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
          Cancel
        </button>
        <button onClick={save} disabled={busy || from === to || n <= 0 || n > on(from)}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          <Icon name="check" size={14} /> Transfer
        </button>
      </div>
    </Modal>
  );
}
