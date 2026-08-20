/* ==========================================================================
   View: Settings — company profile, roles, WhatsApp templates, demo controls
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'company';

  const MODULES = [
    { k: 'dashboard', t: 'Dashboard' }, { k: 'leads', t: 'Leads' }, { k: 'quotations', t: 'Quotations' },
    { k: 'contracts', t: 'AMC Contracts' }, { k: 'jobs', t: 'Services' }, { k: 'schedule', t: 'Schedule' },
    { k: 'clients', t: 'Customers' }, { k: 'services', t: 'Services' }, { k: 'team', t: 'Team' },
    { k: 'inventory', t: 'Inventory' }, { k: 'audits', t: 'Audits' }, { k: 'invoices', t: 'Invoices' },
    { k: 'reports', t: 'Reports' }, { k: 'settings', t: 'Settings' }
  ];
  const ROLE_KEYS = ['admin', 'ops', 'sales', 'accounts', 'tech', 'client'];

  const TEMPLATES = () => S.get().waTemplates || [];

  function companyTab() {
    const co = S.get().company;
    return `<div class="grid grid-2 mb-20">
      ${C.sectionCard('Business profile',
        `<div class="grid grid-2">
          ${U.field('Business name', `<input class="input" data-co="name" value="${attr(co.name)}">`)}
          ${U.field('Tagline', `<input class="input" data-co="tagline" value="${attr(co.tagline)}">`)}
          ${U.field('Phone', `<input class="input" data-co="phone" value="${attr(co.phone)}">`)}
          ${U.field('Email', `<input class="input" data-co="email" value="${attr(co.email)}">`)}
        </div>
        <div class="mt-14">${U.field('Address line 1', `<input class="input" data-co="addr1" value="${attr(co.addr1)}">`)}</div>
        <div class="mt-14">${U.field('Address line 2', `<input class="input" data-co="addr2" value="${attr(co.addr2)}">`)}</div>
        <div class="grid grid-2 mt-14">
          ${U.field('GSTIN', `<input class="input" data-co="gstin" value="${attr(co.gstin)}">`)}
          ${U.field('Pest control licence', `<input class="input" data-co="licence" value="${attr(co.licence)}">`)}
        </div>`,
        `<button class="btn btn-primary btn-sm" data-act="save-co">${ico('save')} Save</button>`)}

      <div class="col g-16">
        ${C.sectionCard('Tax & billing',
          `<div class="grid grid-2">
            ${U.field('GST rate (%)', `<input class="input" data-co="gstRate" type="number" value="${attr(co.gstRate)}">`)}
            ${U.field('UPI ID', `<input class="input" data-co="upi" value="${attr(co.upi)}">`)}
          </div>
          <div class="mt-14">${U.field('Bank', `<input class="input" data-bank="name" value="${attr(co.bank.name)}">`)}</div>
          <div class="grid grid-2 mt-14">
            ${U.field('Account number', `<input class="input" data-bank="ac" value="${attr(co.bank.ac)}">`)}
            ${U.field('IFSC', `<input class="input" data-bank="ifsc" value="${attr(co.bank.ifsc)}">`)}
          </div>`)}

        ${C.sectionCard('Document numbering',
          `<div class="grid grid-2">
            ${U.field('Quotation prefix', `<input class="input" value="QT-" readonly>`)}
            ${U.field('Next quotation no.', `<input class="input" value="QT-${S.get().seq.quote + 1}" readonly>`)}
            ${U.field('Invoice prefix', `<input class="input" value="INV-" readonly>`)}
            ${U.field('Next invoice no.', `<input class="input" value="INV-${S.get().seq.invoice + 1}" readonly>`)}
          </div>`)}
      </div>
    </div>

    ${C.sectionCard('Quotation terms & conditions',
      `<div class="col g-8">${co.terms.map((t, i) =>
        `<div class="row g-8"><span class="badge b-gray shrink0">${i + 1}</span>
         <input class="input" data-term="${i}" value="${attr(t)}"></div>`).join('')}</div>`,
      `<button class="btn btn-primary btn-sm" data-act="save-terms">${ico('save')} Save terms</button>`)}`;
  }

  function rolesTab() {
    function allowedFor(role) {
      const set = {};
      (App.NAV[role] || []).forEach(g => g.items.forEach(i => { set[i.r] = 1; }));
      return set;
    }
    const perms = {};
    ROLE_KEYS.forEach(r => { perms[r] = allowedFor(r); });

    return `<div class="grid grid-3 mb-20">
      ${ROLE_KEYS.slice(0, 3).map(r => roleCard(r)).join('')}
    </div>
    <div class="grid grid-3 mb-20">
      ${ROLE_KEYS.slice(3).map(r => roleCard(r)).join('')}
    </div>

    ${C.sectionCard('Permission matrix',
      `<div class="tablewrap"><table class="tbl">
        <thead><tr><th>Module</th>${ROLE_KEYS.map(r =>
          `<th class="c">${esc(Seed.ROLES[r].label.split(' ')[0])}</th>`).join('')}</tr></thead>
        <tbody>${MODULES.map(m => `<tr>
          <td class="fw-6">${esc(m.t)}</td>
          ${ROLE_KEYS.map(r => `<td class="c">${perms[r][m.k]
            ? `<span style="color:var(--success-700)">${ico('checkcircle', '', 17)}</span>`
            : `<span style="color:var(--line-2)">${ico('minus', '', 17)}</span>`}</td>`).join('')}
        </tr>`).join('')}
        <tr><td class="fw-6">Technician app</td>
          ${ROLE_KEYS.map(r => `<td class="c">${r === 'tech'
            ? `<span style="color:var(--success-700)">${ico('checkcircle', '', 17)}</span>`
            : `<span style="color:var(--line-2)">${ico('minus', '', 17)}</span>`}</td>`).join('')}</tr>
        <tr><td class="fw-6">Customer portal</td>
          ${ROLE_KEYS.map(r => `<td class="c">${r === 'client'
            ? `<span style="color:var(--success-700)">${ico('checkcircle', '', 17)}</span>`
            : `<span style="color:var(--line-2)">${ico('minus', '', 17)}</span>`}</td>`).join('')}</tr>
        </tbody>
      </table></div>`, '', { flush: true })}`;
  }

  function roleCard(r) {
    const meta = Seed.ROLES[r];
    const n = S.get().users.filter(u => u.role === r).length;
    const mods = (App.NAV[r] || []).reduce((a, g) => a.concat(g.items), []);
    return `<div class="card card-pad">
      <div class="row between mb-10">
        <div class="tile-ico lg" style="background:${meta.color}18;color:${meta.color}">${ico(meta.icon)}</div>
        <span class="badge b-gray">${n} user${n === 1 ? '' : 's'}</span>
      </div>
      <div class="fw-7" style="font-size:14.5px">${esc(meta.label)}</div>
      <div class="t-sm muted mt-4" style="line-height:1.55;min-height:34px">${esc(meta.desc)}</div>
      <div class="row g-5 wrap mt-10" style="padding-top:11px;border-top:1px solid var(--line)">
        ${mods.slice(0, 5).map(m => `<span class="badge b-gray" style="height:20px;font-size:10px">${esc(m.t)}</span>`).join('')}
        ${mods.length > 5 ? `<span class="badge b-gray" style="height:20px;font-size:10px">+${mods.length - 5}</span>` : ''}
      </div>
    </div>`;
  }

  function notifyTab() {
    return `${C.hint('Every message below replaces something the team sends by hand on WhatsApp today. In the production build these fire automatically through the WhatsApp Business API.', 'whatsapp')}

    <div class="mt-20">${C.sectionCard('WhatsApp message templates',
      `<div class="col g-12">${TEMPLATES().map((t, i) => `
        <div class="card" style="padding:14px">
          <div class="row between g-10 mb-8">
            <div class="row g-9">
              <div class="tile-ico ${t.on === false ? 'i-gray' : 'i-green'}">${ico('whatsapp')}</div>
              <div><div class="fw-6 t-base">${esc(t.label)}</div>
              <div class="t-sm muted">${esc(t.trigger)}</div></div>
            </div>
            <label class="toggle"><input type="checkbox" data-tplon="${i}" ${t.on === false ? '' : 'checked'}><span class="track"></span></label>
          </div>
          <textarea class="textarea mono" data-tplbody="${i}"
            style="min-height:${t.k === 'quote_sent' ? '230' : '86'}px;font-size:12.5px;line-height:1.62">${esc(t.body)}</textarea>
          <div class="row between g-8 wrap mt-8">
            <div class="row g-4 wrap">${(t.vars || []).map(v =>
              `<button class="chip" data-ins="${i}:${attr(v)}" title="Insert into the message">{${esc(v)}}</button>`).join('')}</div>
            <div class="row g-6">
              <button class="btn btn-quiet btn-sm" data-preview="${i}">${ico('eye')} Preview</button>
              <button class="btn btn-soft btn-sm" data-tplsave="${i}">${ico('check')} Save</button>
            </div>
          </div>
        </div>`).join('')}</div>`,
      `<span class="badge b-gray">${TEMPLATES().length} templates</span>`)}</div>

    <div class="mt-20 grid grid-2">
      ${C.sectionCard('Notification channels',
        `<div class="col g-12">
          ${[['whatsapp', 'WhatsApp Business API', 'Primary channel for customers and technicians', true],
             ['mail', 'Email', 'Quotations, invoices and reports as PDF', true],
             ['message', 'SMS fallback', 'Used when WhatsApp delivery fails', false],
             ['bell', 'In-app push', 'Technician service alerts on their phone', true]].map(x => `
            <div class="row g-11" style="padding:9px 0;border-bottom:1px solid var(--line)">
              <div class="tile-ico ${x[3] ? 'i-green' : 'i-gray'}">${ico(x[0])}</div>
              <div class="grow"><div class="fw-6 t-base">${esc(x[1])}</div>
              <div class="t-sm muted">${esc(x[2])}</div></div>
              <label class="toggle"><input type="checkbox" ${x[3] ? 'checked' : ''}><span class="track"></span></label>
            </div>`).join('')}
        </div>`)}

      ${C.sectionCard('Automation rules',
        `<div class="col g-12">
          ${[['Auto-generate AMC visits', 'Create every dated visit when a contract is created', true],
             ['Auto-assign to contract technician', 'New visits go to the technician on the contract', true],
             ['Deduct stock on service completion', 'Chemicals recorded on site come off inventory', true],
             ['Raise invoice on billing cycle', 'Generate the invoice automatically each cycle', false],
             ['Escalate overdue invoices', 'Notify management after 15 days past due', true]].map(x => `
            <div class="row g-11" style="padding:9px 0;border-bottom:1px solid var(--line)">
              <div class="tile-ico ${x[2] ? 'i-brand' : 'i-gray'}">${ico('zap')}</div>
              <div class="grow"><div class="fw-6 t-base">${esc(x[0])}</div>
              <div class="t-sm muted">${esc(x[1])}</div></div>
              <label class="toggle"><input type="checkbox" ${x[2] ? 'checked' : ''}><span class="track"></span></label>
            </div>`).join('')}
        </div>`)}
    </div>`;
  }

  function demoTab() {
    const db = S.get();
    const counts = [
      ['Customers', db.clients.length, 'building'], ['Leads', db.leads.length, 'userplus'],
      ['Quotations', db.quotations.length, 'filetext'], ['Contracts', db.contracts.length, 'shield'],
      ['Services', db.jobs.length, 'briefcase'], ['Invoices', db.invoices.length, 'receipt'],
      ['Inventory items', db.inventory.length, 'package'], ['Audits', db.audits.length, 'clipcheck']
    ];
    return `${C.hint('This is a fully interactive demo. Everything you create is saved in this browser only — nothing leaves your machine, and a reset restores the original sample business.', 'info')}

    <div class="grid grid-4 mt-20 mb-20">
      ${counts.map(c => C.stat({ label: c[0], value: c[1], icon: c[2], tone: 'i-gray' })).join('')}
    </div>

    <div class="grid grid-2">
      ${C.sectionCard('Try the full workflow',
        `<div class="tl">
          ${[['Capture a lead', 'Leads → New lead', '#/leads'],
             ['Raise a quotation', 'Quotations → New quotation', '#/quotations'],
             ['Approve it and move it to a contract', 'Quotation → Customer approved → Move to contract', '#/quotations'],
             ['Dispatch a visit', 'Schedule → Assign work → drag it onto somebody', '#/board'],
             ['Execute it as the technician', 'Switch role → Field Technician → Today\'s Work', '#/jobs'],
             ['Bill it and collect', 'Contract → Raise invoice → Record payment', '#/invoices']].map((s, i) => `
            <div class="tl-item"><div class="dot done">${ico('check')}</div>
              <a href="${s[2]}"><div class="fw-6 t-base">${i + 1}. ${esc(s[0])}</div>
              <div class="t-sm muted">${esc(s[1])}</div></a></div>`).join('')}
        </div>`)}

      ${C.sectionCard('Demo controls',
        `<div class="col g-10">
          <button class="btn btn-ghost btn-block" data-act="switch">${ico('users')} Switch to another role</button>
          <button class="btn btn-ghost btn-block" data-act="search">${ico('search')} Open global search</button>
          <button class="btn btn-soft btn-block" data-act="load-demo">${ico('refresh')} Load the sample business</button>
          <button class="btn btn-danger-soft btn-block" data-act="reset">${ico('trash')} Clear everything and start fresh</button>
        </div>
        <div class="divider mt-16 mb-14"></div>
        ${C.kv([
          ['Build', 'PestOps demo v1.0'],
          ['Storage', 'Browser localStorage'],
          ['Roles', '6 (admin, ops, sales, technician, accounts, customer)'],
          ['Modules', '14'],
          ['Works offline', 'Yes — no server or internet needed']
        ])}`)}
    </div>`;
  }

  V.settings = {
    title: 'Settings',
    render(ctx) {
      const tabs = [
        { id: 'company', label: 'Company' },
        { id: 'roles', label: 'Roles & access' },
        { id: 'notify', label: 'Notifications' },
        { id: 'demo', label: 'Demo & data' }
      ];
      let body = tab === 'company' ? companyTab()
        : tab === 'roles' ? rolesTab()
        : tab === 'notify' ? notifyTab() : demoTab();

      return C.pageHead({ title: 'Settings', sub: 'Business profile, access control and automation' }) +
        C.tabsBar(tabs, tab) + `<div class="mt-20">${body}</div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }

        const ins = e.target.closest('[data-ins]');
        if (ins) {
          const parts = ins.getAttribute('data-ins').split(':');
          const ta = U.qs('[data-tplbody="' + parts[0] + '"]', root);
          const at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
          const token = '{' + parts[1] + '}';
          ta.value = ta.value.slice(0, at) + token + ta.value.slice(ta.selectionEnd || at);
          ta.focus();
          ta.selectionStart = ta.selectionEnd = at + token.length;
          return;
        }

        const ts = e.target.closest('[data-tplsave]');
        if (ts) {
          const i = +ts.getAttribute('data-tplsave');
          const t = TEMPLATES()[i];
          t.body = U.qs('[data-tplbody="' + i + '"]', root).value;
          t.on = U.qs('[data-tplon="' + i + '"]', root).checked;
          S.save();
          U.toast('Template saved', { sub: t.label });
          return;
        }

        const pv = e.target.closest('[data-preview]');
        if (pv) {
          const i = +pv.getAttribute('data-preview');
          const t = TEMPLATES()[i];
          const co = S.get().company;
          const body = S.fillTemplate(U.qs('[data-tplbody="' + i + '"]', root).value, {
            client: 'Meera Krishnan', quote_no: 'QT-2044', title: 'Annual Pest Management',
            amount: S.money(3540), valid_date: S.fmtDate(S.todayISO()),
            service_lines: '• General Pest Control — 1 × ' + S.money(1800) + '\n• Cockroach Control — Gel — 1 × ' + S.money(1200),
            approve_link: 'https://…/app.html?q=QT-2044', company: co.name, company_phone: co.phone,
            service: 'General Pest Control', date: S.fmtDate(S.todayISO()), time: '10:00 AM',
            technician: 'Karthik R', tech_phone: '+91 99400 76512', site: 'Adyar, Chennai',
            job_no: 'JOB-1042', next_date: S.fmtDate(S.todayISO()), invoice_no: 'INV-3312',
            period: 'Aug 2026', due_date: S.fmtDate(S.todayISO()), upi_id: co.upi,
            receipt_no: 'RCP-882', contract_no: 'AMC-2025-02', end_date: S.fmtDate(S.todayISO())
          });
          U.modal({
            title: 'Preview — ' + t.label, sub: 'How it reaches the customer on WhatsApp', size: 'md',
            body: `<div class="card card-pad" style="background:#E7FFDB;border-color:#C5EBB4;white-space:pre-wrap;font-size:13.5px;line-height:1.62;color:#0F2A16">${esc(body)}</div>`,
            footer: `<button class="btn btn-ghost" data-close>Close</button>`
          });
          return;
        }

        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');

        if (a === 'save-co') {
          const co = S.get().company;
          U.qsa('[data-co]', root).forEach(el => {
            const k = el.getAttribute('data-co');
            co[k] = k === 'gstRate' ? (parseFloat(el.value) || 18) : el.value;
          });
          U.qsa('[data-bank]', root).forEach(el => { co.bank[el.getAttribute('data-bank')] = el.value; });
          S.save(); U.toast('Business profile saved');
          return;
        }
        if (a === 'save-terms') {
          const co = S.get().company;
          U.qsa('[data-term]', root).forEach(el => { co.terms[+el.getAttribute('data-term')] = el.value; });
          S.save(); U.toast('Terms updated', { sub: 'They now appear on every new quotation' });
          return;
        }
        if (a === 'switch') { S.clearSession(); location.href = 'index.html'; return; }
        if (a === 'search') { App.openSearch(); return; }
        if (a === 'load-demo') {
          U.confirm({
            title: 'Load the sample business?',
            message: 'Nine customers, live leads, quotations, seven AMC contracts with mixed crew ' +
                     'sizes, a full visit calendar and billing history. Anything you have entered ' +
                     'yourself will be replaced.',
            confirmText: 'Load the sample'
          }).then(ok => {
            if (!ok) return;
            S.reset(true);
            U.toast('Sample business loaded', { sub: 'Contracts, visits and invoices are all in place' });
            App.refresh();
          });
          return;
        }

        if (a === 'reset') {
          U.confirm({ title: 'Clear everything?', message: 'Every customer, lead, quotation, contract, visit and invoice is wiped. Your company profile, branches, services and team stay.', confirmText: 'Clear it all', tone: 'danger' })
            .then(ok => { if (ok) { S.reset(false); U.toast('Cleared', { sub: 'The setup stayed; the work is gone' }); App.refresh(); } });
        }
      });
    }
  };
})(window);
