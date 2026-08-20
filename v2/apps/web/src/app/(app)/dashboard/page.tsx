'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type DashboardStats, type SessionUser } from '@/lib/api';
import { isFieldTech } from 'shared';
import TechDashboard from './tech-dashboard';
import { useBranchFilter } from '@/components/branch-filter';
import { Icon, type IconName } from '@/components/icons';

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
/** ₹ figures on chart axes: 47,200 → ₹47k, 3,20,027 → ₹3.2L */
const short = (n: number) => {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return '₹' + Math.round(n / 1000) + 'k';
  return '₹' + Math.round(n);
};
const fmtDate = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
};

/* The brand's chart palette: ink for what was billed, red for the money side. */
const INK = '#141414';
const RED = '#FF0000';
const MIX_COLOR: Record<string, string> = {
  overdue: RED, partial: '#8a8a8a', sent: '#c9c9c9', draft: '#e8e8e8', paid: INK,
};
const MIX_LABEL: Record<string, string> = {
  overdue: 'Overdue', partial: 'Partially paid', sent: 'Awaiting payment',
  draft: 'Draft', paid: 'Paid',
};

const ACTIONS: Array<{ href: string; label: string; icon: IconName; roles: string[] }> = [
  { href: '/leads?new=1', label: 'New lead', icon: 'leads', roles: ['admin', 'ops', 'sales'] },
  { href: '/quotations/new', label: 'New quotation', icon: 'quote', roles: ['admin', 'ops', 'sales'] },
  { href: '/customers?new=1', label: 'Add customer', icon: 'customers', roles: ['admin', 'ops', 'sales', 'accounts'] },
  { href: '/board', label: 'Schedule a service', icon: 'calendar', roles: ['admin', 'ops', 'sales'] },
  { href: '/invoices?new=1', label: 'New invoice', icon: 'invoice', roles: ['admin', 'ops', 'accounts'] },
  { href: '/tasks', label: 'Assign a task', icon: 'check', roles: ['admin', 'ops'] },
];

/**
 * Home is the same door for everyone and a different room behind it. A
 * technician gets his own day — wallet, chemicals, today's work, what he
 * collects — never the company's pipeline or its outstanding balance.
 */
export default function Dashboard() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [s, setS] = useState<DashboardStats | null>(null);
  const bf = useBranchFilter();

  useEffect(() => {
    api.get<SessionUser>('/auth/me')
      .then((u) => {
        setMe(u);
        if (isFieldTech(u.role)) return; // his numbers come from /techdash
        api.get<DashboardStats>('/dashboard' + (bf.branch ? '?branch=' + bf.branch : ''))
          .then(setS).catch(() => {});
      })
      .catch(() => {});
  }, [bf.branch]);

  if (isFieldTech(me?.role)) return <TechDashboard />;

  const cards = s ? [
    { label: 'Open leads', value: s.leads, href: '/leads', foot: 'in the pipeline' },
    { label: 'Quotes awaiting', value: s.quotes, href: '/quotations', foot: 'draft or with the customer' },
    { label: 'Live contracts', value: s.contracts, href: '/contracts', foot: 'AMC + one-time' },
    { label: "Today's services", value: s.jobsToday, href: '/schedule', foot: `${s.doneToday} completed` },
    { label: 'Waiting for a technician', value: s.waiting, href: '/board', foot: 'drag them on the board', alert: s.waiting > 0 },
    { label: 'Outstanding', value: money(s.outstanding), href: '/invoices', foot: `${money(s.collected)} collected`, alert: s.outstanding > 0 },
  ] : [];

  const actions = ACTIONS.filter((a) => !me || a.roles.includes(me.role));

  return (
    <div className="p-4 lg:p-6 max-w-[1200px]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Home</h1>
          <p className="text-muted text-[13px] mt-0.5">The state of the business, right now.</p>
        </div>
        {bf.el}
      </div>

      {/* ------------------------------------------------- quick actions */}
      <div className="mb-5 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href}
            className="flex items-center gap-2 h-9 px-3.5 rounded-md border border-line bg-white text-[12.5px] font-semibold shadow-card hover:border-navy/50 hover:bg-wash transition-colors">
            <Icon name={a.icon} size={15} className="text-accent" /> {a.label}
          </Link>
        ))}
      </div>

      {!s ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-md border border-line-soft bg-wash animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ------------------------------------------------- KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => (
              <Link key={c.label} href={c.href}
                className="rounded-md border border-line bg-white p-4 shadow-card hover:border-navy/40 transition-colors">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
                <p className={'mt-1.5 text-[26px] font-semibold leading-none ' + (c.alert ? 'text-accent' : 'text-ink')}>
                  {c.value}
                </p>
                <p className="mt-2 text-[12px] text-muted-2">{c.foot}</p>
              </Link>
            ))}
          </div>

          {/* ---------------------------------------------------- charts */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Billed vs collected" sub="last 6 months" className="lg:col-span-2">
              <MonthBars months={s.months} />
            </Panel>
            <Panel title="Invoices by status" sub="the whole book">
              <StatusDonut mix={s.invoiceMix} />
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Most-booked services" sub="last 90 days">
              {s.serviceMix.length === 0
                ? <Empty text="No services booked yet." />
                : <HBars rows={s.serviceMix.map((x) => ({ label: x.name, v: x.n }))}
                    fmt={(v) => v + ' service' + (v === 1 ? '' : 's')} />}
            </Panel>

            {s.branchSplit.length > 1 && !bf.branch ? (
              <Panel title="Branch by branch" sub="collected vs outstanding" className="lg:col-span-2">
                <BranchBars rows={s.branchSplit} />
              </Panel>
            ) : (
              <Panel title="Collection rate" sub="of everything billed" className="lg:col-span-2">
                <CollectionRate billed={s.billed} collected={s.collected} />
              </Panel>
            )}
          </div>

          {/* ------------------------------------------------- the feeds */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Upcoming services" sub="what the field does next">
              {s.upcoming.length === 0
                ? <Empty text="Nothing scheduled ahead — the board is clear." />
                : (
                  <div>
                    {s.upcoming.map((j, i) => (
                      <Link key={j.id} href={'/jobs/' + j.id}
                        className={'flex items-center gap-3 py-2.5 hover:bg-wash -mx-2 px-2 rounded ' +
                          (i < s.upcoming.length - 1 ? 'border-b border-line-soft' : '')}>
                        <span className="w-9 h-9 rounded bg-wash text-navy flex flex-col items-center justify-center shrink-0 leading-none">
                          <span className="text-[12px] font-bold">{fmtDate(j.date).split('/')[0]}</span>
                          <span className="text-[9px] text-muted">{fmtDate(j.date).split('/')[1]}</span>
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold truncate">{j.client}</span>
                          <span className="block text-[11.5px] text-muted truncate">
                            {j.slot} · {j.type}{j.techs ? ' · ' + j.techs : ' · no technician yet'}
                          </span>
                        </span>
                        <span className="text-[11.5px] text-muted-2 shrink-0">{j.id}</span>
                      </Link>
                    ))}
                  </div>
                )}
            </Panel>

            <Panel title="Latest payments" sub="money that just landed">
              {s.recentPayments.length === 0
                ? <Empty text="No payments recorded yet." />
                : (
                  <div>
                    {s.recentPayments.map((p, i) => (
                      <Link key={p.id} href={'/invoices/' + p.invoiceId}
                        className={'flex items-center gap-3 py-2.5 hover:bg-wash -mx-2 px-2 rounded ' +
                          (i < s.recentPayments.length - 1 ? 'border-b border-line-soft' : '')}>
                        <span className="w-9 h-9 rounded bg-wash text-navy flex items-center justify-center shrink-0">
                          <Icon name="invoice" size={15} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold truncate">{p.client}</span>
                          <span className="block text-[11.5px] text-muted truncate">
                            {fmtDate(p.date)} · {p.mode} · {p.invoiceId}
                          </span>
                        </span>
                        <span className="text-[13px] font-bold shrink-0">{money(p.amount)}</span>
                      </Link>
                    ))}
                  </div>
                )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================================================== chart pieces */

function Panel({ title, sub, className, children }: {
  title: string; sub: string; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={'rounded-md border border-line bg-white p-4 shadow-card ' + (className || '')}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        <span className="text-[11.5px] text-muted-2">{sub}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[12.5px] text-muted">{text}</p>;
}

/** Grouped bars, one pair per month: ink = billed, red = collected. */
function MonthBars({ months }: { months: DashboardStats['months'] }) {
  const W = 560, H = 190, PAD = 8, AXIS = 20;
  const max = Math.max(1, ...months.flatMap((m) => [m.invoiced, m.collected]));
  const bw = (W - PAD * 2) / months.length;
  const bar = Math.min(26, bw * 0.28);
  const y = (v: number) => H - AXIS - (v / max) * (H - AXIS - 14);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} stroke="#eee" strokeWidth="1" />
            <text x={W - PAD} y={y(max * f) - 3} textAnchor="end" fontSize="9" fill="#999">{short(max * f)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = PAD + bw * i + bw / 2;
          return (
            <g key={m.label}>
              <rect x={cx - bar - 2} y={y(m.invoiced)} width={bar} height={Math.max(1, H - AXIS - y(m.invoiced))}
                rx="2" fill={INK}><title>{m.label}: billed {money(m.invoiced)}</title></rect>
              <rect x={cx + 2} y={y(m.collected)} width={bar} height={Math.max(1, H - AXIS - y(m.collected))}
                rx="2" fill={RED}><title>{m.label}: collected {money(m.collected)}</title></rect>
              <text x={cx} y={H - 5} textAnchor="middle" fontSize="10" fill="#666">{m.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: INK }} /> Billed</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RED }} /> Collected</span>
      </div>
    </div>
  );
}

/** The invoice book as a donut, with the open money beside each slice. */
function StatusDonut({ mix }: { mix: DashboardStats['invoiceMix'] }) {
  const total = mix.reduce((a, x) => a + x.n, 0);
  if (!total) return <Empty text="No invoices yet." />;
  const R = 40, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-[120px] h-[120px] shrink-0">
        {mix.map((x) => {
          const frac = x.n / total;
          const el = (
            <circle key={x.status} cx="50" cy="50" r={R} fill="none"
              stroke={MIX_COLOR[x.status] || '#ccc'} strokeWidth="14"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C}
              transform="rotate(-90 50 50)">
              <title>{MIX_LABEL[x.status] || x.status}: {x.n}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
        <text x="50" y="47" textAnchor="middle" fontSize="16" fontWeight="700" fill={INK}>{total}</text>
        <text x="50" y="60" textAnchor="middle" fontSize="7.5" fill="#888">invoices</text>
      </svg>
      <div className="flex-1 min-w-[150px]">
        {mix.map((x) => (
          <div key={x.status} className="flex items-center gap-2 py-1 text-[12px]">
            <i className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: MIX_COLOR[x.status] || '#ccc' }} />
            <span className="flex-1">{MIX_LABEL[x.status] || x.status}</span>
            <span className="font-semibold">{x.n}</span>
            {x.status !== 'paid' && x.value > 0 && (
              <span className="text-muted-2 text-[11px]">{short(x.value)} due</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars for name → count rankings. */
function HBars({ rows, fmt }: { rows: Array<{ label: string; v: number }>; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="truncate pr-2">{r.label}</span>
            <span className="text-muted shrink-0">{fmt(r.v)}</span>
          </div>
          <div className="h-2 rounded bg-wash overflow-hidden">
            <div className="h-full rounded bg-accent" style={{ width: (r.v / max) * 100 + '%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Collected (ink) and still-outstanding (red) stacked per branch. */
function BranchBars({ rows }: { rows: DashboardStats['branchSplit'] }) {
  const max = Math.max(1, ...rows.map((r) => r.collected + r.outstanding));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="font-medium">{r.name}</span>
            <span className="text-muted">
              {short(r.collected)} in · <span className={r.outstanding > 0 ? 'text-accent font-semibold' : ''}>{short(r.outstanding)} due</span>
            </span>
          </div>
          <div className="h-3 rounded bg-wash overflow-hidden flex">
            <div className="h-full" style={{ width: (r.collected / max) * 100 + '%', background: INK }} />
            <div className="h-full" style={{ width: (r.outstanding / max) * 100 + '%', background: RED }} />
          </div>
        </div>
      ))}
      <div className="flex gap-4 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: INK }} /> Collected</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RED }} /> Outstanding</span>
      </div>
    </div>
  );
}

/** One honest number when there is a single branch to look at. */
function CollectionRate({ billed, collected }: { billed: number; collected: number }) {
  const pct = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-[32px] font-bold leading-none">{pct}%</span>
        <span className="text-[12.5px] text-muted">of {money(billed)} billed has been collected</span>
      </div>
      <div className="mt-3 h-3 rounded bg-wash overflow-hidden">
        <div className="h-full rounded" style={{ width: pct + '%', background: INK }} />
      </div>
      <p className="mt-2 text-[12px] text-muted-2">
        {money(billed - collected)} still to come in — the Invoices page ageing cards show where it is stuck.
      </p>
    </div>
  );
}
