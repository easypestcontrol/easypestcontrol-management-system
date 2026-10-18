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
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar, Card, Fab, PickChip, Screen, SearchBox } from '@/components/mobile';
import { STAGES, dueState, isOpen, dayDelta, commitment, relDay, fmtTime, type Lead, type LogEntry } from './lib';

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

/** "35 min ago", "3 h ago", "Yesterday", "12 Oct" - how fresh a lead is. */
function age(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min ago';
  if (min < 24 * 60 && relDay(iso) === 'Today') return Math.floor(min / 60) + ' h ago';
  return relDay(iso);
}

const initials = (name: string) => String(name || '?')
  .replace(/^(mr|mrs|ms|dr|miss)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  .slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

/** The latest "Contacted" note in the lead's history, if any. */
const contactedAt = (log: LogEntry[] | undefined) =>
  (log || []).slice().reverse().find((e) => /^Contacted\b/.test(e.text))?.at || '';

/** "2026-10-19T17:00" or "2026-10-19 17:00" -> "5:00 PM"; a bare date has no time. */
const timeOf = (stamp: string) => {
  const m = /[T ](\d{2}:\d{2})/.exec(stamp || '');
  return m ? fmtTime(m[1]) : '';
};

/* ------------------------------------------------------------- the card

   One lead, the way a salesperson works it: who and what they are worth at
   the top, how to reach them and where, then the job itself in a tinted box
   - the pest they called about, what they said, and the visit or call-back
   that is booked - and at the bottom where it came from, whose it is, and
   the three things done next: call, WhatsApp, mark contacted. */
function LeadCard({ l, ownerName, onOpen }: { l: Lead; ownerName: string; onOpen: () => void }) {
  const [contacted, setContacted] = useState(contactedAt(l.log));
  const [busy, setBusy] = useState(false);
  const due = dueState(l);
  const late = !!due && dayDelta(due.date) <= 0;
  const digits = (l.phone || '').replace(/\D/g, '');
  const wa = digits ? 'https://wa.me/' + (digits.length === 10 ? '91' + digits : digits) : '';
  const live = isOpen(l);
  // What the customer said - not the automatic "New lead captured." every lead starts with.
  const lastNote = (l.notes || '').trim().split('\n')
    .filter((t) => t.trim() && !/^New lead captured\.?$/i.test(t.trim())).pop() || '';
  const dueTime = due ? timeOf(l.followUp) : '';

  async function markContacted(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ log: LogEntry[] }>('/leads/' + l.id + '/log', { text: 'Contacted the customer' });
      setContacted(contactedAt(r.log) || new Date().toISOString());
    } catch { /* the button stays; the next tap tries again */ }
    setBusy(false);
  }
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div role="button" tabIndex={0} onClick={onOpen} data-lead-card
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="w-full text-left rounded-[20px] bg-white border border-[#e5c9cc] px-4 pt-3.5 pb-4
        shadow-[0_1px_3px_rgba(20,20,20,0.06),0_6px_16px_rgba(20,20,20,0.07)] active:bg-wash cursor-pointer">
      {/* ref and age · stage */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted tracking-[0.02em] truncate">
          {l.id} · {age(l.createdAt)}
        </span>
        <span className={'inline-flex items-center h-[22px] px-2.5 rounded-full text-[11.5px] font-bold shrink-0 '
          + (l.stage === 'new' ? 'bg-accent text-white' : (TONE[l.stage] || 'bg-wash text-muted'))}>
          {l.stage === 'new' ? 'New' : label(l.stage)}
        </span>
      </div>

      {/* who, and what it is worth */}
      <div className="flex items-center gap-3 mt-2.5">
        <span className="w-11 h-11 rounded-full bg-[#5c0f14] text-white text-[14px] font-bold
          flex items-center justify-center shrink-0">
          {initials(l.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight truncate">{l.name}</span>
          {l.type && <span className="block text-[12.5px] text-muted italic truncate">{l.type}</span>}
        </span>
        {l.value > 0 && (
          <span className="text-[17px] font-bold tabular-nums shrink-0">{money(l.value)}</span>
        )}
      </div>

      {/* how to reach them, and where */}
      <div className="mt-2.5 flex flex-col gap-1">
        {l.phone && (
          <span className="flex items-center gap-2 text-[13.5px] font-semibold">
            <Icon name="phone" size={13} className="text-accent shrink-0" /> {l.phone}
          </span>
        )}
        {l.area && (
          <span className="flex items-center gap-2 text-[13.5px] text-ink-2 min-w-0">
            <Icon name="branch" size={13} className="text-accent shrink-0" />
            <span className="truncate">{l.area}</span>
          </span>
        )}
      </div>

      {/* the job: what they called about, what they said, what is booked */}
      {(l.interest.length > 0 || lastNote || due) && (
        <div className="mt-3 rounded-2xl bg-red-wash border border-accent/15 p-3">
          {l.interest.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3.5 h-3.5 rounded-full bg-accent shrink-0" />
              <span className="text-[13px] font-bold uppercase tracking-[0.03em] truncate">
                {l.interest.join(' + ')}
              </span>
            </div>
          )}
          {lastNote && (
            <p className={'text-[13px] italic text-ink-2 leading-snug line-clamp-2 '
              + (l.interest.length ? 'mt-1.5' : '')}>
              &ldquo;{lastNote}&rdquo;
            </p>
          )}
          {due && (
            <div className={'mt-2.5 rounded-xl px-3 py-2 flex items-center justify-between gap-2 '
              + (late ? 'bg-accent text-white' : 'bg-white text-ink border border-line')}>
              <span className="text-[11.5px] font-bold uppercase tracking-[0.04em]">
                {due.kind === 'Inspect' ? 'Inspection' : 'Call back'}
              </span>
              <span className="text-[13px] font-bold whitespace-nowrap">
                {relDay(due.date)}{dueTime ? ' · ' + dueTime : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* where it came from, whose it is, and when it was last touched */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-muted truncate">
          {l.source || 'Lead'}{ownerName ? <> · <b className="text-ink font-semibold">{ownerName}</b></> : null}
        </span>
        {contacted ? (
          <span className="font-semibold text-mint-ink whitespace-nowrap">
            Contacted {relDay(contacted).toLowerCase() === 'today' ? timeOf(contacted.replace('Z', '')) || 'today' : relDay(contacted)}
          </span>
        ) : due ? (
          <span className={'font-bold whitespace-nowrap ' + (late ? 'text-accent' : 'text-ink')}>{due.text}</span>
        ) : null}
      </div>

      {/* call, WhatsApp, and the one thing to record */}
      <div className="mt-3 flex items-center gap-2.5">
        {digits && (
          <a href={'tel:' + digits} onClick={stop} aria-label={'Call ' + l.name}
            className="w-12 h-12 rounded-2xl border border-accent/30 text-accent flex items-center justify-center shrink-0 active:bg-red-wash">
            <Icon name="phone" size={17} />
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" onClick={stop} aria-label={'WhatsApp ' + l.name}
            className="w-12 h-12 rounded-2xl border border-accent/30 text-accent flex items-center justify-center shrink-0 active:bg-red-wash">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
            </svg>
          </a>
        )}
        {live ? (
          <button type="button" onClick={markContacted} disabled={busy}
            className={'flex-1 h-12 rounded-2xl text-[14.5px] font-bold active:brightness-95 disabled:opacity-60 '
              + (contacted ? 'bg-white border border-line text-ink' : 'bg-accent text-white')}>
            {busy ? 'Saving…' : contacted ? 'Contacted again' : 'Mark contacted'}
          </button>
        ) : (
          <span className="flex-1 h-12 rounded-2xl bg-wash text-muted text-[14px] font-semibold flex items-center justify-center">
            Open lead
          </span>
        )}
      </div>
    </div>
  );
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
          className={'h-[30px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 '
            + (stage === '' ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
          All {all.length ? '· ' + all.length : ''}
        </button>
        {STAGES.map((s) => {
          const items = all.filter((l) => l.stage === s.id);
          if (!items.length && stage !== s.id) return null;
          return (
            <button key={s.id} type="button" onClick={() => setStage(stage === s.id ? '' : s.id)}
              className={'h-[30px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 '
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
          <div className="flex flex-col gap-3.5 mb-4">
            {shown.map((l) => (
              <LeadCard key={l.id} l={l} onOpen={() => onOpen(l.id)}
                ownerName={(owners.find((u) => u.id === l.owner)?.name || '').split(' ')[0]} />
            ))}
          </div>
        )}
      </div>

      <Fab onClick={onNew} label="New lead" />
    </Screen>
  );
}
