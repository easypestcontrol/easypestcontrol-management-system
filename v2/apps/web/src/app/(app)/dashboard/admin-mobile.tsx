'use client';

/* ============================================================================
   The office dashboard, for a phone.

   Not the desktop grid at a narrower width. A dashboard on a laptop can lay
   six equal panels side by side and let the eye choose; a phone shows one
   thing at a time down a column, so the column has to be ordered by what
   matters and nothing may compete for the same glance.

   The order is the working day: what is owed, what is happening today, what
   is next, what came in. Everything else is a number you tap to reach the
   real screen — a dashboard is a doorway, not a place to work.

   Full-bleed sections divided by hairlines rather than cards floating on a
   wash: cards inside a 390px viewport spend a quarter of the width on their
   own margins and borders.
   ========================================================================== */

import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';
import type { DashboardStats, SessionUser } from '@/lib/api';

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const compact = (n: number) => {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1).replace(/\.0$/, '') + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + Math.round(n);
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** 2026-08-21 → "21 Aug · Fri", or Today / Tomorrow. Dates are read, not parsed. */
function niceDate(iso: string): string {
  const p = String(iso || '').split('-');
  if (p.length !== 3) return iso || '';
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (Number.isNaN(d.getTime())) return iso;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.getDate() + ' ' + MON[d.getMonth()] + ' · ' + DAY[d.getDay()];
}

/* ---------------------------------------------------------------- pieces */

function Section({ title, href, action, children }: {
  title: string; href?: string; action?: string; children: React.ReactNode;
}) {
  return (
    <section className="border-t-8 border-wash">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-2">{title}</h2>
        {href && (
          <Link href={href} className="text-[12.5px] font-semibold text-accent -m-2 p-2">
            {action || 'See all'}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** A tappable row, 60px tall — a thumb is about 45px wide and never precise. */
function Row({ href, title, sub, right, rightSub }: {
  href: string; title: string; sub?: string; right?: string; rightSub?: string;
}) {
  return (
    <Link href={href}
      className="flex items-center gap-3 px-4 min-h-[60px] py-2.5 border-b border-line-soft active:bg-wash">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold truncate">{title}</span>
        {sub && <span className="block text-[12px] text-muted truncate mt-0.5">{sub}</span>}
      </span>
      {right && (
        <span className="text-right shrink-0">
          <span className="block text-[14px] font-semibold tabular-nums">{right}</span>
          {rightSub && <span className="block text-[11px] text-muted-2 mt-0.5">{rightSub}</span>}
        </span>
      )}
      <Icon name="chevRight" size={15} className="text-muted-2 shrink-0" />
    </Link>
  );
}

/* ---------------------------------------------------------------- screen */

export default function AdminMobile({ s, me, actions, branchEl }: {
  s: DashboardStats | null;
  me: SessionUser | null;
  actions: Array<{ href: string; label: string; icon: IconName }>;
  branchEl?: React.ReactNode;
}) {
  const rate = s && s.billed > 0 ? Math.round((s.collected / s.billed) * 100) : 0;
  const firstName = (me?.name || '').split(' ')[0];
  // Nothing entered yet is a stage, not an error — and a wall of zeros tells
  // nobody what to do next.
  const empty = !!s && !s.clients && !s.leads && !s.contracts && !s.billed && !s.jobsToday;

  return (
    /* The bottom nav is 60px plus the phone's gesture bar. Clearing both is what
       keeps the last row from hiding underneath it. */
    <div className="lg:hidden bg-white pb-[calc(env(safe-area-inset-bottom)+76px)]">

      {/* -------------------------------------------------------- greeting */}
      <div className="px-4 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">{greeting()}</p>
          <h1 className="text-[22px] font-semibold leading-tight truncate">
            {firstName || 'Welcome'}
          </h1>
        </div>
        {branchEl}
      </div>

      {!s ? (
        <div className="px-4 space-y-3">
          <div className="h-[132px] rounded-2xl bg-wash animate-pulse" />
          <div className="h-[86px] rounded-2xl bg-wash animate-pulse" />
          <div className="h-[86px] rounded-2xl bg-wash animate-pulse" />
        </div>
      ) : empty ? (
        <div className="px-4">
          <div className="rounded-2xl border border-line p-5">
            <p className="text-[15px] font-semibold text-center">Nothing to show yet</p>
            <p className="text-muted text-[13px] mt-1.5 leading-relaxed text-center">
              This fills itself in as the business runs. Set it up in this order and
              every screen after it has what it needs.
            </p>
            <div className="mt-4 space-y-2">
              {[
                { href: '/branches', label: 'Add your branch' },
                { href: '/services', label: 'List the services you sell' },
                { href: '/chemicals', label: 'Add your chemicals' },
                { href: '/team', label: 'Add your technicians' },
                { href: '/customers?new=1', label: 'Add your first customer' },
              ].map((x, i) => (
                <Link key={x.href} href={x.href}
                  className="flex items-center gap-3 h-12 px-3 rounded-xl border border-line active:bg-wash">
                  <span className="w-6 h-6 rounded-full bg-navy text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium">{x.label}</span>
                  <Icon name="chevRight" size={15} className="text-muted-2" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ----------------------------------------------------- the money */}
          <div className="px-4">
            <Link href="/invoices"
              className="block rounded-2xl bg-navy text-white p-5 active:brightness-110">
              <p className="text-[11px] uppercase tracking-[0.09em] text-white/55 font-semibold">
                Outstanding
              </p>
              <p className="text-[34px] font-bold leading-none mt-1.5 tabular-nums">
                {money(s.outstanding)}
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white/85" style={{ width: rate + '%' }} />
              </div>
              <p className="text-[12px] text-white/70 mt-2">
                {compact(s.collected)} collected of {compact(s.billed)} billed · {rate}%
              </p>
            </Link>
          </div>

          {/* --------------------------------------------------------- today */}
          <div className="px-4 mt-3 grid grid-cols-3 gap-2.5">
            {[
              { label: 'Today', value: s.jobsToday, href: '/schedule', alert: false },
              { label: 'Done', value: s.doneToday, href: '/schedule', alert: false },
              { label: 'Waiting', value: s.waiting, href: '/board', alert: s.waiting > 0 },
            ].map((t) => (
              <Link key={t.label} href={t.href}
                className={'rounded-2xl border p-3 active:bg-wash '
                  + (t.alert ? 'border-accent/40 bg-accent/5' : 'border-line')}>
                <p className={'text-[26px] font-bold leading-none tabular-nums '
                  + (t.alert ? 'text-accent' : '')}>{t.value}</p>
                <p className="text-[11.5px] text-muted mt-1.5">{t.label}</p>
              </Link>
            ))}
          </div>

          {/* ---------------------------------------------------- what next */}
          <div className="mt-4">
            <Section title="Next services" href="/schedule">
              {s.upcoming.length === 0 ? (
                <p className="px-4 pb-4 text-[13px] text-muted">Nothing scheduled ahead.</p>
              ) : (
                s.upcoming.slice(0, 5).map((j) => (
                  <Row key={j.id} href={'/jobs/' + j.id}
                    title={j.client}
                    sub={[j.type, j.techs || 'Nobody assigned'].filter(Boolean).join(' · ')}
                    right={j.slot || '—'}
                    rightSub={niceDate(j.date)} />
                ))
              )}
            </Section>

            <Section title="Money in" href="/invoices">
              {s.recentPayments.length === 0 ? (
                <p className="px-4 pb-4 text-[13px] text-muted">No payments recorded yet.</p>
              ) : (
                s.recentPayments.slice(0, 5).map((p) => (
                  <Row key={p.id} href={'/invoices/' + p.invoiceId}
                    title={p.client}
                    sub={[p.mode, niceDate(p.date)].filter(Boolean).join(' · ')}
                    right={money(p.amount)} />
                ))
              )}
            </Section>

            <Section title="Pipeline">
              <div className="grid grid-cols-2 gap-px bg-line-soft border-t border-line-soft">
                {[
                  { label: 'Open leads', value: s.leads, href: '/leads' },
                  { label: 'Quotes out', value: s.quotes, href: '/quotations' },
                  { label: 'Live contracts', value: s.contracts, href: '/contracts' },
                  { label: 'Customers', value: s.clients, href: '/customers' },
                ].map((c) => (
                  <Link key={c.label} href={c.href} className="bg-white px-4 py-3.5 active:bg-wash">
                    <p className="text-[22px] font-bold leading-none tabular-nums">{c.value}</p>
                    <p className="text-[11.5px] text-muted mt-1.5">{c.label}</p>
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}

      {/* --------------------------------------------------- quick actions */}
      {actions.length > 0 && (
        <Section title="Start something">
          {/* Scrolls sideways rather than wrapping: a wrapped grid of buttons
              pushes everything else off a short screen. */}
          <div className="flex gap-2.5 overflow-x-auto px-4 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {actions.map((a) => (
              <Link key={a.href} href={a.href}
                className="shrink-0 w-[104px] rounded-2xl border border-line p-3 active:bg-wash">
                <span className="w-9 h-9 rounded-full bg-wash flex items-center justify-center">
                  <Icon name={a.icon} size={17} className="text-accent" />
                </span>
                <span className="block text-[12.5px] font-semibold leading-snug mt-2.5">
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
