'use client';

/* ============================================================================
   Expenses — the report shelf, the way Zoho Expense shows it: analytics on
   top, status tabs, then the folders grouped by month, each a rich card with
   the claimant's avatar and a colored status chip. The admin's shelf leads
   with what needs a decision.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { initials } from '../contracts/lib';
import { catIcon, STATUS_CHIP } from './ui';

interface Row {
  id: string; title: string; date: string; status: string; branch: string;
  by: string; byName: string; byColor: string; count: number; total: number;
  payMode: string;
}
interface List {
  canManage: boolean; kmRate: number; rows: Row[];
  byMonth: Array<{ label: string; total: number }>;
  byCategory: Array<{ name: string; total: number }>;
}

const TABS: Array<{ key: string; label: string; match: (r: Row) => boolean }> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', match: (r) => r.status === 'open' },
  { key: 'submitted', label: 'Awaiting', match: (r) => r.status === 'submitted' },
  { key: 'approved', label: 'To pay', match: (r) => r.status === 'approved' },
  { key: 'paid', label: 'Paid', match: (r) => r.status === 'paid' },
  { key: 'rejected', label: 'Returned', match: (r) => r.status === 'rejected' },
];

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (iso: string) => {
  const p = iso.split('-');
  return p.length >= 2 ? `${MONTH_FULL[Number(p[1]) - 1]} ${p[0]}` : iso;
};
const fmtDate = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
};

export default function ExpensesPage() {
  const router = useRouter();
  const [data, setData] = useState<List | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.get<List>('/expenses').then(setData).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function newFolder() {
    if (creating) return;
    setCreating(true); setErr('');
    try {
      const r = await api.post<{ id: string }>('/expenses/reports', {});
      router.push('/expenses/' + r.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the folder');
      setCreating(false);
    }
  }

  if (!data) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const rows = data.rows;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTotal = rows.filter((r) => r.date.startsWith(monthKey) && r.status !== 'rejected')
    .reduce((a, r) => a + r.total, 0);
  const queueN = rows.filter((r) => r.status === 'submitted').length;
  const owed = rows.filter((r) => r.status === 'approved').reduce((a, r) => a + r.total, 0);

  const active = TABS.find((t) => t.key === tab) || TABS[0];
  const ql = q.trim().toLowerCase();
  const shown = rows.filter(active.match).filter((r) =>
    !ql || r.title.toLowerCase().includes(ql) || r.byName.toLowerCase().includes(ql)
    || r.id.toLowerCase().includes(ql));

  // Zoho groups the shelf by month.
  const groups: Array<{ month: string; rows: Row[] }> = [];
  for (const r of shown) {
    const m = monthName(r.date.slice(0, 7));
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.rows.push(r);
    else groups.push({ month: m, rows: [r] });
  }

  const hasSpend = data.byMonth.some((m) => m.total > 0);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Expenses</h1>
          <p className="text-muted text-[13px] mt-0.5">
            A folder per day, the day&rsquo;s spends inside it — approved and repaid by the admin.
          </p>
        </div>
        <button onClick={newFolder} disabled={creating}
          className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          <Icon name="plus" size={15} /> New folder for today
        </button>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      {/* ------------------------------------------------ analytics band */}
      {hasSpend && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <section className="rounded-md border border-line bg-white p-4 shadow-card">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-[13px] font-semibold">Spend, month by month</h2>
              <span className="text-[11px] text-muted-2">last 6 months</span>
            </div>
            <SpendBars months={data.byMonth} />
          </section>
          <section className="rounded-md border border-line bg-white p-4 shadow-card">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-[13px] font-semibold">Where the money goes</h2>
              <span className="text-[11px] text-muted-2">by category</span>
            </div>
            <CategoryBars cats={data.byCategory} />
          </section>
          <div className="max-lg:hidden flex flex-col gap-3">
            {[
              { label: 'This month', v: money(monthTotal), hot: false },
              { label: data.canManage ? 'To approve' : 'With the admin', v: String(queueN), hot: queueN > 0 },
              { label: data.canManage ? 'To pay out' : 'Owed to you', v: money(owed), hot: owed > 0 },
            ].map((c) => (
              <div key={c.label} className="flex-1 rounded-md border border-line bg-white px-4 py-3 shadow-card flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
                <p className={'text-[19px] font-bold leading-none ' + (c.hot ? 'text-accent' : '')}>{c.v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------- summary chips */}
      <div className={'grid grid-cols-3 gap-3 mb-4 ' + (hasSpend ? 'lg:hidden' : '')}>
        {[
          { label: 'This month', v: money(monthTotal), hot: false },
          { label: data.canManage ? 'To approve' : 'With the admin', v: String(queueN), hot: queueN > 0 },
          { label: data.canManage ? 'To pay out' : 'Owed to you', v: money(owed), hot: owed > 0 },
        ].map((c) => (
          <div key={c.label} className="rounded-md border border-line bg-white p-3.5 shadow-card">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
            <p className={'mt-1 text-[18px] font-bold leading-none ' + (c.hot ? 'text-accent' : '')}>{c.v}</p>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------- tabs + search */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const n = t.key === 'all' ? rows.length : rows.filter(t.match).length;
            if (t.key !== 'all' && n === 0 && tab !== t.key) return null;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={'h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap border transition-colors '
                  + (tab === t.key ? 'bg-navy text-white border-navy' : 'border-line text-muted hover:bg-wash')}>
                {t.label} · {n}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 h-8 px-3 rounded-full border border-line bg-wash focus-within:bg-white ml-auto min-w-[180px]">
          <Icon name="search" size={13} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders…"
            className="flex-1 bg-transparent outline-none text-[12.5px] w-[110px]" />
        </label>
      </div>

      {/* --------------------------------------------- the shelf, by month */}
      {shown.length === 0 ? (
        <div className="rounded-md border border-line p-10 text-center text-muted text-[13px]">
          {rows.length === 0
            ? <>No expense folders yet. Make one for today and put the day&rsquo;s bills inside.</>
            : <>Nothing here — switch the tab or clear the search.</>}
        </div>
      ) : groups.map((g) => (
        <div key={g.month} className="mb-5">
          <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-muted-2 mb-2">{g.month}</h2>
          <div className="flex flex-col gap-2">
            {g.rows.map((r) => {
              const chip = STATUS_CHIP[r.status] || STATUS_CHIP.open;
              return (
                <button key={r.id} onClick={() => router.push('/expenses/' + r.id)}
                  className="w-full text-left rounded-md border border-line bg-white shadow-card px-4 py-3 flex items-center gap-3 hover:border-navy/50 transition-colors">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                    style={{ background: r.byColor }}>
                    {initials(r.byName)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate">{r.title}</span>
                    <span className="block text-[11.5px] text-muted truncate">
                      {data.canManage ? r.byName + ' · ' : ''}{r.count} expense{r.count === 1 ? '' : 's'} · {fmtDate(r.date)} · {r.id}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[15px] font-bold">{money(r.total)}</span>
                    <span className={'inline-block mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ' + chip.cls}>
                      {chip.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {data.canManage && !data.kmRate && (
        <p className="mt-2 text-[12px] text-muted">
          Trip allowances need a rate: set <b>₹ per km</b> in Settings → Organisation.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- the charts */

const short = (n: number) =>
  n >= 100000 ? '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L'
  : n >= 1000 ? '₹' + Math.round(n / 1000) + 'k' : '₹' + Math.round(n);

function SpendBars({ months }: { months: List['byMonth'] }) {
  const max = Math.max(1, ...months.map((m) => m.total));
  return (
    <div className="flex items-end gap-2 h-[110px]">
      {months.map((m) => (
        <div key={m.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
          <span className="text-[9.5px] text-muted-2">{m.total > 0 ? short(m.total) : ''}</span>
          <div className="w-full max-w-[36px] rounded-t bg-accent"
            style={{ height: Math.max(m.total > 0 ? 6 : 2, (m.total / max) * 78) + 'px',
              opacity: m.total > 0 ? 1 : 0.15 }} />
          <span className="text-[10px] text-muted">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryBars({ cats }: { cats: List['byCategory'] }) {
  if (!cats.length) return <p className="py-6 text-center text-[12px] text-muted">Nothing yet.</p>;
  const max = Math.max(1, ...cats.map((c) => c.total));
  return (
    <div className="flex flex-col gap-2">
      {cats.map((c) => (
        <div key={c.name} className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded bg-red-wash text-accent flex items-center justify-center shrink-0">
            <Icon name={catIcon(c.name)} size={14} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex justify-between text-[12px] mb-0.5">
              <span className="truncate pr-2">{c.name}</span>
              <span className="font-semibold shrink-0">{money(c.total)}</span>
            </span>
            <span className="block h-1.5 rounded bg-wash overflow-hidden">
              <span className="block h-full rounded bg-navy" style={{ width: (c.total / max) * 100 + '%' }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
