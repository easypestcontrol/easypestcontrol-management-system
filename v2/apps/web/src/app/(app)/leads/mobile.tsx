'use client';

/* ============================================================================
   Leads, on a phone.

   The list said "Sri Krishna Apartments · new" and, three rows down, "Sri
   Krishna Apartments · lost" — the same name twice, a lowercase database word
   for a stage, and no hint of which one anybody should do something about.
   You could see that leads existed. You could not see the pipeline.

   So the pipeline is the top of the screen: every stage with how many are in
   it and what they are worth, tappable to narrow the list. Under it, the
   leads themselves in the order a salesperson actually works them — overdue
   first, then due today, then the rest — each one saying its stage in the
   words people use, what it is worth, and what was promised and when.
   ========================================================================== */

import { useState } from 'react';
import { money, moneyShort } from 'shared';
import { Icon } from '@/components/icons';
import { BackBar, Card, Fab, PickChip, Screen, SearchBox } from '@/components/mobile';
import { STAGES, dueState, isOpen, dayDelta, commitment, relDay, type Lead } from './lib';

/* The stage, in the words people use out loud, with the tone it deserves.
   A lead in Contract is nearly money; a lost one is history. */
const TONE: Record<string, string> = {
  new: 'bg-sky text-sky-ink',
  followup: 'bg-amber text-amber-ink',
  inspection: 'bg-amber text-amber-ink',
  quoted: 'bg-sky text-sky-ink',
  contract: 'bg-mint text-mint-ink',
  won: 'bg-mint text-mint-ink',
  lost: 'bg-wash text-muted',
};

const label = (id: string) => STAGES.find((s) => s.id === id)?.label || id;

/** How urgently this lead needs somebody: lower sorts first. */
function urgency(l: Lead): number {
  const c = commitment(l);
  if (c) return dayDelta(c.date);           // overdue is negative, today is 0
  if (!isOpen(l)) return 9999;              // won and lost sit at the bottom
  return 500;                               // open, nothing promised
}

export default function LeadsMobile({ rows, owners, onOpen, onNew }: {
  rows: Lead[] | null;
  /** Who a lead can belong to — the same list the desk filters by. */
  owners: Array<{ id: string; name: string }>;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const needle = q.trim().toLowerCase();
  const all = rows || [];

  const shown = all
    .filter((l) => !stage || l.stage === stage)
    .filter((l) => !owner || l.owner === owner)
    .filter((l) => !needle
      || (l.name + ' ' + l.phone + ' ' + l.area + ' ' + l.source).toLowerCase().includes(needle))
    .sort((a, b) => urgency(a) - urgency(b));

  const open = all.filter(isOpen);
  const pipeline = open.reduce((a, l) => a + l.value, 0);
  const dueNow = all.filter((l) => {
    const c = commitment(l);
    return c && dayDelta(c.date) <= 0;
  }).length;

  return (
    <Screen>
      <BackBar title="Leads" fallback="/dashboard"
        sub={rows ? open.length + ' open · ' + moneyShort(pipeline) + ' in the pipeline' : undefined} />
      <SearchBox value={q} onChange={setQ} placeholder="Search a name, a number, an area" />

      {/* The pipeline itself. Seven stages, what is in each and what it is
          worth — tap one to see only those. This is the board, in the only
          shape a 390px screen can hold it. */}
      <div className="flex gap-2 px-4 pb-3 pt-0.5 overflow-x-auto no-scrollbar bg-white border-b border-line">
        {owners.length > 1 && (
          <PickChip label="Owner" value={owner} onPick={setOwner}
            options={[{ key: '', label: 'Anyone' },
              ...owners.map((u) => ({ key: u.id, label: u.name }))]} />
        )}
        <button type="button" onClick={() => setStage('')}
          className={'h-[34px] px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 '
            + (stage === '' ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
          All {all.length ? '· ' + all.length : ''}
        </button>
        {STAGES.map((s) => {
          const items = all.filter((l) => l.stage === s.id);
          if (!items.length && stage !== s.id) return null;
          return (
            <button key={s.id} type="button" onClick={() => setStage(stage === s.id ? '' : s.id)}
              className={'h-[34px] px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 '
                + (stage === s.id ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
              {s.label} · {items.length}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {/* What the pipeline is worth, and what is already late. */}
        {rows !== null && all.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-[18px] px-4 py-3">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">In the pipeline</p>
              <p className="text-[19px] font-bold mt-1 leading-none">{moneyShort(pipeline)}</p>
              <p className="text-[12.5px] text-muted-2 mt-1">{open.length} open</p>
            </div>
            <div className="bg-white rounded-[18px] px-4 py-3">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Needs a call</p>
              <p className={'text-[19px] font-bold mt-1 leading-none ' + (dueNow ? 'text-accent' : '')}>
                {dueNow}
              </p>
              <p className="text-[12.5px] text-muted-2 mt-1">due today or late</p>
            </div>
          </div>
        )}

        {rows === null ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[92px] rounded-[20px] bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">
              {all.length === 0 ? 'No leads yet' : 'Nothing here'}
            </p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              {all.length === 0
                ? 'Every call, WhatsApp or walk-in starts here — capture the first one with the red button.'
                : needle ? 'Try a phone number, or part of the name.' : 'Nothing at this stage right now.'}
            </p>
          </Card>
        ) : (
          <Card flush className="mb-4">
            {shown.map((l) => {
              const due = dueState(l);
              const late = due && dayDelta(due.date) <= 0;
              return (
                <button key={l.id} type="button" onClick={() => onOpen(l.id)}
                  className="w-full text-left px-4 py-3.5 border-b border-line-soft last:border-b-0
                    active:bg-wash">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15.5px] font-bold tracking-[-0.01em] truncate">{l.name}</span>
                    {l.value > 0 && (
                      <span className="text-[15px] font-bold tabular-nums shrink-0">{money(l.value)}</span>
                    )}
                  </span>

                  <span className="flex items-center gap-2 mt-1.5 min-w-0">
                    <span className={'inline-flex items-center h-6 px-2.5 rounded-full text-[12px] '
                      + 'font-bold shrink-0 ' + (TONE[l.stage] || 'bg-wash text-muted')}>
                      {label(l.stage)}
                    </span>
                    <span className="text-[13px] text-muted truncate">
                      {[l.area, l.source].filter(Boolean).join(' · ')}
                    </span>
                  </span>

                  {/* What was promised, and whether it has already gone past.
                      This is the line that decides who gets rung next. */}
                  {due ? (
                    <span className={'flex items-center gap-1.5 text-[13px] mt-1.5 font-semibold '
                      + (late ? 'text-accent' : 'text-ink-2')}>
                      {late && <Icon name="alert" size={13} className="shrink-0" />}
                      {due.kind} {due.when} · {due.text}
                    </span>
                  ) : (
                    <span className="block text-[12.5px] text-muted-2 mt-1.5">
                      {l.phone || 'No number'} · added {relDay(l.createdAt).toLowerCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </Card>
        )}
      </div>

      <Fab onClick={onNew} label="New lead" />
    </Screen>
  );
}
