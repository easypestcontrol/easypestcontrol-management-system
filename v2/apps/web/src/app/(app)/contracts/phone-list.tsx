'use client';

/* ============================================================================
   Contracts, on a phone.

   The list used to be a name and an amount - nothing to tell one Mr. Arun VK
   contract from the next, no search on screen and no way to see only what is
   still to do. Each contract is now a card that answers the questions asked of
   it: whose, which number and kind, which branch, when, how far through the
   visits, and what is next. Above it a search that stays on screen and chips
   for where a contract stands, with the counts on them.
   ========================================================================== */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { money } from 'shared';
import { Icon } from '@/components/icons';
import { BackBar, Chip, Fab, PickChip, SearchBox, initialsOf, type Tone } from '@/components/mobile';
import { fmtDate, fmtShort, fmtTime, relDay, type Boot, type ContractRow } from './lib';

/** Where a contract stands, in the words the office uses. */
export type Stage = 'active' | 'scheduled' | 'completed' | 'expiring' | 'expired';
export function stageOf(r: ContractRow): Stage {
  if (r.statusKey === 'expired') return 'expired';
  if (r.total > 0 && r.done >= r.total) return 'completed';
  if (r.statusKey === 'expiring') return 'expiring';
  if (r.one) return 'scheduled';
  return 'active';
}
export const STAGES: Array<{ key: '' | Stage; label: string }> = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'expired', label: 'Expired' },
];
const STAGE_LOOK: Record<Stage, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  completed: { label: 'Completed', tone: 'plain' },
  expiring: { label: 'Expiring soon', tone: 'warn' },
  expired: { label: 'Expired', tone: 'bad' },
};

const SORTS = [
  { key: '', label: 'Newest first' },
  { key: 'old', label: 'Oldest first' },
  { key: 'value', label: 'Highest value' },
  { key: 'next', label: 'Next visit soonest' },
  { key: 'name', label: 'Customer A–Z' },
];

export default function PhoneContracts({ rows, boot, onNew }: {
  rows: ContractRow[] | null;
  boot: Boot | null;
  onNew?: () => void;
}) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<'' | Stage>('');
  const [kind, setKind] = useState('');
  const [branch, setBranch] = useState('');
  const [sort, setSort] = useState('');

  const branchName = (id: string) => boot?.branches.find((b) => b.id === id)?.name || '';
  const branches = boot?.branches || [];

  // Counts follow the other filters, so a chip never promises rows it will not show.
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (kind === 'amc' && r.one) return false;
      if (kind === 'onetime' && !r.one) return false;
      if (branch && r.branch !== branch) return false;
      if (!needle) return true;
      return [r.key, r.clientName, r.clientCity, branchName(r.branch), r.planText,
        ...r.services.map((s) => s.name)].join(' ').toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, kind, branch, boot]);

  const count = (s: '' | Stage) => (s ? base.filter((r) => stageOf(r) === s).length : base.length);

  const shown = useMemo(() => {
    const list = base.filter((r) => !stage || stageOf(r) === stage);
    const by: Record<string, (a: ContractRow, b: ContractRow) => number> = {
      '': (a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0),
      old: (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0),
      value: (a, b) => b.value - a.value,
      next: (a, b) => (a.next || '9999') < (b.next || '9999') ? -1 : 1,
      name: (a, b) => a.clientName.localeCompare(b.clientName),
    };
    return list.slice().sort(by[sort] || by['']);
  }, [base, stage, sort]);

  const total = shown.reduce((a, r) => a + (r.value || 0), 0);

  return (
    <div className="lg:hidden bg-ground min-h-full pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <BackBar title="Contracts" fallback="/dashboard" />

      <SearchBox value={q} onChange={setQ} placeholder="Search customer, contract no., branch, service" />

      {/* where it stands */}
      <div data-contract-stages className="flex gap-2 px-4 pb-2.5 overflow-x-auto no-scrollbar bg-white">
        {STAGES.map((s) => {
          const on = stage === s.key;
          return (
            <button key={s.key || 'all'} type="button" onClick={() => setStage(s.key)}
              className={'h-[34px] pl-3.5 pr-2.5 rounded-full text-[13.5px] font-semibold whitespace-nowrap shrink-0 '
                + 'inline-flex items-center gap-1.5 '
                + (on ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
              {s.label}
              <span className={'min-w-[20px] h-5 px-1.5 rounded-full text-[11.5px] font-bold inline-flex items-center justify-center '
                + (on ? 'bg-white/25 text-white' : 'bg-wash text-muted')}>
                {count(s.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* what kind, which branch, in what order */}
      <div className="flex gap-2 px-4 pt-1 pb-3 overflow-x-auto no-scrollbar bg-white border-b border-line">
        <PickChip label="Type" value={kind} onPick={setKind}
          options={[{ key: '', label: 'All types' }, { key: 'amc', label: 'AMC' }, { key: 'onetime', label: 'One-time' }]} />
        {branches.length > 1 && (
          <PickChip label="Branch" value={branch} onPick={setBranch}
            options={[{ key: '', label: 'All branches' }, ...branches.map((b) => ({ key: b.id, label: b.name }))]} />
        )}
        <PickChip label="Sort" value={sort} onPick={setSort} options={SORTS} />
        {(stage || kind || branch || sort || q) && (
          <button type="button" onClick={() => { setStage(''); setKind(''); setBranch(''); setSort(''); setQ(''); }}
            className="h-[34px] px-3 rounded-full text-[13.5px] font-semibold text-accent whitespace-nowrap shrink-0">
            Clear
          </button>
        )}
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {rows && (
          <p className="text-[12.5px] text-muted px-1">
            {shown.length} {shown.length === 1 ? 'contract' : 'contracts'}
            {total > 0 && <> · <span className="font-semibold text-ink">{money(total)}</span></>}
          </p>
        )}

        {!rows ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[150px] rounded-2xl bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-white border border-line px-5 py-8 text-center">
            <p className="text-[16px] font-bold">{(rows.length ? 'Nothing matches' : 'No contracts yet')}</p>
            <p className="text-muted text-[14px] mt-1.5 leading-relaxed">
              {rows.length ? 'Try another name, or clear the filters.' : 'A contract is created from an approved quotation, or with the + button.'}
            </p>
          </div>
        ) : shown.map((r) => <ContractCard key={r.key} r={r} branch={branchName(r.branch)} />)}
      </div>

      {onNew && <Fab onClick={onNew} label="New contract" />}
    </div>
  );
}

function ContractCard({ r, branch }: { r: ContractRow; branch: string }) {
  const st = STAGE_LOOK[stageOf(r)];
  const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
  const when = r.one
    ? (r.start ? fmtDate(r.start) : 'No date') + (r.slot ? ' · ' + fmtTime(r.slot) : '')
    : fmtShort(r.start) + ' → ' + fmtDate(r.end);
  return (
    <Link href={r.standalone ? '/jobs/' + r.key : '/contracts/' + r.key} data-contract-card
      className="block rounded-2xl bg-white border border-line shadow-[0_1px_2px_rgba(20,20,20,0.04)] active:bg-wash overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        {/* who, and what it is worth */}
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full text-white text-[13px] font-bold flex items-center justify-center shrink-0"
            style={{ background: r.clientColor || '#141414' }}>
            {initialsOf(r.clientName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[16px] font-bold leading-snug truncate">{r.clientName}</p>
              <p className="text-[16px] font-bold whitespace-nowrap">{money(r.value)}</p>
            </div>
            <p className="text-[12.5px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-semibold text-navy">{r.key}</span>
              <span className="text-line">•</span>
              <span className="font-semibold">{r.one ? 'One-time' : 'AMC'}</span>
              {r.planText && <><span className="text-line">•</span><span className="truncate">{r.planText}</span></>}
            </p>
          </div>
        </div>

        {/* where and when */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-ground px-3 py-2 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-2 flex items-center gap-1">
              <Icon name="branch" size={12} /> Branch
            </p>
            <p className="text-[13.5px] font-semibold truncate mt-0.5">{branch || '—'}</p>
          </div>
          <div className="rounded-xl bg-ground px-3 py-2 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-2 flex items-center gap-1">
              <Icon name="calendar" size={12} /> {r.one ? 'Date' : 'Period'}
            </p>
            <p className="text-[13.5px] font-semibold truncate mt-0.5">{when}</p>
          </div>
        </div>

        {/* how far through */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted">
                <span className="font-bold text-ink">{r.done}</span> of {r.total} {r.total === 1 ? 'visit' : 'visits'} done
              </span>
              <span className="text-muted-2">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-wash-2 mt-1.5 overflow-hidden">
              <div className={'h-full rounded-full ' + (pct >= 100 ? 'bg-navy' : 'bg-accent')} style={{ width: pct + '%' }} />
            </div>
          </div>
          <Chip tone={st.tone}>{st.label}</Chip>
        </div>
      </div>

      {(r.next || r.shortCrew > 0) && (
        <div className="px-4 py-2.5 border-t border-line-soft bg-[#fafbfc] flex items-center justify-between gap-3 text-[12.5px]">
          {r.next ? (
            <span className="text-muted flex items-center gap-1.5 min-w-0">
              <Icon name="clock" size={13} className="shrink-0" />
              Next visit <span className="font-semibold text-ink">{relDay(r.next)}</span>
            </span>
          ) : <span />}
          {r.shortCrew > 0 && (
            <span className="font-semibold text-accent whitespace-nowrap">{r.shortCrew} to assign</span>
          )}
        </div>
      )}
    </Link>
  );
}
