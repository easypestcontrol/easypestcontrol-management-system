'use client';

/* ============================================================================
   Tasks, on a phone.

   The tick is the first thing on every row and it works from the list. But a
   task is not finished by ticking it any more — tapping the ring opens the
   completion sheet, where the person hands in proof (a note, photos, a file,
   a voice memo). That parks it in Approval for the office; a manager approves
   it from here with one tap, or opens it to send it back.

   The tabs are the workflow: To do, Overdue, Approval (the office only), Done.
   Inside To do the piles sort themselves — Overdue first, then Today — because
   a to-do list sorted by nothing in particular is a list you read from the top
   every time.
   ========================================================================== */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Fab, Screen, SearchBox, type Tone } from '@/components/mobile';

export interface TaskRow {
  id: string; title: string; notes: string; assignee: string; branch: string;
  due: string; dueTime: string; priority: string; status: string; doneAt: string;
  submittedAt: string; createdAt: string;
  imageCount: number; hasVoice: boolean; fileCount: number;
  proofCount: number; hasProofNote: boolean;
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

export default function TasksMobile({ rows, canManage, meId, onOpen, onTick, onNew }: {
  rows: TaskRow[] | null;
  canManage: boolean;
  meId: string;
  onOpen: (id: string) => void;
  /** The ring: completes an open task (opens the proof sheet), approves a
      submitted one for the office, reopens a done one. Routed in the page. */
  onTick: (t: TaskRow) => void;
  onNew?: () => void;
}) {
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const today = todayISO();
  const needle = q.trim().toLowerCase();

  const all = rows || [];
  const openCount = all.filter((t) => t.status === 'open').length;
  const overdueCount = all.filter((t) => t.status === 'open' && !!t.due && t.due < today).length;
  const approvalCount = all.filter((t) => t.status === 'submitted').length;

  const TABS = [
    { key: 'open', label: 'To do', n: openCount },
    { key: 'overdue', label: 'Overdue', n: overdueCount },
    // Managers check here; a worker sees their own handed-in tasks so nothing
    // they submit disappears while it waits.
    { key: 'approval', label: canManage ? 'Approval' : 'Submitted', n: approvalCount },
    { key: 'done', label: 'Done', n: 0 },
  ];

  const shown = all
    .filter((t) => {
      if (tab === 'done') return t.status === 'done';
      if (tab === 'approval') return t.status === 'submitted';
      // The active piles are open work only — submitted ones are handed in and
      // wait in Approval, done ones are history.
      if (t.status !== 'open') return false;
      if (tab === 'today') return t.due === today;
      if (tab === 'overdue') return !!t.due && t.due < today;
      return true;
    })
    .filter((t) => !needle
      || [t.title, t.notes, t.assigneeName, t.id].filter(Boolean).join(' ').toLowerCase().includes(needle));

  /* Grouping: date buckets for the active piles, submitted-time for Approval,
     completed-day for Done. */
  const groups: Array<{ label: string; key: number; items: TaskRow[] }> = [];
  if (tab === 'done') {
    for (const t of shown) {
      const label = doneDay(t.doneAt);
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(t);
      else groups.push({ key: groups.length, label, items: [t] });
    }
  } else if (tab === 'approval') {
    if (shown.length) groups.push({ key: 0, label: 'To check', items: [...shown] });
    for (const g of groups) g.items.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  } else {
    for (const t of shown) {
      const b = bucketOf(t, today);
      const g = groups.find((x) => x.key === b.key);
      if (g) g.items.push(t);
      else groups.push({ key: b.key, label: b.label, items: [t] });
    }
    groups.sort((a, b) => a.key - b.key);
    for (const g of groups) g.items.sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  }

  /* Everything that was meant to happen today — due today plus finished today,
     so ticking one off moves the bar rather than shrinking the total. */
  const todayRows = all.filter((t) => t.due === today || (t.status === 'done' && t.doneAt.slice(0, 10) === today));
  const todayTotal = todayRows.length;
  const todayDone = todayRows.filter((t) => t.status === 'done').length;

  return (
    <Screen>
      <BackBar title="Tasks" sub={rows ? openCount + ' to do' : undefined} fallback="/dashboard" />
      <SearchBox value={q} onChange={setQ} placeholder="Search the tasks" />

      <div className="flex gap-2 px-4 pb-3 pt-0.5 overflow-x-auto no-scrollbar bg-white border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={'h-[34px] px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 '
              + (tab === t.key ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
            {t.label}
            {t.n > 0 && (t.key === 'overdue' || t.key === 'approval') && (
              <span className={'min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold flex items-center justify-center '
                + (tab === t.key ? 'bg-white/25 text-white' : 'bg-accent text-white')}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {rows !== null && todayTotal > 0 && tab !== 'done' && tab !== 'approval' && (
        <div className="mx-4 mt-3 bg-white rounded-[18px] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold">Today</p>
            <p className="text-[13px] font-bold text-mint-ink">{todayDone} of {todayTotal} done</p>
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
                  : tab === 'approval' ? (canManage ? 'Nothing to check' : 'Nothing waiting')
                    : tab === 'overdue' ? 'Nothing overdue'
                      : tab === 'today' ? 'Nothing due today' : 'Nothing to do'}
            </p>
            {!needle && tab === 'open' && (
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                {canManage ? 'Give somebody something to do with the red button.'
                  : 'Anything scheduled for you lands here, with its deadline.'}
              </p>
            )}
            {!needle && tab === 'approval' && (
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                {canManage ? 'Completed work waits here for you to check before it closes.'
                  : 'Tasks you submit wait here until the office checks them.'}
              </p>
            )}
          </Card>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <p className={'px-1 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] '
                + (g.label === 'Overdue' ? 'text-accent' : g.label === 'To check' ? 'text-sky-ink' : 'text-muted')}>
                {g.label} · {g.items.length}
              </p>
              <Card flush>
                {g.items.map((t) => {
                  const done = t.status === 'done';
                  const submitted = t.status === 'submitted';
                  const late = t.status === 'open' && !!t.due && t.due < today;
                  const tone: Tone = done ? 'good' : t.priority === 'high' ? 'bad' : 'info';
                  const mine = t.assignee === meId;
                  return (
                    <div key={t.id}
                      className={'flex items-start gap-3 px-4 border-b border-line-soft last:border-b-0 '
                        + (done ? 'py-3' : 'py-3.5')}>
                      {/* The ring, its shape a status: open to fill, submitted a
                          quiet clock, done a quiet check. */}
                      <button type="button" onClick={() => onTick(t)}
                        aria-label={done ? 'Reopen' : submitted ? (canManage ? 'Approve' : 'Awaiting approval') : 'Mark completed'}
                        className={done
                          ? 'w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center text-mint-ink'
                          : submitted
                            ? 'w-[30px] h-[30px] rounded-full shrink-0 mt-0.5 flex items-center justify-center '
                              + 'border-2 border-sky-ink text-sky-ink bg-sky active:scale-95'
                            : 'w-[30px] h-[30px] rounded-full shrink-0 mt-0.5 flex items-center justify-center '
                              + 'border-2 border-line-strong text-transparent transition-colors active:scale-95 hover:border-muted-2'}>
                        <Icon name={submitted ? 'clock' : 'check'} size={done ? 15 : 17}
                          className={done || submitted ? '' : 'opacity-0'} />
                      </button>

                      <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-baseline justify-between gap-3">
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
                          ) : submitted ? (
                            <span className="text-[12px] font-semibold shrink-0 whitespace-nowrap text-sky-ink">
                              Awaiting check
                            </span>
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
                        {!done && (
                          <span className="flex items-center gap-2 mt-1.5 min-w-0">
                            {t.priority === 'high' && <Chip tone={tone}>High</Chip>}
                            {submitted && !mine && (
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="w-5 h-5 rounded-full text-white text-[9px] font-bold
                                  flex items-center justify-center shrink-0" style={{ background: t.assigneeColor }}>
                                  {initials(t.assigneeName)}
                                </span>
                                <span className="text-[12.5px] text-muted truncate">{t.assigneeName}</span>
                              </span>
                            )}
                            {!submitted && canManage && (
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="w-5 h-5 rounded-full text-white text-[9px] font-bold
                                  flex items-center justify-center shrink-0" style={{ background: t.assigneeColor }}>
                                  {initials(t.assigneeName)}
                                </span>
                                <span className="text-[12.5px] text-muted truncate">{t.assigneeName}</span>
                              </span>
                            )}
                            {submitted && (t.proofCount > 0 || t.hasProofNote) && (
                              <span className="flex items-center gap-1 text-[12px] text-mint-ink font-semibold shrink-0">
                                <Icon name="check" size={12} />{t.proofCount || 'note'}
                              </span>
                            )}
                            {!submitted && t.imageCount > 0 && (
                              <span className="flex items-center gap-1 text-[12px] text-muted-2 shrink-0">
                                <Icon name="upload" size={12} />{t.imageCount}
                              </span>
                            )}
                            {!submitted && t.fileCount > 0 && (
                              <span className="flex items-center gap-1 text-[12px] text-muted-2 shrink-0">
                                <Icon name="file" size={12} />{t.fileCount}
                              </span>
                            )}
                            {!submitted && t.hasVoice && (
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

      {onNew && <Fab onClick={onNew} label="New task" />}
    </Screen>
  );
}
