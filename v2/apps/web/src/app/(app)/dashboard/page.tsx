'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type DashboardStats, type SessionUser } from '@/lib/api';
import { isFieldTech } from 'shared';
import TechDashboard from './tech-dashboard';
import { useBranchFilter } from '@/components/branch-filter';

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

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

  return (
    <div className="p-4 lg:p-6 max-w-[1200px]">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Home</h1>
          <p className="text-muted text-[13px] mt-0.5">The state of the business, right now.</p>
        </div>
        {bf.el}
      </div>

      {!s ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-md border border-line-soft bg-wash animate-pulse" />
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
