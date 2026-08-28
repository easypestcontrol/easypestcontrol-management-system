'use client';

/* ============================================================================
   A technician's home.

   The office dashboard asks "how is the business doing". This one asks the
   three questions a person in the field actually has at 8am:

     What do I owe?   — cash in my pocket, chemicals signed out to me
     What am I doing? — today, then tomorrow, then the rest
     What do I collect? — and, once the visit is done, what I did collect

   Everything on this screen is something the system already records against
   him: payments he took, stock issued to him, the execution record of each
   visit, and the distance his trips measured. Nothing here is about anybody
   else's work, and nothing here is a company total.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/components/icons';
import { Hero, HeroStats, HeroButton } from '@/components/mobile';
import { StatusPill, Stars } from '../jobs/ui';
import { fmtTime, relDay } from '../jobs/format';

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** "1 service" / "3 services" — never "1 service(s)" on a screen a person reads. */
const plural = (n: number, one: string, many?: string) =>
  n + ' ' + (n === 1 ? one : (many || one + 's'));

interface Row {
  id: string; date: string; slot: string; type: string; status: string;
  title: string; clientName: string; area: string; contact: string; phone: string;
  visitNo?: number; ofVisits?: number;
  isHead: boolean; crewSize: number;
  collectOnSite: boolean; due: number;
  invoice: { id: string; total: number; paid: number; balance: number } | null;
  started: boolean; checkedIn: boolean; reportSent: boolean; rating: number;
}

export interface TechDash {
  who: { id: string; name: string; color: string };
  today: string;
  wallet: { inHand: number; unsettled: number; collectedToday: number };
  stock: {
    lines: number; shortages: number;
    list: Array<{ itemId: string; name: string; unit: string; qty: number; short: boolean }>;
  };
  money: { toCollectToday: number; collectedToday: number };
  services: { today: Row[]; tomorrow: Row[]; upcoming: Row[] };
  attention: Array<{ kind: string; text: string; href: string }>;
  month: {
    completed: number; avgRating: number; ratedCount: number;
    minutesOnSite: number; trips: number; distanceKm: number;
  };
}

/* ------------------------------------------------------------- quick look */

function Tile({ label, value, foot, href, icon, alert }: {
  label: string; value: React.ReactNode; foot: string;
  href: string; icon: IconName; alert?: boolean;
}) {
  return (
    <Link href={href}
      className={'rounded-xl border bg-white p-4 shadow-card active:bg-wash lg:hover:border-navy/40 '
        + 'transition-colors ' + (alert ? 'border-accent/50' : 'border-line')}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon name={icon} size={13} className="opacity-70" />
        {label}
      </span>
      <p className={'mt-2 text-[24px] font-bold leading-none ' + (alert ? 'text-accent' : 'text-navy')}>
        {value}
      </p>
      <p className="mt-2 text-[11.5px] text-muted-2 leading-snug">{foot}</p>
    </Link>
  );
}

/* ------------------------------------------------------------ one service */

function ServiceRow({ r }: { r: Row }) {
  // What this visit is worth to him: the invoice balance once one exists,
  // the contract rate before that, and the amount paid once it is settled.
  const collected = r.invoice ? r.invoice.paid : 0;
  const outstanding = r.invoice ? r.invoice.balance : (r.collectOnSite ? r.due : 0);

  return (
    <Link href={'/jobs/' + r.id}
      className="block px-4 py-3.5 active:bg-wash lg:hover:bg-wash transition-colors">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-navy truncate">{r.clientName}</span>
          <span className="block text-[12.5px] text-ink-2 leading-snug">{r.title}</span>
        </span>
        <StatusPill status={r.status} />
      </div>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-navy">
          <Icon name="calendar" size={13} className="opacity-70" />
          {relDay(r.date)} · {fmtTime(r.slot)}
        </span>
        {r.area && <span className="text-muted">{r.area}</span>}
        {r.crewSize > 1 && (
          <span className="text-muted">{r.isHead ? 'You lead the crew' : 'Crew of ' + r.crewSize}</span>
        )}
      </div>

      {(outstanding > 0 || collected > 0) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2.5 pt-2.5 border-t border-line-soft text-[12px]">
          {collected > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-navy">
              <Icon name="check" size={12} /> {money(collected)} collected
            </span>
          )}
          {outstanding > 0 && (
            <span className="font-semibold text-accent">{money(outstanding)} to collect</span>
          )}
          {r.invoice && <span className="font-mono text-[11px] text-muted-2">{r.invoice.id}</span>}
          {!r.invoice && r.collectOnSite && (
            <span className="text-[11px] text-muted-2">invoice raised when you finish</span>
          )}
        </div>
      )}

      {r.status === 'completed' && r.rating > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Stars n={r.rating} size={12} />
          <span className="text-[11px] text-muted-2">customer rating</span>
        </div>
      )}
    </Link>
  );
}

function ServiceCard({ title, sub, rows, empty }: {
  title: string; sub?: string; rows: Row[]; empty: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-white shadow-card overflow-hidden">
      <header className="px-4 py-3 border-b border-line-soft flex items-baseline justify-between gap-3">
        <h2 className="text-[13.5px] font-bold">{title}</h2>
        <span className="text-[11.5px] text-muted-2">{sub || plural(rows.length, 'service')}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-muted text-center">{empty}</p>
      ) : (
        <div className="divide-y divide-line-soft">
          {rows.map((r) => <ServiceRow key={r.id} r={r} />)}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export default function TechDashboard() {
  const [d, setD] = useState<TechDash | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<TechDash>('/techdash').then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load your day'));
  }, []);

  if (err) {
    return <p className="p-6 text-[13px] text-accent">{err}</p>;
  }
  if (!d) {
    return (
      <div className="p-4 lg:p-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-xl border border-line-soft bg-wash animate-pulse" />
        ))}
      </div>
    );
  }

  const done = d.services.today.filter((r) => r.status === 'completed').length;
  const first = d.services.today.find((r) => r.status !== 'completed');

  const line = d.services.today.length === 0
    ? 'Nothing scheduled for you today.'
    : done === d.services.today.length
      ? `All ${plural(d.services.today.length, 'service')} done. Good day.`
      : `${done} of ${d.services.today.length} done${first ? ' · next is ' + first.clientName + ' at ' + fmtTime(first.slot) : ''}.`;

  return (
    <>
      {/* --------------------------------------------- the band, on a phone

          The three things he is answerable for, on the brand rather than in
          a row of white boxes below it — because this is the screen he opens
          at a gate with one hand, and these are the numbers he is asked
          about. The desktop keeps its own quieter heading below.            */}
      <div className="lg:hidden">
        <Hero
          eyebrow={line}
          title={d.who.name.split(' ')[0] + '’s day'}
          right={<HeroButton name="bell" href="/tasks" label="Tasks" />}>
          <HeroStats items={[
            { label: 'Wallet', value: money(d.wallet.inHand), icon: 'invoice', href: '/wallet' },
            { label: 'Today', value: d.services.today.length, icon: 'check', href: '/jobs' },
            { label: 'Done', value: done, icon: 'check', href: '/jobs' },
          ]} />
        </Hero>
      </div>

    <div className="p-4 lg:p-6 max-w-[1100px] flex flex-col gap-4 lg:gap-5">
      {/* ------------------------------------------------------- greeting */}
      <div className="max-lg:hidden">
        <h1 className="text-[19px] lg:text-[20px] font-semibold">
          {d.who.name.split(' ')[0]}&rsquo;s day
        </h1>
        <p className="text-muted text-[13px] mt-0.5">{line}</p>
      </div>

      {/* ----------------------------------------------------- quick look
          Three things he is answerable for, before anything he has to do.
          On a phone they are already up on the band. */}
      <div className="max-lg:hidden grid grid-cols-3 gap-2.5 lg:gap-4">
        <Tile label="Wallet" href="/wallet" icon="invoice"
          value={money(d.wallet.inHand)} alert={d.wallet.inHand > 0}
          foot={d.wallet.inHand > 0
            ? `${plural(d.wallet.unsettled, 'collection')} to hand in`
            : 'nothing to hand over'} />
        <Tile label="Chemicals" href="/wallet" icon="inventory"
          value={d.stock.lines} alert={d.stock.shortages > 0}
          foot={d.stock.shortages > 0
            ? `${d.stock.shortages} short — tell the store`
            : d.stock.lines ? 'items signed out to you' : 'nothing signed out to you'} />
        <Tile label="Today" href="/jobs" icon="check"
          value={d.services.today.length}
          foot={d.services.today.length ? `${done} completed` : 'no services'} />
      </div>

      {/* --------------------------------------------------------- money */}
      <section className="rounded-xl border border-line bg-white shadow-card overflow-hidden">
        <header className="px-4 py-3 border-b border-line-soft">
          <h2 className="text-[13.5px] font-bold">Money today</h2>
        </header>
        <div className="grid grid-cols-2 divide-x divide-line-soft">
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">To collect</p>
            <p className={'mt-1.5 text-[22px] font-bold leading-none '
              + (d.money.toCollectToday > 0 ? 'text-accent' : 'text-muted-2')}>
              {money(d.money.toCollectToday)}
            </p>
            <p className="mt-2 text-[11.5px] text-muted-2">
              {d.money.toCollectToday > 0
                ? 'across today’s services — only per-service contracts'
                : 'nothing to collect on site today'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Collected</p>
            <p className={'mt-1.5 text-[22px] font-bold leading-none '
              + (d.money.collectedToday > 0 ? 'text-navy' : 'text-muted-2')}>
              {money(d.money.collectedToday)}
            </p>
            <p className="mt-2 text-[11.5px] text-muted-2">
              {d.money.collectedToday > 0 ? 'taken in today, cash and UPI' : 'nothing collected yet'}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- attention
          Only ever things he can act on himself. */}
      {d.attention.length > 0 && (
        <section className="rounded-xl border border-accent/40 bg-red-wash overflow-hidden">
          <header className="px-4 pt-3 pb-1">
            <h2 className="text-[13.5px] font-bold text-accent">Needs you</h2>
          </header>
          <div className="px-4 pb-3 flex flex-col gap-1.5">
            {d.attention.map((a, i) => (
              <Link key={i} href={a.href}
                className="flex items-start gap-2 text-[12.5px] text-ink-2 active:opacity-70">
                <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="flex-1">{a.text}</span>
                <Icon name="chevRight" size={13} className="mt-0.5 text-accent shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- the work */}
      <ServiceCard title="Today" rows={d.services.today}
        sub={d.services.today.length ? `${done} of ${d.services.today.length} done` : undefined}
        empty="Nothing scheduled for you today." />

      <ServiceCard title="Tomorrow" rows={d.services.tomorrow}
        empty="Nothing scheduled for tomorrow yet." />

      <ServiceCard title="Coming up" rows={d.services.upcoming}
        sub={d.services.upcoming.length ? 'next ' + d.services.upcoming.length : undefined}
        empty="Nothing further on your list." />

      {/* ------------------------------------------------- the month so far */}
      <section className="rounded-xl border border-line bg-white shadow-card overflow-hidden">
        <header className="px-4 py-3 border-b border-line-soft flex items-baseline justify-between">
          <h2 className="text-[13.5px] font-bold">Your month so far</h2>
          <span className="text-[11.5px] text-muted-2">recorded from your own visits</span>
        </header>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line-soft">
          {[
            { label: 'Services done', value: d.month.completed, foot: 'finished and signed' },
            {
              label: 'Customer rating',
              value: d.month.avgRating ? d.month.avgRating.toFixed(1) : '—',
              foot: d.month.ratedCount ? `${d.month.ratedCount} rated` : 'none rated yet',
            },
            {
              label: 'Time on site',
              value: Math.round(d.month.minutesOnSite / 60) + 'h',
              foot: 'start to finish',
            },
            {
              label: 'Distance',
              value: d.month.distanceKm + ' km',
              foot: `${plural(d.month.trips, 'trip')}, road measured`,
            },
          ].map((m) => (
            <div key={m.label} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{m.label}</p>
              <p className="mt-1.5 text-[20px] font-bold leading-none text-navy">{m.value}</p>
              <p className="mt-1.5 text-[11.5px] text-muted-2">{m.foot}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
