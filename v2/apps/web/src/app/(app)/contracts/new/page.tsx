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
import {
  addMonths, billingPlan, cadenceLabel, dayOfMonth, daysBetween, docTermsFor, docTotals, lineVisitDates, money, peakCrew, planVisits, toMin, type AddressBlock, type ContractInput, type PlanLineInput,
} from 'shared';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { FormSteps, Step, StepNav, useStepScroll } from '@/components/form-steps';
import TimePicker from '@/components/time-picker';
import TimeRangePicker, { windowLabel } from '@/components/time-range';
import SignatureField from '@/components/signature-field';
import {
  addMinsHHMM, fmtDate, fmtShort, fmtTime, slotLabel, todayISO,
  SLOTS, STATES,
  type Boot, type ClientLite, type Draft, type DraftLine,
} from '../lib';

/* The phone walks the form a stage at a time; from `lg` up every stage is on
   screen at once and these are unused. */
const STEPS = ['Details', 'Services', 'Schedule', 'Terms'];

const COPY = {
  amc: {
    title: 'Create new AMC contract',
    cta: 'Create contract',
  },
  onetime: {
    title: 'Create one-time service',
    cta: 'Create service',
  },
};

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
  const [step, setStep] = useState(0);
  const isOne = mode === 'onetime';
  /* The customer's signature, the two ways it can arrive.
     `onFile` is the one they gave last time, kept against the customer;
     `signLater` means "create it unsigned and send the link" - the customer
     signs on their own phone from the shared contract page. */
  const [onFile, setOnFile] = useState<{ sign: string; signAt: string } | null>(null);
  const [signLater, setSignLater] = useState(false);
  // Which customer the signature in the draft belongs to.
  const signFor = useRef('');
  const draftRef = useRef<Draft | null>(null);
  // Long schedules start folded on the phone: line index -> every date shown.
  const [allDates, setAllDates] = useState<Record<number, boolean>>({});
  // Which customer's addresses are currently in the two boxes. Editing keeps
  // them; picking a different customer refills both from that record.
  const addrForRef = useRef('');

  /* An address as it should print: blank lines dropped, not left as gaps. */
  const printable = (a?: AddressBlock | null): string => {
    if (!a) return '';
    return [
      a.attention, a.street1, a.street2,
      [a.city, a.pin].filter(Boolean).join(' '), a.state,
    ].map((x) => String(x || '').trim()).filter(Boolean).join('\n');
  };

  /* Every place this customer can be served — the list if they have one, the
     single site address if they are an older record, and billing last. */
  const sitePicks = useMemo(() => {
    const c = (clients || []).find((x) => x.id === draft?.clientId) as
      (ClientLite & { billing?: AddressBlock; shipping?: AddressBlock; sites?: AddressBlock[] })
      | undefined;
    if (!c) return [] as Array<{ label: string; text: string }>;
    const out: Array<{ label: string; text: string }> = [];
    const list = (c.sites || []).filter((a: AddressBlock) => a && a.street1);
    if (list.length) {
      list.forEach((a: AddressBlock, i: number) => out.push({
        label: a.label || 'Site ' + (i + 1), text: printable(a),
      }));
    } else if (c.shipping && c.shipping.street1) {
      out.push({ label: 'Site address', text: printable(c.shipping) });
    }
    const bill = printable(c.billing);
    if (bill && !out.some((o) => o.text === bill)) {
      out.push({ label: 'Billing address', text: bill });
    }
    return out.filter((o) => o.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, draft?.clientId]);

  /* ----------------------------------------------------------- bootstrap */
  useEffect(() => {
    if (!draft || !draft.clientId || addrForRef.current === draft.clientId) return;
    const first = addrForRef.current === '';
    addrForRef.current = draft.clientId;
    // A draft seeded from a quotation arrives with its own addresses — keep them.
    if (first && (draft.billAddr || draft.siteAddr)) return;
    const c = (clients || []).find((x) => x.id === draft.clientId) as
      (ClientLite & { billing?: AddressBlock }) | undefined;
    if (!c) return;
    /* The address the customer was actually asked for, not the one-line
       summary derived from it. */
    const bill = printable(c.billing)
      || [c.addr, [c.city, c.pin].filter(Boolean).join(' ')].filter(Boolean).join('\n');
    const site = sitePicks[0]?.text || bill;
    setDraft((d) => (d ? { ...d, billAddr: bill, siteAddr: site } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.clientId, clients]);

  /* ------------------------------------------- the signature on file
     Signed once, theirs from then on. Picking a customer fetches the
     signature they gave last time and starts the agreement with it - shown,
     labelled, and removable. A signature drawn for one customer never rides
     along when the form is switched to another. */
  draftRef.current = draft;
  useEffect(() => {
    const cid = draft?.clientId || '';
    if (!cid) { setOnFile(null); return; }
    let dead = false;
    const apply = (s: { sign: string; signAt: string }) => {
      if (dead) return;
      setOnFile(s.sign ? s : null);
      const cur = draftRef.current?.signCustomer || '';
      const stale = !!cur && !!signFor.current && signFor.current !== cid;
      signFor.current = cid;
      if (s.sign && (!cur || stale)) { set({ signCustomer: s.sign }); setSignLater(false); }
      else if (stale) set({ signCustomer: '' });
    };
    api.get<{ sign: string; signAt: string }>('/clients/' + cid + '/signature')
      .then(apply).catch(() => apply({ sign: '', signAt: '' }));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.clientId]);

  // Who is writing this: a salesperson is the sales executive, fixed.
  const [myRole, setMyRole] = useState('');
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [b, cl, meRow] = await Promise.all([
          api.get<Boot>('/org/bootstrap'),
          api.get<ClientLite[]>('/clients'),
          api.get<SessionUser>('/auth/me'),
        ]);
        if (!dead) setMyRole(meRow.role);
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
            owner: meRow.role === 'sales' ? meRow.id : d.owner || meRow.id, refNo: d.refNo || '',
            placeOfSupply: d.placeOfSupply || '', discount: d.discount || 0,
            billAddr: d.billAddr || '', siteAddr: d.siteAddr || '',
            start: d.start || todayISO(), end: d.end || todayISO(),
            slot: d.slot || '10:00', slotEnd: d.slotEnd || '12:00',
            subject: d.subject || '', notes: d.notes || '',
            /* The API now hands back the CONTRACT's terms for a converted
               quotation, so `d.terms` is already right; the fallback is the
               same list read locally. Both used to end up as the quotation's
               wording, which is why the contract list never appeared. */
            terms: d.terms?.length ? d.terms : docTermsFor(b.company, 'contract'),
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
            terms: docTermsFor(b.company, 'contract'),
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
        // So the schedule preview below reflects a hand-picked window the
        // moment it is set, rather than only after saving.
        times: l.times || [],
        timeEnds: l.timeEnds || [],
        slotEnd: l.slotEnd || '',
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

  /** The end of one visit's window ('' = two hours after it starts). */
  function setLineTimeEnd(i: number, v: number, time: string) {
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.slice();
      const ts = ((lines[i] as { timeEnds?: string[] }).timeEnds || []).slice();
      ts[v] = time;
      while (ts.length && !ts[ts.length - 1]) ts.pop();
      lines[i] = { ...lines[i], timeEnds: ts };
      return { ...d, lines };
    });
  }

  /** Pin one visit of one line to a hand-picked TIME ('' = the line's slot). */
  function setLineTime(i: number, v: number, time: string) {
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.slice();
      const ts = ((lines[i] as { times?: string[] }).times || []).slice();
      ts[v] = time;
      while (ts.length && !ts[ts.length - 1]) ts.pop();
      lines[i] = { ...lines[i], times: ts };
      return { ...d, lines };
    });
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
  /* What each stage has to satisfy before the next one opens. `create` runs
     the whole list, so the phone and the desktop enforce exactly the same
     rules — the stepping only decides where a complaint is shown. */
  function checkStep(n: number): string {
    if (!draft) return '';
    if (n === 0) {
      if (!draft.clientId) return 'Pick a customer';
      if (!draft.subject.trim()) {
        return 'A subject is required — it is what the customer sees on the contract';
      }
    }
    if (n === 1 && !draft.lines.length) return 'Add at least one service';
    if (n === 2) {
      if (isOne) {
        if (!draft.start) return 'Pick a service date';
        const l0 = draft.lines[0] as { times?: string[]; timeEnds?: string[] } | undefined;
        const from = l0?.times?.[0] || draft.slot || '10:00';
        const to = l0?.timeEnds?.[0] || draft.slotEnd || '';
        if (to && toMin(to) <= toMin(from)) {
          return 'The appointment ends before it starts — set a finish later than ' + fmtTime(from);
        }
        if (draft.end && daysBetween(draft.start, draft.end) < 0) {
          return 'The end date is before the start date';
        }
      } else if (daysBetween(draft.start, draft.end) < 28) {
        return 'The service period is too short — give it at least a month';
      }
    }
    return '';
  }

  useStepScroll(step);

  function next() {
    const bad = checkStep(step);
    if (bad) { setErr(bad); return; }
    setErr('');
    setStep((n) => Math.min(STEPS.length - 1, n + 1));
  }

  async function create() {
    if (!draft) return;
    setErr('');
    for (let n = 0; n < STEPS.length; n++) {
      const bad = checkStep(n);
      // Send the person to the stage that is wrong, not just the message.
      if (bad) { setErr(bad); setStep(n); return; }
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
      // Unsigned by choice: land on the contract with the link ready to send.
      router.push('/contracts/' + made.id + (signLater && !draft.signCustomer ? '?sign=link' : ''));
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

  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
/* One size for every field in the app's long forms.

   Two sizes, really: a phone and a desk are not the same hand. On the phone
   a control is 44px so it can actually be hit — the app's own rule is that
   anything pressed is at least 48px including its label — and its text is
   16px, which is not a style choice: below 16px Safari zooms the whole page
   in when the field takes focus, and the person is then panning sideways
   through a form they were halfway down. From `lg` up it goes back to the
   compact 36px row a mouse deserves. */
  /* Split so a field that sets its own width does not have to fight w-full.
     Appending `w-[90px]` to a class that already says w-full is a coin toss
     decided by stylesheet order — which is how a description box ended up
     narrower than the quantity beside it. */
  const field = 'h-11 lg:h-9 px-3 rounded-lg border border-line text-[16px] lg:text-[13.5px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
  const input = 'w-full ' + field;
  const card = 'card';

  return (
    <div className="p-4 lg:p-6 max-w-[1180px] max-lg:pb-[calc(env(safe-area-inset-bottom)+92px)]">
      <Link href="/contracts" className="text-[12.5px] text-muted hover:text-navy">← All contracts</Link>
      <div className="mt-2 mb-4 lg:mb-5">
        <h1 className="text-[17px] lg:text-[20px] font-semibold">{COPY[mode].title}</h1>
      </div>

      {/* The page has its own padding, so the tracker is pulled back out to
          the screen edges — a progress rail inset from the sides reads as a
          widget sitting on the form rather than the frame around it. The
          margins go on the sticky element itself; a wrapper its own height
          would leave it nothing to travel inside. */}
      <FormSteps steps={STEPS} at={step} onGo={setStep} className="-mx-4 -mt-1 mb-4" />

      {/* --------------------------------------- stage 1 · the header card */}
      <Step n={0} at={step}>
      <section className={card + ' p-5 max-lg:p-4'}>
        {/* One field to a row on a phone. Two columns at 390px turned every
            control into an ellipsis — "Pick a custor⌄", "Rajesh Kuma⌄" —
            and a select you cannot read is a select you cannot use. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className={label}>Contract number</span>
            <input className={input + ' font-mono bg-wash text-muted cursor-default'}
              value={draft.no || '…'} readOnly tabIndex={-1} />
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <label className="block">
            <span className={label}>Sales executive *</span>
            {myRole === 'sales' ? (
              <input data-owner-fixed readOnly disabled value={ownerName}
                className={input + ' cursor-not-allowed text-ink-2'} />
            ) : (
              <select className={input} value={draft.owner}
                onChange={(e) => set({ owner: e.target.value })}>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </label>
          <label className="block">
            <span className={label}>Place of supply</span>
            <select className={input} value={draft.placeOfSupply || boot.company.state}
              onChange={(e) => set({ placeOfSupply: e.target.value })}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Discount (₹)</span>
            <input className={input} type="number" min={0} step={500} value={draft.discount}
              onChange={(e) => set({ discount: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="block">
            <span className={label}>Subject / description *</span>
            <textarea className={input + ' min-h-[84px] py-2'} maxLength={200}
              placeholder="Annual Pest Control Service — factory and office"
              value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
            <span className="block text-[11px] text-muted-2 text-right whitespace-nowrap">{draft.subject.length}/200</span>
          </label>
        </div>

        {/* ------------------------------------------------ addresses

            Four equal columns put two addresses and two date pairs in a
            quarter of the width each. An address is five lines tall and a
            date pair is two controls wide, so both were squeezed: the site
            box scrolled after four lines, and the second date was clipped by
            its own spinner.

            Addresses get a row of their own and half the width each; the
            dates and times get the row below. Nothing is narrower than the
            thing inside it.                                                */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div>
            <span className={label}>Billing address</span>
            <textarea rows={6} className={input + ' h-auto py-2 leading-relaxed resize-y min-h-[132px]'}
              value={draft.billAddr}
              onChange={(e) => set({ billAddr: e.target.value })}
              placeholder="Street, area — City PIN" />
          </div>
          <div>
            <span className={label}>Site address</span>
            {/* The customer's own sites, ticked rather than retyped. A contract
                covering three blocks of one property should print all three. */}
            {sitePicks.length > 0 && (
              <div className="rounded border border-line divide-y divide-line-soft mb-2
                max-h-[200px] overflow-y-auto">
                {sitePicks.map((sp) => {
                  const on = (draft.siteAddr || '').split('\n\n').includes(sp.text);
                  return (
                    <label key={sp.label}
                      className="flex items-start gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-wash">
                      <input type="checkbox" checked={on} className="mt-0.5 accent-[#FF0000]"
                        onChange={() => {
                          const parts = (draft.siteAddr || '').split('\n\n').filter(Boolean);
                          set({ siteAddr: (on
                            ? parts.filter((x) => x !== sp.text)
                            : [...parts, sp.text]).join('\n\n') });
                        }} />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold">{sp.label}</span>
                        <span className="block text-[11px] text-muted whitespace-pre-line leading-snug">
                          {sp.text}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <textarea rows={6} className={input + ' h-auto py-2 leading-relaxed resize-y min-h-[132px]'}
              value={draft.siteAddr}
              onChange={(e) => set({ siteAddr: e.target.value })}
              placeholder="Street, area — City PIN" />
            <button type="button" onClick={() => set({ siteAddr: draft.billAddr })}
              className="mt-1 text-[11.5px] font-medium text-navy hover:text-accent">
              Same as billing address
            </button>
          </div>
        </div>

        {/* ----------------------------------------------- when it happens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {isOne ? (
            <>
              <div>
                <span className={label}>Service period *</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-muted-2 mb-1">Service date</span>
                    <input className={input + ' w-full'} type="date" value={draft.start}
                      onChange={(e) => moveStart(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-muted-2 mb-1">Covered until</span>
                    <input className={input + ' w-full'} type="date" value={draft.end} min={draft.start}
                      onChange={(e) => set({ end: e.target.value })} />
                  </label>
                </div>
              </div>
              {/* The "Time window" pair that sat here has gone. One visit had two
                  places to say when it happened — this box and the appointment
                  in the schedule below — and two places can disagree. The
                  appointment is the one that ends up on a technician's day, so
                  the appointment is where the hours are set. */}
            </>
          ) : (
            <div className="lg:col-span-2">
              <span className={label}>
                Service period *
                <span className="font-normal text-muted-2 whitespace-nowrap"> · {monthsOf} months</span>
              </span>
              <div className="grid grid-cols-2 gap-2 max-w-[420px]">
                <label className="block">
                  <span className="block text-[11px] text-muted-2 mb-1">Starts</span>
                  <input className={input + ' w-full'} type="date" value={draft.start}
                    onChange={(e) => moveStart(e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-muted-2 mb-1">Ends</span>
                  <input className={input + ' w-full'} type="date" value={draft.end}
                    onChange={(e) => set({ end: e.target.value })} />
                </label>
              </div>
            </div>
          )}
        </div>
      </section>

      </Step>

      {/* ------------------------------------- stage 2 · services + money */}
      <Step n={1} at={step}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-5 max-lg:mt-0 items-start">
        <section className={card}>
          <h2 className="text-[13px] font-semibold px-4 py-3 border-b border-line-soft">
            Pest control services
          </h2>

          {/* ------------------------------------------ the phone's version

              One card to a service, every field with its name above it. The
              table below folds on a phone into a run of boxes with no labels
              - a price, a count and a description that all look the same -
              which is how a quantity got typed into the rate. */}
          <div className="lg:hidden p-3 flex flex-col gap-3" data-svc-cards>
            {draft.lines.length === 0 && (
              <p className="text-center text-muted text-[14px] py-5">
                No services yet — add the first one below.
              </p>
            )}
            {draft.lines.map((l, i) => {
              const sp = spreadOf(l);
              return (
                <div key={i} data-svc-card className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                      Service {i + 1}
                    </span>
                    <button type="button"
                      className="h-9 px-2.5 -mr-1.5 rounded-lg text-[13px] font-semibold text-accent active:bg-red-wash"
                      onClick={() => set({ lines: draft.lines.filter((_, x) => x !== i) })}>
                      Remove
                    </button>
                  </div>
                  <select className={input} value={l.svId} aria-label={'Service ' + (i + 1)}
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
                  <label className="block mt-3">
                    <span className={label}>Description</span>
                    <input className={input} value={l.desc} placeholder="Shown on the contract"
                      onChange={(e) => setLine(i, { desc: e.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <label className="block min-w-0">
                      <span className={label}>{isOne ? 'Unit price (₹)' : 'Price per service (₹)'}</span>
                      <input className={input} type="number" inputMode="decimal" min={0} step={50}
                        value={l.rate}
                        onChange={(e) => setLine(i, { rate: parseFloat(e.target.value) || 0 })} />
                    </label>
                    <div className="min-w-0">
                      <span className={label}>{isOne ? 'Quantity' : 'No. of services'}</span>
                      <Stepper value={l.qty || 1} min={1} max={120}
                        name={isOne ? 'quantity' : 'number of services'}
                        onChange={(v) => setLine(i, { qty: v })} />
                    </div>
                  </div>
                  {!isOne && l.svId && (
                    <p className="text-[12.5px] font-semibold text-navy mt-2">
                      {cadenceLabel(sp.gap, sp.visits)}
                      {sp.visits > 1 ? ' · one every ' + Math.round(sp.gap) + ' days' : ''}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-line-soft">
                    <span className="text-[13px] text-muted">
                      {l.qty || 0} × {money(l.rate || 0)}
                    </span>
                    <span className="text-[16px] font-bold tabular-nums">
                      {money((l.qty || 0) * (l.rate || 0))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <table className="ztable max-lg:hidden">
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
                      <input className={field + ' h-8 w-[90px] text-right text-[12.5px]'}
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
          <div className="px-4 py-3 max-lg:px-3 max-lg:pt-0">
            <button type="button" onClick={addLine}
              className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash
                max-lg:w-full max-lg:h-11 max-lg:justify-center max-lg:rounded-lg max-lg:text-[14.5px] max-lg:font-semibold">
              <Icon name="plus" size={13} /> {draft.lines.length ? 'Add another service' : 'Add a service'}
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
          {isOne ? null : (
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
                            className="h-7 w-[110px] px-2 rounded-lg border border-line text-[12px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
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

      </Step>

      {/* -------------------------------------------- stage 3 · schedule */}
      <Step n={2} at={step}>
      <div className="mt-5 max-lg:mt-0">
        <section className={card}>
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-line-soft">
            <h2 className="text-[13px] font-semibold">Service appointment schedule</h2>
            <span className="max-lg:hidden text-[12px] text-muted">
              <b className="text-ink">{appointments}</b> appointments ·{' '}
              <b className="text-ink">{visits.length}</b> trips to site
              {mergedCount > 0 ? ' (' + mergedCount + ' merged)' : ''} · biggest crew{' '}
              <b className="text-ink">{peak}</b>
            </span>
          </div>

          {/* ------------------------------------------ the phone's version

              The schedule is three questions - how many, which day, what
              time - and on a phone each one gets its own labelled, full-width
              control. The table below folds into unlabelled boxes there: the
              count, the crew size and the month box were three identical
              number fields in a row, and the dates were chips 108px wide. */}
          <div className="lg:hidden" data-sched-cards>
            <div className="grid grid-cols-3 gap-2 px-3 pt-3">
              {([
                [isOne ? draft.lines.filter((l) => l.svId).length : appointments, 'Services'],
                [visits.length, visits.length === 1 ? 'Trip to site' : 'Trips to site'],
                [peak, 'Biggest crew'],
              ] as Array<[number, string]>).map(([v, t]) => (
                <div key={t} className="rounded-xl bg-wash px-2 py-2.5 text-center">
                  <p className="text-[19px] font-bold tabular-nums leading-none">{v}</p>
                  <p className="text-[11.5px] text-muted mt-1.5 leading-tight">{t}</p>
                </div>
              ))}
            </div>

            {!draft.lines.some((l) => l.svId) ? (
              <p className="text-center text-muted text-[14px] py-8 px-5 leading-relaxed">
                Pick a service in the step before this one and its dates appear here.
              </p>
            ) : isOne ? (() => {
              /* One visit: one date, one window. Every service on the form
                 is done in it, so the hours are set once for all of them. */
              const l0 = draft.lines[0];
              const from = l0?.times?.[0] || draft.slot || '10:00';
              const to = l0?.timeEnds?.[0] || draft.slotEnd || addMinsHHMM(from, 120);
              return (
                <div className="p-3 flex flex-col gap-3">
                  <div data-when-card className="rounded-xl border border-line p-3">
                    <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted mb-2.5">
                      When
                    </p>
                    <label className="block">
                      <span className={label}>Service date</span>
                      <input className={input} type="date" value={draft.start}
                        onChange={(e) => moveStart(e.target.value)} />
                    </label>
                    <div className="mt-3">
                      <span className={label}>Time</span>
                      <TimeRangePicker from={from} to={to}
                        onChange={(f, t) => draft.lines.forEach((_, i) => {
                          setLineTime(i, 0, f); setLineTimeEnd(i, 0, t);
                        })}
                        className={input + ' flex items-center'} />
                    </div>
                    <p className="text-[12.5px] text-muted mt-2.5 leading-relaxed">
                      {fmtDate(draft.start)}, {windowLabel(from, to)} — everything below is
                      done in this one visit.
                    </p>
                  </div>
                  {draft.lines.map((l, i) => (l.svId ? (
                    <div key={i} data-sched-card className="rounded-xl border border-line p-3">
                      <p className="text-[14.5px] font-bold leading-snug">
                        {svcOf[l.svId]?.name || l.svId}
                      </p>
                      <div className="mt-2.5">
                        <span className={label}>Technicians needed</span>
                        <Stepper value={l.crew || 1} min={1} max={9} name="technicians"
                          onChange={(v) => setLine(i, { crew: v })} />
                      </div>
                    </div>
                  ) : null))}
                </div>
              );
            })() : (
              <div className="p-3 flex flex-col gap-3">
                <p className="text-[12.5px] text-muted leading-relaxed px-0.5">
                  Set the first date and the rest are spread evenly. Any single date or
                  time can be changed in the list under its service.
                </p>
                {draft.lines.map((l, i) => {
                  if (!l.svId) return null;
                  const dates = lineDates(i);
                  const sp = spreadOf(l);
                  const usual = windowLabel(l.slot, l.slotEnd || addMinsHHMM(l.slot, 120));
                  const shown = allDates[i] ? dates : dates.slice(0, 4);
                  return (
                    <div key={i} data-sched-card className="rounded-xl border border-line overflow-hidden">
                      <div className="p-3">
                        <p className="text-[15px] font-bold leading-snug">
                          {svcOf[l.svId]?.name || l.svId}
                        </p>
                        <p className="text-[12.5px] font-semibold text-navy mt-0.5">
                          {cadenceLabel(sp.gap, sp.visits)}
                          {sp.visits > 1 ? ' · one every ' + Math.round(sp.gap) + ' days' : ''}
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div className="min-w-0">
                            <span className={label}>No. of services</span>
                            <Stepper value={l.qty || 1} min={1} max={120} name="number of services"
                              onChange={(v) => setLine(i, { qty: v })} />
                          </div>
                          <div className="min-w-0">
                            <span className={label}>Technicians</span>
                            <Stepper value={l.crew || 1} min={1} max={9} name="technicians"
                              onChange={(v) => setLine(i, { crew: v })} />
                          </div>
                        </div>
                        <label className="block mt-3">
                          <span className={label}>First service date</span>
                          <input className={input} type="date" value={l.startAt}
                            onChange={(e) => setLine(i, { startAt: e.target.value || draft.start })} />
                        </label>
                        <div className="mt-3">
                          <span className={label}>Usual time</span>
                          <TimeRangePicker
                            from={l.slot} to={l.slotEnd || addMinsHHMM(l.slot, 120)}
                            onChange={(f, t) => setLine(i, { slot: f, slotEnd: t })}
                            className={input + ' flex items-center'} />
                        </div>
                        {(l.qty || 1) > 1 && (
                          <div className="mt-3">
                            <span className={label}>Spread over (months)</span>
                            <Stepper value={l.months || 0} min={0} max={60} name="months"
                              onChange={(v) => setLine(i, { months: v })} />
                            <p className="text-[12px] text-muted mt-1.5">
                              {l.months
                                ? l.months + ' of the contract’s ' + monthsOf + ' months'
                                : '0 = the whole contract, ' + monthsOf + ' months'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-line-soft bg-wash px-3 py-3">
                        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                          {dates.length === 1 ? 'The date' : 'All ' + dates.length + ' dates'}
                        </p>
                        <p className="text-[12px] text-muted mt-0.5 mb-2.5">
                          Worked out for you. Tap a date or a time to change just that one.
                        </p>
                        <div className="flex flex-col gap-2">
                          {shown.map((d, n) => {
                            const pinned = !!(l.dates && l.dates[n]);
                            const tFrom = l.times?.[n] || '';
                            const tTo = l.timeEnds?.[n] || '';
                            const own = pinned || !!tFrom || !!tTo;
                            return (
                              <div key={n} data-appt
                                className={'rounded-lg border bg-white px-2.5 py-2 '
                                  + (own ? 'border-navy' : 'border-line')}>
                                {/* The date and the time each get the full
                                    width. Side by side at 360px the year was
                                    cut off the date and the window wrapped. */}
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-wash text-[11.5px] font-bold
                                    flex items-center justify-center shrink-0">
                                    {n + 1}
                                  </span>
                                  <input type="date" aria-label={'Date of service ' + (n + 1)}
                                    value={d} min={draft.start} max={draft.end}
                                    onChange={(e) => setLineDate(i, n, e.target.value)}
                                    className={'h-11 flex-1 min-w-0 px-2.5 rounded-lg border border-line bg-white '
                                      + 'text-[16px] outline-none focus:border-accent '
                                      + (pinned ? 'font-semibold' : '')} />
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="w-6 shrink-0" />
                                  <TimeRangePicker from={tFrom} to={tTo} placeholder={usual}
                                    onChange={(f, t) => { setLineTime(i, n, f); setLineTimeEnd(i, n, t); }}
                                    className={'h-11 flex-1 min-w-0 px-2.5 rounded-lg border border-line bg-white '
                                      + 'flex items-center text-[14.5px] whitespace-nowrap '
                                      + (tFrom ? 'font-semibold text-ink' : '')} />
                                </div>
                                {(own || shared[d]) && (
                                  <div className="flex items-center gap-2 mt-1 pl-8 min-h-[30px]">
                                    <span className="flex-1 min-w-0 text-[12px] text-muted">
                                      {[own ? 'Set by hand' : '', shared[d] ? 'Shares the trip with another service' : '']
                                        .filter(Boolean).join(' · ')}
                                    </span>
                                    {own && (
                                      <button type="button"
                                        onClick={() => {
                                          setLineDate(i, n, ''); setLineTime(i, n, ''); setLineTimeEnd(i, n, '');
                                        }}
                                        className="h-[30px] px-2 -mr-1 rounded-lg text-[12.5px] font-semibold text-accent active:bg-red-wash">
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {dates.length > 4 && (
                          <button type="button"
                            onClick={() => setAllDates((m) => ({ ...m, [i]: !m[i] }))}
                            className="mt-2.5 w-full h-10 rounded-lg border border-line bg-white
                              text-[13.5px] font-semibold active:bg-wash">
                            {allDates[i] ? 'Show fewer' : 'Show all ' + dates.length + ' dates'}
                          </button>
                        )}
                        {dates.length > 0 && (
                          <p className="text-[12px] text-muted mt-2.5">
                            {fmtDate(dates[0])} to {fmtDate(dates[dates.length - 1])}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="max-lg:hidden text-[12px] text-muted px-4 pt-3">
            Set the first visit and the rest are spread evenly across the period from the
            quantity above — every date is listed under its service.
          </p>
          <table className="ztable mt-2 max-lg:hidden">
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
                          <input className={field + ' h-8 w-[140px] text-[12.5px]'} type="date"
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
                                <input className={field + ' h-8 w-[58px] text-center text-[12.5px]'}
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
                          /* Whatever the appointment below says — that is the
                             only place the hours are set now. */
                          (() => {
                            const from = (l as { times?: string[] }).times?.[0] || draft.slot || '10:00';
                            const to = (l as { timeEnds?: string[] }).timeEnds?.[0]
                              || draft.slotEnd || addMinsHHMM(from, 120);
                            return (
                              <span className="text-[12.5px]">
                                {fmtTime(from)} – {fmtTime(to)}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            {/* The default window for every visit this line
                                makes; an appointment may still set its own. */}
                            <TimeRangePicker
                              from={l.slot}
                              to={l.slotEnd || addMinsHHMM(l.slot, 120)}
                              onChange={(f, t) => setLine(i, { slot: f, slotEnd: t })}
                              className={field + ' h-8 w-[178px] text-[12px] flex items-center'} />
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
                                {/* ------------------------------ and the hour

                                    A date on its own is half an appointment.
                                    The schedule showed the day for each visit
                                    and the contract's single time window
                                    beside the whole line, so a customer who
                                    can only do the third visit at seven in the
                                    morning had nowhere to say so.

                                    Blank means "whatever this line's window
                                    says", which is the usual case and stays
                                    one glance to read.                       */}
                                {/* ------------------------- the whole window

                                    One control for both ends. Two separate
                                    clocks meant two dialogs and no way for
                                    either to see the other, which is how a
                                    visit came to read "10:00 AM to 1:00 AM".
                                    Set together, the pair can be checked. */}
                                <TimeRangePicker
                                  from={(l as { times?: string[] }).times?.[n] || ''}
                                  to={(l as { timeEnds?: string[] }).timeEnds?.[n] || ''}
                                  placeholder="set the time"
                                  onChange={(f, t) => { setLineTime(i, n, f); setLineTimeEnd(i, n, t); }}
                                  className={'bg-transparent outline-none cursor-pointer '
                                    + 'text-inherit text-[11px] whitespace-nowrap '
                                    + ((l as { times?: string[] }).times?.[n]
                                      ? 'font-semibold' : 'text-muted-2')} />
                                {(pinned
                                  || (l as { times?: string[] }).times?.[n]
                                  || (l as { timeEnds?: string[] }).timeEnds?.[n]) && (
                                  <button type="button"
                                    onClick={() => {
                                      setLineDate(i, n, '');
                                      setLineTime(i, n, '');
                                      setLineTimeEnd(i, n, '');
                                    }}
                                    title="Back to the automatic date and the line's time"
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
        </section>
      </div>

      </Step>

      {/* ------------------------ stage 4 · terms, signatures, notes */}
      <Step n={3} at={step}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5 max-lg:mt-0 items-start">
        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Terms &amp; conditions</h2>
          {/* Editable, one to a line. It was a read-only list, which made the
              create form the one screen where the wording on a contract about
              to be signed could not be corrected — the edit screen has always
              been able to. Defaults come from Settings › Document terms ›
              Contract. */}
          <textarea
            className={input + ' min-h-[150px] py-2 leading-relaxed'}
            value={draft.terms.join('\n')}
            placeholder="One term to a line"
            onChange={(e) => set({ terms: e.target.value.split('\n') })} />
        </section>

        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Digital signatures</h2>
          <span className={label}>Customer signature — {client?.contact || client?.name || 'Customer'}</span>
          {/* ------------------------------------------ two ways to get it

              On the spot: the pad takes the whole screen and the phone is
              handed across. By link: the contract is created unsigned and
              the customer signs on their own phone from the shared page.
              A customer who has signed before starts with that signature -
              shown here, said to be on file, and removable. */}
          {signLater && !draft.signCustomer ? (
            <div data-sign-later className="rounded-xl border border-line bg-wash px-3.5 py-3">
              <p className="text-[13.5px] font-semibold">The customer signs from a link</p>
              <p className="text-[12.5px] text-muted mt-1 leading-relaxed">
                {COPY[mode].cta} first — the contract opens with the link ready to send on
                WhatsApp, and the customer signs on their own phone.
              </p>
              <button type="button" onClick={() => setSignLater(false)}
                className="mt-2.5 h-10 lg:h-9 px-3.5 rounded-lg border border-line bg-white text-[13.5px] lg:text-[12.5px] font-semibold active:bg-wash">
                Sign on this screen instead
              </button>
            </div>
          ) : (
            <SignatureField value={draft.signCustomer}
              onChange={(d) => set({ signCustomer: d })}
              title="Customer signature" who={client?.contact || client?.name || undefined}
              note={draft.signCustomer && onFile && draft.signCustomer === onFile.sign
                ? 'Their signature on file, given ' + fmtDate(onFile.signAt.slice(0, 10))
                  + '. Sign again for a fresh one, or remove it to leave this agreement unsigned.'
                : !draft.signCustomer && onFile
                  ? 'A signature from ' + fmtDate(onFile.signAt.slice(0, 10)) + ' is on file.'
                  : undefined}>
              {!draft.signCustomer && onFile && (
                <button type="button" onClick={() => set({ signCustomer: onFile.sign })}
                  className="h-10 lg:h-9 px-3.5 rounded-lg border border-line text-[13.5px] lg:text-[12.5px] font-semibold hover:bg-wash active:bg-wash">
                  Use the one on file
                </button>
              )}
              {!draft.signCustomer && (
                <button type="button" data-sign-by-link onClick={() => setSignLater(true)}
                  className="h-10 lg:h-9 px-3.5 rounded-lg border border-line text-[13.5px] lg:text-[12.5px] font-semibold hover:bg-wash active:bg-wash">
                  Send a link to sign
                </button>
              )}
            </SignatureField>
          )}
          <span className={label + ' mt-5'}>For {boot.company.name} — {ownerName}</span>
          {ownerSign ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ownerSign} alt="Signature on file"
                className="h-[72px] rounded border border-line bg-white object-contain" />
            </>
          ) : (
            <SignatureField value={draft.signExec} onChange={(d) => set({ signExec: d })}
              title={'Sign for ' + boot.company.name} who={ownerName} />
          )}
        </section>

        <section className={card + ' p-4'}>
          <h2 className="text-[13px] font-semibold mb-3">Customer notes</h2>
          <textarea className={input + ' min-h-[96px] py-2'} value={draft.notes}
            placeholder="Timing restrictions, chemical preferences, access instructions…"
            onChange={(e) => set({ notes: e.target.value })} />
        </section>
      </div>

      </Step>

      {/* ----------------------------------------------------- the footer

          Two of them: the desktop keeps Cancel and Create at the end of the
          whole form, and the phone gets Back/Next instead, pinned where the
          thumb already is. */}
      {err && (
        <p className="max-lg:hidden mt-5 rounded border border-red-line bg-red-wash px-4 py-2.5 text-[13px] text-accent font-medium">
          {err}
        </p>
      )}
      <div className="max-lg:hidden flex justify-end gap-3 mt-5 pb-10">
        <button onClick={() => router.push('/contracts')}
          className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
          Cancel
        </button>
        <button onClick={create} disabled={busy}
          className="h-9 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          {busy ? 'Creating…' : COPY[mode].cta}
        </button>
      </div>

      <StepNav steps={STEPS.length} at={step} err={err} saving={busy}
        onBack={() => { setErr(''); setStep((n) => Math.max(0, n - 1)); }}
        onNext={next} onSave={create} saveLabel={COPY[mode].cta} />
    </div>
  );
}

/**
 * A count, set with the thumb: minus, the number, plus - each 44px wide.
 * The desktop table has its own 28px version; this one is for the phone
 * cards, where a number typed into a bare box was the thing people missed.
 */
function Stepper({ value, min, max, onChange, name }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
  /** What is being counted, for the buttons' labels: "technicians". */
  name: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <span data-stepper className="flex items-stretch h-[44px] rounded-lg border border-line bg-white overflow-hidden">
      <button type="button" aria-label={'Fewer ' + name} disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="w-[44px] shrink-0 text-[20px] leading-none font-semibold text-ink-2 active:bg-wash disabled:text-line">
        −
      </button>
      <input type="number" inputMode="numeric" min={min} max={max} value={value} aria-label={name}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || min))}
        className="flex-1 min-w-0 w-0 text-center text-[16px] font-semibold tabular-nums outline-none
          border-x border-line bg-white" />
      <button type="button" aria-label={'More ' + name} disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="w-[44px] shrink-0 text-[20px] leading-none font-semibold text-ink-2 active:bg-wash disabled:text-line">
        +
      </button>
    </span>
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
