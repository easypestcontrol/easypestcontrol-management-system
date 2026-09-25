'use client';

/* ============================================================================
   Reports — the index.

   One page that lists every report by section, the way Zoho Books does it:
   pick one, it opens on screen with its range and filters, and exports as
   PDF, Excel or CSV from there. The charts that used to be this page are the
   Overview, first in the list.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/components/icons';
import { BackBar, Screen } from '@/components/mobile';

interface Meta { key: string; title: string; section: string; description: string; range: 'period' | 'asOf' }
interface Catalogue { sections: Array<{ name: string; reports: Meta[] }> }

const SECTION_ICON: Record<string, IconName> = {
  Sales: 'invoice', Receivables: 'receipt', 'Payments received': 'check', Taxes: 'report',
};

export default function ReportsIndex() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get<Catalogue>('/reports/catalogue').then(setCat).catch((e) => setErr(e.message || 'Could not load'));
  }, []);

  const overview = {
    key: 'overview', title: 'Overview', section: '',
    description: 'Revenue by month, service mix, technician leaderboard, sales pipeline and receivables ageing, on one screen.',
  };

  return (
    <>
      {/* ------------------------------------------------------------ phone */}
      <Screen>
        <BackBar title="Reports" sub="View on screen · export PDF, Excel, CSV" fallback="/dashboard" />
        <div className="px-4 pt-3 flex flex-col gap-3">
          <Link href="/reports/overview" className="card p-4 flex items-center gap-3 active:bg-wash">
            <span className="chipbox bg-sky"><Icon name="dashboard" size={20} className="text-sky-ink" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{overview.title}</span>
              <span className="block text-[12.5px] text-muted leading-snug">{overview.description}</span>
            </span>
            <Icon name="chevRight" size={18} className="text-muted-2 shrink-0" />
          </Link>
          {!cat && !err && [0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-white animate-pulse" />)}
          {err && <p className="text-rose-ink text-[13.5px] px-1">{err}</p>}
          {cat?.sections.map((s) => (
            <section key={s.name} className="card overflow-hidden">
              <h2 className="px-4 pt-3.5 pb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-2">{s.name}</h2>
              {s.reports.map((r) => (
                <Link key={r.key} href={'/reports/' + r.key}
                  className="flex items-center gap-3 px-4 py-3 border-t border-line-soft active:bg-wash">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{r.title}</span>
                    <span className="block text-[12.5px] text-muted leading-snug">{r.description}</span>
                  </span>
                  <Icon name="chevRight" size={18} className="text-muted-2 shrink-0" />
                </Link>
              ))}
            </section>
          ))}
        </div>
      </Screen>

      {/* ------------------------------------------------------------- desk */}
      <div className="max-lg:hidden">
        <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <span className="text-muted-2 text-[12.5px]">
              Every report views on screen and exports as PDF, Excel or CSV
            </span>
          </div>
        </div>

        <div className="p-6 space-y-7">
          <Link href="/reports/overview" className="card card-hover p-5 flex items-center gap-4 max-w-[720px]">
            <span className="chipbox bg-sky"><Icon name="dashboard" size={20} className="text-sky-ink" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{overview.title}</span>
              <span className="block text-[13px] text-muted mt-0.5">{overview.description}</span>
            </span>
            <Icon name="chevRight" size={18} className="text-muted-2 shrink-0" />
          </Link>

          {!cat && !err && (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded bg-wash animate-pulse" />)}
            </div>
          )}
          {err && <p className="text-rose-ink text-[13px]">{err}</p>}

          {cat?.sections.map((s) => (
            <section key={s.name}>
              <div className="flex items-center gap-2.5 mb-3">
                <Icon name={SECTION_ICON[s.name] || 'report'} size={16} className="text-muted" />
                <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-2">{s.name}</h2>
                <span className="text-[12px] text-muted-2">{s.reports.length}</span>
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {s.reports.map((r) => (
                  <Link key={r.key} href={'/reports/' + r.key} className="card card-hover p-4 flex flex-col gap-1.5 min-h-[96px]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-semibold">{r.title}</span>
                      <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-2 whitespace-nowrap">
                        {r.range === 'asOf' ? 'as of a date' : 'date range'}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-muted leading-snug">{r.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
