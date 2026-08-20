/* ==========================================================================
   View: Master Data — the reference lists the rest of PestOps is built on.
   Branches, lead sources and property types live here so they can be
   changed without touching code.
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'branches';

  const TABS = [
    { id: 'branches', label: 'Branches' },
    { id: 'sources',  label: 'Lead sources' },
    { id: 'types',    label: 'Property types' }
  ];

  /* ================================================================ branches */
  function nextBranchId() {
    const db = S.get();
    let n = 1;
    while (db.branches.some(b => b.id === 'BR-' + String(n).padStart(2, '0'))) n++;
    return 'BR-' + String(n).padStart(2, '0');
  }

  function branchEditor(existing) {
    const b = existing || {};
    const staff = S.get().users.filter(u => ['admin', 'ops', 'sales'].indexOf(u.role) >= 0);

    U.modal({
      title: existing ? 'Edit branch' : 'Add branch',
      sub: 'Team members and leads are posted to branches',
      size: 'md',
      body: `<div class="grid grid-2">
          ${U.field('Branch name', `<input class="input" id="bName" value="${attr(b.name || '')}" placeholder="e.g. Anna Nagar">`, '', true)}
          ${U.field('Short code', `<input class="input" id="bCode" value="${attr(b.code || '')}" placeholder="e.g. ANR" maxlength="6">`, '', true)}
          ${U.field('Phone', `<input class="input" id="bPhone" value="${attr(b.phone || '')}" placeholder="+91 ">`)}
          ${U.field('Email', `<input class="input" id="bEmail" value="${attr(b.email || '')}" placeholder="branch@shieldpest.in">`)}
        </div>
        <div class="mt-14">${U.field('Address', `<input class="input" id="bAddr" value="${attr(b.addr || '')}" placeholder="Street, area">`)}</div>
        <div class="mt-14">${U.field('Areas covered',
          `<input class="input" id="bAreas" value="${attr((b.areas || []).join(', '))}" placeholder="Adyar, Besant Nagar, Thiruvanmiyur">`,
          'Comma separated. A lead captured in one of these localities is routed to this branch and to the person posted here.')}</div>
        <div class="grid grid-2 mt-14">
          ${U.field('City', `<input class="input" id="bCity" value="${attr(b.city || 'Chennai')}">`)}
          ${U.field('PIN code', `<input class="input" id="bPin" value="${attr(b.pin || '')}" inputmode="numeric" maxlength="6">`)}
          ${U.field('GSTIN', `<input class="input" id="bGst" value="${attr(b.gstin || '')}" placeholder="33AABCS1429B1ZP">`)}
          ${U.field('Branch manager', `<select class="select" id="bMgr">
            <option value="">— not assigned —</option>
            ${staff.map(u => `<option value="${attr(u.id)}"${u.id === b.managerId ? ' selected' : ''}>${esc(u.name)} · ${esc(u.title)}</option>`).join('')}
          </select>`)}
          ${U.field('Opened on', `<input class="input" type="date" id="bOpen" value="${attr(b.opened || S.todayISO())}">`)}
          ${U.field('Status', `<select class="select" id="bActive">
            <option value="1"${b.active !== false ? ' selected' : ''}>Operating</option>
            <option value="0"${b.active === false ? ' selected' : ''}>Closed</option>
          </select>`)}
        </div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} ${existing ? 'Save branch' : 'Add branch'}</button>`,
      onMount(root, close) {
        U.qs('[data-save]', root).onclick = () => {
          const name = U.qs('#bName', root).value.trim();
          const code = U.qs('#bCode', root).value.trim().toUpperCase();
          if (!name || !code) { U.toast('Branch name and short code are required', { tone: 'err' }); return; }

          const db = S.get();
          const clash = db.branches.find(x => x.code.toUpperCase() === code && x !== existing);
          if (clash) { U.toast('That short code is already used by ' + clash.name, { tone: 'err' }); return; }

          const rec = existing || { id: nextBranchId() };
          rec.name = name;
          rec.code = code;
          rec.phone = U.qs('#bPhone', root).value.trim();
          rec.email = U.qs('#bEmail', root).value.trim();
          rec.addr = U.qs('#bAddr', root).value.trim();
          rec.areas = U.qs('#bAreas', root).value.split(',')
            .map(x => x.trim()).filter(Boolean)
            .filter((x, i, all) => all.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i);
          rec.city = U.qs('#bCity', root).value.trim() || 'Chennai';
          rec.pin = U.qs('#bPin', root).value.trim();
          rec.gstin = U.qs('#bGst', root).value.trim().toUpperCase();
          rec.managerId = U.qs('#bMgr', root).value;
          rec.opened = U.qs('#bOpen', root).value || S.todayISO();
          rec.active = U.qs('#bActive', root).value === '1';
          if (!existing) db.branches.push(rec);

          S.save(); close(); App.refresh();
          U.toast(existing ? 'Branch updated' : 'Branch added', { sub: rec.name + ' · ' + rec.code });
        };
      }
    });
  }

  function removeBranch(b) {
    const staff = S.branchStaff(b.id);
    if (staff.length) {
      U.toast('Cannot remove ' + b.name, {
        tone: 'err',
        sub: staff.length + ' team member' + (staff.length === 1 ? ' is' : 's are') + ' still posted there'
      });
      return;
    }
    U.confirm({
      title: 'Remove ' + b.name + '?',
      message: 'The branch disappears from the team member form and from lead capture. Records already tagged to it keep the tag.',
      confirmText: 'Remove', tone: 'danger'
    }).then(ok => {
      if (!ok) return;
      const db = S.get();
      db.branches = db.branches.filter(x => x.id !== b.id);
      S.save(); App.refresh();
      U.toast('Branch removed', { sub: b.name });
    });
  }

  function branchCards() {
    const list = S.get().branches;
    if (!list.length) return U.empty({ icon: 'building', title: 'No branches yet', text: 'Add your first branch to start posting people to it.' });

    return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(310px,1fr))">
      ${list.map(b => {
        const staff = S.branchStaff(b.id);
        const leads = S.get().leads.filter(l => l.branch === b.id);
        const mgr = S.user(b.managerId);
        const areas = S.branchAreas(b);
        return `<div class="card" style="padding:16px">
          <div class="row between g-10 mb-12">
            <div class="tile-ico lg ${b.active === false ? 'i-gray' : 'i-brand'}">${ico('building')}</div>
            <div class="row g-6">
              <span class="badge ${b.active === false ? 'b-gray' : 'b-green'}"><i class="pip"></i>${b.active === false ? 'Closed' : 'Operating'}</span>
              <button class="iconbtn" style="width:28px;height:28px" data-edit="${attr(b.id)}" title="Edit branch">${ico('pen', '', 14)}</button>
              <button class="iconbtn" style="width:28px;height:28px" data-del="${attr(b.id)}" title="Remove branch">${ico('trash', '', 14)}</button>
            </div>
          </div>
          <div class="fw-7" style="font-size:15px;letter-spacing:-.015em">${esc(b.name)}</div>
          <div class="t-sm muted mono mt-2">${esc(b.id)} · ${esc(b.code)}</div>
          <div class="t-sm muted mt-8" style="line-height:1.55;min-height:34px">${esc(b.addr || '—')}${b.pin ? ', ' + esc(b.pin) : ''}</div>
          <div class="row g-8 wrap mt-10">
            ${b.phone ? `<span class="badge b-gray">${ico('phone')}${esc(b.phone)}</span>` : ''}
            ${b.gstin ? `<span class="badge b-gray mono">${esc(b.gstin)}</span>` : ''}
          </div>
          <div class="mt-12">
            <div class="t-xs muted fw-6" style="letter-spacing:.03em;text-transform:uppercase">Areas covered</div>
            <div class="row g-6 wrap mt-8">${
              areas.length
                ? areas.slice(0, 6).map(a => `<span class="badge b-blue">${esc(a)}</span>`).join('') +
                  (areas.length > 6 ? `<span class="badge b-gray">+${areas.length - 6} more</span>` : '')
                : `<span class="t-sm muted">None listed — leads from this side of town are not routed here yet.</span>`
            }</div>
          </div>
          <div class="row between g-8 mt-12" style="padding-top:12px;border-top:1px solid var(--line)">
            ${mgr ? `<div class="row g-8">${U.avatar(mgr, 'av-xs')}<span class="t-sm truncate">${esc(mgr.name)}</span></div>`
                  : `<span class="t-sm muted">No manager</span>`}
            <span class="t-sm muted nowrap">${staff.length} staff · ${leads.length} leads</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* ============================================================ simple lists */
  const LISTS = {
    sources: { key: 'leadSources',   title: 'Lead sources',   icon: 'message',
      hint: 'Where the lead came from. Shown in the "Lead source" dropdown on lead capture.',
      placeholder: 'e.g. Google Ads' },
    types:   { key: 'propertyTypes', title: 'Property types', icon: 'building',
      hint: 'The kind of premises being treated. Shown in the "Property type" dropdown.',
      placeholder: 'e.g. Warehouse' }
  };

  function simpleList(which) {
    const cfg = LISTS[which];
    const list = S.get()[cfg.key] || [];
    return C.sectionCard(cfg.title,
      C.hint(esc(cfg.hint), cfg.icon) +
      `<div class="row g-8 mt-14 mb-14">
        <input class="input grow" id="mdNew" placeholder="${attr(cfg.placeholder)}" autocomplete="off" style="max-width:340px">
        <button class="btn btn-primary" data-add>${ico('plus')} Add</button>
      </div>
      ${list.length ? `<div class="row g-8 wrap">${list.map(v =>
        `<span class="chip" style="padding-right:6px">${esc(v)}
          <button class="iconbtn" style="width:20px;height:20px;margin-left:4px" data-rm="${attr(v)}" title="Remove">${ico('x', '', 12)}</button>
        </span>`).join('')}</div>`
        : `<div class="t-sm muted">Nothing in this list yet.</div>`}`,
      `<span class="badge b-gray">${list.length} entries</span>`);
  }

  function addToList(which, value, ctx) {
    const cfg = LISTS[which];
    const v = String(value || '').trim();
    if (!v) return;
    const db = S.get();
    db[cfg.key] = db[cfg.key] || [];
    if (db[cfg.key].some(x => x.toLowerCase() === v.toLowerCase())) {
      U.toast('“' + v + '” is already in the list', { tone: 'err' });
      return;
    }
    db[cfg.key].push(v);
    S.save(); ctx.refresh();
    U.toast('Added to ' + cfg.title.toLowerCase(), { sub: v });
  }

  function removeFromList(which, value, ctx) {
    const cfg = LISTS[which];
    const db = S.get();
    if ((db[cfg.key] || []).length <= 1) {
      U.toast('Keep at least one entry', { tone: 'err', sub: cfg.title + ' cannot be empty' });
      return;
    }
    db[cfg.key] = db[cfg.key].filter(x => x !== value);
    S.save(); ctx.refresh();
    U.toast('Removed', { sub: value });
  }

  /** Every distinct locality any branch has claimed. */
  function coveredAreas() {
    const seen = {};
    S.get().branches.forEach(b => S.branchAreas(b).forEach(a => { seen[a.toLowerCase()] = a; }));
    return Object.keys(seen).map(k => seen[k]);
  }

  /* ==================================================================== view */
  V.masterdata = {
    title: 'Master Data',
    render(ctx) {
      const db = S.get();
      const active = db.branches.filter(b => b.active !== false).length;

      return C.pageHead({
        title: 'Master Data',
        sub: db.branches.length + ' branches · ' + (db.leadSources || []).length + ' lead sources · ' +
             (db.propertyTypes || []).length + ' property types',
        actions: tab === 'branches'
          ? `<button class="btn btn-primary btn-sm" data-newbranch>${ico('plus')} Add branch</button>` : ''
      }) +

      (tab === 'branches' ? `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Branches', value: db.branches.length, icon: 'building', tone: 'i-brand', foot: active + ' operating' })}
        ${C.stat({ label: 'Staff posted', value: db.users.filter(u => u.role !== 'client' && (u.branches || []).length).length,
          icon: 'users', tone: 'i-violet', foot: 'Across all branches' })}
        ${C.stat({ label: 'Areas covered', value: coveredAreas().length,
          icon: 'building', tone: 'i-blue', foot: 'Route leads to a branch' })}
        ${C.stat({ label: 'Unposted staff', value: db.users.filter(u => u.role !== 'client' && !(u.branches || []).length).length,
          icon: 'alert', tone: 'i-amber', foot: 'Need a branch assigned' })}
      </div>` : '') +

      C.tabsBar(TABS, tab) +
      `<div class="mt-16">${
        tab === 'branches' ? branchCards() : simpleList(tab)
      }</div>`;
    },

    mount(root, ctx) {
      const add = () => {
        const inp = U.qs('#mdNew', root);
        if (inp) { addToList(tab, inp.value, ctx); }
      };
      const inp = U.qs('#mdNew', root);
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }

        if (e.target.closest('[data-newbranch]')) return branchEditor(null);
        if (e.target.closest('[data-add]')) return add();

        const rm = e.target.closest('[data-rm]');
        if (rm) return removeFromList(tab, rm.getAttribute('data-rm'), ctx);

        const ed = e.target.closest('[data-edit]');
        if (ed) return branchEditor(S.branch(ed.getAttribute('data-edit')));

        const del = e.target.closest('[data-del]');
        if (del) return removeBranch(S.branch(del.getAttribute('data-del')));
      });
    }
  };
})(window);
