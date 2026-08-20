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
    <div className="fixed inset-0 z-50 bg-navy/30 flex items-center justify-center p-6"
      onClick={onClose}>
      <div className="w-[420px] bg-white rounded-md shadow-pop p-5"
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
              className="w-full px-3 py-2 rounded border border-line text-[13px] outline-none focus:border-navy" />
            <p className="text-[11.5px] text-muted-2 mt-1.5">
              Kept on the lead so you know what to do differently next time.
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
            </div>
            {to === 'inspection' && (
              <select value={who} onChange={(e) => setWho(e.target.value)}
                className="mt-2 w-full h-9 px-2 rounded border border-line text-[13px] bg-white outline-none">
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

        <div className="flex gap-2 mt-4">
          <button onClick={go} disabled={busy}
            className="h-8 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90 disabled:opacity-60">
            {to === 'followup' ? 'Move to Follow-up' : to === 'inspection' ? 'Book inspection' : 'Move to Lost'}
          </button>
          <button onClick={onClose}
            className="h-8 px-3.5 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
