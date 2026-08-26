'use client';

/* ============================================================================
   Invoices, on a phone.

   The desktop screen carries ageing buckets, bulk selection, date ranges and
   an export — all of which are a Monday-morning desk job. On a phone this
   list exists for one reason: somebody has asked about their bill, and you
   need to find it and see where it stands.

   So the state comes first. Every row says "Overdue by 6 days" or "Part paid"
   in words with a coloured dot, and you read that before you read the number.
   ========================================================================== */

import { useMemo, useState } from 'react';
import {
  Card, Chip, Row, Screen, Filters, ScreenTitle, IconButton, Fab,
  money, niceDate, type Tone,
} from '@/components/mobile';
import type { InvoiceRow, ListResponse } from './ui';

/* ------------------------------------------------------------------ state */

/**
 * How an invoice reads to a person.
 *
 * Overdue is stated in days rather than as a bare word, because "overdue" is
 * an argument and "overdue by 6 days" is a fact. Partly paid names what is
 * still owed, since that is the number the customer is about to ask for.
 */
function stateOf(r: InvoiceRow): { tone: Tone; label: string } {
  if (r.status === 'paid') return { tone: 'good', label: 'Paid' };
  if (r.status === 'draft') return { tone: 'plain', label: 'Draft' };
  if (r.status === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (r.daysLate > 0) {
    return {
      tone: 'bad',
      label: r.daysLate === 1 ? 'Overdue by a day' : `Overdue by ${r.daysLate} days`,
    };
  }
  if (r.paid > 0) return { tone: 'warn', label: `Part paid · ${money(r.balance)} left` };
  return { tone: 'info', label: r.due ? `Due ${niceDate(r.due)}` : 'Awaiting payment' };
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'open', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'draft', label: 'Draft' },
];

/* ----------------------------------------------------------------- screen */

export default function InvoicesMobile({ data, tab, onTab, q, onQ, onNew }: {
  data: ListResponse | null;
  tab: string;
  onTab: (t: string) => void;
  q: string;
  onQ: (v: string) => void;
  onNew: () => void;
}) {
  const [searching, setSearching] = useState(false);

  const rows = data?.rows || [];
  // The receivable line is worth carrying: it is the reason most people open
  // this screen, and it saves going back to Home to find it.
  const owed = useMemo(
    () => rows.reduce((a, r) => a + (r.status === 'paid' || r.status === 'cancelled' ? 0 : r.balance), 0),
    [rows],
  );

  return (
    <Screen>
      <ScreenTitle title="Invoices">
        <IconButton name="search" label="Search invoices" onClick={() => setSearching((v) => !v)} />
      </ScreenTitle>

      {searching && (
        <div className="bg-white px-4 pb-3">
          <input value={q} onChange={(e) => onQ(e.target.value)} autoFocus
            placeholder="Customer, invoice number…"
            className="w-full h-11 px-3.5 rounded-xl bg-ground text-[15px] outline-none
              focus:ring-2 focus:ring-accent/30" />
        </div>
      )}

      <Filters value={tab} onChange={onTab} options={TABS} />

      {!data ? (
        <div className="px-4 pt-3 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[84px] rounded-2xl bg-white animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 pt-3">
          <Card>
            <p className="text-[16px] font-bold text-center">
              {q ? 'Nothing matches that' : 'No invoices here'}
            </p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              {q
                ? 'Try the customer name, or the invoice number.'
                : tab === 'all'
                  ? 'Raise one with the red button.'
                  : 'Nothing in this state right now.'}
            </p>
          </Card>
        </div>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-3">
          {owed > 0 && (
            <div className="flex items-baseline justify-between px-1">
              <span className="text-[13px] text-muted">
                {rows.length} {rows.length === 1 ? 'invoice' : 'invoices'}
              </span>
              <span className="text-[14px] font-semibold">
                {money(owed)} <span className="text-muted font-normal">still owed</span>
              </span>
            </div>
          )}

          <Card flush className="mb-4">
            {rows.map((r) => {
              const st = stateOf(r);
              return (
                <Row key={r.id} href={'/invoices/' + r.id}
                  title={r.clientName || r.clientId}
                  amount={money(r.total)}
                  meta={`${niceDate(r.date)} · ${r.id}`}
                  chip={<Chip tone={st.tone}>{st.label}</Chip>} />
              );
            })}
          </Card>
        </div>
      )}

      <Fab onClick={onNew} label="New invoice" />
    </Screen>
  );
}
