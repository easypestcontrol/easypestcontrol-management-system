'use client';

/* ============================================================================
   One customer, on a phone.

   Opened for one of two reasons: you are about to ring them, or somebody is
   asking what they owe. So the phone number is a button rather than text,
   and the money sits directly under it — before contracts, before history.

   Everything below that is the relationship in the order it happened: what
   they are signed up for, what is coming, what has been billed.
   ========================================================================== */

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Row, Screen, money, niceDate, type Tone } from '@/components/mobile';

interface Job { id: string; date: string; slot: string; status: string; type: string }
interface Invoice {
  id: string; date: string; due: string; status: string;
  items: Array<{ desc: string; qty: number; rate: number }>;
  payments: Array<{ amount: number }>;
}
interface Contract { id: string; mode: string; start: string; end: string; value: number }

function invState(s: string): { tone: Tone; label: string } {
  if (s === 'paid') return { tone: 'good', label: 'Paid' };
  if (s === 'overdue') return { tone: 'bad', label: 'Overdue' };
  if (s === 'partial') return { tone: 'warn', label: 'Part paid' };
  if (s === 'draft') return { tone: 'plain', label: 'Draft' };
  if (s === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  return { tone: 'info', label: 'Awaiting payment' };
}

function jobState(s: string): { tone: Tone; label: string } {
  if (s === 'completed') return { tone: 'good', label: 'Completed' };
  if (s === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (s === 'inprogress' || s === 'enroute') return { tone: 'warn', label: 'Under way' };
  return { tone: 'info', label: 'Scheduled' };
}

export default function CustomerMobile({ c }: {
  c: {
    id: string; name: string; contact: string; phone: string; email: string;
    addr: string; city: string; area: string; type: string; color: string;
    contracts: Contract[]; jobs: Job[]; invoices: Invoice[];
  };
}) {
  // What they owe, from the invoices we already have — no second request for
  // a number that is sitting in the payload.
  const owed = c.invoices.reduce((a, i) => {
    if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return a;
    const total = i.items.reduce((s, it) => s + it.qty * it.rate, 0);
    const paid = i.payments.reduce((s, p) => s + p.amount, 0);
    return a + Math.max(0, total - paid);
  }, 0);

  const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('');

  return (
    <Screen>
      <BackBar title={c.name} fallback={'/customers'} />
      {/* ------------------------------------------------------ who it is */}
      <div className="bg-white px-4 pt-4 pb-5 text-center">
        <span className="w-16 h-16 rounded-full text-white text-[22px] font-bold
          flex items-center justify-center mx-auto"
          style={{ background: c.color || '#141414' }}>{initials}</span>
        <h1 className="text-[20px] font-bold mt-3 tracking-[-0.02em]">{c.name}</h1>
        <p className="text-[13.5px] text-muted mt-1">
          {[c.area || c.city, c.type].filter(Boolean).join(' · ') || c.id}
        </p>

        <div className="flex gap-2 mt-4">
          {c.phone && (
            <a href={'tel:' + c.phone}
              className="flex-1 h-12 rounded-xl bg-accent text-white font-bold text-[15px]
                flex items-center justify-center gap-2 active:brightness-90">
              <Icon name="phone" size={18} /> Call
            </a>
          )}
          {c.phone && (
            <a href={'https://wa.me/91' + c.phone.replace(/\D/g, '').slice(-10)}
              className="flex-1 h-12 rounded-xl bg-wash font-bold text-[15px]
                flex items-center justify-center active:brightness-95">
              WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {/* ------------------------------------------------------- money */}
        {owed > 0 && (
          <Link href={'/invoices?q=' + encodeURIComponent(c.name)}
            className="rounded-2xl bg-rose p-4 flex items-center gap-3 active:brightness-95">
            <span className="flex-1">
              <span className="block text-[12.5px] font-semibold text-muted">Owes you</span>
              <span className="block text-[26px] font-bold tabular-nums text-rose-ink mt-0.5">
                {money(owed)}
              </span>
            </span>
            <Icon name="chevRight" size={18} className="text-rose-ink" />
          </Link>
        )}

        {/* ---------------------------------------------------- how to reach */}
        <Card title="Contact" flush>
          {[
            { k: 'Person', v: c.contact },
            { k: 'Phone', v: c.phone },
            { k: 'Email', v: c.email },
            { k: 'Address', v: [c.addr, c.city].filter(Boolean).join(', ') },
          ].filter((x) => x.v).map((x) => (
            <div key={x.k} className="flex gap-3 px-4 py-3 border-b border-line-soft last:border-b-0">
              <span className="w-[76px] shrink-0 text-[13px] text-muted">{x.k}</span>
              <span className="flex-1 text-[14.5px] break-words">{x.v}</span>
            </div>
          ))}
        </Card>

        {/* ---------------------------------------------------- contracts */}
        {c.contracts.length > 0 && (
          <Card title="Contracts" flush>
            {c.contracts.map((ct) => (
              <Row key={ct.id} href={'/contracts/' + ct.id}
                title={ct.mode === 'amc' ? 'AMC contract' : 'One-time'}
                amount={ct.value ? money(ct.value) : undefined}
                meta={[niceDate(ct.start), ct.end ? 'to ' + niceDate(ct.end) : ''].filter(Boolean).join(' ')}
                chip={<Chip tone="info">{ct.id}</Chip>} />
            ))}
          </Card>
        )}

        {/* --------------------------------------------------- the visits */}
        {c.jobs.length > 0 && (
          <Card title="Services" flush>
            {c.jobs.slice(0, 6).map((j) => {
              const st = jobState(j.status);
              return (
                <Row key={j.id} href={'/jobs/' + j.id}
                  title={j.type || 'Service'}
                  right={j.slot || ''}
                  meta={niceDate(j.date)}
                  chip={<Chip tone={st.tone}>{st.label}</Chip>} />
              );
            })}
          </Card>
        )}

        {/* ------------------------------------------------------ billing */}
        {c.invoices.length > 0 && (
          <Card title="Invoices" flush className="mb-4">
            {c.invoices.slice(0, 6).map((i) => {
              const st = invState(i.status);
              const total = i.items.reduce((s, it) => s + it.qty * it.rate, 0);
              return (
                <Row key={i.id} href={'/invoices/' + i.id}
                  title={i.id}
                  amount={money(total)}
                  meta={niceDate(i.date)}
                  chip={<Chip tone={st.tone}>{st.label}</Chip>} />
              );
            })}
          </Card>
        )}
      </div>
    </Screen>
  );
}
