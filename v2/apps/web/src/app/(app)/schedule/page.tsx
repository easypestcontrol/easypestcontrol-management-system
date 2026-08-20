'use client';

/* ============================================================================
   Schedule — month calendar + per-technician day board.

   Ported from v1 assets/js/views/schedule.js. Month: a 42-cell grid from the
   Sunday of the week containing the 1st, trailing all-out-of-month weeks
   dropped; a count badge only when a day has more than 2 jobs; the first 3
   job pills and a "+N more". Clicking a day shows its list below. Day: the
   14-day strip (-3..+10) with dots, then a kanban of technician columns with
   a workload footer and a trailing dashed "Unassigned" column.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { addDays, addMonths, dayOfWeek } from 'shared';
import {
  DOW, MONL, STATUS, durationText, fmtLong, fmtTime, todayISO,
  type DayBoard, type DayJob, type MonthData,
} from '../jobs/format';
import { Avatar, PriorityPill, StatusPill, TypePill } from '../jobs/ui';
import { useBranchFilter } from '@/components/branch-filter';

export default function Schedule() {
  const router = useRouter();
  const [view, setView] = useState<'month' | 'day'>('month');
  const [cursor, setCursor] = useState(todayISO().slice(0, 7)); // 'YYYY-MM'
  const [selDate, setSelDate] = useState(todayISO());
  const [month, setMonth] = useState<MonthData | null>(null);
  const [day, setDay] = useState<DayBoard | null>(null);

  const bf = useBranchFilter();
  useEffect(() => {
    if (view !== 'month') return;
    setMonth(null);
    api.get<MonthData>('/schedule/month?month=' + cursor + (bf.branch ? '&branch=' + bf.branch : ''))
      .then(setMonth).catch(() => {});
  }, [view, cursor, bf.branch]);

  useEffect(() => {
    if (view !== 'day') return;
    setDay(null);
    api.get<DayBoard>('/schedule/day?date=' + selDate + (bf.branch ? '&branch=' + bf.branch : ''))
      .then(setDay).catch(() => {});
  }, [view, selDate, bf.branch]);

  const [y, m] = cursor.split('-').map(Number);
  const daySel: DayJob[] = month?.days[selDate] || [];

  function nav(n: number) {
    if (view === 'month') {
      if (n === 0) { setCursor(todayISO().slice(0, 7)); setSelDate(todayISO()); }
      else setCursor(addMonths(cursor + '-01', n).slice(0, 7));
    } else {
      if (n === 0) setSelDate(todayISO());
      else setSelDate(addDays(selDate, n));
    }
  }

  return (
    <div>
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Schedule</h1>
          <span className="text-muted-2 text-[12.5px]">
            {view === 'month'
              ? (month ? MONL[m - 1] + ' ' + y + ' · ' + month.total + ' services planned' : MONL[m - 1] + ' ' + y)
              : fmtLong(selDate) + (day ? ' · ' + day.counts.total + ' jobs' : '')}
          </span>
          {bf.el}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex rounded border border-line overflow-hidden">
            {(['month', 'day'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={
                  'h-8 px-3 text-[12.5px] font-semibold ' +
                  (view === v ? 'bg-navy text-white' : 'bg-white text-ink-2 hover:bg-wash')
                }>
                {v === 'month' ? 'Month' : 'Day list'}
              </button>
            ))}
          </span>
          <Link href="/board"
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash flex items-center">
            Assign work
          </Link>
          <Link href="/jobs?new=1"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> Schedule service
          </Link>
        </div>
      </div>

      {view === 'month' ? (
        <div className="p-6">
          {/* ------------------------------------------------ month card */}
          <div className="rounded-md border border-line mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line-soft">
              <button onClick={() => nav(-1)} aria-label="Previous month"
                className="w-7 h-7 rounded flex items-center justify-center text-muted hover:bg-wash">
                <Icon name="chevRight" size={14} className="rotate-180" />
              </button>
              <h2 className="flex-1 text-center text-[14px] font-semibold">{MONL[m - 1]} {y}</h2>
              <button onClick={() => nav(1)} aria-label="Next month"
                className="w-7 h-7 rounded flex items-center justify-center text-muted hover:bg-wash">
                <Icon name="chevRight" size={14} />
              </button>
              <button onClick={() => nav(0)}
                className="h-7 px-2.5 rounded border border-line text-[12px] font-medium hover:bg-wash">
                Today
              </button>
            </div>

            {!month ? (
              <p className="p-6 text-muted text-[13px]">Loading…</p>
            ) : (
              <MonthGrid data={month} cursor={cursor} selDate={selDate}
                onPick={setSelDate} onOpen={(id) => router.push('/jobs/' + id)} />
            )}

            <div className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-line-soft">
              {(['scheduled', 'enroute', 'inprogress', 'completed'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS[k].bar }} />
                  {STATUS[k].label}
                </span>
              ))}
            </div>
          </div>

          {/* ------------------------------------------- selected day list */}
          <section className="rounded-md border border-line">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line-soft bg-wash rounded-t-md">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                {fmtLong(selDate)}
              </h3>
              <span className="zpill navy">{daySel.length} services</span>
            </div>
            {daySel.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-[14px] font-medium">Nothing scheduled</p>
                <p className="text-muted text-[12.5px] mt-1">Pick another day in the calendar above.</p>
              </div>
            ) : (
              <div>
                {daySel.map((jb) => (
                  <button key={jb.id} onClick={() => router.push('/jobs/' + jb.id)}
                    className="w-full flex items-center gap-4 px-4 py-2.5 border-b border-line-soft last:border-0 text-left hover:bg-wash">
                    <span className="w-[76px] shrink-0 text-[12.5px] font-semibold">{fmtTime(jb.slot)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-navy truncate">{jb.clientName}</span>
                      <span className="block text-[11.5px] text-muted truncate">{jb.title}</span>
                    </span>
                    <TypePill type={jb.type} visitNo={jb.visitNo} ofVisits={jb.ofVisits} />
                    <StatusPill status={jb.status} />
                    <Icon name="chevRight" size={14} className="text-muted-2 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <DayView day={day} selDate={selDate} onNav={nav} onPickDay={setSelDate}
          onOpen={(id) => router.push('/jobs/' + id)} />
      )}
    </div>
  );
}

/* =============================================================== month grid */

function MonthGrid({ data, cursor, selDate, onPick, onOpen }: {
  data: MonthData; cursor: string; selDate: string;
  onPick: (iso: string) => void; onOpen: (id: string) => void;
}) {
  const first = cursor + '-01';
  const start = addDays(first, -dayOfWeek(first));

  // 42 cells; drop trailing weeks that are entirely out of this month.
  const weeks: Array<Array<{ iso: string; out: boolean }>> = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      row.push({ iso, out: iso.slice(0, 7) !== cursor });
    }
    if (w >= 4 && row.every((c) => c.out)) break;
    weeks.push(row);
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line-soft">
        {DOW.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-2 text-center">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((row, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-line-soft last:border-0">
          {row.map((c) => {
            const jobs = data.days[c.iso] || [];
            const isToday = c.iso === data.today;
            const isSel = c.iso === selDate;
            return (
              <div key={c.iso} onClick={() => onPick(c.iso)}
                className={
                  'min-h-[92px] border-r border-line-soft last:border-r-0 p-1.5 cursor-pointer align-top ' +
                  (c.out ? 'bg-wash ' : '') + (isSel ? 'bg-red-wash ' : 'hover:bg-wash ')
                }>
                <div className="flex items-center justify-between mb-1">
                  <span className={
                    'text-[11.5px] font-semibold w-5 h-5 rounded-full flex items-center justify-center ' +
                    (isToday ? 'bg-accent text-white' : c.out ? 'text-muted-2' : 'text-ink-2')
                  }>
                    {Number(c.iso.slice(-2))}
                  </span>
                  {jobs.length > 2 && (
                    <span className="text-[10px] font-semibold text-muted">{jobs.length}</span>
                  )}
                </div>
                {jobs.slice(0, 3).map((jb) => (
                  <button key={jb.id}
                    onClick={(e) => { e.stopPropagation(); onOpen(jb.id); }}
                    title={fmtTime(jb.slot) + ' — ' + jb.clientName}
                    className={
                      'block w-full text-left truncate rounded border px-1.5 py-[1px] mb-[3px] text-[10.5px] font-medium ' +
                      (STATUS[jb.status] || STATUS.scheduled).cal
                    }>
                    {fmtTime(jb.slot).replace(':00', '')} {jb.clientName}
                  </button>
                ))}
                {jobs.length > 3 && (
                  <span className="block text-[10px] font-semibold text-muted">+{jobs.length - 3} more</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ================================================================= day view */

function DayView({ day, selDate, onNav, onPickDay, onOpen }: {
  day: DayBoard | null; selDate: string;
  onNav: (n: number) => void; onPickDay: (iso: string) => void; onOpen: (id: string) => void;
}) {
  return (
    <div className="p-6">
      {/* ------------------------------------------------------ day strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(day?.strip || []).map((s) => {
          const d = new Date(
            Number(s.date.slice(0, 4)), Number(s.date.slice(5, 7)) - 1, Number(s.date.slice(8, 10)));
          const on = s.date === selDate;
          return (
            <button key={s.date} onClick={() => onPickDay(s.date)}
              className={
                'w-[52px] shrink-0 rounded-md border py-1.5 flex flex-col items-center ' +
                (on ? 'border-navy bg-navy text-white' : 'border-line hover:bg-wash')
              }>
              <span className={'text-[10px] font-semibold uppercase ' + (on ? 'text-white/70' : 'text-muted-2')}>
                {DOW[d.getDay()]}
              </span>
              <span className="text-[15px] font-semibold leading-tight">{d.getDate()}</span>
              {s.count > 0
                ? <span className={'w-1.5 h-1.5 rounded-full mt-1 ' + (on ? 'bg-white' : 'bg-accent')} />
                : <span className="h-[9px]" />}
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- nav */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 mt-3">
        <div className="flex gap-2">
          <button onClick={() => onNav(-1)}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash flex items-center gap-1">
            <Icon name="chevRight" size={13} className="rotate-180" /> Prev
          </button>
          <button onClick={() => onNav(0)}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
            Today
          </button>
          <button onClick={() => onNav(1)}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash flex items-center gap-1">
            Next <Icon name="chevRight" size={13} />
          </button>
        </div>
        {day && (
          <div className="flex gap-2">
            <span className="zpill navy">{day.counts.completed} completed</span>
            <span className="zpill outline">{day.counts.open} open</span>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- kanban */}
      {!day ? (
        <p className="py-6 text-muted text-[13px]">Loading…</p>
      ) : (
        <div className="flex gap-3 mt-4 overflow-x-auto items-start pb-2">
          {day.techs.map((t) => (
            <div key={t.id} className="w-[250px] shrink-0 rounded-md border border-line flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-line-soft">
                <Avatar name={t.name} color={t.color} size={22} />
                <span className="min-w-0 flex-1 text-[12.5px] font-semibold truncate">{t.name}</span>
                <span className="text-[11px] font-semibold text-muted">{t.done}/{t.jobs.length}</span>
              </div>
              <div className="p-2 flex flex-col gap-2 min-h-[64px]">
                {t.jobs.length ? t.jobs.map((jb) => (
                  <KanCard key={jb.id} jb={jb} onOpen={onOpen} />
                )) : (
                  <p className="text-[12px] text-muted text-center py-4">Free all day</p>
                )}
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-line-soft">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Workload</span>
                <span className={
                  'text-[12.5px] font-bold ' +
                  (t.mins > 420 ? 'text-accent' : t.mins > 300 ? 'text-accent/70' : 'text-navy')
                }>
                  {durationText(t.mins)}
                </span>
              </div>
            </div>
          ))}

          {/* ------------------------------------------------ unassigned */}
          <div className={
            'w-[250px] shrink-0 rounded-md border border-dashed flex flex-col ' +
            (day.unassigned.length ? 'border-red-line' : 'border-line')
          }>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line-soft">
              <span className={
                'w-2 h-2 rounded-full ' + (day.unassigned.length ? 'bg-accent' : 'bg-wash-2')
              } />
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold">Unassigned</span>
              <span className="text-[11px] font-semibold text-muted">{day.unassigned.length}</span>
            </div>
            <div className="p-2 flex flex-col gap-2 min-h-[64px]">
              {day.unassigned.length ? day.unassigned.map((jb) => (
                <KanCard key={jb.id} jb={jb} onOpen={onOpen} unassigned />
              )) : (
                <p className="text-[12px] text-muted text-center py-4">Everything assigned</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KanCard({ jb, onOpen, unassigned }: {
  jb: DayJob; onOpen: (id: string) => void; unassigned?: boolean;
}) {
  const tone = STATUS[jb.status] || STATUS.scheduled;
  return (
    <button onClick={() => onOpen(jb.id)}
      className="rounded border border-line bg-white text-left px-2.5 py-2 hover:shadow-card hover:border-navy/30"
      style={{ borderLeft: '3px solid ' + tone.bar }}>
      <span className="flex items-center justify-between gap-2 mb-1">
        <span className={'text-[12px] font-bold ' + (unassigned ? 'text-accent' : '')}>
          {fmtTime(jb.slot)}
        </span>
        {unassigned ? <TypePill type={jb.type} /> : <StatusPill status={jb.status} />}
      </span>
      <span className="block text-[12.5px] font-semibold truncate">{jb.clientName}</span>
      <span className="block text-[11.5px] text-muted truncate">{jb.title}</span>
      <span className="flex items-center gap-2 mt-1.5">
        <span className="text-[10.5px] text-muted">{durationText(jb.mins)}</span>
        <PriorityPill priority={jb.priority} />
      </span>
    </button>
  );
}
