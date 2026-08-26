'use client';

/* ============================================================================
   Contracts — everything sold, in one list: AMC agreements, one-time
   services, and the stand-alone bookings that never had a contract behind
   them. Tabs split live / expiring / expired and AMC / one-time; a contract
   short of technicians says so right on its row.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, moneyShort } from 'shared';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import {
  fmtDate, fmtShort, fmtTime, initials, relDay, statusPill,
  type Boot, type ContractRow,
} from './lib';
import { useBranchFilter } from '@/components/branch-filter';
import { ListScreen } from '@/components/mobile';

const TABS = [
  { id: 'active', label: 'Live' },
  { id: 'expiring', label: 'Expiring soon' },
  { id: 'expired', label: 'Expired' },
  { id: 'amc', label: 'AMC' },
  { id: 'onetime', label: 'One-time' },
  { id: 'all', label: 'All' },
] as const;

export default function Contracts() {
  const router = useRouter();
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<string>('active');
  const [q, setQ] = useState('');
  const [choose, setChoose] = useState(false);

  const bf = useBranchFilter();
  useEffect(() => {
    api.get<ContractRow[]>('/contracts' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setRows).catch(() => setRows([]));
    api.get<Boot>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, [bf.branch]);

  const userName = (id: string) =>
    boot?.users.find((u) => u.id === id)?.name || id;

  const counts = useMemo(() => {
    const all = rows || [];
    return {
      all: all.length,
      active: all.filter((r) => r.statusKey !== 'expired').length,
      expiring: all.filter((r) => r.statusKey === 'expiring').length,
      expired: all.filter((r) => r.statusKey === 'expired').length,
      amc: all.filter((r) => !r.one).length,
      onetime: all.filter((r) => r.one).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const all = rows || [];
    const needle = q.toLowerCase();
    return all.filter((r) => {
      if (tab === 'amc' && r.one) return false;
      if (tab === 'onetime' && !r.one) return false;
      if (tab === 'active' && r.statusKey === 'expired') return false;
      if (tab === 'expiring' && r.statusKey !== 'expiring') return false;
      if (tab === 'expired' && r.statusKey !== 'expired') return false;
      if (!needle) return true;
      return (r.key + r.clientName).toLowerCase().indexOf(needle) >= 0;
    }).sort((a, b) => ((a.end || '') < (b.end || '') ? 1 : -1));
  }, [rows, tab, q]);
  const pg = usePager(filtered);

  // Annual value = every non-expired row, exactly the v1 header stat.
  const liveValue = (rows || []).filter((r) => r.statusKey !== 'expired')
    .reduce((s, r) => s + r.value, 0);
  const visitsScheduled = (rows || []).reduce((s, r) => s + (r.totalVisits || 0), 0);
  const canCreate = !!me && ['admin', 'ops', 'sales'].indexOf(me.role) >= 0;

  return (
    <>
      {/* How far through the visits, and is it still live. Editing a plan is a desk job and stays on the desktop. */}
      <ListScreen
        title="Contracts"
        loading={!rows}
        search={q}
        onSearch={setQ}
        rows={(rows || []).map((c) => ({
          id: c.key,
          href: '/contracts/' + c.key,
          title: c.clientName || c.clientId,
          amount: c.value ? money(c.value) : undefined,
          meta: [c.planText, c.done + ' of ' + c.total + ' visits'].filter(Boolean).join(' \u00b7 '),
          tone: (c.statusKey === 'active' ? 'good'
            : c.statusKey === 'expired' ? 'bad'
            : c.statusKey === 'due' ? 'warn' : 'plain') as 'good' | 'bad' | 'warn' | 'plain',
          state: c.statusLabel || 'Contract',
        }))}
        empty={q ? 'Nothing matches that' : 'No contracts yet'}
        emptyHint={q ? 'Try the customer name.'
          : 'A contract is created from an approved quotation.'}
      />
    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Contracts</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {counts.amc} AMC · {counts.onetime} one-time · {money(liveValue)} live value
            </span>
          )}
        </div>
        <span className="flex items-center gap-3">
          {bf.el}
          {canCreate && (
            <button onClick={() => setChoose(true)}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={14} /> New contract
            </button>
          )}
        </span>
      </div>

      {/* --------------------------------------------------------- stats */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-line-soft">
        {[
          { label: 'Live contracts', value: String(counts.active),
            foot: counts.all + ' on the books all time' },
          { label: 'Annual value', value: moneyShort(liveValue),
            foot: 'Across every live contract' },
          { label: 'Expiring soon', value: String(counts.expiring), red: counts.expiring > 0,
            foot: counts.expiring ? 'Within 30 days — send renewals' : 'Nothing due to renew' },
          { label: 'Services scheduled', value: String(visitsScheduled),
            foot: 'Generated from the service plans' },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-line px-4 py-3">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{s.label}</p>
            <p className={'text-[20px] font-semibold mt-0.5 ' + (s.red ? 'text-accent' : 'text-navy')}>
              {s.value}
            </p>
            <p className="text-[11.5px] text-muted-2 mt-0.5">{s.foot}</p>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------- tabs + search */}
      <div className="flex items-center justify-between px-6 border-b border-line-soft">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'px-3 h-10 text-[13px] border-b-2 -mb-px transition-colors ' +
                (tab === t.id
                  ? 'border-accent text-navy font-semibold'
                  : 'border-transparent text-muted hover:text-navy')}>
              {t.label}
              <span className="ml-1.5 text-[11px] text-muted-2">
                {counts[t.id as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 w-[280px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by contract number or customer…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {/* ---------------------------------------------------------- table */}
      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No contracts in this view</p>
          <p className="text-muted text-[13px] mt-1">
            Create one with New contract, or approve a quotation to generate it.
          </p>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th>Contract</th><th>Customer</th><th>Type &amp; status</th><th>Scheduled</th>
              <th>Services</th><th>Progress</th><th className="text-right">Value</th><th>Next</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((r) => (
              <tr key={r.key} className="zrow"
                onClick={() => router.push(r.standalone ? '/jobs/' + r.key : '/contracts/' + r.key)}>
                <td className="whitespace-nowrap">
                  <span className="block font-medium font-mono text-[12.5px] text-navy">{r.key}</span>
                  {r.shortCrew ? (
                    <span className="block text-[11px] font-semibold text-accent">
                      {r.shortCrew} to assign
                    </span>
                  ) : (
                    <span className="block text-[11px] text-muted-2">
                      {r.techId ? userName(r.techId) : 'No technician'}
                    </span>
                  )}
                </td>
                <td>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: r.clientColor || '#141414' }}>
                      {initials(r.clientName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-navy truncate">{r.clientName}</span>
                      <span className="block text-[11px] text-muted-2 truncate">{r.clientCity}</span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <span className="zpill outline">{r.one ? 'One-time' : 'AMC'}</span>
                  <span className="block mt-1">
                    <span className={statusPill(r.statusKey)}>{r.statusLabel}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {r.one ? (
                    <>
                      <span className="block font-medium text-[12.5px]">
                        {r.start ? fmtDate(r.start) : 'No date'}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {r.slot ? fmtTime(r.slot) : '—'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block font-medium text-[12.5px]">{r.planText || '—'}</span>
                      <span className="block text-[11px] text-muted">
                        {fmtShort(r.start)} → {fmtDate(r.end)}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  <span className="flex gap-1">
                    {r.services.slice(0, 2).map((s) => (
                      <span key={s.id} className="zpill" title={s.name}>{s.code}</span>
                    ))}
                    {r.services.length > 2 && (
                      <span className="zpill" title={r.services.map((s) => s.name).join(', ')}>
                        +{r.services.length - 2}
                      </span>
                    )}
                  </span>
                </td>
                <td className="min-w-[110px]">
                  <span className="block text-[12.5px] font-medium">
                    {r.done} <span className="text-muted font-normal">of {r.total}</span>
                  </span>
                  <span className="block h-1 rounded bg-wash-2 mt-1 overflow-hidden">
                    <span className="block h-full bg-navy" style={{ width: r.pct + '%' }} />
                  </span>
                </td>
                <td className="text-right font-semibold whitespace-nowrap">{moneyShort(r.value)}</td>
                <td className={'whitespace-nowrap ' + (r.next ? 'text-navy font-medium' : 'text-muted-2')}>
                  {r.next ? relDay(r.next) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pg.el}

      {/* ------------------------------------------------------- chooser */}
      {choose && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6"
          onClick={() => setChoose(false)}>
          <div className="bg-white rounded-lg shadow-pop w-full max-w-[560px] p-6"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold">Move to contract</h2>
            <p className="text-muted text-[12.5px] mt-0.5 mb-5">
              Both are built on the same form — this only decides how the visits are scheduled.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => router.push('/contracts/new?mode=amc')}
                className="text-left rounded-md border border-line p-4 hover:border-navy/40 hover:bg-wash">
                <Icon name="contract" size={22} className="text-navy mb-3" />
                <span className="block font-semibold text-[14px]">AMC contract</span>
                <span className="block text-muted text-[12.5px] mt-1.5 leading-relaxed">
                  Recurring services over a period. Each service is delivered a number of
                  times, spread across the term, and every visit is generated onto the calendar.
                </span>
              </button>
              <button onClick={() => router.push('/contracts/new?mode=onetime')}
                className="text-left rounded-md border border-line p-4 hover:border-navy/40 hover:bg-wash">
                <Icon name="calendar" size={22} className="text-navy mb-3" />
                <span className="block font-semibold text-[14px]">One-time service</span>
                <span className="block text-muted text-[12.5px] mt-1.5 leading-relaxed">
                  A single service on one date and time. Same commercial detail and
                  signatures, one visit on the calendar.
                </span>
              </button>
            </div>
            <div className="mt-5 text-right">
              <button onClick={() => setChoose(false)}
                className="h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
