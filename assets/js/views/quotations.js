/* ==========================================================================
   View: Quotations — list, builder, printable document, AMC conversion
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'all';
  let query = '';

  const FREQS = ['Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

  function partyName(q) {
    if (q.clientId) return S.clientName(q.clientId);
    const l = S.lead(q.leadId);
    return l ? l.name : '—';
  }
  function partyOf(q) {
    // A quotation unpacked from a link brings its customer with it, so it can
    // be rendered on a device that has never seen this database.
    if (q._party) return q._party;
    if (q.clientId) return S.client(q.clientId);
    const l = S.lead(q.leadId);
    return l ? { name: l.name, addr: l.area, city: 'Chennai', pin: '', gstin: '', phone: l.phone, email: l.email, contact: l.name } : null;
  }

  /* =================================================================== list */
  function listRows() {
    const q = query.toLowerCase();
    return S.get().quotations.filter(x => {
      if (tab !== 'all' && x.status !== tab) return false;
      if (!q) return true;
      return (x.id + x.title + partyName(x)).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderList(ctx) {
    const all = S.get().quotations;
    const counts = { all: all.length };
    ['draft', 'sent', 'approved', 'rejected'].forEach(s => { counts[s] = all.filter(x => x.status === s).length; });
    const rows = listRows();
    const openVal = all.filter(x => x.status === 'sent').reduce((s, x) => s + S.quoteTotals(x).total, 0);

    return C.pageHead({
      title: 'Quotations',
      sub: all.length + ' quotations · ' + S.money(openVal) + ' awaiting customer response',
      actions: `<button class="btn btn-ghost btn-sm" data-act="tpl">${ico('book')} Templates</button>
                <button class="btn btn-primary btn-sm" data-new>${ico('plus')} New quotation</button>`
    }) +
    C.tabsBar([
      { id: 'all', label: 'All', n: counts.all },
      { id: 'draft', label: 'Draft', n: counts.draft },
      { id: 'sent', label: 'Sent', n: counts.sent },
      { id: 'approved', label: 'Approved', n: counts.approved },
      { id: 'rejected', label: 'Rejected', n: counts.rejected }
    ], tab) +
    `<div class="mt-16">` + C.searchRow('Search by number, customer or title…', '', 'qq') + `</div>` +
    (rows.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th>Quotation</th><th>Customer / Lead</th><th>Type</th>
        <th class="r">Value</th><th>Valid till</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows.map(x => {
        const t = S.quoteTotals(x);
        const st = S.QUOTE_STATUS[x.status];
        const days = S.dayDelta(x.valid);
        return `<tr class="clickable" data-go="#/quotations/${x.id}">
          <td><div class="row g-8">
            <div class="tile-ico ${x.mode === 'amc' ? 'i-violet' : 'i-blue'}">${ico(x.mode === 'amc' ? 'shield' : 'filetext')}</div>
            <div style="min-width:0"><div class="fw-6 truncate" style="max-width:270px">${esc(x.title)}</div>
            <div class="t-sm muted mono">${esc(x.id)} · ${esc(S.fmtDate(x.date))}</div></div>
          </div></td>
          <td class="t-base">${esc(partyName(x))}</td>
          <td>${x.mode === 'amc'
            ? `<span class="badge b-violet">${ico('shield')}AMC · ${x.months || 12} mo</span>
               <div class="t-xs muted mt-2">${(x.items || []).reduce((n, i) => n + lineVisits(i), 0)} visits</div>`
            : `<span class="badge b-blue">One-time</span>`}</td>
          <td class="r fw-7">${S.money(t.total)}</td>
          <td class="t-sm ${days < 0 ? 'danger' : days < 4 ? 'warn' : 'muted'}">${esc(S.fmtDate(x.valid))}<br><span class="t-xs">${days < 0 ? 'expired' : days + ' days left'}</span></td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td class="tight"><div class="row g-4 nowrap">
            ${x.contractId ? '' : `<button class="iconbtn" data-editq="${attr(x.id)}" title="Edit ${attr(x.id)}">${ico('pen', '', 14)}</button>`}
            ${ico('cright', 'muted-2', 15)}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`
    : U.empty({ icon: 'filetext', title: 'No quotations here', text: 'Create one from a lead or straight from the service catalogue.',
        action: `<button class="btn btn-primary" data-new>${ico('plus')} New quotation</button>` }));
  }

  /* ================================================================ builder */
  /**
   * How many times a quoted line is delivered. Newer quotations say it
   * outright; older ones only ever put it in the quantity, which was fine
   * while every service was charged per visit.
   */
  function lineVisits(i) {
    if (i.visits) return i.visits;
    const svc = S.service(i.svId);
    if (svc && !/per visit/i.test(svc.unit || '')) return 1;
    return Math.max(1, Math.round(i.qty || 1));
  }

  function itemRowHtml(it, i) {
    const svcOpts = S.get().services.map(s =>
      `<option value="${attr(s.id)}"${it && it.svId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    return `<div class="li-row" data-row>
      <div>
        <select class="select" data-f="svc">${svcOpts}<option value="">— Custom item —</option></select>
        <input class="input mt-8" data-f="desc" placeholder="Description shown on the quotation"
               value="${attr(it ? it.desc : '')}" style="height:34px;font-size:12.5px">
        <div class="li-sched" data-sched>
          <span>Deliver</span>
          <input class="input" data-f="visits" type="number" min="1" step="1"
                 value="${attr(it ? lineVisits(it) : 1)}" title="How many times this service happens">
          <span>${(it && lineVisits(it) === 1) ? 'time' : 'times'} over</span>
          <input class="input" data-f="months" type="number" min="1" step="1"
                 value="${attr(it && it.months ? it.months : 12)}" title="Over how many months">
          <span>months</span>
          <span class="cad" data-f="cad">—</span>
        </div>
      </div>
      <div class="li-sub" style="display:contents">
        <input class="input" data-f="qty" type="number" min="0" step="0.5" value="${attr(it ? it.qty : 1)}">
        <input class="input" data-f="rate" type="number" min="0" step="50" value="${attr(it ? it.rate : 0)}">
        <input class="input" data-f="amt" readonly value="0">
      </div>
      <button class="iconbtn" data-rm title="Remove">${ico('trash', '', 15)}</button>
    </div>`;
  }

  /** One searchable row: everything you might type to find this party. */
  function partyIndex() {
    const out = [];
    S.get().clients.forEach(c => out.push({
      key: 'C:' + c.id, kind: 'customer', id: c.id, name: c.name,
      sub: [c.type, c.city].filter(Boolean).join(' · '),
      hint: c.gstin || '',
      hay: [c.name, c.contact, c.phone, c.email, c.city, c.gstin, c.id].join(' ').toLowerCase()
    }));
    S.get().leads.filter(S.isOpenLead).forEach(l => out.push({
      key: 'L:' + l.id, kind: 'lead', id: l.id, name: l.name,
      sub: [l.type, l.area].filter(Boolean).join(' · '),
      hint: 'Lead ' + l.id,
      hay: [l.name, l.phone, l.email, l.area, l.id].join(' ').toLowerCase()
    }));
    return out;
  }

  /**
   * What the quotation is being raised against, spelled out: where it is
   * billed, where the work happens, and the GST position. Read straight off
   * the customer record so nothing is retyped — and so a missing GSTIN is
   * obvious before the document goes out.
   */
  function partyPanel(key) {
    if (!key) {
      return `<div class="banner ban-blue">${ico('search')}<div>Start typing a customer or lead name above — billing, site and GST details fill in here.</div></div>`;
    }
    const id = key.slice(2);

    if (key.charAt(0) === 'L') {
      const l = S.lead(id);
      if (!l) return '';
      return `<div class="card card-pad" style="background:var(--surface-2)">
        <div class="row between g-10 mb-10">
          <span class="badge b-blue badge-lg">${ico('userplus')}Lead ${esc(l.id)}</span>
          <span class="t-sm muted">${esc(l.branch ? S.branchName(l.branch) : 'No branch')}</span>
        </div>
        ${C.kv([
          ['Contact', l.phone],
          ['Email', l.email || '—'],
          ['Location', l.area],
          ['Property type', l.type],
          ['GST details', 'Not on file — captured when the lead becomes a customer']
        ])}
      </div>`;
    }

    const c = S.client(id);
    if (!c) return '';
    const b = c.billing || {};
    const st = c.site || {};
    const lines = a => [a.attn, a.street1, a.street2,
      [a.city, a.state].filter(Boolean).join(', '),
      [a.pin, a.country].filter(Boolean).join(' ')].filter(Boolean);
    const billLines = lines(b).length ? lines(b)
      : [c.addr, c.city, c.pin].filter(Boolean);
    const siteLines = lines(st).length ? lines(st) : billLines;

    return `<div class="card card-pad" style="background:var(--surface-2)">
      <div class="grid grid-2 g-24">
        <div>
          <div class="t-xs muted fw-6" style="letter-spacing:.05em">BILLING ADDRESS</div>
          <div class="t-sm mt-6" style="line-height:1.65">${billLines.map(esc).join('<br>')}</div>
        </div>
        <div>
          <div class="t-xs muted fw-6" style="letter-spacing:.05em">SITE / SHIPPING ADDRESS</div>
          <div class="t-sm mt-6" style="line-height:1.65">${siteLines.map(esc).join('<br>')}</div>
        </div>
      </div>
      <div class="divider mt-14 mb-14"></div>
      <div class="grid grid-2 g-24">
        <div>
          <div class="t-xs muted fw-6" style="letter-spacing:.05em">RECIPIENT GST DETAILS</div>
          <div class="t-sm mt-6" style="line-height:1.7">
            GST treatment: <strong>${esc(c.gstTreatment || 'Not set')}</strong><br>
            GSTIN: ${c.gstin ? `<strong class="mono">${esc(c.gstin)}</strong>`
              : `<span class="danger">Not on file</span>`}${c.pan ? `<br>PAN: <span class="mono">${esc(c.pan)}</span>` : ''}
          </div>
        </div>
        <div>
          <div class="t-xs muted fw-6" style="letter-spacing:.05em">ACCOUNT</div>
          <div class="t-sm mt-6" style="line-height:1.7">
            ${esc(c.contact || '—')} · ${esc(c.phone || '—')}<br>
            Payment terms: ${esc(c.paymentTerms || 'Due on Receipt')}<br>
            Customer since ${esc(S.fmtDate(c.since))}
          </div>
        </div>
      </div>
    </div>`;
  }

  function newQuote(pre) {
    const p = pre || {};
    // Editing reuses the whole builder — only the defaults and the save differ.
    const edit = p.edit || null;
    const q0 = edit || {};
    // Nothing about the caller's record changes until a quotation actually
    // exists. `back` runs when one is saved, `cancel` when the builder is
    // dismissed with nothing raised.
    let saved = false;
    const clients = S.get().clients;
    const leads = S.get().leads.filter(S.isOpenLead);
    const lead = (edit ? (q0.leadId ? S.lead(q0.leadId) : null) : (p.leadId ? S.lead(p.leadId) : null));

    const startKey = edit
      ? (q0.clientId ? 'C:' + q0.clientId : (q0.leadId ? 'L:' + q0.leadId : ''))
      : (p.clientId ? 'C:' + p.clientId : (p.leadId ? 'L:' + p.leadId : ''));
    const startParty = startKey ? partyIndex().filter(x => x.key === startKey)[0] : null;
    const startClient = edit ? (q0.clientId ? S.client(q0.clientId) : null)
                             : (p.clientId ? S.client(p.clientId) : null);
    const nextQuoteNo = edit ? q0.id : 'QT-' + (S.get().seq.quote + 1);

    const body = `
      <div class="grid grid-2">
        ${U.field('Raise for', `<div class="cbx">
            <input class="input" id="qPartyQ" autocomplete="off" placeholder="Type a name, phone or GSTIN…"
              value="${attr(startParty ? startParty.name : '')}">
            <input type="hidden" id="qParty" value="${attr(startKey)}">
            <div class="cbx-menu" id="qPartyMenu" style="display:none"></div>
          </div>`, 'Customers and open leads — matches on name, contact, phone, city or GSTIN.', true)}
        ${U.field('Quotation type', `<select class="select" id="qMode">
            <option value="onetime"${q0.mode === 'onetime' ? ' selected' : ''}>One-time service</option>
            <option value="amc"${q0.mode === 'onetime' ? '' : ' selected'}>AMC — annual maintenance contract</option>
          </select>`)}
      </div>

      <div class="mt-14" id="qPartyPanel">${partyPanel(startKey)}</div>

      <div class="mt-14">${U.field('Title / subject', `<input class="input" id="qTitle" placeholder="e.g. Annual Pest Management — Fresh Basket, Anna Nagar"
        value="${attr(edit ? q0.title : (lead ? 'Pest Management Proposal — ' + lead.name : ''))}">`, 'What the customer sees at the top of the document.', true)}</div>

      <div class="grid grid-4 mt-14">
        ${U.field('Quotation no.', `<input class="input mono" id="qNo" value="${attr(nextQuoteNo)}">`)}
        ${U.field('Reference no.', `<input class="input" id="qRef" value="${attr(q0.refNo || '')}" placeholder="Customer PO or enquiry ref">`)}
        ${U.field('Quotation date', `<input class="input" id="qDate" type="date" value="${attr(edit ? q0.date : S.todayISO())}">`)}
        ${U.field('Valid till', `<input class="input" id="qValid" type="date" value="${attr(edit ? q0.valid : Seed.D(15))}">`)}
      </div>

      <div class="grid grid-3 mt-14">
        ${U.field('Place of supply', `<select class="select" id="qPos">${U.selectOpts(Seed.STATES, null, null,
          q0.placeOfSupply || (startClient && startClient.placeOfSupply) || 'Tamil Nadu')}</select>`, 'Within Tamil Nadu this splits into CGST + SGST; any other state is charged as a single IGST line.')}
        ${U.field('Location / branch', `<select class="select" id="qBranch">
          ${(S.get().branches || []).map(b => `<option value="${attr(b.id)}"${b.id === (q0.branch || (startClient || {}).branch) ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`)}
        ${U.field('Salesperson', `<select class="select" id="qOwner">
          ${S.assignableUsers().map(u => `<option value="${attr(u.id)}"${u.id === (q0.owner || (S.me() || {}).id) ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`)}
      </div>

      <div class="divider mt-18 mb-14"></div>

      <div class="row between mb-8">
        <strong style="font-size:13.5px">Line items</strong>
        <button class="btn btn-soft btn-sm" id="addItem">${ico('plus')} Add item</button>
      </div>
      <div class="li-row li-head desk-only" style="padding-bottom:6px">
        <div>Service</div><div>Qty</div><div>Rate (₹)</div><div>Amount (₹)</div><div></div>
      </div>
      <div id="items"></div>

      <div class="grid grid-2 mt-16">
        ${U.field('Discount (₹)', `<input class="input" id="qDisc" type="number" min="0" step="500" value="${attr(q0.discount || 0)}">`)}
        <div class="card card-pad" style="background:var(--surface-2)">
          <div class="row between t-base mb-6"><span class="muted">Subtotal</span><strong id="tSub">₹0</strong></div>
          <div class="row between t-base mb-6"><span class="muted">Discount</span><strong id="tDisc">₹0</strong></div>
          <div id="tTax"></div>
          <div class="divider mb-6"></div>
          <div class="row between"><strong>Total</strong><strong class="t-lg brand" id="tTot">₹0</strong></div>
        </div>
      </div>

      <div class="grid grid-2 mt-14">
        ${U.field('Customer notes',
          `<textarea class="textarea" id="qNotes" placeholder="Timing restrictions, chemical preferences, access instructions…">${esc(edit ? (q0.notes || '') : (lead ? lead.note : ''))}</textarea>`,
          'Printed on the quotation.')}
        ${U.field('Terms & conditions',
          `<textarea class="textarea" id="qTerms">${esc(((edit && q0.terms && q0.terms.length ? q0.terms : (S.get().company.terms || []))).join('\n'))}</textarea>`,
          'Pre-filled from Settings — edit for this quotation only.')}
      </div>

      <div class="divider mt-18 mb-14"></div>
      <div class="row between mb-10">
        <strong style="font-size:13.5px">Digital signatures</strong>
        <span class="t-xs muted">Optional here, required before a contract</span>
      </div>
      <div id="qSigWrap">${sigSection(q0.owner || (S.me() || {}).id,
        (startClient && startClient.contact) || (lead && lead.name) || 'Customer')}</div>`;

    U.modal({
      title: edit ? 'Edit quotation' : 'New quotation',
      sub: edit ? q0.id + ' · ' + (S.QUOTE_STATUS[q0.status] || {}).label : 'Generates a GST-compliant document you can send immediately',
      size: 'xl',
      body: body,
      onClose() { if (!saved && typeof p.cancel === 'function') p.cancel(); },
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save="${attr(edit ? (q0.status || 'draft') : 'draft')}">${ico('check')} ${edit ? 'Save changes' : 'Save quotation'}</button>`,
      onMount(root, close) {
        // Same capture the contract uses. One implementation, one behaviour.
        let sig = C.sigMount(root, { cust: q0.signCustomer || '', exec: q0.signExec || '' });

        // Change who is raising it and the signature on the document follows.
        const ownerSel = U.qs('#qOwner', root);
        const sigWrap = U.qs('#qSigWrap', root);
        if (ownerSel && sigWrap) ownerSel.addEventListener('change', function () {
          const keep = { cust: (sig.cust && sig.cust.data) || '', exec: (sig.exec && sig.exec.data) || '' };
          const nameEl = U.qs('#qPartyQ', root);
          sigWrap.innerHTML = sigSection(ownerSel.value, (nameEl && nameEl.value) || 'Customer');
          sig = C.sigMount(sigWrap, keep);
        });

        /* ------------------------------------------- live customer search */
        const idx = partyIndex();
        const qInp = U.qs('#qPartyQ', root);
        const qVal = U.qs('#qParty', root);
        const qMenu = U.qs('#qPartyMenu', root);
        const qPanel = U.qs('#qPartyPanel', root);
        let hits = [];
        let cursor = -1;

        function paintPanel() {
          qPanel.innerHTML = partyPanel(qVal.value);
          const c = qVal.value.charAt(0) === 'C' ? S.client(qVal.value.slice(2)) : null;
          // The customer's own GST state and branch win over the defaults.
          if (c) {
            if (c.placeOfSupply) U.qs('#qPos', root).value = c.placeOfSupply;
            if (c.branch) U.qs('#qBranch', root).value = c.branch;
          }
        }

        function closeMenu() { qMenu.style.display = 'none'; cursor = -1; }

        function renderMenu(list) {
          hits = list;
          if (!list.length) {
            qMenu.innerHTML = `<div class="cbx-empty">No customer or open lead matches that.</div>`;
            qMenu.style.display = 'block';
            return;
          }
          qMenu.innerHTML = list.map((x, i) => `<button type="button" class="cbx-row${i === cursor ? ' on' : ''}" data-pick="${i}">
            <span class="tile-ico ${x.kind === 'customer' ? 'i-brand' : 'i-blue'}" style="width:26px;height:26px">
              ${ico(x.kind === 'customer' ? 'building' : 'userplus', '', 13)}</span>
            <span class="grow" style="min-width:0">
              <span class="cbx-nm">${esc(x.name)}</span>
              <span class="cbx-sub">${esc(x.sub || '')}</span>
            </span>
            <span class="t-xs muted mono nowrap">${esc(x.hint || '')}</span>
          </button>`).join('');
          qMenu.style.display = 'block';
        }

        function search(show) {
          const q = qInp.value.trim().toLowerCase();
          const list = q ? idx.filter(x => x.hay.indexOf(q) >= 0) : idx;
          renderMenu(list.slice(0, 8));
          if (!show) closeMenu();
        }

        function pick(i) {
          const x = hits[i];
          if (!x) return;
          qVal.value = x.key;
          qInp.value = x.name;
          closeMenu();
          qInp.blur();     // the choice is made; refocusing should not reopen the list
          paintPanel();
          // A quotation for a named party should title itself.
          const t = U.qs('#qTitle', root);
          if (!t.value.trim()) t.value = 'Pest Management Proposal — ' + x.name;
        }

        // Click, type or press Down opens the list. Not `focus` — the modal
        // auto-focuses its first input, and the list should not fly open
        // before the user has asked for it.
        qInp.addEventListener('click', () => search(true));
        qInp.addEventListener('input', () => {
          qVal.value = '';          // typing invalidates the previous choice
          search(true);
        });
        qInp.addEventListener('keydown', e => {
          const shut = qMenu.style.display === 'none';
          if (shut && (e.key === 'ArrowDown' || e.key === 'Enter')) { search(true); return; }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            cursor += (e.key === 'ArrowDown' ? 1 : -1);
            if (cursor < 0) cursor = hits.length - 1;
            if (cursor >= hits.length) cursor = 0;
            renderMenu(hits);
            return;
          }
          if (e.key === 'Enter') { e.preventDefault(); pick(cursor < 0 ? 0 : cursor); return; }
          if (e.key === 'Escape') closeMenu();
        });
        qMenu.addEventListener('mousedown', e => {
          const b = e.target.closest('[data-pick]');
          if (b) { e.preventDefault(); pick(parseInt(b.getAttribute('data-pick'), 10)); }
        });
        qInp.addEventListener('blur', () => setTimeout(closeMenu, 120));

        const items = U.qs('#items', root);
        if (edit && (q0.items || []).length) {
          q0.items.forEach(it => items.insertAdjacentHTML('beforeend', itemRowHtml(it)));
        } else {
          const seed = lead ? lead.interest : (p.serviceIds || ['SV01']);
          seed.forEach(sid => {
            const s = S.service(sid);
            items.insertAdjacentHTML('beforeend', itemRowHtml({ svId: sid, desc: s ? s.desc : '', qty: 1, rate: s ? s.price : 0 }));
          });
        }

        function recalc() {
          let sub = 0;
          U.qsa('[data-row]', items).forEach(r => {
            const qty = parseFloat(U.qs('[data-f=qty]', r).value) || 0;
            const rate = parseFloat(U.qs('[data-f=rate]', r).value) || 0;
            const amt = qty * rate;
            U.qs('[data-f=amt]', r).value = Math.round(amt).toLocaleString('en-IN');
            sub += amt;
          });
          const disc = parseFloat(U.qs('#qDisc', root).value) || 0;
          const taxable = Math.max(0, sub - disc);
          // Place of supply is still what decides the rate and the wording.
          const t = S.taxSplit(taxable, U.qs('#qPos', root).value);
          U.qs('#tSub', root).textContent = S.money(sub);
          U.qs('#tDisc', root).textContent = '− ' + S.money(disc);
          U.qs('#tTax', root).innerHTML = S.taxRows(t).map(r =>
            `<div class="row between t-base mb-6"><span class="muted">${esc(r[0])}</span><strong>${S.money(r[1])}</strong></div>`
          ).join('') + (t.interState
            ? `<div class="t-xs muted mb-6">Supplied to ${esc(t.place)} — IGST applies.</div>`
            : '');
          U.qs('#tTot', root).textContent = S.money(taxable + t.gst);
        }

        /** A one-time job has no schedule to spread, so the strips come off. */
        /**
         * Show each line what its numbers actually mean: how far apart the
         * visits land, given how many there are and how long the term is.
         */
        function syncSchedules() {
          const start = S.todayISO();
          U.qsa('[data-row]', items).forEach(r => {
            const cad = U.qs('[data-f=cad]', r);
            if (!cad) return;
            const visits = Math.max(1, parseInt(U.qs('[data-f=visits]', r).value, 10) || 1);
            const months = Math.max(1, parseInt(U.qs('[data-f=months]', r).value, 10) || 1);
            const term = Seed.daysBetween(start, Seed.addMonths(start, months));
            const gap = term / visits;
            cad.textContent = visits === 1
              ? 'once, on day one'
              : Seed.cadenceLabel(gap, visits).toLowerCase() + ' · every ' + Math.round(gap) + ' days';
            const word = U.qs('[data-f=visits]', r).nextElementSibling;
            if (word) word.textContent = (visits === 1 ? 'time' : 'times') + ' over';
          });
        }

        /** Visits follow the quantity on anything charged per visit. */
        function syncVisitsFromQty(row) {
          const sel = U.qs('[data-f=svc]', row);
          const svc = S.service(sel ? sel.value : '');
          const vis = U.qs('[data-f=visits]', row);
          if (!vis || vis.getAttribute('data-touched')) return;
          if (svc && /per visit/i.test(svc.unit || '')) {
            vis.value = Math.max(1, Math.round(parseFloat(U.qs('[data-f=qty]', row).value) || 1));
          }
        }

        function syncMode() {
          const amc = U.qs('#qMode', root).value === 'amc';
          U.qsa('[data-sched]', root).forEach(el => el.classList.toggle('off', !amc));
        }

        U.qs('#addItem', root).onclick = () => {
          items.insertAdjacentHTML('beforeend', itemRowHtml(null));
          recalc(); syncMode(); syncSchedules();
        };
        items.addEventListener('click', e => {
          if (e.target.closest('[data-rm]')) {
            if (U.qsa('[data-row]', items).length <= 1) { U.toast('Keep at least one line item', { tone: 'err' }); return; }
            e.target.closest('[data-row]').remove(); recalc();
          }
        });
        items.addEventListener('input', e => {
          const row = e.target.closest('[data-row]');
          if (row) {
            // Typing straight into Visits means the operator owns that number.
            if (e.target.matches('[data-f=visits]')) e.target.setAttribute('data-touched', '1');
            if (e.target.matches('[data-f=qty]')) syncVisitsFromQty(row);
          }
          recalc();
          syncSchedules();
        });
        items.addEventListener('change', e => {
          const sel = e.target.closest('[data-f=svc]');
          if (sel) {
            const s = S.service(sel.value);
            const row = sel.closest('[data-row]');
            if (s) {
              U.qs('[data-f=rate]', row).value = s.price;
              U.qs('[data-f=desc]', row).value = s.desc;
              const vis = U.qs('[data-f=visits]', row);
              const mon = U.qs('[data-f=months]', row);
              if (vis && !vis.getAttribute('data-touched')) {
                // Start from what the catalogue says this service normally does.
                const step = Seed.FREQ_MONTHS[s.defaultFreq] || 1;
                const months = Math.max(1, parseInt(mon.value, 10) || 12);
                vis.value = /per visit/i.test(s.unit || '')
                  ? Math.max(1, Math.round(parseFloat(U.qs('[data-f=qty]', row).value) || 1))
                  : Math.max(1, Math.round(months / step));
              }
            }
            recalc(); syncSchedules();
          }
        });
        U.qs('#qDisc', root).addEventListener('input', recalc);
        U.qs('#qPos', root).addEventListener('change', recalc);
        U.qs('#qMode', root).addEventListener('change', syncMode);
        syncMode(); recalc(); syncSchedules();

        U.qsa('[data-save]', root).forEach(btn => {
          btn.onclick = () => {
            // Who it is for comes first — it is the top field and it fills
            // the title in for you, so flagging it first saves a round trip.
            const partyVal = U.qs('#qParty', root).value;
            if (!partyVal) {
              U.toast('Pick who this is for', { tone: 'err', sub: 'Type a name in “Raise for” and choose from the list' });
              U.qs('#qPartyQ', root).focus();
              return;
            }
            const title = U.qs('#qTitle', root).value.trim();
            if (!title) { U.toast('Give the quotation a title', { tone: 'err' }); return; }
            const isClient = partyVal.charAt(0) === 'C';
            const pid = partyVal.slice(2);
            const mode = U.qs('#qMode', root).value;

            const lineItems = U.qsa('[data-row]', items).map(r => {
              const sid = U.qs('[data-f=svc]', r).value;
              const s = S.service(sid);
              return {
                svId: sid || null,
                name: s ? s.name : 'Custom service',
                desc: U.qs('[data-f=desc]', r).value.trim(),
                qty: parseFloat(U.qs('[data-f=qty]', r).value) || 1,
                rate: parseFloat(U.qs('[data-f=rate]', r).value) || 0,
                unit: s ? s.unit : 'nos',
                // How often this one service happens, independent of the others.
                visits: Math.max(1, parseInt(U.qs('[data-f=visits]', r).value, 10) || 1),
                months: Math.max(1, parseInt(U.qs('[data-f=months]', r).value, 10) || 12)
              };
            }).filter(x => x.rate > 0 || x.name);

            const db = S.get();
            if (!edit) db.seq.quote++;
            const typed = U.qs('#qNo', root).value.trim();
            const free = typed && !db.quotations.some(x => x.id === typed && x !== edit);
            const q = edit || {};
            Object.assign(q, {
              id: free ? typed : (edit ? q0.id : 'QT-' + db.seq.quote),
              clientId: isClient ? pid : null,
              leadId: isClient ? null : pid,
              date: U.qs('#qDate', root).value || S.todayISO(),
              valid: U.qs('#qValid', root).value || Seed.D(15),
              owner: U.qs('#qOwner', root).value || (S.me() || {}).id || 'U03',
              refNo: U.qs('#qRef', root).value.trim(),
              placeOfSupply: U.qs('#qPos', root).value,
              branch: U.qs('#qBranch', root).value,
              terms: U.qs('#qTerms', root).value.split('\n').map(x => x.trim()).filter(Boolean),
              status: btn.getAttribute('data-save'),
              title: title, mode: mode,
              freq: '',
              months: mode === 'amc'
                ? lineItems.reduce((m, i) => Math.max(m, i.months || 0), 0) || 12 : 0,
              items: lineItems,
              discount: parseFloat(U.qs('#qDisc', root).value) || 0,
              notes: U.qs('#qNotes', root).value.trim(),
              signCustomer: (sig.cust && sig.cust.data) || q0.signCustomer || '',
              signExec: (S.user(U.qs('#qOwner', root).value) || {}).sign ||
                (sig.exec && sig.exec.data) || q0.signExec || ''
            });
            if (!edit) db.quotations.unshift(q);
            saved = true;
            if (!isClient) { const l = S.lead(pid); if (l && l.stage !== 'won') { l.stage = 'quoted'; l.followUp = ''; } }
            S.save(); close();

            U.toast(edit ? 'Quotation updated' : 'Quotation saved', {
              sub: q.id + ' · ' + S.money(S.quoteTotals(q).total) +
                (edit ? '' : ' — send it on WhatsApp when you are ready')
            });
            App.refresh();
            // Raised from a lead card? Go back to that card instead of the
            // quotation screen — the lead is where the whole story lives.
            if (!edit && typeof p.back === 'function') p.back(q);
            else location.hash = '#/quotations/' + q.id;
          };
        });
      }
    });
  }

  /* =============================================================== document */
  function docHtml(q) {
    const co = S.get().company;
    const party = partyOf(q) || {};
    const t = S.quoteTotals(q);
    const st = S.QUOTE_STATUS[q.status];
    const stampColor = { approved: 'var(--success-500)', rejected: 'var(--danger-500)', sent: 'var(--info-500)', draft: 'var(--muted-2)', expired: 'var(--warn-500)' }[q.status];

    return `<div class="doc"><div class="doc-inner">
      <div class="doc-head">
        <div>
          <div class="row g-10 mb-10">
            <div class="brandmark" style="width:38px;height:38px">${ico('shieldcheck')}</div>
            <div>
              <div class="doc-co-name">${esc(co.name)}</div>
              <div class="doc-co-line">${esc(co.tagline)}</div>
            </div>
          </div>
          <div class="doc-co-line">${esc(co.addr1)}<br>${esc(co.addr2)}<br>
            ${esc(co.phone)} · ${esc(co.email)}<br>
            GSTIN: ${esc(co.gstin)} · Licence: ${esc(co.licence)}</div>
        </div>
        <div style="text-align:right">
          <div class="doc-stamp" style="color:${stampColor};border-color:${stampColor}">${esc(st.label)}</div>
          <div class="doc-title">QUOTATION</div>
          <div class="doc-no">${esc(q.id)}</div>
          <div class="doc-co-line mt-8">
            Date: <strong>${esc(S.fmtDate(q.date))}</strong><br>
            Valid till: <strong>${esc(S.fmtDate(q.valid))}</strong>
          </div>
        </div>
      </div>

      <div class="doc-hr"></div>

      <div class="row-top between g-24 wrap">
        <div style="min-width:220px">
          <div class="doc-sec-label">Quotation for</div>
          <div style="font-size:14.5px;font-weight:700">${esc(party.name || '—')}</div>
          <div class="doc-co-line mt-4">
            ${esc(party.contact || '')}<br>
            ${esc(party.addr || '')}${party.city ? ', ' + esc(party.city) : ''}${party.pin ? ' — ' + esc(party.pin) : ''}<br>
            ${esc(party.phone || '')}${party.email ? ' · ' + esc(party.email) : ''}
            ${party.gstin ? '<br>GSTIN: ' + esc(party.gstin) : ''}
          </div>
        </div>
        <div style="min-width:200px">
          <div class="doc-sec-label">Scope</div>
          <div style="font-size:13px;font-weight:600;line-height:1.5">${esc(q.title)}</div>
          ${q.mode === 'amc' ? `<div class="doc-co-line mt-6">
            Contract type: <strong>Annual Maintenance Contract</strong><br>
            Duration: <strong>${q.months} months</strong><br>
            Total visits: <strong>${(q.items || []).reduce((n, i) => n + lineVisits(i), 0)}</strong>
          </div>` : `<div class="doc-co-line mt-6">Service type: <strong>One-time treatment</strong></div>`}
        </div>
      </div>

      <div style="margin-top:22px">
        <table class="doc-tbl">
          <thead><tr>
            <th style="width:34px">#</th><th>Service description</th>
            <th class="c" style="width:64px">Qty</th>
            <th class="r" style="width:92px">Rate</th>
            <th class="r" style="width:104px">Amount</th>
          </tr></thead>
          <tbody>${q.items.map((it, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td><div style="font-weight:650">${esc(it.name)}</div>
                ${it.desc ? `<div style="color:var(--muted);font-size:11.5px;line-height:1.5;margin-top:2px">${esc(it.desc)}</div>` : ''}
                <div style="color:var(--muted-2);font-size:10.5px;margin-top:3px">${esc(it.unit || '')}</div></td>
            <td class="c">${it.qty}</td>
            <td class="r">${S.money(it.rate)}</td>
            <td class="r" style="font-weight:650">${S.money(it.qty * it.rate)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="row-top between g-24 mt-18 wrap">
        <div class="grow" style="min-width:230px;max-width:380px">
          <div class="doc-sec-label">Terms &amp; conditions</div>
          <ol style="font-size:11px;color:var(--muted);line-height:1.75;padding-left:15px;list-style:decimal">
            ${co.terms.map(x => `<li>${esc(x)}</li>`).join('')}
          </ol>
          ${q.notes ? `<div class="doc-sec-label" style="margin-top:14px">Special notes</div>
            <div style="font-size:11.5px;color:var(--ink-2);line-height:1.6">${esc(q.notes)}</div>` : ''}
        </div>
        <div class="doc-totals">
          <div class="tr"><span class="muted">Subtotal</span><span>${S.money(t.sub)}</span></div>
          ${t.disc ? `<div class="tr"><span class="muted">Discount</span><span style="color:var(--danger-700)">− ${S.money(t.disc)}</span></div>` : ''}
          <div class="tr"><span class="muted">Taxable value</span><span>${S.money(t.taxable)}</span></div>
          ${S.taxRows(t).map(r => `<div class="tr"><span class="muted">${esc(r[0])}</span><span>${S.money(r[1])}</span></div>`).join('')}
          <div class="tr grand"><span>Total</span><span>${S.money(t.total)}</span></div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:7px;line-height:1.5">
            ${esc(S.amountInWords(t.total))}</div>
        </div>
      </div>

      <div class="doc-hr"></div>

      <div class="row-top between g-24 wrap">
        <div style="font-size:11px;color:var(--muted);line-height:1.7">
          <div class="doc-sec-label">Payment details</div>
          Bank: ${esc(co.bank.name)}<br>
          A/c: ${esc(co.bank.ac)} · IFSC: ${esc(co.bank.ifsc)}<br>
          UPI: ${esc(co.upi)}
        </div>
        <div class="row g-24 wrap">
          ${q.signCustomer ? `<div style="text-align:center;min-width:170px">
            <img src="${attr(q.signCustomer)}" alt="Customer signature"
              style="height:42px;display:block;margin:0 auto">
            <div style="border-top:1px solid var(--line-2);padding-top:7px;font-size:11.5px;font-weight:650">
              Accepted by</div>
            <div style="font-size:10.5px;color:var(--muted)">${esc(party ? party.name : 'Customer')}</div>
          </div>` : ''}
          <div style="text-align:center;min-width:180px">
            ${(q.signExec || (S.user(q.owner) || {}).sign)
              ? `<img src="${attr(q.signExec || (S.user(q.owner) || {}).sign)}" alt="Signature" style="height:42px;display:block;margin:0 auto">`
              : '<div style="height:42px"></div>'}
            <div style="border-top:1px solid var(--line-2);padding-top:7px;font-size:11.5px;font-weight:650">
              For ${esc(co.name)}</div>
            <div style="font-size:10.5px;color:var(--muted)">${esc(S.userName(q.owner))} · Authorised signatory</div>
          </div>
        </div>
      </div>
    </div></div>`;
  }

  /* ========================================================== WhatsApp share */
  /** Absolute link the customer taps to accept or decline. */
  function approveLink(q) {
    return appBase() + '?q=' + encodeURIComponent(q.id) + '#/approve/' + q.id;
  }

  const appBase = () => String(location.href).split('#')[0].split('?')[0];

  /* -------------------------------------------------- the quotation as a URL */
  /**
   * Everything the PDF needs, small enough to ride in a link. Descriptions and
   * terms are left out because both are rebuilt from the catalogue and the
   * company settings, and they are what makes the payload long.
   */
  function packQuote(q) {
    const party = partyOf(q) || {};
    const pick = (o, keys) => keys.reduce((a, k) => { if (o[k] !== undefined && o[k] !== '' && o[k] !== null) a[k] = o[k]; return a; }, {});
    return {
      q: Object.assign(pick(q, ['id', 'date', 'valid', 'title', 'mode', 'months', 'refNo',
        'placeOfSupply', 'owner', 'branch', 'discount', 'notes', 'status', 'signCustomer', 'signExec']), {
        items: (q.items || []).map(i => pick(i, ['svId', 'qty', 'rate', 'visits', 'months']))
      }),
      p: pick(party, ['name', 'contact', 'addr', 'city', 'pin', 'gstin', 'phone', 'email', 'placeOfSupply'])
    };
  }

  /** Turn a packed quotation back into something every render path accepts. */
  function unpackQuote(payload) {
    const q = payload.q || {};
    q.items = (q.items || []).map(function (i) {
      const s = S.service(i.svId) || {};
      return Object.assign({}, i, { name: s.name || '', desc: s.desc || '', rate: i.rate || s.price || 0 });
    });
    q.terms = (S.get().company.terms || []).slice();
    q._party = payload.p || null;
    q.clientId = null; q.leadId = null;
    return q;
  }

  const b64url = {
    enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: t => JSON.parse(decodeURIComponent(escape(atob(
      String(t).replace(/-/g, '+').replace(/_/g, '/')))))
  };

  /**
   * A link that opens the PDF itself.
   *
   * `portable` packs the whole quotation into the URL, so it renders on any
   * device that can reach the app -- a customer's phone included. Without it
   * the link is short but only resolves where this quotation is stored.
   */
  function pdfLink(q, portable) {
    if (!portable) return appBase() + '?q=' + encodeURIComponent(q.id) + '#/pdf/' + q.id;
    return appBase() + '?q=' + encodeURIComponent(q.id) + '&d=' + b64url.enc(packQuote(q)) + '#/pdf/' + q.id;
  }

  /** Services quoted, each with whatever information sheet the catalogue holds. */
  function sheetsFor(q) {
    const seen = {};
    return (q.items || []).map(i => i.svId).filter(id => {
      if (!id || seen[id]) return false;
      seen[id] = 1; return true;
    }).map(id => S.service(id)).filter(Boolean);
  }

  /**
   * The signing block. Whoever raises the document signs it, and their
   * signature comes from their team profile rather than being drawn again
   * every time -- so it is the same mark on every document they issue.
   */
  function sigSection(ownerId, custName) {
    const u = S.user(ownerId) || {};
    const co = S.get().company || {};
    return C.sigBoxes([
      { key: 'cust', label: 'Customer signature', req: false, name: custName },
      { key: 'exec', label: 'For ' + (co.name || 'us'), req: false,
        name: u.name || S.userName(ownerId), onFile: u.sign || '' }
    ]) +
    `<div class="fhint mt-8">${u.sign
      ? U.esc(u.name || '') + '&rsquo;s signature is taken from their team profile and goes on every document they raise.'
      : 'Optional. ' + U.esc(u.name || S.userName(ownerId)) + ' has no signature on file — upload one on their team profile and it will appear here on its own.'}</div>`;
  }

  function messageFor(q) {
    const co = S.get().company;
    const party = partyOf(q);
    const t = S.quoteTotals(q);
    const tpl = S.waTemplate('quote_sent');
    const lines = (q.items || []).map(i =>
      '• ' + i.name + ' — ' + i.qty + ' × ' + S.money(i.rate)).join('\n');

    return S.fillTemplate(tpl ? tpl.body : '', {
      client: party ? (party.contact || party.name) : 'there',
      quote_no: q.id,
      title: q.title,
      amount: S.money(t.total),
      valid_date: S.fmtDate(q.valid),
      service_lines: lines,
      approve_link: approveLink(q),
      pdf_link: pdfLink(q, true),
      company: co.name,
      company_phone: co.phone
    });
  }


  /* ====================================================== the PDF document */
  /**
   * The quotation as an A4 PDF — the same document the print view produces,
   * but as a real file the app holds, so it can be attached to a WhatsApp
   * message instead of asking the user to find it in a print dialog.
   */
  function quotePdf(q) {
    const co = S.get().company;
    const party = partyOf(q);
    const t = S.quoteTotals(q);
    const M = 40;                        // page margin
    const RIGHT = PDF.A4.w - M;
    const BOTTOM = PDF.A4.h - 64;        // leave room for the footer rule
    const d = PDF.doc();
    let page = 1;
    let y = 0;

    const INK = '#111827', MUTE = '#667085', LINE = '#D9DEE7', BRAND = '#0B7454';

    function header() {
      d.rect(0, 0, PDF.A4.w, 86, BRAND);
      d.text(co.name, M, 36, { size: 16, bold: true, color: '#FFFFFF' });
      d.text(co.tagline, M, 54, { size: 8.5, color: '#CDE5DC' });
      d.text('QUOTATION', RIGHT, 34, { size: 13, bold: true, color: '#FFFFFF', align: 'right' });
      d.text(q.id, RIGHT, 52, { size: 10, color: '#CDE5DC', align: 'right' });
      d.text('GSTIN ' + co.gstin + '  ·  Licence ' + co.licence, M, 70, { size: 8, color: '#CDE5DC' });
      y = 112;
    }

    /** Start a fresh page when `h` more points will not fit. */
    function need(h) {
      if (y + h <= BOTTOM) return;
      footer();
      d.page();
      page++;
      header();
      y = 112;
    }

    function footer() {
      d.line(M, BOTTOM + 12, RIGHT, BOTTOM + 12, { color: LINE });
      d.text(co.name + '  ·  ' + co.phone + '  ·  ' + co.email, M, BOTTOM + 28, { size: 8, color: MUTE });
      d.text('Page ' + page, RIGHT, BOTTOM + 28, { size: 8, color: MUTE, align: 'right' });
    }

    header();

    /* ------------------------------------------------------ who and when */
    const half = (RIGHT - M) / 2;
    d.text('QUOTATION FOR', M, y, { size: 8, bold: true, color: MUTE });
    d.text(party ? party.name : '—', M, y + 17, { size: 12, bold: true });
    let ly = y + 33;
    [party && party.contact, party && (party.addr || party.area), party && party.phone,
     party && party.gstin ? 'GSTIN ' + party.gstin : '']
      .filter(Boolean).forEach(row => { d.text(row, M, ly, { size: 9, color: MUTE }); ly += 13; });

    let ry = y + 17;
    [['Quotation no', q.id],
     ['Date', S.fmtDate(q.date)],
     ['Valid till', S.fmtDate(q.valid)],
     ['Type', q.mode === 'amc' ? 'AMC · ' + q.freq + ' · ' + q.months + ' months' : 'One-time service'],
     ['Prepared by', S.userName(q.owner)]
    ].forEach(row => {
      d.text(row[0], M + half + 10, ry, { size: 9, color: MUTE });
      d.text(row[1], RIGHT, ry, { size: 9, bold: true, align: 'right' });
      ry += 14;
    });

    y = Math.max(ly, ry) + 12;
    d.text(q.title, M, y, { size: 11, bold: true });
    y += 22;

    /* ---------------------------------------------------------- the table */
    const cQty = RIGHT - 210, cRate = RIGHT - 120, cAmt = RIGHT;

    function tableHead() {
      d.rect(M, y - 11, RIGHT - M, 20, '#F3F5F8');
      d.text('SERVICE', M + 8, y + 3, { size: 8, bold: true, color: MUTE });
      d.text('QTY', cQty, y + 3, { size: 8, bold: true, color: MUTE, align: 'right' });
      d.text('RATE', cRate, y + 3, { size: 8, bold: true, color: MUTE, align: 'right' });
      d.text('AMOUNT', cAmt - 8, y + 3, { size: 8, bold: true, color: MUTE, align: 'right' });
      y += 24;
    }

    tableHead();
    (q.items || []).forEach(it => {
      const descW = cQty - M - 30;
      const lines = it.desc ? Math.ceil(d.width(it.desc, 8.5) / descW) : 0;
      need(26 + lines * 12);
      if (y === 112) tableHead();

      d.text(it.name, M + 8, y, { size: 9.5, bold: true });
      d.text(String(it.qty) + ' ' + (it.unit || ''), cQty, y, { size: 9.5, align: 'right' });
      d.text(S.money(it.rate), cRate, y, { size: 9.5, align: 'right' });
      d.text(S.money(it.qty * it.rate), cAmt - 8, y, { size: 9.5, bold: true, align: 'right' });
      y += 14;
      if (it.desc) y = d.paragraph(it.desc, M + 8, y, descW, { size: 8.5, color: MUTE, leading: 11.5 });
      y += 6;
      d.line(M, y - 4, RIGHT, y - 4, { color: '#EDF0F4' });
      y += 6;
    });

    /* --------------------------------------------------------- the totals */
    need(150);
    const tx = RIGHT - 210;
    const rows = [['Subtotal', S.money(t.sub)]];
    if (t.disc) rows.push(['Discount', '- ' + S.money(t.disc)]);
    rows.push(['Taxable value', S.money(t.taxable)]);
    S.taxRows(t).forEach(r => rows.push([r[0], S.money(r[1])]));
    rows.forEach(row => {
      d.text(row[0], tx, y, { size: 9.5, color: MUTE });
      d.text(row[1], cAmt - 8, y, { size: 9.5, align: 'right' });
      y += 15;
    });
    d.rect(tx - 12, y - 4, RIGHT - tx + 12, 26, '#F3F5F8');
    d.text('Total incl. GST', tx, y + 12, { size: 10.5, bold: true });
    d.text(S.money(t.total), cAmt - 8, y + 12, { size: 11.5, bold: true, color: BRAND, align: 'right' });
    y += 38;
    y = d.paragraph('Amount in words: ' + S.amountInWords(t.total), M, y, RIGHT - M,
      { size: 9, bold: true, color: INK }) + 10;

    /* ------------------------------------------------- notes, terms, bank */
    if (q.notes) {
      need(60);
      d.text('NOTES', M, y, { size: 8, bold: true, color: MUTE });
      y = d.paragraph(q.notes, M, y + 15, RIGHT - M, { size: 9, color: INK }) + 10;
    }

    const terms = co.terms || [];
    if (terms.length) {
      need(40 + terms.length * 16);
      d.text('TERMS & CONDITIONS', M, y, { size: 8, bold: true, color: MUTE });
      y += 16;
      terms.forEach((line, i) => {
        need(20);
        y = d.paragraph((i + 1) + '. ' + line, M, y, RIGHT - M, { size: 8.5, color: MUTE, leading: 12 }) + 3;
      });
      y += 8;
    }

    need(70);
    d.rect(M, y, RIGHT - M, 52, '#F7F9FB');
    d.text('PAYMENT', M + 10, y + 16, { size: 8, bold: true, color: MUTE });
    d.text(co.bank.name + '  ·  A/C ' + co.bank.ac + '  ·  IFSC ' + co.bank.ifsc, M + 10, y + 31, { size: 8.5 });
    d.text('UPI ' + co.upi, M + 10, y + 44, { size: 8.5 });
    y += 66;

    need(20);
    d.text('This is a computer-generated quotation and does not require a signature.',
      M, y, { size: 7.5, color: MUTE });

    footer();
    return d;
  }

  /**
   * The quotation, with the information sheet of every quoted service copied
   * in after it. One file is what the customer actually wants -- the document
   * they are buying, followed by what each treatment involves.
   */
  function fullQuotePdf(q) {
    const d = quotePdf(q);
    sheetsFor(q).forEach(function (x) {
      if (!x.pdf || !x.pdf.data) return;
      const f = dataUrlToFile(x.pdf.data, x.pdf.name);
      if (!f) return;
      const comma = String(x.pdf.data).indexOf(',');
      const meta = String(x.pdf.data).slice(0, comma);
      if (meta.indexOf('pdf') < 0) return;          // only PDFs have pages
      d.attach(dataUrlBytes(x.pdf.data));
    });
    return d;
  }

  /** The raw bytes behind a data URL. */
  function dataUrlBytes(dataUrl) {
    const comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) return null;
    const meta = dataUrl.slice(0, comma), body = dataUrl.slice(comma + 1);
    if (meta.indexOf('base64') < 0) return null;
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function quotePdfName(q) {
    const party = partyOf(q);
    const who = (party ? party.name : 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return q.id + '-' + who + '.pdf';
  }

  /** Uploaded service sheets are held as data URLs; the share sheet needs files. */
  function dataUrlToFile(dataUrl, name) {
    const comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) return null;
    const meta = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const type = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    let bytes;
    if (meta.indexOf('base64') >= 0) {
      const bin = atob(body);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const txt = decodeURIComponent(body);
      bytes = new Uint8Array(txt.length);
      for (let i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i) & 0xFF;
    }
    const blob = new Blob([bytes], { type: type });
    try { return new File([blob], name, { type: type }); }
    catch (e) { blob.name = name; return blob; }
  }

  /** True when this browser can put files into the OS share sheet. */
  function canShareFiles() {
    try {
      return !!(w.navigator && navigator.canShare && navigator.share &&
        navigator.canShare({ files: [new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' })] }));
    } catch (e) { return false; }
  }

  function shareModal(q, ctx) {
    const party = partyOf(q);
    const svcs = sheetsFor(q);
    const withSheet = svcs.filter(x => x.pdf);
    const without = svcs.filter(x => !x.pdf);
    // Whether this browser can put the files into the share sheet itself.
    const direct = canShareFiles();
    // The sheets are inside the quotation PDF now, so there is one file.
    const total = 1;

    U.modal({
      title: 'Send quotation on WhatsApp',
      sub: q.id + ' · ' + (party ? party.name : '—') + ' · ' + S.money(S.quoteTotals(q).total) + ' incl. GST',
      size: 'md',
      body: `
        ${U.field('Send to', `<input class="input" id="waNum" value="${attr(party ? party.phone : '')}" placeholder="10-digit number, or +country code">`)}
        <div id="waNumHint" class="fhint"></div>

        <div class="mt-16">
          <div class="flabel mb-8">Attachment · one file</div>
          <div class="col g-8">
            <div class="row g-10 card" style="padding:10px 12px">
              <div class="tile-ico i-brand" style="width:30px;height:30px">${ico('filetext', '', 15)}</div>
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-base truncate">${esc(quotePdfName(q))}</div>
                <div class="t-sm muted">The A4 quotation${withSheet.length
                  ? ', with the information sheet for ' + withSheet.length + ' service' +
                    (withSheet.length === 1 ? '' : 's') + ' bound in after it'
                  : ''}</div>
              </div>
              <button class="btn btn-ghost btn-sm nowrap" data-savepdf>${ico('download')} Save</button>
            </div>
            ${withSheet.length ? `<div class="t-sm muted" style="padding:0 2px">Inside it:
              ${withSheet.map(x => esc(x.name)).join(' · ')}</div>` : ''}
          </div>
          ${without.length ? `<div class="banner ban-amber mt-10">${ico('alert')}<div>
            <div class="bt">No information sheet for ${esc(without.map(x => x.name).join(', '))}</div>
            Upload a PDF against ${without.length === 1 ? 'that service' : 'those services'} in the Service Catalogue and it will attach itself next time.</div></div>` : ''}
        </div>

        <div class="banner ban-amber mt-16">${ico('alert')}<div>
          <div class="bt">A WhatsApp link cannot carry a file. Nothing will be attached automatically.</div>
          This is WhatsApp's own limit, not something this screen can work around${direct ? ' on every device' : ''}.
          <strong>Open chat</strong> goes straight to the number above with the message already typed, and
          the PDF is saved to your downloads at the same moment — add it with the paperclip if you want it
          in the chat.
          <br><br>You can also just send the message as it is: the link in it opens the same PDF, and a second
          link lets the customer tap Accept or Decline.
          ${direct ? `<br><br><strong>Share with files</strong> does attach the PDF — but it hands you the
          share sheet, so you pick the chat yourself rather than it opening on the number above.` : ''}</div></div>

        <div class="mt-16">${U.field('Message',
          `<textarea class="textarea" id="waMsg" style="min-height:230px;font-size:13px;line-height:1.6">${esc(messageFor(q))}</textarea>`,
          'Edit anything you like. The template lives in Settings → Notifications.')}</div>

        <div class="mt-16">${U.field('Direct PDF link',
          `<div class="row g-8">
             <input class="input grow mono" id="waPdfLink" readonly value="${attr(pdfLink(q, true))}" style="font-size:12px">
             <button class="btn btn-ghost btn-sm nowrap" data-copypdf>${ico('copy')} Copy</button>
             <button class="btn btn-ghost btn-sm nowrap" data-openpdf>${ico('external')} Test</button>
           </div>
           <label class="check mt-8" style="padding:0">
             <input type="checkbox" id="waPortable" checked>
             <span class="box">${ico('check')}</span>
             <span class="txt">Pack the quotation into the link</span></label>`,
          'Tapping this opens the PDF straight away. Packed, it works on any phone even though nothing is attached — unpacked it is short, but only opens where this quotation is stored.')}</div>

        <div class="mt-16">${U.field('Accept / decline link',
          `<div class="row g-8">
             <input class="input grow mono" id="waLink" readonly value="${attr(approveLink(q))}" style="font-size:12px">
             <button class="btn btn-ghost btn-sm nowrap" data-copylink>${ico('copy')} Copy</button>
           </div>`,
          'Opens a page where the customer taps Accept or Decline — the quotation updates here straight away.')}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-ghost" data-app title="Opens the installed WhatsApp app directly">${ico('external')} Desktop app</button>
               ${direct ? `<button class="btn btn-soft" data-share>${ico('upload')} Share with files</button>` : ''}
               <button class="btn btn-wa" data-go>${ico('whatsapp')} <span id="waGoLabel">Open chat</span></button>`,
      onMount(root, close) {
        const numEl = U.qs('#waNum', root);
        const hintEl = U.qs('#waNumHint', root);
        const goLabel = U.qs('#waGoLabel', root);

        /** Show exactly which number the chat will open with. */
        function showNumber() {
          const raw = numEl.value.trim();
          const ok = U.phoneValid(raw);
          const pretty = U.phonePretty(raw);
          hintEl.innerHTML = !raw
            ? 'The lead or customer number this goes to.'
            : ok
              ? `Opens the chat with <strong>${esc(pretty)}</strong> — no contact picker.`
              : `<span style="color:var(--danger-700)">Add the country code, or type a 10-digit Indian number.</span>`;
          if (goLabel) goLabel.textContent = ok ? 'Open chat with ' + pretty : 'Open chat';
          return ok;
        }
        const portEl = U.qs('#waPortable', root);
        const pdfEl = U.qs('#waPdfLink', root);
        if (portEl && pdfEl) portEl.addEventListener('change', function () {
          pdfEl.value = pdfLink(q, portEl.checked);
        });

        numEl.addEventListener('input', U.debounce(showNumber, 200));
        numEl.addEventListener('change', showNumber);
        showNumber();

        function savePdf() {
          const url = URL.createObjectURL(fullQuotePdf(q).blob());
          U.download(quotePdfName(q), url);
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          U.toast('Quotation PDF saved', { sub: quotePdfName(q) });
        }

        /** Everything the customer should receive: one file holding all of it. */
        function attachments() {
          return [fullQuotePdf(q).file(quotePdfName(q))];
        }

        function markSent(num) {
          if (q.status === 'draft') q.status = 'sent';
          q.sentAt = S.nowStamp();
          q.sentTo = num;
          q.attachments = [quotePdfName(q)];
          S.save();
        }

        function done(msg, sub) {
          close();
          if (ctx && ctx.refresh) ctx.refresh(); else App.refresh();
          U.toast(msg, { tone: 'wa', icon: 'whatsapp', sub: sub });
        }

        root.addEventListener('click', e => {
          if (e.target.closest('[data-savepdf]')) {
            savePdf();
            return;
          }
          if (e.target.closest('[data-copylink]')) {
            U.copy(approveLink(q), 'Link copied');
            return;
          }
          if (e.target.closest('[data-copypdf]')) {
            U.copy(U.qs('#waPdfLink', root).value, 'PDF link copied');
            return;
          }
          if (e.target.closest('[data-openpdf]')) {
            U.openTab(U.qs('#waPdfLink', root).value);
            return;
          }
          /* --- straight into the chat with that number (the default) --- */
          const goBtn = e.target.closest('[data-go]');
          const appBtn = e.target.closest('[data-app]');
          if (goBtn || appBtn) {
            const num = numEl.value.trim();
            if (!showNumber()) {
              U.toast('Check the number first', { tone: 'err',
                sub: 'A 10-digit Indian number, or any number with its country code' });
              numEl.focus();
              return;
            }
            const msg = U.qs('#waMsg', root).value;

            // The link cannot carry the file, so put it where the paperclip
            // can reach it before the chat opens.
            savePdf();

            if (!U.openWhatsapp(num, msg, { app: !!appBtn })) return;
            markSent(num);
            done('Chat opened with ' + U.phonePretty(num), 'Quotation saved to your downloads');
            return;
          }

          /* --- share sheet: files ride along, but you pick the chat --- */
          if (e.target.closest('[data-share]')) {
            const num = numEl.value.trim();
            const msg = U.qs('#waMsg', root).value;
            // Build the files and share in the same gesture — the share sheet
            // will not open if an await comes between the tap and the call.
            const files = attachments();
            navigator.share({ files: files, title: 'Quotation ' + q.id, text: msg })
              .then(() => {
                markSent(num);
                done('Shared with ' + files.length + ' file' + (files.length === 1 ? '' : 's'),
                  'Pick the chat in WhatsApp to finish');
              })
              .catch(err => {
                // AbortError just means they backed out of the share sheet.
                if (err && err.name === 'AbortError') return;
                savePdf();
                U.toast('Share sheet refused the file', { tone: 'err',
                  sub: 'Saved to downloads instead — use Open chat and the paperclip' });
              });
            return;
          }
        });
      }
    });
  }

  /* ========================================================= the PDF page */
  /**
   * What the link in a WhatsApp message opens. A WhatsApp link cannot carry a
   * file, but it can carry the quotation itself -- so this page rebuilds the
   * PDF and shows it, on any device, with no server and no shared database.
   */
  V.pdf = {
    title: 'Quotation PDF',
    crumb: 'Quotation',
    narrow: false,

    render(ctx) {
      const q = quoteFromLink(ctx);
      if (!q) return U.empty({ icon: 'filetext', title: 'Quotation not found',
        text: 'This link may have expired, or it was copied without the quotation attached to it.' });

      const party = partyOf(q) || {};
      const t = S.quoteTotals(q);
      return `<div class="row between wrap g-12 mb-16">
        <div style="min-width:0">
          <h2 class="mono">${esc(q.id)}</h2>
          <div class="muted t-base mt-2">${esc(party.name || '')}${q.valid ? ' · valid till ' + esc(S.fmtDate(q.valid)) : ''}
            · ${S.money(t.total)} incl. GST</div>
        </div>
        <div class="row g-8 wrap no-print">
          <button class="btn btn-ghost" data-act="newtab">${ico('external')} Open in a new tab</button>
          <button class="btn btn-primary" data-act="save">${ico('download')} Download PDF</button>
        </div>
      </div>

      <div class="card" style="overflow:hidden;padding:0">
        <iframe id="pdfFrame" title="${attr(q.id)}" style="width:100%;height:78vh;border:0;display:block;background:var(--surface-2)"></iframe>
      </div>

      <div class="fhint mt-10 no-print">If the document does not appear above, your browser will not show a
        PDF inline — use <strong>Download PDF</strong> or <strong>Open in a new tab</strong>.</div>`;
    },

    mount(root, ctx) {
      const q = quoteFromLink(ctx);
      if (!q) return;

      // One blob for the page: the frame reads it, and both buttons reuse it.
      const url = URL.createObjectURL(fullQuotePdf(q).blob());
      const frame = U.qs('#pdfFrame', root);
      if (frame) frame.src = url;

      root.addEventListener('click', function (e) {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');
        if (a === 'save') { U.download(quotePdfName(q), url); U.toast('Downloaded', { sub: quotePdfName(q) }); }
        if (a === 'newtab') U.openTab(url);
      });

      // Held until the page is left, so the frame and the buttons stay valid.
      if (ctx && typeof ctx.onLeave === 'function') ctx.onLeave(() => URL.revokeObjectURL(url));
      else w.addEventListener('hashchange', function once() {
        w.removeEventListener('hashchange', once);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    }
  };

  /**
   * The quotation this link refers to: the one packed into the URL when it is
   * there, otherwise the stored one. Packed wins, so a link forwarded to a
   * customer shows what was sent rather than what has since been edited.
   */
  function quoteFromLink(ctx) {
    try {
      const d = new URLSearchParams(location.search || '').get('d');
      if (d) return unpackQuote(b64url.dec(d));
    } catch (e) { /* a damaged payload falls back to the stored quotation */ }
    return ctx && ctx.id ? S.quote(ctx.id) : null;
  }

  /* ============================================================ detail view */
  V.quotationsDetail = {
    title: ctx => (S.quote(ctx.id) || {}).id || 'Quotation',
    crumb: 'Quotations',
    narrow: true,
    render(ctx) {
      const q = S.quote(ctx.id);
      if (!q) return C.backLink('#/quotations', 'All quotations') +
        U.empty({ icon: 'filetext', title: 'Quotation not found', text: 'It may have been deleted.' });
      const t = S.quoteTotals(q);
      // Once an AMC has been generated off it, the quotation is the record of
      // what was agreed — changing it would no longer match the contract.
      const canEdit = ctx.role !== 'client' && !q.contractId;

      return C.backLink('#/quotations', 'All quotations') +
      `<div class="row between wrap g-12 mb-16 no-print">
        <div>
          <div class="row g-8">
            <h2>${esc(q.id)}</h2>
            <span class="badge ${S.QUOTE_STATUS[q.status].cls} badge-lg">${esc(S.QUOTE_STATUS[q.status].label)}</span>
          </div>
          <div class="muted t-base mt-4">${esc(q.title)} · ${S.money(t.total)} incl. GST</div>
        </div>
        <div class="row g-8 wrap">
          ${canEdit ? `<button class="btn btn-ghost btn-sm" data-act="edit">${ico('pen')} Edit</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-act="print">${ico('printer')} Print / PDF</button>
          <button class="btn btn-ghost btn-sm" data-act="dup">${ico('copy')} Duplicate</button>
          <button class="btn btn-wa btn-sm" data-act="send">${ico('whatsapp')} ${q.status === 'draft' ? 'Send to customer' : 'Send again'}</button>
          ${q.status === 'sent' ? `<button class="btn btn-ghost btn-sm" data-act="reject">${ico('x')} Mark rejected</button>
                                   <button class="btn btn-primary btn-sm" data-act="approve">${ico('check')} Customer approved</button>` : ''}
          ${!q.contractId ? `<button class="btn btn-primary btn-sm" data-act="convert">${ico('shield')} Move to contract</button>` : ''}
          ${!q.contractId && q.mode !== 'amc' ? `<button class="btn btn-primary btn-sm" data-act="book">${ico('calendar')} Book the service</button>` : ''}
          ${q.contractId ? `<a class="btn btn-soft btn-sm" href="#/contracts/${attr(q.contractId)}">${ico('shield')} ${esc(q.contractId)}</a>` : ''}
        </div>
      </div>

      ${q.status === 'approved' && !q.contractId ? `<div class="banner ban-green mb-16 no-print">${ico('checkcircle')}
        <div><div class="bt">Customer approved this quotation</div>
        ${q.mode === 'amc' ? 'Generate the AMC contract to create every scheduled visit for the period automatically.' : 'Book the service to put it on a technician\'s calendar.'}</div></div>` : ''}

      ${docHtml(q)}`;
    },
    mount(root, ctx) {
      const q = S.quote(ctx.id);
      if (!q) return;
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');

        if (a === 'print') { w.print(); return; }
        if (a === 'send') { shareModal(q, ctx); return; }
        if (a === 'approve') {
          q.status = 'approved';
          if (q.leadId) { const l = S.lead(q.leadId); if (l && l.stage !== 'won') l.stage = 'contract'; }
          S.save(); U.toast('Marked as approved', { sub: q.mode === 'amc' ? 'You can now generate the AMC contract' : 'You can now book the service' });
          App.refresh(); return;
        }
        if (a === 'reject') {
          q.status = 'rejected';
          if (q.leadId) { const l = S.lead(q.leadId); if (l) l.stage = 'lost'; }
          S.save(); ctx.refresh(); U.toast('Marked as rejected'); return;
        }
        if (a === 'convert') {
          // Which kind of contract is the first question; everything after it
          // is the one shared contract form, opened with this quote copied in.
          const go = () => { if (V['contract-new']) V['contract-new'].choose({ quote: q }); };

          // A quotation typed in for a customer who has already said yes goes
          // straight to a contract — the send-and-approve dance is for the
          // ones that actually went out to the customer.
          if (q.status === 'draft' || q.status === 'sent') {
            U.confirm({
              title: 'Move ' + q.id + ' to a contract?',
              message: q.status === 'draft'
                ? 'This quotation has not been sent. Moving it to a contract marks it approved and treats it as agreed — right for a quote you typed up for a customer who already said yes.'
                : 'This marks the quotation approved and carries it into the contract.',
              confirmText: 'Yes, continue'
            }).then(ok => {
              if (!ok) return;
              q.status = 'approved';
              if (q.leadId) { const l = S.lead(q.leadId); if (l && l.stage !== 'won') l.stage = 'contract'; }
              S.save();
              go();
            });
            return;
          }
          go();
          return;
        }
        if (a === 'edit') { V.quotations.editQuote(q, ctx); return; }
        if (a === 'dup') {
          const db = S.get(); db.seq.quote++;
          const copy = JSON.parse(JSON.stringify(q));
          copy.id = 'QT-' + db.seq.quote; copy.status = 'draft'; copy.date = S.todayISO();
          copy.valid = Seed.D(15); delete copy.contractId;
          db.quotations.unshift(copy); S.save();
          U.toast('Duplicated as ' + copy.id);
          location.hash = '#/quotations/' + copy.id; return;
        }
        if (a === 'book') {
          if (V.jobs && V.jobs.newJob) V.jobs.newJob({ clientId: q.clientId, serviceIds: q.items.map(i => i.svId).filter(Boolean) });
        }
      });
    }
  };

  /* ============================================================ list view */
  /* ====================================================== customer approval */
  /**
   * Where the accept / decline link lands. Deliberately plain: one document,
   * two buttons, no navigation — the customer is not a user of the system.
   */
  V.approve = {
    title: 'Your quotation',
    crumb: 'Quotation',
    narrow: true,
    render(ctx) {
      const q = S.quote(ctx.id);
      if (!q) return U.empty({ icon: 'filetext', title: 'Quotation not found',
        text: 'This link may have expired, or the quotation was withdrawn.' });

      const co = S.get().company;
      const party = partyOf(q);
      const t = S.quoteTotals(q);
      const expired = S.dayDelta(q.valid) < 0;
      const decided = q.status === 'approved' || q.status === 'rejected';
      const svcs = sheetsFor(q).filter(x => x.pdf);

      return `
      ${decided ? `<div class="banner ${q.status === 'approved' ? 'ban-green' : 'ban-amber'} mb-16 no-print">
        ${ico(q.status === 'approved' ? 'checkcircle' : 'info')}
        <div><div class="bt">${q.status === 'approved' ? 'You accepted this quotation' : 'You declined this quotation'}</div>
        ${q.status === 'approved'
          ? esc(co.name) + ' has been notified and will contact you to schedule the first service.'
          : 'Thank you for letting us know. ' + esc(co.name) + ' may be in touch to understand what would work better.'}
        ${q.decidedAt ? ' Recorded ' + esc(String(q.decidedAt).replace('T', ' at ')) + '.' : ''}</div></div>`

      : expired ? `<div class="banner ban-red mb-16 no-print">${ico('alertcircle')}
        <div><div class="bt">This quotation expired on ${esc(S.fmtDate(q.valid))}</div>
        Reply on WhatsApp and we will send you a fresh one at current rates.</div></div>`

      : `<div class="card card-pad mb-16 no-print">
          <div class="row between wrap g-12">
            <div style="min-width:0">
              <div class="fw-7" style="font-size:17px;letter-spacing:-.02em">Hello ${esc(party ? (party.contact || party.name) : 'there')}</div>
              <div class="muted t-base mt-2">Your quotation from ${esc(co.name)} is below. Valid till ${esc(S.fmtDate(q.valid))}.</div>
            </div>
            <div class="row g-8 wrap">
              <button class="btn btn-ghost" data-act="decline">${ico('x')} Decline</button>
              <button class="btn btn-primary btn-lg" data-act="accept">${ico('check')} Accept quotation</button>
            </div>
          </div>
        </div>`}

      <div class="card card-pad mb-16 no-print">
        <div class="row g-10">
          <div class="tile-ico i-brand" style="width:30px;height:30px">${ico('filetext', '', 15)}</div>
          <div class="grow" style="min-width:0">
            <div class="fw-6 t-base truncate">${esc(quotePdfName(q))}</div>
            <div class="t-sm muted">The full quotation${svcs.length
              ? ', with the information sheet for ' + svcs.length + ' service' + (svcs.length === 1 ? '' : 's') + ' after it'
              : ''} — one file</div>
          </div>
          <button class="btn btn-primary btn-sm nowrap" data-act="pdf">${ico('download')} Download PDF</button>
        </div>
      </div>

      ${svcs.length ? `<div class="card card-pad mb-16 no-print">
        <div class="flabel mb-8">What each treatment involves</div>
        <div class="t-sm muted mb-10">All of these are already inside the PDF above. They are here too in
          case you want just one of them.</div>
        <div class="col g-8">${svcs.map(x => `<div class="row g-10" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div class="tile-ico i-red" style="width:30px;height:30px">${ico('filetext', '', 15)}</div>
          <div class="grow" style="min-width:0">
            <div class="fw-6 t-base truncate">${esc(x.name)}</div>
            <div class="t-sm muted">${esc(x.pdf.name)} · ${esc(U.fileSizeText(x.pdf.size))}</div>
          </div>
          <button class="btn btn-ghost btn-sm nowrap" data-sheet="${attr(x.id)}">${ico('download')} Open</button>
        </div>`).join('')}</div>
      </div>` : ''}

      ${docHtml(q)}

      ${!decided && !expired ? `<div class="card card-pad mt-16 no-print center-txt">
        <div class="t-base muted mb-12">Happy with this quotation?</div>
        <div class="row g-10 wrap" style="justify-content:center">
          <button class="btn btn-ghost" data-act="decline">${ico('x')} Decline</button>
          <button class="btn btn-primary btn-lg" data-act="accept">${ico('check')} Accept ${S.money(t.total)}</button>
        </div>
        <div class="t-sm muted mt-12">Or reply ACCEPT or DECLINE on WhatsApp to ${esc(co.phone)}.</div>
      </div>` : ''}`;
    },

    mount(root, ctx) {
      const q = S.quote(ctx.id);
      if (!q) return;

      function decide(status, note) {
        q.status = status;
        q.decidedAt = S.nowStamp();
        if (note) q.notes = (q.notes ? q.notes + '\n\n' : '') + 'Declined by customer: ' + note;
        const l = q.leadId ? S.lead(q.leadId) : null;
        if (l) {
          l.stage = status === 'approved' ? 'contract' : 'lost';
          l.log = l.log || [];
          l.log.unshift({
            at: S.nowStamp(),
            text: status === 'approved'
              ? 'Customer accepted ' + q.id + ' from the shared link'
              : 'Customer declined ' + q.id + (note ? ' — ' + note : ''),
            by: ''
          });
        }
        S.save();
        App.refresh();
      }

      root.addEventListener('click', e => {
        if (e.target.closest('[data-act=pdf]')) {
          const url = URL.createObjectURL(fullQuotePdf(q).blob());
          U.download(quotePdfName(q), url);
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          U.toast('Quotation downloaded', { sub: quotePdfName(q) });
          return;
        }
        const sh = e.target.closest('[data-sheet]');
        if (sh) {
          const svc = S.service(sh.getAttribute('data-sheet'));
          if (svc && svc.pdf) U.download(svc.pdf.name, svc.pdf.data);
          return;
        }

        if (e.target.closest('[data-act=accept]')) {
          U.confirm({
            title: 'Accept this quotation?',
            message: 'We will treat this as your confirmation and get in touch to schedule the first service.',
            confirmText: 'Yes, accept'
          }).then(ok => {
            if (!ok) return;
            decide('approved');
            U.toast('Thank you — quotation accepted', { sub: 'We will contact you to schedule' });
          });
          return;
        }

        if (e.target.closest('[data-act=decline]')) {
          U.modal({
            title: 'Decline this quotation',
            sub: 'A line about why helps us do better next time',
            body: U.field('Reason', `<textarea class="textarea" id="dcNote" placeholder="e.g. Price is above our budget this year"></textarea>`),
            footer: `<button class="btn btn-ghost" data-close>Cancel</button>
                     <button class="btn btn-danger" data-ok>${ico('x')} Decline</button>`,
            onMount(mroot, close) {
              U.qs('[data-ok]', mroot).onclick = () => {
                const note = U.qs('#dcNote', mroot).value.trim();
                close();
                decide('rejected', note);
                U.toast('Quotation declined', { sub: 'Thank you for letting us know' });
              };
            }
          });
        }
      });
    }
  };

  V.quotations = {
    title: 'Quotations',
    newQuote: newQuote,
    /** Reopen an existing quotation in the builder. */
    editQuote(q, ctx) { newQuote({ edit: q, back: ctx && ctx.refresh ? () => ctx.refresh() : null }); },
    /** Turn an approved quotation into an AMC — openable from the lead card. */
    /** The WhatsApp share screen for a quotation, openable from anywhere. */
    share(q, ctx) { shareModal(q, ctx || { refresh() { App.refresh(); } }); },
    /** The quotation as an A4 PDF — a builder, plus the filename to save it under. */
    pdf: quotePdf,
    pdfName: quotePdfName,
    render: renderList,
    mount(root, ctx) {
      const qi = U.qs('#qq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-new]')) return newQuote();
        if (e.target.closest('[data-act=tpl]')) {
          U.toast('Quotation templates', { sub: 'Residential GPC · Commercial AMC · Termite 5-year — saved presets' });
          return;
        }
        // Sits inside the row, so it must be caught before the row navigates.
        const ed = e.target.closest('[data-editq]');
        if (ed) {
          e.preventDefault(); e.stopPropagation();
          newQuote({ edit: S.quote(ed.getAttribute('data-editq')), back: () => ctx.refresh() });
          return;
        }
        const row = e.target.closest('[data-go]');
        if (row) location.hash = row.getAttribute('data-go');
      });
    }
  };
})(window);
