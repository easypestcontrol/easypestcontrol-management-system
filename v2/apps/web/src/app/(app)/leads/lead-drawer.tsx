'use client';

/* ============================================================================
   The lead drawer — one lead, worked end to end: the call-outcome SOP
   (Interested / Not answered / Not interested), the commitment banner, the
   owner assignment, quotations and contracts raised against it, the activity
   trail, and the edit form. Ported from v1 openLead() (leads.js:338-697).
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Bootstrap } from '@/lib/api';
import { Icon } from '@/components/icons';
import { isFieldTech, money, moneyShort } from 'shared';
import {
  stageLabel, isOpen, assignableUsers, dueState, fmtDate, relDay,
  tomorrowISO, initials, LEAD_SOURCES, PROPERTY_TYPES,
  type LeadDetail, type BootUser,
} from './lib';

/**
 * What the "Interested" button does from here. The lead only ever moves one
 * step, and the step depends on where it already is (leads.js:189-200).
 */
function nextStep(l: LeadDetail) {
  if (l.stage === 'inspection') return {
    to: 'raise-quote', label: 'Quote it',
    hint: 'The site visit is done — this opens the quotation builder with this lead already in it.',
  };
  if (l.stage === 'quoted') return {
    to: 'contract', label: 'Quote accepted',
    hint: 'The customer has agreed to the quote — the lead moves to Contract to be drawn up.',
  };
  if (l.stage === 'contract') return {
    to: 'won', label: 'Contract signed',
    hint: l.contracts.length
      ? 'The contract is drawn up and signed — this wins the lead.'
      : 'Wins the lead and creates the customer record. Draw up the contract (one-time or AMC) from the accepted quotation.',
  };
  return {
    to: 'choose', label: 'Interested',
    hint: 'Quote straight away, or book a site visit first and quote after.',
  };
}

type Sop = '' | 'choose' | 'followup' | 'inspection' | 'lost';

/** One section of the drawer. Module-scope so React keeps its DOM across renders. */
function Sec({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 border-b border-line-soft">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function LeadDrawer({ id, boot, onClose, onChanged }: {
  id: string; boot: Bootstrap;
  onClose: () => void; onChanged: () => void;
}) {
  const [l, setL] = useState<LeadDetail | null>(null);
  const [sop, setSop] = useState<Sop>('');
  const [sopDate, setSopDate] = useState('');
  const [sopTime, setSopTime] = useState('10:00');
  const [sopWho, setSopWho] = useState('');
  const [reason, setReason] = useState('');
  const [owner, setOwner] = useState('');
  const [branch, setBranch] = useState('');
  const [note, setNote] = useState('');
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const users = boot.users as unknown as BootUser[];
  const owners = assignableUsers(users);
  const techs = users.filter((u) => isFieldTech(u.role) || u.role === 'ops');
  const userName = (uid: string) => users.find((u) => u.id === uid)?.name || uid || '';

  const [rev, setRev] = useState(0);
  useEffect(() => {
    let dead = false;
    api.get<LeadDetail>('/leads/' + id).then((d) => {
      if (dead) return;
      setL(d);
      setOwner(d.owner);
      setBranch(d.branch);
      setForm({
        name: d.name, phone: d.phone, email: d.email, area: d.area,
        type: d.type, source: d.source, notes: d.notes,
      });
    }).catch(() => { if (!dead) setErr('Could not load this lead'); });
    return () => { dead = true; };
  }, [id, rev]);

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setErr('');
    try {
      await fn();
      setSop('');
      setReason('');
      setRev((r) => r + 1);
      onChanged();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not save');
      return false;
    }
  }

  const router = useRouter();

  /** Open the quotation builder with this lead already picked. */
  function raiseQuote() {
    onClose();
    router.push('/quotations/new?lead=' + id);
  }

  /** WhatsApp the customer a quotation's accept link, straight from the lead. */
  function waSend(qid: string) {
    const phone = (l?.phone || '').replace(/[^0-9]/g, '');
    const dial = phone.length === 10 ? '91' + phone : phone;
    const msg = 'Hello ' + (l?.name || '') + ',\n\nYour quotation ' + qid +
      ' is ready. Review and accept it here:\n' +
      window.location.origin + '/approve/' + qid + '\n\nThank you,\nShield Pest Solutions';
    window.open('https://wa.me/' + dial + '?text=' + encodeURIComponent(msg), '_blank');
  }

  const setStage = (body: Record<string, unknown>) =>
    run(() => api.post('/leads/' + id + '/stage', body));

  if (!l) {
    return (
      <div className="fixed inset-0 z-40 bg-navy/30" onClick={onClose}>
        <div className="absolute right-0 top-0 h-full w-[560px] max-w-full bg-white border-l border-line p-6"
          onClick={(e) => e.stopPropagation()}>
          <p className="text-muted text-[13px]">Loading…</p>
        </div>
      </div>
    );
  }

  const due = dueState(l);
  const step = nextStep(l);
  const live = isOpen(l);
  const readyQuotes = l.quotes.filter((q) => q.status === 'approved' || q.status === 'sent');

  /* ------------------------------------------------------------ sop panel */
  function sopPanel() {
    if (sop === 'choose') {
      return (
        <div className="mt-3 pt-3 border-t border-line-soft">
          <p className="text-[12px] font-semibold text-ink-2 mb-2">Where does this lead go next?</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={raiseQuote}
              className="h-8 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
              Straight to quotation
            </button>
            <button onClick={() => { setSop('inspection'); setSopDate(l!.followUp || tomorrowISO()); }}
              className="h-8 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
              Book a site visit
            </button>
          </div>
        </div>
      );
    }
    if (sop === 'followup' || sop === 'inspection') {
      const isInspect = sop === 'inspection';
      return (
        <div className="mt-3 pt-3 border-t border-line-soft">
          <p className="text-[12px] font-semibold text-ink-2 mb-2">
            {isInspect ? 'Inspection visit' : 'Call back on'}
          </p>
          <div className="flex gap-2 flex-wrap">
            <input type="date" value={sopDate} onChange={(e) => setSopDate(e.target.value)}
              className="h-8 px-2.5 rounded border border-line text-[12.5px] outline-none focus:border-navy" />
            <input type="time" value={sopTime} onChange={(e) => setSopTime(e.target.value)}
              className="h-8 px-2.5 rounded border border-line text-[12.5px] outline-none focus:border-navy" />
            {isInspect && (
              <select value={sopWho} onChange={(e) => setSopWho(e.target.value)}
                className="h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none min-w-[160px]">
                <option value="">— nobody yet —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role}</option>)}
              </select>
            )}
          </div>
          <p className="text-[11.5px] text-muted-2 mt-1.5">
            {isInspect
              ? 'Which field technician visits the site, and when.'
              : 'The lead moves to Follow-up and shows up as due on that date.'}
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => setStage(isInspect
                ? { stage: 'inspection', date: sopDate, time: sopTime, who: sopWho }
                : { stage: 'followup', date: sopDate, time: sopTime })}
              className="h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
              {isInspect ? 'Book inspection' : 'Move to Follow-up'}
            </button>
            <button onClick={() => setSop('')}
              className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">Cancel</button>
          </div>
        </div>
      );
    }
    if (sop === 'lost') {
      return (
        <div className="mt-3 pt-3 border-t border-line-soft">
          <p className="text-[12px] font-semibold text-ink-2 mb-2">
            Why are they not interested? <span className="text-accent">*</span>
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="e.g. Went with another vendor on price — revisit at renewal in February."
            className="w-full px-3 py-2 rounded border border-line text-[13px] outline-none focus:border-navy" />
          <p className="text-[11.5px] text-muted-2 mt-1">
            Kept on the lead so you know what to do differently next time.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => setStage({ stage: 'lost', reason: reason.trim() })}
              className="h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
              Move to Lost
            </button>
            <button onClick={() => setSop('')}
              className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">Cancel</button>
          </div>
        </div>
      );
    }
    return null;
  }

  function onInterested() {
    if (step.to === 'raise-quote') { raiseQuote(); return; }
    if (step.to === 'choose') { setSop(sop === 'choose' ? '' : 'choose'); return; }
    void setStage({ stage: step.to });
  }

  /* -------------------------------------------------------------- pieces */
  const kv: Array<[string, string]> = [
    ['Contact', l.phone],
    ['Email', l.email || '—'],
    ['Property type', l.type],
    ['Location', l.area],
    ['Lead source', l.source],
    ['Captured', fmtDate(l.createdAt) + ' · ' + relDay(l.createdAt)],
  ];

  const input = (k: string, ph = '') => (
    <input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      placeholder={ph}
      className="w-full h-8 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy" />
  );

  return (
    <div className="fixed inset-0 z-40 bg-navy/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] max-w-full bg-white border-l border-line overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>

        {/* ------------------------------------------------------- header */}
        <div className="sticky top-0 bg-white border-b border-line px-5 py-3.5 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold truncate">{l.name}</h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              {l.id} · {l.type} · {l.area} · captured {relDay(l.createdAt).toLowerCase()}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-wash shrink-0">
            <Icon name="x" size={16} className="text-muted" />
          </button>
        </div>

        {/* -------------------------------------------------------- pills */}
        <div className="px-5 pt-4 pb-1 flex items-center gap-2 flex-wrap">
          <span className={'zpill ' + (l.stage === 'won' ? 'navy' : l.stage === 'lost' ? '' : 'red')}>
            {stageLabel(l.stage)}
          </span>
          <span className="zpill outline">{l.source}</span>
          {l.value > 0 && <span className="zpill outline">{money(l.value)}</span>}
          {l.clientId && <span className="zpill navy">Existing customer</span>}
        </div>

        {err && <p className="px-5 pt-2 text-accent text-[12.5px]">{err}</p>}

        {/* ------------------------------------------------- call outcome */}
        {live && (
          <div className="mx-5 my-4 rounded-md border border-line bg-wash p-4">
            <p className="text-[12px] font-semibold text-ink-2 mb-2.5">What happened on the call?</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={onInterested}
                className="h-8 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
                {step.label}
              </button>
              <button
                onClick={() => {
                  setSop(sop === 'followup' ? '' : 'followup');
                  setSopDate(l.followUp || tomorrowISO());
                }}
                className={'h-8 rounded border text-[12.5px] font-medium ' +
                  (sop === 'followup' ? 'border-navy bg-white' : 'border-line bg-white hover:bg-wash')}>
                Not answered
              </button>
              <button onClick={() => setSop(sop === 'lost' ? '' : 'lost')}
                className={'h-8 rounded border text-[12.5px] font-medium ' +
                  (sop === 'lost' ? 'border-navy bg-white' : 'border-line bg-white hover:bg-wash')}>
                Not interested
              </button>
            </div>
            <p className="text-[11.5px] text-muted-2 mt-2">{step.hint}</p>
            {sopPanel()}
          </div>
        )}

        {/* ---------------------------------------------------- next step */}
        <Sec title="Next step">
          {due ? (
            <div className={'rounded border px-3.5 py-2.5 text-[13px] ' +
              (due.text.startsWith('Overdue') || due.text === 'Due today'
                ? 'border-red-line bg-red-wash' : 'border-line bg-wash')}>
              <span className="font-semibold">{due.kind} {due.when}</span>
              <span className={'ml-2 ' + due.cls}>{due.text}</span>
              <span className="block text-[12px] text-muted mt-0.5">{fmtDate(due.date)}</span>
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              Nothing booked. <b>Not answered</b> sets a call-back date, <b>Interested</b> books a site visit.
            </p>
          )}
        </Sec>

        {/* -------------------------------------------------------- owner */}
        <Sec title="Owner"
          right={
            <span className="flex items-center gap-1.5 text-[12.5px]">
              <span className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center"
                style={{ background: users.find((u) => u.id === l.owner)?.color || '#141414' }}>
                {initials(userName(l.owner) || '?')}
              </span>
              {userName(l.owner) || '—'}
            </span>
          }>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] text-muted mb-1">Branch / territory</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)}
                className="w-full h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
                <option value="">— no branch —</option>
                {boot.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-muted mb-1">Assigned to</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)}
                className="w-full h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
                {owners.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select>
            </label>
          </div>
          <button onClick={() => run(() => api.patch('/leads/' + id, { owner, branch }))}
            className="mt-2.5 h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
            Save assignment
          </button>
          <p className="text-[11.5px] text-muted-2 mt-1.5">
            The salesperson who follows this lead up. They see it on their pipeline and get the reminders.
          </p>
        </Sec>

        {/* --------------------------------------------------- quotations */}
        <Sec title="Quotations"
          right={
            <span className="flex items-center gap-2">
              <span className="zpill">{l.quotes.length || 'None yet'}</span>
              {live && (
                <button onClick={raiseQuote}
                  className="h-7 px-2.5 rounded bg-accent text-white text-[12px] font-semibold hover:brightness-90">
                  + Raise quotation
                </button>
              )}
            </span>
          }>
          {l.quotes.length === 0 ? (
            <p className="text-[13px] text-muted">
              No quotation raised yet — <b>Raise quotation</b> opens the builder with this
              lead already in it, and the document lands back here to send on WhatsApp.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {l.quotes.map((q) => (
                <div key={q.id} className="rounded border border-line px-3 py-2.5 hover:border-navy/40 cursor-pointer"
                  onClick={() => { onClose(); router.push('/quotations/' + q.id); }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[12.5px] font-semibold">{q.id}</span>
                      <span className={'zpill ' + (q.status === 'approved' ? 'navy' : q.status === 'rejected' ? 'red' : 'outline')}>
                        {q.status}
                      </span>
                      {q.mode === 'amc' && <span className="zpill outline">AMC · {q.freq}</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-semibold">{money(q.total)}</span>
                      <button onClick={(e) => { e.stopPropagation(); waSend(q.id); }}
                        title="Send the accept link on WhatsApp"
                        className="h-7 px-2.5 rounded border border-line text-[11.5px] font-semibold text-ink-2 hover:bg-wash">
                        WhatsApp
                      </button>
                    </span>
                  </div>
                  <p className="text-[12px] text-muted truncate mt-1">
                    {q.title || '—'} · {fmtDate(q.date)}
                  </p>
                </div>
              ))}
              <p className="text-[12px] text-muted pt-1 border-t border-line-soft">
                {l.quotes.length} quotation{l.quotes.length === 1 ? '' : 's'}
                {l.quotes.filter((q) => q.status === 'draft').length
                  ? ' · ' + l.quotes.filter((q) => q.status === 'draft').length + ' not sent yet'
                  : ' · all sent'}
              </p>
            </div>
          )}
        </Sec>

        {/* ---------------------------------------------------- contracts */}
        <Sec title="Contract"
          right={<span className="zpill">{l.contracts.length || 'None yet'}</span>}>
          {l.contracts.length === 0 ? (
            <p className="text-[13px] text-muted">
              {l.quotes.length === 0
                ? 'Raise a quotation first — the contract (one-time service or AMC) is generated from it, so the services and their intervals carry straight through.'
                : readyQuotes.length === 0
                  ? 'Send the quotation. Once both sides accept it — us and the customer — the contract is drawn up from it.'
                  : 'No contract yet. Open the accepted quotation and use Move to contract — each quoted service keeps the interval it was priced for.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {l.contracts.map((c) => (
                <div key={c.id} className="rounded border border-line px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold">{c.id}</span>
                      <span className="zpill outline">{c.mode === 'amc' ? 'AMC' : 'One-time'}</span>
                    </span>
                    <span className="text-[13px] font-semibold">{moneyShort(c.value)}</span>
                  </div>
                  <p className="text-[12px] text-muted mt-1">
                    {fmtDate(c.start)} → {fmtDate(c.end)}
                    {c.totalVisits > 0 && <> · {c.totalVisits} visits</>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Sec>

        {/* ----------------------------------------------------- customer */}
        <Sec title="Customer"
          right={
            <button onClick={() => setEdit(!edit)}
              className="text-[12px] font-medium text-ink-2 hover:text-navy underline underline-offset-2">
              {edit ? 'Cancel' : 'Edit'}
            </button>
          }>
          {edit ? (
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block col-span-2">
                <span className="block text-[11px] text-muted mb-1">Name / Business</span>
                {input('name')}
              </label>
              <label className="block">
                <span className="block text-[11px] text-muted mb-1">Phone</span>
                {input('phone')}
              </label>
              <label className="block">
                <span className="block text-[11px] text-muted mb-1">Email</span>
                {input('email')}
              </label>
              <label className="block">
                <span className="block text-[11px] text-muted mb-1">Area / Locality</span>
                {input('area')}
              </label>
              <label className="block">
                <span className="block text-[11px] text-muted mb-1">Property type</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
                  {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] text-muted mb-1">Lead source</span>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none">
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block col-span-2">
                <span className="block text-[11px] text-muted mb-1">Notes</span>
                <textarea value={form.notes || ''} rows={3}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-2.5 py-2 rounded border border-line text-[13px] outline-none focus:border-navy" />
              </label>
              <div className="col-span-2">
                <button
                  onClick={async () => {
                    if (await run(() => api.patch('/leads/' + id, form))) setEdit(false);
                  }}
                  className="h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
                  Save changes
                </button>
              </div>
            </div>
          ) : (
            <dl>
              {kv.map(([k, v]) => (
                <div key={k} className="flex py-1.5 border-b border-line-soft last:border-0 text-[13px]">
                  <dt className="w-[130px] shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
              <div className="flex py-1.5 text-[13px]">
                <dt className="w-[130px] shrink-0 text-muted">Notes</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words">{l.notes || '—'}</dd>
              </div>
            </dl>
          )}
        </Sec>

        {/* ----------------------------------------------------- activity */}
        <Sec title="Activity" right={<span className="zpill">{l.log.length}</span>}>
          <div className="flex gap-2 mb-3">
            <input value={note} onChange={(e) => setNote(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && note.trim()) {
                  if (await run(() => api.post('/leads/' + id + '/log', { text: note.trim() }))) setNote('');
                }
              }}
              placeholder="Add a note to the trail…"
              className="flex-1 h-8 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy" />
            <button
              onClick={async () => {
                if (!note.trim()) return;
                if (await run(() => api.post('/leads/' + id + '/log', { text: note.trim() }))) setNote('');
              }}
              className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash shrink-0">
              Add
            </button>
          </div>
          {l.log.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing yet.</p>
          ) : (
            <div className="flex flex-col">
              {l.log.slice(0, 8).map((e, i) => (
                <div key={i} className="relative pl-5 pb-3 last:pb-0">
                  <span className="absolute left-0 top-[5px] w-2 h-2 rounded-full bg-navy" />
                  {i < Math.min(l.log.length, 8) - 1 && (
                    <span className="absolute left-[3.5px] top-[15px] bottom-0 w-px bg-line-soft" />
                  )}
                  <p className="text-[13px] font-medium leading-snug">{e.text}</p>
                  <p className="text-[11.5px] text-muted mt-0.5">
                    {String(e.at).replace('T', ' · ')}{e.by ? ' · ' + userName(e.by) : ''}
                  </p>
                </div>
              ))}
              {l.log.length > 8 && (
                <p className="text-[11.5px] text-muted-2">+ {l.log.length - 8} earlier entries</p>
              )}
            </div>
          )}
        </Sec>

        {/* ------------------------------------------------------ history */}
        {l.history.length > 0 && (
          <Sec title="Earlier leads from this customer"
            right={<span className="zpill">{l.history.length}</span>}>
            <div className="flex flex-col gap-2">
              {l.history.slice(0, 4).map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">{h.name}</span>
                    <span className="block text-[11.5px] text-muted">{h.id} · {relDay(h.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {h.value > 0 && <span className="text-[12px] text-muted">{moneyShort(h.value)}</span>}
                    <span className={'zpill ' + (h.stage === 'won' ? 'navy' : 'outline')}>
                      {stageLabel(h.stage)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Sec>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
