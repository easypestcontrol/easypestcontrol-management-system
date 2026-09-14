'use client';

/* ============================================================================
   The three stage moves that need more than a drop: a call-back needs a date,
   an inspection needs a date and a technician, lost needs a reason. Ported
   from the v1 call-outcome SOP panels (leads.js:471-525).
   ========================================================================== */

import { useState } from 'react';
import { api } from '@/lib/api';
import { tomorrowISO, type Lead, type BootUser } from './lib';
import { isFieldTech } from 'shared';
import TimePicker from '@/components/time-picker';

export default function StageDialog({ lead, to, users, onClose, onDone }: {
  lead: Lead; to: string; users: BootUser[];
  onClose: () => void; onDone: () => void;
}) {
  const [date, setDate] = useState(lead.followUp || tomorrowISO());
  const [time, setTime] = useState('10:00');
  const [who, setWho] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Field staff who can carry out a site inspection — not lead owners (leads.js:347).
  const techs = users.filter((u) => isFieldTech(u.role) || u.role === 'ops');

  async function go() {
    if (to === 'lost' && !reason.trim()) {
      setErr('Add a note before marking it lost');
      return;
    }
    setBusy(true);
    try {
      await api.post('/leads/' + lead.id + '/stage',
        to === 'lost'
          ? { stage: 'lost', reason: reason.trim() }
          : { stage: to, date, time, who: to === 'inspection' ? who : undefined });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not move the lead');
      setBusy(false);
    }
  }

  return (
    /* A sheet on a phone, a dialog at a desk. At a fixed 420px it hung off
       both sides of a 390px screen. */
    <div className="fixed inset-0 z-50 bg-navy/45 flex items-end lg:items-center justify-center lg:p-6"
      onClick={onClose}>
      <div className="w-full lg:w-[420px] bg-white rounded-t-[24px] lg:rounded-md shadow-pop
        p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold">
          {to === 'followup' ? 'Call back on'
            : to === 'inspection' ? 'Inspection visit'
            : 'Why are they not interested?'}
        </h3>
        <p className="text-muted text-[12.5px] mt-0.5 mb-4">{lead.name} · {lead.id}</p>

        {to === 'lost' ? (
          <>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="e.g. Went with another vendor on price — revisit at renewal in February."
              className="w-full px-3.5 py-3 rounded-xl lg:rounded border border-line
                text-[15px] lg:text-[13px] outline-none focus:border-accent" />
            <p className="text-[11.5px] text-muted-2 mt-1.5">
              Kept on the lead so you know what to do differently next time.
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="flex-1 lg:flex-none h-12 lg:h-9 px-3.5 lg:px-3 rounded-xl lg:rounded
                  border border-line text-[15px] lg:text-[13px] outline-none focus:border-accent" />
              <TimePicker value={time} onChange={(__t) => setTime(__t)}
                className="h-12 lg:h-9 px-3.5 lg:px-3 rounded-xl lg:rounded border border-line
                  text-[15px] lg:text-[13px] outline-none focus:border-accent" />
            </div>
            {to === 'inspection' && (
              <select value={who} onChange={(e) => setWho(e.target.value)}
                className="mt-2 w-full h-12 lg:h-9 px-3 lg:px-2 rounded-xl lg:rounded border border-line
                  text-[15px] lg:text-[13px] bg-white outline-none">
                <option value="">— nobody yet —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role}</option>)}
              </select>
            )}
            <p className="text-[11.5px] text-muted-2 mt-1.5">
              {to === 'followup'
                ? 'The lead moves to Follow-up and shows up as due on that date.'
                : 'Which field technician visits the site, and when.'}
            </p>
          </>
        )}

        {err && <p className="text-accent text-[12.5px] mt-2">{err}</p>}

        <div className="flex max-lg:flex-col-reverse gap-2.5 mt-5">
          <button onClick={go} disabled={busy}
            className="h-12 lg:h-8 lg:px-3.5 rounded-xl lg:rounded bg-accent text-white
              text-[15px] lg:text-[12.5px] font-bold lg:font-semibold hover:brightness-90 disabled:opacity-60">
            {to === 'followup' ? 'Move to Follow-up' : to === 'inspection' ? 'Book inspection' : 'Move to Lost'}
          </button>
          <button onClick={onClose}
            className="h-12 lg:h-8 lg:px-3.5 rounded-xl lg:rounded border border-line
              text-[15px] lg:text-[12.5px] font-semibold lg:font-medium hover:bg-wash">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
