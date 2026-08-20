'use client';

/* One inventory item — stock position and the full movement ledger, with a
   running balance walked back from the current stock. */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import {
  MoveDialog, TransferDialog, isLow, moveLabel, stockPct,
  type Item, type Move,
} from '../move-dialog';

type ItemDetail = Item & { moves: Move[] };

export default function InventoryItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [flash, setFlash] = useState('');

  const reload = useCallback(() => {
    api.get<ItemDetail>('/inventory/' + id)
      .then(setItem)
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(reload, [reload]);

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">No such inventory item</p>
        <Link href="/inventory" className="text-accent text-[13px] font-medium mt-1 inline-block">
          Back to inventory
        </Link>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-72 rounded bg-wash animate-pulse" />
        <div className="h-20 rounded bg-wash animate-pulse" />
        <div className="h-40 rounded bg-wash animate-pulse" />
      </div>
    );
  }

  const low = isLow(item);
  const totalIn = item.moves.filter((m) => m.dir === 'in').reduce((s, m) => s + m.qty, 0);
  const totalOut = item.moves.filter((m) => m.dir !== 'in').reduce((s, m) => s + m.qty, 0);

  // running balance: newest row shows the current stock, walk backwards
  let bal = item.stock;
  const ledger = item.moves.map((m) => {
    const row = { ...m, balance: bal };
    bal -= m.dir === 'in' ? m.qty : -m.qty;
    return row;
  });

  return (
    <div>
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/inventory" title="Back to inventory"
            className="flex items-center justify-center w-7 h-7 rounded border border-line hover:bg-wash shrink-0">
            <Icon name="chevRight" size={14} className="rotate-180" />
          </Link>
          <h1 className="text-[17px] font-semibold truncate">{item.name}</h1>
          <span className="zpill outline">{item.cat}</span>
          {low && <span className="zpill red">Below reorder</span>}
        </div>
        <div className="flex items-center gap-3">
          {flash && <span className="text-muted text-[12.5px]">{flash}</span>}
          <button onClick={() => setMoving(true)}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
            <Icon name="branch" size={14} /> Transfer
          </button>
          <button onClick={() => setIssuing(true)}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
            <Icon name="upload" size={14} /> Issue
          </button>
          {/* Stock only ever arrives by being bought. */}
          <button onClick={() => router.push('/purchase-orders/new')}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> Order more
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------- stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line-soft">
        <div className="px-6 py-4 border-r border-line-soft">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Stock on hand</p>
          <p className={'text-[22px] font-semibold mt-0.5 ' + (low ? 'text-accent' : '')}>
            {item.stock} <span className="text-[13px] text-muted font-normal">{item.unit}</span>
          </p>
          <span className="block w-[130px] h-[6px] rounded-full bg-wash-2 overflow-hidden mt-1.5">
            <span className={'block h-full rounded-full ' + (low ? 'bg-accent' : 'bg-navy')}
              style={{ width: stockPct(item) + '%' }} />
          </span>
        </div>
        <div className="px-6 py-4 sm:border-r border-line-soft">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reorder level</p>
          <p className="text-[22px] font-semibold mt-0.5">
            {item.reorder} <span className="text-[13px] text-muted font-normal">{item.unit}</span>
          </p>
          <p className="text-[12px] text-muted mt-1.5">{low ? 'Order today' : 'Healthy'}</p>
        </div>
        <div className="px-6 py-4 border-r border-line-soft">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Received</p>
          <p className="text-[22px] font-semibold mt-0.5">
            +{totalIn} <span className="text-[13px] text-muted font-normal">{item.unit}</span>
          </p>
          <p className="text-[12px] text-muted mt-1.5">All purchases on record</p>
        </div>
        <div className="px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Issued / consumed</p>
          <p className="text-[22px] font-semibold mt-0.5">
            −{totalOut} <span className="text-[13px] text-muted font-normal">{item.unit}</span>
          </p>
          <p className="text-[12px] text-muted mt-1.5">To technicians and jobs</p>
        </div>
      </div>

      {item.note && (
        <p className="px-6 py-3 text-[12.5px] text-muted border-b border-line-soft">{item.note}</p>
      )}

      {/* ------------------------------------------------ movement ledger */}
      <div className="px-6 pt-5 pb-1">
        <h2 className="text-[14px] font-semibold">Movement history</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Every purchase, issue and job consumption for this item, newest first.
        </p>
      </div>
      {ledger.length === 0 ? (
        <p className="px-6 py-8 text-muted text-[13px]">
          No movements yet — record a purchase or an issue to start the ledger.
        </p>
      ) : (
        <table className="ztable mt-2">
          <thead>
            <tr>
              <th>Date</th><th>Type</th>
              <th className="text-right!">Quantity</th>
              <th className="text-right!">Balance</th>
              <th>Reference</th><th>Job</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((m) => {
              const label = moveLabel(m);
              return (
                <tr key={m.id}>
                  <td className="text-muted whitespace-nowrap">{m.date}</td>
                  <td>
                    <span className={'zpill ' +
                      (m.dir === 'in' ? 'navy' : label === 'Consumed' ? 'outline' : 'red')}>
                      {label}
                    </span>
                  </td>
                  <td className={'text-right font-semibold ' +
                    (m.dir === 'in' ? 'text-navy' : 'text-accent')}>
                    {m.dir === 'in' ? '+' : '−'}{m.qty} {item.unit}
                  </td>
                  <td className="text-right text-muted">{m.balance} {item.unit}</td>
                  <td className="text-muted">{m.note || '—'}</td>
                  <td className="text-[12px] text-muted">{m.jobId || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {moving && (
        <TransferDialog item={item}
          onClose={() => setMoving(false)}
          onDone={() => { setMoving(false); setFlash('Stock transferred'); reload(); }} />
      )}
      {issuing && (
        <MoveDialog item={item}
          onClose={() => setIssuing(false)}
          onDone={(it) => {
            setIssuing(false);
            setFlash(`New balance ${it.stock} ${it.unit}`);
            setTimeout(() => setFlash(''), 4000);
            reload();
          }} />
      )}
    </div>
  );
}
