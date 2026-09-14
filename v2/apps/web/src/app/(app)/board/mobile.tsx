'use client';

/* ============================================================================
   Dispatch, on a phone.

   The board is a day-wide timeline you rearrange with a mouse, so the phone
   was handed a card saying "the board needs a bigger screen" and a way out.
   That is true of the timeline and false of the job: giving work to somebody
   is not a drag, it is a decision — this job, that technician — and the
   server already knows who is free, who is nearest and who has been to this
   customer before.

   So the phone gets the decision without the canvas. Work with nobody on it
   comes first, because it is the only thing on this screen that can go wrong.
   Tapping Assign asks the server who should do it and shows the answer in
   order, with the reason and how full their day already is. Everything else
   is each technician's day, in time order, where a job can be moved or taken
   off them.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import Confirm, { type ConfirmSpec } from '@/components/confirm';
import { BackBar, Card, Screen, SearchBox } from '@/components/mobile';

/* ------------------------------------------------------------------ types */

export interface DayTech {
  id: string; name: string; color: string; title: string;
  skills: string[]; branches: string[];
  hours: { from: string; to: string; days: number[] };
  off: boolean; booked: number; avail: number; pct: number; over: boolean;
}
export interface DayJob {
  id: string; clientId: string; clientName: string; addr: string; city: string;
  serviceIds: string[]; serviceNames: string[];
  date: string; slot: string; mins: number; techIds: string[];
  crewNeed: number; status: string; priority: string; pinned: boolean;
  branchId: string; branchName: string;
}
export interface WeekDay { date: string; jobs: number; unassigned: number }
export interface DayPayload {
  date: string;
  groups: Array<{ branchId: string; branchName: string; techs: DayTech[] }>;
  jobs: DayJob[];
  queue: DayJob[];
  week: WeekDay[];
}
interface SuggestRow {
  tech: { id: string; name: string; color: string };
  score: number; at: number | null; bookedPct: number;
  /* Each reason carries whether it counts FOR the person or against them —
     "On this customer's contract" and "Already over their hours" are both
     reasons, and a row that prints them the same way is no help at all. */
  why: Array<{ good: boolean; text: string }>;
}

/* ---------------------------------------------------------------- helpers */

const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dowOf = (iso: string) => DOW[new Date(iso + 'T00:00:00').getDay()];
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const longDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()];
};

/** "14:30" → "2:30 pm"; a minute count → the same. */
const clock = (v: string | number) => {
  const mins = typeof v === 'number'
    ? v
    : (Number(String(v).slice(0, 2)) * 60 + Number(String(v).slice(3, 5)));
  if (!isFinite(mins)) return '';
  const h = Math.floor(mins / 60) % 24;
  return ((h + 11) % 12 + 1) + ':' + pad(mins % 60) + ' ' + (h < 12 ? 'am' : 'pm');
};
const hrs = (m: number) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm');
const initials = (n: string) =>
  String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* ----------------------------------------------------------------- screen */

export default function DispatchMobile() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [d, setD] = useState<DayPayload | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  /** The job being given to somebody, and who the server suggests for it. */
  const [assigning, setAssigning] = useState<DayJob | null>(null);
  const [rows, setRows] = useState<SuggestRow[] | null>(null);
  const [openJob, setOpenJob] = useState<DayJob | null>(null);

  const load = useCallback(() => {
    api.get<DayPayload>('/dispatch/day?date=' + date)
      .then(setD)
      .catch(() => setD(null));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'That did not go through'); }
    setBusy(false);
  }

  function openAssign(j: DayJob) {
    setAssigning(j);
    setRows(null);
    api.get<SuggestRow[]>('/dispatch/suggest?jobId=' + j.id + '&date=' + date + '&limit=8')
      .then(setRows)
      .catch(() => setRows([]));
  }

  async function give(j: DayJob, techId: string, at: number | null) {
    setAssigning(null);
    await act(() => api.post('/dispatch/place', {
      jobId: j.id, techIds: [techId], date, startMin: at,
    }));
  }

  const techs = (d?.groups || []).flatMap((g) => g.techs);
  const nameOf = (id: string) => techs.find((t) => t.id === id)?.name || id;
  const needle = q.trim().toLowerCase();
  const match = (j: DayJob) => !needle
    || (j.clientName + ' ' + j.addr + ' ' + j.city + ' ' + j.serviceNames.join(' ') + ' ' + j.id)
      .toLowerCase().includes(needle);

  const queue = (d?.queue || []).filter(match);
  const assigned = (d?.jobs || []).filter((j) => j.techIds.length);

  return (
    <Screen>
      <BackBar title="Dispatch" sub={longDay(date)} fallback="/dashboard"
        right={
          <button type="button" aria-label="Today" onClick={() => setDate(todayISO())}
            className="h-9 px-3 rounded-full border border-line text-[13px] font-semibold active:bg-wash">
            Today
          </button>
        } />

      {/* The week, with what is waiting on each day. */}
      <div className="flex gap-2 px-4 pb-3 pt-2 overflow-x-auto no-scrollbar bg-white border-b border-line">
        {(d?.week || []).map((w) => {
          const on = w.date === date;
          return (
            <button key={w.date} type="button" onClick={() => setDate(w.date)}
              className={'shrink-0 w-[62px] rounded-[16px] py-2 text-center border '
                + (on ? 'bg-navy text-white border-navy' : 'bg-white border-line')}>
              <span className={'block text-[11px] font-bold uppercase tracking-[0.06em] '
                + (on ? 'text-white/70' : 'text-muted')}>
                {dowOf(w.date)}
              </span>
              <span className="block text-[17px] font-bold leading-tight">{dayNum(w.date)}</span>
              <span className={'block text-[11px] mt-0.5 '
                + (w.unassigned ? (on ? 'text-white' : 'text-accent font-bold')
                  : (on ? 'text-white/60' : 'text-muted-2'))}>
                {w.unassigned ? w.unassigned + ' free' : w.jobs ? w.jobs + ' job' + (w.jobs === 1 ? '' : 's') : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="Search a customer or an area" />

      <div className="px-4 pt-3 flex flex-col gap-3">
        {err && (
          <p className="rounded-xl bg-white border border-accent px-3.5 py-2.5 text-[13px]
            font-semibold text-accent">{err}</p>
        )}

        {!d ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[96px] rounded-[20px] bg-white animate-pulse" />)
        ) : (
          <>
            {/* The day in three numbers. */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                ['Services', String(d.jobs.length), ''],
                ['Assigned', String(assigned.length), ''],
                ['Waiting', String(d.queue.length), d.queue.length ? 'text-accent' : ''],
              ].map(([label, value, tone]) => (
                <div key={label} className="bg-white rounded-[18px] px-3 py-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
                  <p className={'text-[20px] font-bold mt-0.5 leading-none ' + tone}>{value}</p>
                </div>
              ))}
            </div>

            {/* Work with nobody on it — the only thing here that can go wrong. */}
            {queue.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-3 px-1 pt-1">
                  <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-accent">
                    Needs somebody · {queue.length}
                  </p>
                  <button type="button" disabled={busy}
                    onClick={() => setAsk({
                      title: 'Assign everything waiting?',
                      body: 'The plan gives each job to whoever is free, nearest and qualified. '
                        + 'You can move anybody afterwards.',
                      confirmLabel: 'Yes, assign them',
                      cancelLabel: 'Not now',
                      onConfirm: () => { void act(() => api.post('/dispatch/auto', { date })); },
                    })}
                    className="h-9 px-3.5 rounded-full bg-accent text-white text-[13px] font-bold
                      active:brightness-90 disabled:opacity-60">
                    Auto-assign
                  </button>
                </div>
                <Card flush>
                  {queue.map((j) => (
                    <div key={j.id} className="px-4 py-3.5 border-b border-line-soft last:border-b-0">
                      <button type="button" onClick={() => router.push('/jobs/' + j.id)}
                        className="w-full text-left">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[15.5px] font-bold truncate">{j.clientName}</span>
                          <span className="text-[13px] font-semibold text-sky-ink shrink-0">
                            {clock(j.slot)}
                          </span>
                        </span>
                        <span className="block text-[13px] text-muted truncate mt-0.5">
                          {j.serviceNames.join(', ') || j.id}
                        </span>
                        <span className="block text-[12.5px] text-muted-2 mt-0.5 truncate">
                          {[j.addr, j.city].filter(Boolean).join(', ') || j.branchName}
                          {j.crewNeed > 1 ? ' · needs ' + j.crewNeed : ''} · {hrs(j.mins)}
                        </span>
                      </button>
                      <button type="button" onClick={() => openAssign(j)} disabled={busy}
                        className="mt-2.5 h-11 w-full rounded-xl bg-accent text-white text-[14.5px]
                          font-bold active:brightness-90 disabled:opacity-60">
                        Assign
                      </button>
                    </div>
                  ))}
                </Card>
              </>
            )}

            {/* Everybody's day. */}
            {d.groups.map((g) => (
              <div key={g.branchId}>
                <p className="px-1 pt-1 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                  {g.branchName}
                </p>
                <Card flush>
                  {g.techs.map((t) => {
                    const mine = (d.jobs || []).filter((j) => j.techIds.includes(t.id)).filter(match)
                      .sort((a, b) => a.slot.localeCompare(b.slot));
                    return (
                      <div key={t.id} className="px-4 py-3.5 border-b border-line-soft last:border-b-0">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold
                            flex items-center justify-center shrink-0"
                            style={{ background: t.color || '#141414' }}>
                            {initials(t.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-bold truncate">{t.name}</span>
                            <span className={'block text-[12.5px] ' + (t.over ? 'text-accent font-semibold' : 'text-muted')}>
                              {t.off ? 'Off today'
                                : mine.length === 0 ? 'Free all day'
                                  : hrs(t.booked) + ' of ' + hrs(t.avail) + ' · ' + t.pct + '%'}
                            </span>
                          </span>
                          {!t.off && !t.over && mine.length > 0 && (
                            <span className="text-[12.5px] text-muted-2 shrink-0">
                              {hrs(Math.max(0, t.avail - t.booked))} free
                            </span>
                          )}
                        </div>

                        {mine.length > 0 && (
                          <div className="mt-2.5 flex flex-col gap-1.5">
                            {mine.map((j) => (
                              <button key={j.id} type="button" onClick={() => setOpenJob(j)}
                                className="w-full text-left rounded-xl bg-ground px-3 py-2.5
                                  flex items-center gap-2.5 active:brightness-95">
                                <span className="text-[13px] font-bold tabular-nums shrink-0 w-[62px]">
                                  {clock(j.slot)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[13.5px] font-semibold truncate">
                                    {j.clientName}
                                  </span>
                                  <span className="block text-[12px] text-muted truncate">
                                    {j.serviceNames.join(', ')}
                                  </span>
                                </span>
                                {j.pinned && <Icon name="check" size={13} className="text-muted-2 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}

            {d.jobs.length === 0 && (
              <Card>
                <p className="text-[16px] font-bold text-center">Nothing booked</p>
                <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                  No services on {longDay(date)}.
                </p>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------- who should do it */}
      {assigning && (
        <div className="fixed inset-0 z-[70] bg-navy/45 flex items-end"
          onClick={() => setAssigning(null)}>
          <div className="w-full bg-white rounded-t-[24px] pt-2 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1 shrink-0" />
            <div className="px-5 py-2 shrink-0">
              <p className="text-[16px] font-bold truncate">Who takes this?</p>
              <p className="text-[13px] text-muted truncate">
                {assigning.clientName} · {clock(assigning.slot)} · {hrs(assigning.mins)}
              </p>
            </div>
            <div className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
              {rows === null ? (
                <p className="px-5 py-6 text-[14px] text-muted">Working out who is free…</p>
              ) : (
                <>
                  {rows.map((r) => (
                    <button key={r.tech.id} type="button"
                      onClick={() => give(assigning, r.tech.id, r.at)}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3
                        border-b border-line-soft active:bg-wash">
                      <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold
                        flex items-center justify-center shrink-0"
                        style={{ background: r.tech.color || '#141414' }}>
                        {initials(r.tech.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold truncate">{r.tech.name}</span>
                        <span className="block text-[12.5px] truncate">
                          {r.why.length
                            ? r.why.map((w, k) => (
                              <span key={k} className={w.good ? 'text-muted' : 'text-accent font-semibold'}>
                                {k > 0 && <span className="text-muted-2"> · </span>}
                                {w.text}
                              </span>
                            ))
                            : <span className="text-muted">Available</span>}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        {r.at != null && (
                          <span className="block text-[13px] font-bold text-sky-ink">{clock(r.at)}</span>
                        )}
                        <span className="block text-[12px] text-muted-2">{r.bookedPct}% booked</span>
                      </span>
                    </button>
                  ))}

                  {/* Everybody else, for when the office knows better. */}
                  <p className="px-5 pt-4 pb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                    Anybody else
                  </p>
                  {techs
                    .filter((t) => !rows.some((r) => r.tech.id === t.id))
                    .map((t) => (
                      <button key={t.id} type="button"
                        onClick={() => give(assigning, t.id, null)}
                        className="w-full text-left px-5 py-3.5 flex items-center gap-3
                          border-b border-line-soft active:bg-wash">
                        <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold
                          flex items-center justify-center shrink-0"
                          style={{ background: t.color || '#141414' }}>
                          {initials(t.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold truncate">{t.name}</span>
                          <span className="block text-[12.5px] text-muted">
                            {t.off ? 'Off today' : hrs(t.booked) + ' booked'}
                          </span>
                        </span>
                      </button>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- one booked job */}
      {openJob && (
        <div className="fixed inset-0 z-[70] bg-navy/45 flex items-end"
          onClick={() => setOpenJob(null)}>
          <div className="w-full bg-white rounded-t-[24px] pt-2
            pb-[calc(env(safe-area-inset-bottom)+24px)]"
            onClick={(e) => e.stopPropagation()}>
            <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1" />
            <div className="px-5 py-2">
              <p className="text-[16.5px] font-bold">{openJob.clientName}</p>
              <p className="text-[13px] text-muted mt-0.5">
                {openJob.serviceNames.join(', ')} · {clock(openJob.slot)} · {hrs(openJob.mins)}
              </p>
              <p className="text-[12.5px] text-muted-2 mt-0.5">
                {openJob.techIds.map(nameOf).join(', ')}
              </p>
            </div>
            <div className="px-5 pt-2 flex flex-col gap-2.5">
              <button type="button"
                onClick={() => { const j = openJob; setOpenJob(null); router.push('/jobs/' + j.id); }}
                className="h-12 rounded-xl bg-navy text-white text-[15px] font-bold active:brightness-110">
                Open the service
              </button>
              <button type="button"
                onClick={() => { const j = openJob; setOpenJob(null); openAssign(j); }}
                className="h-12 rounded-xl border border-line text-[15px] font-semibold active:bg-wash">
                Give it to somebody else
              </button>
              <button type="button"
                onClick={() => {
                  const j = openJob;
                  setOpenJob(null);
                  setAsk({
                    title: 'Take this off ' + (j.techIds.map(nameOf)[0] || 'them') + '?',
                    body: 'It goes back to the waiting list for today.',
                    confirmLabel: 'Yes, unassign',
                    cancelLabel: 'Leave it',
                    danger: true,
                    onConfirm: () => { void act(() => api.post('/dispatch/unassign', { jobId: j.id })); },
                  });
                }}
                className="h-12 rounded-xl border border-accent text-accent text-[15px] font-semibold
                  active:bg-red-wash">
                Take it off them
              </button>
            </div>
          </div>
        </div>
      )}

      <Confirm spec={ask} onClose={() => setAsk(null)} />
    </Screen>
  );
}
