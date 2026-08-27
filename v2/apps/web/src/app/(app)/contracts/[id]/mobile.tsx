'use client';

/* ============================================================================
   One contract, on a phone.

   The question asked away from a desk is always the same: how far through is
   it, and is the money coming in. So progress leads as a bar you can read at
   a glance, then the visits ahead, then the billing schedule with each
   instalment's invoice beside it.

   Editing the plan — moving visits, changing the crew, re-sequencing the
   billing — stays on the desktop. That is surgery, and it wants a mouse.
   ========================================================================== */

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Row, Screen, money, niceDate, type Tone } from '@/components/mobile';
import Mandate, { mandatePossible } from '@/components/mandate';
import Collect from '@/components/collect';

interface Job { id: string; type: string; date: string; slot: string; status: string; techIds: string[] }
interface BillingRow {
  seq: number; due: string; amount: number; label: string;
  invoice: { id: string; total: number; paid: number; status: string } | null;
}

function jobState(s: string): { tone: Tone; label: string } {
  if (s === 'completed') return { tone: 'good', label: 'Done' };
  if (s === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (s === 'inprogress' || s === 'enroute') return { tone: 'warn', label: 'Under way' };
  return { tone: 'info', label: 'Scheduled' };
}

function billState(r: BillingRow): { tone: Tone; label: string } {
  if (!r.invoice) return { tone: 'plain', label: 'Not raised yet' };
  const inv = r.invoice;
  if (inv.status === 'paid') return { tone: 'good', label: 'Paid' };
  if (inv.status === 'overdue') return { tone: 'bad', label: 'Overdue' };
  if (inv.paid > 0) return { tone: 'warn', label: 'Part paid' };
  return { tone: 'info', label: 'Raised' };
}

export default function ContractMobile({ c, role }: {
  role: string;
  c: {
    id: string; mode: string; billingMode: string; start: string; end: string; value: number;
    freq: string; planSummaryText: string; daysLeft: number;
    client: { id: string; name: string; phone?: string } | null;
    jobs: Job[];
    progress: { done: number; total: number; pct: number };
    status: { key: string; label: string };
    billingRows: BillingRow[];
  };
}) {
  const ahead = c.jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled');
  const tone: Tone = c.status.key === 'active' ? 'good'
    : c.status.key === 'expired' ? 'bad'
    : c.status.key === 'due' ? 'warn' : 'plain';

  return (
    <Screen>
      <BackBar title={c.id} fallback={'/contracts'} sub={c.client?.name || undefined} />
      {/* --------------------------------------------------- how far through */}
      <div className="bg-white px-4 pt-3 pb-5">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
            {c.mode === 'amc' ? 'Annual contract' : 'One-time'}
          </p>
          <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">
            {c.progress.done}<span className="text-muted-2"> / {c.progress.total}</span>
          </p>
          <p className="text-[13.5px] text-muted mt-0.5">visits completed</p>
          <div className="mt-2.5"><Chip tone={tone}>{c.status.label}</Chip></div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-wash overflow-hidden">
          <div className="h-full rounded-full bg-accent"
            style={{ width: Math.min(100, Math.max(2, c.progress.pct)) + '%' }} />
        </div>
        <div className="flex justify-between mt-2 text-[12.5px] text-muted">
          <span>{niceDate(c.start)}</span>
          <span>{c.daysLeft > 0 ? c.daysLeft + ' days left' : 'Ended'}</span>
          <span>{c.end ? niceDate(c.end) : ''}</span>
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {c.client && (
          <Card>
            <Link href={'/customers/' + c.client.id} className="flex items-center gap-3 -m-1 p-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold truncate">{c.client.name}</span>
                <span className="block text-[13px] text-muted truncate mt-0.5">
                  {[c.id, c.planSummaryText || c.freq].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Icon name="chevRight" size={16} className="text-muted-2 shrink-0" />
            </Link>
          </Card>
        )}

        {/* ------------------------------------------------- what is coming */}
        <Card title="Visits ahead" flush>
          {ahead.length === 0 ? (
            <p className="px-4 pb-4 text-[14px] text-muted">Every visit on this contract is done.</p>
          ) : (
            ahead.slice(0, 6).map((j) => {
              const st = jobState(j.status);
              return (
                <Row key={j.id} href={'/jobs/' + j.id}
                  title={j.type || 'Service'}
                  right={j.slot || ''}
                  meta={niceDate(j.date) + (j.techIds.length ? '' : ' · nobody assigned')}
                  chip={<Chip tone={j.techIds.length ? st.tone : 'bad'}>
                    {j.techIds.length ? st.label : 'Needs a technician'}
                  </Chip>} />
              );
            })
          )}
        </Card>

        {/* ------------------------------------------------------ the money */}
        {c.billingRows.length > 0 && (
          <Card title="Billing" flush className="mb-4">
            {c.billingRows.map((r) => {
              const st = billState(r);
              return (
                <Row key={r.seq}
                  href={r.invoice ? '/invoices/' + r.invoice.id : undefined}
                  title={r.label || 'Instalment ' + r.seq}
                  amount={money(r.amount)}
                  meta={r.due ? 'due ' + niceDate(r.due) : ''}
                  chip={<Chip tone={st.tone}>{st.label}</Chip>} />
              );
            })}
          </Card>
        )}

        {/* Where money is asked for: the agreement, not the offer. */}
        <Collect contractId={c.id} clientName={c.client?.name || ''}
          phone={c.client?.phone} role={role} variant="phone" />

        {/* An instalment that collects itself is one phone call a quarter
            that nobody has to make. */}
        {mandatePossible(c.billingMode) && (
          <Mandate contractId={c.id} role={role} variant="phone" />
        )}

        <p className="text-[13px] text-muted text-center px-4 pb-4 leading-relaxed">
          Moving visits, changing the crew and re-sequencing the billing are on
          the desktop — that is surgery, and it wants a mouse.
        </p>
      </div>
    </Screen>
  );
}
