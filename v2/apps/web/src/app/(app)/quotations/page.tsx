'use client';

/* ============================================================================
   Quotations list — status tabs with counts, the value still awaiting a
   customer response in the header, and the Zoho-density table.
   Ported from v1 renderList (quotations.js:38-95).
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { docTotals, money } from 'shared';
import {
  QUOTE_STATUS, dayDelta, fmtDate, lineVisits, validOf,
  type Quote, type QuoteStatusKey,
} from './lib';
import { useBranchFilter } from '@/components/branch-filter';
import { usePager } from '@/components/pager';
import { ListScreen, niceDate } from '@/components/mobile';

const TABS: Array<{ id: 'all' | QuoteStatusKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export default function Quotations() {
  const router = useRouter();
  const [rows, setRows] = useState<Quote[] | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<'all' | QuoteStatusKey>('all');
  const [q, setQ] = useState('');

  const bf = useBranchFilter();
  useEffect(() => {
    api.get<Quote[]>('/quotations' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setRows).catch(() => setRows([]));
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
  }, [bf.branch]);

  const home = boot?.company.state || 'Tamil Nadu';
  const gstRate = boot?.company.gstRate || 18;
  const unitOf = useMemo(() => {
    const m = new Map((boot?.services || []).map((s) => [s.id, s.unit]));
    return (svId: string) => m.get(svId);
  }, [boot]);

  const totalOf = (x: Quote) =>
    docTotals(x.items, x.discount, x.placeOfSupply, home, gstRate).total;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length || 0 };
    for (const t of ['draft', 'sent', 'approved', 'rejected']) {
      c[t] = (rows || []).filter((x) => x.status === t).length;
    }
    return c;
  }, [rows]);

  // '₹Y awaiting customer response' = Σ totals of everything still 'sent'
  const openVal = useMemo(
    () => (rows || []).filter((x) => x.status === 'sent').reduce((s, x) => s + totalOf(x), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, boot],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((x) => {
      if (tab !== 'all' && x.status !== tab) return false;
      if (!needle) return true;
      return (x.id + x.title + (x.partyName || '')).toLowerCase().includes(needle);
    });
  }, [rows, tab, q]);
  const pg = usePager(list);

  return (
    <>
      {/* A quotation on a phone is asked for at a gate. Name, price, and whether the customer has seen it -- the document itself is on the desktop. */}
      <ListScreen
        back="/dashboard"
        title="Quotations"
        loading={!rows}
        search={q}
        onSearch={setQ}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'sent', label: 'Sent' },
          { key: 'approved', label: 'Approved' },
          { key: 'draft', label: 'Draft' },
        ]}
        filter={tab}
        onFilter={(v) => setTab(v as typeof tab)}
        rows={(rows || []).map((x) => ({
          id: x.id,
          href: '/quotations/' + x.id,
          title: x.title || x.clientId,
          amount: money(totalOf(x)),
          meta: niceDate(x.date) + ' \u00b7 ' + x.id,
          tone: (x.status === 'approved' ? 'good'
            : x.status === 'rejected' ? 'bad'
            : x.status === 'sent' ? 'info' : 'plain') as 'good' | 'bad' | 'info' | 'plain',
          state: x.status === 'approved' ? 'Approved'
            : x.status === 'rejected' ? 'Turned down'
            : x.status === 'sent' ? 'With the customer' : 'Draft',
        }))}
        empty={q ? 'Nothing matches that' : 'No quotations yet'}
        emptyHint={q ? 'Try the customer name or the quote number.'
          : 'Raise one with the red button.'}
        fabHref="/quotations/new"
        fabLabel="New quotation"
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Quotations</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {rows.length} quotations · {money(openVal)} awaiting customer response
            </span>
          )}
        </div>
        <span className="flex items-center gap-3">
          {bf.el}
          <Link href="/quotations/new"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New quotation
          </Link>
        </span>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={
              'h-10 px-3 text-[13px] border-b-2 -mb-px transition-colors ' +
              (tab === t.id
                ? 'border-accent text-navy font-semibold'
                : 'border-transparent text-muted hover:text-navy')
            }>
            {t.label}
            <span className={'ml-1.5 text-[11.5px] ' + (tab === t.id ? 'text-muted' : 'text-muted-2')}>
              {counts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 max-w-[340px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by number, customer or title…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : list.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No quotations here</p>
          <p className="text-muted text-[13px] mt-1">
            Create one from a lead or straight from the service catalogue.
          </p>
          <Link href="/quotations/new"
            className="inline-flex items-center gap-1.5 h-8 px-3.5 mt-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New quotation
          </Link>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th>Quotation</th><th>Customer / Lead</th><th>Type</th>
              <th className="text-right!">Value</th><th>Valid till</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((x) => {
              const valid = validOf(x);
              const days = dayDelta(valid);
              const st = QUOTE_STATUS[x.status];
              const visits = x.items.reduce((n, i) => n + lineVisits(i, unitOf), 0);
              return (
                <tr key={x.id} className="zrow" onClick={() => router.push('/quotations/' + x.id)}>
                  <td>
                    <span className="block font-medium text-navy max-w-[280px] truncate">{x.title}</span>
                    <span className="block text-[11px] text-muted-2 font-mono">
                      {x.id} · {fmtDate(x.date)}
                    </span>
                  </td>
                  <td>{x.partyName || '—'}</td>
                  <td>
                    {x.mode === 'amc' ? (
                      <>
                        <span className="zpill navy">AMC · {x.months || 12} mo</span>
                        <span className="block text-[11px] text-muted-2 mt-1">{visits} services</span>
                      </>
                    ) : (
                      <span className="zpill outline">One-time</span>
                    )}
                  </td>
                  <td className="text-right font-semibold">{money(totalOf(x))}</td>
                  <td className={days < 0 ? 'text-accent' : days < 4 ? 'text-ink-2 font-medium' : 'text-muted'}>
                    {fmtDate(valid)}
                    <span className="block text-[11px]">
                      {days < 0 ? 'expired' : days + ' days left'}
                    </span>
                  </td>
                  <td><span className={st.cls}>{st.label}</span></td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-2">
                      {!x.contractId && (
                        <Link href={'/quotations/' + x.id + '/edit'}
                          onClick={(e) => e.stopPropagation()}
                          title={'Edit ' + x.id}
                          className="text-[12px] text-muted hover:text-navy font-medium">
                          Edit
                        </Link>
                      )}
                      <Icon name="chevRight" size={14} className="text-muted-2" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pg.el}
    </div>
    </>
  );
}
