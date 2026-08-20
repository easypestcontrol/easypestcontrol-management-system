/* ==========================================================================
   View: Leads — pipeline board + list + capture + the call-outcome SOP
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;
  const STAGES = Seed.LEAD_STAGES;

  let mode = 'board';
  let query = '';

  // Both lists are master data — edit them under Master Data, not here.
  const sources = () => S.get().leadSources || [];
  const types = () => S.get().propertyTypes || [];

  /** Who a new lead should land with: whoever is capturing it, if they can own leads. */
  function defaultOwner() {
    const me = S.me();
    return (me && S.assignableUsers().some(u => u.id === me.id)) ? me.id : 'U03';
  }
  function defaultBranch() {
    const me = S.me();
    const mine = (me && me.branches) || [];
    const all = S.get().branches || [];
    return mine[0] || (all[0] && all[0].id) || '';
  }

  /** Every locality any branch covers, for the capture form's type-ahead. */
  function knownAreas() {
    const out = [];
    (S.get().branches || []).forEach(b => S.branchAreas(b).forEach(a => {
      if (!out.some(x => x.name.toLowerCase() === a.toLowerCase())) out.push({ name: a, branch: b.name });
    }));
    return out.sort((a, b) => a.name < b.name ? -1 : 1);
  }

  /**
   * Who can own a lead. Salespeople first, then the managers who also work the
   * pipeline. Technicians are never in this list — they are field staff, and
   * the person picked here is whoever follows the customer up.
   */
  function ownerOptions(selected) {
    return S.assignableUsers().map(u =>
      `<option value="${attr(u.id)}"${u.id === selected ? ' selected' : ''}>` +
      `${esc(u.name)} · ${esc(Seed.ROLES[u.role].label)}</option>`).join('');
  }

  function filtered() {
    const q = query.toLowerCase();
    return S.get().leads.filter(l =>
      !q || (l.name + l.phone + l.area + l.source).toLowerCase().indexOf(q) >= 0);
  }

  /* ---------------------------------------------------- dates & due states */
  function tomorrowISO() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return Seed.iso(d);
  }

  /** The dated commitment a lead is sitting on: a call-back or a site visit. */
  function commitment(l) {
    if (l.stage === 'followup' && l.followUp) {
      return { kind: 'Follow up', date: l.followUp, time: l.followUpTime, icon: 'phone' };
    }
    if (l.stage === 'inspection' && l.inspectAt) {
      return { kind: 'Inspect', date: l.inspectAt, time: l.inspectTime, icon: 'route' };
    }
    return null;
  }

  function dueState(l) {
    const c = commitment(l);
    if (!c) return null;
    const n = S.dayDelta(c.date);
    const when = S.fmtShort(c.date) + (c.time ? ', ' + S.fmtTime(c.time) : '');
    if (n < 0) return { c: c, when: when, text: 'Overdue ' + (-n) + 'd', cls: 'b-red', color: '#F04438' };
    if (n === 0) return { c: c, when: when, text: 'Due today', cls: 'b-amber', color: '#F79009' };
    if (n === 1) return { c: c, when: when, text: 'Tomorrow', cls: 'b-blue', color: '#2E90FA' };
    return { c: c, when: when, text: 'In ' + n + ' days', cls: 'b-gray', color: 'var(--muted)' };
  }

  function dueCount() {
    return S.get().leads.filter(l => {
      const c = commitment(l);
      return c && S.dayDelta(c.date) <= 0;
    }).length;
  }

  const valueText = v => v ? S.moneyShort(v) : '—';

  /** Append a dated line to the lead's activity trail. */
  function logIt(l, text) {
    l.log = l.log || [];
    l.log.unshift({ at: S.nowStamp ? S.nowStamp() : S.todayISO(), text: text, by: (S.me() || {}).id || '' });
  }

  /* ------------------------------------------------------------ rendering */
  function card(l) {
    const st = STAGES.find(s => s.id === l.stage);
    const due = dueState(l);
    return `<div class="kancard" data-lead="${attr(l.id)}">
      <div class="row between g-8 mb-6">
        <span class="fw-6 truncate" style="font-size:13px">${esc(l.name)}</span>
        <span class="badge b-gray" style="height:19px;font-size:10px">${esc(l.source)}</span>
      </div>
      <div class="t-sm muted truncate">${l.interest.length ? esc(l.interest.map(S.svcName).join(', ')) : 'Services not confirmed yet'}</div>
      <div class="row between g-8 mt-10">
        <span class="row g-5 t-sm muted">${ico('pin', '', 12)}${esc(l.area)}</span>
        <span class="fw-7 t-base" style="color:${st.color}">${valueText(l.value)}</span>
      </div>
      ${l.branch ? `<div class="row g-5 mt-6"><span class="badge b-blue" style="height:18px;font-size:10px">${ico('building', '', 11)}${esc((S.branch(l.branch) || {}).code || '')}</span></div>` : ''}
      ${due ? `<div class="row g-5 mt-8 t-xs fw-6" style="color:${due.color}">
        ${ico(due.c.icon, '', 12)}${esc(due.c.kind)} ${esc(due.when)} · ${esc(due.text)}</div>` : ''}
      <div class="row between g-8 mt-8" style="padding-top:8px;border-top:1px solid var(--line)">
        <span class="row g-6" title="Assigned to ${attr(S.userName(l.owner))}">${U.avatar(S.user(l.owner), 'av-xs')}<span class="t-xs muted">${esc(S.relDay(l.created))}</span></span>
        <span class="row g-4">
          <button class="iconbtn" style="width:26px;height:26px" data-wa="${attr(l.id)}" title="WhatsApp">${ico('whatsapp', '', 14)}</button>
          <button class="iconbtn" style="width:26px;height:26px" data-quote="${attr(l.id)}" title="Create quotation">${ico('filetext', '', 14)}</button>
        </span>
      </div>
    </div>`;
  }

  function board() {
    const rows = filtered();
    return `<div class="kanban">${STAGES.map(s => {
      const items = rows.filter(l => l.stage === s.id);
      const val = items.reduce((a, b) => a + b.value, 0);
      return `<div class="kancol" data-stage="${attr(s.id)}">
        <div class="kancol-hd">
          <i class="kdot" style="background:${s.color}"></i>
          <span class="knm grow">${esc(s.label)}</span>
          <span class="kct">${items.length}</span>
        </div>
        <div class="kancol-bd">
          ${items.length ? items.map(card).join('')
            : `<div class="t-sm muted center-txt" style="padding:18px 0">Empty</div>`}
        </div>
        <div class="kancol-ft row between">
          <span class="t-xs muted fw-6">TOTAL</span>
          <span class="t-sm fw-7">${S.moneyShort(val)}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function list() {
    const rows = filtered();
    if (!rows.length) return U.empty({ icon: 'userplus', title: 'No leads found', text: 'Try a different search, or capture a new lead.' });
    return `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th>Lead</th><th>Source</th><th>Services required</th><th>Area</th>
        <th>Branch</th><th class="r">Value</th><th>Stage</th><th>Assigned to</th><th></th>
      </tr></thead>
      <tbody>${rows.map(l => {
        const st = STAGES.find(s => s.id === l.stage);
        const due = dueState(l);
        return `<tr class="clickable" data-lead="${attr(l.id)}">
          <td><div class="fw-6">${esc(l.name)}</div><div class="t-sm muted">${esc(l.phone)}</div></td>
          <td><span class="badge b-gray">${esc(l.source)}</span></td>
          <td class="truncate" style="max-width:210px">${l.interest.length ? esc(l.interest.map(S.svcName).join(', ')) : '<span class="muted">Not confirmed</span>'}</td>
          <td class="t-sm">${esc(l.area)}</td>
          <td>${l.branch ? `<span class="badge b-blue">${esc((S.branch(l.branch) || {}).code || '—')}</span>` : '<span class="muted">—</span>'}</td>
          <td class="r fw-7">${l.value ? S.money(l.value) : '—'}</td>
          <td><span class="badge" style="background:${st.color}18;color:${st.color}"><i class="pip"></i>${esc(st.label)}</span>
              ${due ? `<div class="t-xs mt-4" style="color:${due.color}">${esc(due.c.kind)} ${esc(due.when)}</div>` : ''}</td>
          <td>${C.userCell(l.owner)}</td>
          <td class="tight">${ico('cright', 'muted-2', 15)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`;
  }

  /* ------------------------------------------------------------- detail */
  /** One section on a page of the book. */
  function sec(title, html, right) {
    return `<section class="bk-sec">
      <div class="row between g-8 bk-sech"><h4 class="grow">${esc(title)}</h4>${right || ''}</div>
      ${html}
    </section>`;
  }

  /**
   * What the "Interested" button does from here. The lead only ever moves one
   * step, and the step depends on where it already is.
   */
  function nextStep(l) {
    if (l.stage === 'inspection') return { to: 'quoted',   label: 'Quote it',        hint: 'The site visit is done — this raises the quotation and moves the lead to Quoted.' };
    if (l.stage === 'quoted')     return { to: 'contract', label: 'Quote accepted',  hint: 'The customer has agreed to the quote — the lead moves to Contract to be drawn up.' };
    if (l.stage === 'contract') {
      return S.leadContracts(l).length
        ? { to: 'won', label: 'Contract signed',
            hint: 'The AMC is drawn up and signed — this wins the lead.' }
        : { to: 'amc', label: 'Draw up the AMC',
            hint: 'Turn the accepted quotation into an AMC contract with its full visit schedule.' };
    }
    return { to: 'choose', label: 'Interested', hint: 'Quote straight away, or book a site visit first and quote after.' };
  }

  /**
   * The AMC side of the lead card. Before the contract exists this is the
   * button that creates it; afterwards it is the contract itself, with its
   * schedule editable without leaving the lead.
   */
  function contractList(l) {
    const cs = S.leadContracts(l);

    if (!cs.length) {
      const qs = leadQuotes(l);
      const ready = qs.filter(q => q.status === 'approved' || q.status === 'sent');
      const amc = ready.filter(q => q.mode === 'amc');
      const onetime = ready.filter(q => q.mode !== 'amc');

      if (!qs.length) {
        return `<div class="t-sm muted">Raise a quotation first — the AMC is generated from it,
          so the services and their intervals carry straight through.</div>`;
      }
      if (!ready.length) {
        return `<div class="t-sm muted">Send the quotation to the customer. Once they accept it,
          you can draw up the AMC from here.</div>`;
      }
      return `<div class="t-sm muted mb-10">No contract yet. Generate it from the accepted quotation —
        each quoted service keeps the interval it was priced for.</div>
        <div class="col g-8">${ready.map(q => {
          const t = S.quoteTotals(q);
          const isAmc = q.mode === 'amc';
          return `<div class="row between g-10 card" style="padding:10px 12px">
            <div class="grow" style="min-width:0">
              <div class="row g-6"><span class="mono t-sm fw-6">${esc(q.id)}</span>
                <span class="badge ${isAmc ? 'b-violet' : 'b-gray'}">${isAmc ? 'AMC · ' + esc(q.freq || 'Monthly') : 'One-time'}</span></div>
              <div class="t-sm muted truncate">${esc(q.title)} · ${S.money(t.total)}</div>
            </div>
            <button class="btn btn-primary btn-sm nowrap" data-genamc="${attr(q.id)}">
              ${ico(isAmc ? 'shield' : 'calendar')} ${isAmc ? 'Generate AMC' : 'Book the service'}</button>
          </div>`;
        }).join('')}</div>
        ${amc.length ? '' : `<div class="fhint">These quotations are one-time services. Only an AMC quotation produces a recurring contract.</div>`}`;
    }

    return `<div class="col g-10">${cs.map(c => {
      const pr = S.contractProgress(c);
      const st = S.contractStatus(c);
      const next = pr.jobs.filter(j => j.status !== 'completed' && S.dayDelta(j.date) >= 0)[0];
      const svcVisits = (c.plan || []).reduce((a, x) => a + (x.visits || 0), 0);
      return `<div class="card" style="padding:13px 14px">
        <div class="row between g-10 mb-8">
          <div class="row g-8" style="min-width:0">
            <span class="mono t-sm fw-7">${esc(c.id)}</span>
            <span class="badge ${st.cls}"><i class="pip"></i>${esc(st.label)}</span>
          </div>
          <span class="fw-7 t-base nowrap">${S.moneyShort(c.value)}</span>
        </div>

        <div class="t-sm muted mb-8">${esc(S.planSummary(c))} · ${esc(c.billing)} billing<br>
          ${esc(S.fmtDate(c.start))} → ${esc(S.fmtDate(c.end))}</div>

        <div class="row between g-8 mb-4">
          <span class="t-sm muted">Visits</span>
          <span class="t-sm fw-6">${pr.done} of ${pr.total} done</span>
        </div>
        ${U.bar(pr.pct)}

        <div class="row g-6 wrap mt-10">
          ${(c.plan || []).map(x => `<span class="badge b-gray" title="${attr(S.svcName(x.svId) + ' · ' + x.freq)}">
            ${esc((S.service(x.svId) || {}).code || x.svId)} ${esc(x.freq.toLowerCase())}</span>`).join('')}
        </div>

        <div class="row between g-8 mt-10" style="padding-top:10px;border-top:1px solid var(--line)">
          <span class="t-sm ${next ? 'brand fw-6' : 'muted'}">
            ${next ? ico('calcheck', '', 13) + ' Next ' + esc(S.fmtDate(next.date)) + ' · ' + esc(S.fmtTime(next.slot)) : 'No upcoming visit'}</span>
          <span class="t-xs muted">${svcVisits} service-visits → ${pr.total} trips</span>
        </div>

        <div class="grid grid-2 g-8 mt-10">
          <button class="btn btn-soft btn-sm" data-editplan="${attr(c.id)}">${ico('calcheck')} Edit schedule</button>
          <button class="btn btn-ghost btn-sm" data-opencontract="${attr(c.id)}">${ico('external')} Open contract</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  /** Every quotation raised against this lead, newest first. */
  function leadQuotes(l) {
    return S.get().quotations.filter(q => q.leadId === l.id);
  }

  /**
   * The quotations raised for a lead, read straight off the lead card: how
   * many, what each one is worth, and where it stands. Clicking one opens it.
   */
  function quoteList(l) {
    const qs = leadQuotes(l);
    if (!qs.length) {
      return `<div class="t-sm muted">No quotation raised yet. Use <b>New</b>, or the
        <b>Interested</b> button on the left to quote straight away.</div>`;
    }
    const total = qs.reduce((a, q) => a + S.quoteTotals(q).total, 0);
    const unsentCount = qs.filter(q => q.status === 'draft').length;
    return qs.map(q => {
      const stt = S.QUOTE_STATUS[q.status] || S.QUOTE_STATUS.draft;
      // A draft is a quotation the customer has not seen yet — that is the
      // one thing this list has to make obvious.
      const unsent = q.status === 'draft';
      return `<div class="card mb-8" style="padding:10px 12px">
        <div class="row between g-10 card-int" data-openquote="${attr(q.id)}">
          <div class="grow" style="min-width:0">
            <div class="row g-6 wrap">
              <span class="mono t-sm fw-7">${esc(q.id)}</span>
              <span class="badge ${stt.cls}">${esc(stt.label)}</span>
              ${q.mode === 'amc' ? `<span class="badge b-violet">AMC · ${esc(q.freq)}</span>` : ''}
            </div>
            <div class="t-sm muted truncate mt-2">${esc(q.title)}</div>
            <div class="t-xs muted mt-2">${esc(S.fmtDate(q.date))} · valid till ${esc(S.fmtDate(q.valid))}</div>
          </div>
          <div class="nowrap" style="text-align:right">
            <div class="fw-7">${S.money(S.quoteTotals(q).total)}</div>
            <div class="t-xs muted">incl. GST</div>
          </div>
          ${ico('cright', 'muted-2', 15)}
        </div>
        <div class="row g-8 mt-10" style="padding-top:9px;border-top:1px solid var(--line)">
          <button class="btn ${unsent ? 'btn-wa' : 'btn-ghost'} btn-sm grow" data-waquote="${attr(q.id)}">
            ${ico('whatsapp')} ${unsent ? 'Send on WhatsApp' : 'Send again'}
          </button>
          <button class="btn btn-ghost btn-sm nowrap" data-openquote="${attr(q.id)}">${ico('filetext')} Open</button>
        </div>
      </div>`;
    }).join('') +
    `<div class="row between g-8" style="padding-top:9px;border-top:1px solid var(--line)">
      <span class="t-sm muted">${qs.length} quotation${qs.length === 1 ? '' : 's'}${
        unsentCount ? ' · ' + unsentCount + ' not sent yet' : ' · all sent'}</span>
      <span class="fw-7">${S.money(total)}</span>
    </div>`;
  }

  function openLead(id) {
    const l = S.lead(id);
    if (!l) return;
    const st = STAGES.find(s => s.id === l.stage);
    const due = dueState(l);
    const live = S.isOpenLead(l);
    const step = nextStep(l);
    const past = S.contactHistory({ clientId: l.clientId, phone: l.phone }).filter(x => x.id !== l.id);
    // Field staff who can carry out a site inspection — not lead owners.
    const techs = S.get().users.filter(u => ['tech', 'ops'].indexOf(u.role) >= 0);

    /* ---------------------------------------------- left page: the customer */
    const leftPage =
      `<div class="row g-8 wrap mb-14">
        <span class="badge badge-lg" style="background:${st.color}18;color:${st.color}"><i class="pip"></i>${esc(st.label)}</span>
        <span class="badge b-gray badge-lg">${ico('message')}${esc(l.source)}</span>
        ${l.value ? `<span class="badge b-brand badge-lg">${ico('rupee')}${S.money(l.value)}</span>` : ''}
        ${l.clientId ? `<span class="badge b-blue badge-lg">${ico('building')}Existing customer</span>` : ''}
      </div>

      ${live ? `<div class="card card-pad mb-16" style="background:var(--surface-2)">
        <div class="flabel mb-8">What happened on the call?</div>
        <div class="grid grid-3 g-8">
          <button class="btn btn-primary" data-sop="interested">${ico('checkcircle')} ${esc(step.label)}</button>
          <button class="btn btn-soft" data-sop="noanswer">${ico('phone')} Not answered</button>
          <button class="btn btn-ghost" data-sop="notinterested">${ico('xcircle')} Not interested</button>
        </div>
        <div class="fhint">${esc(step.hint)}</div>
        <div id="sopPanel"></div>
      </div>` : ''}` +

      sec('Quotations', quoteList(l),
        `<button class="btn btn-soft btn-sm" data-newquote>${ico('plus')} New</button>`) +

      sec('AMC contract', contractList(l),
        S.leadContracts(l).length
          ? `<span class="badge b-violet">${S.leadContracts(l).length}</span>`
          : `<span class="badge b-gray">None yet</span>`) +

      sec('Customer', C.kv([
        ['Contact', l.phone],
        ['Email', l.email || '—'],
        ['Property type', l.type],
        ['Location', l.area],
        ['Lead source', l.source],
        ['Services required', l.interest.length ? l.interest.map(S.svcName).join(', ') : 'Not confirmed yet'],
        ['Notes', l.note],
        ['Captured', S.fmtDate(l.created) + ' · ' + S.relDay(l.created)]
      ])) +

      ((l.log || []).length ? sec('Activity',
        `<div class="tl">${l.log.slice(0, 8).map(e => `<div class="tl-item">
          <div class="dot done">${ico('check')}</div>
          <div style="font-size:13px;font-weight:600">${esc(e.text)}</div>
          <div class="t-sm muted">${esc(String(e.at).replace('T', ' · '))}${e.by ? ' · ' + esc(S.userName(e.by)) : ''}</div>
        </div>`).join('')}</div>`) : '');

    /* ------------------------------------------- right page: how we work it */
    const rightPage =
      sec('Owner',
        `<div class="t-xs muted mb-4">Branch / territory</div>
        <select class="select" id="ldBranch">
          <option value="">— no branch —</option>
          ${(S.get().branches || []).map(b => `<option value="${attr(b.id)}"${b.id === l.branch ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
        <div class="t-xs muted mb-4 mt-12">Assigned to</div>
        <select class="select" id="ldOwner">${ownerOptions(l.owner)}</select>
        <button class="btn btn-primary btn-sm mt-12" data-assign>${ico('usercheck')} Save assignment</button>
        <div class="fhint">The salesperson who follows this lead up. They see it on their pipeline and get the reminders.</div>`,
        `<span class="row g-6">${U.avatar(S.user(l.owner), 'av-xs')}<span class="t-sm">${esc(S.userName(l.owner))}</span></span>`) +

      sec('Next step',
        due
          ? `<div class="banner ${due.cls === 'b-red' ? 'ban-red' : due.cls === 'b-amber' ? 'ban-amber' : 'ban-blue'}" style="padding:11px 13px">
               ${ico(due.c.icon)}
               <div class="grow" style="min-width:0">
                 <div class="bt">${esc(due.c.kind)} ${esc(due.when)}</div>
                 <div style="opacity:.85">${esc(S.fmtDate(due.c.date))}${due.c.time ? ' at ' + esc(S.fmtTime(due.c.time)) : ''}${
                   l.stage === 'inspection' && l.inspectBy ? ' · ' + esc(S.userName(l.inspectBy)) : ''}</div>
               </div>
             </div>`
          : `<div class="t-sm muted">Nothing booked. <b>Not answered</b> sets a call-back date, <b>Interested</b> books a site visit.</div>`) +

      (past.length ? sec('Earlier leads from this customer',
        past.slice(0, 4).map(pl => {
          const ps = STAGES.find(x => x.id === pl.stage);
          return `<div class="row between g-10 card mb-8" style="padding:9px 12px">
            <div class="grow" style="min-width:0">
              <div class="t-base fw-6 truncate">${pl.interest.length ? esc(pl.interest.map(S.svcName).join(', ')) : esc(pl.id)}</div>
              <div class="t-sm muted">${esc(pl.id)} · ${esc(S.relDay(pl.created))}</div>
            </div>
            <span class="badge" style="background:${ps.color}18;color:${ps.color}">${esc(ps.label)}</span>
          </div>`;
        }).join(''), `<span class="badge b-gray">${past.length}</span>`) : '');

    U.modal({
      title: l.name,
      sub: l.type + ' · ' + l.area + ' · captured ' + S.relDay(l.created),
      size: 'xl',
      body: `<div class="book">
        <div class="book-pg">${leftPage}</div>
        <div class="book-pg">${rightPage}</div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>`,

      onMount(root, close) {
        const panel = U.qs('#sopPanel', root);

        function finish(msg, sub) {
          S.save(); close(); App.refresh();
          U.toast(msg, { sub: sub });
        }

        /* ------------------------------------------------ date + time panel */
        function whenPanel(cfg) {
          panel.innerHTML = `<div class="mt-12" style="border-top:1px solid var(--line);padding-top:13px">
            <div class="flabel mb-8">${esc(cfg.title)}</div>
            <div class="row g-8 wrap">
              <input class="input" type="date" id="sopDate" value="${attr(cfg.date)}" style="max-width:180px">
              <input class="input" type="time" id="sopTime" value="${attr(cfg.time)}" style="max-width:130px">
              ${cfg.who != null ? `<select class="select" id="sopWho" style="min-width:180px">
                <option value="">— nobody yet —</option>
                ${techs.map(t => `<option value="${attr(t.id)}"${t.id === cfg.who ? ' selected' : ''}>${esc(t.name)} · ${esc(Seed.ROLES[t.role].label)}</option>`).join('')}
              </select>` : ''}
            </div>
            <div class="fhint">${esc(cfg.hint)}</div>
            <div class="row g-8 mt-12">
              <button class="btn btn-primary btn-sm" data-sopgo>${ico('check')} ${esc(cfg.cta)}</button>
              <button class="btn btn-ghost btn-sm" data-sopcancel>Cancel</button>
            </div>
          </div>`;
        }

        function followUpPanel() {
          whenPanel({
            title: 'Call back on', date: l.followUp || tomorrowISO(), time: l.followUpTime || '10:00',
            hint: 'The lead moves to Follow-up and shows up as due on that date.',
            cta: 'Move to Follow-up'
          });
        }

        function inspectionPanel() {
          whenPanel({
            title: 'Inspection visit', date: l.inspectAt || tomorrowISO(),
            time: l.inspectTime || '10:00', who: l.inspectBy || '',
            hint: 'Which field technician visits the site, and when.',
            cta: 'Book inspection'
          });
        }

        let mode_ = '';   // which panel is open, and what confirming it does

        /* ------------------------------------------------------ committing */
        function commitFollowUp() {
          const date = U.qs('#sopDate', root).value || tomorrowISO();
          const time = U.qs('#sopTime', root).value || '10:00';
          l.stage = 'followup';
          l.followUp = date;
          l.followUpTime = time;
          l.inspectAt = '';
          logIt(l, 'Call back booked ' + S.fmtDate(date) + ' at ' + S.fmtTime(time));
          finish('Moved to Follow-up', S.fmtDate(date) + ' at ' + S.fmtTime(time));
        }

        function commitInspection() {
          const date = U.qs('#sopDate', root).value || tomorrowISO();
          const time = U.qs('#sopTime', root).value || '10:00';
          const who = U.qs('#sopWho', root) ? U.qs('#sopWho', root).value : '';
          l.stage = 'inspection';
          l.inspectAt = date;
          l.inspectTime = time;
          l.inspectBy = who;
          l.followUp = '';
          logIt(l, 'Site inspection booked ' + S.fmtDate(date) + ' at ' + S.fmtTime(time) +
                   (who ? ' with ' + S.userName(who) : ''));
          finish('Inspection booked', S.fmtDate(date) + ' at ' + S.fmtTime(time) + (who ? ' · ' + S.userName(who) : ''));
        }

        function commitLost() {
          const why = U.qs('#sopNote', root).value.trim();
          if (!why) { U.toast('Add a note before marking it lost', { tone: 'err' }); return; }
          l.stage = 'lost';
          l.followUp = '';
          l.inspectAt = '';
          l.note = l.note ? l.note + '\n\nNot interested: ' + why : 'Not interested: ' + why;
          logIt(l, 'Not interested — ' + why);
          finish('Moved to Lost', why.length > 60 ? why.slice(0, 60) + '…' : why);
        }

        /**
         * Open the quotation builder for this lead and hand control back to
         * this card either way. The lead is only moved to Quoted once a
         * quotation actually exists — abandoning the builder changes nothing.
         */
        /**
         * Move a quotation on to a contract. There is one form for that, it
         * arrives with the whole quotation already in it, and it is the only
         * place a contract gets made -- so this hands straight over rather
         * than asking a shorter set of the same questions here.
         */
        function generateAmc(quoteId) {
          const q = S.quote(quoteId);
          if (!q || !V['contract-new']) return;
          if (q.status === 'sent') { q.status = 'approved'; S.save(); }
          close();
          V['contract-new'].choose({ quote: q });
        }

        /** Open the schedule editor for a contract straight from the lead. */
        function editSchedule(contractId) {
          const c = S.contract(contractId);
          if (!c || !V.contracts || !V.contracts.editPlan) return;
          if (!c.plan || !c.plan.length) c.plan = S.defaultPlan(c);
          close();
          V.contracts.editPlan(c, { refresh() { App.refresh(); openLead(l.id); } });
        }

        function raiseQuote() {
          close();
          if (!V.quotations || !V.quotations.newQuote) return;
          V.quotations.newQuote({
            leadId: l.id,
            back(q) {
              // The quote's own save handler already moved the lead to Quoted.
              l.inspectAt = '';
              l.followUp = '';
              logIt(l, 'Quotation ' + q.id + ' raised — ' + S.money(S.quoteTotals(q).total));
              S.save();
              openLead(l.id);
            },
            cancel() { openLead(l.id); }
          });
        }

        function commitStage(next, text, msg, sub) {
          l.stage = next;
          l.followUp = '';
          l.inspectAt = '';
          logIt(l, text);
          finish(msg, sub);
        }

        /* ------------------------------------------------------ delegation */
        root.addEventListener('click', e => {
          const sop = e.target.closest('[data-sop]');
          if (sop) {
            const which = sop.getAttribute('data-sop');
            U.qsa('[data-sop]', root).forEach(b => b.classList.toggle('on', b === sop));

            if (which === 'noanswer') { mode_ = 'followup'; return followUpPanel(); }

            if (which === 'notinterested') {
              mode_ = 'lost';
              panel.innerHTML = `<div class="mt-12" style="border-top:1px solid var(--line);padding-top:13px">
                <div class="flabel mb-8">Why are they not interested?<span class="req">*</span></div>
                <textarea class="textarea" id="sopNote" placeholder="e.g. Went with another vendor on price — revisit at renewal in February."></textarea>
                <div class="fhint">Kept on the lead so you know what to do differently next time.</div>
                <div class="row g-8 mt-12">
                  <button class="btn btn-danger btn-sm" data-sopgo>${ico('xcircle')} Move to Lost</button>
                  <button class="btn btn-ghost btn-sm" data-sopcancel>Cancel</button>
                </div>
              </div>`;
              return;
            }

            // Interested — one step forward, and where that lands depends on the stage.
            if (step.to === 'quoted')   return raiseQuote();
            if (step.to === 'contract') return commitStage('contract', 'Quote accepted — moved to Contract',
                                                'Moved to Contract', 'Draw up the AMC for ' + l.name);
            if (step.to === 'amc') {
              // No AMC yet — send them to the quotation that can become one.
              const ready = leadQuotes(l).filter(q => q.status === 'approved' || q.status === 'sent');
              const amc = ready.filter(q => q.mode === 'amc')[0] || ready[0];
              if (amc) return generateAmc(amc.id);
              U.toast('No accepted quotation to convert', { tone: 'err',
                sub: 'Raise and send a quotation first, then draw up the AMC' });
              return;
            }
            if (step.to === 'won') {
              const cs = S.leadContracts(l);
              l.contractId = l.contractId || (cs[0] || {}).id || '';
              return commitStage('won', 'Contract signed — lead won' + (cs.length ? ' (' + cs[0].id + ')' : ''),
                'Lead won', cs.length ? cs[0].id + ' is live' : l.name);
            }

            mode_ = '';
            panel.innerHTML = `<div class="mt-12" style="border-top:1px solid var(--line);padding-top:13px">
              <div class="flabel mb-8">Where does this lead go next?</div>
              <div class="grid grid-2 g-8">
                <button class="btn btn-soft" data-route="quotation">${ico('filetext')} Straight to quotation</button>
                <button class="btn btn-soft" data-route="inspection">${ico('route')} Book a site visit</button>
              </div>
            </div>`;
            return;
          }

          const rt = e.target.closest('[data-route]');
          if (rt) {
            if (rt.getAttribute('data-route') === 'quotation') return raiseQuote();
            mode_ = 'inspection';
            inspectionPanel();
            return;
          }

          if (e.target.closest('[data-sopcancel]')) {
            panel.innerHTML = '';
            U.qsa('[data-sop]', root).forEach(b => b.classList.remove('on'));
            mode_ = '';
            return;
          }

          if (e.target.closest('[data-sopgo]')) {
            if (mode_ === 'lost') return commitLost();
            if (mode_ === 'followup') return commitFollowUp();
            if (mode_ === 'inspection') return commitInspection();
            return;
          }

          if (e.target.closest('[data-assign]')) {
            const owner = U.qs('#ldOwner', root).value;
            const branch = U.qs('#ldBranch', root).value;
            const changed = owner !== l.owner || branch !== (l.branch || '');
            if (changed) logIt(l, 'Assigned to ' + S.userName(owner) + (branch ? ' · ' + S.branchName(branch) : ''));
            l.owner = owner;
            l.branch = branch;
            finish(changed ? 'Lead assigned' : 'Assignment unchanged',
              S.userName(owner) + (branch ? ' · ' + S.branchName(branch) : ''));
            return;
          }

          if (e.target.closest('[data-newquote]')) return raiseQuote();

          const gen = e.target.closest('[data-genamc]');
          if (gen) return generateAmc(gen.getAttribute('data-genamc'));

          const ep = e.target.closest('[data-editplan]');
          if (ep) return editSchedule(ep.getAttribute('data-editplan'));

          const oc = e.target.closest('[data-opencontract]');
          if (oc) { close(); location.hash = '#/contracts/' + oc.getAttribute('data-opencontract'); return; }

          const wq = e.target.closest('[data-waquote]');
          if (wq) {
            const q = S.quote(wq.getAttribute('data-waquote'));
            if (!q || !V.quotations || !V.quotations.share) return;
            close();
            // The share screen owns marking it sent; come back here after.
            V.quotations.share(q, { refresh() { App.refresh(); openLead(l.id); } });
            return;
          }

          const oq = e.target.closest('[data-openquote]');
          if (oq) {
            close();
            location.hash = '#/quotations/' + oq.getAttribute('data-openquote');
            return;
          }
        });
      }
    });
  }

  /* -------------------------------------------------------------- create */
  /**
   * `pre.clientId` opens the form against an existing customer — the same
   * state a phone-number match produces, so the branch, owner and history
   * all behave identically to a caller we already know.
   */
  function newLead(pre) {
    const p = pre || {};
    const dir = S.directory();
    const svcOpts = S.get().services.map(s => `<label class="check" style="padding:5px 0">
      <input type="checkbox" name="svc" value="${attr(s.id)}"><span class="box">${ico('check')}</span>
      <span class="txt">${esc(s.name)}</span></label>`).join('');

    let matched = null;

    U.modal({
      title: 'Capture new lead',
      sub: 'Everything a caller tells you, in one screen',
      size: 'md',
      body: `
        ${U.field('Existing customer',
          `<select class="select" id="ldPick">
            <option value="">— someone new —</option>
            ${dir.filter(c => c.kind === 'client').sort((a, b) => a.name < b.name ? -1 : 1).map(c =>
              `<option value="${attr(c.id)}">${esc(c.name)}${c.area ? ' · ' + esc(c.area) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}
          </select>`,
          'Pick them from the customer list and everything below fills in. Leave it on “someone new” for a first-time caller.')}

        <div class="grid grid-2 mt-14">
          ${U.field('Name / Business', `<input class="input" id="ldName" placeholder="e.g. Sowmya Balaji">`, '', true)}
          ${U.field('Phone', `<input class="input" id="ldPhone" list="ldDirList" autocomplete="off" placeholder="+91 ">
             <datalist id="ldDirList">${dir.map(c =>
               `<option value="${attr(c.phone)}">${esc(c.name)}${c.area ? ' · ' + esc(c.area) : ''}</option>`).join('')}</datalist>`,
            'Or just type the number — a customer we have served before is recognised either way.', true)}
        </div>

        <div id="ldMatch"></div>

        <div class="grid grid-2 mt-14">
          ${U.field('Email', `<input class="input" id="ldEmail" placeholder="optional">`)}
          ${U.field('Area / Locality', `<input class="input" id="ldArea" list="ldAreaList" autocomplete="off" placeholder="e.g. Besant Nagar">
             <datalist id="ldAreaList">${knownAreas().map(a =>
               `<option value="${attr(a.name)}">${esc(a.branch)}</option>`).join('')}</datalist>`,
            'Sets the branch on its own, from the areas each branch covers.')}
          ${U.field('Lead source', `<select class="select" id="ldSource">${U.selectOpts(sources(), null, null, 'WhatsApp')}</select>`)}
          ${U.field('Property type', `<select class="select" id="ldType">${U.selectOpts(types(), null, null, 'Residential')}</select>`)}
          ${U.field('Branch', `<select class="select" id="ldBranch">
            <option value="">— no branch —</option>
            ${(S.get().branches || []).map(b => `<option value="${attr(b.id)}"${b.id === defaultBranch() ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>`)}
          ${U.field('Assign to', `<select class="select" id="ldOwner">${ownerOptions(defaultOwner())}</select>`,
            'The salesperson who will follow this lead up — assign it to yourself or to someone on the team.', true)}
        </div>

        <div class="mt-16">${U.field('Services required',
          `<div class="card" style="max-height:172px;overflow-y:auto;padding:8px 12px">${svcOpts}</div>`,
          'Optional — tick them now if you know, or leave it blank and confirm after the site visit.')}</div>

        <div class="mt-16" style="max-width:236px">${U.field('Follow up on',
          `<input class="input" type="date" id="ldFollow">`,
          'Optional — set a date and the lead lands in the Follow-up column.')}</div>

        <div class="mt-16">${U.field('Notes', `<textarea class="textarea" id="ldNote" placeholder="What exactly did the customer say?"></textarea>`)}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} Save lead</button>`,

      onMount(root, close) {
        const box = U.qs('#ldMatch', root);
        const phone = U.qs('#ldPhone', root);
        const pickSel = U.qs('#ldPick', root);

        /* ------------------------------------------- locality sets the branch */
        const areaInp = U.qs('#ldArea', root);
        const branchSel = U.qs('#ldBranch', root);
        const ownerSel = U.qs('#ldOwner', root);

        // Once the branch is picked by hand we stop moving it for them.
        let branchTouched = false;

        function areaChanged() {
          if (branchTouched) return;
          const b = S.branchForArea(areaInp.value);
          if (b && b.id !== branchSel.value) branchSel.value = b.id;
        }

        areaInp.addEventListener('input', U.debounce(areaChanged, 240));
        areaInp.addEventListener('change', areaChanged);
        branchSel.addEventListener('change', () => { branchTouched = true; });

        function clearMatch() {
          matched = null;
          if (pickSel) pickSel.value = '';
          box.innerHTML = '';
        }

        function showMatch(c) {
          matched = c;
          const past = S.contactHistory(c);
          box.innerHTML = `<div class="row g-10 mt-12" style="padding:10px 12px;border:1px solid var(--brand-300);border-radius:var(--r-sm);background:var(--brand-50)">
            <div class="tile-ico ${c.kind === 'client' ? 'i-brand' : 'i-blue'}" style="width:30px;height:30px">${ico(c.kind === 'client' ? 'building' : 'userplus', '', 15)}</div>
            <div class="grow" style="min-width:0">
              <div class="fw-6 t-base truncate">${esc(c.name)}</div>
              <div class="t-sm muted truncate">${c.kind === 'client' ? 'Existing customer' : 'Known from an earlier lead'} · ${esc(c.id)}${past.length ? ' · ' + past.length + ' previous ' + (past.length === 1 ? 'lead' : 'leads') : ''} — details filled in below</div>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" data-clearmatch>Clear</button>
          </div>`;
        }

        function fill(c) {
          // Keep the picker in step, whichever way the customer was identified.
          if (pickSel) pickSel.value = c.clientId || '';
          U.qs('#ldName', root).value = c.name || '';
          U.qs('#ldEmail', root).value = c.email || '';
          U.qs('#ldArea', root).value = c.area || '';
          if (c.type && types().indexOf(c.type) >= 0) U.qs('#ldType', root).value = c.type;

          // A returning customer stays with the branch and the person who had
          // them — that beats anything the territory map would suggest.
          const prev = S.contactHistory(c)[0];
          if (prev && prev.branch) { branchSel.value = prev.branch; branchTouched = true; }
          else areaChanged();
          if (prev && prev.owner && Array.prototype.some.call(ownerSel.options, o => o.value === prev.owner)) {
            ownerSel.value = prev.owner;
          }
          showMatch(c);
        }

        /** The phone number is the key: 10 digits in, and the record comes back. */
        function lookup() {
          const v = phone.value;
          if (S.phoneKey(v).length < 10) { clearMatch(); return; }
          const c = S.findContact(v);
          if (c) {
            if (!matched || matched.id !== c.id) { phone.value = c.phone; fill(c); }
          } else clearMatch();
        }

        phone.addEventListener('input', U.debounce(lookup, 260));
        phone.addEventListener('change', lookup);
        phone.addEventListener('blur', lookup);

        /* ------------------------------------------ pick from the customer list */
        pickSel.addEventListener('change', () => {
          const id = pickSel.value;
          if (!id) {                       // back to a first-time caller
            clearMatch();
            ['#ldName', '#ldPhone', '#ldEmail', '#ldArea'].forEach(x => { U.qs(x, root).value = ''; });
            branchTouched = false;
            areaChanged();
            return;
          }
          const known = dir.filter(x => x.kind === 'client' && x.clientId === id)[0];
          if (!known) return;
          phone.value = known.phone || '';
          fill(known);
        });

        root.addEventListener('click', e => {
          if (e.target.closest('[data-clearmatch]')) clearMatch();
        });

        if (p.clientId) {
          const known = dir.filter(x => x.clientId === p.clientId)[0];
          if (known) { phone.value = known.phone; fill(known); }
        }

        U.qs('[data-save]', root).onclick = () => {
          const name = U.qs('#ldName', root).value.trim();
          const ph = phone.value.trim();
          if (!name || !ph) { U.toast('Name and phone are required', { tone: 'err' }); return; }

          const svcs = U.qsa('input[name=svc]:checked', root).map(i => i.value);
          const value = svcs.reduce((s, id) => s + ((S.service(id) || {}).price || 0), 0);
          const follow = U.qs('#ldFollow', root).value;
          const owner = U.qs('#ldOwner', root).value || defaultOwner();
          const db = S.get();
          db.seq.lead++;
          db.leads.unshift({
            id: 'LD-' + db.seq.lead, name: name, phone: ph,
            email: U.qs('#ldEmail', root).value.trim(),
            source: U.qs('#ldSource', root).value,
            type: U.qs('#ldType', root).value,
            area: U.qs('#ldArea', root).value.trim() || 'Chennai',
            interest: svcs,
            stage: follow ? 'followup' : 'new',
            followUp: follow || '', followUpTime: follow ? '10:00' : '',
            inspectAt: '', inspectTime: '', inspectBy: '',
            clientId: (matched && matched.clientId) || '',
            branch: U.qs('#ldBranch', root).value,
            value: value, owner: owner,
            created: S.todayISO(),
            note: U.qs('#ldNote', root).value.trim() || 'New lead captured.',
            log: [{ at: S.todayISO(), text: 'Lead captured' + (matched ? ' — returning customer' : ''), by: (S.me() || {}).id || '' }]
          });
          S.save(); close(); App.refresh();
          U.toast('Lead captured', { sub: name + ' assigned to ' + S.userName(owner) });
        };
      }
    });
  }

  /* ---------------------------------------------------------------- view */
  V.leads = {
    title: 'Leads',
    newLead: newLead,
    render(ctx) {
      const open = S.get().leads.filter(S.isOpenLead);
      const dueNow = dueCount();
      return C.pageHead({
        title: 'Leads',
        sub: open.length + ' open · ' + S.money(open.reduce((a, b) => a + b.value, 0)) + ' in pipeline' +
             (dueNow ? ' · ' + dueNow + ' due today or overdue' : ''),
        actions: `<div class="seg">
            <button data-mode="board" class="${mode === 'board' ? 'on' : ''}">Pipeline</button>
            <button data-mode="list" class="${mode === 'list' ? 'on' : ''}">List</button>
          </div>
          <button class="btn btn-primary btn-sm" data-new>${ico('plus')} New lead</button>`
      }) +
      C.searchRow('Search leads by name, phone or area…', '', 'lq') +
      (mode === 'board' ? board() : list());
    },
    mount(root, ctx) {
      const q = U.qs('#lq', root);
      if (q) {
        q.value = query;
        q.addEventListener('input', U.debounce(() => { query = q.value; ctx.refresh(); }, 220));
      }
      root.addEventListener('click', e => {
        if (e.target.closest('[data-new]')) return newLead();

        const mb = e.target.closest('[data-mode]');
        if (mb) { mode = mb.getAttribute('data-mode'); ctx.refresh(); return; }

        const wa = e.target.closest('[data-wa]');
        if (wa && wa.getAttribute('data-wa')) {
          const l = S.lead(wa.getAttribute('data-wa'));
          U.whatsapp(l.phone, `Hello ${l.name}, following up on your pest control requirement. Shall we arrange a free site inspection?`);
          return;
        }
        const qb = e.target.closest('[data-quote]');
        if (qb && qb.getAttribute('data-quote')) {
          if (V.quotations && V.quotations.newQuote) V.quotations.newQuote({ leadId: qb.getAttribute('data-quote') });
          return;
        }
        const lc = e.target.closest('[data-lead]');
        if (lc) openLead(lc.getAttribute('data-lead'));
      });
    }
  };
})(window);
