'use client';

/* ============================================================================
   Tasks — the team's work list, laid out the way a task manager should be:
   a real table (cards on phones), a detail view per task, and a scheduling
   form where the BRANCH is picked first and only that branch's people appear.

   A task now carries two piles of media. The BRIEF — reference photos, files
   and one voice note the scheduler attaches — and the PROOF — what the person
   sends back when the work is done: a note, photos, a file (a short video is
   fine) or a voice memo. Handing the proof in does not close the task; it
   parks it in Approval for the office to check. A manager approves it (done)
   or sends it back (open again, with a reason).
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';
import { usePager } from '@/components/pager';
import Confirm from '@/components/confirm';
import TasksMobile from './mobile';
import TimePicker from '@/components/time-picker';

/* ------------------------------------------------------------------ types */

interface Row {
  id: string; title: string; notes: string; assignee: string; createdBy: string;
  branch: string; due: string; dueTime: string; priority: string; status: string;
  doneAt: string; submittedAt: string; createdAt: string;
  imageCount: number; hasVoice: boolean; fileCount: number;
  proofCount: number; hasProofNote: boolean;
  assigneeName: string; assigneeColor: string; createdByName: string;
}
/** A document on a task. New from the form it carries `data`; back from the
    API it carries the `url` it is served at. */
interface TFile { name: string; type: string; size: number; url?: string; data?: string }
interface Full extends Row {
  images: string[]; voice: string; files: TFile[];
  doneNotes: string; doneImages: string[]; doneVoice: string; doneFiles: TFile[];
  submittedBy: string; approvedBy: string; submittedByName: string; approvedByName: string;
  reviewNote: string;
}
interface Payload { rows: Row[]; canManage: boolean }

interface Draft {
  title: string; notes: string; branch: string; assignee: string;
  /* Everyone this is being raised for, and across which branches. One task is
     written per person, so each of them can finish their own — see save(). */
  assignees?: string[];
  branches?: string[];
  due: string; dueTime: string; priority: string;
  images: string[]; voice: string; files: TFile[];
}

const blank = (): Draft => ({
  title: '', notes: '', branch: '', assignee: '', assignees: [], branches: [],
  due: '', dueTime: '', priority: 'normal', images: [], voice: '', files: [],
});

/* The proof an assignee sends in with a completion. */
interface Proof { notes: string; images: string[]; voice: string; files: TFile[] }
interface Completing { id: string; title: string; initial: Proof }

/* ---------------------------------------------------------------- helpers */

const fmtD = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
};
const fmtT = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
/** A stored stamp "YYYY-MM-DD HH:MM" (or an ISO createdAt) → local ms. */
function stampMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
/** "2026-09-25 16:12" → "25/09/2026 · 4:12 PM" (12-hour, never 24). */
const fmtDT = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} · ${fmtT(m[4] + ':' + m[5])}` : '';
};
/** How long a task was open, read for a person: "3h 20m", "2d 4h". */
function humanDur(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return h + 'h' + (m ? ' ' + m + 'm' : '');
  const d = Math.floor(h / 24), hh = h % 24;
  return d + 'd' + (hh ? ' ' + hh + 'h' : '');
}
/** From when a task was raised to when the work was handed in. */
const timeTaken = (t: { createdAt: string; submittedAt: string; doneAt: string }) =>
  humanDur(stampMs(t.submittedAt || t.doneAt) - stampMs(t.createdAt));

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A document may be as big as a scanned contract; anything past this is a
    long video, and a task is not the place for one. Mirrors the API's cap. */
const MAX_FILE_B = 15 * 1024 * 1024;
const fmtSize = (n: number) =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
/** The extension a data URL's type implies: "image/jpeg" -> "jpeg". */
const mimeExt = (dataUrl: string, fallback: string) =>
  (dataUrl.startsWith('data:') ? dataUrl.slice(5).split(';')[0].split('/')[1] || '' : '').split('+')[0] || fallback;
/** The download form of a served file: the API attaches it under its name.
    An inline data URL needs nothing; the `download` attribute does the rest. */
const dlHref = (url: string, name: string) =>
  url.startsWith('data:') ? url : url + (url.includes('?') ? '&' : '?') + 'dl=' + encodeURIComponent(name);
const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Downscale a photo so six of them never bloat a row. */
function shrinkImage(file: File, max: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        try { resolve(cv.toDataURL('image/jpeg', 0.72)); } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** Sort photos out of a picked set (shrunk, shown) from everything else
    (kept as-is, offered back as a download). Shared by both attachment forms. */
async function sortPicked(list: FileList, curImages: string[], curFiles: TFile[]):
  Promise<{ images: string[]; files: TFile[]; tooBig: string[] }> {
  const all = Array.from(list);
  const photos = all.filter((f) => f.type.startsWith('image/')).slice(0, 6 - curImages.length);
  const docs = all.filter((f) => !f.type.startsWith('image/'));
  const tooBig = docs.filter((f) => f.size > MAX_FILE_B).map((f) => f.name);
  const fits = docs.filter((f) => f.size <= MAX_FILE_B).slice(0, 10 - curFiles.length);
  const shrunk = await Promise.all(photos.map((f) => shrinkImage(f, 900)));
  const read = await Promise.all(fits.map((f) => new Promise<TFile>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(r.result || '') });
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  })));
  return { images: [...curImages, ...shrunk], files: [...curFiles, ...read], tooBig };
}

const PRIO: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'zpill red' },
  normal: { label: 'Normal', cls: 'zpill outline' },
  low: { label: 'Low', cls: 'zpill' },
};

const inputCls = 'w-full h-9 px-3 rounded-lg border border-line text-[13.5px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

/* Which pile a task is in — the tab set is the workflow spelled out. */
type Tab = 'open' | 'overdue' | 'approval' | 'done';

/* ==================================================================== page */

export default function TasksPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [meId, setMeId] = useState('');
  const [tab, setTab] = useState<Tab>('open');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState('');
  const [openTask, setOpenTask] = useState<Full | null>(null);
  const [completing, setCompleting] = useState<Completing | null>(null);
  const [removing, setRemoving] = useState('');
  const [err, setErr] = useState('');
  /* The office's lenses: branch (shared control), plus a person and a date. */
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const bf = useBranchFilter();

  const load = useCallback(() => {
    api.get<Payload>('/tasks' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setData).catch(() => setData({ rows: [], canManage: false }));
  }, [bf.branch]);

  useEffect(() => {
    load();
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<{ id: string }>('/auth/me').then((m) => setMeId(m.id)).catch(() => {});
  }, [load]);

  const canManage = !!data?.canManage;
  const today = todayISO();
  const overdue = (t: Row) => t.status === 'open' && !!t.due && t.due < today;

  const all = data?.rows || [];
  const openN = all.filter((t) => t.status === 'open').length;
  const overdueN = all.filter((t) => overdue(t)).length;
  const approvalN = all.filter((t) => t.status === 'submitted').length;
  const doneN = all.filter((t) => t.status === 'done').length;

  /* A tab narrows to a pile; the person and date lenses narrow it further. */
  const rows = useMemo(() => {
    const dateOf = (t: Row) => (tab === 'done' ? t.doneAt.slice(0, 10) : t.due);
    return all.filter((t) => {
      const inTab = tab === 'open' ? t.status === 'open'
        : tab === 'overdue' ? overdue(t)
          : tab === 'approval' ? t.status === 'submitted'
            : t.status === 'done';
      if (!inTab) return false;
      if (person && t.assignee !== person) return false;
      const d = dateOf(t);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, person, from, to, today]);
  const pg = usePager(rows);

  /* Everyone who currently holds a task, for the person lens. */
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of all) if (t.assignee) m.set(t.assignee, t.assigneeName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const filtersOn = !!(person || from || to);

  async function openDetail(id: string) {
    try { setOpenTask(await api.get<Full>('/tasks/' + id)); }
    catch { /* row stays */ }
  }

  function askRemove(id: string) { setRemoving(id); }

  async function remove(id: string) {
    try { await api.del('/tasks/' + id); setOpenTask(null); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove'); }
  }

  /* A verb that changes only the status — approve, send back, reopen. The row
     moves at once and the list reloads behind it. */
  async function act(id: string, body: Record<string, unknown>, optimistic?: string) {
    if (optimistic) {
      setData((d) => (d ? {
        ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, status: optimistic } : r)),
      } : d));
    }
    setOpenTask(null);
    try { await api.patch('/tasks/' + id, body); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not update'); }
    load();
  }

  /* The one tick on a row does the right thing for where the task is:
       open      → open the completion form (proof is required now)
       submitted → the office approves; the assignee just opens it
       done       → the office can reopen it                              */
  function rowTick(t: { id: string; title: string; status: string }) {
    if (t.status === 'open') {
      setCompleting({ id: t.id, title: t.title, initial: { notes: '', images: [], voice: '', files: [] } });
    } else if (t.status === 'submitted') {
      if (canManage) void act(t.id, { action: 'approve' }, 'done');
      else void openDetail(t.id);
    } else if (t.status === 'done') {
      if (canManage) void act(t.id, { action: 'reopen' }, 'open');
    }
  }

  function startComplete(t: Full) {
    setOpenTask(null);
    setCompleting({
      id: t.id, title: t.title,
      initial: { notes: t.doneNotes || '', images: t.doneImages || [], voice: t.doneVoice || '', files: t.doneFiles || [] },
    });
  }

  async function editFrom(t: Full) {
    setOpenTask(null);
    setEditing(t.id);
    setDraft({
      title: t.title, notes: t.notes, branch: t.branch, assignee: t.assignee,
      assignees: t.assignee ? [t.assignee] : [], branches: t.branch ? [t.branch] : [],
      due: t.due, dueTime: t.dueTime, priority: t.priority,
      images: t.images || [], voice: t.voice || '', files: t.files || [],
    });
  }

  const dueCell = (t: Row) => (
    !t.due ? <span className="text-muted-2">—</span> : (
      <span className={overdue(t) ? 'text-accent font-bold'
        : t.due === today && t.status === 'open' ? 'text-accent font-semibold' : ''}>
        {overdue(t) ? 'Overdue · ' : t.due === today && t.status === 'open' ? 'Today · ' : ''}
        {fmtD(t.due)}{t.dueTime ? ' · ' + fmtT(t.dueTime) : ''}
      </span>
    )
  );

  const attachIcons = (t: Row) => (
    <>
      {t.imageCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted" title={t.imageCount + ' photo(s)'}>
          <Icon name="upload" size={11} />{t.imageCount}
        </span>
      )}
      {t.fileCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted" title={t.fileCount + ' file(s)'}>
          <Icon name="file" size={11} />{t.fileCount}
        </span>
      )}
      {t.hasVoice && <span className="text-[10.5px] text-muted" title="Voice note">🎙</span>}
      {(t.proofCount > 0 || t.hasProofNote) && (
        <span className="inline-flex items-center gap-0.5 text-[10.5px] text-mint-ink font-semibold"
          title="Completion proof attached">
          <Icon name="check" size={11} />{t.proofCount || ''}
        </span>
      )}
    </>
  );

  const TABS: Array<[Tab, string, number]> = [
    ['open', 'Open', openN],
    ['overdue', 'Overdue', overdueN],
    // Managers check work here; a worker sees their own handed-in tasks so
    // nothing they submit ever falls out of sight while it waits.
    ['approval', canManage ? 'Approval' : 'Submitted', approvalN],
    ['done', 'Completed', doneN],
  ];

  return (
    <>
      {/* A to-do read on the move: what, who, by when — completed with proof
          and, for the office, approved from the phone. */}
      <TasksMobile rows={data?.rows || null} canManage={canManage} meId={meId}
        onOpen={openDetail} onTick={rowTick}
        onNew={canManage ? () => { setDraft(blank()); setEditing(''); setErr(''); } : undefined} />
    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Tasks</h1>
          {data && (
            <span className="text-muted-2 text-[12.5px]">
              {openN} open{approvalN ? ` · ${approvalN} to check` : ''}{doneN ? ` · ${doneN} done` : ''}
            </span>
          )}
        </div>
        <span className="flex items-center gap-3">
          {canManage && bf.el}
          {canManage && (
            <button onClick={() => { setDraft(blank()); setEditing(''); setErr(''); }}
              className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={14} /> New task
            </button>
          )}
        </span>
      </div>

      {/* --------------------------------------------------------- tabs */}
      <div className="flex items-center gap-1 px-4 lg:px-6 border-b border-line-soft">
        {TABS.map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)}
            className={'relative h-12 lg:h-10 px-3 text-[13px] font-medium '
              + (tab === id ? 'text-navy' : 'text-muted hover:text-ink')}>
            {label}
            <span className={'ml-1.5 text-[11px] '
              + (tab === id
                ? (id === 'overdue' || id === 'approval') && n ? 'text-accent font-bold' : 'text-accent font-semibold'
                : (id === 'overdue' || id === 'approval') && n ? 'text-accent font-semibold' : 'text-muted-2')}>
              {n}
            </span>
            {tab === id && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------- filter bar */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6 py-2 border-b border-line-soft bg-wash">
          <span className="text-[11.5px] font-semibold text-muted-2 uppercase tracking-wide">Filter</span>
          <select value={person} onChange={(e) => setPerson(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-line bg-white text-[12.5px] outline-none focus:border-accent">
            <option value="">Anyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From this date"
              className="h-8 px-2 rounded-lg border border-line bg-white text-[12.5px] outline-none focus:border-accent" />
            <span className="text-muted-2">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To this date"
              className="h-8 px-2 rounded-lg border border-line bg-white text-[12.5px] outline-none focus:border-accent" />
          </span>
          <span className="text-[11px] text-muted-2">{tab === 'done' ? 'by completion date' : 'by deadline'}</span>
          {filtersOn && (
            <button onClick={() => { setPerson(''); setFrom(''); setTo(''); }}
              className="h-8 px-2.5 rounded-lg border border-line text-[12px] text-muted hover:text-ink hover:bg-white">
              Clear
            </button>
          )}
        </div>
      )}

      {err && <p className="px-4 lg:px-6 py-2 text-[12.5px] font-medium text-accent">{err}</p>}

      {/* --------------------------------------------------------- list */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">
            {tab === 'approval' ? (canManage ? 'Nothing to check' : 'Nothing waiting')
              : tab === 'overdue' ? 'Nothing overdue'
                : tab === 'done' ? 'Nothing completed yet' : 'Nothing to do'}
          </p>
          <p className="text-muted text-[13px] mt-1">
            {tab === 'approval'
              ? (canManage ? 'Completed tasks land here for you to verify before they close.'
                : 'Tasks you submit wait here until the office checks them.')
              : canManage ? 'Schedule a task for anyone on the team with New task.'
                : 'Tasks scheduled for you land here — with the deadline.'}
          </p>
        </div>
      ) : (
        <>
          <table className="ztable max-lg:hidden">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Task</th><th>Assigned to</th>
                <th>{tab === 'done' ? 'Completed' : 'Deadline'}</th>
                <th>Priority</th><th>Branch</th>
                {canManage && <th style={{ width: 96 }}></th>}
              </tr>
            </thead>
            <tbody>
              {pg.pageRows.map((t) => (
                <tr key={t.id} className={'zrow ' + (t.status === 'done' ? 'opacity-60' : '')}
                  onClick={() => openDetail(t.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => rowTick(t)}
                      title={t.status === 'done' ? 'Reopen'
                        : t.status === 'submitted' ? (canManage ? 'Approve' : 'Awaiting approval') : 'Mark completed'}
                      className={'w-6 h-6 rounded-full border-2 flex items-center justify-center '
                        + (t.status === 'done'
                          ? 'bg-mint border-mint text-mint-ink'
                          : t.status === 'submitted'
                            ? 'bg-sky border-sky-ink text-sky-ink'
                            : 'border-line text-transparent hover:border-navy')}>
                      <Icon name={t.status === 'submitted' ? 'clock' : 'check'} size={13} />
                    </button>
                  </td>
                  <td>
                    <span className={'block font-semibold text-navy max-w-[340px] truncate '
                      + (t.status === 'done' ? 'line-through' : '')}>{t.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-2">
                      <span className="font-mono">{t.id}</span>
                      {t.status === 'submitted' && <span className="text-sky-ink font-semibold">Awaiting check</span>}
                      {t.notes && <span className="truncate max-w-[220px]">{t.notes}</span>}
                      {attachIcons(t)}
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                        style={{ background: t.assigneeColor }}>{initials(t.assigneeName)}</span>
                      {t.assigneeName}
                    </span>
                  </td>
                  <td className="text-[12.5px]">
                    {tab === 'done'
                      ? <span title={'Took ' + (timeTaken(t) || '—')}>{fmtDT(t.doneAt) || '—'}</span>
                      : dueCell(t)}
                  </td>
                  <td><span className={PRIO[t.priority]?.cls}>{PRIO[t.priority]?.label}</span></td>
                  <td className="text-[12px] text-muted">
                    {boot?.branches.find((b) => b.id === t.branch)?.name || t.branch || '—'}
                  </td>
                  {canManage && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => openDetail(t.id)}
                          className="h-7 px-2.5 rounded border border-line text-[12px] hover:bg-wash">Open</button>
                        <button onClick={() => askRemove(t.id)} title="Remove"
                          className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-accent hover:bg-red-wash">
                          <Icon name="x" size={13} />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {pg.el}
        </>
      )}
    </div>

      {/* ------------------------------------------------------- detail */}
      {openTask && (
        <TaskDetail t={openTask} canManage={canManage} meId={meId}
          branchName={boot?.branches.find((b) => b.id === openTask.branch)?.name || openTask.branch}
          onClose={() => setOpenTask(null)}
          onComplete={() => startComplete(openTask)}
          onApprove={() => act(openTask.id, { action: 'approve' }, 'done')}
          onReject={(note) => act(openTask.id, { action: 'reject', reviewNote: note }, 'open')}
          onReopen={() => act(openTask.id, { action: 'reopen' }, 'open')}
          onEdit={() => editFrom(openTask)}
          onRemove={() => askRemove(openTask.id)} />
      )}
      {completing && (
        <CompleteForm c={completing} asManager={canManage}
          onClose={() => setCompleting(null)}
          onDone={() => { setCompleting(null); load(); }} />
      )}
      {draft && boot && (
        <TaskForm draft={draft} setDraft={setDraft} boot={boot} editing={editing}
          onClose={() => { setDraft(null); setEditing(''); }}
          onSaved={() => { setDraft(null); setEditing(''); load(); }} />
      )}
      <Confirm spec={removing ? {
        title: 'Remove this task?',
        body: 'It disappears from the assignee’s list. This cannot be undone.',
        confirmLabel: 'Yes, remove it',
        cancelLabel: 'Keep it',
        danger: true,
        onConfirm: () => { const id = removing; setRemoving(''); void remove(id); },
      } : null} onClose={() => setRemoving('')} />
    </>
  );
}

/* ================================================= a pile of media, shown */

function MediaBlock({ label, notes, images, files, voice, tone }: {
  label: string; notes?: string; images: string[]; files: TFile[]; voice: string;
  tone?: 'proof';
}) {
  const [zoom, setZoom] = useState('');
  const has = !!(notes || images.length || files.length || voice);
  if (!has) return null;
  return (
    <div className={tone === 'proof' ? 'rounded-xl border border-mint bg-mint p-3.5' : ''}>
      <p className={'text-[11px] font-semibold uppercase tracking-wide mb-1.5 '
        + (tone === 'proof' ? 'text-mint-ink' : 'text-muted')}>{label}</p>
      {notes && <p className="text-[13.5px] text-ink-2 leading-relaxed whitespace-pre-wrap mb-2.5">{notes}</p>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {images.map((src, i) => (
            <span key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" onClick={() => setZoom(src)}
                className="w-[96px] h-[72px] object-cover rounded border border-line cursor-zoom-in" />
              <a href={src} download={'photo-' + (i + 1) + '.' + mimeExt(src, 'jpg')} title="Download photo"
                className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-line
                  flex items-center justify-center text-ink hover:text-accent">
                <Icon name="download" size={12} />
              </a>
            </span>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="rounded border border-line divide-y divide-line-soft mb-2.5 bg-white">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2">
              <Icon name="file" size={16} className="text-muted shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">{f.name}</span>
                <span className="block text-[11px] text-muted">{fmtSize(f.size)}</span>
              </span>
              <a href={dlHref(f.url || '', f.name)} download={f.name} target="_blank" rel="noreferrer"
                className="h-8 px-3 rounded border border-line text-[12px] font-semibold flex items-center
                  gap-1.5 hover:bg-wash shrink-0 bg-white">
                <Icon name="download" size={13} /> Download
              </a>
            </div>
          ))}
        </div>
      )}
      {voice && (
        <div className="flex items-center gap-2">
          <audio controls src={voice} className="flex-1 h-10" />
          <a href={voice} download={'voice.' + mimeExt(voice, 'webm')} title="Download voice note"
            className="w-9 h-9 rounded border border-line flex items-center justify-center text-ink
              hover:text-accent shrink-0 bg-white">
            <Icon name="download" size={14} />
          </a>
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setZoom(''); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-w-full max-h-full rounded" />
        </div>
      )}
    </div>
  );
}

/* ============================================================ detail sheet */

function TaskDetail({ t, canManage, meId, branchName, onClose, onComplete, onApprove, onReject, onReopen, onEdit, onRemove }: {
  t: Full; canManage: boolean; meId: string; branchName: string;
  onClose: () => void; onComplete: () => void; onApprove: () => void;
  onReject: (note: string) => void; onReopen: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const isAssignee = t.assignee === meId;
  const status = t.status;

  return (
    <div className="fixed inset-0 z-50 bg-navy/45 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[560px] rounded-t-[24px] sm:rounded-lg shadow-xl
        max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <span className="sm:hidden block w-10 h-1 rounded-full bg-line mx-auto mt-2.5" />
        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-4 sm:py-4
          border-b border-line-soft sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {status === 'done' ? (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full
                  bg-mint text-mint-ink text-[12px] font-bold">
                  <Icon name="check" size={12} /> Completed
                </span>
              ) : status === 'submitted' ? (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full
                  bg-sky text-sky-ink text-[12px] font-bold">
                  <Icon name="clock" size={12} /> Awaiting approval
                </span>
              ) : (
                <span className="inline-flex items-center h-6 px-2.5 rounded-full
                  bg-wash text-ink-2 text-[12px] font-bold">Open</span>
              )}
              {t.priority === 'high' && status !== 'done' && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-full
                  bg-rose text-rose-ink text-[12px] font-bold">High</span>
              )}
              <span className="font-mono text-[11.5px] text-muted-2">{t.id}</span>
            </div>
            <h2 className="text-[18px] sm:text-[16px] font-bold mt-2 leading-snug">{t.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-2
              active:bg-wash shrink-0">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Sent back — the reason sits at the top, where the person picking
              the task up again will see it first. */}
          {status === 'open' && t.reviewNote && (
            <div className="rounded-lg bg-rose border border-rose px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-ink mb-0.5">Sent back</p>
              <p className="text-[13px] text-ink-2">{t.reviewNote}</p>
            </div>
          )}

          {/* The brief. */}
          <MediaBlock label="What has to be done" notes={t.notes}
            images={t.images || []} files={t.files || []} voice={t.voice || ''} />

          <div className="rounded-xl bg-wash divide-y divide-line-soft">
            <Fact label="Assigned to">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full text-white text-[9px] font-bold
                  flex items-center justify-center shrink-0"
                  style={{ background: t.assigneeColor }}>{initials(t.assigneeName)}</span>
                <span className="truncate">{t.assigneeName}</span>
              </span>
            </Fact>
            <Fact label="Deadline">{t.due ? `${fmtD(t.due)}${t.dueTime ? ' · ' + fmtT(t.dueTime) : ''}` : '—'}</Fact>
            <Fact label="Branch">{branchName || '—'}</Fact>
            <Fact label="Scheduled by">{t.createdByName}</Fact>
            {t.submittedAt && (
              <Fact label={status === 'submitted' ? 'Handed in' : 'Work finished'}>
                {fmtDT(t.submittedAt)}{t.submittedByName ? ' · ' + t.submittedByName : ''}
              </Fact>
            )}
            {(t.submittedAt || t.doneAt) && (
              <Fact label="Time taken">{timeTaken(t) || '—'}</Fact>
            )}
            {status === 'done' && t.doneAt && <Fact label="Approved">{fmtDT(t.doneAt)}</Fact>}
            {status === 'done' && t.approvedByName && <Fact label="Verified by">{t.approvedByName}</Fact>}
          </div>

          {/* The proof — what the office is checking. */}
          {(status === 'submitted' || status === 'done') && (
            <MediaBlock tone="proof"
              label={status === 'done' ? 'Completion proof' : 'Submitted for approval'}
              notes={t.doneNotes}
              images={t.doneImages || []} files={t.doneFiles || []} voice={t.doneVoice || ''} />
          )}
        </div>

        <div className="px-5 py-4 border-t border-line-soft flex flex-wrap items-center gap-2.5
          pb-[max(1rem,env(safe-area-inset-bottom))] sticky bottom-0 bg-white">
          {rejecting ? (
            <div className="w-full flex flex-col gap-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus
                placeholder="What needs fixing? The assignee sees this."
                className="w-full min-h-[64px] px-3 py-2 rounded-lg border border-line text-[13px] outline-none focus:border-accent" />
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => { setRejecting(false); setNote(''); }}
                  className="h-10 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">Cancel</button>
                <button onClick={() => onReject(note.trim())}
                  className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
                  Send it back
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Open — the assignee (or a manager on their own) completes it. */}
              {status === 'open' && (isAssignee || canManage) && (
                <button onClick={onComplete}
                  className="h-12 sm:h-10 w-full sm:w-auto px-5 sm:px-4 rounded-xl sm:rounded
                    text-[15px] sm:text-[13px] font-bold flex items-center justify-center gap-2
                    bg-mint-ink text-white hover:brightness-110">
                  <Icon name="check" size={17} /> Mark completed
                </button>
              )}

              {/* Submitted — the office verifies; the assignee waits or edits. */}
              {status === 'submitted' && canManage && (
                <>
                  <button onClick={onApprove}
                    className="h-12 sm:h-10 px-5 sm:px-4 rounded-xl sm:rounded text-[15px] sm:text-[13px]
                      font-bold flex items-center justify-center gap-2 bg-mint-ink text-white hover:brightness-110">
                    <Icon name="check" size={17} /> Approve
                  </button>
                  <button onClick={() => setRejecting(true)}
                    className="h-12 sm:h-10 px-5 sm:px-4 rounded-xl sm:rounded border border-line
                      text-[14.5px] sm:text-[13px] font-semibold hover:bg-wash">
                    Send back
                  </button>
                </>
              )}
              {status === 'submitted' && !canManage && isAssignee && (
                <>
                  <span className="text-[13px] text-sky-ink font-semibold">Waiting for the office to check this.</span>
                  <button onClick={onComplete}
                    className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
                    Update submission
                  </button>
                </>
              )}

              <span className="hidden sm:block flex-1" />

              {status === 'done' && canManage && (
                <button onClick={onReopen}
                  className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
                  Reopen
                </button>
              )}
              {canManage && (
                <>
                  <button onClick={onEdit}
                    className="h-12 sm:h-10 px-5 sm:px-4 rounded-xl sm:rounded border border-line
                      text-[14.5px] sm:text-[13px] font-semibold hover:bg-wash">
                    Edit
                  </button>
                  <button onClick={onRemove}
                    className="h-10 px-3.5 rounded border border-line text-[13px] text-muted hover:text-accent">
                    Remove
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="text-[13px] text-muted shrink-0">{label}</span>
      <span className="text-[14px] font-semibold min-w-0 text-right">{children}</span>
    </div>
  );
}

/* ====================================================== completion form */

function CompleteForm({ c, asManager, onClose, onDone }: {
  c: Completing; asManager: boolean; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState(c.initial.notes);
  const [images, setImages] = useState<string[]>(c.initial.images);
  const [files, setFiles] = useState<TFile[]>(c.initial.files);
  const [voice, setVoice] = useState(c.initial.voice);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [recState, setRecState] = useState<'idle' | 'recording' | 'nomic'>('idle');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRec() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setRecState('nomic'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setVoice(String(reader.result || ''));
        reader.readAsDataURL(blob);
      };
      rec.start(); recRef.current = rec; setRecState('recording');
    } catch { setRecState('nomic'); }
  }
  function stopRec() { recRef.current?.stop(); recRef.current = null; setRecState('idle'); }
  function onVoiceFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => setVoice(String(reader.result || ''));
    reader.readAsDataURL(f);
  }
  async function addFiles(list: FileList) {
    const r = await sortPicked(list, images, files);
    setImages(r.images); setFiles(r.files);
    if (r.tooBig.length) setErr(r.tooBig.join(', ') + (r.tooBig.length > 1 ? ' are' : ' is') + ' over 15 MB');
  }

  async function submit() {
    setBusy(true); setErr('');
    try {
      await api.patch('/tasks/' + c.id, {
        action: 'submit', doneNotes: notes, doneImages: images, doneVoice: voice, doneFiles: files,
      });
      // A manager completing their own task is also its approver — close it now.
      if (asManager) await api.patch('/tasks/' + c.id, { action: 'approve' });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-navy/45 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[520px] rounded-t-[24px] sm:rounded-lg shadow-xl max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold truncate">{asManager ? 'Complete task' : 'Submit for approval'}</h2>
            <p className="text-[12px] text-muted truncate">{c.title}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <label className="block">
            <span className={labelCls}>What did you do? *</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus
              placeholder="A line on what was done — the office reads this when checking."
              className="w-full min-h-[84px] px-3 py-2 rounded-lg border border-line text-[13px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]" />
          </label>

          <div className="rounded border border-line p-3.5">
            <p className="text-[12px] font-semibold text-ink-2 mb-2.5">
              Proof — photos, a file or a short video, a voice note
            </p>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {images.map((src, i) => (
                <span key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-[72px] h-[56px] object-cover rounded border border-line" />
                  <button onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-white
                      flex items-center justify-center" aria-label="Remove photo">
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
              {(images.length < 6 || files.length < 10) && (
                <label className="w-[72px] h-[56px] rounded border border-dashed border-line flex flex-col
                  items-center justify-center text-muted hover:border-navy cursor-pointer">
                  <Icon name="plus" size={14} />
                  <span className="text-[9.5px] mt-0.5">Add file</span>
                  <input type="file" multiple hidden
                    onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {files.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 h-9 px-2.5 rounded border border-line bg-wash">
                    <Icon name="file" size={14} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-[12.5px] truncate">{f.name}</span>
                    <span className="text-[11px] text-muted shrink-0">{fmtSize(f.size)}</span>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-accent shrink-0"
                      aria-label="Remove file">
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {voice ? (
              <div className="flex items-center gap-2">
                <audio controls src={voice} className="flex-1 h-9" />
                <button onClick={() => setVoice('')}
                  className="w-8 h-8 rounded border border-line flex items-center justify-center
                    text-muted hover:text-accent shrink-0" aria-label="Remove voice note">
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : recState === 'recording' ? (
              <button onClick={stopRec}
                className="w-full h-10 rounded bg-accent text-white text-[13px] font-semibold animate-pulse">
                ● Recording… tap to stop
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={startRec}
                  className="flex-1 h-10 rounded border border-navy text-navy text-[13px] font-semibold hover:bg-wash">
                  🎙 Record a voice note
                </button>
                <label className="h-10 px-3 rounded border border-line text-[12.5px] font-medium
                  hover:bg-wash cursor-pointer flex items-center">
                  Attach audio
                  <input type="file" accept="audio/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onVoiceFile(f); }} />
                </label>
              </div>
            )}
            {recState === 'nomic' && (
              <p className="text-[11.5px] text-muted mt-1.5">
                The microphone is not available here — record on the phone and use Attach audio.
              </p>
            )}
          </div>

          {err && <p className="text-accent text-[12.5px]">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line sticky bottom-0 bg-white
          pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose}
            className="h-10 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">Cancel</button>
          <button onClick={submit} disabled={busy || !notes.trim()}
            className="h-10 px-5 rounded bg-mint-ink text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-50">
            {busy ? 'Sending…' : asManager ? 'Complete task' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================== the form */

function TaskForm({ draft, setDraft, boot, editing, onClose, onSaved }: {
  draft: Draft; setDraft: (d: Draft | null) => void; boot: Bootstrap;
  editing: string; onClose: () => void; onSaved: () => void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const d = draft;
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });

  /* Creating, a task may span branches: tick as many as apply and everyone in
     any of them can be picked. Editing stays one branch — an edit shapes one
     task, it is not a way to fan a row out. */
  const pickedBranches = editing ? (d.branch ? [d.branch] : []) : (d.branches || []);
  const people = useMemo(
    () => (boot.users || []).filter((u) =>
      u.role !== 'client' && pickedBranches.some((b) => u.branches.includes(b))),
    [boot, pickedBranches],
  );

  /* --------------------------------------------------- voice recording */
  const [recState, setRecState] = useState<'idle' | 'recording' | 'nomic'>('idle');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRec() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setRecState('nomic'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => set({ voice: String(reader.result || '') });
        reader.readAsDataURL(blob);
      };
      rec.start(); recRef.current = rec; setRecState('recording');
    } catch { setRecState('nomic'); }
  }
  function stopRec() { recRef.current?.stop(); recRef.current = null; setRecState('idle'); }
  function onVoiceFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => set({ voice: String(reader.result || '') });
    reader.readAsDataURL(f);
  }
  async function addFiles(list: FileList) {
    const r = await sortPicked(list, d.images, d.files);
    set({ images: r.images, files: r.files });
    if (r.tooBig.length) setErr(r.tooBig.join(', ') + (r.tooBig.length > 1 ? ' are' : ' is') + ' over 15 MB');
  }

  /** For each chosen person, the branch to file their task under: the first
      selected branch that is really theirs. */
  function branchFor(userId: string): string {
    const u = (boot.users || []).find((x) => x.id === userId);
    if (!u) return pickedBranches[0] || '';
    return pickedBranches.find((b) => u.branches.includes(b)) || u.branches[0] || pickedBranches[0] || '';
  }

  /* One tap to take, or drop, everyone in the chosen branches. */
  const allOn = people.length > 0 && people.every((u) => (d.assignees || []).includes(u.id));
  function toggleAll() {
    const next = allOn ? [] : people.map((u) => u.id);
    set({ assignees: next, assignee: next[0] || '' });
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      if (editing) {
        await api.patch('/tasks/' + editing, { ...d, branch: d.branch });
      } else {
        /* One task per person, not one task with several names on it — a shared
           row cannot be half finished. Each person's row is filed under a
           branch that is truly theirs. */
        const who = (d.assignees || []).filter(Boolean);
        const targets = who.length ? who : [d.assignee].filter(Boolean);
        if (!targets.length) { setErr('Pick who it is for'); setBusy(false); return; }
        for (const id of targets) {
          await api.post('/tasks', { ...d, assignee: id, branch: branchFor(id) });
        }
      }
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); setBusy(false); }
  }

  const branchName = (id: string) => (boot.branches || []).find((b) => b.id === id)?.name || id;

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[520px] rounded-t-xl sm:rounded-lg shadow-xl max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-white z-10">
          <h2 className="text-[15px] font-semibold">{editing ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <label className="block">
            <span className={labelCls}>Task *</span>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Collect renewal cheque from Medlife Hospital" className={inputCls} />
          </label>

          <label className="block">
            <span className={labelCls}>What has to be done</span>
            <textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })}
              placeholder="The details the person needs — spell it out"
              className="w-full min-h-[76px] px-3 py-2 rounded-lg border border-line text-[13px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]" />
          </label>

          {/* ------------------------------------------------ attachments */}
          <div className="rounded border border-line p-3.5">
            <p className="text-[12px] font-semibold text-ink-2 mb-2.5">Attachments</p>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {d.images.map((src, i) => (
                <span key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-[72px] h-[56px] object-cover rounded border border-line" />
                  <button onClick={() => set({ images: d.images.filter((_, j) => j !== i) })}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-white
                      flex items-center justify-center" aria-label="Remove photo">
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
              {(d.images.length < 6 || d.files.length < 10) && (
                <label className="w-[72px] h-[56px] rounded border border-dashed border-line flex flex-col
                  items-center justify-center text-muted hover:border-navy cursor-pointer">
                  <Icon name="plus" size={14} />
                  <span className="text-[9.5px] mt-0.5">Add file</span>
                  <input type="file" multiple hidden
                    onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {d.files.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2.5">
                {d.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 h-9 px-2.5 rounded border border-line bg-wash">
                    <Icon name="file" size={14} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-[12.5px] truncate">{f.name}</span>
                    <span className="text-[11px] text-muted shrink-0">{fmtSize(f.size)}</span>
                    <button onClick={() => set({ files: d.files.filter((_, j) => j !== i) })}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-accent shrink-0"
                      aria-label="Remove file">
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {d.voice ? (
              <div className="flex items-center gap-2">
                <audio controls src={d.voice} className="flex-1 h-9" />
                <button onClick={() => set({ voice: '' })}
                  className="w-8 h-8 rounded border border-line flex items-center justify-center
                    text-muted hover:text-accent shrink-0" aria-label="Remove voice note">
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : recState === 'recording' ? (
              <button onClick={stopRec}
                className="w-full h-10 rounded bg-accent text-white text-[13px] font-semibold animate-pulse">
                ● Recording… tap to stop
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={startRec}
                  className="flex-1 h-10 rounded border border-navy text-navy text-[13px] font-semibold hover:bg-wash">
                  🎙 Record a voice note
                </button>
                <label className="h-10 px-3 rounded border border-line text-[12.5px] font-medium
                  hover:bg-wash cursor-pointer flex items-center">
                  Attach audio
                  <input type="file" accept="audio/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onVoiceFile(f); }} />
                </label>
              </div>
            )}
            {recState === 'nomic' && (
              <p className="text-[11.5px] text-muted mt-1.5">
                The microphone is not available here — record on the phone and use Attach audio.
              </p>
            )}
          </div>

          {/* ------------------------------------- branch(es), then who */}
          {editing ? (
            <label className="block">
              <span className={labelCls}>Branch *</span>
              <select value={d.branch} onChange={(e) => set({ branch: e.target.value, assignee: '', assignees: [] })}
                className={inputCls}>
                <option value="">Pick a branch…</option>
                {(boot.branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          ) : (
            <div className="block">
              <span className={labelCls}>
                Branches *{pickedBranches.length > 1 ? ' — ' + pickedBranches.length : ''}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(boot.branches || []).map((b) => {
                  const on = pickedBranches.includes(b.id);
                  return (
                    <button key={b.id} type="button"
                      onClick={() => {
                        const next = on ? pickedBranches.filter((x) => x !== b.id) : [...pickedBranches, b.id];
                        // Drop anyone who no longer belongs to a chosen branch.
                        const keep = (d.assignees || []).filter((uid) => {
                          const u = (boot.users || []).find((x) => x.id === uid);
                          return u && next.some((bb) => u.branches.includes(bb));
                        });
                        set({ branches: next, assignees: keep, assignee: keep[0] || '' });
                      }}
                      className={'h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors '
                        + (on ? 'bg-accent text-white border-accent' : 'bg-wash border-line text-ink hover:border-navy')}>
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="block">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[12px] font-semibold text-ink-2">
                For *{(d.assignees || []).length > 1 ? ' — ' + (d.assignees || []).length + ' people' : ''}
              </span>
              {!editing && people.length > 0 && (
                <button type="button" onClick={toggleAll}
                  className="text-[12px] font-semibold text-accent hover:underline shrink-0">
                  {allOn ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {pickedBranches.length === 0 ? (
              <div className={inputCls + ' opacity-50 flex items-center'}>Pick a branch first</div>
            ) : people.length === 0 ? (
              <div className={inputCls + ' opacity-50 flex items-center'}>Nobody in the chosen branch(es)</div>
            ) : (
              <div className="rounded border border-line divide-y divide-line-soft max-h-[184px] overflow-y-auto">
                {people.map((u) => {
                  const on = (d.assignees || []).includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-wash">
                      <input type="checkbox" checked={on} className="accent-[#FF0000]"
                        disabled={!!editing && !on && (d.assignees || []).length >= 1}
                        onChange={() => {
                          const cur = d.assignees || [];
                          const next = on ? cur.filter((x) => x !== u.id) : [...cur, u.id];
                          set({ assignees: next, assignee: next[0] || '' });
                        }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{u.name}</span>
                        <span className="block text-[11.5px] text-muted truncate">
                          {u.title || u.role}
                          {pickedBranches.length > 1 && ' · ' + u.branches.filter((b) => pickedBranches.includes(b)).map(branchName).join(', ')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {(d.assignees || []).length > 1 && !editing && (
              <span className="block text-[11.5px] text-muted-2 mt-1.5 leading-relaxed">
                {(d.assignees || []).length} separate tasks are created, one each, so every person can complete their own.
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className={labelCls}>Deadline</span>
              <input type="date" value={d.due} onChange={(e) => set({ due: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Time</span>
              <TimePicker value={d.dueTime} onChange={(__t) => set({ dueTime: __t })} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Priority</span>
              <select value={d.priority} onChange={(e) => set({ priority: e.target.value })} className={inputCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          {err && <p className="text-accent text-[12.5px]">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line sticky bottom-0 bg-white
          pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose}
            className="h-10 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">Cancel</button>
          <button onClick={save} disabled={busy || !d.title.trim() || !d.assignee}
            className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Schedule task'}
          </button>
        </div>
      </div>
    </div>
  );
}
