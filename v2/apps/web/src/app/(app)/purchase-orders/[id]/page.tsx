'use client';

/* ============================================================================
   One purchase order.

   A draft is a form. Anything else is a document — frozen, because it has gone
   to a vendor and changing it behind their back is how disputes start.

   The action that matters here is **Receive**, and it is deliberately a dialog
   rather than one button: what turned up is not always what was ordered, and a
   system that cannot express "six of the ten arrived" teaches people to lie to
   it until the numbers stop meaning anything.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Modal } from '../../jobs/ui';
import PoBuilder, { type PoDraft } from '../builder';
import PoDoc from '../po-doc';
import type { DocCompany } from '../../quotations/lib';

interface Line {
  id: number; itemId: string; name: string; cat: string; baseUnit: string;
  packUnit: string; packSize: number; qty: number; rate: number; receivedQty: number;
}
interface Po {
  id: string; vendorId: string; date: string; expected: string; status: string;
  branch: string; notes: string;
  raisedBy: string; orderedAt: string; receivedBy: string; receivedAt: string;
  terms: string[];
  items: Line[];
  vendor: {
    id: string; name: string; gstin: string; contact: string; phone: string;
    email: string; addr: string; city: string; state: string; pincode: string; terms: string;
  };
  totals: { sub: number; disc: number; gst: number; total: number; tax: { rows: Array<[string, number]> } };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'zpill outline' },
  ordered: { label: 'Ordered', cls: 'zpill navy' },
  partial: { label: 'Part received', cls: 'zpill red' },
  received: { label: 'Received', cls: 'zpill' },
  cancelled: { label: 'Cancelled', cls: 'zpill' },
};

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<Po | null>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; addr?: string }>>([]);
  const [co, setCo] = useState<DocCompany | null>(null);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<Po>('/purchase-orders/' + id).then(setPo).catch(() => setPo(null));
  }, [id]);

  useEffect(() => {
    load();
    api.get<Array<{ id: string; name: string; addr?: string }>>('/branches')
      .then(setBranches).catch(() => {});
    api.get<{ company: DocCompany }>('/org/bootstrap')
      .then((b) => setCo({ ...b.company, terms: b.company.terms || [] }))
      .catch(() => {});
  }, [load]);

  if (!po) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  const branchName = branches.find((b) => b.id === po.branch)?.name || po.branch || '—';
  const canReceive = po.status === 'ordered' || po.status === 'partial';

  async function act(path: string) {
    setErr(''); setBusy(true);
    try { await api.post('/purchase-orders/' + id + path, {}); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  }

  /* ------------------------------------------------------------ editing */
  if (editing && po.status === 'draft') {
    const draft: PoDraft = {
      vendorId: po.vendorId, date: po.date, expected: po.expected, branch: po.branch,
      notes: po.notes,
      items: po.items.map((l) => ({ ...l })),
    };
    return (
      <div>
        <div className="flex items-center gap-3 px-4 lg:px-6 h-[56px] border-b border-line">
          <button onClick={() => setEditing(false)} className="text-muted hover:text-navy">
            <Icon name="chevRight" size={16} className="rotate-180" />
          </button>
          <h1 className="text-[17px] font-semibold">Edit {po.id}</h1>
        </div>
        <PoBuilder initial={draft} poId={po.id} onSaved={() => { setEditing(false); load(); }} />
      </div>
    );
  }

  /* ----------------------------------------------------------- document */
  return (
    <div>
      <div className="flex items-center gap-3 px-4 lg:px-6 h-[56px] border-b border-line">
        <Link href="/purchase-orders" className="text-muted hover:text-navy shrink-0">
          <Icon name="chevRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-[17px] font-semibold font-mono">{po.id}</h1>
        <span className={STATUS[po.status]?.cls || 'zpill'}>{STATUS[po.status]?.label || po.status}</span>
        <span className="flex-1" />
        {po.status === 'draft' && (
          <>
            <button onClick={() => setEditing(true)}
              className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
              Edit
            </button>
            <button onClick={() => act('/place')} disabled={busy}
              className="h-9 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90 disabled:opacity-50">
              Place order
            </button>
          </>
        )}
        {po.status !== 'draft' && (
          <button onClick={() => window.print()}
            className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            Print
          </button>
        )}
        {canReceive && (
          <button onClick={() => setReceiving(true)}
            className="h-9 px-4 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
            Receive
          </button>
        )}
      </div>

      {err && <p className="px-4 lg:px-6 py-2 text-[12.5px] text-accent">{err}</p>}

      {/* The order as a sheet — the same paper the customer's quotation is
          printed on, so there is one house style rather than two. */}
      <div className="p-4 lg:p-6">
        {co ? (
          <PoDoc po={po} company={co} branchName={branchName}
            branchAddr={branches.find((b) => b.id === po.branch)?.addr} />
        ) : (
          <p className="text-muted text-[13px]">Loading…</p>
        )}

        {(po.status === 'draft' || po.status === 'ordered') && (
          <div className="flex justify-end max-w-[820px] mx-auto mt-4 no-print">
            <button onClick={() => act('/cancel')} disabled={busy}
              className="h-10 px-4 rounded border border-line text-accent text-[12.5px] font-semibold hover:bg-red-wash">
              Cancel this order
            </button>
          </div>
        )}
      </div>

      {receiving && (
        <ReceiveDialog po={po} branchName={branchName}
          onClose={() => setReceiving(false)}
          onDone={() => { setReceiving(false); load(); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- receiving */

function ReceiveDialog({ po, branchName, onClose, onDone }: {
  po: Po; branchName: string; onClose: () => void; onDone: () => void;
}) {
  // Default to everything outstanding: most deliveries are complete, and the
  // person doing this is standing next to a box, not a keyboard.
  const [got, setGot] = useState<Record<number, number>>(
    () => Object.fromEntries(po.items.map((l) => [l.id, l.qty - l.receivedQty])),
  );
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const total = po.items.reduce((a, l) => a + (got[l.id] || 0) * l.packSize, 0);

  async function submit() {
    setErr(''); setBusy(true);
    try {
      await api.post('/purchase-orders/' + po.id + '/receive', {
        lines: po.items.map((l) => ({ id: l.id, received: got[l.id] || 0 })),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not record this delivery');
    } finally { setBusy(false); }
  }

  return (
    <Modal title="What turned up?" sub={po.id + ' · into ' + branchName} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {po.items.map((l) => {
          const left = l.qty - l.receivedQty;
          if (left === 0) {
            return (
              <div key={l.id} className="rounded-md border border-line-soft bg-wash px-3 py-2.5">
                <p className="text-[13px] font-semibold text-muted">{l.name}</p>
                <p className="text-[12px] text-muted-2">All {l.qty} {l.packUnit} already received</p>
              </div>
            );
          }
          return (
            <div key={l.id} className="rounded-md border border-line px-3 py-2.5">
              <p className="text-[13.5px] font-semibold">{l.name}</p>
              <p className="text-[12px] text-muted mb-2">
                {left} {l.packUnit} outstanding · {l.packSize.toLocaleString('en-IN')} {l.baseUnit} each
              </p>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={left} value={got[l.id] ?? 0}
                  onChange={(e) => setGot((g) => ({
                    ...g,
                    [l.id]: Math.max(0, Math.min(left, Number(e.target.value) || 0)),
                  }))}
                  className="w-[92px] h-10 px-3 rounded border border-line text-[14px] outline-none focus:border-navy" />
                <span className="text-[12.5px] text-muted">{l.packUnit}</span>
                <span className="flex-1" />
                <span className="text-[12.5px] font-semibold text-navy">
                  {((got[l.id] || 0) * l.packSize).toLocaleString('en-IN')} {l.baseUnit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] text-ink-2">
        <b>{total.toLocaleString('en-IN')}</b> units go onto {branchName}&rsquo;s shelf.
      </p>
      {err && <p className="mt-2 text-[12.5px] text-accent">{err}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
          Cancel
        </button>
        <button onClick={submit} disabled={busy || total === 0}
          className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
          {busy ? 'Recording…' : 'Add to stock'}
        </button>
      </div>
      {total === 0 && (
        <p className="text-[11.5px] text-muted text-right mt-1.5">Enter what actually arrived</p>
      )}
    </Modal>
  );
}
