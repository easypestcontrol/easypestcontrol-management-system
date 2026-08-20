/* ==========================================================================
   View: Team — staff directory, employee record, technician performance
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  const ROLE_ORDER = ['admin', 'ops', 'sales', 'tech', 'accounts'];
  const DEFAULT_TITLE = { admin: 'Administrator', ops: 'Operations Manager',
    sales: 'Sales Executive', tech: 'Technician', accounts: 'Accounts Executive' };

  let branchFilter = '';

  function perf(u) {
    const js = S.jobsForTech(u.id);
    const done = js.filter(j => j.status === 'completed');
    const today = js.filter(j => j.date === S.todayISO());
    const rated = done.filter(j => j.exec && j.exec.rating);
    const mins = done.reduce((s, j) => s + ((j.exec || {}).durationMins || 0), 0);
    return {
      total: js.length, done: done.length, today: today.length,
      todayDone: today.filter(j => j.status === 'completed').length,
      open: js.filter(j => j.status !== 'completed').length,
      rating: rated.length ? rated.reduce((s, j) => s + j.exec.rating, 0) / rated.length : (u.rating || 0),
      ratedN: rated.length, hours: Math.round(mins / 60),
      onTime: 88 + (u.id.charCodeAt(2) % 11), jobs: js, doneJobs: done, todayJobs: today
    };
  }

  function branchBadges(u) {
    const list = S.userBranches(u);
    if (!list.length) return `<span class="badge b-amber">${ico('alert')}No branch</span>`;
    return list.map(b => `<span class="badge b-blue">${ico('building')}${esc(b.name)}</span>`).join(' ');
  }

  /* ======================================================== member editor */
  /**
   * One form for "Add team member" and "Edit team member" — the employee
   * record HR actually needs: photo, identity, posting, next of kin, documents.
   */
  function memberEditor(existing) {
    const u = existing || {};
    const db = S.get();
    const branches = db.branches.filter(b => b.active !== false || (u.branches || []).indexOf(b.id) >= 0);

    // Live working copies; the DOM is the source of truth for plain inputs only.
    let photo = u.photo || '';
    let sign = u.sign || '';
    let docs = (u.docs || []).map(d => ({ name: d.name, src: d.src }));
    let emergency = (u.emergency || []).map(e => ({ name: e.name, relation: e.relation, phone: e.phone }));
    if (!emergency.length) emergency = [{ name: '', relation: 'Father', phone: '' }];

    U.modal({
      title: existing ? 'Edit team member' : 'Add team member',
      sub: 'Employee record, posting and access in PestOps',
      size: 'lg',
      body: `
        <div class="row g-14 wrap mb-18" style="align-items:center">
          <div id="tPhotoBox"></div>
          <div class="grow" style="min-width:180px">
            <div class="flabel mb-6">Photo</div>
            <div class="row g-8 wrap">
              <label class="btn btn-soft btn-sm" style="cursor:pointer">
                ${ico('camera')} Upload photo
                <input type="file" accept="image/*" id="tPhotoIn" hidden>
              </label>
              <button class="btn btn-ghost btn-sm" type="button" data-rmphoto>${ico('trash')} Remove</button>
            </div>
            <div class="fhint">JPG or PNG. Shown on service cards, dispatch boards and the customer report.</div>
          </div>
        </div>

        <div class="row g-14 wrap mb-18" style="align-items:center">
          <div id="tSignBox"></div>
          <div class="grow" style="min-width:180px">
            <div class="flabel mb-6">Signature</div>
            <div class="row g-8 wrap">
              <label class="btn btn-soft btn-sm" style="cursor:pointer">
                ${ico('upload')} Upload signature
                <input type="file" accept="image/*" id="tSignIn" hidden>
              </label>
              <button class="btn btn-ghost btn-sm" type="button" data-rmsign>${ico('trash')} Remove</button>
            </div>
            <div class="fhint">A scan or photo of their signature on white paper. It is placed on every
              quotation and contract they raise, so it never has to be drawn by hand.</div>
          </div>
        </div>

        <div class="flabel mb-8" style="font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2)">Identity &amp; contact</div>
        <div class="grid grid-2">
          ${U.field('Full name', `<input class="input" id="tName" value="${attr(u.name || '')}" placeholder="e.g. Karthik R">`, '', true)}
          ${U.field('Phone', `<input class="input" id="tPhone" value="${attr(u.phone || '')}" placeholder="+91 ">`, '', true)}
          ${U.field('Email', `<input class="input" id="tEmail" value="${attr(u.email || '')}" placeholder="name@shieldpest.in">`)}
          ${U.field('Aadhaar / ID card number', `<input class="input" id="tAad" value="${attr(u.aadhaar || '')}" placeholder="12 digits" inputmode="numeric">`)}
          ${U.field('Date of birth', `<input class="input" type="date" id="tDob" value="${attr(u.dob || '')}">`)}
          ${U.field('Blood group', `<select class="select" id="tBlood">
            <option value="">—</option>${U.selectOpts(Seed.BLOOD_GROUPS, null, null, u.blood || '')}</select>`)}
        </div>
        <div class="mt-14">${U.field('Residential address',
          `<textarea class="textarea" id="tAddr" style="min-height:64px" placeholder="Door no, street, area, city, PIN">${esc(u.addr || '')}</textarea>`)}</div>

        <div class="flabel mb-8 mt-20" style="font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2)">Employment</div>
        <div class="grid grid-2">
          ${U.field('Role', `<select class="select" id="tRole">${ROLE_ORDER.map(r =>
            `<option value="${attr(r)}"${r === (u.role || 'tech') ? ' selected' : ''}>${esc(Seed.ROLES[r].label)}</option>`).join('')}</select>`, '', true)}
          ${U.field('Designation', `<input class="input" id="tTitle" value="${attr(u.title || 'Technician')}">`)}
          ${U.field('Employment type', `<select class="select" id="tEmp">${U.selectOpts(Seed.EMP_TYPES, null, null, u.empType || 'Full-time')}</select>`)}
          ${U.field('Date of joining', `<input class="input" type="date" id="tJoin" value="${attr(u.joined || S.todayISO())}">`)}
          ${U.field('Applicator licence', `<input class="input" id="tLic" value="${attr(u.licence || '')}" placeholder="TN/APP/…">`)}
          ${U.field('Skills (comma separated)', `<input class="input" id="tSkills" value="${attr((u.skills || []).join(', '))}" placeholder="Termite, Cockroach, Rodent">`)}
        </div>

        <div class="mt-16">${U.field('Branches',
          branches.length
            ? U.checklist('tbr', branches.map(b => ({ id: b.id, label: b.name, sub: b.code })), u.branches || [], { max: 150 })
            : `<div class="banner ban-amber">${ico('alert')}<div>No branches exist yet. Add them under <strong>Master Data → Branches</strong> first.</div></div>`,
          'Tick every branch this person covers — they can be posted to more than one.', true)}</div>

        <div class="mt-14" id="rolePrev"></div>

        <div class="flabel mb-8 mt-20" style="font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2)">Emergency contacts</div>
        <div id="emgWrap"></div>
        <button class="btn btn-ghost btn-sm mt-10" type="button" data-addemg>${ico('plus')} Add another contact</button>

        <div class="flabel mb-8 mt-20" style="font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2)">Documents</div>
        <div class="fhint" style="margin:-4px 0 10px">Aadhaar, applicator licence, police verification, offer letter — anything you must keep on file.</div>
        <div id="docWrap"></div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} ${existing ? 'Save member' : 'Add member'}</button>`,

      onMount(root, close) {
        /* ---------------------------------------------------------- photo */
        function renderPhoto() {
          U.qs('#tPhotoBox', root).innerHTML = photo
            ? `<div class="av av-xl" style="background:#eef1f5 url('${attr(photo)}') center/cover no-repeat"></div>`
            : `<div class="av av-xl" style="background:var(--surface-3);color:var(--muted-2)">${ico('user', '', 26)}</div>`;
        }
        renderPhoto();

        U.qs('#tPhotoIn', root).addEventListener('change', function () {
          const f = this.files && this.files[0];
          if (!f) return;
          U.shrinkImage(f, 320).then(src => { photo = src; renderPhoto(); });
          this.value = '';
        });

        /* ------------------------------------------------------ signature */
        function renderSign() {
          U.qs('#tSignBox', root).innerHTML = sign
            ? `<div class="sig-thumb"><img src="${attr(sign)}" alt="Signature"></div>`
            : `<div class="sig-thumb empty">${ico('pen', '', 20)}<span>No signature</span></div>`;
        }
        renderSign();

        U.qs('#tSignIn', root).addEventListener('change', function () {
          const f = this.files && this.files[0];
          if (!f) return;
          U.shrinkImage(f, 520).then(src => { sign = src; renderSign(); });
          this.value = '';
        });

        /* ----------------------------------------------- emergency contacts */
        function syncEmergency() {
          U.qsa('[data-emg]', root).forEach(rowEl => {
            const i = Number(rowEl.getAttribute('data-emg'));
            emergency[i] = {
              name: U.qs('[data-emg-name]', rowEl).value,
              relation: U.qs('[data-emg-rel]', rowEl).value,
              phone: U.qs('[data-emg-phone]', rowEl).value
            };
          });
        }

        function renderEmergency() {
          U.qs('#emgWrap', root).innerHTML = emergency.map((e, i) => `
            <div class="row g-8 wrap mb-8" data-emg="${i}" style="align-items:flex-end">
              <div class="grow" style="min-width:150px">${U.field(i ? '' : 'Name',
                `<input class="input" data-emg-name value="${attr(e.name || '')}" placeholder="e.g. Ravi R">`)}</div>
              <div style="width:132px">${U.field(i ? '' : 'Relation',
                `<select class="select" data-emg-rel>${U.selectOpts(Seed.RELATIONS, null, null, e.relation || 'Father')}</select>`)}</div>
              <div class="grow" style="min-width:150px">${U.field(i ? '' : 'Phone',
                `<input class="input" data-emg-phone value="${attr(e.phone || '')}" placeholder="+91 ">`)}</div>
              <button class="iconbtn" type="button" data-rmemg="${i}" title="Remove"
                style="margin-bottom:2px${emergency.length < 2 ? ';visibility:hidden' : ''}">${ico('trash', '', 15)}</button>
            </div>`).join('');
        }
        renderEmergency();

        /* ------------------------------------------------------- documents */
        function syncDocNames() {
          U.qsa('[data-docname]', root).forEach(inp => {
            const i = Number(inp.getAttribute('data-docname'));
            if (docs[i]) docs[i].name = inp.value;
          });
        }

        function renderDocs() {
          U.qs('#docWrap', root).innerHTML = `<div class="photogrid">
            ${docs.map((doc, i) => `<div>
              <div class="photo"><img src="${attr(doc.src)}" alt="">
                <button class="rm" type="button" data-rmdoc="${i}">${ico('x')}</button></div>
              <input class="input" data-docname="${i}" value="${attr(doc.name || '')}" placeholder="Label"
                style="height:27px;font-size:11px;padding:0 8px;margin-top:6px">
            </div>`).join('')}
            <label class="photo-add" style="cursor:pointer">
              ${ico('upload')}<span>Add file</span>
              <input type="file" accept="image/*" data-docup hidden>
            </label>
          </div>`;
        }
        renderDocs();

        /* --------------------------------------------------------- role hint */
        function rolePrev() {
          const r = U.qs('#tRole', root).value;
          U.qs('#rolePrev', root).innerHTML =
            C.hint('<strong>' + esc(Seed.ROLES[r].label) + '</strong> — ' + esc(Seed.ROLES[r].desc), Seed.ROLES[r].icon);
        }
        U.qs('#tRole', root).addEventListener('change', function () {
          rolePrev();
          const t = U.qs('#tTitle', root);
          // Only auto-fill the designation while it still holds a default.
          if (!t.value.trim() || Object.keys(DEFAULT_TITLE).some(k => DEFAULT_TITLE[k] === t.value.trim())) {
            t.value = DEFAULT_TITLE[this.value] || '';
          }
        });
        rolePrev();

        /* ------------------------------------------------------ delegation */
        root.addEventListener('change', e => {
          const up = e.target.closest('[data-docup]');
          if (up && up.files && up.files[0]) {
            syncDocNames();
            U.shrinkImage(up.files[0], 900).then(src => {
              docs.push({ name: 'Document ' + (docs.length + 1), src: src });
              renderDocs();
            });
          }
        });

        root.addEventListener('click', e => {
          if (e.target.closest('[data-rmphoto]')) { photo = ''; renderPhoto(); return; }
          if (e.target.closest('[data-rmsign]')) { sign = ''; renderSign(); return; }

          if (e.target.closest('[data-addemg]')) {
            syncEmergency();
            emergency.push({ name: '', relation: 'Father', phone: '' });
            renderEmergency();
            return;
          }
          const rmE = e.target.closest('[data-rmemg]');
          if (rmE) {
            syncEmergency();
            emergency.splice(Number(rmE.getAttribute('data-rmemg')), 1);
            if (!emergency.length) emergency = [{ name: '', relation: 'Father', phone: '' }];
            renderEmergency();
            return;
          }
          const rmD = e.target.closest('[data-rmdoc]');
          if (rmD) {
            syncDocNames();
            docs.splice(Number(rmD.getAttribute('data-rmdoc')), 1);
            renderDocs();
          }
        });

        /* ------------------------------------------------------------ save */
        U.qs('[data-save]', root).onclick = () => {
          syncEmergency();
          syncDocNames();

          const name = U.qs('#tName', root).value.trim();
          const phone = U.qs('#tPhone', root).value.trim();
          if (!name || !phone) { U.toast('Full name and phone are required', { tone: 'err' }); return; }

          const picked = U.qsa('input[name=tbr]:checked', root).map(i => i.value);
          if (!picked.length) {
            U.toast('Select at least one branch', { tone: 'err', sub: 'A member must be posted to a branch' });
            return;
          }

          const aad = U.qs('#tAad', root).value.trim();
          if (aad && aad.replace(/\D/g, '').length !== 12) {
            U.toast('Aadhaar number must be 12 digits', { tone: 'err' });
            return;
          }

          const kin = emergency
            .map(e => ({ name: (e.name || '').trim(), relation: e.relation, phone: (e.phone || '').trim() }))
            .filter(e => e.name && e.phone);
          if (!kin.length) {
            U.toast('One emergency contact is required', { tone: 'err', sub: 'Name and phone number are both needed' });
            return;
          }

          const palette = ['#0B7454', '#7C3AED', '#2E90FA', '#F79009', '#12B76A', '#F04438', '#DB2777'];
          const rec = existing || {
            id: 'U' + String(db.users.length + 1).padStart(2, '0'),
            color: palette[db.users.length % palette.length],
            rating: 0, jobsDone: 0
          };

          rec.name = name;
          rec.phone = phone;
          rec.email = U.qs('#tEmail', root).value.trim();
          rec.role = U.qs('#tRole', root).value;
          rec.title = U.qs('#tTitle', root).value.trim() || DEFAULT_TITLE[rec.role] || 'Team member';
          rec.photo = photo;
          rec.sign = sign;
          rec.aadhaar = aad;
          rec.dob = U.qs('#tDob', root).value;
          rec.blood = U.qs('#tBlood', root).value;
          rec.addr = U.qs('#tAddr', root).value.trim();
          rec.empType = U.qs('#tEmp', root).value;
          rec.joined = U.qs('#tJoin', root).value || S.todayISO();
          rec.licence = U.qs('#tLic', root).value.trim();
          rec.skills = U.qs('#tSkills', root).value.split(',').map(x => x.trim()).filter(Boolean);
          rec.branches = picked;
          rec.emergency = kin;
          rec.docs = docs.filter(d => d.src).map((d, i) => ({ name: (d.name || '').trim() || 'Document ' + (i + 1), src: d.src }));

          if (!existing) db.users.push(rec);
          S.save(); close(); App.refresh();
          U.toast(existing ? 'Team member updated' : 'Team member added', {
            sub: rec.name + ' · ' + picked.map(S.branchName).join(', ')
          });
        };
      }
    });
  }

  /* ================================================================= detail */
  V.teamDetail = {
    title: ctx => (S.user(ctx.id) || {}).name || 'Team member',
    crumb: 'Team',
    render(ctx) {
      const u = S.user(ctx.id);
      if (!u) return C.backLink('#/team', 'Team') +
        U.empty({ icon: 'user', title: 'Member not found', text: 'They may have been removed.' });
      const r = Seed.ROLES[u.role];
      const p = perf(u);
      const isTech = u.role === 'tech';
      const canEdit = ['admin', 'ops'].indexOf(ctx.role) >= 0;
      const kin = u.emergency || [];
      const docs = u.docs || [];

      return C.backLink('#/team', 'Team') +
      `<div class="row between wrap g-12 mb-20">
        <div class="row g-14" style="min-width:0">
          ${U.avatar(u, 'av-xl')}
          <div style="min-width:0">
            <h2 class="truncate">${esc(u.name)}</h2>
            <div class="row g-8 wrap mt-4">
              <span class="badge badge-lg" style="background:${r.color}18;color:${r.color}">${ico(r.icon)}${esc(r.label)}</span>
              <span class="muted t-base">${esc(u.title)}</span>
            </div>
            <div class="row g-6 wrap mt-8">${branchBadges(u)}</div>
          </div>
        </div>
        <div class="row g-8">
          <a class="btn btn-ghost btn-sm" href="tel:${attr(u.phone)}">${ico('phone')} Call</a>
          <button class="btn btn-wa btn-sm" data-act="wa">${ico('whatsapp')} WhatsApp</button>
          ${canEdit ? `<button class="btn btn-primary btn-sm" data-act="edit">${ico('pen')} Edit</button>` : ''}
        </div>
      </div>

      ${isTech ? `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Services completed', value: p.done, icon: 'checkcircle', tone: 'i-green', foot: p.total + ' assigned all time' })}
        ${C.stat({ label: 'Today', value: p.todayDone + '<span style="font-size:17px;color:var(--muted-2)">/' + p.today + '</span>', icon: 'zap', tone: 'i-brand', foot: p.open + ' still open overall' })}
        ${C.stat({ label: 'Customer rating', value: p.rating.toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: p.ratedN + ' rated visits' })}
        ${C.stat({ label: 'On-time arrival', value: p.onTime + '%', icon: 'clock', tone: 'i-blue', foot: 'Last 90 days' })}
      </div>` : ''}

      <div class="grid mb-20 split-rail">
        ${C.sectionCard('Employee record', C.kv([
          ['Employee ID', u.id],
          ['Role', r.label],
          ['Designation', u.title],
          ['Branches', branchBadges(u), true],
          ['Employment type', u.empType || '—'],
          ['Joined', u.joined ? S.fmtDate(u.joined) : '—'],
          ['Phone', u.phone],
          ['Email', u.email || '—'],
          ['Date of birth', u.dob ? S.fmtDate(u.dob) : '—'],
          ['Blood group', u.blood || '—'],
          ['Aadhaar / ID card', u.aadhaar || '—'],
          ['Address', u.addr || '—'],
          isTech ? ['Applicator licence', u.licence || '—'] : null,
          isTech ? ['Skills', (u.skills || []).join(', ') || '—'] : null
        ]) + `<div class="mt-14">
          <div class="flabel mb-8">Access in PestOps</div>
          <div class="row g-6 wrap">${(App.NAV[u.role] || []).reduce((acc, g) => acc.concat(g.items), []).map(i =>
            `<span class="chip">${ico(i.i)}${esc(i.t)}</span>`).join('')}</div>
        </div>`)}

        <div class="col g-20">
          ${C.sectionCard('Emergency contacts',
            kin.length ? `<div class="col g-8">${kin.map(e => `<div class="row g-10 card" style="padding:10px 12px">
              <div class="tile-ico i-red" style="width:32px;height:32px">${ico('phone', '', 15)}</div>
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-base truncate">${esc(e.name)}</div>
                <div class="t-sm muted">${esc(e.relation || 'Contact')}</div>
              </div>
              <a class="btn btn-ghost btn-sm nowrap" href="tel:${attr(e.phone)}">${esc(e.phone)}</a>
            </div>`).join('')}</div>`
              : U.empty({ icon: 'alert', title: 'No emergency contact on file', text: 'Add one from Edit.' }),
            `<span class="badge b-gray">${kin.length}</span>`)}

          ${C.sectionCard('Documents',
            docs.length ? `<div class="photogrid">${docs.map((doc, i) => `<div>
              <div class="photo"><img src="${attr(doc.src)}" alt="${attr(doc.name)}" data-doc="${i}" style="cursor:zoom-in"></div>
              <div class="t-xs muted truncate mt-4" title="${attr(doc.name)}">${esc(doc.name)}</div>
            </div>`).join('')}</div>`
              : U.empty({ icon: 'file', title: 'No documents uploaded', text: 'Aadhaar, licence, police verification.' }),
            `<span class="badge b-gray">${docs.length}</span>`)}
        </div>
      </div>

      ${isTech ? C.sectionCard("Today's schedule",
        p.todayJobs.length ? `<div style="margin:-11px 0">${p.todayJobs.map(j => C.jobRow(j, { hideTech: true })).join('')}</div>`
          : U.empty({ icon: 'calendar', title: 'Nothing scheduled today', text: '' }),
        `<span class="badge b-brand">${p.todayDone}/${p.today}</span>`) : ''}

      ${isTech ? `<div class="mt-20">${C.sectionCard('Recent completed work',
        p.doneJobs.length ? `<div class="tablewrap"><table class="tbl">
          <thead><tr><th>Ref</th><th>Customer</th><th>Date</th><th>Time on site</th><th>Findings</th><th>Rating</th><th></th></tr></thead>
          <tbody>${p.doneJobs.slice(0, 10).map(j => `<tr class="clickable" data-go="#/jobs/${j.id}">
            <td class="mono t-base fw-6">${esc(j.id)}</td>
            <td class="t-base">${esc(S.clientName(j.clientId))}</td>
            <td class="t-base">${esc(S.fmtDate(j.date))}</td>
            <td class="t-base">${esc(S.durationText((j.exec || {}).durationMins))}</td>
            <td class="t-sm muted truncate" style="max-width:200px">${esc(((j.exec || {}).findings || []).join(', ') || '—')}</td>
            <td>${(j.exec || {}).rating ? U.stars(j.exec.rating, 12) : '—'}</td>
            <td class="tight">${ico('cright', 'muted-2', 15)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : U.empty({ icon: 'clipcheck', title: 'No completed services yet', text: '' }), '', { flush: true })}</div>` : ''}`;
    },
    mount(root, ctx) {
      const u = S.user(ctx.id);
      root.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        if (e.target.closest('[data-act=edit]') && u) return memberEditor(u);
        if (e.target.closest('[data-act=wa]') && u) {
          U.whatsapp(u.phone, `Hi ${u.name.split(' ')[0]}, please check your schedule in PestOps.`);
          return;
        }
        const doc = e.target.closest('[data-doc]');
        if (doc && u) {
          const d = (u.docs || [])[Number(doc.getAttribute('data-doc'))];
          if (d) U.lightbox(d.src);
        }
      });
    }
  };

  /* =================================================================== list */
  V.team = {
    title: 'Team',
    addMember: () => memberEditor(null),
    render(ctx) {
      const db = S.get();
      const all = db.users.filter(u => u.role !== 'client');
      const users = branchFilter ? all.filter(u => (u.branches || []).indexOf(branchFilter) >= 0) : all;
      const techs = users.filter(u => u.role === 'tech');
      const board = S.techLeaderboard().filter(b => !branchFilter || (b.u.branches || []).indexOf(branchFilter) >= 0);
      const noBranch = all.filter(u => !(u.branches || []).length).length;

      return C.pageHead({
        title: 'Team',
        sub: users.length + ' people · ' + techs.length + ' field technicians' +
             (branchFilter ? ' · ' + S.branchName(branchFilter) : ''),
        actions: `<button class="btn btn-primary btn-sm" data-new>${ico('plus')} Add member</button>`
      }) +

      `<div class="row g-6 wrap mb-16">
        <button class="chip ${branchFilter ? '' : 'on'}" data-br="">All branches</button>
        ${db.branches.map(b => `<button class="chip ${branchFilter === b.id ? 'on' : ''}" data-br="${attr(b.id)}">
          ${ico('building')}${esc(b.name)}<span class="muted" style="margin-left:5px">${S.branchStaff(b.id).length}</span></button>`).join('')}
      </div>

      ${noBranch ? `<div class="banner ban-amber mb-16">${ico('alert')}<div>
        <div class="bt">${noBranch} team member${noBranch === 1 ? '' : 's'} without a branch</div>
        Open the member and pick their branches so they show up on branch filters and reports.</div></div>` : ''}

      <div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Technicians on duty', value: techs.length, icon: 'hardhat', tone: 'i-brand', foot: S.jobsOn(S.todayISO()).length + ' services allocated today' })}
        ${C.stat({ label: 'Services completed today', value: board.reduce((s, b) => s + b.todayDone, 0), icon: 'checkcircle', tone: 'i-green',
          foot: 'out of ' + board.reduce((s, b) => s + b.today, 0) + ' scheduled' })}
        ${C.stat({ label: 'Average rating', value: (board.reduce((s, b) => s + b.rating, 0) / (board.length || 1)).toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: 'Across all rated visits' })}
        ${C.stat({ label: 'Office staff', value: users.length - techs.length, icon: 'users', tone: 'i-violet', foot: 'Admin, ops, sales, accounts' })}
      </div>

      ${C.sectionCard("Field technicians — today's load",
        board.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
          ${board.map(b => `<a class="card card-int" href="#/team/${b.u.id}" style="padding:15px;display:block">
            <div class="row g-11 mb-12">
              ${U.avatar(b.u, 'av-lg')}
              <div class="grow" style="min-width:0">
                <div class="truncate fw-7 t-md">${esc(b.u.name)}</div>
                <div class="truncate t-sm muted">${esc((b.u.skills || []).join(', '))}</div>
              </div>
            </div>
            <div class="row between mb-6">
              <span class="t-sm muted">Today</span>
              <span class="t-sm fw-7">${b.todayDone} / ${b.today} done</span>
            </div>
            ${U.bar(b.today ? b.todayDone / b.today * 100 : 0)}
            <div class="row between g-8 mt-12" style="padding-top:11px;border-top:1px solid var(--line)">
              ${C.ratingRow(b.rating, b.done)}
              <span class="badge ${b.today - b.todayDone > 0 ? 'b-blue' : 'b-green'}">${b.today - b.todayDone > 0 ? (b.today - b.todayDone) + ' pending' : 'All clear'}</span>
            </div>
          </a>`).join('')}
        </div>` : U.empty({ icon: 'hardhat', title: 'No technicians at this branch', text: 'Pick another branch, or post someone to this one.' }))}

      <div class="mt-20">${C.sectionCard('All team members',
        users.length ? `<div class="tablewrap"><table class="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Branches</th><th>Contact</th><th>Joined</th><th class="r">Services done</th><th></th></tr></thead>
          <tbody>${users.map(u => {
            const r = Seed.ROLES[u.role];
            const p = u.role === 'tech' ? perf(u) : null;
            return `<tr class="clickable" data-go="#/team/${u.id}">
              <td><div class="row g-10">${U.avatar(u, 'av-sm')}
                <div><div class="fw-6">${esc(u.name)}</div><div class="t-sm muted">${esc(u.title)}</div></div></div></td>
              <td><span class="badge" style="background:${r.color}18;color:${r.color}">${ico(r.icon)}${esc(r.label)}</span></td>
              <td><div class="row g-4 wrap">${S.userBranches(u).length
                ? S.userBranches(u).map(b => `<span class="badge b-blue" title="${attr(b.name)}">${esc(b.code)}</span>`).join('')
                : `<span class="badge b-amber">${ico('alert')}None</span>`}</div></td>
              <td class="t-base">${esc(u.phone)}<div class="t-sm muted">${esc(u.email || '')}</div></td>
              <td class="t-base">${esc(u.joined ? S.fmtDate(u.joined) : '—')}</td>
              <td class="r fw-6">${p ? p.done : '—'}</td>
              <td class="tight">${ico('cright', 'muted-2', 15)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : U.empty({ icon: 'users', title: 'Nobody at this branch', text: 'Choose another branch above.' }),
        '', { flush: true })}</div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const br = e.target.closest('[data-br]');
        if (br) { branchFilter = br.getAttribute('data-br'); ctx.refresh(); return; }
        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        if (e.target.closest('[data-new]')) memberEditor(null);
      });
    }
  };

  /* ================================================================ profile */
  V.profile = {
    title: 'My Profile',
    render(ctx) {
      const u = ctx.me;
      const r = Seed.ROLES[u.role];
      const isTech = u.role === 'tech';
      const p = isTech ? perf(u) : null;
      const kin = u.emergency || [];

      return C.pageHead({ title: 'My Profile', sub: r.label + ' · ' + u.title }) +
      `<div class="card card-pad mb-20">
        <div class="row g-14 wrap">
          ${U.avatar(u, 'av-xl')}
          <div class="grow" style="min-width:0">
            <div class="fw-7" style="font-size:19px;letter-spacing:-.02em">${esc(u.name)}</div>
            <div class="muted t-base">${esc(u.title)}</div>
            <div class="row g-8 wrap mt-8">
              <span class="badge badge-lg" style="background:${r.color}18;color:${r.color}">${ico(r.icon)}${esc(r.label)}</span>
              ${u.licence ? `<span class="badge b-green badge-lg">${ico('shieldcheck')}Licence ${esc(u.licence)}</span>` : ''}
              ${branchBadges(u)}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="switch">${ico('users')} Switch role</button>
        </div>
      </div>

      ${isTech ? `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Services completed', value: p.done, icon: 'checkcircle', tone: 'i-green', foot: 'All time' })}
        ${C.stat({ label: 'Hours on site', value: p.hours + 'h', icon: 'timer', tone: 'i-brand', foot: 'Logged through the app' })}
        ${C.stat({ label: 'Customer rating', value: p.rating.toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: p.ratedN + ' ratings' })}
        ${C.stat({ label: 'On-time arrival', value: p.onTime + '%', icon: 'clock', tone: 'i-blue', foot: 'Last 90 days' })}
      </div>` : ''}

      <div class="grid grid-2">
        ${C.sectionCard('My details', C.kv([
          ['Employee ID', u.id], ['Phone', u.phone], ['Email', u.email || '—'],
          ['Branches', branchBadges(u), true],
          ['Employment type', u.empType || '—'],
          ['Joined', u.joined ? S.fmtDate(u.joined) : '—'],
          ['Blood group', u.blood || '—'],
          kin.length ? ['Emergency contact', kin[0].name + ' (' + kin[0].relation + ') · ' + kin[0].phone] : null,
          isTech ? ['Skills', (u.skills || []).join(', ')] : null
        ]))}
        ${C.sectionCard('What I can access',
          `<div class="col g-8">${(App.NAV[u.role] || []).reduce((a, g) => a.concat(g.items), []).map(i =>
            `<a class="row g-10" href="#/${i.r}" style="padding:8px 0;border-bottom:1px solid var(--line)">
              <div class="tile-ico i-gray" style="width:30px;height:30px">${ico(i.i, '', 15)}</div>
              <span class="grow fw-6 t-base">${esc(i.t)}</span>${ico('cright', 'muted-2', 15)}</a>`).join('')}</div>`)}
      </div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        if (e.target.closest('[data-act=switch]')) { S.clearSession(); location.href = 'index.html'; }
      });
    }
  };
})(window);
