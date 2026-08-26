'use client';

/* Purchase orders — the list. Tabbed by status, because the only question worth
   asking here is "what is still coming", and that is two of the five tabs. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import { useBranchFilter } from '@/components/branch-filter';
import { ListScreen, niceDate } from '@/components/mobile';

interface Row {
  id: string; vendorId: string; vendorName: string; date: string; expected: string;
  status: string; branch: string; lines: number;
  packsOrdered: number; packsReceived: number; baseOrdered: number;
}
interface List { rows: Row[]; counts: Record<string, number> }

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'ordered', label: 'On order' },
  { id: 'partial', label: 'Part received' },
  { id: 'received', label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PILL: Record<string, string> = {
  draft: 'zpill outline', ordered: 'zpill navy', partial: 'zpill red',
  received: 'zpill', cancelled: 'zpill',
};
const LABEL: Record<string, string> = {
  draft: 'Draft', ordered: 'Ordered', partial: 'Part received',
  received: 'Received', cancelled: 'Cancelled',
};

export default function PurchaseOrders() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState<List | null>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  const bf = useBranchFilter();
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (tab !== 'all') p.set('status', tab);
    if (q) p.set('q', q);
    if (bf.branch) p.set('branch', bf.branch);
    api.get<List>('/purchase-orders?' + p.toString()).then(setData)
      .catch(() => setData({ rows: [], counts: {} }));
  }, [tab, q, bf.branch]);
  const pg = usePager(data?.rows || []);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>('/branches').then(setBranches).catch(() => {});
  }, []);

  const bName = (id: string) => branches.find((b) => b.id === id)?.name || id || '—';

  return (
    <>
      {/* What has been ordered and how much of it has turned up. */}
      <ListScreen
        title="Purchase orders"
        loading={!data}
        rows={(data?.rows || []).map((r) => ({
          id: r.id,
          href: '/purchase-orders/' + r.id,
          title: r.vendorName || r.vendorId,
          right: r.packsReceived + '/' + r.packsOrdered,
          meta: niceDate(r.date) + ' \u00b7 ' + r.id + ' \u00b7 ' + r.lines
            + (r.lines === 1 ? ' item' : ' items'),
          tone: (r.status === 'received' ? 'good'
            : r.status === 'cancelled' ? 'plain'
            : r.packsReceived > 0 ? 'warn' : 'info') as 'good' | 'plain' | 'warn' | 'info',
          state: r.status === 'received' ? 'Received'
            : r.status === 'cancelled' ? 'Cancelled'
            : r.packsReceived > 0 ? 'Part received' : 'Ordered',
        }))}
        empty="No purchase orders"
        emptyHint="Stock only enters the system through one of these."
        fabHref="/purchase-orders/new"
        fabLabel="New purchase order"
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Purchase orders</h1>
          {data && (
            <span className="text-muted-2 text-[12.5px]">
              {(data.counts.ordered || 0) + (data.counts.partial || 0)} still coming
            </span>
          )}
        </div>
        <span className="flex items-center gap-3">
          {bf.el}
          <button onClick={() => router.push('/purchase-orders/new')}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New order
          </button>
        </span>
      </div>

      <div className="flex items-center gap-1 px-4 lg:px-6 border-b border-line-soft overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'relative h-12 lg:h-10 px-3 shrink-0 text-[13px] font-medium '
              + (tab === t.id ? 'text-navy' : 'text-muted hover:text-ink')}>
            {t.label}
            {data && (
              <span className={'ml-1.5 text-[11px] ' + (tab === t.id ? 'text-accent font-semibold' : 'text-muted-2')}>
                {data.counts[t.id] ?? 0}
              </span>
            )}
            {tab === t.id && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>

      <div className="px-4 lg:px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 lg:max-w-[340px] h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by order number, vendor or product…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">Nothing here</p>
          <p className="text-muted text-[13px] mt-1">
            {tab === 'all'
              ? 'Raise an order against a vendor — it is the only way stock gets in.'
              : 'Try a different tab.'}
          </p>
        </div>
      ) : (
        <>
          <div className="lg:hidden flex flex-col gap-2.5 p-3">
            {pg.pageRows.map((r) => (
              <button key={r.id} onClick={() => router.push('/purchase-orders/' + r.id)}
                className="text-left rounded-xl border border-line bg-white p-4 shadow-card active:bg-wash">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[15px] font-bold text-navy truncate">{r.vendorName}</span>
                  <span className={PILL[r.status]}>{LABEL[r.status]}</span>
                </div>
                <p className="text-[12.5px] text-ink-2">
                  {r.lines} line(s) · {bName(r.branch)}
                </p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-line-soft">
                  <span className="text-[10.5px] font-mono text-muted-2">{r.id} · {r.date}</span>
                  <span className="text-[13px] font-bold text-navy">{r.packsOrdered} packs</span>
                </div>
                {(r.status === 'ordered' || r.status === 'partial') && (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-accent">
                    {r.packsOrdered - r.packsReceived} pack(s) outstanding
                    {r.expected && <> · expected {r.expected}</>}
                  </p>
                )}
              </button>
            ))}
          </div>

          <table className="ztable max-lg:hidden">
            <thead>
              <tr>
                <th>Order</th><th>Vendor</th><th>Ship to</th><th>Expected</th>
                <th>Lines</th><th>Progress</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageRows.map((r) => (
                <tr key={r.id} className="zrow" onClick={() => router.push('/purchase-orders/' + r.id)}>
                  <td>
                    <span className="block font-semibold text-navy font-mono text-[12.5px]">{r.id}</span>
                    <span className="block text-[11px] text-muted-2">{r.date}</span>
                  </td>
                  <td className="font-medium text-navy">{r.vendorName}</td>
                  <td>{bName(r.branch)}</td>
                  <td>{r.expected || '—'}</td>
                  <td className="text-muted">{r.lines}</td>
                  <td>
                    {r.status === 'draft' || r.status === 'cancelled' ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span className={r.packsReceived >= r.packsOrdered ? '' : 'text-accent font-semibold'}>
                        {r.packsReceived}/{r.packsOrdered} packs
                      </span>
                    )}
                  </td>
                  <td><span className={PILL[r.status]}>{LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        {pg.el}
        </>
      )}
    </div>
    </>
  );
}
