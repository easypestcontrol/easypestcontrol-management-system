'use client';

/* ============================================================================
   Tasks — the team's work list, laid out the way a task manager should be:
   a real table (cards on phones), a detail view per task, and a scheduling
   form where the BRANCH is picked first and only that branch's people appear.
   A task can carry reference photos and one voice note — recorded right in
   the form where the microphone is available, or attached as an audio file
   where it is not.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';
import { usePager } from '@/components/pager';
import { ListScreen, niceDate } from '@/components/mobile';

/* ------------------------------------------------------------------ types */

interface Row {
  id: string; title: string; notes: string; assignee: string; createdBy: string;
  branch: string; due: string; dueTime: string; priority: string; status: string;
  doneAt: string; imageCount: number; hasVoice: boolean;
  assigneeName: string; assigneeColor: string; createdByName: string;
}
interface Full extends Row { images: string[]; voice: string }
interface Payload { rows: Row[]; canManage: boolean }

interface Draft {
  title: string; notes: string; branch: string; assignee: string;
  due: string; dueTime: string; priority: string;
  images: string[]; voice: string;
}

const blank = (): Draft => ({
  title: '', notes: '', branch: '', assignee: '',
  due: '', dueTime: '', priority: 'normal', images: [], voice: '',
});

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
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
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

const PRIO: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'zpill red' },
  normal: { label: 'Normal', cls: 'zpill outline' },
  low: { label: 'Low', cls: 'zpill' },
};

const inputCls = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

/* ==================================================================== page */

export default function TasksPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState('');
  const [openTask, setOpenTask] = useState<Full | null>(null);
  const [err, setErr] = useState('');
  const bf = useBranchFilter();

  const load = useCallback(() => {
    api.get<Payload>('/tasks' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setData).catch(() => setData({ rows: [], canManage: false }));
  }, [bf.branch]);

  useEffect(() => {
    load();
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
  }, [load]);

  const rows = useMemo(
    () => (data?.rows || []).filter((t) => (tab === 'open' ? t.status !== 'done' : t.status === 'done')),
    [data, tab],
  );
  const pg = usePager(rows);
  const openN = (data?.rows || []).filter((t) => t.status !== 'done').length;
  const doneN = (data?.rows || []).length - openN;
  const today = todayISO();
  const overdue = (t: Row) => t.status !== 'done' && !!t.due && t.due < today;
  const canManage = !!data?.canManage;

  async function openDetail(id: string) {
    try { setOpenTask(await api.get<Full>('/tasks/' + id)); }
    catch { /* row stays */ }
  }

  async function remove(id: string) {
    if (!confirm('Remove this task?')) return;
    try { await api.del('/tasks/' + id); setOpenTask(null); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove'); }
  }

  async function editFrom(t: Full) {
    setOpenTask(null);
    setEditing(t.id);
    setDraft({
      title: t.title, notes: t.notes, branch: t.branch, assignee: t.assignee,
      due: t.due, dueTime: t.dueTime, priority: t.priority,
      images: t.images || [], voice: t.voice || '',
    });
  }

  const dueCell = (t: Row) => (
    !t.due ? <span className="text-muted-2">—</span> : (
      <span className={overdue(t) ? 'text-accent font-bold'
        : t.due === today && t.status !== 'done' ? 'text-accent font-semibold' : ''}>
        {overdue(t) ? 'Overdue · ' : t.due === today && t.status !== 'done' ? 'Today · ' : ''}
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
      {t.hasVoice && <span className="text-[10.5px] text-muted" title="Voice note">🎙</span>}
    </>
  );

  return (
    <>
      {/* A to-do read on the move: what, who, and by when. */}
      <ListScreen
        title="Tasks"
        loading={!data}
        rows={(data?.rows || []).map((t) => ({
          id: t.id,
          title: t.title,
          right: t.due ? niceDate(t.due) : '',
          meta: [t.assigneeName || 'Nobody', t.dueTime].filter(Boolean).join(' \u00b7 '),
          tone: (t.status === 'done' ? 'good'
            : t.priority === 'high' ? 'bad' : 'info') as 'good' | 'bad' | 'info',
          state: t.status === 'done' ? 'Done'
            : t.priority === 'high' ? 'High priority' : 'Open',
        }))}
        empty="No tasks"
        emptyHint="Anything that has to happen by a date, given to a person."
      />
    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Tasks</h1>
          {data && (
            <span className="text-muted-2 text-[12.5px]">
              {openN} open{doneN ? ` · ${doneN} done` : ''}
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
        {([['open', 'Open', openN], ['done', 'Completed', doneN]] as const).map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)}
            className={'relative h-12 lg:h-10 px-3 text-[13px] font-medium '
              + (tab === id ? 'text-navy' : 'text-muted hover:text-ink')}>
            {label}
            <span className={'ml-1.5 text-[11px] ' + (tab === id ? 'text-accent font-semibold' : 'text-muted-2')}>
              {n}
            </span>
            {tab === id && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>

      {err && <p className="px-4 lg:px-6 py-2 text-[12.5px] font-medium text-accent">{err}</p>}

      {/* --------------------------------------------------------- list */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">
            {tab === 'open' ? 'Nothing to do' : 'Nothing completed yet'}
          </p>
          <p className="text-muted text-[13px] mt-1">
            {canManage
              ? 'Schedule a task for anyone on the team with New task.'
              : 'Tasks scheduled for you land here — with the deadline.'}
          </p>
        </div>
      ) : (
        <>
          {/* phones: cards */}
          <div className="lg:hidden flex flex-col gap-2.5 p-3">
            {pg.pageRows.map((t) => (
              <div key={t.id}
                className={'rounded-xl border border-line bg-white p-4 shadow-card '
                  + (t.status === 'done' ? 'opacity-60' : '')}>
                <div className="flex items-start gap-3">
                  <button className="flex-1 min-w-0 text-left" onClick={() => openDetail(t.id)}>
                    <p className={'text-[14px] font-semibold ' + (t.status === 'done' ? 'line-through' : '')}>
                      {t.title}
                    </p>
                    {t.notes && <p className="text-[12px] text-muted truncate mt-0.5">{t.notes}</p>}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-[11.5px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center"
                          style={{ background: t.assigneeColor }}>{initials(t.assigneeName)}</span>
                        {t.assigneeName}
                      </span>
                      {dueCell(t)}
                      <span className={PRIO[t.priority]?.cls}>{PRIO[t.priority]?.label}</span>
                      {attachIcons(t)}
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* desk: the table */}
          <table className="ztable max-lg:hidden">
            <thead>
              <tr>
                <th>Task</th><th>Assigned to</th><th>Deadline</th>
                <th>Priority</th><th>Branch</th>
                {canManage && <th style={{ width: 96 }}></th>}
              </tr>
            </thead>
            <tbody>
              {pg.pageRows.map((t) => (
                <tr key={t.id} className={'zrow ' + (t.status === 'done' ? 'opacity-60' : '')}
                  onClick={() => openDetail(t.id)}>
                  <td>
                    <span className={'block font-semibold text-navy max-w-[340px] truncate '
                      + (t.status === 'done' ? 'line-through' : '')}>{t.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-2">
                      <span className="font-mono">{t.id}</span>
                      {t.notes && <span className="truncate max-w-[260px]">{t.notes}</span>}
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
                  <td className="text-[12.5px]">{dueCell(t)}</td>
                  <td><span className={PRIO[t.priority]?.cls}>{PRIO[t.priority]?.label}</span></td>
                  <td className="text-[12px] text-muted">
                    {boot?.branches.find((b) => b.id === t.branch)?.name || t.branch || '—'}
                  </td>
                  {canManage && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => openDetail(t.id).then(() => {})}
                          className="h-7 px-2.5 rounded border border-line text-[12px] hover:bg-wash">Open</button>
                        <button onClick={() => remove(t.id)} title="Remove"
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

      {/* ------------------------------------------------------- detail */}
      {openTask && (
        <TaskDetail t={openTask} canManage={canManage}
          branchName={boot?.branches.find((b) => b.id === openTask.branch)?.name || openTask.branch}
          onClose={() => setOpenTask(null)}
          onToggle={async () => {
            await api.patch('/tasks/' + openTask.id,
              { status: openTask.status === 'done' ? 'open' : 'done' }).catch(() => {});
            setOpenTask(null); load();
          }}
          onEdit={() => editFrom(openTask)}
          onRemove={() => remove(openTask.id)} />
      )}

      {/* --------------------------------------------------- new / edit */}
      {draft && boot && (
        <TaskForm draft={draft} setDraft={setDraft} boot={boot} editing={editing}
          onClose={() => { setDraft(null); setEditing(''); }}
          onSaved={() => { setDraft(null); setEditing(''); load(); }} />
      )}
    </div>
    </>
  );
}

/* ============================================================ detail sheet */

function TaskDetail({ t, canManage, branchName, onClose, onToggle, onEdit, onRemove }: {
  t: Full; canManage: boolean; branchName: string;
  onClose: () => void; onToggle: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const [zoom, setZoom] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[560px] rounded-t-xl sm:rounded-lg shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line sticky top-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={PRIO[t.priority]?.cls}>{PRIO[t.priority]?.label}</span>
              {t.status === 'done'
                ? <span className="zpill navy">Completed</span>
                : <span className="zpill outline">Open</span>}
              <span className="font-mono text-[11px] text-muted-2">{t.id}</span>
            </div>
            <h2 className="text-[16px] font-bold mt-1.5 leading-snug">{t.title}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 shrink-0">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {t.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">What has to be done</p>
              <p className="text-[13.5px] text-ink-2 leading-relaxed whitespace-pre-wrap">{t.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Assigned to</p>
              <span className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                  style={{ background: t.assigneeColor }}>{initials(t.assigneeName)}</span>
                {t.assigneeName}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Deadline</p>
              {t.due ? `${fmtD(t.due)}${t.dueTime ? ' · ' + fmtT(t.dueTime) : ''}` : '—'}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Branch</p>
              {branchName || '—'}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Scheduled by</p>
              {t.createdByName}
            </div>
          </div>

          {(t.images || []).length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">Photos</p>
              <div className="flex flex-wrap gap-2">
                {t.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" onClick={() => setZoom(src)}
                    className="w-[96px] h-[72px] object-cover rounded border border-line cursor-zoom-in" />
                ))}
              </div>
            </div>
          )}

          {t.voice && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">Voice note</p>
              <audio controls src={t.voice} className="w-full h-10" />
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line flex gap-2 flex-wrap
          pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onToggle}
            className={'h-10 px-4 rounded text-[13px] font-semibold '
              + (t.status === 'done'
                ? 'border border-line hover:bg-wash'
                : 'bg-navy text-white hover:brightness-110')}>
            {t.status === 'done' ? 'Reopen' : 'Mark completed'}
          </button>
          <span className="flex-1" />
          {canManage && (
            <>
              <button onClick={onEdit}
                className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
                Edit
              </button>
              <button onClick={onRemove}
                className="h-10 px-3.5 rounded border border-line text-[13px] text-muted hover:text-accent">
                Remove
              </button>
            </>
          )}
        </div>
      </div>

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

/* ============================================================== the form */

function TaskForm({ draft, setDraft, boot, editing, onClose, onSaved }: {
  draft: Draft; setDraft: (d: Draft | null) => void; boot: Bootstrap;
  editing: string; onClose: () => void; onSaved: () => void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const d = draft;
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });

  // The branch decides who can be picked — nobody shows until it is chosen.
  const people = useMemo(
    () => (boot.users || []).filter((u) =>
      u.role !== 'client' && d.branch && u.branches.includes(d.branch)),
    [boot, d.branch],
  );

  /* --------------------------------------------------- voice recording */
  const [recState, setRecState] = useState<'idle' | 'recording' | 'nomic'>('idle');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRec() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecState('nomic'); return;
    }
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
      rec.start();
      recRef.current = rec;
      setRecState('recording');
    } catch { setRecState('nomic'); }
  }
  function stopRec() {
    recRef.current?.stop();
    recRef.current = null;
    setRecState('idle');
  }
  function onVoiceFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => set({ voice: String(reader.result || '') });
    reader.readAsDataURL(f);
  }

  async function addImages(files: FileList) {
    const room = 6 - d.images.length;
    const picked = Array.from(files).slice(0, room);
    const shrunk = await Promise.all(picked.map((f) => shrinkImage(f, 900)));
    set({ images: [...d.images, ...shrunk] });
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      if (editing) await api.patch('/tasks/' + editing, d);
      else await api.post('/tasks', d);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    setBusy(false);
  }

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
              className="w-full min-h-[76px] px-3 py-2 rounded border border-line text-[13px] outline-none focus:border-navy" />
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
              {d.images.length < 6 && (
                <label className="w-[72px] h-[56px] rounded border border-dashed border-line flex flex-col
                  items-center justify-center text-muted hover:border-navy cursor-pointer">
                  <Icon name="plus" size={14} />
                  <span className="text-[9.5px] mt-0.5">Photo</span>
                  <input type="file" accept="image/*" multiple hidden
                    onChange={(e) => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>

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

          {/* ------------------------------------- branch first, then who */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Branch *</span>
              <select value={d.branch}
                onChange={(e) => set({ branch: e.target.value, assignee: '' })}
                className={inputCls}>
                <option value="">Pick a branch…</option>
                {(boot.branches || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>For *</span>
              <select value={d.assignee} disabled={!d.branch}
                onChange={(e) => set({ assignee: e.target.value })}
                className={inputCls + (d.branch ? '' : ' opacity-50')}>
                <option value="">
                  {d.branch ? (people.length ? 'Pick a person…' : 'Nobody in this branch') : 'Pick the branch first'}
                </option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.title || u.role}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className={labelCls}>Deadline</span>
              <input type="date" value={d.due} onChange={(e) => set({ due: e.target.value })}
                className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Time</span>
              <input type="time" value={d.dueTime} onChange={(e) => set({ dueTime: e.target.value })}
                className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Priority</span>
              <select value={d.priority} onChange={(e) => set({ priority: e.target.value })}
                className={inputCls}>
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
            className="h-10 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !d.title.trim() || !d.assignee}
            className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Schedule task'}
          </button>
        </div>
      </div>
    </div>
  );
}
