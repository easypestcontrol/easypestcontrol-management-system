'use client';

/* Inventory — stock levels, below-reorder flags and the movement ledger.
   Ported from v1 assets/js/views/inventory.js: category tabs, search,
   low-stock banner, stock-in / issue dialogs writing StockMoves. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import {
  MoveDialog, isLow, moveLabel, stockPct,
  type Item, type Move,
} from './move-dialog';
import { ListScreen } from '@/components/mobile';

type Tab = 'Chemical' | 'Equipment' | 'Consumable' | 'moves';

export default function Inventory() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [tab, setTab] = useState<Tab>('Chemical');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<{ item: Item; kind: 'out' } | null>(null);
  const [flash, setFlash] = useState('');

  const reload = useCallback(() => {
    Promise.all([api.get<Item[]>('/inventory'), api.get<Move[]>('/inventory/moves')])
      .then(([i, m]) => { setItems(i); setMoves(m); })
      .catch(() => { setItems([]); setMoves([]); });
  }, []);
  useEffect(reload, [reload]);

  const low = useMemo(() => (items || []).filter(isLow), [items]);
  const byId = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);
  const counts = useMemo(() => ({
    Chemical: (items || []).filter((i) => i.cat === 'Chemical').length,
    Equipment: (items || []).filter((i) => i.cat === 'Equipment').length,
    Consumable: (items || []).filter((i) => i.cat === 'Consumable').length,
    moves: moves.length,
  }), [items, moves]);

  const needle = q.trim().toLowerCase();
  const rows = tab === 'moves' ? [] : (items || []).filter((i) =>
    i.cat === tab &&
    (!needle || (i.name + ' ' + i.note).toLowerCase().indexOf(needle) >= 0));

  const pg = usePager(rows);

  function done(msg: string) {
    setDialog(null);
    setFlash(msg);
    setTimeout(() => setFlash(''), 4000);
    reload();
  }

  const TABS: Array<{ id: Tab; label: string; n: number }> = [
    { id: 'Chemical', label: 'Chemicals', n: counts.Chemical },
    { id: 'Equipment', label: 'Equipment', n: counts.Equipment },
    { id: 'Consumable', label: 'Consumables', n: counts.Consumable },
    { id: 'moves', label: 'Stock movements', n: counts.moves },
  ];

  return (
    <>
      {/* Stock is counted at the store. On the road this is a lookup: have we got any, and is more coming. */}
      <ListScreen
        title="Inventory"
        loading={!items}
        search={q}
        onSearch={setQ}
        rows={(items || []).map((i) => ({
          id: i.id,
          href: '/inventory/' + i.id,
          title: i.name,
          right: i.stock + ' ' + i.unit,
          meta: [i.cat, i.onOrder ? i.onOrder + ' on order' : ''].filter(Boolean).join(' \u00b7 '),
          tone: (i.stock <= 0 ? 'bad' : i.stock < i.reorder ? 'warn' : 'good') as 'bad' | 'warn' | 'good',
          state: i.stock <= 0 ? 'Out of stock'
            : i.stock < i.reorder ? 'Below reorder level' : 'In stock',
        }))}
        empty="Nothing in stock yet"
        emptyHint="Stock arrives by receiving a purchase order."
      />
    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Inventory</h1>
          {items && (
            <span className="text-muted-2 text-[12.5px]">
              {items.length} items{low.length > 0 && (
                <span className="text-accent font-semibold"> · {low.length} below reorder</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {flash && <span className="text-muted text-[12.5px]">{flash}</span>}
          {/* There is no such thing as adding an item by hand any more. A
              product enters the store by being bought, so this is the door. */}
          <button onClick={() => router.push('/purchase-orders/new')}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> Add item
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- filter row */}
      <div className="px-4 lg:px-6 py-3 border-b border-line-soft flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'h-8 px-3 rounded text-[12.5px] font-medium transition-colors ' +
                (tab === t.id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-wash')}>
              {t.label}
              <span className={'ml-1.5 text-[11px] ' +
                (tab === t.id ? 'text-white/70' : 'text-muted-2')}>{t.n}</span>
            </button>
          ))}
        </div>
        {tab !== 'moves' && (
          <label className="flex items-center gap-2 w-[260px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
            <Icon name="search" size={14} className="text-muted-2" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search items…"
              className="flex-1 bg-transparent outline-none text-[13px]" />
          </label>
        )}
      </div>

      {/* ---------------------------------------------- low-stock banner */}
      {items && low.length > 0 && tab !== 'moves' && (
        <div className="mx-4 lg:mx-6 mt-3 rounded border border-red-line bg-red-wash px-4 py-2.5">
          <p className="text-[12.5px] font-semibold text-accent">
            {low.length} item{low.length > 1 ? 's are' : ' is'} below reorder level
          </p>
          <p className="text-[12px] text-ink-2 mt-0.5">
            {low.map((i) => `${i.name} (${i.stock} ${i.unit})`).join(', ')}
          </p>
          <button onClick={() => router.push('/purchase-orders/new')}
            className="mt-2 h-8 px-3 rounded bg-accent text-white text-[12px] font-semibold hover:brightness-90">
            Raise a purchase order
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------- body */}
      {!items ? (
        <div className="p-6 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded bg-wash animate-pulse" />
          ))}
        </div>
      ) : tab === 'moves' ? (
        moves.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-[15px] font-medium">No stock movements yet</p>
            <p className="text-muted text-[13px] mt-1">
              Purchases, issues and job consumption will appear here as a ledger.
            </p>
          </div>
        ) : (
          <table className="ztable mt-3">
            <thead>
              <tr>
                <th>Date</th><th>Item</th><th>Branch</th><th>Type</th>
                <th className="text-right!">Quantity</th><th>Reference</th><th>From</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => {
                const it = byId.get(m.itemId);
                const label = moveLabel(m);
                return (
                  <tr key={m.id}>
                    <td className="text-muted whitespace-nowrap">{m.date}</td>
                    <td className="font-medium text-navy">{it?.name || m.itemId}</td>
                    <td className="text-[12px] text-muted">{m.branchName || '—'}</td>
                    <td>
                      <span className={'zpill ' +
                        (m.dir === 'in' ? 'navy' : label === 'Consumed' ? 'outline' : 'red')}>
                        {label}
                      </span>
                    </td>
                    <td className={'text-right font-semibold ' +
                      (m.dir === 'in' ? 'text-navy' : 'text-accent')}>
                      {m.dir === 'in' ? '+' : '−'}{m.qty} {it?.unit || ''}
                    </td>
                    <td className="text-muted">{m.note || '—'}</td>
                    <td className="text-[12px] text-muted">{m.vendor || m.jobId || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No items here</p>
          <p className="text-muted text-[13px] mt-1">Try another category or search.</p>
        </div>
      ) : (
        <table className="ztable mt-3">
          <thead>
            <tr>
              <th>Item</th><th>Stock on hand</th><th>Reorder level</th>
              <th>Last movement</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((i) => {
              const lowNow = isLow(i);
              const last = moves.find((m) => m.itemId === i.id);
              return (
                <tr key={i.id} className="zrow"
                  onClick={() => router.push('/inventory/' + i.id)}>
                  <td>
                    <span className="block font-medium text-navy">{i.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {i.id}{i.note ? ' · ' + i.note : ''}
                    </span>
                  </td>
                  <td className="min-w-[190px]">
                    <span className="flex items-center gap-2.5">
                      <span className="w-[110px] h-[6px] rounded-full bg-wash-2 overflow-hidden shrink-0">
                        <span className={'block h-full rounded-full ' +
                          (lowNow ? 'bg-accent' : 'bg-navy')}
                          style={{ width: stockPct(i) + '%' }} />
                      </span>
                      <span className={'text-[13px] font-semibold whitespace-nowrap ' +
                        (lowNow ? 'text-accent' : '')}>
                        {i.stock.toLocaleString('en-IN')} {i.unit}
                      </span>
                      {i.onOrder > 0 && (
                        <span className="zpill navy whitespace-nowrap"
                          title="Ordered and not yet received">
                          +{i.onOrder.toLocaleString('en-IN')} coming
                        </span>
                      )}
                      {lowNow && <span className="zpill red">Below reorder</span>}
                    </span>
                  </td>
                  <td className="text-muted">{i.reorder} {i.unit}</td>
                  <td className="text-[12px] text-muted">
                    {last ? `${last.date} · ${moveLabel(last)}` : '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-end gap-1.5">
                      <button title="Buy more of this"
                        onClick={() => router.push('/purchase-orders/new')}
                        className="flex items-center gap-1 h-7 px-2.5 rounded border border-line text-[12px] font-medium hover:bg-wash">
                        <Icon name="plus" size={12} /> Order
                      </button>
                      <button title="Issue stock to technician"
                        onClick={() => setDialog({ item: i, kind: 'out' })}
                        className="flex items-center gap-1 h-7 px-2.5 rounded border border-line text-[12px] font-medium hover:bg-wash">
                        <Icon name="upload" size={12} /> Issue
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* -------------------------------------------------------- dialogs */}
      {dialog && (
        <MoveDialog item={dialog.item} kind={dialog.kind}
          onClose={() => setDialog(null)}
          onDone={(it) => done(
            `Stock issued — ${it.name} · new balance ${it.stock} ${it.unit}`)} />
      )}

    </div>
    </>
  );
}
