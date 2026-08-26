'use client';

/* Reports — the v1 report calculations (reports.js / dashboard.js) as Zoho-style
   cards: revenue by month (billed vs collected), service mix, technician
   leaderboard, pipeline funnel and receivables ageing. All charts are
   hand-rolled SVG/div bars in the two-color house palette — no chart library,
   exactly like v1. */

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { money, moneyShort, toISO } from 'shared';
import { useBranchFilter } from '@/components/branch-filter';
import ReportsMobile from './mobile';
import { Filters } from '@/components/mobile';

/* ---------------------------------------------------------------- payload */

interface MonthPoint { key: string; label: string; billed: number; collected: number }
interface MixSlice { svId: string; name: string; code: string; n: number; pct: number }
interface TechRow {
  id: string; name: string; color: string; skills: string[];
  total: number; done: number; open: number; today: number; todayDone: number; rating: number;
}
interface FunnelStage { id: string; label: string; n: number; value: number }
interface AgeBucket { label: string; n: number; value: number }
interface Summary {
  range: { from: string; to: string };
  totals: {
    billed: number; collected: number; outstanding: number; overdue: number;
    visitsDone: number; completionRatePct: number; avgRating: number; openInvoices: number;
  };
  revenueByMonth: MonthPoint[];
  serviceMix: MixSlice[];
  leaderboard: TechRow[];
  funnel: { stages: FunnelStage[]; winRatePct: number; pipelineValue: number };
  ageing: AgeBucket[];
}

/* ------------------------------------------------------------ date ranges */

type Preset = 'month' | 'quarter' | 'year';
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
];

function rangeFor(p: Preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const to = toISO(now);
  if (p === 'month') return { from: toISO(new Date(y, m, 1)), to };
  if (p === 'quarter') return { from: toISO(new Date(y, Math.floor(m / 3) * 3, 1)), to };
  return { from: toISO(new Date(y, 0, 1)), to };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/* --------------------------------------------------------------- widgets */

function Card({ title, sub, foot, flush, children }: {
  title: string; sub?: string; foot?: string; flush?: boolean; children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white shadow-card flex flex-col">
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {sub && <p className="text-muted text-[12.5px] mt-0.5">{sub}</p>}
      </div>
      <div className={(flush ? '' : 'px-5 pb-5 ') + 'flex-1'}>{children}</div>
      {foot && (
        <div className="px-5 py-2.5 border-t border-line-soft text-[12px] text-muted">{foot}</div>
      )}
    </section>
  );
}

function Stat({ label, value, foot, alert }: {
  label: string; value: string; foot: string; alert?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-white shadow-card px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={'text-[22px] font-semibold mt-0.5 ' + (alert ? 'text-accent' : '')}>{value}</p>
      <p className="text-[12px] text-muted mt-1">{foot}</p>
    </div>
  );
}

function HBar({ pct, red, faded }: { pct: number; red?: boolean; faded?: boolean }) {
  return (
    <span className="block h-[7px] rounded-full bg-wash-2 overflow-hidden">
      <span
        className={'block h-full rounded-full ' + (red ? 'bg-accent' : 'bg-navy') +
          (faded ? ' opacity-30' : '')}
        style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} />
    </span>
  );
}

/* Grouped bars, hand-rolled SVG: billed navy, collected red. */
function RevenueChart({ data }: { data: MonthPoint[] }) {
  const NAVY = '#141414';
  const RED = '#FF0000';
  const GRID = 'rgba(20,20,20,0.10)';
  const TXT = 'rgba(20,20,20,0.55)';
  const W = 720; const H = 230;
  const padL = 52; const padR = 10; const padT = 12; const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.collected)));
  const group = plotW / Math.max(1, data.length);
  const bw = Math.min(26, group * 0.26);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 480 }} role="img"
        aria-label="Revenue by month — billed vs collected">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)}
              stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(max * f) + 3.5} textAnchor="end"
              fontSize={10} fill={TXT}>{moneyShort(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + group * i + group / 2;
          return (
            <g key={d.key}>
              <rect x={cx - bw - 2} y={y(d.billed)} width={bw}
                height={Math.max(d.billed > 0 ? 2 : 0, padT + plotH - y(d.billed))}
                rx={1.5} fill={NAVY}>
                <title>{`${d.label} — billed ${money(d.billed)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(d.collected)} width={bw}
                height={Math.max(d.collected > 0 ? 2 : 0, padT + plotH - y(d.collected))}
                rx={1.5} fill={RED}>
                <title>{`${d.label} — collected ${money(d.collected)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={10.5} fill={TXT}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-5 mt-2 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-navy inline-block" /> Billed (incl. GST)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-accent inline-block" /> Collected
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Reports() {
  const [preset, setPreset] = useState<Preset>('year');
  const [data, setData] = useState<Summary | null>(null);

  const bf = useBranchFilter();
  useEffect(() => {
    setData(null);
    const { from, to } = rangeFor(preset);
    api.get<Summary>(`/reports/summary?from=${from}&to=${to}` + (bf.branch ? '&branch=' + bf.branch : ''))
      .then(setData)
      .catch(() => {});
  }, [preset, bf.branch]);

  return (
    <>
      {/* A report is read by comparing charts side by side, which a phone
          cannot do. So this is the figures people quote out loud, not the
          desktop page shrunk. */}
      <ReportsMobile s={data} rangeLabel={PRESETS.find((x) => x.id === preset)?.label || ''}
        filterEl={<Filters value={preset} onChange={(v) => setPreset(v as Preset)}
          options={PRESETS.map((x) => ({ key: x.id, label: x.label }))} />} />

    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Reports</h1>
          <span className="text-muted-2 text-[12.5px] hidden sm:inline">
            Live figures from every module — no spreadsheets involved
          </span>
        </div>
        <div className="flex items-center gap-3">
        {bf.el}
        <div className="flex rounded border border-line overflow-hidden">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={'h-8 px-3 text-[12.5px] font-medium transition-colors ' +
                (preset === p.id
                  ? 'bg-accent text-white'
                  : 'bg-white text-ink-2 hover:bg-wash')}>
              {p.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {!data ? (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded bg-wash animate-pulse" />)}
          </div>
          <div className="h-72 rounded bg-wash animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-56 rounded bg-wash animate-pulse" />
            <div className="h-56 rounded bg-wash animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-4">
          <p className="text-[12.5px] text-muted -mb-1">
            {nice(data.range.from)} — {nice(data.range.to)}
          </p>

          {/* --------------------------------------------------- headline */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Billed" value={moneyShort(data.totals.billed)}
              foot="Invoices raised in this range, incl. GST" />
            <Stat label="Collected" value={moneyShort(data.totals.collected)}
              foot="Payments received in this range" />
            <Stat label="Outstanding" value={moneyShort(data.totals.outstanding)}
              foot={data.totals.openInvoices + ' open invoices, all time'} />
            <Stat label="Overdue" value={moneyShort(data.totals.overdue)}
              alert={data.totals.overdue > 0}
              foot={data.totals.overdue > 0 ? 'Needs follow-up today' : 'Nothing overdue'} />
          </div>

          {/* ---------------------------------------------------- revenue */}
          <Card title="Revenue by month" sub="Billed against collected, month by month">
            {data.revenueByMonth.every((m) => m.billed === 0 && m.collected === 0) ? (
              <p className="text-muted text-[13px] py-6">
                Nothing billed or collected in this range yet.
              </p>
            ) : (
              <RevenueChart data={data.revenueByMonth} />
            )}
          </Card>

          {/* ------------------------------------- mix + leaderboard row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Service mix"
              sub="Completed services — each one counts once per service type"
              foot={`${data.totals.visitsDone} visits completed · ${data.totals.completionRatePct}% of visits due were delivered`}>
              {data.serviceMix.length === 0 ? (
                <p className="text-muted text-[13px] py-4">No completed services in this range yet.</p>
              ) : (
                <div className="space-y-3.5">
                  {data.serviceMix.map((s, i) => (
                    <div key={s.svId}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[13px] font-medium truncate">{s.name}</span>
                        <span className="text-[12px] text-muted whitespace-nowrap ml-3">
                          {s.n} · {s.pct}%
                        </span>
                      </div>
                      <HBar pct={(s.n / Math.max(1, data.serviceMix[0].n)) * 100} red={i === 0} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Technician leaderboard" flush
              sub="Services completed in this range and customer ratings"
              foot={data.totals.avgRating
                ? `Average rating ${data.totals.avgRating.toFixed(1)} ★ across rated visits`
                : 'No rated services in this range yet'}>
              {data.leaderboard.length === 0 ? (
                <p className="text-muted text-[13px] px-5 pb-5">No technicians on the roster yet.</p>
              ) : (
                <table className="ztable">
                  <thead>
                    <tr><th>Technician</th><th>Done</th><th>Open</th><th>Rating</th></tr>
                  </thead>
                  <tbody>
                    {data.leaderboard.map((t) => {
                      const maxDone = Math.max(1, ...data.leaderboard.map((x) => x.done));
                      return (
                        <tr key={t.id}>
                          <td>
                            <span className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                                style={{ background: t.color || '#141414' }}>
                                {t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-medium text-navy truncate">{t.name}</span>
                                <span className="block text-[11px] text-muted-2 truncate">
                                  {(t.skills || []).join(', ') || '—'}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="min-w-[130px]">
                            <span className="flex items-center gap-2.5">
                              <span className="w-[70px]">
                                <HBar pct={(t.done / maxDone) * 100} />
                              </span>
                              <span className="font-semibold">{t.done}</span>
                            </span>
                          </td>
                          <td className="text-muted">{t.open}</td>
                          <td className="whitespace-nowrap font-medium">
                            {t.rating ? t.rating.toFixed(1) + ' ★' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {/* --------------------------------------- funnel + ageing row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Sales pipeline"
              sub="Every lead by stage — count and quoted value"
              foot={`Win rate ${data.funnel.winRatePct}% · ${moneyShort(data.funnel.pipelineValue)} open pipeline · snapshot as of today`}>
              <div className="space-y-3.5">
                {data.funnel.stages.map((s) => {
                  const maxN = Math.max(1, ...data.funnel.stages.map((x) => x.n));
                  return (
                    <div key={s.id}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[13px] font-medium">{s.label}</span>
                        <span className="text-[12px] text-muted">
                          {s.n} · {moneyShort(s.value)}
                        </span>
                      </div>
                      <HBar pct={(s.n / maxN) * 100}
                        red={s.id === 'won'} faded={s.id === 'lost'} />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Receivables ageing"
              sub="Open invoice balances by how late they are"
              foot={`${moneyShort(data.totals.outstanding)} outstanding across ${data.totals.openInvoices} invoices · snapshot as of today`}>
              {data.totals.openInvoices === 0 ? (
                <p className="text-muted text-[13px] py-4">
                  No open invoices — everything billed has been collected.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {data.ageing.map((b, i) => {
                    const maxV = Math.max(1, ...data.ageing.map((x) => x.value));
                    return (
                      <div key={b.label}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[13px] font-medium">{b.label}</span>
                          <span className="text-[12px] text-muted">
                            {b.n} · {money(b.value)}
                          </span>
                        </div>
                        <HBar pct={(b.value / maxV) * 100} red={i > 0} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
