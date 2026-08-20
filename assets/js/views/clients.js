/* ==========================================================================
   View: Customers — directory + full customer file
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let query = '';
  let dtab = 'overview';

  const TYPES = ['Residential', 'Society', 'Commercial', 'Retail', 'Industrial', 'Healthcare', 'Education', 'Corporate', 'Hospitality'];

  function stats(c) {
    const jobs = S.jobsForClient(c.id);
    const done = jobs.filter(j => j.status === 'completed');
    const contracts = S.get().contracts.filter(x => x.clientId === c.id);
    const live = contracts.filter(x => S.contractStatus(x).key !== 'expired');
    const invs = S.get().invoices.filter(i => i.clientId === c.id);
    const billed = invs.reduce((s, i) => s + S.invoiceTotals(i).total, 0);
    const due = invs.reduce((s, i) => s + S.invoiceTotals(i).balance, 0);
    const rated = done.filter(j => j.exec && j.exec.rating);
    return {
      jobs, done, contracts, live, invs, billed, due,
      rating: rated.length ? rated.reduce((s, j) => s + j.exec.rating, 0) / rated.length : 0,
      ratedN: rated.length
    };
  }

  /* =================================================================== list */
  function renderList(ctx) {
    const q = query.toLowerCase();
    const rows = S.get().clients.filter(c =>
      !q || (c.name + c.contact + c.phone + c.type + c.city).toLowerCase().indexOf(q) >= 0);

    return C.pageHead({
      title: 'Customers',
      sub: S.get().clients.length + ' customer accounts on the books',
      actions: `<button class="btn btn-primary btn-sm" data-new>${ico('plus')} Add customer</button>`
    }) +
    C.searchRow('Search by name, contact, phone or area…', '', 'clq') +

    (rows.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(310px,1fr))">
      ${rows.map(c => {
        const s = stats(c);
        return `<a class="card card-int" href="#/clients/${c.id}" style="padding:16px;display:block">
          <div class="row g-11 mb-12">
            ${U.avatarName(c.name, c.color, 'av-lg')}
            <div class="grow" style="min-width:0">
              <div class="truncate fw-7" style="font-size:14px">${esc(c.name)}</div>
              <div class="truncate t-sm muted">${esc(c.type)} · ${esc(c.city)}</div>
            </div>
            ${s.live.length ? `<span class="badge b-green">AMC</span>` : `<span class="badge b-gray">One-time</span>`}
          </div>
          <div class="grid grid-3 mb-12" style="gap:8px">
            <div><div class="t-xs muted fw-6">VISITS</div><div class="fw-7 t-md">${s.done.length}</div></div>
            <div><div class="t-xs muted fw-6">BILLED</div><div class="fw-7 t-md">${S.moneyShort(s.billed)}</div></div>
            <div><div class="t-xs muted fw-6">DUE</div><div class="fw-7 t-md ${s.due > 0 ? 'danger' : ''}">${S.moneyShort(s.due)}</div></div>
          </div>
          <div class="row between g-8" style="padding-top:11px;border-top:1px solid var(--line)">
            <span class="row g-6 t-sm muted truncate">${ico('user', '', 13)}${esc(c.contact)}</span>
            <span class="row g-4 nowrap">
              <button class="btn btn-ghost btn-sm nowrap" type="button" data-lead="${attr(c.id)}"
                title="Raise a lead for ${attr(c.name)}">${ico('userplus', '', 13)} Lead</button>
              <button class="iconbtn" type="button" data-editc="${attr(c.id)}"
                title="Edit ${attr(c.name)}">${ico('pen', '', 14)}</button>
              <button class="iconbtn" type="button" data-delc="${attr(c.id)}"
                title="Delete ${attr(c.name)}">${ico('trash', '', 14)}</button>
            </span>
          </div>
        </a>`;
      }).join('')}
    </div>` : U.empty({ icon: 'building', title: 'No customers found', text: 'Try a different search term.' }));
  }

  /* ================================================================= create */
  const MAX_DOC_KB = 1200;   // per file; the whole demo DB lives in ~5 MB

  /** Blank row for the contact-persons grid. */
  function personRow(i, p) {
    const c = p || {};
    return `<tr data-person="${i}">
      <td class="tight"><select class="select" data-f="sal" style="min-width:78px">
        ${U.selectOpts(Seed.SALUTATIONS, null, null, c.sal || '')}</select></td>
      <td><input class="input" data-f="first" value="${attr(c.first || '')}"></td>
      <td><input class="input" data-f="last" value="${attr(c.last || '')}"></td>
      <td><input class="input" data-f="email" value="${attr(c.email || '')}"></td>
      <td><input class="input" data-f="work" value="${attr(c.work || '')}" placeholder="+91 "></td>
      <td><input class="input" data-f="mobile" value="${attr(c.mobile || '')}" placeholder="+91 "></td>
      <td class="tight"><button class="iconbtn" type="button" data-rmperson title="Remove">${ico('trash', '', 14)}</button></td>
    </tr>`;
  }

  /**
   * The customer account. The header block is what every screen shows; the
   * tabs below hold the billing detail that only Accounts ever touches, so
   * the common case stays a six-field form.
   */
  function customerEditor(existing) {
    const c0 = existing || {};
    let tab = 'other';
    let docs = (c0.docs || []).map(d => ({ name: d.name, size: d.size, data: d.data }));
    let people = 1;

    const gstTreatments = Seed.GST_TREATMENTS;

    U.modal({
      title: existing ? 'Edit customer' : 'New customer',
      sub: existing
        ? c0.id + ' · customer since ' + S.fmtDate(c0.since)
        : 'The account you raise enquiries, quotations, contracts and invoices against',
      size: 'xl',
      body: `
        <div class="grid grid-2">
          ${U.field('Customer type', `<div class="row g-14" style="height:40px;align-items:center">
            ${Seed.CUSTOMER_TYPES.map((t, i) => `<label class="check" style="padding:0">
              <input type="radio" name="ncType" value="${attr(t)}"${i === 0 ? ' checked' : ''}>
              <span class="box">${ico('check')}</span><span class="txt">${esc(t)}</span></label>`).join('')}
          </div>`)}
          ${U.field('Property type', `<select class="select" id="nType">${U.selectOpts(TYPES, null, null, 'Residential')}</select>`,
            'What is being treated — drives the service the technician plans for.')}
        </div>

        <div class="grid mt-14" style="grid-template-columns:110px 1fr 1fr;gap:12px">
          ${U.field('Salutation', `<select class="select" id="nSal">${U.selectOpts(Seed.SALUTATIONS)}</select>`)}
          ${U.field('First name', `<input class="input" id="nFirst" placeholder="Primary contact">`)}
          ${U.field('Last name', `<input class="input" id="nLast">`)}
        </div>

        <div class="grid grid-2 mt-14">
          ${U.field('Company name', `<input class="input" id="nCompany">`)}
          ${U.field('Display name', `<input class="input" id="nName" list="ncNames" autocomplete="off">
            <datalist id="ncNames"></datalist>`,
            'How the customer appears everywhere in PestOps and on the invoice.', true)}
          ${U.field('Email address', `<input class="input" id="nEmail" type="email" placeholder="name@company.in">`)}
          ${U.field('Customer language', `<select class="select" id="nLang">${U.selectOpts(Seed.LANGUAGES, null, null, 'English')}</select>`)}
          ${U.field('Work phone', `<input class="input" id="nWork" placeholder="+91 ">`)}
          ${U.field('Mobile', `<input class="input" id="nPhone" placeholder="+91 ">`, 'Used for WhatsApp and the visit reminders.', true)}
        </div>

        <div class="mt-14">${U.field('Communication channels',
          `<div class="row g-14">
            <label class="check" style="padding:0"><input type="checkbox" id="nChEmail" checked><span class="box">${ico('check')}</span><span class="txt">Email</span></label>
            <label class="check" style="padding:0"><input type="checkbox" id="nChSms"><span class="box">${ico('check')}</span><span class="txt">SMS</span></label>
            <label class="check" style="padding:0"><input type="checkbox" id="nChWa" checked><span class="box">${ico('check')}</span><span class="txt">WhatsApp</span></label>
          </div>`)}</div>

        <div class="mt-20">${C.tabsBar([
          { id: 'other',   label: 'Other details' },
          { id: 'address', label: 'Address' },
          { id: 'people',  label: 'Contact persons' },
          { id: 'docs',    label: 'Documents' },
          { id: 'remarks', label: 'Remarks' }
        ], 'other', 'data-ntab')}</div>

        <div class="mt-16" id="nPanels">
          <div data-panel="other">
            <div class="grid grid-2">
              ${U.field('GST treatment', `<select class="select" id="nGstT">
                <option value="">— select —</option>${U.selectOpts(gstTreatments)}</select>`, '', true)}
              ${U.field('Place of supply', `<select class="select" id="nState">${U.selectOpts(Seed.STATES, null, null, 'Tamil Nadu')}</select>`,
                'Decides CGST + SGST against IGST on every invoice.', true)}
              ${U.field('GSTIN', `<input class="input mono" id="nGst" placeholder="33AABCS1429B1ZP" maxlength="15">`)}
              ${U.field('PAN', `<input class="input mono" id="nPan" placeholder="AABCS1429B" maxlength="10">`)}
              ${U.field('Tax preference', `<div class="row g-14" style="height:40px;align-items:center">
                ${['Taxable', 'Tax Exempt'].map((t, i) => `<label class="check" style="padding:0">
                  <input type="radio" name="nTax" value="${attr(t)}"${i === 0 ? ' checked' : ''}>
                  <span class="box">${ico('check')}</span><span class="txt">${esc(t)}</span></label>`).join('')}
              </div>`)}
              ${U.field('Currency', `<select class="select" id="nCur">${U.selectOpts(Seed.CURRENCIES)}</select>`)}
              ${U.field('Opening balance (₹)', `<input class="input" id="nOpen" type="number" step="100" placeholder="0">`,
                'Anything already outstanding when the account moves into PestOps.')}
              ${U.field('Payment terms', `<select class="select" id="nTerms">${U.selectOpts(Seed.PAYMENT_TERMS, null, null, 'Due on Receipt')}</select>`)}
              ${U.field('Branch', `<select class="select" id="nBranch">
                ${(S.get().branches || []).map(b => `<option value="${attr(b.id)}">${esc(b.name)}</option>`).join('')}</select>`,
                'Which office looks after this account.')}
              ${U.field('Property size', `<input class="input" id="nArea" placeholder="e.g. 3 BHK / 1,450 sq.ft">`)}
            </div>
            <div class="mt-14">${U.field('Customer portal',
              `<label class="check" style="padding:0"><input type="checkbox" id="nPortal"><span class="box">${ico('check')}</span>
               <span class="txt">Allow portal access — they can see contracts, visit history and invoices</span></label>`)}</div>
          </div>

          <div data-panel="address" style="display:none">
            <div class="grid grid-2 g-24">
              <div>
                <div class="flabel mb-12">Billing address</div>
                ${U.field('Attention', `<input class="input" id="bAttn">`)}
                <div class="mt-12">${U.field('Country / region', `<select class="select" id="bCountry">${U.selectOpts(Seed.COUNTRIES, null, null, 'India')}</select>`)}</div>
                <div class="mt-12">${U.field('Address', `<input class="input" id="bStreet1" placeholder="Street 1">
                  <input class="input mt-8" id="bStreet2" placeholder="Street 2">`)}</div>
                <div class="grid grid-2 mt-12">
                  ${U.field('City', `<input class="input" id="bCity" value="Chennai">`)}
                  ${U.field('State', `<select class="select" id="bState">${U.selectOpts(Seed.STATES, null, null, 'Tamil Nadu')}</select>`)}
                  ${U.field('Pin code', `<input class="input" id="bPin" inputmode="numeric" maxlength="6">`)}
                  ${U.field('Phone', `<input class="input" id="bPhone" placeholder="+91 ">`)}
                </div>
              </div>
              <div>
                <div class="row between mb-12">
                  <div class="flabel">Site / shipping address</div>
                  <button class="btn btn-quiet btn-sm" type="button" data-copyaddr>${ico('copy')} Copy billing</button>
                </div>
                ${U.field('Attention', `<input class="input" id="sAttn">`)}
                <div class="mt-12">${U.field('Country / region', `<select class="select" id="sCountry">${U.selectOpts(Seed.COUNTRIES, null, null, 'India')}</select>`)}</div>
                <div class="mt-12">${U.field('Address', `<input class="input" id="sStreet1" placeholder="Street 1">
                  <input class="input mt-8" id="sStreet2" placeholder="Street 2">`)}</div>
                <div class="grid grid-2 mt-12">
                  ${U.field('City', `<input class="input" id="sCity">`)}
                  ${U.field('State', `<select class="select" id="sState">${U.selectOpts(Seed.STATES, null, null, 'Tamil Nadu')}</select>`)}
                  ${U.field('Pin code', `<input class="input" id="sPin" inputmode="numeric" maxlength="6">`)}
                  ${U.field('Phone', `<input class="input" id="sPhone" placeholder="+91 ">`)}
                </div>
              </div>
            </div>
            <div class="fhint mt-12">The site address is where the technician goes. Leave it blank and the billing address is used.</div>
          </div>

          <div data-panel="people" style="display:none">
            <div class="tablewrap"><table class="tbl" id="nPeople">
              <thead><tr>
                <th>Salutation</th><th>First name</th><th>Last name</th>
                <th>Email</th><th>Work phone</th><th>Mobile</th><th></th>
              </tr></thead>
              <tbody>${personRow(0)}</tbody>
            </table></div>
            <button class="btn btn-soft btn-sm mt-12" type="button" data-addperson>${ico('plus')} Add contact person</button>
            <div class="fhint">Everyone else at the site worth calling — the security desk, the facility manager, the accounts contact.</div>
          </div>

          <div data-panel="docs" style="display:none">
            <div id="nDocBox"></div>
            <label class="btn btn-soft btn-sm mt-12" style="cursor:pointer">
              ${ico('upload')} Upload file
              <input type="file" id="nDocIn" hidden multiple accept="application/pdf,image/*">
            </label>
            <div class="fhint">Agreements, site plans, purchase orders. Up to ${MAX_DOC_KB / 1000} MB each.</div>
          </div>

          <div data-panel="remarks" style="display:none">
            ${U.field('Remarks', `<textarea class="textarea" id="nRemarks" style="min-height:120px"
              placeholder="Anything the team should know before they call or visit."></textarea>`,
              'Internal only — the customer never sees this.')}
          </div>
        </div>`,

      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} ${existing ? 'Save changes' : 'Save customer'}</button>`,

      onMount(root, close) {
        const q = id => U.qs(id, root);
        const val = id => (q(id) ? q(id).value.trim() : '');
        const checked = id => !!(q(id) && q(id).checked);
        const radio = name => {
          const el = U.qs('input[name=' + name + ']:checked', root);
          return el ? el.value : '';
        };

        /* ------------------------------------- load an existing record in */
        function set(id, v) {
          const el = q(id);
          if (el && v != null && v !== '') el.value = v;
        }
        function tick(id, v) {
          const el = q(id);
          if (el) el.checked = !!v;
        }
        function pickRadio(name, v) {
          const el = U.qs('input[name=' + name + '][value="' + String(v || '').replace(/"/g, '') + '"]', root);
          if (el) el.checked = true;
        }

        if (existing) {
          const b = c0.billing || {}, si = c0.site || {}, ch = c0.channels || {};
          pickRadio('ncType', c0.custType);
          pickRadio('nTax', c0.taxPref);
          [['#nType', c0.type], ['#nSal', c0.salutation], ['#nFirst', c0.first], ['#nLast', c0.last],
           ['#nCompany', c0.company], ['#nName', c0.name], ['#nEmail', c0.email], ['#nLang', c0.language],
           ['#nWork', c0.workPhone], ['#nPhone', c0.phone],
           ['#nGstT', c0.gstTreatment], ['#nState', c0.placeOfSupply], ['#nGst', c0.gstin], ['#nPan', c0.pan],
           ['#nCur', c0.currency], ['#nOpen', c0.openingBalance], ['#nTerms', c0.paymentTerms],
           ['#nBranch', c0.branch], ['#nArea', c0.area], ['#nRemarks', c0.remarks],
           ['#bAttn', b.attn], ['#bCountry', b.country], ['#bStreet1', b.street1], ['#bStreet2', b.street2],
           ['#bCity', b.city], ['#bState', b.state], ['#bPin', b.pin], ['#bPhone', b.phone],
           ['#sAttn', si.attn], ['#sCountry', si.country], ['#sStreet1', si.street1], ['#sStreet2', si.street2],
           ['#sCity', si.city], ['#sState', si.state], ['#sPin', si.pin], ['#sPhone', si.phone]
          ].forEach(pair => set(pair[0], pair[1]));
          tick('#nChEmail', ch.email); tick('#nChSms', ch.sms); tick('#nChWa', ch.whatsapp);
          tick('#nPortal', c0.portal);

          // Records made before GST treatment existed still have to be editable.
          if (!c0.gstTreatment) {
            set('#nGstT', c0.gstin ? 'Registered Business - Regular'
              : (c0.type === 'Residential' ? 'Consumer' : 'Unregistered Business'));
          }

          // Older records only ever had the flat address fields.
          if (!b.street1 && c0.addr) { set('#bStreet1', c0.addr); set('#bCity', c0.city); set('#bPin', c0.pin); }

          const rows = (c0.persons || []);
          if (rows.length) {
            const body = U.qs('#nPeople tbody', root);
            body.innerHTML = rows.map(() => personRow(people++)).join('');
            U.qsa('#nPeople tbody tr', root).forEach((tr, i) => {
              const pr = rows[i];
              [['sal', pr.sal], ['first', pr.first], ['last', pr.last],
               ['email', pr.email], ['work', pr.work], ['mobile', pr.mobile]].forEach(f => {
                const el = U.qs('[data-f=' + f[0] + ']', tr);
                if (el && f[1]) el.value = f[1];
              });
            });
          }
        }

        /* ------------------------------------------------------- tabs */
        root.addEventListener('click', e => {
          const tb = e.target.closest('[data-ntab]');
          if (tb) {
            tab = tb.getAttribute('data-ntab');
            U.qsa('[data-ntab]', root).forEach(b => b.classList.toggle('on', b === tb));
            U.qsa('#nPanels [data-panel]', root).forEach(pnl => {
              pnl.style.display = pnl.getAttribute('data-panel') === tab ? '' : 'none';
            });
            return;
          }

          if (e.target.closest('[data-copyaddr]')) {
            [['b', 's']].forEach(() => {
              ['Attn', 'Street1', 'Street2', 'City', 'Pin', 'Phone'].forEach(f => {
                const from = q('#b' + f), to = q('#s' + f);
                if (from && to) to.value = from.value;
              });
              ['Country', 'State'].forEach(f => {
                const from = q('#b' + f), to = q('#s' + f);
                if (from && to) to.value = from.value;
              });
            });
            U.toast('Billing address copied');
            return;
          }

          if (e.target.closest('[data-addperson]')) {
            const body = U.qs('#nPeople tbody', root);
            body.insertAdjacentHTML('beforeend', personRow(people++));
            return;
          }

          const rm = e.target.closest('[data-rmperson]');
          if (rm) {
            const body = U.qs('#nPeople tbody', root);
            if (body.children.length <= 1) { U.toast('Keep at least one row', { tone: 'err' }); return; }
            rm.closest('tr').remove();
          }
        });

        /* ------------------------------- display name follows the typing */
        const nameField = q('#nName');
        let nameTouched = false;
        nameField.addEventListener('input', () => { nameTouched = true; });

        function suggestName() {
          if (nameTouched) return;
          const company = val('#nCompany');
          const person = [val('#nFirst'), val('#nLast')].filter(Boolean).join(' ');
          nameField.value = company || person;
        }
        ['#nCompany', '#nFirst', '#nLast'].forEach(id => {
          const el = q(id);
          if (el) el.addEventListener('input', suggestName);
        });

        /* ------------------------------------------------------ documents */
        function renderDocs() {
          U.qs('#nDocBox', root).innerHTML = docs.length
            ? `<div class="col g-8">${docs.map((f, i) => `<div class="row g-10 card" style="padding:10px 12px">
                <div class="tile-ico i-red" style="width:30px;height:30px">${ico('filetext', '', 15)}</div>
                <div class="grow" style="min-width:0">
                  <div class="fw-6 t-base truncate">${esc(f.name)}</div>
                  <div class="t-sm muted">${esc(U.fileSizeText(f.size))}</div>
                </div>
                <button class="iconbtn" type="button" data-rmdoc="${i}" title="Remove">${ico('trash', '', 15)}</button>
              </div>`).join('')}</div>`
            : `<div class="t-sm muted">Nothing attached yet.</div>`;
        }
        renderDocs();

        U.qs('#nDocBox', root).addEventListener('click', e => {
          const b = e.target.closest('[data-rmdoc]');
          if (!b) return;
          docs.splice(parseInt(b.getAttribute('data-rmdoc'), 10), 1);
          renderDocs();
        });

        q('#nDocIn').addEventListener('change', function () {
          const files = Array.prototype.slice.call(this.files || []);
          this.value = '';
          files.forEach(f => {
            const kb = Math.round(f.size / 1024);
            if (kb > MAX_DOC_KB) {
              U.toast(f.name + ' is too large', { tone: 'err', sub: 'Keep each file under ' + (MAX_DOC_KB / 1000) + ' MB' });
              return;
            }
            if (S.storageWouldOverflow(kb * 1.37)) {
              U.toast('Not enough browser storage left', { tone: 'err',
                sub: 'Using ' + S.storageUse().pct + '% of the 5 MB limit' });
              return;
            }
            U.fileToDataUrl(f).then(data => {
              docs.push({ name: f.name, size: f.size, type: f.type, data: data });
              renderDocs();
            });
          });
        });

        /* ---------------------------------------------------------- save */
        q('[data-save]').onclick = () => {
          const name = val('#nName') || val('#nCompany');
          const phone = val('#nPhone') || val('#nWork');
          if (!name) { U.toast('Display name is required', { tone: 'err' }); return; }
          if (!phone) { U.toast('A mobile number is required', { tone: 'err', sub: 'It is how visits and reminders reach them' }); return; }
          if (!val('#nGstT')) {
            const jump = U.qs('[data-ntab=other]', root);
            if (jump) jump.click();
            U.toast('Pick a GST treatment', { tone: 'err', sub: 'Opened the Other details tab for you' });
            const sel = q('#nGstT');
            if (sel) { sel.focus(); sel.scrollIntoView({ block: 'center' }); }
            return;
          }

          const persons = U.qsa('#nPeople tbody tr', root).map(tr => ({
            sal: U.qs('[data-f=sal]', tr).value,
            first: U.qs('[data-f=first]', tr).value.trim(),
            last: U.qs('[data-f=last]', tr).value.trim(),
            email: U.qs('[data-f=email]', tr).value.trim(),
            work: U.qs('[data-f=work]', tr).value.trim(),
            mobile: U.qs('[data-f=mobile]', tr).value.trim()
          })).filter(x => x.first || x.last || x.email || x.mobile);

          const db = S.get();
          const primary = [val('#nSal'), val('#nFirst'), val('#nLast')].filter(Boolean).join(' ');
          const billing = {
            attn: val('#bAttn'), country: val('#bCountry'),
            street1: val('#bStreet1'), street2: val('#bStreet2'),
            city: val('#bCity'), state: val('#bState'), pin: val('#bPin'), phone: val('#bPhone')
          };
          const site = {
            attn: val('#sAttn'), country: val('#sCountry'),
            street1: val('#sStreet1') || billing.street1, street2: val('#sStreet2') || billing.street2,
            city: val('#sCity') || billing.city, state: val('#sState'), pin: val('#sPin') || billing.pin,
            phone: val('#sPhone')
          };

          const c = existing || {
            id: 'CL-' + String(db.clients.length + 1).padStart(3, '0'),
            since: S.todayISO(),
            color: ['#0B7454', '#7C3AED', '#2E90FA', '#F79009', '#F04438', '#0891B2', '#DB2777'][db.clients.length % 7]
          };
          Object.assign(c, {
            name: name,
            custType: radio('ncType'),
            type: val('#nType'),
            company: val('#nCompany'),
            salutation: val('#nSal'),
            first: val('#nFirst'),
            last: val('#nLast'),
            contact: primary || name,
            phone: phone,
            workPhone: val('#nWork'),
            email: val('#nEmail'),
            language: val('#nLang'),
            channels: { email: checked('#nChEmail'), sms: checked('#nChSms'), whatsapp: checked('#nChWa') },

            gstTreatment: val('#nGstT'),
            placeOfSupply: val('#nState'),
            gstin: val('#nGst').toUpperCase(),
            pan: val('#nPan').toUpperCase(),
            taxPref: radio('nTax'),
            currency: val('#nCur'),
            openingBalance: parseFloat(val('#nOpen')) || 0,
            paymentTerms: val('#nTerms'),
            branch: val('#nBranch'),
            portal: checked('#nPortal'),

            billing: billing,
            site: site,
            persons: persons,
            docs: docs,
            remarks: val('#nRemarks'),

            // The flat fields the rest of PestOps already reads.
            addr: [billing.street1, billing.street2].filter(Boolean).join(', '),
            city: billing.city || 'Chennai',
            pin: billing.pin,
            area: val('#nArea') || '—'
          });

          if (!existing) db.clients.push(c);
          S.save();
          close();
          U.toast(existing ? 'Customer updated' : 'Customer added', { sub: c.name + ' · ' + c.id });
          if (!existing) location.hash = '#/clients/' + c.id;
          App.refresh();
        };
      }
    });
  }

  /* ------------------------------------------------------------- removal */
  /** Everything in the system that points at this customer. */
  function linksTo(c) {
    const db = S.get();
    return {
      contracts: db.contracts.filter(x => x.clientId === c.id),
      jobs: db.jobs.filter(x => x.clientId === c.id),
      invoices: db.invoices.filter(x => x.clientId === c.id),
      quotations: db.quotations.filter(x => x.clientId === c.id),
      leads: db.leads.filter(x => x.clientId === c.id),
      users: db.users.filter(x => x.clientId === c.id)
    };
  }

  function linkSummary(l) {
    return [
      [l.contracts.length, 'contract'], [l.jobs.length, 'service'],
      [l.invoices.length, 'invoice'], [l.quotations.length, 'quotation'],
      [l.leads.length, 'lead']
    ].filter(x => x[0]).map(x => x[0] + ' ' + x[1] + (x[0] === 1 ? '' : 's'));
  }

  /**
   * Deleting a customer with history would leave orphaned invoices and visits,
   * so the count is shown first and the cascade has to be chosen deliberately.
   */
  function removeCustomer(c, after) {
    const l = linksTo(c);
    const parts = linkSummary(l);
    const total = l.contracts.length + l.jobs.length + l.invoices.length + l.quotations.length;

    function wipe(cascade) {
      const db = S.get();
      if (cascade) {
        const jobIds = l.jobs.map(j => j.id);
        db.jobs = db.jobs.filter(x => x.clientId !== c.id);
        db.contracts = db.contracts.filter(x => x.clientId !== c.id);
        db.quotations = db.quotations.filter(x => x.clientId !== c.id);
        const invIds = l.invoices.map(i => i.id);
        db.invoices = db.invoices.filter(x => x.clientId !== c.id);
        db.payments = db.payments.filter(x => invIds.indexOf(x.invoiceId) < 0);
        db.audits = (db.audits || []).filter(x => jobIds.indexOf(x.jobId) < 0);
        db.stockMoves = (db.stockMoves || []).filter(x => jobIds.indexOf(x.ref) < 0);
      }
      // Leads and portal users survive — they just stop pointing at a customer.
      l.leads.forEach(x => { x.clientId = ''; });
      l.users.forEach(x => { x.clientId = ''; });
      db.clients = db.clients.filter(x => x.id !== c.id);
      S.save();
      U.toast('Customer deleted', {
        sub: cascade && total ? c.name + ' and ' + total + ' linked records removed' : c.name + ' removed'
      });
      if (after) after();
    }

    if (!parts.length) {
      U.confirm({
        title: 'Delete ' + c.name + '?',
        message: 'Nothing in PestOps refers to this customer, so it comes out cleanly. This cannot be undone.',
        confirmText: 'Delete customer', tone: 'danger'
      }).then(ok => { if (ok) wipe(false); });
      return;
    }

    U.modal({
      title: 'Delete ' + c.name + '?',
      sub: c.id + ' has history attached to it',
      body: `
        <div class="banner ban-red mb-14">${ico('alertcircle')}<div>
          <div class="bt">This customer is referenced by ${esc(parts.join(', '))}</div>
          Deleting the customer on its own would leave those records pointing at nothing.</div></div>

        <div class="col g-8">
          ${l.contracts.length ? `<div class="row between g-10 card" style="padding:9px 12px">
            <span class="t-base">AMC contracts</span><strong>${l.contracts.length}</strong></div>` : ''}
          ${l.jobs.length ? `<div class="row between g-10 card" style="padding:9px 12px">
            <span class="t-base">Scheduled and completed services</span><strong>${l.jobs.length}</strong></div>` : ''}
          ${l.invoices.length ? `<div class="row between g-10 card" style="padding:9px 12px">
            <span class="t-base">Invoices and their payments</span><strong>${l.invoices.length}</strong></div>` : ''}
          ${l.quotations.length ? `<div class="row between g-10 card" style="padding:9px 12px">
            <span class="t-base">Quotations</span><strong>${l.quotations.length}</strong></div>` : ''}
          ${l.leads.length ? `<div class="row between g-10 card" style="padding:9px 12px">
            <span class="t-base">Leads <span class="muted t-sm">— kept, just unlinked</span></span><strong>${l.leads.length}</strong></div>` : ''}
        </div>

        <div class="fhint mt-12">If this is a duplicate you want cleaned up, deleting everything is right.
          If it is a real customer you have stopped serving, edit the record instead — the history is what your
          reports and GST filings are built on.</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-danger" data-wipe>${ico('trash')} Delete customer and ${total} record${total === 1 ? '' : 's'}</button>`,
      onMount(root, close) {
        U.qs('[data-wipe]', root).onclick = () => { close(); wipe(true); };
      }
    });
  }

  /* ================================================================= detail */
  V.clientsDetail = {
    title: ctx => (S.client(ctx.id) || {}).name || 'Customer',
    crumb: 'Customers',
    render(ctx) {
      const c = S.client(ctx.id);
      if (!c) return C.backLink('#/clients', 'All customers') +
        U.empty({ icon: 'building', title: 'Customer not found', text: 'It may have been removed.' });
      const s = stats(c);
      const canEdit = ['admin', 'ops', 'sales'].indexOf(ctx.role) >= 0;

      const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'contracts', label: 'Contracts', n: s.contracts.length },
        { id: 'visits', label: 'Visit history', n: s.jobs.length },
        { id: 'invoices', label: 'Invoices', n: s.invs.length }
      ];

      let bodyHtml = '';
      if (dtab === 'overview') {
        bodyHtml = `<div class="grid mb-20 split-rail">
          ${C.sectionCard('Account details', C.kv([
            ['Customer ID', c.id],
            ['Type', c.type],
            ['Contact person', c.contact],
            ['Phone', c.phone],
            ['Email', c.email || '—'],
            ['GSTIN', c.gstin || 'Not registered'],
            ['GST treatment', c.gstTreatment || 'Not set'],
            ['Place of supply', (c.placeOfSupply || '') + (c.placeOfSupply
              ? (S.inIndia(c.placeOfSupply) ? ' — GST 18%' : ' — IGST 18%')
              : 'Not set — treated as ' + S.homeState()), true],
            ['Address', c.addr + ', ' + c.city + (c.pin ? ' — ' + c.pin : '')],
            ['Property size', c.area],
            ['Customer since', S.fmtDate(c.since)]
          ]) + `<div class="grid grid-2 mt-14" style="gap:8px">
            <a class="btn btn-ghost btn-sm" href="tel:${attr(c.phone)}">${ico('phone')} Call</a>
            <button class="btn btn-wa btn-sm" data-act="wa">${ico('whatsapp')} WhatsApp</button>
          </div>`)}

          <div class="col g-16">
            ${C.sectionCard('Upcoming visits',
              (() => {
                const up = s.jobs.filter(j => j.status !== 'completed' && S.dayDelta(j.date) >= 0)
                  .sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 5);
                return up.length ? `<div style="margin:-11px 0">${up.map(j => C.jobRow(j)).join('')}</div>`
                  : `<div class="t-sm muted">No visits scheduled.</div>`;
              })())}
            ${C.sectionCard('Recent service reports',
              (() => {
                const dn = s.done.slice(0, 4);
                return dn.length ? `<div class="col g-10">${dn.map(j => `
                  <a class="row g-10 card" href="#/jobs/${j.id}" style="padding:10px">
                    ${(j.exec.photosAfter || [])[0] ? `<img src="${attr(j.exec.photosAfter[0])}" style="width:44px;height:44px;border-radius:8px;object-fit:cover">`
                      : `<div class="tile-ico i-gray">${ico('image')}</div>`}
                    <div class="grow" style="min-width:0">
                      <div class="truncate fw-6 t-base">${esc(S.jobTitle(j))}</div>
                      <div class="truncate t-sm muted">${esc(S.fmtDate(j.date))} · ${esc(S.userName(j.techIds[0]))}</div>
                    </div>
                    ${j.exec.rating ? U.stars(j.exec.rating, 12) : ''}
                  </a>`).join('')}</div>`
                  : `<div class="t-sm muted">No completed visits yet.</div>`;
              })())}
          </div>
        </div>`;
      }

      if (dtab === 'contracts') {
        bodyHtml = s.contracts.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${s.contracts.map(x => {
            const p = S.contractProgress(x);
            return `<a class="card card-int" href="#/contracts/${x.id}" style="padding:15px;display:block">
              <div class="row between mb-10"><span class="fw-7 mono t-base">${esc(x.id)}</span>${C.contractPill(x)}</div>
              <div class="row g-12 mb-10">${U.ring(p.pct, 48)}
                <div><div class="t-sm muted">Visits</div><div class="fw-7 t-md">${p.done} / ${p.total}</div>
                <div class="t-sm muted">${esc(S.planSummary(x))}</div></div>
                <div class="ml-auto" style="text-align:right"><div class="t-sm muted">Value</div>
                <div class="fw-7 t-md">${S.moneyShort(x.value)}</div></div>
              </div>
              <div class="t-sm muted">${esc(S.fmtDate(x.start))} → ${esc(S.fmtDate(x.end))}</div>
            </a>`;
          }).join('')}
        </div>` : U.empty({ icon: 'shield', title: 'No contracts yet', text: 'Raise a quotation and approve it to create an AMC.' });
      }

      if (dtab === 'visits') {
        bodyHtml = s.jobs.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
          <thead><tr><th>Ref</th><th>Service</th><th>Date</th><th>Technician</th><th>Findings</th><th>Status</th><th></th></tr></thead>
          <tbody>${s.jobs.map(j => `<tr class="clickable" data-go="#/jobs/${j.id}">
            <td class="mono t-base fw-6">${esc(j.id)}</td>
            <td class="truncate" style="max-width:180px">${esc(S.jobTitle(j))}</td>
            <td><div class="fw-6 t-base">${esc(S.fmtDate(j.date))}</div><div class="t-sm muted">${esc(S.fmtTime(j.slot))}</div></td>
            <td>${C.techStack(j.techIds)}</td>
            <td class="t-sm muted truncate" style="max-width:200px">${esc(((j.exec || {}).findings || []).join(', ') || '—')}</td>
            <td>${C.jobStatus(j)}</td>
            <td class="tight">${ico('cright', 'muted-2', 15)}</td>
          </tr>`).join('')}</tbody>
        </table></div></div>` : U.empty({ icon: 'briefcase', title: 'No visits yet', text: '' });
      }

      if (dtab === 'invoices') {
        bodyHtml = s.invs.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
          <thead><tr><th>Invoice</th><th>Period</th><th>Date</th><th class="r">Amount</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>${s.invs.map(i => {
            const t = S.invoiceTotals(i);
            return `<tr class="clickable" data-go="#/invoices/${i.id}">
              <td class="mono t-base fw-6">${esc(i.id)}</td>
              <td class="t-base truncate" style="max-width:200px">${esc(i.period)}</td>
              <td class="t-base">${esc(S.fmtDate(i.date))}</td>
              <td class="r fw-6">${S.money(t.total)}</td>
              <td class="r fw-7 ${t.balance > 0 ? 'danger' : ''}">${S.money(t.balance)}</td>
              <td><span class="badge ${S.INV_STATUS[i.status].cls}">${esc(S.INV_STATUS[i.status].label)}</span></td>
              <td class="tight">${ico('cright', 'muted-2', 15)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div></div>` : U.empty({ icon: 'receipt', title: 'No invoices yet', text: '' });
      }

      return C.backLink('#/clients', 'All customers') +
      `<div class="row between wrap g-12 mb-20">
        <div class="row g-12" style="min-width:0">
          ${U.avatarName(c.name, c.color, 'av-xl')}
          <div style="min-width:0">
            <div class="row g-8 wrap">
              <h2 class="truncate">${esc(c.name)}</h2>
              ${s.live.length ? `<span class="badge b-green badge-lg">${ico('shield')}AMC customer</span>` : ''}
            </div>
            <div class="muted t-base mt-2">${esc(c.type)} · ${esc(c.area)} · customer since ${esc(S.fmtDate(c.since))}</div>
          </div>
        </div>
        <div class="row g-8 wrap">
          <button class="btn btn-soft btn-sm" data-act="lead">${ico('userplus')} Move to lead</button>
          <button class="btn btn-ghost btn-sm" data-act="quote">${ico('filetext')} Quotation</button>
          <button class="btn btn-primary btn-sm" data-act="contract">${ico('shield')} Contract</button>
          ${canEdit ? `<div class="vdivider" style="height:22px;margin:0 2px"></div>
            <button class="btn btn-ghost btn-sm" data-act="edit">${ico('pen')} Edit</button>
            <button class="iconbtn" data-act="delete" title="Delete customer">${ico('trash', '', 16)}</button>` : ''}
        </div>
      </div>

      <div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Visits completed', value: s.done.length, icon: 'calcheck', tone: 'i-brand', foot: s.jobs.length + ' total scheduled' })}
        ${C.stat({ label: 'Live contracts', value: s.live.length, icon: 'shield', tone: 'i-violet', foot: s.contracts.length + ' all time' })}
        ${C.stat({ label: 'Billed to date', value: S.moneyShort(s.billed), icon: 'receipt', tone: 'i-blue', foot: s.invs.length + ' invoices' })}
        ${C.stat({ label: 'Outstanding', value: S.moneyShort(s.due), icon: 'rupee', tone: s.due > 0 ? 'i-red' : 'i-green',
          color: s.due > 0 ? 'var(--danger-700)' : '', foot: s.due > 0 ? 'Follow up needed' : 'Fully settled' })}
      </div>

      ${C.tabsBar(tabs, dtab)}
      <div class="mt-20">${bodyHtml}</div>`;
    },
    mount(root, ctx) {
      const c = S.client(ctx.id);
      if (!c) return;
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { dtab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');
        if (a === 'lead' && V.leads) V.leads.newLead({ clientId: c.id });
        if (a === 'quote' && V.quotations) V.quotations.newQuote({ clientId: c.id });
        // Straight to a contract — no quotation, nothing sent to the customer.
        if (a === 'contract' && V['contract-new']) V['contract-new'].choose({ clientId: c.id });
        if (a === 'job' && V.jobs) V.jobs.newJob({ clientId: c.id });
        if (a === 'edit') customerEditor(c);
        if (a === 'delete') removeCustomer(c, () => { location.hash = '#/clients'; App.refresh(); });
      });
    }
  };

  /* =================================================================== view */
  V.clients = {
    title: 'Customers',
    render: renderList,
    /** Exposed so the quick-create menu can open the form from anywhere. */
    addCustomer: () => customerEditor(null),
    editCustomer: customerEditor,
    mount(root, ctx) {
      const qi = U.qs('#clq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        if (e.target.closest('[data-new]')) return customerEditor(null);

        // These all sit inside the card, so the card's own link has to be
        // stopped before any of them run.
        const lead = e.target.closest('[data-lead]');
        if (lead) {
          e.preventDefault(); e.stopPropagation();
          if (V.leads) V.leads.newLead({ clientId: lead.getAttribute('data-lead') });
          return;
        }
        const ed = e.target.closest('[data-editc]');
        if (ed) {
          e.preventDefault(); e.stopPropagation();
          customerEditor(S.client(ed.getAttribute('data-editc')));
          return;
        }
        const dl = e.target.closest('[data-delc]');
        if (dl) {
          e.preventDefault(); e.stopPropagation();
          removeCustomer(S.client(dl.getAttribute('data-delc')), () => ctx.refresh());
        }
      });
    }
  };
})(window);
