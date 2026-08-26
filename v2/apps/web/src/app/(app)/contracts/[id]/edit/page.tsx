'use client';

/* ============================================================================
   Edit contract — everything from the initial form that is safe to change on
   a live contract: subject, reference, people, addresses, billing mode and
   cycle, period end, notes and terms. The services themselves (and the value
   they add up to) are edited through Service plan → Edit plan, which knows
   how to regenerate the schedule without touching completed work.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money } from 'shared';
import { api } from '@/lib/api';
import { STATES, fmtDate, type Boot, type ContractDetail } from '../../lib';

const CYCLES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

export default function EditContract() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [boot, setBoot] = useState<Boot | null>(null);
  const [c, setC] = useState<ContractDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [scope, setScope] = useState('');
  const [refNo, setRefNo] = useState('');
  const [owner, setOwner] = useState('');
  const [branch, setBranch] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [billAddr, setBillAddr] = useState('');
  const [site, setSite] = useState('');
  const [billingMode, setBillingMode] = useState('interval');
  const [billing, setBilling] = useState('Quarterly');
  const [billingAmount, setBillingAmount] = useState(0);
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  // per-service schedule edits, keyed by job id
  const [sched, setSched] = useState<Record<string, { date: string; slot: string; slotEnd: string }>>({});

  useEffect(() => {
    api.get<Boot>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<ContractDetail>('/contracts/' + id).then((d) => {
      setC(d);
      setScope(d.scope || '');
      setRefNo(d.refNo || '');
      setOwner(d.owner || '');
      setBranch(d.branch || '');
      setPlaceOfSupply(d.placeOfSupply || '');
      setBillAddr(d.billAddr || '');
      setSite(d.site || '');
      setBillingMode(d.billingMode || 'interval');
      setBilling(CYCLES.includes(d.billing) ? d.billing : 'Quarterly');
      setBillingAmount(d.billingAmount || 0);
      setEnd(d.end || '');
      setNotes(d.notes || '');
      setTerms((d.terms || []).join('\n'));
      const init: Record<string, { date: string; slot: string; slotEnd: string }> = {};
      for (const jx of d.jobs) init[jx.id] = { date: jx.date, slot: jx.slot, slotEnd: jx.slotEnd || '' };
      setSched(init);
    }).catch(() => setErr('Could not load the contract'));
  }, [id]);

  async function save() {
    if (!c) return;
    setErr('');
    if (!scope.trim()) { setErr('The subject cannot be empty — it is what the customer sees'); return; }
    if (end && end < c.start) { setErr('The end date is before the start date'); return; }
    setBusy(true);
    try {
      await api.patch('/contracts/' + c.id, {
        scope: scope.trim(), refNo: refNo.trim(), owner, branch,
        placeOfSupply, billAddr: billAddr.trim(), site: site.trim(),
        billingMode, billing: c.mode === 'onetime' ? 'On completion' : 'Monthly',
        billingAmount,
        end, notes: notes.trim(),
        terms: terms.split('\n').map((x) => x.trim()).filter(Boolean),
      });
      // any service whose date or window moved is rescheduled — the schedule
      // and dispatch follow the new window immediately
      for (const jx of c.jobs) {
        if (jx.status === 'completed') continue;
        const row = sched[jx.id];
        if (!row) continue;
        const changed = row.date !== jx.date || row.slot !== jx.slot || row.slotEnd !== (jx.slotEnd || '');
        if (changed) {
          await api.post('/jobs/' + jx.id + '/reschedule', {
            date: row.date, slot: row.slot, slotEnd: row.slotEnd, reason: 'Edited on the contract',
          });
        }
      }
      router.push('/contracts/' + c.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  if (!c || !boot) return <p className="p-4 lg:p-6 text-muted text-[13px]">{err || 'Loading…'}</p>;

  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
  const input = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
  const area = 'w-full px-3 py-2 rounded border border-line text-[13.5px] leading-relaxed outline-none focus:border-navy resize-none';

  return (
    <div className="p-4 lg:p-6 max-w-[920px]">
      <Link href={'/contracts/' + c.id} className="text-[12.5px] text-muted hover:text-navy">
        ← Back to {c.id}
      </Link>
      <div className="mt-2 mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Edit contract</h1>
          <p className="text-muted text-[13px] mt-0.5">
            {c.id} · started {fmtDate(c.start)} · value {money(c.value)} + GST
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={'/contracts/' + c.id}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash inline-flex items-center">
            Cancel
          </Link>
          <button onClick={save} disabled={busy}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      {err && <p className="mb-4 text-[13px] font-medium text-accent">{err}</p>}

      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[13.5px] font-semibold mb-4">The agreement</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block col-span-2">
            <span className={label}>Subject / description *</span>
            <textarea rows={2} value={scope} onChange={(e) => setScope(e.target.value)} className={area} />
          </label>
          <label className="block">
            <span className={label}>Reference no.</span>
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className={label}>Service period ends</span>
            <input type="date" value={end} min={c.start} onChange={(e) => setEnd(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className={label}>Sales executive</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
              {boot.users.filter((u) => ['sales', 'ops', 'admin'].includes(u.role))
                .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Branch</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={input}>
              {boot.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[13.5px] font-semibold mb-4">Addresses & tax</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block">
            <span className={label}>Billing address</span>
            <textarea rows={3} value={billAddr} onChange={(e) => setBillAddr(e.target.value)}
              placeholder="Street, area — City PIN" className={area} />
          </label>
          <label className="block">
            <span className={label}>Site address</span>
            <textarea rows={3} value={site} onChange={(e) => setSite(e.target.value)}
              placeholder="Street, area — City PIN" className={area} />
            <button type="button" onClick={() => setSite(billAddr)}
              className="mt-1 text-[11.5px] font-medium text-navy hover:text-accent">
              Same as billing address
            </button>
          </label>
          <label className="block">
            <span className={label}>Place of supply</span>
            <select value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} className={input}>
              <option value="">—</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[13.5px] font-semibold mb-1">How is this billed?</h2>
        <p className="text-muted text-[12.5px] mb-4">
          Changing the mode reshapes the plan for what has NOT been invoiced yet — issued invoices stay as they are.
        </p>
        <div className="flex flex-col gap-2 max-w-[520px]">
          {([
            ['upfront', 'Everything upfront', 'One invoice at signing — the office collects'],
            ['pervisit', 'Pay per service', 'Each completed service invoices itself — the technician collects on site'],
            ['interval', 'Fixed cycle (MRR)', 'Equal installments, raised automatically — the office collects'],
          ] as const).map(([v, t, d]) => (
            <label key={v}
              className={'flex items-start gap-2.5 rounded-md border p-3 cursor-pointer ' +
                (billingMode === v ? 'border-accent bg-red-wash' : 'border-line hover:bg-wash')}>
              <input type="radio" name="bmode" checked={billingMode === v}
                onChange={() => setBillingMode(v)} className="mt-0.5 accent-[#FF0000]" />
              <span>
                <span className="block text-[13px] font-semibold">{t}</span>
                <span className="block text-[11.5px] text-muted">{d}</span>
                {v === 'interval' && billingMode === 'interval' && (
                  <span className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[12px] text-muted">₹</span>
                    <input type="number" min={0} step={100}
                      className="h-8 w-[120px] px-2 rounded border border-line text-[12.5px] outline-none focus:border-navy"
                      value={billingAmount || Math.round(c.value / Math.max(1, c.months))}
                      onChange={(e) => setBillingAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                    <span className="text-[11.5px] text-muted">/ month + GST — first due one month after start</span>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[13.5px] font-semibold mb-4">Notes & terms</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block">
            <span className={label}>Customer notes</span>
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Visible to the technician on every service." className={area} />
          </label>
          <label className="block">
            <span className={label}>Terms & conditions (one per line)</span>
            <textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} className={area} />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-line mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-line-soft">
          <h2 className="text-[13.5px] font-semibold">Service schedule</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Move any service to a new date or time window. Completed services are locked — they already happened.
          </p>
        </div>
        <table className="ztable">
          <thead><tr>
            <th className="w-10">#</th><th>Services</th><th>Date</th><th>From</th><th>To</th><th>Status</th>
          </tr></thead>
          <tbody>
            {c.jobs.map((jx) => {
              const row = sched[jx.id] || { date: jx.date, slot: jx.slot, slotEnd: jx.slotEnd || '' };
              const done = jx.status === 'completed';
              const set = (patch: Partial<typeof row>) =>
                setSched((m) => ({ ...m, [jx.id]: { ...row, ...patch } }));
              const inp = 'h-8 px-2 rounded border border-line text-[12.5px] outline-none focus:border-navy bg-white';
              const svcNames = jx.serviceIds
                .map((sv) => boot.services.find((x) => x.id === sv)?.code || sv).join(', ');
              return (
                <tr key={jx.id}>
                  <td className="text-muted">{jx.visitNo || '—'}</td>
                  <td>
                    <span className="block text-[12.5px] font-medium">{svcNames}</span>
                    <span className="block text-[10.5px] text-muted-2 font-mono">{jx.id}</span>
                  </td>
                  {done ? (
                    <>
                      <td className="text-[12.5px]">{fmtDate(jx.date)}</td>
                      <td className="text-[12.5px]" colSpan={2}>{jx.slot}{jx.slotEnd ? ' – ' + jx.slotEnd : ''}</td>
                      <td><span className="zpill navy">Completed</span></td>
                    </>
                  ) : (
                    <>
                      <td><input type="date" className={inp + ' w-[140px]'} value={row.date}
                        onChange={(e) => set({ date: e.target.value })} /></td>
                      <td><input type="time" className={inp + ' w-[92px]'} value={row.slot}
                        onChange={(e) => set({ slot: e.target.value })} /></td>
                      <td><input type="time" className={inp + ' w-[92px]'} value={row.slotEnd}
                        onChange={(e) => set({ slotEnd: e.target.value })} /></td>
                      <td><span className="zpill outline">Scheduled</span></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[12px] text-muted">
        Adding or removing services, quantities, rates and crew: contract page →{' '}
        <b>Service plan → Edit plan</b> — that flow regenerates the schedule without touching completed work.
        Cancelling one service: the × in the schedule on the contract page.
      </p>
    </div>
  );
}
