'use client';

/* ============================================================================
   Quotations, on a phone - a card per quotation, in the Services card's look.

   A quotation is asked about at a gate: whose is it, what is it for, how
   much, has the customer said yes, and is it still valid. Each card answers
   all of that without opening it.
   ========================================================================== */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { money } from 'shared';
import { Icon } from '@/components/icons';
import { BackBar, Fab, SearchBox, fullDate, type Tone } from '@/components/mobile';
import { dayDelta, validOf, type Quote, type QuoteStatusKey } from './lib';

const PILL: Record<Tone, string> = {
  good: 'bg-mint text-mint-ink', bad: 'bg-rose text-rose-ink', warn: 'bg-amber text-amber-ink',
  info: 'bg-sky text-sky-ink', plain: 'bg-wash text-muted',
};

function stateOf(q: Quote): { tone: Tone; label: string } {
  if (q.status === 'approved') return { tone: 'good', label: q.contractId ? 'Approved · contract made' : 'Approved' };
  if (q.status === 'rejected') return { tone: 'bad', label: 'Declined' };
  if (q.status === 'sent') {
    return dayDelta(validOf(q)) < 0 ? { tone: 'warn', label: 'Expired' } : { tone: 'info', label: 'With the customer' };
  }
  return { tone: 'plain', label: 'Draft' };
}

const TABS: Array<{ key: 'all' | QuoteStatusKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Declined' },
];

export default function PhoneQuotations({ rows, totalOf, userName, serviceName }: {
  rows: Quote[] | null;
  totalOf: (q: Quote) => number;
  userName: (id: string) => string;
  serviceName: (svId: string) => string;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | QuoteStatusKey>('all');

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((x) => !needle
      || (x.id + ' ' + x.title + ' ' + (x.partyName || '') + ' ' + x.refNo).toLowerCase().includes(needle));
  }, [rows, q]);
  const shown = base
    .filter((x) => tab === 'all' || x.status === tab)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  const count = (k: 'all' | QuoteStatusKey) => (k === 'all' ? base.length : base.filter((x) => x.status === k).length);
  const total = shown.reduce((a, x) => a + totalOf(x), 0);

  return (
    <div className="lg:hidden bg-ground min-h-full pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <BackBar title="Quotations" fallback="/dashboard" />
      <SearchBox value={q} onChange={setQ} placeholder="Search customer, subject or quote no." />
      <div className="flex gap-2 px-4 pt-2 pb-2.5 overflow-x-auto no-scrollbar bg-white border-b border-line">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={'h-[30px] pl-3 pr-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 '
                + (on ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
              {t.label}
              <span className={'min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold inline-flex items-center justify-center '
                + (on ? 'bg-white/25 text-white' : 'bg-wash text-muted')}>{count(t.key)}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-3 flex flex-col gap-2.5">
        {rows && (
          <p className="text-sm text-muted px-1">
            {shown.length} {shown.length === 1 ? 'quotation' : 'quotations'}
            {total > 0 && <> · <span className="font-semibold text-ink">{money(total)}</span></>}
          </p>
        )}
        {!rows ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[140px] rounded-xl bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <div className="row-card text-center py-8">
            <p className="text-base font-bold">{rows.length ? 'Nothing matches' : 'No quotations yet'}</p>
            <p className="text-sm text-muted mt-1">
              {rows.length ? 'Try another name, or another tab.' : 'Raise one with the red button.'}
            </p>
          </div>
        ) : shown.map((x) => <QuoteCard key={x.id} x={x} total={totalOf(x)} owner={userName(x.owner)} serviceName={serviceName} />)}
      </div>

      <Fab href="/quotations/new" label="New quotation" />
    </div>
  );
}

function QuoteCard({ x, total, owner, serviceName }: {
  x: Quote; total: number; owner: string; serviceName: (svId: string) => string;
}) {
  const st = stateOf(x);
  const valid = validOf(x);
  const left = dayDelta(valid);
  const services = x.items.map((i) => i.name || serviceName(i.svId) || i.desc).filter(Boolean);
  const kind = x.mode === 'amc' ? 'AMC' + (x.months ? ' · ' + x.months + ' months' : '') : 'One-time';
  return (
    <Link href={'/quotations/' + x.id} data-row-card
      className="block rounded-xl bg-white border border-[#cfd4de] overflow-hidden active:bg-wash
        shadow-[0_1px_3px_rgba(20,20,20,0.08),0_4px_12px_rgba(20,20,20,0.08)]">
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-base font-bold truncate">{x.partyName || x.clientId || 'Customer'}</p>
          <p className="text-base font-bold tabular-nums shrink-0">{money(total)}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <span className={'shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-xs font-semibold whitespace-nowrap ' + PILL[st.tone]}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{st.label}
          </span>
          <span className="text-sm text-ink-2 truncate">{x.title || 'No subject'}</span>
        </div>

        <div className="mt-2.5 rounded-lg bg-ground px-2.5 py-2 flex items-center gap-2 min-w-0">
          <Icon name="calendar" size={14} className="text-muted shrink-0" />
          <p className="min-w-0 flex-1 text-sm truncate whitespace-nowrap">
            <span className="font-semibold">{fullDate(x.date)}</span>
            {x.status !== 'approved' && x.status !== 'rejected' && (
              <span className={left < 0 ? 'text-accent font-semibold' : 'text-muted'}>
                {' · '}{left < 0 ? 'expired ' + fullDate(valid).slice(5) : 'valid till ' + fullDate(valid).slice(5)}
              </span>
            )}
          </p>
        </div>

        {services.length > 0 && (
          <p className="mt-2 text-sm text-sky-ink font-semibold truncate">
            <span className="text-xs font-bold uppercase tracking-[0.05em] text-muted-2 mr-1.5">
              {services.length === 1 ? 'Service' : 'Services'}
            </span>
            {services.join(' + ')}
          </p>
        )}
      </div>
      <div className="px-3.5 py-2 border-t border-line-soft bg-[#fafbfc] flex items-center gap-2.5">
        <p className="flex-1 min-w-0 text-sm truncate">
          <span className="font-semibold">{kind}</span>
          {owner && <span className="text-muted"> · {owner}</span>}
          {x.refNo && <span className="text-muted"> · Ref {x.refNo}</span>}
        </p>
        <span className="text-xs font-mono text-muted-2 shrink-0">{x.id}</span>
      </div>
    </Link>
  );
}
