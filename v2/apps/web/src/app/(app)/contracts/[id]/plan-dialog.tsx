'use client';

/* ============================================================================
   The service plan editor - what is delivered, how often, by how many people
   and at what price, with the change to the schedule shown before it is
   applied. Visits done, under way, or hand-placed on the board are never
   touched.

   A file of its own so the contract page and the contract edit screen can
   both open it; a Next page file may only export the page.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, cadenceLabel, daysBetween, money, planVisits } from 'shared';
import { api } from '@/lib/api';
import TimePicker from '@/components/time-picker';
import { durationText, fmtShort, type Boot, type ContractDetail } from '../lib';

const btnGhost = 'flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash';
const btnRed = 'flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90';


interface EditLine {
  svId: string;
  rate: number; // per-visit price, ex-GST
  visits: number;
  months: number;
  mins: number;
  day: number;
  slot: string;
  crew: number;
  techIds: string[];
  startAt: string; // carried through untouched, like the v1 editor
}

export default function PlanDialog({ c, boot, onClose, onSaved }: {
  c: ContractDetail; boot: Boot; onClose: () => void; onSaved: (msg: string) => void;
}) {
  // Work on a copy so Cancel really cancels.
  const [lines, setLines] = useState<EditLine[]>(() => c.plan.map((l) => ({
    svId: l.svId,
    rate: Math.max(0, l.rate || 0),
    visits: l.visits,
    months: l.months || c.months || 12,
    mins: l.mins,
    day: Number((/^dom:(\d{1,2})$/.exec(l.dayRule || '') || [])[1] || '1'),
    slot: l.slot || '10:00',
    crew: Math.max(1, l.crew || 1),
    techIds: l.techIds,
    startAt: l.startAt || '',
  })));
  const [merge, setMerge] = useState(c.mergeSameDay);
  const [workdays, setWorkdays] = useState(c.workdaysOnly);
  const [diff, setDiff] = useState<{
    add: number; update: number; remove: number; kept: number; frozen: number;
    warnings: Array<{ tone: string; text: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const svcName = (sv: string) => boot.services.find((s) => s.id === sv)?.name || sv;
  const svcCode = (sv: string) => boot.services.find((s) => s.id === sv)?.code || sv;

  const body = useMemo(() => ({
    mergeSameDay: merge,
    workdaysOnly: workdays,
    plan: lines.map((l) => ({
      svId: l.svId, visits: l.visits, months: l.months, mins: l.mins,
      dayRule: 'dom:' + l.day, slot: l.slot, crew: l.crew, techIds: l.techIds,
      startAt: l.startAt, rate: l.rate,
    })),
  }), [lines, merge, workdays]);

  const preview = useMemo(() => planVisits({
    id: c.id, start: c.start, end: c.end, months: c.months || undefined,
    slot: c.slot, mergeSameDay: merge, workdaysOnly: workdays, blackout: c.blackout,
    plan: body.plan.map((l) => ({ ...l, startAt: l.startAt || undefined })),
  }), [body, c, merge, workdays]);

  const serviceVisits = lines.reduce((a, l) => a + l.visits, 0);
  const mergedCount = preview.filter((v) => v.lines > 1).length;
  const totalMins = preview.reduce((a, v) => a + v.mins, 0);

  // The diff banner asks the server, debounced, so frozen visits and
  // technician clashes are judged against the real book of work.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post<typeof diff>('/contracts/' + c.id + '/plan-diff', body)
        .then(setDiff).catch(() => {});
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  function setLine(i: number, patch: Partial<EditLine>) {
    setLines((ls) => {
      const next = ls.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function cadenceOf(l: EditLine): string {
    const from = l.startAt || c.start;
    const term = Math.max(1, daysBetween(from, addMonths(from, l.months)));
    return cadenceLabel(term / Math.max(1, l.visits), l.visits) +
      (l.visits > 1 ? ' · every ' + Math.round(term / Math.max(1, l.visits)) + ' days' : '');
  }

  async function apply() {
    setBusy(true);
    try {
      const r = await api.post<{
        added: number; updated: number; removed: number; frozen: number;
        dropped: string[];
      }>('/contracts/' + c.id + '/apply-plan', body);
      const cut = (r.dropped || [])
        .map((id) => boot.users.find((u) => u.id === id)?.name || id);
      onSaved('Schedule updated — ' + r.added + ' added · ' + r.updated + ' updated · ' +
        r.removed + ' removed · ' + r.frozen + ' completed kept' +
        (cut.length ? '. ' + cut.join(', ') + ' came off a service — the crew size was lowered below the number assigned.' : ''));
    } catch (e) {
      setBusy(false);
      onSaved(e instanceof Error ? e.message : 'Could not apply the plan');
    }
  }

  const nothing = diff && !diff.add && !diff.update && !diff.remove;
  const num = 'h-8 rounded-lg border border-line text-[12.5px] text-center outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-pop w-full max-w-[760px] max-h-[88vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Service plan · {c.id}</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Change an interval and see exactly what happens before it is applied.
        </p>

        {/* ------------------------------------------------- editable grid */}
        <div className="mt-4 rounded border border-line overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="flex gap-2 px-3 py-2 bg-wash border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted-2">
              <span className="flex-1">Service</span>
              <span className="w-[78px] shrink-0 text-right">Rate ₹</span>
              <span className="w-[58px] shrink-0">Services</span>
              <span className="w-[64px] shrink-0">Months</span>
              <span className="w-[56px] shrink-0">Day</span>
              <span className="w-[92px] shrink-0">Time</span>
              <span className="w-[74px] shrink-0">Crew</span>
            </div>
            {lines.map((l, i) => (
              <div key={l.svId + i} className="flex gap-2 items-center px-3 py-2 border-b border-line-soft last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] truncate">{svcName(l.svId)}</p>
                  <p className="text-[11px] text-muted-2">
                    {svcCode(l.svId)} · {durationText(l.mins)} ·{' '}
                    <span className="text-navy font-semibold">{cadenceOf(l).toLowerCase()}</span>
                  </p>
                </div>
                {/* The price per visit. It is asked for when the contract is
                    written and was then unreachable — while this very dialog
                    silently reset it to zero on every apply. */}
                <input className={num + ' w-[78px] shrink-0 text-right px-2'} type="number" min={0}
                  title="What one visit of this service costs, before GST"
                  value={l.rate}
                  onChange={(e) => setLine(i, {
                    rate: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  })} />
                <input className={num + ' w-[58px] shrink-0'} type="number" min={1} max={120}
                  value={l.visits}
                  onChange={(e) => setLine(i, {
                    visits: Math.min(120, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
                <input className={num + ' w-[64px] shrink-0'} type="number" min={1} max={60}
                  value={l.months}
                  onChange={(e) => setLine(i, {
                    months: Math.max(1, parseInt(e.target.value, 10) || c.months || 12),
                  })} />
                <input className={num + ' w-[56px] shrink-0'} type="number" min={1} max={31}
                  value={l.day}
                  onChange={(e) => setLine(i, {
                    day: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
                <TimePicker value={l.slot} onChange={(__t) => setLine(i, { slot: __t || '10:00' })} className={num + ' w-[92px] shrink-0 px-1'} />
                <input className={num + ' w-[74px] shrink-0'} type="number" min={1} max={9}
                  title="How many technicians this service takes"
                  value={l.crew}
                  onChange={(e) => setLine(i, {
                    crew: Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
              </div>
            ))}
          </div>
        </div>

        {/* Rates and visit counts both move the contract value, and applying
            the plan writes it. Say so before it happens rather than leaving
            it to turn up on an invoice — including the case where the stored
            value and the plan beneath it already disagree, which is not
            something anyone can see from the contract page. */}
        {(() => {
          const priced = lines.some((l) => l.rate > 0);
          const next = Math.max(0, lines.reduce(
            (a, l) => a + Math.max(0, l.rate) * Math.max(1, l.visits), 0) - (c.discount || 0));
          const moves = priced && next !== c.value;
          return (
            <div className={'mt-3 px-3 py-2 rounded border text-[12.5px] '
              + (moves ? 'border-red-line bg-red-wash' : 'border-line bg-wash')}>
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <span className={moves ? 'text-accent font-semibold' : 'text-muted'}>
                  {!priced ? 'Contract value'
                    : moves ? 'Applying this changes the contract value'
                      : 'Contract value'}
                </span>
                <span className="font-semibold tabular-nums">
                  {moves && <span className="font-normal text-muted-2 line-through mr-1.5">
                    {money(c.value)}
                  </span>}
                  {money(priced ? next : c.value)}
                  {c.discount ? (
                    <span className="font-normal text-muted-2">
                      {' '}· after {money(c.discount)} discount
                    </span>
                  ) : null}
                  <span className="font-normal text-muted-2"> · before GST</span>
                </span>
              </div>
              {!priced && (
                <p className="text-[11.5px] text-muted-2 mt-1 leading-relaxed">
                  No prices on this plan, so the value stays as it is. Fill the rate
                  column in if you want invoices priced service by service.
                </p>
              )}
            </div>
          );
        })()}

        <div className="flex gap-6 mt-3.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            Merge services falling on the same day into one visit
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={workdays} onChange={(e) => setWorkdays(e.target.checked)} />
            Skip Sundays
          </label>
        </div>

        {/* ---------------------------------------------------- preview */}
        {preview.length === 0 ? (
          <div className="mt-4 rounded border border-red-line bg-red-wash px-4 py-3 text-[13px] text-accent font-medium">
            This plan produces no visits. Check the frequency and visit counts.
          </div>
        ) : (
          <div className="mt-4 rounded border border-line bg-wash p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2.5">
              <p className="font-semibold text-[13.5px]">
                {serviceVisits} service-visits → {preview.length} trip{preview.length === 1 ? '' : 's'}
              </p>
              <p className="text-[12px] text-muted">
                {mergedCount} merged · {durationText(totalMins)} on site in total
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.slice(0, 8).map((v) => (
                <span key={v.date} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-line bg-white text-[11px]"
                  title={v.serviceIds.map(svcName).join(', ')}>
                  {fmtShort(v.date)}
                  <span className="text-muted-2">{v.serviceIds.length} svc · {v.mins}m</span>
                </span>
              ))}
              {preview.length > 8 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded border border-dashed border-line text-[11px] text-muted">
                  + {preview.length - 8} more
                </span>
              )}
            </div>
            {diff && diff.warnings.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {diff.warnings.map((wn, i) => (
                  <p key={i} className={'text-[12px] ' +
                    (wn.tone === 'crit' ? 'text-accent font-semibold'
                      : wn.tone === 'warn' ? 'text-accent' : 'text-muted')}>
                    {wn.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------- diff banner */}
        {diff && (
          <div className={'mt-3.5 rounded border px-4 py-3 text-[12.5px] ' +
            (nothing ? 'border-line bg-wash text-ink-2' : 'border-red-line bg-red-wash')}>
            <p className="font-semibold">
              {nothing ? 'No change to the schedule' : 'Applying this will change the schedule'}
            </p>
            <p className="mt-0.5 text-ink-2">
              {diff.add ? <><strong>{diff.add}</strong> service{diff.add === 1 ? '' : 's'} added · </> : null}
              {diff.update ? <><strong>{diff.update}</strong> updated · </> : null}
              {diff.remove ? <><strong>{diff.remove}</strong> removed · </> : null}
              <strong>{diff.frozen}</strong> completed service{diff.frozen === 1 ? '' : 's'} left untouched.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnRed} disabled={busy} onClick={apply}>
            {busy ? 'Applying…' : 'Apply to schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
