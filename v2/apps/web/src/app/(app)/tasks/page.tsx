'use client';

/* ============================================================================
   Tasks — the team's to-do list, its own module below Home.
   The admin (or ops) schedules a task for anyone — sales, operations, a
   technician — with what has to be done, a deadline date AND time, and a
   priority. Everyone else opens this page and sees exactly their own list,
   ticks things done, nothing else. Branch-scoped like everything now.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';
import { usePager } from '@/components/pager';

interface Task {
  id: string; title: string; notes: string; assignee: string; createdBy: string;
  branch: string; due: string; dueTime: string; priority: string; status: string;
  doneAt: string;
  assigneeName: string; assigneeColor: string; createdByName: string;
}
interface Payload { rows: Task[]; canManage: boolean }

interface Draft {
  title: string; notes: string; assignee: string; due: string;
  dueTime: string; priority: string; branch: string;
}

const blank = (): Draft => ({
  title: '', notes: '', assignee: '', due: '', dueTime: '', priority: 'normal', branch: '',
});

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

const PRIO: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'zpill red' },
  normal: { label: 'Normal', cls: 'zpill outline' },
  low: { label: 'Low', cls: 'zpill' },
};

const inputCls = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';

export default function TasksPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
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
  const overdue = (t: Task) => t.status !== 'done' && !!t.due && t.due < today;
  const dueToday = (t: Task) => t.status !== 'done' && t.due === today;

  // The people the scheduler can pick — everyone active, filtered by the
  // chosen branch when one is set on the draft.
  const staff = (boot?.users || []).filter((u) => u.role !== 'client');

  async function toggle(t: Task) {
    try {
      await api.patch('/tasks/' + t.id, { status: t.status === 'done' ? 'open' : 'done' });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update'); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setErr('');
    try {
      if (editing) await api.patch('/tasks/' + editing, draft);
      else await api.post('/tasks', draft);
      setDraft(null); setEditing(''); load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm('Remove this task?')) return;
    try { await api.del('/tasks/' + id); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove'); }
  }

  const canManage = !!data?.canManage;

  return (
    <div>
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
            <button onClick={() => { setDraft(blank()); setEditing(''); }}
              className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={14} /> New task
            </button>
          )}
        </span>
      </div>

      {/* --------------------------------------------------------- tabs */}
      <div className="flex items-center gap-1 px-4 lg:px-6 border-b border-line-soft">
        {([['open', 'Open', openN], ['done', 'Done', doneN]] as const).map(([id, label, n]) => (
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

      {/* --------------------------------------------------------- rows */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">
            {tab === 'open' ? 'Nothing to do' : 'Nothing finished yet'}
          </p>
          <p className="text-muted text-[13px] mt-1">
            {canManage
              ? 'Schedule a task for anyone on the team with New task.'
              : 'Tasks scheduled for you land here — with the deadline.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line-soft">
            {pg.pageRows.map((t) => (
              <div key={t.id}
                className={'flex items-start gap-3 px-4 lg:px-6 py-3 ' + (t.status === 'done' ? 'opacity-55' : '')}>
                {/* the tick — the assignee's one verb */}
                <button onClick={() => toggle(t)} aria-label={t.status === 'done' ? 'Reopen' : 'Mark done'}
                  className={'mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors '
                    + (t.status === 'done'
                      ? 'bg-navy border-navy text-white'
                      : 'border-line hover:border-navy')}>
                  {t.status === 'done' && <Icon name="check" size={13} />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={'text-[13.5px] font-semibold ' + (t.status === 'done' ? 'line-through' : '')}>
                    {t.title}
                  </p>
                  {t.notes && <p className="text-[12.5px] text-muted mt-0.5 whitespace-pre-wrap">{t.notes}</p>}
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center"
                        style={{ background: t.assigneeColor }}>
                        {t.assigneeName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="text-ink-2 font-medium">{t.assigneeName}</span>
                    </span>
                    {t.due && (
                      <span className={overdue(t) ? 'text-accent font-bold'
                        : dueToday(t) ? 'text-accent font-semibold' : 'text-muted'}>
                        {overdue(t) ? 'Overdue — ' : dueToday(t) ? 'Today — ' : 'Due '}
                        {fmtD(t.due)}{t.dueTime ? ' · ' + fmtT(t.dueTime) : ''}
                      </span>
                    )}
                    <span className={PRIO[t.priority]?.cls || 'zpill outline'}>
                      {PRIO[t.priority]?.label || t.priority}
                    </span>
                    {canManage && (
                      <span className="text-muted-2 font-mono text-[10.5px]">{t.id}</span>
                    )}
                    {t.status === 'done' && t.doneAt && (
                      <span className="text-muted-2">done {t.doneAt.slice(0, 16)}</span>
                    )}
                  </div>
                </div>

                {canManage && (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => {
                      setEditing(t.id);
                      setDraft({
                        title: t.title, notes: t.notes, assignee: t.assignee,
                        due: t.due, dueTime: t.dueTime, priority: t.priority, branch: t.branch,
                      });
                    }}
                      className="h-8 px-2.5 rounded border border-line text-[12px] font-medium hover:bg-wash">
                      Edit
                    </button>
                    <button onClick={() => remove(t.id)} aria-label="Remove"
                      className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-accent hover:bg-red-wash">
                      <Icon name="x" size={13} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {pg.el}
        </>
      )}

      {err && !draft && (
        <p className="px-4 lg:px-6 py-2 text-[12.5px] font-medium text-accent">{err}</p>
      )}

      {/* --------------------------------------------------- new / edit */}
      {draft && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4 sm:p-6"
          onClick={() => { setDraft(null); setEditing(''); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[480px] max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold">{editing ? 'Edit task' : 'New task'}</h2>
              <button onClick={() => { setDraft(null); setEditing(''); }}
                className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <label className="block">
                <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Task *</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Collect renewal cheque from Medlife Hospital" className={inputCls} />
              </label>
              <label className="block">
                <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">What has to be done</span>
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="The details the person needs — spell it out"
                  className="w-full min-h-[76px] px-3 py-2 rounded border border-line text-[13px] outline-none focus:border-navy" />
              </label>
              <label className="block">
                <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">For *</span>
                <select value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                  className={inputCls}>
                  <option value="">Pick a person…</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} — {u.title || u.role}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Deadline</span>
                  <input type="date" value={draft.due}
                    onChange={(e) => setDraft({ ...draft, due: e.target.value })} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Time</span>
                  <input type="time" value={draft.dueTime}
                    onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Priority</span>
                  <select value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })} className={inputCls}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Branch</span>
                  <select value={draft.branch}
                    onChange={(e) => setDraft({ ...draft, branch: e.target.value })} className={inputCls}>
                    <option value="">Assignee&rsquo;s own branch</option>
                    {(boot?.branches || []).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {err && <p className="text-accent text-[12.5px]">{err}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
              <button onClick={() => { setDraft(null); setEditing(''); }}
                className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
                Cancel
              </button>
              <button onClick={save} disabled={busy || !draft.title.trim() || !draft.assignee}
                className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
                {busy ? 'Saving…' : editing ? 'Save' : 'Schedule task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
