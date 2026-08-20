'use client';

/* Site audits — the periodic hygiene walk-through, scored out of 100. */

import { useEffect, useState } from 'react';
import { api, type Client } from '@/lib/api';
import { Icon } from '@/components/icons';
import { useBranchFilter } from '@/components/branch-filter';

interface Finding { area: string; note: string; severity: string; closed?: boolean }
interface Audit {
  id: string; clientId: string; date: string; auditor: string;
  score: number; status: string; findings: Finding[];
}

export default function Audits() {
  const [rows, setRows] = useState<Audit[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState<Audit | null>(null);
  const [creating, setCreating] = useState(false);

  const bf = useBranchFilter();
  const load = () => api.get<Audit[]>('/audits' + (bf.branch ? '?branch=' + bf.branch : ''))
    .then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bf.branch]);

  const name = (id: string) => clients.find((c) => c.id === id)?.name || id;
  const scorePill = (s: number) =>
    s >= 85 ? 'zpill navy' : s >= 60 ? 'zpill outline' : 'zpill red';

  async function toggleFinding(a: Audit, i: number) {
    const findings = a.findings.map((f, x) => (x === i ? { ...f, closed: !f.closed } : f));
    const updated = await api.patch<Audit>('/audits/' + a.id, { findings });
    setOpen(updated);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Audits</h1>
          {rows && <span className="text-muted-2 text-[12.5px]">{rows.length} audits ·{' '}
            {rows.filter((r) => r.status === 'open').length} open</span>}
        </div>
        <span className="flex items-center gap-3">
          {bf.el}
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New audit
          </button>
        </span>
      </div>

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No audits yet</p>
          <p className="text-muted text-[13px] mt-1">
            Record a site walk-through — score, findings, and who did it.
          </p>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr><th>Audit</th><th>Customer</th><th>Date</th><th>Auditor</th>
              <th>Score</th><th>Findings</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="zrow" onClick={() => setOpen(a)}>
                <td className="font-medium text-navy">{a.id}</td>
                <td>{name(a.clientId)}</td>
                <td className="text-muted">{a.date}</td>
                <td>{a.auditor || '—'}</td>
                <td><span className={scorePill(a.score)}>{a.score} / 100</span></td>
                <td className="text-muted">
                  {a.findings.length
                    ? `${a.findings.filter((f) => !f.closed).length} open of ${a.findings.length}`
                    : '—'}
                </td>
                <td><span className={a.status === 'open' ? 'zpill red' : 'zpill'}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ------------------------------------------------ detail drawer */}
      {open && (
        <div className="fixed inset-0 bg-navy/30 z-40 flex justify-end" onClick={() => setOpen(null)}>
          <div className="w-[440px] bg-white h-full overflow-y-auto shadow-pop"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-[54px] border-b border-line">
              <div className="flex items-baseline gap-2.5">
                <span className="font-semibold">{open.id}</span>
                <span className={scorePill(open.score)}>{open.score} / 100</span>
              </div>
              <button onClick={() => setOpen(null)} className="text-muted hover:text-ink">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-[14px] font-semibold">{name(open.clientId)}</p>
              <p className="text-muted text-[12.5px] mt-0.5">{open.date} · {open.auditor || 'unassigned auditor'}</p>

              <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Findings — tick to close
              </p>
              {open.findings.length === 0 ? (
                <p className="text-muted text-[13px]">A clean site — nothing recorded.</p>
              ) : open.findings.map((f, i) => (
                <button key={i} onClick={() => toggleFinding(open, i)}
                  className="w-full flex items-start gap-3 rounded border border-line-soft p-3 mb-2 text-left hover:bg-wash">
                  <span className={'mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ' +
                    (f.closed ? 'bg-navy border-navy text-white' : 'border-line')}>
                    {f.closed && <Icon name="check" size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className={'block text-[13px] ' + (f.closed ? 'line-through text-muted-2' : 'text-ink-2')}>
                      <b>{f.area}:</b> {f.note}
                    </span>
                    <span className={'zpill mt-1 ' + (f.severity === 'high' ? 'red' : 'outline')}>{f.severity}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {creating && (
        <NewAudit clients={clients}
          onDone={() => { setCreating(false); load(); }}
          onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function NewAudit({ clients, onDone, onClose }: {
  clients: Client[]; onDone: () => void; onClose: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [auditor, setAuditor] = useState('');
  const [score, setScore] = useState(80);
  const [text, setText] = useState('');

  async function save() {
    if (!clientId) return;
    // One finding per line: "Area: the note" — severity high when it shouts.
    const findings = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = /^([^:]+):\s*(.+)$/.exec(l);
      return {
        area: m ? m[1].trim() : 'General',
        note: m ? m[2].trim() : l,
        severity: /urgent|critical|rodent|infest/i.test(l) ? 'high' : 'normal',
      };
    });
    await api.post('/audits', { clientId, date, auditor, score, findings });
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-navy/30 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="w-[460px] bg-white rounded-md shadow-pop p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[15px] font-semibold mb-4">New audit</h2>

        <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Customer</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="w-full h-9 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy mb-3 bg-white">
          <option value="">— pick —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <label className="block col-span-1">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy" />
          </label>
          <label className="block col-span-1">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Auditor</span>
            <input value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="Name"
              className="w-full h-9 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy" />
          </label>
          <label className="block col-span-1">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Score / 100</span>
            <input type="number" min={0} max={100} value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full h-9 px-2.5 rounded border border-line text-[13px] outline-none focus:border-navy" />
          </label>
        </div>

        <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
          Findings — one per line, “Area: what was seen”
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder={'Kitchen: gel bait stations depleted\nStore room: rodent droppings near rear door'}
          className="w-full px-2.5 py-2 rounded border border-line text-[13px] outline-none focus:border-navy resize-none" />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={save} disabled={!clientId}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
            Save audit
          </button>
        </div>
      </div>
    </div>
  );
}
