'use client';

/* ============================================================================
   One report, viewed.

   The same frame for every report in the catalogue: a range (a period, or a
   single "as of" date), the branch lens, whatever filters the report takes,
   the headline figures, and the table — sortable, every row a link to the
   record behind it, the totals pinned at the bottom. "Export as" hands the
   same run to the API for a PDF, an Excel sheet or a CSV, downloaded under
   the report's name and range.

   Nothing here knows what a report contains. Columns arrive typed (money, a
   count, a date) and are drawn by type, so a new report is a new query on
   the API and nothing on this side.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { money, toISO } from 'shared';
import { useBranchFilter } from '@/components/branch-filter';
import { Icon } from '@/components/icons';
import { BackBar, Filters, Screen } from '@/components/mobile';
import { saveFile } from '@/components/attach';
import { inputCls } from '../../expenses/ui';

/* ---------------------------------------------------------------- types */

type ColType = 'text' | 'money' | 'int' | 'num' | 'date' | 'pct' | 'days';
interface Col { key: string; label: string; type: ColType; tight?: boolean }
type Row = Record<string, string | number> & { href?: string };
interface Stat { label: string; value: number; type: ColType }
interface FilterSpec { key: string; label: string; kind: 'select' | 'client'; options?: Array<{ key: string; label: string }>; required?: boolean }
interface Meta { key: string; title: string; section: string; description: string; range: 'period' | 'asOf'; filters?: FilterSpec[] }
interface Result {
  key: string; title: string; section: string; description: string;
  range: { from: string; to: string; kind: 'period' | 'asOf' };
  branchName: string; filterText: string[]; columns: Col[]; rows: Row[]; totals?: Row;
  stats: Stat[]; prev?: Stat[]; generatedAt: string; generatedBy: string; note?: string;
}

/* ------------------------------------------------------------ formatting */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : iso;
const NUMERIC = new Set<ColType>(['money', 'int', 'num', 'pct', 'days']);

function fmt(v: string | number | undefined, type: ColType): string {
  if (v === undefined || v === null || v === '') return '';
  switch (type) {
    case 'money': return typeof v === 'number' ? money(v) : String(v);
    case 'int': return typeof v === 'number' ? String(Math.round(v)) : String(v);
    case 'num': return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
    case 'pct': return typeof v === 'number' ? v + '%' : String(v);
    case 'days': return typeof v === 'number' ? (v > 0 ? String(v) : '') : String(v);
    case 'date': return nice(String(v));
    default: return String(v);
  }
}

/* ---------------------------------------------------------- date ranges */

type Preset = 'month' | 'lastMonth' | 'quarter' | 'fy' | 'year' | 'custom';
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'fy', label: 'This FY' },
  { id: 'year', label: 'This year' },
];

function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  const to = toISO(now);
  switch (p) {
    case 'month': return { from: toISO(new Date(y, m, 1)), to };
    case 'lastMonth': return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    case 'quarter': return { from: toISO(new Date(y, Math.floor(m / 3) * 3, 1)), to };
    // The Indian financial year: April to March.
    case 'fy': return { from: toISO(new Date(m >= 3 ? y : y - 1, 3, 1)), to };
    default: return { from: toISO(new Date(y, 0, 1)), to };
  }
}

/** For an "as of" report: a date, not a span. */
type AsOfPreset = 'today' | 'lastMonthEnd' | 'fyEnd' | 'custom';
const ASOF: Array<{ id: AsOfPreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'lastMonthEnd', label: 'End of last month' },
  { id: 'fyEnd', label: 'Last 31 March' },
];
function asOfFor(p: AsOfPreset): string {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  if (p === 'lastMonthEnd') return toISO(new Date(y, m, 0));
  if (p === 'fyEnd') return toISO(new Date(m >= 3 ? y : y - 1, 2, 31));
  return toISO(now);
}

/* ------------------------------------------------------------------ page */

export default function ReportView() {
  const params = useParams<{ key: string }>();
  const key = String(params?.key || '');
  const search = useSearchParams();
  const router = useRouter();
  const bf = useBranchFilter();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A statement is read over the year; everything else opens on the month.
  const [preset, setPreset] = useState<Preset>(() => (key === 'customer-statement' ? 'fy' : 'month'));
  const [asOf, setAsOf] = useState<AsOfPreset>('today');
  const [from, setFrom] = useState(() => rangeFor(key === 'customer-statement' ? 'fy' : 'month').from);
  const [to, setTo] = useState(() => rangeFor('month').to);
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const c = search?.get('client'); if (c) init.client = c;
    return init;
  });
  const [compare, setCompare] = useState(false);
  const [clients, setClients] = useState<Array<{ key: string; label: string }> | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  /* the catalogue tells us what this report takes */
  useEffect(() => {
    api.get<{ sections: Array<{ reports: Meta[] }> }>('/reports/catalogue').then((c) => {
      const m = c.sections.flatMap((s) => s.reports).find((r) => r.key === key) || null;
      setMeta(m);
      if (!m) setErr('No such report');
      if (m?.filters?.some((f) => f.kind === 'client')) {
        api.get<{ options: Array<{ key: string; label: string }> }>('/reports/options/clients' + (bf.branch ? '?branch=' + bf.branch : ''))
          .then((o) => setClients(o.options)).catch(() => setClients([]));
      }
    }).catch((e) => setErr(e.message || 'Could not load'));
  }, [key, bf.branch]);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const q: Record<string, string> = { from, to, ...filters, ...extra };
    if (bf.branch) q.branch = bf.branch;
    if (compare && meta?.range === 'period') q.compare = '1';
    return Object.entries(q).filter(([, v]) => v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }, [from, to, filters, bf.branch, compare, meta]);

  const missing = (meta?.filters || []).filter((f) => f.required && !filters[f.key]);

  /* run it */
  useEffect(() => {
    if (!meta) return;
    if (missing.length) { setData(null); return; }
    let live = true;
    setBusy(true); setErr('');
    api.get<Result>('/reports/run/' + key + '?' + query())
      .then((r) => { if (live) { setData(r); setSort(null); } })
      .catch((e) => { if (live) setErr(e.message || 'Could not run the report'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, key, query, missing.length]);

  const pickPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') { const r = rangeFor(p); setFrom(r.from); setTo(r.to); }
  };
  const pickAsOf = (p: AsOfPreset) => {
    setAsOf(p);
    if (p !== 'custom') { const d = asOfFor(p); setTo(d); setFrom(d.slice(0, 4) + '-01-01' <= d ? '2000-01-01' : d); }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.rows;
    const c = data.columns.find((x) => x.key === sort.key);
    const num = c ? NUMERIC.has(c.type) : false;
    return [...data.rows].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      if (num) return ((Number(x) || 0) - (Number(y) || 0)) * sort.dir;
      return String(x ?? '').localeCompare(String(y ?? '')) * sort.dir;
    });
  }, [data, sort]);

  const toggleSort = (k: string) =>
    setSort((s) => (s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }));

  /* export: the same run, as a file. The token rides on the URL because a
     download is a plain link — the browser (or the phone's download manager)
     fetches it, not our fetch(). */
  const exportAs = (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!data) return;
    setExportOpen(false);
    const url = window.location.origin + '/api/reports/run/' + key + '?' + query({ format, t: getToken() || '' });
    const span = data.range.kind === 'asOf' ? 'as of ' + data.range.to : data.range.from + ' to ' + data.range.to;
    saveFile(url, (data.title + ' ' + span).replace(/[\\/:*?"<>|]+/g, '-') + '.' + format);
  };
  const previewPdf = () => {
    if (!data) return;
    setExportOpen(false);
    window.open('/api/reports/run/' + key + '?' + query({ format: 'pdf', inline: '1', t: getToken() || '' }), '_blank', 'noopener');
  };

  const title = data?.title || meta?.title || 'Report';
  const isAsOf = meta?.range === 'asOf';
  const rangeLabel = !data ? '' : data.range.kind === 'asOf' ? 'As of ' + nice(data.range.to) : nice(data.range.from) + ' – ' + nice(data.range.to);

  /* the report's own filters, drawn from the spec */
  const filterEls = (meta?.filters || []).map((f) => {
    const opts = f.kind === 'client' ? [{ key: '', label: 'Choose a customer…' }, ...(clients || [])] : f.options || [];
    return (
      <label key={f.key} className="flex items-center gap-2 text-[12.5px] text-muted">
        <span className="max-lg:hidden">{f.label}</span>
        <select value={filters[f.key] || ''} onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value }))}
          className="h-9 max-w-[220px] px-2.5 rounded-lg border border-line bg-wash text-[12.5px] font-medium text-ink outline-none focus:border-accent focus:bg-white">
          {opts.map((o) => <option key={o.key || '_'} value={o.key}>{o.label}</option>)}
        </select>
      </label>
    );
  });

  /* the tiles */
  const tiles = (data?.stats || []).map((s) => {
    const p = data?.prev?.find((x) => x.label === s.label);
    const delta = p ? s.value - p.value : null;
    return (
      <div key={s.label} className="card px-4 py-3.5 min-w-0">
        <p className="text-[12px] text-muted font-medium truncate">{s.label}</p>
        <p className="text-[20px] lg:text-[22px] font-bold tracking-tight tabular-nums leading-tight mt-0.5">{fmt(s.value, s.type) || '0'}</p>
        {p && (
          <p className={'text-[11.5px] mt-0.5 tabular-nums ' + ((delta || 0) > 0 ? 'text-mint-ink' : (delta || 0) < 0 ? 'text-rose-ink' : 'text-muted-2')}>
            {(delta || 0) > 0 ? '▲' : (delta || 0) < 0 ? '▼' : '·'} was {fmt(p.value, p.type) || '0'}
          </p>
        )}
      </div>
    );
  });

  /* the table */
  const table = data && (
    <div className="overflow-x-auto">
      <table className="ztable max-lg:!m-0 max-lg:!w-full">
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c.key} onClick={() => toggleSort(c.key)}
                className={'cursor-pointer select-none !px-3 ' + (NUMERIC.has(c.type) ? '!text-right' : '')}>
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sort?.key === c.key && <span className="text-accent">{sort.dir === 1 ? '↑' : '↓'}</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={data.columns.length} className="text-muted text-[13px] !py-8 text-center">Nothing in this range.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className={r.href ? 'zrow' : ''} onClick={() => r.href && router.push(r.href)}>
              {data.columns.map((c) => (
                <td key={c.key} className={(NUMERIC.has(c.type) ? 'text-right tabular-nums ' : '') + (c.tight || c.type === 'date' ? 'whitespace-nowrap ' : '')
                  + (c.type === 'text' && !c.tight ? 'font-medium text-navy ' : '') + '!px-3 !py-2.5'}>
                  {fmt(r[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {data.totals && rows.length > 0 && (
          <tfoot>
            <tr className="font-semibold bg-wash">
              {data.columns.map((c) => (
                <td key={c.key} className={(NUMERIC.has(c.type) ? 'text-right tabular-nums ' : '') + '!px-3 !py-3 border-t border-line'}>
                  {fmt((data.totals as Row)[c.key], c.type)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  const exportMenu = (
    <div className="relative">
      <button type="button" onClick={() => setExportOpen((o) => !o)} disabled={!data}
        className="h-9 px-3.5 rounded-lg bg-accent text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
        <Icon name="download" size={15} /> Export as <Icon name="chevDown" size={13} />
      </button>
      {exportOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-48 card shadow-pop p-1.5">
            {([['pdf', 'PDF'], ['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']] as const).map(([f, l]) => (
              <button key={f} type="button" onClick={() => exportAs(f)}
                className="w-full text-left px-3 h-9 rounded-md text-[13.5px] hover:bg-wash flex items-center gap-2">
                <Icon name="file" size={14} className="text-muted" /> {l}
              </button>
            ))}
            <button type="button" onClick={previewPdf}
              className="max-lg:hidden w-full text-left px-3 h-9 rounded-md text-[13.5px] hover:bg-wash flex items-center gap-2 border-t border-line-soft mt-1 pt-1">
              <Icon name="play" size={14} className="text-muted" /> Preview PDF
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* ------------------------------------------------------------ phone */}
      <Screen>
        <BackBar title={title} sub={rangeLabel || meta?.description} fallback="/reports" right={<div className="pr-2">{exportMenu}</div>} />
        {isAsOf ? (
          <Filters value={asOf} onChange={(v) => pickAsOf(v as AsOfPreset)}
            options={[...ASOF.map((x) => ({ key: x.id, label: x.label })), { key: 'custom', label: 'Pick a date' }]} />
        ) : (
          <Filters value={preset} onChange={(v) => pickPreset(v as Preset)}
            options={[...PRESETS.map((x) => ({ key: x.id, label: x.label })), { key: 'custom', label: 'Custom' }]} />
        )}
        <div className="bg-white px-4 pb-3 flex flex-wrap items-center gap-2 border-b border-line-soft">
          {(isAsOf ? asOf === 'custom' : preset === 'custom') && (
            <>
              {!isAsOf && <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls + ' !w-auto'} />}
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + ' !w-auto'} />
            </>
          )}
          {bf.el}
          {filterEls}
        </div>
        <div className="px-4 pt-3 flex flex-col gap-3">
          {err && <p className="text-rose-ink text-[13.5px]">{err}</p>}
          {missing.length > 0 && (
            <p className="card p-4 text-[14px] text-muted">Choose a {missing[0].label.toLowerCase()} above to run this report.</p>
          )}
          {busy && !data && [0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-2.5">{tiles}</div>
              <div className="card overflow-hidden">
                {rows.length === 0 && <p className="p-5 text-muted text-[14px] text-center">Nothing in this range.</p>}
                {rows.map((r, i) => {
                  const texts = data.columns.filter((c) => !NUMERIC.has(c.type));
                  const nums = data.columns.filter((c) => NUMERIC.has(c.type));
                  // The name leads (the customer, the service); ids and dates follow.
                  const lead = texts.find((c) => c.type === 'text' && !c.tight) || texts[0];
                  const rest = texts.filter((c) => c !== lead).slice(0, 3);
                  const main = nums.find((c) => c.type === 'money') || nums[0];
                  const inner = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-medium truncate">{lead ? fmt(r[lead.key], lead.type) : ''}</span>
                        <span className="block text-[12.5px] text-muted truncate">
                          {rest.map((c) => fmt(r[c.key], c.type)).filter(Boolean).join(' · ')}
                          {nums.filter((c) => c !== main).slice(0, 2).map((c) => fmt(r[c.key], c.type) ? ' · ' + c.label + ' ' + fmt(r[c.key], c.type) : '').join('')}
                        </span>
                      </span>
                      {main && <span className="text-[15px] font-bold tabular-nums shrink-0">{fmt(r[main.key], main.type)}</span>}
                    </>
                  );
                  const cls = 'flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 active:bg-wash';
                  return r.href
                    ? <Link key={i} href={r.href} className={cls}>{inner}</Link>
                    : <div key={i} className={cls}>{inner}</div>;
                })}
              </div>
              {data.note && <p className="text-[12.5px] text-muted px-1 pb-4 leading-relaxed">{data.note}</p>}
            </>
          )}
        </div>
      </Screen>

      {/* ------------------------------------------------------------- desk */}
      <div className="max-lg:hidden">
        <div className="flex items-center justify-between gap-4 px-6 h-[56px] border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/reports" className="text-muted hover:text-ink flex items-center gap-1 text-[13px] shrink-0">
              <Icon name="chevRight" size={14} className="rotate-180" /> Reports
            </Link>
            <h1 className="text-[18px] font-bold tracking-tight truncate">{title}</h1>
            {meta && <span className="text-muted-2 text-[12.5px] truncate">{meta.description}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {meta?.range === 'period' && (
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted mr-1 select-none">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous period
              </label>
            )}
            {exportMenu}
          </div>
        </div>

        {/* the range, the lens, the filters */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-line-soft bg-white">
          {isAsOf ? (
            <>
              <div className="flex rounded border border-line overflow-hidden">
                {ASOF.map((p) => (
                  <button key={p.id} onClick={() => pickAsOf(p.id)}
                    className={'h-8 px-3 text-[12.5px] font-medium transition-colors ' + (asOf === p.id ? 'bg-accent text-white' : 'bg-white text-ink-2 hover:bg-wash')}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-muted">As of
                <input type="date" value={to} onChange={(e) => { setAsOf('custom'); setTo(e.target.value); }} className={inputCls + ' !w-auto'} />
              </label>
            </>
          ) : (
            <>
              <div className="flex rounded border border-line overflow-hidden">
                {PRESETS.map((p) => (
                  <button key={p.id} onClick={() => pickPreset(p.id)}
                    className={'h-8 px-3 text-[12.5px] font-medium transition-colors ' + (preset === p.id ? 'bg-accent text-white' : 'bg-white text-ink-2 hover:bg-wash')}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-muted">From
                <input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className={inputCls + ' !w-auto'} />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-muted">To
                <input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className={inputCls + ' !w-auto'} />
              </label>
            </>
          )}
          {bf.el}
          {filterEls}
          {busy && <span className="text-[12px] text-muted-2 ml-auto">Running…</span>}
        </div>

        <div className="p-6 space-y-4">
          {err && <p className="text-rose-ink text-[13px]">{err}</p>}
          {missing.length > 0 && !err && (
            <div className="card p-8 text-center text-muted text-[13.5px]">
              Choose a {missing[0].label.toLowerCase()} to run this report.
            </div>
          )}
          {!data && !err && !missing.length && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded bg-wash animate-pulse" />)}</div>
              <div className="h-72 rounded bg-wash animate-pulse" />
            </div>
          )}
          {data && (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-[12.5px] text-muted">
                  {rangeLabel} · {data.branchName}{data.filterText.length ? ' · ' + data.filterText.join(' · ') : ''}
                </p>
                <p className="text-[12px] text-muted-2">{rows.length} rows</p>
              </div>
              <div className={'grid gap-4 ' + (tiles.length >= 5 ? 'grid-cols-5' : tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-4')}>{tiles}</div>
              <div className="-mx-6">{table}</div>
              {data.note && <p className="text-[12.5px] text-muted -mt-2">{data.note}</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
