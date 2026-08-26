'use client';

/* ============================================================================
   Services list — tabs, search, tech filter, and the schedule-service modal.
   Ported from v1 assets/js/views/jobs.js:35-168. A signed-in technician gets
   a "My day" filter (their own jobs, today) switched on by default.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Bootstrap, type Client, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import { addDays, isFieldTech } from 'shared';
import {
  SLOTS, JOB_TYPES, durationText, fmtTime, relDay, todayISO,
  type JobsList, type JobRow,
} from './format';
import { Avatar, Field, Modal, PriorityPill, StatusPill, inputCls, selectCls } from './ui';
import { useBranchFilter } from '@/components/branch-filter';
import JobsMobile from './mobile';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'open', label: 'All open' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'completed', label: 'Completed' },
] as const;

export default function Jobs() {
  const router = useRouter();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [data, setData] = useState<JobsList | null>(null);
  const [tab, setTab] = useState('today');
  const [q, setQ] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const isTech = isFieldTech(me?.role);
  const canManage = !!me && ['admin', 'ops', 'sales'].includes(me.role);

  useEffect(() => {
    api.get<SessionUser>('/auth/me').then((u) => {
      setMe(u);
    }).catch(() => {});
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    if (window.location.search.includes('new=1')) setShowNew(true);
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && TABS.some((t) => t.id === wanted)) setTab(wanted);
  }, []);

  // A technician's scope is set by the API; this only narrows the office view.
  const effectiveTech = techFilter;
  const bf = useBranchFilter();

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (tab) p.set('tab', tab);
    if (effectiveTech) p.set('techId', effectiveTech);
    if (q) p.set('q', q);
    if (bf.branch) p.set('branch', bf.branch);
    return api.get<JobsList>('/jobs?' + p.toString()).then(setData).catch(() => setData({ rows: [], counts: { today: 0, upcoming: 0, open: 0, unassigned: 0, completed: 0 } }));
  }, [tab, effectiveTech, q, bf.branch]);
  const pg = usePager(data?.rows || []);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const techs = (boot?.users || []).filter((u) => isFieldTech(u.role));
  const usersById = new Map((boot?.users || []).map((u) => [u.id, u]));
  const counts = data?.counts;

  return (
    <>
      {/* The phone gets the day as a list, with unassigned work lifted into a
          banner. The board below is drag-and-drop across a whole day and
          needs a mouse. */}
      <JobsMobile data={data} tab={tab} onTab={setTab}
        techName={(id) => usersById.get(id)?.name || ''}
        onNew={canManage ? () => setShowNew(true) : undefined} />

    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Services</h1>
          {counts && (
            <span className="text-muted-2 text-[12.5px]">
              {isTech || effectiveTech
                ? counts.today + ' today · ' + counts.upcoming + ' upcoming for you'
                : counts.today + ' scheduled today · ' + counts.unassigned + ' waiting for a technician'}
            </span>
          )}
        </div>
        {canManage && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 h-10 lg:h-8 px-3.5 shrink-0 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> Schedule service
          </button>
        )}
      </div>

      {/* --------------------------------------------------------- tabs */}
      {/* Five tabs do not fit 390px. They scroll rather than wrap, so the strip
          stays one line and the current tab is always the one you can see. */}
      <div className="flex items-center gap-1 px-4 lg:px-6 border-b border-line-soft
        overflow-x-auto no-scrollbar">
        {TABS.filter((t) => !((isTech || effectiveTech) && t.id === 'unassigned')).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={
              'relative h-12 lg:h-10 px-3 shrink-0 whitespace-nowrap text-[13px] font-medium ' +
              (tab === t.id ? 'text-navy' : 'text-muted hover:text-ink')
            }>
            {t.label}
            {counts && (
              <span className={'ml-1.5 text-[11px] ' + (tab === t.id ? 'text-accent font-semibold' : 'text-muted-2')}>
                {counts[t.id as keyof typeof counts]}
              </span>
            )}
            {tab === t.id && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------ filters */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 lg:max-w-[340px] flex-1 h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by reference, customer or service…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
        {!isTech && bf.el}
        {!isTech && (
          <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)}
            className="h-10 lg:h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none min-w-[168px]">
            <option value="">All technicians</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* --------------------------------------------------------- rows */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No services in this view</p>
          <p className="text-muted text-[13px] mt-1">Try a different tab or clear the filters.</p>
        </div>
      ) : (
        <>
        {/* phones get cards — a table is a desk thing */}
        <div className="lg:hidden flex flex-col gap-2.5 p-3">
          {pg.pageRows.map((j) => {
            const crew = j.techIds.map((id) => usersById.get(id)).filter(Boolean);
            return (
              <button key={j.id} onClick={() => router.push('/jobs/' + j.id)}
                className="text-left rounded-xl border border-line bg-white p-4 shadow-card active:bg-wash">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[15px] font-bold text-navy truncate">{j.clientName}</span>
                  <StatusPill status={j.status} />
                </div>
                <p className="text-[13px] text-ink-2 leading-snug">{j.title}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
                    <Icon name="calendar" size={14} className="opacity-70" />
                    {relDay(j.date)} · {fmtTime(j.slot)}
                  </span>
                  <span className="text-[11.5px] text-muted">{durationText(j.mins)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-line-soft">
                  <span className="text-[10.5px] font-mono text-muted-2">
                    {j.id}{j.visitNo ? ' · ' + j.visitNo + '/' + j.ofVisits : ''}
                  </span>
                  {crew.length ? (
                    <span className="flex items-center gap-1.5">
                      {crew.slice(0, 3).map((t, i) => (
                        <span key={t!.id} style={{ marginLeft: i ? -8 : 0 }}
                          className="rounded-full ring-2 ring-white inline-flex">
                          <Avatar name={t!.name} color={t!.color} size={22} />
                        </span>
                      ))}
                      <span className="text-[11.5px] text-muted">
                        {crew.length === 1 ? crew[0]!.name.split(' ')[0] : crew.length + ' techs'}
                      </span>
                    </span>
                  ) : (
                    <span className="zpill red">Unassigned</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <table className="ztable max-lg:hidden">
          <thead>
            <tr>
              <th>Ref</th><th>Customer &amp; site</th><th>Service</th>
              <th>Scheduled</th><th>Technician</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((j) => {
              const crew = j.techIds.map((id) => usersById.get(id)).filter(Boolean);
              return (
                <tr key={j.id} className="zrow" onClick={() => router.push('/jobs/' + j.id)}>
                  <td>
                    <span className="block font-semibold text-navy font-mono text-[12.5px]">{j.id}</span>
                    <span className="block text-[11px] text-muted-2">
                      {j.type}{j.visitNo ? ` ${j.visitNo}/${j.ofVisits}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className="block font-medium text-navy">{j.clientName}</span>
                    <span className="block text-[11.5px] text-muted">{j.clientArea || '—'}</span>
                  </td>
                  <td className="max-w-[220px]">
                    <span className="block truncate">{j.title}</span>
                    <span className="block text-[11.5px] text-muted">{durationText(j.mins)}</span>
                  </td>
                  <td>
                    <span className="block font-medium">{relDay(j.date)}</span>
                    <span className="block text-[11.5px] text-muted">{fmtTime(j.slot)}</span>
                  </td>
                  <td>
                    {crew.length ? (
                      <span className="flex items-center">
                        {crew.map((t, i) => (
                          <span key={t!.id} title={t!.name} style={{ marginLeft: i ? -6 : 0 }}
                            className="rounded-full ring-2 ring-white inline-flex">
                            <Avatar name={t!.name} color={t!.color} size={24} />
                          </span>
                        ))}
                        <span className="ml-2 text-[12.5px]">
                          {crew.length === 1 ? crew[0]!.name.split(' ')[0] : crew.length + ' techs'}
                        </span>
                      </span>
                    ) : (
                      <span className="zpill red">Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <StatusPill status={j.status} />
                      <PriorityPill priority={j.priority} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pg.el}
        </>
      )}

      {showNew && boot && (
        <NewJobModal
          boot={boot}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); router.push('/jobs/' + id); }}
        />
      )}
    </div>
    </>
  );
}

/* ============================================================== new job */
// v1 jobs.js:108-168 — customer required, type default One-Time, date default
// tomorrow, slot default 10:00, tech optional, >=1 service; mins = Σ mins.

function NewJobModal({ boot, onClose, onCreated }: {
  boot: Bootstrap; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState('');
  const [type, setType] = useState('One-Time');
  const [date, setDate] = useState(addDays(todayISO(), 1));
  const [slot, setSlot] = useState('10:00');
  const [techId, setTechId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [svcSel, setSvcSel] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Client[]>('/clients').then((rows) => {
      setClients(rows);
      if (rows.length) setClientId((c) => c || rows[0].id);
    }).catch(() => setClients([]));
  }, []);

  const techs = boot.users.filter((u) => isFieldTech(u.role));
  const mins = svcSel.reduce(
    (s, id) => s + (boot.services.find((x) => x.id === id)?.mins || 60), 0);

  async function save() {
    if (!clientId) { setErr('Pick a customer'); return; }
    if (!svcSel.length) { setErr('Pick at least one service'); return; }
    setBusy(true); setErr('');
    try {
      const j = await api.post<JobRow>('/jobs', {
        clientId, type, date, slot, techId, priority, serviceIds: svcSel,
        notes: notes.trim(),
      });
      onCreated(j.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not schedule the service');
      setBusy(false);
    }
  }

  return (
    <Modal title="Schedule a service" wide
      sub="Assign it now or leave it in the unassigned queue" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Customer" required>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectCls}>
            {!clients && <option value="">Loading…</option>}
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Service type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Time slot">
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className={selectCls}>
            {SLOTS.map((s) => <option key={s} value={s}>{fmtTime(s)}</option>)}
          </select>
        </Field>
        <Field label="Technician">
          <select value={techId} onChange={(e) => setTechId(e.target.value)} className={selectCls}>
            <option value="">— unassigned —</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
            <option value="normal">Normal</option>
            <option value="high">High priority</option>
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Services" required>
          <div className="rounded border border-line max-h-[158px] overflow-y-auto px-3 py-2">
            {boot.services.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input type="checkbox" checked={svcSel.includes(s.id)}
                  onChange={(e) => setSvcSel((sel) =>
                    e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))}
                  className="accent-[#FF0000]" />
                <span className="text-[13px]">
                  {s.name} <span className="text-muted">· {s.mins} min</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        {mins > 0 && (
          <p className="text-[12px] text-muted mt-1.5">
            Estimated {durationText(mins)} on site
          </p>
        )}
      </div>

      <div className="mt-4">
        <Field label="Instructions for the technician">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Access, contact person, what to look out for…"
            className="w-full min-h-[72px] px-3 py-2 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
        </Field>
      </div>

      {err && <p className="mt-3 text-[12.5px] text-accent font-medium">{err}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
          Cancel
        </button>
        <button onClick={save} disabled={busy}
          className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          {busy ? 'Scheduling…' : 'Schedule service'}
        </button>
      </div>
    </Modal>
  );
}
