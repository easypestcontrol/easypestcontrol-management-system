'use client';

/* ============================================================================
   New contract — the single work-order page for both kinds of sale.

   Customer and period at the top, the services being sold in the middle with
   their quantities, then terms, signatures and the appointment schedule those
   quantities produce. Saving it writes the contract and every dated visit.

   qty semantics — the money bug that must not regress: on an AMC line the
   quantity is the VISIT COUNT; on a one-time line it is the UNITS SOLD
   (bedrooms, tanks, square feet). Amount = qty × rate in both modes.
   ========================================================================== */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { billingPlan,
  addMonths, cadenceLabel, dayOfMonth, daysBetween, docTotals, money,
  lineVisitDates, peakCrew, planVisits, toMin,
  type ContractInput, type PlanLineInput,
} from 'shared';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import {
  addMinsHHMM, fmtDate, fmtShort, fmtTime, slotLabel, todayISO,
  SLOTS, STATES,
  type Boot, type ClientLite, type Draft, type DraftLine,
} from '../lib';

const COPY = {
  amc: {
    title: 'Create new AMC contract',
    sub: 'The services being sold, what they cost, and every service appointment they produce',
    cta: 'Create contract',
  },
  onetime: {
    title: 'Create one-time service',
    sub: 'The services being sold, what they cost, and the single service they produce',
    cta: 'Create service',
  },
};

/* ------------------------------------------------------- signature capture */

function SigPad({ onInk }: { onInk: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  return (
    <canvas ref={ref} width={420} height={110}
      className="w-full h-[110px] rounded border border-line bg-wash touch-none"
      onPointerDown={(e) => {
        drawing.current = true;
        ref.current!.setPointerCapture(e.pointerId);
        const ctx = ref.current!.getContext('2d')!;
        ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const ctx = ref.current!.getContext('2d')!;
        const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
      }}
      onPointerUp={() => {
        drawing.current = false;
        onInk(ref.current!.toDataURL('image/png'));
      }} />
  );
}

/* ------------------------------------------------------------- form proper */

function NewContractForm() {
  const router = useRouter();
  const params = useSearchParams();
  const quoteId = params.get('quote') || '';
  const preClient = params.get('client') || '';

  const [mode, setMode] = useState<'amc' | 'onetime'>(
    params.get('mode') === 'onetime' ? 'onetime' : 'amc');
  const [boot, setBoot] = useState<Boot | null>(null);
  const [clients, setClients] = useState<ClientLite[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  const [sigKey, setSigKey] = useState(0); // remounts the pads on clear
  const isOne = mode === 'onetime';
  // Which customer's addresses are currently in the two boxes. Editing keeps
  // them; picking a different customer refills both from that record.
  const addrForRef = useRef('');

  /* ----------------------------------------------------------- bootstrap */
  useEffect(() => {
    if (!draft || !draft.clientId || addrForRef.current === draft.clientId) return;
    const first = addrForRef.current === '';
    addrForRef.current = draft.clientId;
    // A draft seeded from a quotation arrives with its own addresses — keep them.
    if (first && (draft.billAddr || draft.siteAddr)) return;
    const c = (clients || []).find((x) => x.id === draft.clientId);
    if (!c) return;
    const lines = [c.addr, [c.city, c.pin].filter(Boolean).join(' ')].filter(Boolean).join('\n');
    setDraft((d) => (d ? { ...d, billAddr: lines, siteAddr: lines } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.clientId, clients]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [b, cl, meRow] = await Promise.all([
          api.get<Boot>('/org/bootstrap'),
          api.get<ClientLite[]>('/clients'),
          api.get<SessionUser>('/auth/me'),
        ]);
        if (dead) return;
        setBoot(b); setClients(cl);

        if (quoteId) {
          const { draft: d } = await api.get<{ draft: Partial<Draft> & { mode?: string } }>(
            '/contracts/from-quote/' + quoteId);
          if (dead) return;
          const m = d.mode === 'onetime' ? 'onetime' : 'amc';
          setMode(m);
          setDraft({
            billingMode: 'interval',
            billing: 'Monthly',
            billingAmount: 0,
            mode: m,
            no: d.no || '', clientId: d.clientId || cl[0]?.id || '',
            branch: d.branch || b.branches[0]?.id || '',
            owner: d.owner || meRow.id, refNo: d.refNo || '',
            placeOfSupply: d.placeOfSupply || '', discount: d.discount || 0,
            billAddr: d.billAddr || '', siteAddr: d.siteAddr || '',
            start: d.start || todayISO(), end: d.end || todayISO(),
            slot: d.slot || '10:00', slotEnd: d.slotEnd || '12:00',
            subject: d.subject || '', notes: d.notes || '',
            terms: d.terms?.length ? d.terms : (Array.isArray(b.company.docTerms?.contract) ? b.company.docTerms!.contract! : b.company.terms),
            signCustomer: d.signCustomer || '', signExec: d.signExec || '',
            quoteId, leadId: d.leadId || '',
            lines: (d.lines || []) as DraftLine[],
          });
        } else {
          const m = params.get('mode') === 'onetime' ? 'onetime' : 'amc';
          const { no } = await api.get<{ no: string }>('/contracts/next-number?mode=' + m);
          if (dead) return;
          const meBoot = b.users.find((u) => u.id === meRow.id);
          const start = todayISO();
          setDraft({
            billingMode: 'interval',
            billing: 'Monthly',
            billingAmount: 0,
            mode: m,
            no,
            clientId: preClient || '',
            branch: meBoot?.branches?.[0] || b.branches[0]?.id || '',
            owner: ['sales', 'ops', 'admin'].indexOf(meRow.role) >= 0
              ? meRow.id
              : b.users.find((u) => ['sales', 'ops', 'admin'].indexOf(u.role) >= 0)?.id || '',
            refNo: '', placeOfSupply: '', discount: 0,
            billAddr: '', siteAddr: '',
            start, end: m === 'onetime' ? start : addMonths(start, 12),
            slot: '10:00', slotEnd: '12:00',
            subject: '', notes: '',
            terms: Array.isArray(b.company.docTerms?.contract) ? b.company.docTerms!.contract! : (b.company.terms || []),
            signCustomer: '', signExec: '',
            quoteId: '', leadId: '',
            lines: [],
          });
        }
      } catch (e) {
        if (!dead) setFatal(e instanceof Error ? e.message : 'Could not load the form');
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  /* ------------------------------------------------------------- derived */
  const svcOf = useMemo(() => {
    const m: Record<string, Boot['services'][number]> = {};
    for (const s of boot?.services || []) m[s.id] = s;
    return m;
  }, [boot]);

  const monthsOf = draft ? Math.max(1, Math.round(daysBetween(draft.start, draft.end) / 30.44)) : 12;
  const lineMonths = (l: DraftLine) => Math.max(1, l.months || monthsOf);

  function spreadOf(l: DraftLine) {
    const from = l.startAt || draft!.start;
    const months = lineMonths(l);
    const term = Math.max(1, daysBetween(from, addMonths(from, months)));
    const visits = Math.max(1, l.qty || 1);
    return { months, visits, gap: term / visits };
  }

  /** The contract exactly as the engine will see it, so the preview cannot lie. */
  function asContract(): ContractInput {
    const d = draft!;
    return {
      id: d.no, start: d.start, end: d.end, months: monthsOf, slot: '10:00',
      mergeSameDay: true, workdaysOnly: true, blackout: [],
      plan: d.lines.filter((l) => l.svId).map((l): PlanLineInput => ({
        svId: l.svId,
        visits: Math.max(1, l.qty || 1),
        months: lineMonths(l),
        mins: svcOf[l.svId]?.mins || 60,
        dayRule: 'dom:' + dayOfMonth(l.startAt || d.start),
        startAt: l.startAt || d.start,
        slot: l.slot || '10:00',
        crew: l.crew || 1,
        techIds: [],
        dates: l.dates || [],
      })),
    };
  }

  const totals = useMemo(() => {
    if (!draft || !boot) return null;
    return docTotals(
      draft.lines.map((l) => ({ qty: l.qty || 0, rate: l.rate || 0 })),
      draft.discount || 0,
      draft.placeOfSupply || boot.company.state,
      boot.company.state || 'Tamil Nadu',
      boot.company.gstRate || 18,
    );
  }, [draft, boot]);

  const visits = useMemo(
    () => (draft && draft.lines.length ? planVisits(asContract()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  );
  const shared = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of visits) if (v.lines > 1) out[v.date] = v.lines;
    return out;
  }, [visits]);

  /** Visit dates for line i in visit order — chip n is always visit n. */
  function lineDates(i: number): string[] {
    if (!draft || !draft.lines[i]?.svId) return [];
    const c = asContract(); // blanks are filtered out, so re-map the index
    const fi = draft.lines.slice(0, i).filter((x) => x.svId).length;
    if (!c.plan[fi]) return [];
    return lineVisitDates(c.plan[fi], c).map((x) => x.date);
  }

  /** Pin one visit of one line to a hand-picked date ('' = back to automatic). */
  function setLineDate(i: number, v: number, date: string) {
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.slice();
      const ds = (lines[i].dates || []).slice();
      ds[v] = date;
      while (ds.length && !ds[ds.length - 1]) ds.pop();
      lines[i] = { ...lines[i], dates: ds };
      return { ...d, lines };
    });
  }

  /* --------------------------------------------------------------- edits */
  function set(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function setLine(i: number, patch: Partial<DraftLine>) {
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.slice();
      lines[i] = { ...lines[i], ...patch };
      return { ...d, lines };
    });
  }

  function newLine(svId: string): DraftLine {
    const s = svcOf[svId];
    return {
      svId,
      desc: s?.desc || '',
      rate: s?.price || 0,
      qty: svId ? (isOne ? 1 : Math.max(1, Math.round(monthsOf))) : 1, // blank rows stay quiet
      months: 0,
      startAt: draft!.start,
      slot: '10:00',
      slotEnd: '12:00',
      crew: 1,
    };
  }

  function addLine() {
    if (!boot || !draft) return;
    // A new row starts BLANK — the person picks the service themselves.
    set({ lines: [...draft.lines, newLine('')] });
  }

  function moveStart(start: string) {
    if (!draft || !start) return;
    if (isOne) {
      const end = draft.end && draft.end >= start ? draft.end : start;
      set({ start, end, lines: draft.lines.map((l) => ({ ...l, startAt: start })) });
    } else {
      // Keep the period the same length when the start moves.
      const end = addMonths(start, Math.max(1, Math.round(daysBetween(start, draft.end) / 30.44)));
      set({ start, end, lines: draft.lines.map((l) => ({ ...l, startAt: start })) });
    }
  }

  /* -------------------------------------------------------------- create */
  async function create() {
    if (!draft) return;
    setErr('');
    if (!draft.clientId) { setErr('Pick a customer first'); return; }
    if (!draft.clientId) { setErr('Pick a customer'); return; }
    if (!draft.subject.trim()) {
      setErr('A subject is required — it is what the customer sees on the contract'); return;
    }
    if (!draft.lines.length) { setErr('Add at least one service'); return; }
    if (isOne) {
      if (!draft.start) { setErr('Pick a service date'); return; }
      if (!draft.slot) { setErr('Pick a service time — it is what puts it on the calendar'); return; }
      if (draft.slotEnd && toMin(draft.slotEnd) <= toMin(draft.slot)) {
        setErr('The time window ends before it starts — set an end time later than ' + fmtTime(draft.slot));
        return;
      }
      if (draft.end && daysBetween(draft.start, draft.end) < 0) {
        setErr('The end date is before the start date'); return;
      }
    } else if (daysBetween(draft.start, draft.end) < 28) {
      setErr('The service period is too short — give it at least a month'); return;
    }

    setBusy(true);
    try {
      const made = await api.post<{ id: string; totalVisits: number }>('/contracts', {
        ...draft,
        mode,
        lines: draft.lines.map((l) => (isOne
          ? { ...l, startAt: draft.start, slot: draft.slot } // one visit, one window
          : l)),
      });
      router.push('/contracts/' + made.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the contract');
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------- render */
  if (fatal) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Cannot open this form</p>
        <p className="text-muted text-[13px] mt-1">{fatal}</p>
        <Link href="/contracts" className="inline-block mt-4 text-[13px] font-semibold text-accent">
          Back to contracts
        </Link>
      </div>
    );
  }
  if (!draft || !boot || !clients || !totals) {
    return <p className="p-4 lg:p-6 text-muted text-[13px]">Loading…</p>;
  }

  const client = clients.find((c) => c.id === draft.clientId) || null;
  const staff = boot.users.filter((u) => ['sales', 'ops', 'admin'].indexOf(u.role) >= 0);
  const ownerSign = boot.users.find((u) => u.id === draft.owner)?.sign || '';
  const ownerName = boot.users.find((u) => u.id === draft.owner)?.name || '—';
  const appointments = draft.lines.reduce((a, l) => a + (l.svId ? l.qty || 0 : 0), 0);
  const peak = peakCrew(asContract().plan, visits);
  const mergedCount = visits.filter((v) => v.lines > 1).length;
  const winMins = (() => { const d = toMin(draft.slotEnd) - toMin(draft.slot); return d > 0 ? d : 120; })();

  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
  const input = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
  const card = 'rounded-md border border-line';

  return (
    <div className="p-4 lg:p-6 max-w-[1180px]">
      <Link href="/contracts" className="text-[12.5px] text-muted hover:text-navy">← All contracts</Link>
      <div className="mt-2 mb-5">
        <h1 className="text-[20px] font-semibold">{COPY[mode].title}</h1>
        <p className="text-muted text-[13px] mt-0.5">{COPY[mode].sub}</p>
      </div>

      {/* ------------------------------------------------------ header card */}
      <section className={card + ' p-5'}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className={label}>Contract number</span>
            <input className={input + ' font-mono bg-wash text-muted cursor-default'}
              value={draft.no || '…'} readOnly tabIndex={-1} />
            <span className="block text-[11px] text-muted-2 mt-1">Assigned by the system.</span>
          </label>
          <label className="block">
            <span className={label}>Reference no.</span>
            <input className={input} value={draft.refNo} placeholder="Customer PO or quotation ref"
              onChange={(e) => set({ refNo: e.target.value })} />
          </label>
          <label className="block">
            <span className={label}>Customer *</span>
            <select className={input} value={draft.clientId}
              onChange={(e) => set({ clientId: e.target.value })}>
              <option value="">Pick a customer…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Branch *</span>
            <select className={input} value={draft.branch}
              onChange={(e) => set({ branch: e.target.value })}>
              {boot.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <label className="block">
            <span className={label}>Sales executive *</span>
            <select className={input} value={draft.owner}
              onChange={(e) => set({ owner: e.target.value })}>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Place of supply</span>
            <select className={input} value={draft.placeOfSupply || boot.company.state}
              onChange={(e) => set({ placeOfSupply: e.target.value })}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="block text-[11px] text-muted-2 mt-1">
              Decides whether GST splits into CGST + SGST or is charged as IGST.
            </span>
          </label>
          <label className="block">
            <span className={label}>Discount (₹)</span>
            <input className={input} type="number" min={0} step={500} value={draft.discount}
              onChange={(e) => set({ discount: parseFloat(e.target.value) || 0 })} />
            <span className="block text-[11px] text-muted-2 mt-1">Taken off before tax.</span>
          </label>
          <label className="block">
            <span className={label}>Subject / description *</span>
            <textarea className={input + ' min-h-[84px] py-2'} maxLength={200}
              placeholder="Annual Pest Control Service — factory and office"
              value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
            <span className="block text-[11px] text-muted-2 text-right">{draft.subject.length}/200</span>
          </label>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div>
            <span className={label}>Billing address</span>
            <textarea rows={4} className={input + ' h-auto py-2 leading-relaxed resize-none'}
              value={draft.billAddr}
              onChange={(e) => set({ billAddr: e.target.value })}
              placeholder="Street, area — City PIN" />
            <span className="block text-[11px] text-muted-2 mt-1">Editable — printed on the agreement.</span>
          </div>
          <div>
            <span className={label}>Site address</span>
            <textarea rows={4} className={input + ' h-auto py-2 leading-relaxed resize-none'}
              value={draft.siteAddr}
              onChange={(e) => set({ siteAddr: e.target.value })}
              placeholder="Street, area — City PIN" />
            <button type="button" onClick={() => set({ siteAddr: draft.billAddr })}
              className="mt-1 text-[11.5px] font-medium text-navy hover:text-accent">
              Same as billing address
            </button>
          </div>
          {isOne ? (
            <>
              <div>
                <span className={label}>Service period *</span>
                <div className="flex gap-2">
                  <input className={input} type="date" value={draft.start} title="Start date — the service goes on this day"
                    onChange={(e) => moveStart(e.target.value)} />
                  <input className={input} type="date" value={draft.end} min={draft.start} title="End date — how long the agreement covers"
                    onChange={(e) => set({ end: e.target.value })} />
                </div>
                <span className="block text-[11px] text-muted-2 mt-1">
                  The service happens on the start date; from a quotation this window is its date → valid till.
                </span>
              </div>
              <div>
                <span className={label}>Time window *</span>
                <div className="flex items-center gap-2">
                  <input className={input} type="time" value={draft.slot}
                    onChange={(e) => set({ slot: e.target.value })} />
                  <span className="text-muted text-[12px]">to</span>
                  <input className={input} type="time" value={draft.slotEnd}
                    onChange={(e) => set({ slotEnd: e.target.value })} />
                </div>
                <span className="block text-[11px] text-muted-2 mt-1">
                  {fmtTime(draft.slot)} – {fmtTime(draft.slotEnd || addMinsHHMM(draft.slot, 120))} ·{' '}
                  {winMins >= 60 ? Math.round(winMins / 6) / 10 + ' hr' : winMins + ' min'} —
                  the technician is booked for exactly this long.
                </span>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <span className={label}>Service period *</span>
              <div className="flex gap-2">
                <input className={input} type="date" value={draft.start} title="Start date"
                  onChange={(e) => moveStart(e.target.value)} />
                <input className={input} type="date" value={draft.end} title="End date"
                  onChange={(e) => set({ end: e.target.value })} />
              </div>
              <span className="block text-[11px] text-muted-2 mt-1">
                {monthsOf} months — every quantity below is spread across it.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------- services + money */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-5 items-start">
        <section className={card}>
          <h2 className="text-[13px] font-semibold px-4 py-3 border-b border-line-soft">
            Pest control services
          </h2>
          <table className="ztable">
            <thead>
              <tr>
                <th className="w-8">#</th><th>Service</th><th>Description</th>
                <th className="text-right">Unit price</th><th className="text-center">Quantity</th>
                <th className="text-right">Amount</th><th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-6">
                  No services yet — add the first one below.
                </td></tr>
              ) : draft.lines.map((l, i) => {
                const sp = spreadOf(l);
                return (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    <td className="min-w-[170px]">
                      <select className={input + ' h-8 text-[12.5px]'} value={l.svId}
                        onChange={(e) => {
                          const s = svcOf[e.target.value];
                          setLine(i, {
                            svId: e.target.value,
                            rate: s?.price || 0,
                            desc: s?.desc || '',
                            qty: isOne ? l.qty : Math.max(1, Math.round(monthsOf)),
                          });
                        }}>
                        <option value="">Pick a service…</option>
                        {boot.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {!isOne && (
                        <span className="block text-[11px] font-semibold text-navy mt-1">
                          {cadenceLabel(sp.gap, sp.visits).toLowerCase()}
                          {sp.visits > 1 ? ' · every ' + Math.round(sp.gap) + ' days' : ''}
                        </span>
                      )}
                    </td>
                    <td className="min-w-[180px]">
                      <input className={input + ' h-8 text-[12.5px]'} value={l.desc}
                        placeholder="Shown on the contract"
                        onChange={(e) => setLine(i, { desc: e.target.value })} />
                    </td>
                    <td className="text-right">
                      <input className={input + ' h-8 w-[90px] text-right text-[12.5px]'}
                        type="number" min={0} step={50} value={l.rate}
                        onChange={(e) => setLine(i, { rate: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <span className="inline-flex items-center border border-line rounded overflow-hidden">
                        <button type="button" className="w-7 h-8 hover:bg-wash text-[15px]"
                          onClick={() => setLine(i, { qty: Math.max(1, (l.qty || 1) - 1) })}>−</button>
                        <input className="w-[46px] h-8 text-center text-[12.5px] outline-none"
                          type="number" min={1} max={120} value={l.qty}
                          onChange={(e) => setLine(i, {
                            qty: Math.min(120, Math.max(1, parseInt(e.target.value, 10) || 1)),
                          })} />
                        <button type="button" className="w-7 h-8 hover:bg-wash text-[15px]"
                          onClick={() => setLine(i, { qty: Math.min(120, (l.qty || 1) + 1) })}>+</button>
                      </span>
                    </td>
                    <td className="text-right font-semibold whitespace-nowrap">
                      {money((l.qty || 0) * (l.rate || 0))}
                    </td>
                    <td>
                      <button type="button" title="Remove" className="text-muted-2 hover:text-accent"
                        onClick={() => set({ lines: draft.lines.filter((_, x) => x !== i) })}>
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3">
            <button type="button" onClick={addLine}
              className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
              <Icon name="plus" size={13} /> Add another service
            </button>
          </div>
        </section>

        <section className={card + ' p-4'}>
          <div className="flex justify-between text-[13px] mb-2">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold">{money(totals.sub)}</span>
          </div>
          {totals.disc > 0 && (
            <div className="flex justify-between text-[13px] mb-2">
              <span className="text-muted">Discount</span>
              <span className="font-semibold text-accent">− {money(totals.disc)}</span>
            </div>
          )}
          {totals.tax.rows.map(([lbl, amt]) => (
            <div key={lbl} className="flex justify-between text-[13px] mb-2">
              <span className="text-muted">{lbl}</span>
              <span className="font-semibold">{money(amt)}</span>
            </div>
          ))}
          {totals.tax.interState && (
            <p className="text-[11px] text-muted-2 mb-2">
              Supplied to {totals.tax.place} — IGST applies.
            </p>
          )}
          <div className="flex justify-between items-baseline pt-3 border-t border-line">
            <span className="font-semibold text-[14px]">Total amount</span>
            <span className="font-semibold text-[19px] tracking-tight">{money(totals.total)}</span>
          </div>
          {isOne ? (
            <p className="text-[11.5px] text-muted-2 mt-2.5">
              Invoiced automatically once the service is completed — the technician
              collects on site.
            </p>
          ) : (
            <div className="mt-3 pt-3 border-t border-line-soft">
              <p className="text-[12px] font-semibold text-ink-2 mb-2">How is this billed?</p>
              <div className="flex flex-col gap-1.5">
                {([
                  ['upfront', 'Everything upfront', 'One invoice at signing — the office collects'],
                  ['pervisit', 'Pay per service', 'Each completed service invoices itself — the technician collects on site'],
                  ['interval', 'Fixed cycle (MRR)', 'Equal installments, raised automatically — the office collects'],
                ] as Array<[string, string, string]>).map(([m, t, sub]) => (
                  <label key={m}
                    className={'flex items-start gap-2.5 rounded border p-2.5 cursor-pointer transition-colors ' +
                      (draft.billingMode === m ? 'border-accent bg-red-wash' : 'border-line hover:border-navy/40')}>
                    <input type="radio" checked={draft.billingMode === m}
                      onChange={() => set({ billingMode: m })} className="mt-0.5 accent-[#FF0000]" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold">{t}</span>
                      <span className="block text-[11.5px] text-muted">{sub}</span>
                      {m === 'interval' && draft.billingMode === 'interval' && (
                        <span className="mt-1.5 flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}>
                          <span className="text-[12px] text-muted">₹</span>
                          <input type="number" min={0} step={100}
                            className="h-7 w-[110px] px-2 rounded border border-line text-[12px] outline-none focus:border-navy"
                            value={draft.billingAmount ||
                              Math.round(((totals?.sub || 0) - (totals?.disc || 0)) / Math.max(1, monthsOf))}
                            onChange={(e) => set({ billingAmount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                          <span className="text-[11.5px] text-muted">/ month + GST — editable</span>
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {(() => {
                const rows = billingPlan({
                  ...asContract(),
                  value: Math.round((totals?.sub || 0) - (totals?.disc || 0)),
                  billing: 'Monthly',
                  billingMode: draft.billingMode,
                  billingAmount: draft.billingAmount || 0,
                });
                if (!rows.length) return null;
                return (
                  <p className="text-[11.5px] text-ink-2 mt-2 rounded bg-wash px-2.5 py-2">
                    {draft.billingMode === 'upfront'
                      ? <>One invoice of <b>{money(rows[0].amount)}</b> + GST, at signing.</>
                      : draft.billingMode === 'pervisit'
                        ? <>{rows.length} invoices — one per completed service, first {money(rows[0].amount)} + GST on {fmtDate(rows[0].due)}. Unpaid services ride forward as arrears; service never stops.</>
                        : <>{rows.length} monthly invoices of <b>{money(rows[0].amount)}</b> + GST — the first falls due {fmtDate(rows[0].due)}, one month after signing. Missed months carry forward.</>}
                  </p>
                );
              })()}
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------- schedule */}
      <div className="mt-5">
        <section className={card}>
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-line-soft">
            <h2 className="text-[13px] font-semibold">Service appointment schedule</h2>
            <span className="text-[12px] text-muted">
              <b className="text-ink">{appointments}</b> appointments ·{' '}
              <b className="text-ink">{visits.length}</b> trips to site
              {mergedCount > 0 ? ' (' + mergedCount + ' merged)' : ''} · biggest crew{' '}
              <b className="text-ink">{peak}</b>
            </span>
          </div>
          <p className="text-[12px] text-muted px-4 pt-3">
            Set the first visit and the rest are spread evenly across the period from the
            quantity above — every date is listed under its service.
          </p>
          <table className="ztable mt-2">
            <thead>
              <tr>
                <th className="w-8">#</th><th>Service</th><th>First service</th>
                {!isOne && <th className="text-center">Runs for</th>}
                <th>Time window</th><th className="text-center">Technicians needed</th>
                <th className="text-right">Services</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr><td colSpan={isOne ? 6 : 7} className="text-center text-muted py-6">
                  Add a service to schedule it.
                </td></tr>
              ) : draft.lines.map((l, i) => {
                if (!l.svId) return null; // pick the service in the table above first
                const dates = isOne ? [draft.start] : lineDates(i);
                const sp = spreadOf(l);
                return (
                  <FragmentRow key={i}>
                    <tr>
                      <td className="text-muted">{i + 1}</td>
                      <td className="font-medium">{svcOf[l.svId]?.name || l.svId}</td>
                      <td>
                        {isOne ? (
                          <span className="text-[12.5px]">{fmtDate(draft.start)}</span>
                        ) : (
                          <input className={input + ' h-8 w-[140px] text-[12.5px]'} type="date"
                            value={l.startAt}
                            onChange={(e) => setLine(i, { startAt: e.target.value || draft.start })} />
                        )}
                      </td>
                      {!isOne && (
                        <td className="text-center">
                          {(l.qty || 1) <= 1 ? (
                            // One service happens exactly once — there is
                            // nothing to spread, so nothing to ask.
                            <span className="text-[11.5px] text-muted">once, on the date set</span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1">
                                <input className={input + ' h-8 w-[58px] text-center text-[12.5px]'}
                                  type="number" min={0} max={60} value={l.months}
                                  title="0 = the whole contract period"
                                  onChange={(e) => setLine(i, {
                                    months: Math.max(0, parseInt(e.target.value, 10) || 0),
                                  })} />
                                <span className="text-[11px] text-muted">mo</span>
                              </span>
                              <span className="block text-[10.5px] text-muted-2 mt-0.5">
                                {l.months ? l.months + ' of ' + monthsOf : 'whole term'}
                              </span>
                            </>
                          )}
                        </td>
                      )}
                      <td>
                        {isOne ? (
                          <span className="text-[12.5px]">
                            {fmtTime(draft.slot)} – {fmtTime(draft.slotEnd || addMinsHHMM(draft.slot, 120))}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <input className={input + ' h-8 w-[92px] text-[12px]'} type="time" value={l.slot}
                              onChange={(e) => setLine(i, { slot: e.target.value })} />
                            <span className="text-muted text-[11px]">to</span>
                            <input className={input + ' h-8 w-[92px] text-[12px]'} type="time"
                              value={l.slotEnd || addMinsHHMM(l.slot, 120)}
                              onChange={(e) => setLine(i, { slotEnd: e.target.value })} />
                          </span>
                        )}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className="inline-flex items-center border border-line rounded overflow-hidden">
                          <button type="button" className="w-7 h-8 hover:bg-wash text-[15px]"
                            onClick={() => setLine(i, { crew: Math.max(1, (l.crew || 1) - 1) })}>−</button>
                          <input className="w-[42px] h-8 text-center text-[12.5px] outline-none"
                            type="number" min={1} max={9} value={l.crew}
                            onChange={(e) => setLine(i, {
                              crew: Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)),
                            })} />
                          <button type="button" className="w-7 h-8 hover:bg-wash text-[15px]"
                            onClick={() => setLine(i, { crew: Math.min(9, (l.crew || 1) + 1) })}>+</button>
                        </span>
                      </td>
                      <td className="text-right font-semibold">{isOne ? 1 : l.qty}</td>
                    </tr>
                    <tr>
                      <td></td>
                      <td colSpan={isOne ? 5 : 6} className="pt-0">
                        <span className="block text-[10.5px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                          All {dates.length} service{dates.length === 1 ? '' : 's'} ·{' '}
                          {isOne ? 'one-time' : cadenceLabel(sp.gap, sp.visits).toLowerCase()}
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {dates.map((d, n) => {
                            const together = shared[d];
                            const pinned = !!(l.dates && l.dates[n]);
                            return (
                              <span key={n}
                                title={'Service ' + (n + 1)
                                  + (pinned ? ' · hand-picked — click × for the automatic date' : ' · click to pick a date')
                                  + (together
                                    ? ' · shares the trip with ' + (together - 1) + ' other service' + (together > 2 ? 's' : '')
                                    : '')}
                                className={'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border ' +
                                  (pinned
                                    ? 'border-navy text-navy font-medium'
                                    : together
                                      ? 'bg-red-wash text-accent border-transparent font-medium'
                                      : 'border-line text-ink-2')}>
                                <span className="text-muted-2 font-semibold">{n + 1}</span>
                                <input type="date" value={d} min={draft.start} max={draft.end}
                                  onChange={(e) => setLineDate(i, n, e.target.value)}
                                  className="bg-transparent outline-none w-[108px] cursor-pointer text-inherit" />
                                {pinned && (
                                  <button type="button" onClick={() => setLineDate(i, n, '')}
                                    title="Back to the automatic date"
                                    className="text-muted-2 hover:text-accent font-semibold px-0.5">×</button>
                                )}
                              </span>
                            );
                          })}
                        </span>
                        {dates.length > 0 && (
                          <span className="block text-[11px] text-muted-2 mt-1.5 pb-1">
                            {fmtDate(dates[0])} → {fmtDate(dates[dates.length - 1])}
                            {Object.keys(shared).length
                              ? ' · shaded dates share a trip with another service' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-[11.5px] text-muted-2 border-t border-line-soft">
            Crew counts say how many technicians each service takes; who they are is chosen on the
            contract page once it exists, where each technician&rsquo;s workload is visible.
          </p>
        </section>
      </div>

      {/* --------------------------------------- terms, signatures, notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5 items-start">
        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Terms &amp; conditions</h2>
          <ol className="list-decimal pl-5 text-[12.5px] leading-relaxed text-ink-2">
            {draft.terms.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        </section>

        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Digital signatures</h2>
          <span className={label}>Customer signature — {client?.contact || client?.name || 'Customer'}</span>
          {draft.signCustomer ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.signCustomer} alt="Customer signature"
              className="h-[72px] rounded border border-line bg-white object-contain" />
          ) : (
            <SigPad key={'c' + sigKey} onInk={(d) => set({ signCustomer: d })} />
          )}
          {draft.signCustomer && (
            <button type="button" className="text-[11.5px] text-accent font-medium mt-1"
              onClick={() => { set({ signCustomer: '' }); setSigKey((k) => k + 1); }}>
              Clear
            </button>
          )}
          <span className={label + ' mt-4'}>For {boot.company.name} — {ownerName}</span>
          {ownerSign ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ownerSign} alt="Signature on file"
                className="h-[72px] rounded border border-line bg-white object-contain" />
              <p className="text-[11.5px] text-muted-2 mt-2">
                {ownerName}&rsquo;s signature is taken from their team profile. The customer can
                sign here, or leave it and sign the printed copy.
              </p>
            </>
          ) : (
            <>
              <SigPad key={'e' + sigKey} onInk={(d) => set({ signExec: d })} />
              <p className="text-[11.5px] text-muted-2 mt-2">
                Optional — sign with a mouse or a finger. {ownerName} has no signature on
                file; upload one on their team profile and it will be placed here automatically.
              </p>
            </>
          )}
        </section>

        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Customer notes</h2>
          <textarea className={input + ' min-h-[96px] py-2'} value={draft.notes}
            placeholder="Timing restrictions, chemical preferences, access instructions…"
            onChange={(e) => set({ notes: e.target.value })} />
          <p className="text-[11.5px] text-muted-2 mt-2">
            Printed on the contract and visible to the technician on every visit.
          </p>
        </section>
      </div>

      {/* --------------------------------------------------------- footer */}
      {err && (
        <p className="mt-5 rounded border border-red-line bg-red-wash px-4 py-2.5 text-[13px] text-accent font-medium">
          {err}
        </p>
      )}
      {/* On a phone this is pinned: after a long form the buttons must be
          where the thumb already is, not at the end of a scroll. */}
      <div className="flex justify-end gap-3 mt-5 pb-10
        max-lg:fixed max-lg:left-0 max-lg:right-0 max-lg:bottom-0 max-lg:z-30
        max-lg:bg-white max-lg:border-t max-lg:border-line
        max-lg:px-4 max-lg:pt-2.5 max-lg:pb-[calc(env(safe-area-inset-bottom)+10px)]
        max-lg:mt-0">
        <button onClick={() => router.push('/contracts')}
          className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash
            max-lg:h-[52px] max-lg:px-5 max-lg:rounded-xl max-lg:text-[15px] max-lg:font-semibold">
          Cancel
        </button>
        <button onClick={create} disabled={busy}
          className="h-9 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60
            max-lg:flex-1 max-lg:h-[52px] max-lg:rounded-xl max-lg:text-[16px] max-lg:font-bold">
          {busy ? 'Creating…' : COPY[mode].cta}
        </button>
      </div>
    </div>
  );
}

/** React needs one parent per map item; a fragment with a key works for row pairs. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<p className="p-4 lg:p-6 text-muted text-[13px]">Loading…</p>}>
      <NewContractForm />
    </Suspense>
  );
}
