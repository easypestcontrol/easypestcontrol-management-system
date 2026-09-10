'use client';

/* ============================================================================
   Tasks, on a phone.

   The list showed a title, a name and a date, and did nothing at all when you
   touched it — you could see your work but not open it, and not tick it off,
   which is the only verb a to-do list really has.

   So the tick is the first thing on every row and it works from the list: one
   tap, done, no screen in between. The rest of the row opens the task, because
   what has to be done is usually in the note or the photograph rather than the
   title. And the tasks sit under when they are due — Overdue first, then
   Today — because a to-do list sorted by nothing in particular is a list you
   read from the top every time.
   ========================================================================== */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Fab, Screen, SearchBox, type Tone } from '@/components/mobile';

export interface TaskRow {
  id: string; title: string; notes: string; assignee: string; branch: string;
  due: string; dueTime: string; priority: string; status: string; doneAt: string;
  imageCount: number; hasVoice: boolean;
  assigneeName: string; assigneeColor: string; createdByName: string;
}

const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/** 2026-09-12 → "12 Sep". */
const shortDay = (iso: string) => {
  const p = String(iso || '').split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return p.length === 3 ? Number(p[2]) + ' ' + M[Number(p[1]) - 1] : iso;
};

/** "14:30" → "2:30 pm". */
const clock = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return ((h + 11) % 12 + 1) + ':' + m[2] + ' ' + (h < 12 ? 'am' : 'pm');
};

const initials = (name: string) =>
  String(name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* Which pile a task falls into. The buckets ARE the sort: nothing else about a
   to-do list matters as much as whether it is late. */
function bucketOf(t: TaskRow, today: string): { key: number; label: string } {
  if (!t.due) return { key: 4, label: 'No date' };
  if (t.due < today) return { key: 0, label: 'Overdue' };
  if (t.due === today) return { key: 1, label: 'Today' };
  const tm = new Date(today);
  tm.setDate(tm.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  const tmISO = tm.getFullYear() + '-' + p(tm.getMonth() + 1) + '-' + p(tm.getDate());
  if (t.due === tmISO) return { key: 2, label: 'Tomorrow' };
  return { key: 3, label: 'Later' };
}

/** "2026-09-11 14:05" → Today / Yesterday / "9 Sep". */
function doneDay(stamp: string): string {
  const d = String(stamp || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Completed';
  const today = todayISO();
  if (d === today) return 'Today';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  const yISO = y.getFullYear() + '-' + p(y.getMonth() + 1) + '-' + p(y.getDate());
  if (d === yISO) return 'Yesterday';
  return shortDay(d);
}

const TABS = [
  { key: 'open', label: 'To do' },
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Done' },
];

export default function TasksMobile({ rows, canManage, onOpen, onToggle, onNew }: {
  rows: TaskRow[] | null;
  canManage: boolean;
  onOpen: (id: string) => void;
  /** Ticking one off from the list — the whole point of the screen. */
  onToggle: (t: TaskRow) => void;
  onNew?: () => void;
}) {
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  /* What was just ticked, so it can be put back. A tick target sits under a
     moving thumb; the cost of hitting the wrong one should be one tap, not a
     hunt through the Done list. */
  const [undo, setUndo] = useState<TaskRow | null>(null);
  const today = todayISO();
  const needle = q.trim().toLowerCase();

  function tick(t: TaskRow) {
    onToggle(t);
    if (t.status !== 'done') {
      setUndo(t);
      window.setTimeout(() => setUndo((u) => (u && u.id === t.id ? null : u)), 6000);
    } else {
      setUndo(null);
    }
  }

  const all = rows || [];
  const shown = all
    .filter((t) => {
      if (tab === 'done') return t.status === 'done';
      if (t.status === 'done') return false;
      if (tab === 'today') return t.due === today;
      if (tab === 'overdue') return !!t.due && t.due < today;
      return true;
    })
    .filter((t) => !needle
      || [t.title, t.notes, t.assigneeName, t.id].filter(Boolean).join(' ').toLowerCase().includes(needle));

  /* Overdue at the top, then Today, then the rest — and inside a pile, by the
     hour it is due. */
  const groups: Array<{ label: string; key: number; items: TaskRow[] }> = [];
  if (tab !== 'done') {
    for (const t of shown) {
      const b = bucketOf(t, today);
      const g = groups.find((x) => x.key === b.key);
      if (g) g.items.push(t);
      else groups.push({ key: b.key, label: b.label, items: [t] });
    }
    groups.sort((a, b) => a.key - b.key);
    for (const g of groups) g.items.sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  } else {
    /* Finished work is history, and history is read by day. One flat
       "Completed" pile told you a thing was done but not when, which is the
       only question anybody asks of a finished task. */
    for (const t of shown) {
      const label = doneDay(t.doneAt);
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(t);
      else groups.push({ key: groups.length, label, items: t ? [t] : [] });
    }
  }

  const openCount = all.filter((t) => t.status !== 'done').length;
  /* Everything that was meant to happen today — what is due today plus what
     was finished today, so ticking one off moves the bar rather than shrinking
     the total under it. */
  const todayRows = all.filter((t) => t.due === today || (t.status === 'done' && t.doneAt.slice(0, 10) === today));
  const todayTotal = todayRows.length;
  const todayDone = todayRows.filter((t) => t.status === 'done').length;

  return (
    <Screen>
      <BackBar title="Tasks" sub={rows ? openCount + (openCount === 1 ? ' to do' : ' to do') : undefined}
        fallback="/dashboard" />
      <SearchBox value={q} onChange={setQ} placeholder="Search the tasks" />

      <div className="flex gap-2 px-4 pb-3 pt-0.5 overflow-x-auto no-scrollbar bg-white border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={'h-[34px] px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 '
              + (tab === t.key ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Today, as a line. A to-do list that only ever shows what is left
          never tells you that you are getting somewhere. */}
      {rows !== null && todayTotal > 0 && tab !== 'done' && (
        <div className="mx-4 mt-3 bg-white rounded-[18px] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold">Today</p>
            <p className="text-[13px] font-bold text-mint-ink">
              {todayDone} of {todayTotal} done
            </p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-line-soft overflow-hidden">
            <div className="h-full rounded-full bg-mint-ink transition-all duration-500"
              style={{ width: Math.round((todayDone / todayTotal) * 100) + '%' }} />
          </div>
        </div>
      )}

      <div className="px-4 pt-3 flex flex-col gap-3">
        {rows === null ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[84px] rounded-[20px] bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">
              {needle ? 'Nothing matches that'
                : tab === 'done' ? 'Nothing completed yet'
                  : tab === 'overdue' ? 'Nothing overdue'
                    : tab === 'today' ? 'Nothing due today' : 'Nothing to do'}
            </p>
            {!needle && tab === 'open' && (
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                {canManage
                  ? 'Give somebody something to do with the red button.'
                  : 'Anything scheduled for you lands here, with its deadline.'}
              </p>
            )}
          </Card>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              {/* Red is for late, and only for late. Keyed on the label, not
                  the bucket number — the first pile in the Done list has key 0
                  too, and "Today · 2" of finished work was coming out red. */}
              <p className={'px-1 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] '
                + (g.label === 'Overdue' ? 'text-accent' : 'text-muted')}>
                {g.label} · {g.items.length}
              </p>
              <Card flush>
                {g.items.map((t) => {
                  const done = t.status === 'done';
                  const late = !done && !!t.due && t.due < today;
                  const tone: Tone = done ? 'good' : t.priority === 'high' ? 'bad' : 'info';
                  return (
                    <div key={t.id}
                      className={'flex items-start gap-3 px-4 border-b border-line-soft '
                        + 'last:border-b-0 ' + (done ? 'py-3' : 'py-3.5')}>
                      {/* Open work gets a ring to fill; finished work gets a
                          quiet mark and nothing else. Two rows of filled green
                          discs made a list of things that are OVER the loudest
                          thing on the screen. */}
                      <button type="button" onClick={() => tick(t)}
                        aria-label={done ? 'Mark not done' : 'Mark done'}
                        className={done
                          ? 'w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center text-muted-2'
                          : 'w-[30px] h-[30px] rounded-full shrink-0 mt-0.5 flex items-center '
                            + 'justify-center border-2 border-line-strong text-transparent '
                            + 'transition-colors active:scale-95 hover:border-muted-2'}>
                        <Icon name="check" size={done ? 15 : 17} className={done ? '' : 'opacity-0'} />
                      </button>

                      <button type="button" onClick={() => onOpen(t.id)}
                        className="min-w-0 flex-1 text-left">
                        <span className="flex items-baseline justify-between gap-3">
                          {/* Done work is quiet, not struck out. A line through
                              every finished task makes the Done list unreadable
                              exactly when somebody is checking what was done. */}
                          <span className={'truncate '
                            + (done ? 'text-[14.5px] font-medium text-ink-2' : 'text-[15px] font-bold')}>
                            {t.title}
                          </span>
                          {done ? (
                            t.doneAt && (
                              <span className="text-[12.5px] text-muted-2 shrink-0 whitespace-nowrap">
                                {clock(t.doneAt.slice(11)) || 'Done'}
                              </span>
                            )
                          ) : (t.due || t.dueTime) && (
                            <span className={'text-[12.5px] font-semibold shrink-0 whitespace-nowrap '
                              + (late ? 'text-accent' : 'text-sky-ink')}>
                              {t.dueTime ? clock(t.dueTime) : shortDay(t.due)}
                            </span>
                          )}
                        </span>
                        {t.notes && !done && (
                          <span className="text-[13px] text-muted mt-0.5 line-clamp-1">{t.notes}</span>
                        )}
                        {/* Everything under the title is for work still to be
                            done: what it is, who has it, what came with it.
                            On a finished task it is a paragraph about the past. */}
                        {!done && (
                        <span className="flex items-center gap-2 mt-1.5 min-w-0">
                          {t.priority === 'high' && !done && <Chip tone={tone}>High</Chip>}
                          {canManage && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-full text-white text-[9px] font-bold
                                flex items-center justify-center shrink-0"
                                style={{ background: t.assigneeColor }}>
                                {initials(t.assigneeName)}
                              </span>
                              <span className="text-[12.5px] text-muted truncate">{t.assigneeName}</span>
                            </span>
                          )}
                          {t.imageCount > 0 && (
                            <span className="flex items-center gap-1 text-[12px] text-muted-2 shrink-0">
                              <Icon name="upload" size={12} />{t.imageCount}
                            </span>
                          )}
                          {t.hasVoice && (
                            <span className="flex items-center gap-1 text-[12px] text-muted-2 shrink-0">
                              <Icon name="play" size={12} />
                            </span>
                          )}
                        </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))
        )}
      </div>

      {/* One tap back. It sits above the tab bar and goes on its own. */}
      {undo && (
        <div className="lg:hidden fixed left-3 right-3 z-40 bg-navy text-white rounded-[18px]
          px-4 h-14 flex items-center justify-between gap-3 shadow-[0_6px_24px_rgba(20,20,20,0.28)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
          <span className="text-[14px] font-semibold truncate">Marked done</span>
          <button type="button"
            onClick={() => { const u = undo; setUndo(null); onToggle({ ...u, status: 'done' }); }}
            className="text-[14px] font-bold text-white underline underline-offset-4 shrink-0">
            Undo
          </button>
        </div>
      )}

      {/* The red button steps aside while the undo bar is up — they occupy
          the same corner, and one of them is on a six-second clock. */}
      {onNew && !undo && <Fab onClick={onNew} label="New task" />}
    </Screen>
  );
}
