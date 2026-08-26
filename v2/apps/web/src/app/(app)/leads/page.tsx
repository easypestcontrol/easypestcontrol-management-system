'use client';

/* ============================================================================
   Leads — the sales pipeline. Kanban board + list, capture, and the lead
   drawer with the call-outcome SOP. Ported from v1 assets/js/views/leads.js.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Bootstrap, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { money, moneyShort } from 'shared';
import {
  STAGES, stageLabel, isOpen, assignableUsers, commitment, dueState, dayDelta,
  relDay, initials, type Lead, type BootUser,
} from './lib';
import LeadDrawer from './lead-drawer';
import NewLead from './new-lead';
import StageDialog from './stage-dialog';
import { useBranchFilter } from '@/components/branch-filter';
import { ListScreen } from '@/components/mobile';

export default function Leads() {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  // Eleven 168px columns need 1220px. On a phone that is a canvas three times
  // wider than the window, so the list — which stacks — is the honest default.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [q, setQ] = useState('');
  const [fStage, setFStage] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Saving a quotation raised from a lead lands back here as /leads?open=LD-x,
  // so the drawer reopens on the lead the user was working.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('open');
    if (want) setOpenId(want);
  }, []);
  const [showNew, setShowNew] = useState(false);
  const [move, setMove] = useState<{ lead: Lead; to: string } | null>(null);
  const [dragOver, setDragOver] = useState('');

  const bf = useBranchFilter();
  const reload = useCallback(() => {
    api.get<Lead[]>('/leads' + (bf.branch ? '?branch=' + bf.branch : ''))
      .then(setRows).catch(() => setRows([]));
  }, [bf.branch]);

  useEffect(() => {
    reload();
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, [reload]);

  const users = (boot?.users || []) as unknown as BootUser[];
  const owners = useMemo(() => assignableUsers(users), [users]);
  const userName = useCallback(
    (id: string) => users.find((u) => u.id === id)?.name || id || '—', [users]);

  /* v1 filters on name+phone+area+source in one string (leads.js:49-53). */
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return (rows || []).filter((l) =>
      (!needle || (l.name + l.phone + l.area + l.source).toLowerCase().indexOf(needle) >= 0) &&
      (!fStage || l.stage === fStage) &&
      (!fOwner || l.owner === fOwner));
  }, [rows, q, fStage, fOwner]);

  const open = (rows || []).filter(isOpen);
  const pipeline = open.reduce((a, b) => a + b.value, 0);
  const dueNow = (rows || []).filter((l) => {
    const c = commitment(l);
    return c && dayDelta(c.date) <= 0;
  }).length;

  /* ------------------------------------------------------- stage movement */
  async function moveTo(lead: Lead, to: string) {
    if (lead.stage === to) return;
    // These three need more than a drop: a date, or a reason.
    if (to === 'followup' || to === 'inspection' || to === 'lost') {
      setMove({ lead, to });
      return;
    }
    await api.post('/leads/' + lead.id + '/stage', { stage: to });
    reload();
  }

  function onDrop(e: React.DragEvent, to: string) {
    e.preventDefault();
    setDragOver('');
    const id = e.dataTransfer.getData('text/plain');
    const lead = (rows || []).find((l) => l.id === id);
    if (lead) void moveTo(lead, to);
  }

  /* -------------------------------------------------------------- pieces */
  const ownerDot = (id: string) => {
    const u = users.find((x) => x.id === id);
    return (
      <span title={'Assigned to ' + (u?.name || id)}
        className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center shrink-0"
        style={{ background: u?.color || '#141414' }}>
        {initials(u?.name || '?')}
      </span>
    );
  };

  function card(l: Lead) {
    const due = dueState(l);
    return (
      <div key={l.id} draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
        onClick={() => setOpenId(l.id)}
        className="rounded border border-line bg-white shadow-card p-2.5 cursor-pointer hover:border-navy/40 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold truncate">{l.name}</span>
          <span className="zpill outline shrink-0">{l.source}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-[12px] text-muted truncate">{l.area}</span>
          <span className="text-[13px] font-semibold text-navy shrink-0">
            {l.value ? moneyShort(l.value) : '—'}
          </span>
        </div>
        {due && (
          <div className={'mt-2 text-[11.5px] ' + due.cls}>
            {due.kind} {due.when} · {due.text}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-line-soft">
          <span className="flex items-center gap-1.5">
            {ownerDot(l.owner)}
            <span className="text-[11px] text-muted-2">{relDay(l.createdAt)}</span>
          </span>
          <span className="text-[11px] text-muted-2">{l.id}</span>
        </div>
      </div>
    );
  }

  function board() {
    return (
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-[1220px]">
          {STAGES.map((s) => {
            const items = filtered.filter((l) => l.stage === s.id);
            const total = items.reduce((a, b) => a + b.value, 0);
            return (
              <div key={s.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver((d) => (d === s.id ? '' : d))}
                onDrop={(e) => onDrop(e, s.id)}
                className={'flex-1 min-w-[168px] rounded-md border bg-white flex flex-col ' +
                  (dragOver === s.id ? 'border-accent' : 'border-line')}>
                <div className="flex items-center gap-2 px-3 h-10 border-b border-line-soft">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-2 truncate">
                    {s.label}
                  </span>
                  <span className="zpill red ml-auto">{items.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[120px] flex-1">
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted-2 text-center py-5">Empty</p>
                  ) : items.map(card)}
                </div>
                <div className="flex items-center justify-between px-3 h-9 border-t border-line-soft bg-wash rounded-b-md">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Total</span>
                  <span className="text-[12.5px] font-semibold">{moneyShort(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function list() {
    if (filtered.length === 0) {
      return (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No leads found</p>
          <p className="text-muted text-[13px] mt-1">Try a different search, or capture a new lead.</p>
        </div>
      );
    }
    return (
      <table className="ztable">
        <thead>
          <tr>
            <th>Lead</th><th>Source</th><th>Area</th><th>Branch</th>
            <th style={{ textAlign: 'right' }}>Value</th><th>Stage</th><th>Assigned to</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => {
            const due = dueState(l);
            const b = boot?.branches.find((x) => x.id === l.branch);
            return (
              <tr key={l.id} className="zrow" onClick={() => setOpenId(l.id)}>
                <td>
                  <span className="block font-medium text-navy">{l.name}</span>
                  <span className="block text-[11.5px] text-muted">{l.phone}</span>
                </td>
                <td><span className="zpill outline">{l.source}</span></td>
                <td>{l.area || '—'}</td>
                <td>{b ? <span className="zpill">{b.code || b.name}</span> : <span className="text-muted-2">—</span>}</td>
                <td className="text-right font-semibold">{l.value ? money(l.value) : '—'}</td>
                <td>
                  <span className={'zpill ' + (l.stage === 'won' ? 'navy' : l.stage === 'lost' ? '' : 'outline')}>
                    {stageLabel(l.stage)}
                  </span>
                  {due && <span className={'block mt-1 text-[11px] ' + due.cls}>{due.kind} {due.when} · {due.text}</span>}
                </td>
                <td>
                  <span className="flex items-center gap-1.5">
                    {ownerDot(l.owner)}
                    <span className="text-[12.5px]">{userName(l.owner)}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  /* -------------------------------------------------------------- render */
  return (
    <>
      {/* A lead on the road is a name and a phone number. The pipeline board and the follow-up log are desk work. */}
      <ListScreen
        back="/dashboard"
        title="Leads"
        loading={!rows}
        search={q}
        onSearch={setQ}
        rows={(rows || []).map((l) => ({
          id: l.id,
          href: '/leads?open=' + l.id,
          title: l.name,
          meta: [l.phone, l.area].filter(Boolean).join(' \u00b7 ') || l.id,
          amount: l.value ? money(l.value) : undefined,
          tone: 'info' as const,
          state: l.stage || 'New',
        }))}
        empty={q ? 'Nothing matches that' : 'No leads yet'}
        emptyHint={q ? 'Try a phone number or part of the name.'
          : 'Add the first one with the red button.'}
        fabOnClick={() => setShowNew(true)}
        fabLabel="New lead"
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Leads</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {open.length} open · {money(pipeline)} in pipeline
              {dueNow > 0 && <span className="text-accent"> · {dueNow} due today or overdue</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {bf.el}
          <div className="flex rounded border border-line overflow-hidden">
            {(['board', 'list'] as const).map((m) => (
              <button key={m} onClick={() => setView(m)}
                className={'h-8 px-3 text-[12.5px] font-medium ' +
                  (view === m ? 'bg-navy text-white' : 'bg-white text-ink-2 hover:bg-wash')}>
                {m === 'board' ? 'Pipeline' : 'List'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New lead
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 w-[300px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads by name, phone or area…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
        <select value={fStage} onChange={(e) => setFStage(e.target.value)}
          className="h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={fOwner} onChange={(e) => setFOwner(e.target.value)}
          className="h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
          <option value="">All owners</option>
          {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {!rows ? (
        <div className="p-4 flex gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-[260px] rounded-md border border-line-soft bg-wash animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No leads yet</p>
          <p className="text-muted text-[13px] mt-1">
            Every call, WhatsApp or walk-in starts here — capture the first enquiry.
          </p>
        </div>
      ) : view === 'board' && !narrow ? board() : list()}

    </div>
      {openId && boot && (
        <LeadDrawer id={openId} boot={boot}
          onClose={() => setOpenId(null)} onChanged={reload} />
      )}
      {showNew && boot && (
        <NewLead boot={boot} me={me} leads={rows || []}
          onClose={() => setShowNew(false)}
          onSaved={(id) => { setShowNew(false); reload(); setOpenId(id); }} />
      )}
      {move && (
        <StageDialog lead={move.lead} to={move.to} users={users}
          onClose={() => setMove(null)}
          onDone={() => { setMove(null); reload(); }} />
      )}
    </>
  );
}
