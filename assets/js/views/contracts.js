/* ==========================================================================
   View: AMC Contracts — list, detail, visit schedule, renewal, billing
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'active';
  let query = '';
  const FREQS = ['Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

  /* =================================================================== list */
  /** Contracts seeded before the split have no mode; they are all AMC. */
  function isOneTime(c) { return c && c.mode === 'onetime'; }

  /**
   * Everything sold, in one shape. Contracts are the obvious half; the other
   * half is services booked directly against a customer without a contract
   * behind them — they are still one-time work, so leaving them out made the
   * One-time tab read zero while the module showed sixty.
   */
  function everything() {
    const out = S.get().contracts.map(c => {
      const pr = S.contractProgress(c);
      const st = S.contractStatus(c);
      const next = pr.jobs.filter(j => j.status !== 'completed' && S.dayDelta(j.date) >= 0)[0];
      return {
        key: c.id, one: isOneTime(c), href: '#/contracts/' + c.id,
        clientId: c.clientId, tech: c.techId,
        shortCrew: (c.plan || []).length ? S.staffing(c).missing : 0,
        services: c.serviceIds || [],
        start: c.start, end: c.end, slot: c.slot,
        planText: isOneTime(c) ? '' : S.planSummary(c, true),
        done: pr.done, total: pr.total, pct: pr.pct,
        value: c.value || 0,
        statusKey: isOneTime(c) ? (pr.done >= pr.total ? 'done' : 'booked') : st.key,
        statusLabel: isOneTime(c) ? (pr.done >= pr.total ? 'Done' : 'Booked') : st.label,
        statusCls: isOneTime(c) ? (pr.done >= pr.total ? 'b-green' : 'b-blue') : st.cls,
        next: next ? next.date : ''
      };
    });

    S.get().jobs.filter(j => !j.contractId).forEach(j => {
      const done = j.status === 'completed';
      out.push({
        key: j.id, one: true, href: '#/jobs/' + j.id, standalone: true,
        clientId: j.clientId, tech: (j.techIds || [])[0] || '',
        services: j.serviceIds || [],
        start: j.date, end: j.date, slot: j.slot,
        planText: '',
        done: done ? 1 : 0, total: 1, pct: done ? 100 : 0,
        value: (j.serviceIds || []).reduce((a, id) => a + ((S.service(id) || {}).price || 0), 0),
        statusKey: done ? 'done' : (j.status === 'cancelled' ? 'expired' : 'booked'),
        statusLabel: done ? 'Done' : (S.JOB_STATUS[j.status] || {}).label || 'Booked',
        statusCls: done ? 'b-green' : (S.JOB_STATUS[j.status] || {}).cls || 'b-blue',
        next: done ? '' : j.date
      });
    });

    return out;
  }

  function rowsFor(all) {
    const q = query.toLowerCase();
    return all.filter(r => {
      // Category tabs and status tabs live in the same strip.
      if (tab === 'amc' && r.one) return false;
      if (tab === 'onetime' && !r.one) return false;
      if (tab === 'active' && r.statusKey === 'expired') return false;
      if (tab === 'expiring' && r.statusKey !== 'expiring') return false;
      if (tab === 'expired' && r.statusKey !== 'expired') return false;
      if (!q) return true;
      return (r.key + S.clientName(r.clientId)).toLowerCase().indexOf(q) >= 0;
    }).sort((a, b) => (a.end || '') < (b.end || '') ? 1 : -1);
  }

  function renderList(ctx) {
    const all = everything();
    const counts = {
      all: all.length,
      active: all.filter(r => r.statusKey !== 'expired').length,
      expiring: all.filter(r => r.statusKey === 'expiring').length,
      expired: all.filter(r => r.statusKey === 'expired').length,
      amc: all.filter(r => !r.one).length,
      onetime: all.filter(r => r.one).length
    };
    const rows = rowsFor(all);
    const arr = all.filter(r => r.statusKey !== 'expired').reduce((s, r) => s + r.value, 0);

    return C.pageHead({
      title: 'Contracts',
      sub: counts.amc + ' AMC · ' + counts.onetime + ' one-time · ' + S.money(arr) + ' live value',
      actions: `<button class="btn btn-primary btn-sm" data-new>${ico('plus')} New contract</button>`
    }) +

    // Same four-stat opening as the AMC and One-time service lists, so the
    // three screens in this group read as one family.
    `<div class="grid grid-4 mb-20">
      ${C.stat({ label: 'Live contracts', value: counts.active, icon: 'shield', tone: 'i-brand',
        foot: counts.all + ' on the books all time' })}
      ${C.stat({ label: 'Annual value', value: S.moneyShort(arr), icon: 'rupee', tone: 'i-violet',
        foot: 'Across every live contract' })}
      ${C.stat({ label: 'Expiring soon', value: counts.expiring, icon: 'clock',
        tone: counts.expiring ? 'i-amber' : 'i-green', foot: counts.expiring ? 'Within 30 days — send renewals' : 'Nothing due to renew' })}
      ${C.stat({ label: 'Visits scheduled', value: all.reduce((n, c) => n + (c.totalVisits || 0), 0),
        icon: 'calcheck', tone: 'i-blue', foot: 'Generated from the service plans' })}
    </div>` +

    C.tabsBar([
      { id: 'active', label: 'Live', n: counts.active },
      { id: 'expiring', label: 'Expiring soon', n: counts.expiring },
      { id: 'expired', label: 'Expired', n: counts.expired },
      { id: 'amc', label: 'AMC', n: counts.amc },
      { id: 'onetime', label: 'One-time', n: counts.onetime },
      { id: 'all', label: 'All', n: counts.all }
    ], tab) +
    `<div class="mt-16">` + C.searchRow('Search by contract number, customer or site…', '', 'cq') + `</div>` +

    (rows.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th>Contract</th><th>Customer</th><th>Type &amp; status</th><th>Scheduled</th>
        <th>Services</th><th>Progress</th><th class="r">Value</th><th>Next</th>
      </tr></thead>
      <tbody>${rows.map(r => {
        const cl = S.client(r.clientId);
        return `<tr class="clickable" data-go="${attr(r.href)}">
          <td class="nowrap">
            <div class="fw-6 mono t-sm">${esc(r.key)}</div>
            <div class="t-xs ${r.shortCrew ? 'warn fw-6' : 'muted'}">${r.shortCrew
              ? ico('alert', '', 11) + ' ' + r.shortCrew + ' to assign'
              : esc(r.tech ? S.userName(r.tech) : 'No technician')}</div>
          </td>
          <td>
            <div class="row g-8" style="min-width:0">
              ${U.avatarName(cl ? cl.name : '?', cl ? cl.color : '', 'av-xs')}
              <div style="min-width:0">
                <div class="truncate fw-6">${esc(cl ? cl.name : '—')}</div>
                <div class="truncate t-xs muted">${esc((cl && cl.city) || '')}</div>
              </div>
            </div>
          </td>
          <td class="nowrap">
            <span class="badge ${r.one ? 'b-violet' : 'b-brand'}">${r.one ? 'One-time' : 'AMC'}</span>
            <div class="mt-4"><span class="badge ${r.statusCls}"><i class="pip"></i>${esc(r.statusLabel)}</span></div>
          </td>
          <td class="nowrap">
            ${r.one
              ? `<div class="fw-6 t-sm">${esc(r.start ? S.fmtDate(r.start) : 'No date')}</div>
                 <div class="t-xs muted">${esc(r.slot ? S.fmtTime(r.slot) : '—')}</div>`
              : `<div class="fw-6 t-sm">${esc(r.planText)}</div>
                 <div class="t-xs muted">${esc(S.fmtShort(r.start))} → ${esc(S.fmtDate(r.end))}</div>`}
          </td>
          <td class="nowrap">
            <div class="row g-4">
              ${r.services.slice(0, 2).map(x =>
                `<span class="badge b-gray">${esc((S.service(x) || {}).code || '')}</span>`).join('')}
              ${r.services.length > 2
                ? `<span class="badge b-gray" title="${attr(r.services.map(x => (S.service(x) || {}).name || '').join(', '))}">+${r.services.length - 2}</span>` : ''}
            </div>
          </td>
          <td style="min-width:118px">
            <div class="t-sm fw-6">${r.done} <span class="muted fw-5">of ${r.total}</span></div>
            ${U.bar(r.pct)}
          </td>
          <td class="r fw-7 nowrap">${S.moneyShort(r.value)}</td>
          <td class="nowrap ${r.next ? 'brand fw-6' : 'muted'}">${r.next ? esc(S.relDay(r.next)) : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`
    : U.empty({ icon: 'shield', title: 'No contracts in this view',
        text: 'Create one with New contract, or approve a quotation to generate it.' }));
  }

  /* ============================================================ plan builder */
  /**
   * Everything about editing a contract's service plan. The same markup is
   * used when creating a contract and when changing one that is already
   * running, so the two can never drift apart.
   */
  const COLS = 'flex:1.5;min-width:0';

  function planHead() {
    return `<div class="row g-8" style="padding:9px 12px;background:var(--surface-2);
      border-bottom:1px solid var(--line);font-size:10px;font-weight:700;
      letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2)">
      <span style="${COLS}">Service</span>
      <span style="width:58px;flex:none">Visits</span>
      <span style="width:64px;flex:none">Months</span>
      <span style="width:56px;flex:none">Day</span>
      <span style="width:92px;flex:none">Time</span>
      <span style="width:74px;flex:none">Crew</span>
    </div>`;
  }

  function planRow(line, techs, c) {
    const svc = S.service(line.svId) || {};
    const sp = Seed.lineSpread(line, c);
    const day = (/^dom:(\d{1,2})$/.exec(line.dayRule || '') || [])[1] || '1';
    return `<div class="row g-8" data-line="${attr(line.svId)}"
        style="padding:9px 12px;border-bottom:1px solid var(--line)">
      <div style="${COLS}">
        <div class="fw-6 t-base truncate">${esc(svc.name || line.svId)}</div>
        <div class="t-xs muted">${esc(svc.code || '')} · ${esc(S.durationText(line.mins))} ·
          <span class="brand fw-6">${esc(Seed.cadenceLabel(sp.gap, sp.visits).toLowerCase())}</span>${sp.visits > 1 ? ' · every ' + Math.round(sp.gap) + ' days' : ''}</div>
      </div>
      <input class="input" data-v type="number" min="1" max="120" value="${attr(line.visits)}"
        style="width:58px;flex:none;height:32px;font-size:12.5px;padding:0 6px;text-align:center">
      <input class="input" data-m type="number" min="1" max="60" value="${attr(line.months || c.months || 12)}"
        style="width:64px;flex:none;height:32px;font-size:12.5px;padding:0 6px;text-align:center">
      <input class="input" data-d type="number" min="1" max="31" value="${attr(day)}"
        style="width:56px;flex:none;height:32px;font-size:12.5px;padding:0 6px;text-align:center">
      <input class="input" data-s type="time" value="${attr(line.slot)}"
        style="width:92px;flex:none;height:32px;font-size:12px;padding:0 6px">
      <input class="input" data-c type="number" min="1" max="9" value="${attr(Math.max(1, line.crew || 1))}"
        title="How many technicians this service takes"
        style="width:74px;flex:none;height:32px;font-size:12.5px;padding:0 6px;text-align:center">
    </div>`;
  }

  /**
   * Who is on a service, against how many it takes. A service short of people
   * says so plainly here rather than only being missing.
   */
  function crewCell(l) {
    const need = Math.max(1, l.crew || 1);
    const have = Seed.lineCrew(l);
    if (!have.length) {
      return `<span class="badge b-amber">${ico('alert')}None of ${need}</span>`;
    }
    const stack = `<span class="row g-6 center-y">${C.techStack(have)}` +
      `<span class="t-sm ${have.length === need ? 'muted' : 'warn fw-6'}">${have.length} of ${need}</span></span>`;
    if (have.length < need) {
      return stack + `<div class="t-xs" style="color:var(--warn-700);font-weight:600;margin-top:2px">${ico('alert', '', 11)} ${need - have.length} more needed</div>`;
    }
    // Should be unreachable now that lineCrew clamps, but legacy data that
    // somehow reaches this view must not read as fine.
    if (have.length > need) {
      return stack + `<div class="t-xs" style="color:var(--warn-700);font-weight:600;margin-top:2px">${ico('alert', '', 11)} ${have.length - need} too many</div>`;
    }
    return stack;
  }

  function planTable(c, techs) {
    if (!c.plan || !c.plan.length) {
      return `<div class="banner ban-amber">${ico('alert')}<div>Tick at least one service — the plan is built from the services the contract covers.</div></div>`;
    }
    return `<div class="card" style="padding:0;overflow-x:auto">
      <div style="min-width:660px">${planHead()}${c.plan.map(l => planRow(l, techs, c)).join('')}</div>
    </div>`;
  }

  /** Pull the on-screen values back into the plan before previewing or saving. */
  function readPlan(root, c) {
    U.qsa('[data-line]', root).forEach(row => {
      const line = (c.plan || []).find(l => l.svId === row.getAttribute('data-line'));
      if (!line) return;
      line.visits = Math.max(1, parseInt(U.qs('[data-v]', row).value, 10) || 1);
      line.months = Math.max(1, parseInt(U.qs('[data-m]', row).value, 10) || c.months || 12);
      const sp = Seed.lineSpread(line, c);
      line.freq = Seed.cadenceLabel(sp.gap, sp.visits);
      line.dayRule = 'dom:' + (Math.min(31, Math.max(1, parseInt(U.qs('[data-d]', row).value, 10) || 1)));
      line.slot = U.qs('[data-s]', row).value || '10:00';
      // How many people it takes. Who they are is set on the contract page,
      // where the current workload of each technician is visible.
      line.crew = Math.max(1, Math.min(9, parseInt(U.qs('[data-c]', row).value, 10) || 1));
      // Dropping the crew has to drop people with it. Without this, taking a
      // staffed crew-3 service down to 2 left three names on it and the
      // contract read "3 of 2".
      if ((line.techIds || []).length > line.crew) {
        line.dropped = line.techIds.slice(line.crew);
        line.techIds = line.techIds.slice(0, line.crew);
      }
    });
    return c;
  }

  /** The summary, the warnings and the first handful of dates. */
  function planPreview(c) {
    const visits = Seed.planVisits(c);
    const serviceVisits = (c.plan || []).reduce((a, l) => a + (l.visits || 0), 0);
    const merged = visits.filter(v => v.lines > 1).length;
    const warn = S.planWarnings(c, visits);
    const mins = visits.reduce((a, v) => a + v.mins, 0);

    if (!visits.length) {
      return `<div class="banner ban-red">${ico('alertcircle')}<div>This plan produces no visits. Check the frequency and visit counts.</div></div>`;
    }

    return `<div class="card card-pad" style="background:var(--surface-2)">
      <div class="row between g-10 wrap mb-10">
        <div class="fw-7 t-md">${serviceVisits} service-visits → ${visits.length} trip${visits.length === 1 ? '' : 's'}</div>
        <div class="t-sm muted">${merged} merged · ${S.durationText(mins)} on site in total</div>
      </div>
      <div class="row g-6 wrap">
        ${visits.slice(0, 8).map(v => `<span class="chip" title="${attr(v.serviceIds.map(S.svcName).join(', '))}">
          ${ico('calcheck')}${esc(S.fmtShort(v.date))}
          <span class="muted" style="margin-left:4px">${v.serviceIds.length}&nbsp;svc · ${v.mins}m</span></span>`).join('')}
        ${visits.length > 8 ? `<span class="chip" style="border-style:dashed">+ ${visits.length - 8} more</span>` : ''}
      </div>
      ${warn.length ? `<div class="col g-6 mt-12">${warn.map(x =>
        `<div class="row g-7 t-sm" style="color:var(--${x.tone === 'crit' ? 'danger' : 'warn'}-700)">
          ${ico(x.tone === 'crit' ? 'alertcircle' : 'alert', '', 14)}${esc(x.text)}</div>`).join('')}</div>` : ''}
    </div>`;
  }

  /**
   * Wire a plan table + preview together: editing a frequency recalculates the
   * visit count, and every change re-renders the preview.
   */
  function wirePlan(root, c, opts) {
    const o = opts || {};
    const wrap = U.qs(o.tableSel || '#planWrap', root);
    const prev = U.qs(o.previewSel || '#planPreview', root);
    const techs = S.get().users.filter(u => u.role === 'tech');

    function paint() {
      if (wrap) wrap.innerHTML = planTable(c, techs);
      if (prev) prev.innerHTML = planPreview(c);
    }

    function refresh() {
      readPlan(root, c);
      if (prev) prev.innerHTML = planPreview(c);
    }

    if (wrap) {
      // Visits and months are the only inputs now, so any edit just re-reads
      // the plan and repaints the cadence each row works out to.
      wrap.addEventListener('change', () => { refresh(); paint(); });
      wrap.addEventListener('input', U.debounce(() => { refresh(); paint(); }, 320));
    }

    return { paint: paint, refresh: refresh, read: () => readPlan(root, c) };
  }

  /* ================================================================= create */
  function newContract(pre) {
    const p = pre || {};
    const clients = S.get().clients;
    const techs = S.get().users.filter(u => u.role === 'tech');
    const svcs = S.get().services;

    // The contract being built, kept live so the plan and preview stay in step.
    const draft = {
      id: '', clientId: p.clientId || (clients[0] || {}).id, start: S.todayISO(),
      months: 12, slot: '10:00', techId: '', serviceIds: [], plan: [],
      mergeSameDay: true, workdaysOnly: true, blackout: []
    };
    draft.end = Seed.addMonths(draft.start, draft.months);

    const startClient = p.clientId ? S.client(p.clientId) : (clients[0] || null);

    U.modal({
      title: 'New contract',
      sub: 'Everything a quotation carries, plus the schedule — kept for your records, not sent to the customer',
      size: 'xl',
      body: `
        <div class="grid grid-2">
          ${U.field('Customer', `<select class="select" id="nClient">${clients.map(c =>
            `<option value="${attr(c.id)}"${p.clientId === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`, '', true)}
          ${U.field('Contract type', `<select class="select" id="nMode">
            <option value="amc" selected>AMC — recurring services</option>
            <option value="onetime">One-time service</option>
          </select>`, 'Decides which module it lands in and how the visits are generated.', true)}
        </div>

        <div class="mt-14" id="nPartyPanel"></div>

        <div class="grid grid-3 mt-14">
          ${U.field('Contract no.', `<input class="input mono" id="nNo" value="${attr('AMC-' + new Date().getFullYear() + '-' + String((S.get().seq.contract || 0) + 1).padStart(2, '0'))}">`)}
          ${U.field('Reference no.', `<input class="input" id="nRef" placeholder="Customer PO or enquiry ref">`)}
          ${U.field('Place of supply', `<select class="select" id="nPos">${U.selectOpts(Seed.STATES, null, null,
            (startClient && startClient.placeOfSupply) || 'Tamil Nadu')}</select>`)}
        </div>

        <div class="grid grid-2">
          ${U.field('Contract value (₹)', `<input class="input" id="nValue" type="number" step="1000" value="48000">`, 'Excluding GST.', true)}
          ${U.field('Billing cycle', `<select class="select" id="nBill">${U.selectOpts(['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], null, null, 'Quarterly')}</select>`)}
        </div>

        <div class="grid grid-3 mt-14">
          ${U.field('Service date', `<input class="input" id="nStart" type="date" value="${attr(S.todayISO())}">`,
            'AMC: the first visit. One-time: the service itself.', true)}
          ${U.field('Service time', `<input class="input" id="nSlot" type="time" value="10:00">`,
            'Required — it is what puts the service on the calendar.', true)}
          ${U.field('Duration', `<select class="select" id="nMonths">
            <option value="6">6 months</option><option value="12" selected>12 months</option>
            <option value="24">24 months</option></select>`)}
        </div>

        <div class="mt-16">${U.field('Services covered',
          `<div class="card" style="max-height:140px;overflow-y:auto;padding:8px 12px">${svcs.map(s =>
            `<label class="check" style="padding:5px 0"><input type="checkbox" name="nsvc" value="${attr(s.id)}">
             <span class="box">${ico('check')}</span><span class="txt">${esc(s.name)}
             <span class="muted">· ${esc(s.defaultFreq || 'Monthly')}</span></span></label>`).join('')}</div>`,
          'Each one becomes a row in the plan below, starting from its usual interval.', true)}</div>

        <div class="mt-16">
          <div class="flabel mb-8">Service plan</div>
          <div id="planWrap"></div>
        </div>

        <div class="row g-16 wrap mt-14">
          <label class="check"><input type="checkbox" id="nMerge" checked>
            <span class="box">${ico('check')}</span>
            <span class="txt">Merge services falling on the same day into one visit</span></label>
          <label class="check"><input type="checkbox" id="nWork" checked>
            <span class="box">${ico('check')}</span>
            <span class="txt">Skip Sundays</span></label>
        </div>

        <div class="mt-14" id="planPreview"></div>

        <div class="grid grid-2 mt-16">
          ${U.field('Scope of work', `<textarea class="textarea" id="nScope" placeholder="Which areas are covered?"></textarea>`)}
          ${U.field('Terms & conditions', `<textarea class="textarea" id="nTerms">${esc((S.get().company.terms || []).join('\n'))}</textarea>`,
            'Pre-filled from Settings — edit for this contract only.')}
        </div>
        <div class="mt-14">${U.field('Site instructions', `<input class="input" id="nNotes" placeholder="Access, timing, chemical restrictions…">`)}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('shield')} Create &amp; generate visits</button>`,

      onMount(root, close) {
        const plan = wirePlan(root, draft);

        /* -------------------------------------- who it is for, spelled out */
        function paintParty() {
          const c = S.client(U.qs('#nClient', root).value);
          const box = U.qs('#nPartyPanel', root);
          if (!c) { box.innerHTML = ''; return; }
          const b = c.billing || {};
          const addr = [b.street1, b.street2, b.city, b.pin].filter(Boolean).join(', ')
            || [c.addr, c.city, c.pin].filter(Boolean).join(', ');
          box.innerHTML = `<div class="card card-pad" style="background:var(--surface-2)">
            <div class="grid grid-2 g-24">
              <div>
                <div class="t-xs muted fw-6" style="letter-spacing:.05em">BILL TO</div>
                <div class="t-sm mt-6" style="line-height:1.65">${esc(c.name)}<br>${esc(addr || '—')}</div>
              </div>
              <div>
                <div class="t-xs muted fw-6" style="letter-spacing:.05em">GST DETAILS</div>
                <div class="t-sm mt-6" style="line-height:1.7">
                  GST treatment: <strong>${esc(c.gstTreatment || 'Not set')}</strong><br>
                  GSTIN: ${c.gstin ? `<strong class="mono">${esc(c.gstin)}</strong>`
                    : `<span class="danger">Not on file</span>`}
                </div>
              </div>
            </div>
          </div>`;
          if (c.placeOfSupply) U.qs('#nPos', root).value = c.placeOfSupply;
        }
        paintParty();
        U.qs('#nClient', root).addEventListener('change', paintParty);

        /* ------------------- a one-time service has no interval to plan */
        const modeSel = U.qs('#nMode', root);
        function syncMode() {
          const one = modeSel.value === 'onetime';
          // Renumber unless the user has typed their own reference.
          const noEl = U.qs('#nNo', root);
          const seq = String((S.get().seq.contract || 0) + 1).padStart(2, '0');
          const year = new Date().getFullYear();
          if (noEl && /^(AMC|OTS)-\d{4}-\d+$/.test(noEl.value)) {
            noEl.value = (one ? 'OTS-' : 'AMC-') + year + '-' + seq;
          }
          ['#nMonths', '#nBill'].forEach(id => {
            const f = U.qs(id, root);
            if (f && f.closest('.field')) f.closest('.field').style.display = one ? 'none' : '';
          });
          const planBox = U.qs('#planWrap', root);
          if (planBox && planBox.closest('div')) {
            planBox.parentNode.style.display = one ? 'none' : '';
          }
          const prev = U.qs('#planPreview', root);
          if (prev) prev.style.display = one ? 'none' : '';
          U.qs('[data-save]', root).innerHTML = ico('shield') +
            (one ? ' Create one-time service' : ' Create &amp; generate visits');
        }
        modeSel.addEventListener('change', syncMode);
        syncMode();

        /** Rebuild the plan rows from the ticked services, keeping any edits. */
        function syncServices() {
          const picked = U.qsa('input[name=nsvc]:checked', root).map(i => i.value);
          if (U.qsa('[data-line]', root).length) readPlan(root, draft);
          const kept = {};
          (draft.plan || []).forEach(l => { kept[l.svId] = l; });
          draft.serviceIds = picked;
          draft.plan = picked.map(id => kept[id] || Seed.planLine(S.service(id), draft));
          plan.paint();
        }

        function syncTerm() {
          const prevSlot = draft.slot;
          draft.start = U.qs('#nStart', root).value || S.todayISO();
          draft.months = parseInt(U.qs('#nMonths', root).value, 10) || 12;
          draft.slot = U.qs('#nSlot', root).value || '10:00';
          draft.end = Seed.addMonths(draft.start, draft.months);
          draft.mergeSameDay = U.qs('#nMerge', root).checked;
          draft.workdaysOnly = U.qs('#nWork', root).checked;
          // Term changes move the anchor day and the derived visit counts.
          (draft.plan || []).forEach(l => {
            l.dayRule = 'dom:' + Seed.dayOfMonth(draft.start);
            l.visits = Math.max(1, Math.round(draft.months / (Seed.FREQ_MONTHS[l.freq] || 1)));
            // A line still sitting on the old default follows the header time;
            // one the user gave its own slot in the plan grid keeps it.
            if (!l.slot || l.slot === prevSlot) l.slot = draft.slot;
          });
          plan.paint();
        }

        root.addEventListener('change', e => {
          if (e.target.name === 'nsvc') return syncServices();
          if (['nStart', 'nMonths', 'nSlot', 'nMerge', 'nWork'].indexOf(e.target.id) >= 0) return syncTerm();
        });

        plan.paint();

        U.qs('[data-save]', root).onclick = () => {
          const picked = U.qsa('input[name=nsvc]:checked', root).map(i => i.value);
          if (!picked.length) { U.toast('Pick at least one service', { tone: 'err' }); return; }

          // The whole point of a contract here is that it lands on the
          // calendar, so neither the date nor the time is optional.
          const date = U.qs('#nStart', root).value;
          const time = U.qs('#nSlot', root).value;
          if (!date) { U.toast('Pick a service date', { tone: 'err', sub: 'It is what puts this on the calendar' }); return; }
          if (!time) { U.toast('Pick a service time', { tone: 'err', sub: 'It is what puts this on the calendar' }); return; }

          const oneTime = U.qs('#nMode', root).value === 'onetime';
          readPlan(root, draft);
          // Re-derive the plan from the header fields rather than trusting the
          // change event to have fired — saving must never use a stale anchor.
          syncTerm();

          const db = S.get();
          db.seq.contract = (db.seq.contract || 0) + 1;
          const clientId = U.qs('#nClient', root).value;
          const typed = U.qs('#nNo', root).value.trim();
          const auto = (oneTime ? 'OTS-' : 'AMC-') + new Date().getFullYear() + '-' +
            String(db.seq.contract).padStart(2, '0');

          const c = {
            id: typed && !db.contracts.some(x => x.id === typed) ? typed : auto,
            clientId: clientId,
            quoteId: p.quoteId || null,
            mode: oneTime ? 'onetime' : 'amc',
            start: date,
            months: oneTime ? 0 : draft.months,
            end: oneTime ? date : draft.end,
            freq: oneTime ? 'One-time' : ((draft.plan[0] || {}).freq || 'Monthly'),
            serviceIds: picked,
            plan: oneTime ? [] : draft.plan,
            mergeSameDay: draft.mergeSameDay,
            workdaysOnly: draft.workdaysOnly,
            blackout: [],
            value: parseFloat(U.qs('#nValue', root).value) || 0,
            billing: oneTime ? 'On completion' : U.qs('#nBill', root).value,
            owner: (S.me() || {}).id || 'U02',
            techId: (draft.plan.find(l => l.techId) || {}).techId || '',
            site: (S.client(clientId) || {}).addr || '',
            scope: U.qs('#nScope', root).value.trim() || 'As per agreed scope of work.',
            slot: time,
            notes: U.qs('#nNotes', root).value.trim(),
            refNo: U.qs('#nRef', root).value.trim(),
            placeOfSupply: U.qs('#nPos', root).value,
            terms: U.qs('#nTerms', root).value.split('\n').map(x => x.trim()).filter(Boolean),
            // Raised straight from a customer, so nothing was ever sent out.
            shared: false
          };
          c.plan.forEach(l => { l.slot = l.slot || c.slot; });
          db.contracts.push(c);

          let made;
          if (oneTime) {
            // One dated service, not a generated series.
            made = [{
              id: S.nextId('job', 'JOB-', 4),
              type: 'One-Time',
              // Linked to its contract, same as an AMC visit — the two modules
              // split on the contract's category, not on whether a link exists.
              contractId: c.id,
              clientId: clientId,
              serviceIds: picked.slice(0, 2),
              date: date,
              slot: time,
              mins: 90,
              techIds: c.techId ? [c.techId] : [],
              status: 'scheduled',
              priority: 'normal',
              notes: c.notes,
              exec: null
            }];
            db.jobs.push(made[0]);
            c.totalVisits = 1;
          } else {
            made = S.generateVisits(c);
          }

          S.save(); close();
          U.toast('Contract ' + c.id + ' created', {
            sub: oneTime
              ? 'Service booked ' + S.fmtDate(date) + ' at ' + S.fmtTime(time)
              : made.length + ' visits scheduled from ' + S.fmtDate(date)
          });
          location.hash = oneTime ? '#/onetime' : '#/contracts/' + c.id;
          App.refresh();
        };
      }
    });
  }

  /* =========================================================== edit the plan */
  function editPlan(c, ctx) {
    // Work on a copy so Cancel really cancels.
    const draft = JSON.parse(JSON.stringify(c));

    U.modal({
      title: 'Service plan · ' + c.id,
      sub: 'Change an interval and see exactly what happens before it is applied',
      size: 'lg',
      body: `
        <div id="planWrap"></div>
        <div class="row g-16 wrap mt-14">
          <label class="check"><input type="checkbox" id="pMerge" ${draft.mergeSameDay !== false ? 'checked' : ''}>
            <span class="box">${ico('check')}</span>
            <span class="txt">Merge services falling on the same day into one visit</span></label>
          <label class="check"><input type="checkbox" id="pWork" ${draft.workdaysOnly !== false ? 'checked' : ''}>
            <span class="box">${ico('check')}</span>
            <span class="txt">Skip Sundays</span></label>
        </div>
        <div class="mt-14" id="planPreview"></div>
        <div class="mt-14" id="planDiff"></div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-apply>${ico('calcheck')} Apply to schedule</button>`,

      onMount(root, close) {
        const plan = wirePlan(root, draft);

        function diffBox() {
          readPlan(root, draft);
          draft.mergeSameDay = U.qs('#pMerge', root).checked;
          draft.workdaysOnly = U.qs('#pWork', root).checked;
          const d = S.planDiff(draft);
          const nothing = !d.add.length && !d.update.length && !d.remove.length;
          U.qs('#planDiff', root).innerHTML = `<div class="banner ${nothing ? 'ban-brand' : 'ban-amber'}">
            ${ico(nothing ? 'info' : 'alert')}<div>
            <div class="bt">${nothing ? 'No change to the schedule' : 'Applying this will change the schedule'}</div>
            ${d.add.length ? `<strong>${d.add.length}</strong> visit${d.add.length === 1 ? '' : 's'} added · ` : ''}
            ${d.update.length ? `<strong>${d.update.length}</strong> updated · ` : ''}
            ${d.remove.length ? `<strong>${d.remove.length}</strong> removed · ` : ''}
            <strong>${d.frozen.length}</strong> completed visit${d.frozen.length === 1 ? '' : 's'} left untouched.</div></div>`;
        }

        const wrap = U.qs('#planWrap', root);
        wrap.addEventListener('change', () => setTimeout(diffBox, 0));
        wrap.addEventListener('input', U.debounce(diffBox, 300));
        U.qs('#pMerge', root).addEventListener('change', () => { plan.refresh(); diffBox(); });
        U.qs('#pWork', root).addEventListener('change', () => { plan.refresh(); diffBox(); });

        plan.paint();
        diffBox();

        U.qs('[data-apply]', root).onclick = () => {
          readPlan(root, draft);
          c.plan = draft.plan;
          c.mergeSameDay = U.qs('#pMerge', root).checked;
          c.workdaysOnly = U.qs('#pWork', root).checked;
          c.serviceIds = c.plan.map(l => l.svId);
          const r = S.applyPlan(c);

          // Anybody the crew change pushed off a service is named, not vanished.
          const cut = [];
          (c.plan || []).forEach(function (l) {
            (l.dropped || []).forEach(function (id) { if (cut.indexOf(id) < 0) cut.push(id); });
            delete l.dropped;
          });
          if (cut.length) {
            U.toast(cut.map(S.userName).join(', ') + ' came off a service', {
              tone: 'warn', sub: 'The crew size was lowered below the number assigned' });
          }

          close();
          if (ctx && ctx.refresh) ctx.refresh(); else App.refresh();
          U.toast('Schedule updated', {
            sub: r.added + ' added · ' + r.updated + ' updated · ' + r.removed + ' removed · ' + r.frozen + ' completed kept'
          });
        };
      }
    });
  }

  /* ================================================================= detail */
  V.contractsDetail = {
    title: ctx => (S.contract(ctx.id) || {}).id || 'Contract',
    crumb: 'AMC Contracts',
    render(ctx) {
      const c = S.contract(ctx.id);
      if (!c) return C.backLink('#/contracts', 'All contracts') +
        U.empty({ icon: 'shield', title: 'Contract not found', text: 'It may have been removed.' });
      const cl = S.client(c.clientId);
      const p = S.contractProgress(c);
      const st = S.contractStatus(c);
      const invs = S.get().invoices.filter(i => i.contractId === c.id);
      const unbilled = S.uninvoicedVisits(c);
      const billed = invs.reduce((s, i) => s + S.invoiceTotals(i).total, 0);
      const collected = invs.reduce((s, i) => s + S.invoiceTotals(i).paid, 0);
      const daysLeft = S.dayDelta(c.end);
      const canManage = ['admin', 'ops'].indexOf(ctx.role) >= 0;

      return C.backLink('#/contracts', 'All contracts') +
      `<div class="row between wrap g-12 mb-20">
        <div class="row g-12" style="min-width:0">
          ${U.avatarName(cl ? cl.name : '?', cl ? cl.color : '', 'av-lg')}
          <div style="min-width:0">
            <div class="row g-8 wrap">
              <h2 class="truncate">${esc(cl ? cl.name : '—')}</h2>
              ${C.contractPill(c)}
            </div>
            <div class="muted t-base mt-2">${esc(c.id)} · ${esc(S.planSummary(c))} · ${esc(c.billing)} billing · ${S.money(c.value)} / year</div>
          </div>
        </div>
        ${canManage ? `<div class="row g-8 wrap">
          <button class="btn btn-ghost btn-sm" data-act="plan">${ico('calcheck')} Service plan</button>
          <button class="btn btn-ghost btn-sm" data-act="assign">${ico('hardhat')} Assign technician</button>
          ${isOneTime(c)
            ? `<button class="btn btn-ghost btn-sm" data-act="invoice">${ico('receipt')} Raise invoice</button>`
            : `<span class="t-sm muted nowrap" title="An AMC is billed visit by visit from the schedule below">${ico('receipt', '', 14)} Billed per visit</span>`}
          ${daysLeft <= 45 ? `<button class="btn btn-primary btn-sm" data-act="renew">${ico('refresh')} Renew contract</button>` : ''}
        </div>` : ''}
      </div>

      ${daysLeft <= 30 && daysLeft >= 0 ? `<div class="banner ban-amber mb-16">${ico('alert')}
        <div><div class="bt">Contract expires in ${daysLeft} days</div>
        Send the renewal quotation now so service continues without a gap.</div></div>` : ''}
      ${daysLeft < 0 ? `<div class="banner ban-red mb-16">${ico('alertcircle')}
        <div><div class="bt">This contract expired on ${esc(S.fmtDate(c.end))}</div>
        Visits are no longer generated. Renew to resume service.</div></div>` : ''}

      <div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Visits completed', value: p.done + '<span style="font-size:17px;color:var(--muted-2)">/' + p.total + '</span>',
          icon: 'calcheck', tone: 'i-brand', foot: p.pct + '% of the contract delivered' })}
        ${C.stat({ label: 'Contract value', value: S.moneyShort(c.value), icon: 'rupee', tone: 'i-violet', foot: esc(c.billing) + ' billing cycle' })}
        ${C.stat({ label: 'Billed to date', value: S.moneyShort(billed), icon: 'receipt', tone: 'i-blue', foot: invs.length + ' invoices raised' })}
        ${C.stat({ label: 'Days remaining', value: Math.max(0, daysLeft), icon: 'clock', tone: daysLeft <= 30 ? 'i-amber' : 'i-green',
          foot: 'Ends ' + esc(S.fmtDate(c.end)) })}
      </div>

      ${(function () {
        const st = S.staffing(c);
        if (!c.plan || !c.plan.length || st.ok) return '';
        return `<div class="banner ban-amber mb-16">${ico('alert')}<div>
          <div class="bt">${st.missing} technician${st.missing === 1 ? '' : 's'} still to be assigned</div>
          ${st.short.map(r => esc(r.name) + ' needs ' + r.short + ' more of ' + r.need).join(' · ')}.
          Visits will go out with nobody on them until this is done.
          ${canManage ? `<div class="mt-10"><button class="btn btn-primary btn-sm" data-act="assign">${ico('hardhat')} Assign technicians</button></div>` : ''}
        </div></div>`;
      })()}

      ${C.sectionCard('Service plan',
        (c.plan && c.plan.length) ? `<div class="tablewrap"><table class="tbl">
          <thead><tr><th>Service</th><th>Every</th><th class="r">Visits</th><th>Day</th><th>Time</th><th class="c">Crew</th><th>Technicians</th><th class="r">On site</th></tr></thead>
          <tbody>${c.plan.map(l => {
            const sv = S.service(l.svId) || {};
            const day = (/^dom:(\d{1,2})$/.exec(l.dayRule || '') || [])[1];
            return `<tr>
              <td><div class="fw-6">${esc(sv.name || l.svId)}</div><div class="t-sm muted mono">${esc(sv.code || '')}</div></td>
              <td><span class="badge b-blue">${esc(l.freq)}</span></td>
              <td class="r fw-6">${l.visits}</td>
              <td class="t-base">${day ? esc(day) + (day === '1' ? 'st' : day === '2' ? 'nd' : day === '3' ? 'rd' : 'th') : '—'}</td>
              <td class="t-base">${esc(S.fmtTime(l.slot))}</td>
              <td class="c fw-6">${Math.max(1, l.crew || 1)}</td>
              <td>${crewCell(l)}</td>
              <td class="r t-base">${esc(S.durationText(l.mins))}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        <div class="row between g-10 wrap card-pad" style="border-top:1px solid var(--line)">
          <div class="t-sm muted">
            ${c.plan.reduce((a, l) => a + (l.visits || 0), 0)} service-visits →
            <strong>${p.total} trip${p.total === 1 ? '' : 's'}</strong>
            ${c.mergeSameDay !== false ? ' · same-day services merged' : ' · one visit per service'}
            ${c.workdaysOnly !== false ? ' · Sundays skipped' : ''}
          </div>
          ${canManage ? `<button class="btn btn-soft btn-sm" data-act="plan">${ico('pen')} Edit plan</button>` : ''}
        </div>`
        : `<div class="banner ban-amber">${ico('alert')}<div>
            <div class="bt">This contract has no service plan yet</div>
            It was created before per-service scheduling existed. Open the plan editor to build one from the services it covers.</div></div>
           ${canManage ? `<button class="btn btn-primary btn-sm mt-12" data-act="plan">${ico('calcheck')} Build the plan</button>` : ''}`,
        '', { flush: true })}

      <div class="grid mb-20 mt-20 split-flip">
        ${C.sectionCard('Visit schedule',
          `<div class="tablewrap"><table class="tbl">
            <thead><tr><th style="width:52px">Visit</th><th>Scheduled</th><th>Services due</th><th>Technician</th><th>Status</th><th>Billing</th></tr></thead>
            <tbody>${p.jobs.map(j => {
              const inv = S.invoiceForJob(j.id);
              const block = S.billBlock(j);
              return `<tr class="clickable" data-go="#/jobs/${j.id}">
              <td><span class="badge ${j.status === 'completed' ? 'b-green' : 'b-gray'}">${j.visitNo || '—'}</span></td>
              <td><div class="fw-6">${esc(S.fmtDate(j.date))}</div><div class="t-sm muted">${esc(S.fmtTime(j.slot))} · ${esc(S.durationText(j.mins))}</div></td>
              <td class="t-sm" style="max-width:200px">
                <div class="row g-4 wrap">${(j.serviceIds || []).map(id =>
                  `<span class="badge b-gray" title="${attr(S.svcName(id))}">${esc((S.service(id) || {}).code || id)}</span>`).join('')}</div>
                ${(j.serviceIds || []).length > 1 ? `<div class="t-xs muted mt-2">${(j.serviceIds || []).length} services, one trip</div>` : ''}</td>
              <td>${C.techStack(j.techIds)}</td>
              <td>${C.jobStatus(j)}</td>
              <td class="nowrap">${inv
                ? `<a class="badge ${S.INV_STATUS[inv.status].cls}" href="#/invoices/${attr(inv.id)}"
                     title="${attr(inv.id + ' · ' + S.INV_STATUS[inv.status].label)}">${esc(inv.id)}</a>`
                : (block
                    ? `<span class="t-xs muted" title="${attr(block)}">Not billable yet</span>`
                    : `<button class="btn btn-soft btn-sm nowrap" data-bill="${attr(j.id)}">${ico('receipt', '', 13)} Raise invoice</button>`)}</td>
            </tr>`; }).join('')}</tbody>
          </table></div>`,
          `<span class="badge b-brand">${p.done}/${p.total}</span>`, { flush: true })}

        <div class="col g-16">
          ${C.sectionCard('Contract details', C.kv([
            ['Contract no.', c.id],
            ['Period', S.fmtDate(c.start) + ' → ' + S.fmtDate(c.end)],
            ['Schedule', S.planSummary(c) + ' — ' + p.total + ' visit' + (p.total === 1 ? '' : 's')],
            ['Billing', c.billing],
            ['Services', c.serviceIds.map(S.svcName).join(', ')],
            ['Site', c.site],
            ['Technicians', (function () {
              const st = S.staffing(c);
              const all = [];
              st.rows.forEach(r => r.have.forEach(id => { if (all.indexOf(id) < 0) all.push(id); }));
              if (!all.length) return 'Nobody assigned yet';
              return all.map(id => S.userName(id)).join(', ') +
                (st.ok ? '' : ' — ' + st.missing + ' still needed');
            })()],
            ['Managed by', S.userName(c.owner)],
            c.quoteId ? ['From quotation', '<a class="brand fw-6" href="#/quotations/' + attr(c.quoteId) + '">' + esc(c.quoteId) + '</a>', true] : null
          ]))}

          ${C.sectionCard('Scope of work',
            `<div style="font-size:13px;line-height:1.65;color:var(--ink-2)">${esc(c.scope)}</div>
             ${c.notes ? `<div class="banner ban-amber mt-12">${ico('info')}<div><div class="bt">Site instructions</div>${esc(c.notes)}</div></div>` : ''}`)}

          ${C.sectionCard('Billing history',
            (unbilled.length ? `<div class="banner ban-amber mb-12">${ico('receipt')}<div>
              <div class="bt">${unbilled.length} completed visit${unbilled.length === 1 ? '' : 's'} not billed yet</div>
              Raise them from the Billing column on the visit schedule.</div></div>` : '') +
            (invs.length ? `<div class="col">${invs.map(i => {
              const t = S.invoiceTotals(i);
              const covers = (i.jobIds || []).length;
              return `<a class="row between g-10" href="#/invoices/${i.id}" style="padding:9px 0;border-bottom:1px solid var(--line)">
                <div style="min-width:0"><div class="fw-6 t-base">${esc(i.id)}</div>
                <div class="t-sm muted truncate">${esc(S.fmtDate(i.date))} · ${esc(i.period)}${
                  covers ? ' · ' + covers + ' visit' + (covers === 1 ? '' : 's') : ''}</div></div>
                <div style="text-align:right"><div class="fw-7">${S.money(t.total)}</div>
                <span class="badge ${S.INV_STATUS[i.status].cls}" style="height:18px;font-size:10px">${esc(S.INV_STATUS[i.status].label)}</span></div>
              </a>`;
            }).join('')}
            <div class="row between mt-12 t-base"><span class="muted">Billed</span><strong>${S.money(billed)}</strong></div>
            <div class="row between mt-6 t-base"><span class="muted">Collected</span><strong class="brand">${S.money(collected)}</strong></div>
            <div class="row between mt-6 t-base"><span class="muted">Outstanding</span><strong class="${billed - collected > 0 ? 'danger' : ''}">${S.money(Math.max(0, billed - collected))}</strong></div>`
            : `<div class="t-sm muted">No invoices raised against this contract yet.</div>`))}
        </div>
      </div>`;
    },
    mount(root, ctx) {
      const c = S.contract(ctx.id);
      if (!c) return;

      /**
       * Show what is about to be billed before billing it. The old button
       * created an invoice the instant it was pressed, with no way back.
       */
      function confirmInvoice(lines, period, create) {
        const sub = lines.reduce((a, l) => a + l.qty * l.rate, 0);
        const t = S.taxSplit(sub, S.supplyState({ clientId: c.clientId }));
        U.modal({
          title: 'Raise invoice',
          sub: S.clientName(c.clientId) + ' · ' + period,
          size: 'md',
          body: `<div class="tablewrap"><table class="tbl">
              <thead><tr><th>Service</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
              <tbody>${lines.map(l => `<tr>
                <td class="fw-6">${esc(l.name)}</td>
                <td class="c">${l.qty}</td>
                <td class="r">${S.money(l.rate)}</td>
                <td class="r fw-6">${S.money(l.qty * l.rate)}</td>
              </tr>`).join('')}</tbody>
            </table></div>
            <div class="card card-pad mt-14" style="background:var(--surface-2)">
              <div class="row between t-base mb-6"><span class="muted">Subtotal</span><strong>${S.money(sub)}</strong></div>
              ${S.taxRows(t).map(r => `<div class="row between t-base mb-6">
                <span class="muted">${esc(r[0])}</span><strong>${S.money(r[1])}</strong></div>`).join('')}
              <div class="divider mb-6"></div>
              <div class="row between"><strong>Total</strong><strong class="t-lg brand">${S.money(sub + t.gst)}</strong></div>
            </div>
            <div class="fhint">Rates come from this contract, not the current catalogue price.</div>`,
          footer: `<button class="btn btn-ghost" data-close>Cancel</button>
                   <button class="btn btn-primary" data-go>${ico('receipt')} Raise invoice</button>`,
          onMount(mroot, close) {
            U.qs('[data-go]', mroot).onclick = () => {
              const inv = create();
              close();
              U.toast('Invoice ' + inv.id + ' raised', {
                sub: S.clientName(c.clientId) + ' · due ' + S.fmtDate(inv.due)
              });
              location.hash = '#/invoices/' + inv.id;
              App.refresh();
            };
          }
        });
      }

      root.addEventListener('click', e => {
        // Sits inside a clickable row, so it has to be caught before it.
        const bill = e.target.closest('[data-bill]');
        if (bill) {
          e.preventDefault();
          e.stopPropagation();
          const j = S.job(bill.getAttribute('data-bill'));
          const why = S.billBlock(j);
          if (why) { U.toast('Not billable', { tone: 'err', sub: why }); return; }
          confirmInvoice(S.linesFor(c, j.serviceIds),
            'Visit ' + (j.visitNo || '') + ' — ' + S.fmtDate(j.date),
            () => S.invoiceFromVisit(j));
          return;
        }

        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');

        if (a === 'plan') {
          if (!c.plan || !c.plan.length) {
            c.plan = S.defaultPlan(c);
            c.mergeSameDay = c.mergeSameDay !== false;
            c.workdaysOnly = c.workdaysOnly !== false;
          }
          editPlan(c, ctx);
          return;
        }

        if (a === 'assign') {
          const techs = S.get().users.filter(u => u.role === 'tech');
          // A working copy, so backing out of the dialog changes nothing.
          const picked = {};
          (c.plan || []).forEach(l => { picked[l.svId] = Seed.lineCrew(l).slice(); });

          const openJobs = id => S.jobsForTech(id).filter(j => j.status !== 'completed').length;
          const peak = S.contractCrew(c);

          // Services landing on the same day are one trip and one crew. Picking
          // somebody already going that day costs nothing; picking a fresh face
          // puts another head in the van.
          const mates = {};
          (Seed.planVisits(c) || []).forEach(function (v) {
            (v.serviceIds || []).forEach(function (a) {
              mates[a] = mates[a] || {};
              (v.serviceIds || []).forEach(function (b) { if (b !== a) mates[a][b] = 1; });
            });
          });
          /** Everyone already going on a trip this service shares. */
          function alreadyGoing(svId) {
            const out = {};
            Object.keys(mates[svId] || {}).forEach(function (other) {
              (picked[other] || []).forEach(function (id) { out[id] = 1; });
            });
            return out;
          }
          /** Total heads that will actually travel to this site. */
          function heads() {
            const all = {};
            (c.plan || []).forEach(l => (picked[l.svId] || []).forEach(id => { all[id] = 1; }));
            return Object.keys(all);
          }

          /** One service, its own crew, its own people. */
          function block(l) {
            const need = Math.max(1, l.crew || 1);
            const on = picked[l.svId] || [];
            const full = on.length >= need;
            return `<div class="asgblock" data-svc="${attr(l.svId)}">
              <div class="row between wrap g-8 mb-10">
                <div style="min-width:0">
                  <div class="fw-7 t-md truncate">${esc(S.svcName(l.svId))}</div>
                  <div class="t-sm muted">${l.visits} visit${l.visits === 1 ? '' : 's'} · ${esc(l.freq || '')} · takes ${need} ${need === 1 ? 'person' : 'people'}</div>
                </div>
                <span class="badge ${full ? 'b-green' : 'b-amber'}">${full ? ico('check') : ico('alert')}${on.length} of ${need}</span>
              </div>
              <div class="row g-7 wrap">${(function () {
                const going = alreadyGoing(l.svId);
                // Anybody already on the trip first -- they are the free choice.
                const order = techs.slice().sort(function (x, y) {
                  return (going[y.id] ? 1 : 0) - (going[x.id] ? 1 : 0);
                });
                return order.map(function (t) {
                  const at = on.indexOf(t.id);
                  const free = !!going[t.id];
                  return `<button type="button" class="techchip${at >= 0 ? ' on' : ''}${
                      free && at < 0 ? ' going' : ''}" data-pick="${attr(t.id)}"
                      title="${attr(free ? 'Already on this trip for another service' : openJobs(t.id) + ' open jobs')}">
                    ${U.avatar(t, 'av-xs')}
                    <span class="nm">${esc(t.name)}</span>
                    ${free && at < 0 ? '<span class="ld free">on the trip</span>'
                                     : `<span class="ld">${openJobs(t.id)}</span>`}
                    ${at >= 0 ? ico('check', '', 13) : ''}
                  </button>`;
                }).join('');
              })()}</div>
            </div>`;
          }

          U.modal({
            title: 'Assign technicians',
            sub: S.clientName(c.clientId) + ' · each service is staffed on its own',
            size: 'lg',
            body: `${C.hint('Services falling on the same day share one trip, and one crew works ' +
                     'through them \u2014 so this contract needs <strong>' + peak + '</strong> ' +
                     (peak === 1 ? 'person' : 'people') + ' on its busiest day, not the total of ' +
                     'every service below.', 'info')}
              <div id="asgWrap" class="mt-14">${(c.plan || []).map(block).join('')}</div>
              <div class="fhint" id="asgHint"></div>`,
            footer: `<button class="btn btn-ghost" data-close>Cancel</button>
                     <button class="btn btn-primary" data-save>${ico('check')} Save assignment</button>`,
            onMount(mroot, close) {
              const hint = U.qs('#asgHint', mroot);

              function repaint() {
                U.qs('#asgWrap', mroot).innerHTML = (c.plan || []).map(block).join('');
                const short = (c.plan || []).reduce(function (a, l) {
                  return a + Math.max(0, Math.max(1, l.crew || 1) - (picked[l.svId] || []).length);
                }, 0);
                const going = heads().length;
                const spare = going - peak;
                hint.innerHTML = short
                  ? `<span class="warn fw-6">${short} more ${short === 1 ? 'place' : 'places'} to fill.</span>
                     Save part-way if you like \u2014 the contract keeps reminding you.`
                  : spare > 0
                    ? `<span class="warn fw-6">${going} people travel, but the busiest day only needs ${peak}.</span>
                       Pick someone marked <em>on the trip</em> instead of a new face and it drops to ${peak}.`
                    : `Every service is staffed. <strong>${going}</strong> ${going === 1 ? 'person goes' : 'people go'}
                       to this site \u2014 exactly the ${peak} the busiest day needs.`;
              }
              repaint();

              mroot.addEventListener('click', function (ev) {
                const chip = ev.target.closest('[data-pick]');
                if (chip) {
                  ev.preventDefault();
                  const svId = chip.closest('[data-svc]').getAttribute('data-svc');
                  const id = chip.getAttribute('data-pick');
                  const line = (c.plan || []).filter(l => l.svId === svId)[0] || {};
                  const need = Math.max(1, line.crew || 1);
                  const list = picked[svId] || (picked[svId] = []);
                  const at = list.indexOf(id);

                  if (at >= 0) list.splice(at, 1);
                  else {
                    // Never more than the service asks for -- the oldest pick
                    // makes way, so the count can't run past its own crew size.
                    if (list.length >= need) list.shift();
                    list.push(id);
                  }
                  repaint();
                  return;
                }

                if (!ev.target.closest('[data-save]')) return;

                (c.plan || []).forEach(function (l) {
                  const need = Math.max(1, l.crew || 1);
                  l.techIds = (picked[l.svId] || []).slice(0, need);
                  delete l.techId;                          // one shape from here on
                });
                const n = S.syncCrew(c);
                S.save(); close(); ctx.refresh();

                const st = S.staffing(c);
                const held = S.syncCrew.held || 0;
                U.toast(st.ok ? 'Every service staffed' : 'Assignment saved', {
                  tone: st.ok ? 'ok' : 'warn',
                  icon: 'hardhat',
                  sub: n + ' pending visit' + (n === 1 ? '' : 's') + ' updated' +
                    (held ? ' · ' + held + ' hand-placed visit' + (held === 1 ? '' : 's') + ' left alone' : '') +
                    (st.ok ? '' : ' · ' + st.missing + ' still to fill')
                });
              });
            }
          });
          return;
        }

        if (a === 'invoice') {
          // One-time work is billed once, for everything the contract covers.
          const jobs = S.contractJobs(c.id);
          const done = jobs.filter(x => x.status === 'completed');
          if (jobs.length && !done.length) {
            U.toast('Not billable yet', { tone: 'err', sub: 'The service has to be completed first' });
            return;
          }
          if (jobs.some(x => S.invoiceForJob(x.id))) {
            const had = jobs.map(x => S.invoiceForJob(x.id)).filter(Boolean)[0];
            U.toast('Already billed', { tone: 'err', sub: 'This service is on ' + had.id });
            return;
          }
          confirmInvoice(S.linesFor(c, c.serviceIds), 'One-time service — ' + S.fmtDate(c.start),
            () => S.invoiceFromOneTime(c));
          return;
        }

        if (a === 'renew') {
          U.confirm({
            title: 'Renew ' + c.id + '?',
            message: 'A new contract will be created starting the day after this one ends, with the same scope, frequency and value — and a fresh set of scheduled visits.',
            confirmText: 'Renew for ' + c.months + ' months'
          }).then(ok => {
            if (!ok) return;
            const db = S.get();
            db.seq.contract = (db.seq.contract || 0) + 1;
            const n = JSON.parse(JSON.stringify(c));
            n.id = 'AMC-' + new Date().getFullYear() + '-' + String(db.seq.contract).padStart(2, '0');
            n.start = Seed.addMonths(c.end, 0);
            n.end = Seed.addMonths(n.start, n.months);
            n.quoteId = null;
            db.contracts.push(n);
            S.generateVisits(n);
            S.save();
            U.toast('Renewed as ' + n.id, { sub: n.totalVisits + ' new visits scheduled' });
            location.hash = '#/contracts/' + n.id;
            App.refresh();
          });
        }
      });
    }
  };

  /* =================================================================== view */
  V.contracts = {
    title: 'Contracts',
    newContract: newContract,
    /** The plan editor, openable from the lead card as well as the contract. */
    editPlan(c, ctx) { editPlan(c, ctx || { refresh() { App.refresh(); } }); },
    render: renderList,
    mount(root, ctx) {
      const qi = U.qs('#cq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        // One way in: pick the kind first, then the one shared form.
        if (e.target.closest('[data-new]')) {
          if (V['contract-new']) V['contract-new'].choose();
          return;
        }
        // The list is a table now, so rows navigate through their data-go.
        const go = e.target.closest('[data-go]');
        if (go) location.hash = go.getAttribute('data-go');
      });
    }
  };
})(window);
