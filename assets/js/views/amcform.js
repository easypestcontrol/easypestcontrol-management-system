/* ==========================================================================
   View: New AMC contract — the single work-order page.
   Customer and period at the top, the services being sold in the middle with
   their quantities, then terms, signatures and the appointment schedule those
   quantities produce. Saving it writes the contract and every dated visit.
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  const SLOTS = ['06:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '14:00', '15:30', '17:00', '18:30', '20:00', '22:00'];

  /**
   * Terms come from Settings, the same place the quotation reads them, so a
   * customer never receives two different sets depending on which screen
   * produced the document. The list below is only a floor for a fresh demo.
   */
  const FALLBACK_TERMS = [
    'Services will be performed as per the scheduled appointments.',
    'Customer must provide access to all areas requiring treatment.',
    'Payment is due within 30 days of invoice date.',
    '24-hour advance notice required for rescheduling.',
    'Service warranty valid for 30 days after each treatment.'
  ];
  function defaultTerms() {
    const t = (S.get().company || {}).terms || [];
    return t.length ? t.slice() : FALLBACK_TERMS.slice();
  }

  /* The form's live state — the DOM holds the inputs, this holds the rest. */
  let draft = null;
  let pending = null;      // { clientId } handed in by whoever opened the form

  /** AMC or one-time — the only thing that differs between the two forms. */
  let mode = 'amc';
  const isOne = () => mode === 'onetime';

  const COPY = {
    amc: {
      title: 'Create new AMC contract',
      sub: 'The services being sold, what they cost, and every visit they produce',
      nav: 'New AMC contract',
      cta: 'Create contract',
      prefix: 'AMC-'
    },
    onetime: {
      title: 'Create new one-time service',
      sub: 'The services being sold, what they cost, and the single visit they produce',
      nav: 'New one-time service',
      cta: 'Create service',
      prefix: 'OTS-'
    }
  };

  function blank() {
    const db = S.get();
    const me = S.me() || {};
    const start = S.todayISO();
    return {
      no: COPY[mode].prefix + new Date().getFullYear() + '-' + String((db.seq.contract || 0) + 1).padStart(2, '0'),
      clientId: (db.clients[0] || {}).id || '',
      branch: (me.branches || [])[0] || (db.branches[0] || {}).id || '',
      owner: ['sales', 'ops', 'admin'].indexOf(me.role) >= 0 ? me.id : 'U03',
      refNo: '',
      place: '',
      start: start,
      end: isOne() ? start : Seed.addMonths(start, 12),
      slot: '10:00',
      slotEnd: '12:00',
      subject: '',
      lines: [],
      discount: 0,
      terms: defaultTerms(),
      signCustomer: '', signExec: '',
      notes: ''
    };
  }

  /**
   * Carry a quotation across. Everything commercial is already agreed, so
   * the contract starts as a copy of it — only the schedule is new work.
   * A quote raised on a lead has no customer yet, so the lead is promoted
   * first, exactly as the old convert flow did.
   */
  function applyQuote(q) {
    let cid = q.clientId;
    if (!cid && q.leadId) {
      const db = S.get();
      const l = S.lead(q.leadId);
      if (l) {
        const known = S.get().clients.filter(c => S.phoneKey(c.phone) === S.phoneKey(l.phone))[0];
        cid = known ? known.id : 'CL-' + String(db.clients.length + 1).padStart(3, '0');
        if (!known) {
          db.clients.push({
            id: cid, name: l.name, type: l.type, contact: l.name, phone: l.phone,
            email: l.email || '', addr: l.area || '', city: 'Chennai', pin: '', gstin: '',
            since: S.todayISO(), color: '#0B7454', area: '—'
          });
        }
        if (l.stage !== 'won') l.stage = 'contract';
        l.clientId = cid;
        S.save();
      }
    }

    draft.quoteId = q.id;
    draft.leadId = q.leadId || null;
    if (cid) draft.clientId = cid;
    if (q.title) draft.subject = q.title;
    if (q.branch) draft.branch = q.branch;
    if (q.owner) draft.owner = q.owner;
    if ((q.terms || []).length) draft.terms = q.terms.slice();
    // Everything commercial was already agreed on the quotation — none of it
    // is retyped, and none of it is quietly dropped on the way across.
    draft.refNo = q.refNo || '';
    draft.place = q.placeOfSupply || '';
    draft.discount = q.discount || 0;
    draft.notes = q.notes || '';
    draft.signCustomer = q.signCustomer || '';
    draft.signExec = q.signExec || '';

    draft.lines = (q.items || []).filter(i => i.svId).map(i => ({
      svId: i.svId,
      desc: i.desc || '',
      rate: i.rate || 0,
      // For an AMC this is the visit count; for a one-time it is the units sold
      // -- bedrooms, tanks, square feet. Forcing it to 1 billed a 12-bedroom
      // job as one bedroom.
      qty: isOne() ? Math.max(1, i.qty || 1) : Math.max(1, i.visits || i.qty || 1),
      // A line quoted over 6 months runs for 6, even when the contract runs 12.
      months: isOne() ? 0 : (i.months || 0),
      startAt: draft.start,
      slot: draft.slot || '10:00',
      crew: 1
    }));

    // An AMC quoted over N months should run for N months.
    if (!isOne() && q.months) draft.end = Seed.addMonths(draft.start, q.months);
  }

  /* --------------------------------------------------------------- helpers */
  const monthsOf = d => Math.max(1, Math.round(Seed.daysBetween(d.start, d.end) / 30.44));

  function addMins(hhmm, mins) {
    const p = String(hhmm).split(':');
    const t = (Number(p[0]) * 60 + Number(p[1]) + mins) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  const slotLabel = t => S.fmtTime(t) + ' – ' + S.fmtTime(addMins(t, 120));

  const mins = hhmm => { const p = String(hhmm || '0:0').split(':'); return Number(p[0]) * 60 + Number(p[1]); };

  /** How long the one-time booking runs for. Never less than half an hour. */
  function windowMins() {
    const d = mins(draft.slotEnd) - mins(draft.slot);
    return d > 0 ? d : 120;
  }
  function windowText() {
    const m = windowMins();
    return S.fmtTime(draft.slot) + ' – ' + S.fmtTime(draft.slotEnd || addMins(draft.slot, 120)) +
      ' · ' + (m >= 60 ? (Math.round(m / 6) / 10) + ' hr' : m + ' min');
  }

  function newLine(svId) {
    const s = S.service(svId) || {};
    const months = monthsOf(draft);
    return {
      svId: svId,
      desc: s.desc || '',
      rate: s.price || 0,
      qty: isOne() ? 1 : Math.max(1, Math.round(months / (Seed.FREQ_MONTHS[s.defaultFreq] || 1))),
      months: 0,
      startAt: draft.start,
      slot: draft.slot || '10:00',
      crew: 1
    };
  }

  /** What one line works out to once the period is taken into account. */
  /** A line runs for its own months when it has them, else the whole term. */
  const lineMonths = l => Math.max(1, (l && l.months) || monthsOf(draft));

  function spreadOf(l) {
    const months = lineMonths(l);
    const term = Math.max(1, Seed.daysBetween(l.startAt || draft.start,
      Seed.addMonths(l.startAt || draft.start, months)));
    const visits = Math.max(1, l.qty || 1);
    return { months: months, visits: visits, gap: term / visits };
  }

  /** The signature the person raising this contract has on file, if any. */
  function ownerSign() { return (S.user(draft.owner) || {}).sign || ''; }

  function totals() {
    const sub = draft.lines.reduce((a, l) => a + (l.qty || 0) * (l.rate || 0), 0);
    const disc = Math.min(Math.max(0, draft.discount || 0), sub);
    const t = S.taxSplit(sub - disc, S.supplyState({
      clientId: draft.clientId, placeOfSupply: draft.place
    }));
    return { sub: sub, disc: disc, gst: t.gst, total: sub - disc + t.gst, tax: t };
  }

  /**
   * Every date one service lands on. Runs the real engine over that line
   * alone, so what is listed here is exactly what will be created.
   */
  function lineDates(l) {
    const c = asContract();
    const one = c.plan.filter(pl => pl.svId === l.svId);
    if (!one.length) return [];
    return Seed.planVisits({
      id: c.id, start: c.start, end: c.end, months: c.months, slot: c.slot,
      mergeSameDay: false, workdaysOnly: true, blackout: [], plan: one
    }).map(v => v.date);
  }

  /** Dates this contract visits more than one service on. */
  function sharedDates() {
    const c = asContract();
    if (!c.plan.length) return {};
    const out = {};
    Seed.planVisits(c).forEach(v => { if (v.lines > 1) out[v.date] = v.lines; });
    return out;
  }

  /** The contract as the engine would see it, so the preview cannot lie. */
  function asContract() {
    const c = {
      id: draft.no, clientId: draft.clientId, start: draft.start, end: draft.end,
      months: monthsOf(draft), slot: '10:00', mergeSameDay: true, workdaysOnly: true, blackout: [],
      plan: draft.lines.map(l => ({
        svId: l.svId, visits: Math.max(1, l.qty || 1), months: lineMonths(l),
        rate: l.rate || 0,
        mins: (S.service(l.svId) || {}).mins || 60,
        dayRule: 'dom:' + Seed.dayOfMonth(l.startAt || draft.start),
        startAt: l.startAt || draft.start,
        slot: l.slot || '10:00', crew: l.crew || 1, techId: ''
      }))
    };
    return c;
  }

  /* ================================================================ render */
  function headerCard() {
    const db = S.get();
    const cl = S.client(draft.clientId);
    const staff = S.get().users.filter(u => ['sales', 'ops', 'admin'].indexOf(u.role) >= 0);
    const addr = c => c ? `<div class="nm">${esc(c.name)}</div>
      ${esc(c.addr || '—')}<br>${esc(c.city || '')}${c.pin ? ' ' + esc(c.pin) : ''}<br>${esc(c.phone || '')}`
      : '<span class="muted">Pick a customer above.</span>';

    return `<div class="card card-pad">
      <div class="grid grid-4">
        ${U.field('Contract number', `<input class="input mono" id="woNo" value="${attr(draft.no)}">`, '', true)}
        ${U.field('Reference no.', `<input class="input" id="woRef" value="${attr(draft.refNo || '')}"
          placeholder="Customer PO or quotation ref">`)}
        ${U.field('Customer', `<select class="select" id="woClient">
          ${db.clients.map(c => `<option value="${attr(c.id)}"${c.id === draft.clientId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>`, '', true)}
        ${U.field('Branch', `<select class="select" id="woBranch">
          ${(db.branches || []).map(b => `<option value="${attr(b.id)}"${b.id === draft.branch ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>`, '', true)}
      </div>

      <div class="grid grid-4 mt-14">
        ${U.field('Sales executive', `<select class="select" id="woOwner">
          ${staff.map(u => `<option value="${attr(u.id)}"${u.id === draft.owner ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select>`, '', true)}
        ${U.field('Place of supply', `<select class="select" id="woPos">${U.selectOpts(Seed.STATES, null, null,
          draft.place || S.supplyState({ clientId: draft.clientId }))}</select>`,
          'Decides whether GST splits into CGST + SGST or is charged as IGST.')}
        ${U.field('Discount (₹)', `<input class="input" id="woDisc" type="number" min="0" step="500"
          value="${attr(draft.discount || 0)}">`, 'Taken off before tax.')}
        ${U.field('Subject / description',
          `<textarea class="textarea" id="woSubject" maxlength="200" style="min-height:84px"
            placeholder="Annual Pest Control Service — factory and office">${esc(draft.subject)}</textarea>
           <div class="t-xs muted r" id="woCount">${draft.subject.length}/200</div>`, '', true)}
      </div>

      <div class="grid grid-4 mt-14">
        ${U.field('Billing address', `<div class="wo-addr">${addr(cl)}</div>`)}
        ${U.field('Site address', `<div class="wo-addr">${addr(cl)}
          <div class="t-xs muted mt-4">Same as billing address</div></div>`)}
        ${isOne()
          ? U.field('Service date', `<input class="input" type="date" id="woStart" value="${attr(draft.start)}">
            <div class="fhint">The single visit this service produces — it goes straight on the calendar.</div>`, '', true)
          : U.field('Service period', `<div class="row g-8">
              <input class="input" type="date" id="woStart" value="${attr(draft.start)}" title="Start date">
              <input class="input" type="date" id="woEnd" value="${attr(draft.end)}" title="End date">
            </div>
            <div class="fhint">${monthsOf(draft)} months — every quantity below is spread across it.</div>`, '', true)}
        ${isOne()
          ? U.field('Time window', `<div class="row g-8 center-y">
              <input class="input" type="time" id="woSlot" value="${attr(draft.slot || '10:00')}" title="From">
              <span class="muted t-sm">to</span>
              <input class="input" type="time" id="woSlotEnd" value="${attr(draft.slotEnd || '12:00')}" title="To">
            </div>
            <div class="fhint">${esc(windowText())} — the technician is booked for exactly this long.</div>`, '', true)
          : ''}
      </div>
    </div>`;
  }

  function servicesCard() {
    const t = totals();
    const svcs = S.get().services;
    return `<div class="wo-split">
      ${C.sectionCard('Pest control services',
        `<div class="tablewrap"><table class="tbl">
          <thead><tr>
            <th style="width:34px">#</th><th>Service</th><th>Description</th>
            <th class="r">Unit price</th><th class="c">Quantity</th><th class="r">Amount</th><th></th>
          </tr></thead>
          <tbody>${draft.lines.length ? draft.lines.map((l, i) => {
            const sp = spreadOf(l);
            return `<tr data-li="${i}">
              <td class="muted">${i + 1}</td>
              <td style="min-width:180px">
                <select class="select" data-f="svc" style="height:32px;font-size:12.5px">
                  ${svcs.map(s => `<option value="${attr(s.id)}"${s.id === l.svId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
                </select>
                <div class="t-xs brand fw-6 mt-4">${esc(Seed.cadenceLabel(sp.gap, sp.visits).toLowerCase())}${sp.visits > 1 ? ' · every ' + Math.round(sp.gap) + ' days' : ''}</div>
              </td>
              <td style="min-width:210px"><input class="input" data-f="desc" value="${attr(l.desc)}"
                style="height:32px;font-size:12.5px" placeholder="Shown on the contract"></td>
              <td class="r"><input class="input r" data-f="rate" type="number" min="0" step="50" value="${attr(l.rate)}"
                style="height:32px;width:96px;font-size:12.5px;text-align:right"></td>
              <td class="c"><span class="stepper">
                <button type="button" data-dq="-1">−</button>
                <input data-f="qty" type="number" min="1" max="120" value="${attr(l.qty)}">
                <button type="button" data-dq="1">+</button>
              </span></td>
              <td class="r fw-7 nowrap">${S.money((l.qty || 0) * (l.rate || 0))}</td>
              <td class="tight"><button class="iconbtn" data-rmli title="Remove">${ico('x', '', 15)}</button></td>
            </tr>`;
          }).join('') : `<tr><td colspan="7" class="center-txt muted" style="padding:22px 0">
            No services yet — add the first one below.</td></tr>`}</tbody>
        </table></div>
        <button class="btn btn-soft btn-sm mt-12" data-addli>${ico('plus')} Add another service</button>`,
        '', { flush: true })}

      <div class="card card-pad">
        <div class="row between mb-8"><span class="t-base muted">Subtotal</span><span class="fw-6">${S.money(t.sub)}</span></div>
        ${t.disc ? `<div class="row between mb-8"><span class="t-base muted">Discount</span>
          <span class="fw-6" style="color:var(--red)">− ${S.money(t.disc)}</span></div>` : ''}
        ${S.taxRows(t.tax).map(r => `<div class="row between mb-8">
          <span class="t-base muted">${esc(r[0])}</span><span class="fw-6">${S.money(r[1])}</span></div>`).join('')}
        ${t.tax.interState ? `<div class="t-xs muted mb-8">Supplied to ${esc(t.tax.place)}
          — IGST applies.</div>` : ''}
        <div class="row between" style="padding-top:11px;border-top:1px solid var(--line)">
          <span class="fw-7 t-md">Total amount</span>
          <span class="fw-7" style="font-size:19px;letter-spacing:-.02em">${S.money(t.total)}</span>
        </div>
        <div class="fhint mt-10">${isOne()
          ? 'Invoiced once the service is completed.'
          : 'Billed across the period on the cycle you pick after the contract is created.'}</div>
      </div>
    </div>`;
  }

  function termsCard() {
    return `<div class="grid grid-2">
      ${C.sectionCard('Terms & conditions',
        `<ol style="margin:0;padding-left:22px;list-style:decimal;font-size:13px;line-height:1.75;color:var(--ink-2)">
          ${draft.terms.map(t => `<li>${esc(t)}</li>`).join('')}
        </ol>`)}

      ${C.sectionCard('Digital signatures',
        C.sigBoxes([
          { key: 'cust', label: 'Customer signature', req: false,
            name: (S.client(draft.clientId) || {}).contact || 'Customer' },
          { key: 'exec', label: 'For ' + (S.get().company || {}).name, req: false,
            name: S.userName(draft.owner), onFile: ownerSign() }
        ]) +
        `<div class="fhint mt-10">${ownerSign()
          ? esc(S.userName(draft.owner)) + '&rsquo;s signature is taken from their team profile. The customer can sign here, or leave it and sign the printed copy.'
          : 'Optional — sign with a mouse or a finger. ' + esc(S.userName(draft.owner)) + ' has no signature on file; upload one on their team profile and it will be placed here automatically.'}</div>`)}

      ${C.sectionCard('Customer notes',
        `<textarea class="textarea" id="woNotes" style="min-height:96px"
          placeholder="Timing restrictions, chemical preferences, access instructions…">${esc(draft.notes || '')}</textarea>
         <div class="fhint mt-8">Printed on the contract and visible to the technician on every visit.</div>`)}
    </div>`;
  }

  function scheduleCard() {
    const c = asContract();
    const shared = sharedDates();
    const visits = draft.lines.length ? Seed.planVisits(c) : [];
    const appointments = draft.lines.reduce((a, l) => a + (l.qty || 0), 0);
    const crew = S.peakCrew(draft.lines, visits);
    const merged = visits.filter(v => v.lines > 1).length;

    return `<div class="wo-split">
      ${C.sectionCard('Service appointment schedule',
        `<div class="fhint" style="margin:-4px 0 12px">Set the first visit and the rest are spread evenly
          across the period from the quantity above — every date is listed under its service.</div>
        <div class="tablewrap"><table class="tbl">
          <thead><tr>
            <th style="width:34px">#</th><th>Service</th><th>First visit</th>
            ${isOne() ? '' : '<th class="c">Runs for</th>'}
            <th>Time slot</th><th class="c">Technicians needed</th><th class="r">Visits</th>
          </tr></thead>
          <tbody>${draft.lines.length ? draft.lines.map((l, i) => {
            const dates = lineDates(l);
            return `<tr data-ap="${i}">
            <td class="muted">${i + 1}</td>
            <td class="fw-6 t-base">${esc(S.svcName(l.svId))}</td>
            <td><input class="input" type="date" data-f="startAt" value="${attr(l.startAt)}"
              style="height:32px;font-size:12.5px;width:150px"></td>
            ${isOne() ? '' : `<td class="c"><span class="row g-4 center-y" style="justify-content:center">
              <input class="input c" data-f="months" type="number" min="0" max="60"
                value="${attr(l.months || 0)}" style="height:32px;width:62px;font-size:12.5px;text-align:center"
                title="0 = the whole contract period">
              <span class="t-xs muted">mo</span></span>
              <div class="t-xs muted mt-2">${l.months ? esc(l.months + ' of ' + monthsOf(draft)) : 'whole term'}</div></td>`}
            <td><select class="select" data-f="slot" style="height:32px;font-size:12.5px;min-width:170px">
              ${SLOTS.map(t => `<option value="${attr(t)}"${t === l.slot ? ' selected' : ''}>${esc(slotLabel(t))}</option>`).join('')}
            </select></td>
            <td class="c"><span class="stepper">
              <button type="button" data-dc="-1">−</button>
              <input data-f="crew" type="number" min="1" max="9" value="${attr(l.crew)}">
              <button type="button" data-dc="1">+</button>
            </span></td>
            <td class="r fw-7">${l.qty}</td>
          </tr>
          <tr>
            <td></td>
            <td colspan="${isOne() ? 5 : 6}" style="padding-top:0">
              <div class="t-xs muted fw-6 mb-6">ALL ${dates.length} VISIT${dates.length === 1 ? '' : 'S'} ·
                ${esc(Seed.cadenceLabel(spreadOf(l).gap, spreadOf(l).visits).toLowerCase())}</div>
              <div class="row g-5 wrap">${dates.map((d, n) => {
                const together = shared[d];
                return `<span class="chip" title="Visit ${n + 1}${together ? ' · shares the trip with ' + (together - 1) + ' other service' + (together > 2 ? 's' : '') : ''}"
                  style="padding:3px 8px;font-size:11px${together ? ';background:var(--brand-50);color:var(--brand-700);border-color:transparent' : ''}">
                  <span class="muted" style="font-weight:600">${n + 1}</span> ${esc(S.fmtShort(d))}
                  ${together ? ico('link', '', 10) : ''}</span>`;
              }).join('')}</div>
              ${dates.length ? `<div class="t-xs muted mt-6">
                ${esc(S.fmtDate(dates[0]))} → ${esc(S.fmtDate(dates[dates.length - 1]))}${
                  Object.keys(shared).length ? ' · shaded dates share a trip with another service' : ''}</div>` : ''}
            </td>
          </tr>`;
          }).join('') : `<tr><td colspan="${isOne() ? 6 : 7}" class="center-txt muted" style="padding:22px 0">
            Add a service to schedule it.</td></tr>`}</tbody>
        </table></div>`, '', { flush: true })}

      <div class="col g-14">
        <div class="card card-pad">
          <div class="row g-10 mb-10">
            <div class="tile-ico i-green">${ico('checkcircle')}</div>
            <div>
              <div class="fw-7 t-base">Total appointments: ${appointments}</div>
              <div class="t-sm muted">Biggest crew needed: ${crew} ${crew === 1 ? 'person' : 'people'}</div>
            </div>
          </div>
          <div class="row between t-sm" style="padding-top:10px;border-top:1px solid var(--line)">
            <span class="muted">Site visits after merging</span><strong>${visits.length}</strong>
          </div>
          ${merged ? `<div class="row between t-sm mt-6">
            <span class="muted">Trips covering more than one service</span><strong>${merged}</strong></div>` : ''}
        </div>
        <div class="banner ban-blue">${ico('info')}<div>
          Say how many technicians each service takes here; who they are is chosen on the contract
          page once it exists, where each technician's current workload is visible. Until every service
          is staffed the contract keeps saying so.</div></div>
      </div>
    </div>`;
  }

  /* ================================================================== view */
  V['contract-new'] = {
    title: () => COPY[mode].nav,
    crumb: 'Contracts',

    render(ctx) {
      if (!draft) {
        draft = blank();
        if (pending) {
          if (pending.clientId) draft.clientId = pending.clientId;
          if (pending.leadId) draft.leadId = pending.leadId;
          if (pending.quote) applyQuote(pending.quote);
          pending = null;
        }
      }
      return C.backLink('#/contracts', 'All contracts') +
        C.pageHead({
          title: COPY[mode].title,
          sub: COPY[mode].sub
        }) +
        headerCard() +
        `<div class="mt-20">${servicesCard()}</div>` +
        `<div class="mt-20">${termsCard()}</div>` +
        `<div class="mt-20">${scheduleCard()}</div>` +
        `<div style="height:8px"></div>
        <div class="wo-foot">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
          <button class="btn btn-primary btn-lg" data-create>${ico('shield')} ${esc(COPY[mode].cta)}</button>
        </div>`;
    },

    mount(root, ctx) {
      // Signature capture is shared with the quotation — see C.sigMount.
      const sig = C.sigMount(root, { cust: draft.signCustomer, exec: draft.signExec });

      /* ---------------------------------------------- read the plain fields */
      function readHeader() {
        const g = id => U.qs(id, root);
        if (g('#woNo')) draft.no = g('#woNo').value.trim() || draft.no;
        if (g('#woRef')) draft.refNo = g('#woRef').value.trim();
        if (g('#woClient')) draft.clientId = g('#woClient').value;
        if (g('#woBranch')) draft.branch = g('#woBranch').value;
        if (g('#woOwner')) draft.owner = g('#woOwner').value;
        if (g('#woPos')) draft.place = g('#woPos').value;
        if (g('#woDisc')) draft.discount = parseFloat(g('#woDisc').value) || 0;
        if (g('#woStart')) draft.start = g('#woStart').value || draft.start;
        if (g('#woEnd')) draft.end = g('#woEnd').value || draft.end;
        if (g('#woSlot')) draft.slot = g('#woSlot').value || draft.slot;
        if (g('#woSlotEnd')) draft.slotEnd = g('#woSlotEnd').value || draft.slotEnd;
        // A one-time service has no period; it begins and ends the same day.
        if (isOne()) {
          draft.end = draft.start;
          draft.lines.forEach(l => { l.startAt = draft.start; l.slot = draft.slot; l.qty = 1; });
        }
        if (g('#woSubject')) draft.subject = g('#woSubject').value;
        if (g('#woNotes')) draft.notes = g('#woNotes').value;
      }

      function readLines() {
        U.qsa('[data-li]', root).forEach(tr => {
          const l = draft.lines[Number(tr.getAttribute('data-li'))];
          if (!l) return;
          l.svId = U.qs('[data-f=svc]', tr).value;
          l.desc = U.qs('[data-f=desc]', tr).value;
          l.rate = parseFloat(U.qs('[data-f=rate]', tr).value) || 0;
          l.qty = Math.max(1, parseInt(U.qs('[data-f=qty]', tr).value, 10) || 1);
        });
        U.qsa('[data-ap]', root).forEach(tr => {
          const l = draft.lines[Number(tr.getAttribute('data-ap'))];
          if (!l) return;
          l.startAt = U.qs('[data-f=startAt]', tr).value || draft.start;
          l.slot = U.qs('[data-f=slot]', tr).value;
          l.crew = Math.max(1, parseInt(U.qs('[data-f=crew]', tr).value, 10) || 1);
          const mo = U.qs('[data-f=months]', tr);
          if (mo) l.months = Math.max(0, parseInt(mo.value, 10) || 0);
        });
      }

      const readAll = () => { readHeader(); readLines(); };

      /**
       * Re-render from the draft. Callers that have already updated the draft
       * pass true, otherwise a second read here would put the stale input
       * values straight back over the change that was just made.
       */
      function repaint(alreadyRead) {
        if (!alreadyRead) readAll();
        draft.signCustomer = (sig.cust && sig.cust.data) || draft.signCustomer;
        draft.signExec = (sig.exec && sig.exec.data) || draft.signExec;
        ctx.refresh();
      }

      /* ------------------------------------------------------- interaction */
      root.addEventListener('input', e => {
        if (e.target.id === 'woSubject') {
          const n = e.target.value.length;
          const box = U.qs('#woCount', root);
          if (box) box.textContent = n + '/200';
          draft.subject = e.target.value;
          return;
        }
        if (e.target.closest('[data-li]') || e.target.closest('[data-ap]')) {
          repaint();
        }
      });

      root.addEventListener('change', e => {
        // Both of these name a signature block, so the page has to redraw:
        // the customer signing, and whose signature is taken from file.
        if (e.target.id === 'woOwner' || e.target.id === 'woClient') { repaint(); return; }

        // A different service means a different price, description and duration.
        if (e.target.matches('[data-f=svc]')) {
          readAll();
          const tr = e.target.closest('[data-li]');
          const l = draft.lines[Number(tr.getAttribute('data-li'))];
          const svc = S.service(e.target.value);
          if (l && svc) {
            l.svId = svc.id;
            l.rate = svc.price || 0;
            l.desc = svc.desc || '';
            l.qty = Math.max(1, Math.round(monthsOf(draft) / (Seed.FREQ_MONTHS[svc.defaultFreq] || 1)));
          }
          repaint(true);
          return;
        }
        if (['woClient', 'woBranch', 'woOwner', 'woStart', 'woEnd'].indexOf(e.target.id) >= 0) {
          readAll();
          if (e.target.id === 'woStart') {
            // Keep the period the same length when the start moves.
            draft.end = Seed.addMonths(draft.start, monthsOf(draft));
            draft.lines.forEach(l => { l.startAt = draft.start; });
          }
          repaint(true);
          return;
        }
        if (e.target.closest('[data-li]') || e.target.closest('[data-ap]')) repaint();
      });

      root.addEventListener('click', e => {
        const cl = e.target.closest('[data-clearsig]');
        if (cl) {
          const k = cl.getAttribute('data-clearsig');
          if (sig[k] && sig[k].clear) sig[k].clear();
          if (k === 'cust') draft.signCustomer = ''; else draft.signExec = '';
          return;
        }

        if (e.target.closest('[data-addli]')) {
          readAll();
          const used = draft.lines.map(l => l.svId);
          const next = (S.get().services.filter(s => used.indexOf(s.id) < 0)[0] || S.get().services[0] || {}).id;
          if (next) draft.lines.push(newLine(next));
          repaint(true);
          return;
        }

        const rm = e.target.closest('[data-rmli]');
        if (rm) {
          readAll();
          draft.lines.splice(Number(rm.closest('[data-li]').getAttribute('data-li')), 1);
          repaint(true);
          return;
        }

        const dq = e.target.closest('[data-dq]');
        if (dq) {
          readAll();
          const l = draft.lines[Number(dq.closest('[data-li]').getAttribute('data-li'))];
          l.qty = Math.min(120, Math.max(1, (l.qty || 1) + Number(dq.getAttribute('data-dq'))));
          repaint(true);
          return;
        }

        const dc = e.target.closest('[data-dc]');
        if (dc) {
          readAll();
          const l = draft.lines[Number(dc.closest('[data-ap]').getAttribute('data-ap'))];
          l.crew = Math.min(9, Math.max(1, (l.crew || 1) + Number(dc.getAttribute('data-dc'))));
          repaint(true);
          return;
        }

        if (e.target.closest('[data-cancel]')) {
          draft = null;
          location.hash = '#/contracts';
          return;
        }

        if (e.target.closest('[data-create]')) return create();
      });

      /* ------------------------------------------------------------ create */
      function create() {
        readAll();
        const custSig = (sig.cust && sig.cust.data) || draft.signCustomer;
        const execSig = ownerSign() || (sig.exec && sig.exec.data) || draft.signExec;

        if (!draft.clientId) { U.toast('Pick a customer', { tone: 'err' }); return; }
        if (!draft.subject.trim()) {
          U.toast('A subject is required', { tone: 'err', sub: 'It is what the customer sees on the contract' });
          U.qs('#woSubject', root).focus(); return;
        }
        if (!draft.lines.length) { U.toast('Add at least one service', { tone: 'err' }); return; }
        if (isOne()) {
          if (!draft.start) { U.toast('Pick a service date', { tone: 'err' }); return; }
          if (!draft.slot) { U.toast('Pick a service time', { tone: 'err', sub: 'It is what puts it on the calendar' }); return; }
          if (draft.slotEnd && mins(draft.slotEnd) <= mins(draft.slot)) {
            U.toast('The time window ends before it starts', {
              tone: 'err', sub: 'Set an end time later than ' + S.fmtTime(draft.slot) }); return;
          }
        } else if (Seed.daysBetween(draft.start, draft.end) < 28) {
          U.toast('The service period is too short', { tone: 'err', sub: 'Give it at least a month' }); return;
        }

        const db = S.get();
        const t = totals();
        const months = monthsOf(draft);
        const taken = db.contracts.some(x => x.id === draft.no);
        if (!taken) db.seq.contract = (db.seq.contract || 0) + 1;

        const c = {
          id: taken ? COPY[mode].prefix + new Date().getFullYear() + '-' + String(++db.seq.contract).padStart(2, '0') : draft.no,
          clientId: draft.clientId,
          quoteId: draft.quoteId || null,
          leadId: draft.leadId || null,
          refNo: draft.refNo || '',
          placeOfSupply: draft.place || '',
          discount: t.disc,
          mode: mode,
          start: draft.start,
          end: draft.end,
          months: isOne() ? 0 : months,
          freq: isOne() ? 'One-time' : '',
          serviceIds: draft.lines.map(l => l.svId),
          plan: draft.lines.map(l => ({
            svId: l.svId,
            visits: Math.max(1, l.qty || 1),
            months: lineMonths(l),
            // The agreed unit price, carried onto the contract so every
            // invoice raised from it bills what was actually signed for.
            rate: l.rate || 0,
            mins: (S.service(l.svId) || {}).mins || 60,
            dayRule: 'dom:' + Seed.dayOfMonth(l.startAt || draft.start),
            startAt: l.startAt || draft.start,
            slot: l.slot || '10:00',
            crew: l.crew || 1,
            techIds: [],
            freq: Seed.cadenceLabel(spreadOf(l).gap, l.qty || 1)
          })),
          mergeSameDay: true,
          workdaysOnly: true,
          blackout: [],
          value: Math.round(t.total),
          billing: isOne() ? 'On completion' : 'Quarterly',
          owner: draft.owner,
          techId: '',
          branch: draft.branch,
          site: (S.client(draft.clientId) || {}).addr || '',
          scope: draft.subject.trim(),
          slot: isOne() ? draft.slot : ((draft.lines[0] || {}).slot || '10:00'),
          slotEnd: isOne() ? (draft.slotEnd || addMins(draft.slot, 120)) : '',
          notes: draft.notes || '',
          terms: draft.terms.slice(),
          agreedAt: S.nowStamp(),
          signCustomer: custSig,
          signExec: execSig,
          crew: S.peakCrew(draft.lines, isOne() ? [] : Seed.planVisits(asContract()))
        };

        db.contracts.push(c);

        if (isOne()) {
          // One dated service rather than a generated series.
          db.jobs.push({
            id: S.nextId('job', 'JOB-', 4),
            type: 'One-Time',
            contractId: c.id,
            clientId: c.clientId,
            serviceIds: c.serviceIds.slice(),
            date: c.start,
            slot: c.slot,
            slotEnd: c.slotEnd,
            // The booked window is what the technician's day actually loses.
            mins: windowMins(),
            techIds: [],
            status: 'scheduled',
            priority: 'normal',
            visitNo: 1,
            ofVisits: 1,
            notes: c.scope,
            exec: null
          });
          c.totalVisits = 1;
        } else {
          S.generateVisits(c);
        }

        // Close the loop on the quotation this came from.
        let leadId = draft.leadId || null;
        if (c.quoteId) {
          const q = S.quote(c.quoteId);
          if (q) {
            q.contractId = c.id;
            if (q.status !== 'approved') q.status = 'approved';
            if (q.leadId) leadId = q.leadId;
          }
        }
        // A signed contract is the whole point of the pipeline, so the lead is
        // won here and nowhere else. Deals raised without a lead have no
        // pipeline to sit in — the contract itself is the record from now on.
        if (leadId) {
          const l = S.lead(leadId);
          if (l) {
            l.stage = 'won'; l.contractId = c.id; l.followUp = '';
            // The lead's own trail should say where it ended up.
            l.log = l.log || [];
            l.log.unshift({
              at: S.nowStamp(), by: (S.me() || {}).id || '',
              text: (isOne() ? 'Service ' : 'Contract ') + c.id + ' created \u2014 ' +
                (c.totalVisits || 1) + ' visit' + ((c.totalVisits || 1) === 1 ? '' : 's') + ' scheduled'
            });
          }
        }
        if (leadId) c.leadId = leadId;

        S.save();
        draft = null;
        U.toast((isOne() ? 'One-time service ' : 'Contract ') + c.id + ' created', {
          sub: isOne()
            ? S.fmtDate(c.start) + ', ' + S.fmtTime(c.slot) + ' – ' + S.fmtTime(c.slotEnd) + ' · ' + S.money(c.value)
            : c.totalVisits + ' visits scheduled · ' + S.money(c.value)
        });
        location.hash = isOne() ? '#/onetime' : '#/contracts/' + c.id;
        App.refresh();
      }

      // A fresh form each time the screen is opened from the list.
      if (!draft.lines.length && ctx && ctx.seedService) draft.lines.push(newLine(ctx.seedService));
    },

    /** Called by the contracts list so each visit to the page starts clean. */
    reset() { draft = null; },

    /** Open the form directly in a known mode. */
    start(kind, pre) {
      mode = kind === 'onetime' ? 'onetime' : 'amc';
      draft = null;
      pending = pre || null;
      // App.go re-routes even when the hash already points here, so switching
      // type while the form is open actually redraws it.
      App.go('#/contract-new');
    },

    /**
     * The single way in. Contract or one-time service is the first decision,
     * and everything after it is the same form — so it is asked once, here,
     * rather than being three separate screens that drift apart.
     */
    choose(pre) {
      // AMC or one-time was settled when the quotation was raised. Asking a
      // second time is how the two answers drift apart, so it is not asked.
      const q = pre && pre.quote;
      if (q && q.mode) return V['contract-new'].start(q.mode === 'onetime' ? 'onetime' : 'amc', pre);

      U.modal({
        title: 'Move to contract',
        sub: 'Both are built on the same form — this only decides how the visits are scheduled',
        size: 'md',
        body: `<div class="grid grid-2 g-14">
          <button class="card card-int card-pad" type="button" data-kind="amc" style="text-align:left">
            <div class="tile-ico lg i-brand mb-12">${ico('shield')}</div>
            <div class="fw-7" style="font-size:15px">AMC contract</div>
            <div class="t-sm muted mt-6" style="line-height:1.6">Recurring services over a period. Each
              service is delivered a number of times, spread across the term, and every visit is
              generated onto the calendar.</div>
          </button>
          <button class="card card-int card-pad" type="button" data-kind="onetime" style="text-align:left">
            <div class="tile-ico lg i-violet mb-12">${ico('zap')}</div>
            <div class="fw-7" style="font-size:15px">One-time service</div>
            <div class="t-sm muted mt-6" style="line-height:1.6">A single service on one date and time.
              Same commercial detail and signatures, one visit on the calendar.</div>
          </button>
        </div>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button>`,
        onMount(root, close) {
          root.addEventListener('click', e => {
            const b = e.target.closest('[data-kind]');
            if (!b) return;
            close();
            V['contract-new'].start(b.getAttribute('data-kind'), pre);
          });
        }
      });
    }
  };
})(window);
