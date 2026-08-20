/* ==========================================================================
   PestOps — Shell: navigation config, router, chrome
   ========================================================================== */
(function (w, d) {
  'use strict';

  const V = (w.V = w.V || {});      // view registry (populated by views/*.js)
  let page = U.qs('#page');

  /**
   * Swap in a brand-new page element on every route change.
   * Views attach their listeners to this node; replacing it drops them,
   * so handlers from a previously-visited screen can never fire again.
   */
  function swapPage(html, narrow) {
    const fresh = d.createElement('main');
    fresh.className = 'page' + (narrow ? ' page-narrow' : '');
    fresh.id = 'page';
    fresh.innerHTML = html;
    page.replaceWith(fresh);
    page = fresh;
    return fresh;
  }

  /* ==================================================================== nav */
  const K = () => S.kpis();

  const NAV = {
    admin: [
      { g: '', items: [
        { r: 'dashboard', t: 'Dashboard', i: 'grid' }
      ]},
      { g: 'Master Data', items: [
        { r: 'masterdata', t: 'Branches & Lists',  i: 'layers' },
        { r: 'services',   t: 'Service Catalogue', i: 'spray' }
      ]},
      { g: 'Sales & Operations', items: [
        { r: 'clients',    t: 'Customers',        i: 'building' },
        { r: 'leads',      t: 'Leads',            i: 'userplus', c: () => K().openLeads },
        { r: 'quotations', t: 'Quotations',       i: 'filetext' },
        { r: 'contracts',  t: 'Contracts',        i: 'shield', c: () => K().expiring, hot: true },
        { r: 'amc',        t: 'AMC',              i: 'calcheck', c: () => K().todayOpen },
        { r: 'onetime',    t: 'One-time service', i: 'zap' },
        { r: 'schedule',   t: 'Schedule',         i: 'calendar' },
        { r: 'team',       t: 'Team',             i: 'users' }
      ]},
      { g: 'Resources', items: [
        { r: 'inventory', t: 'Inventory', i: 'package', c: () => K().lowStock, hot: true },
        { r: 'audits',    t: 'Audits',    i: 'clipcheck' }
      ]},
      { g: 'Finance', items: [
        { r: 'invoices', t: 'Invoices & Payments', i: 'receipt' },
        { r: 'reports',  t: 'Reports',             i: 'chart' }
      ]},
      { g: '', items: [
        { r: 'settings', t: 'Settings', i: 'settings' }
      ]}
    ],
    ops: [
      { g: '', items: [{ r: 'dashboard', t: 'Dashboard', i: 'grid' }]},
      { g: 'Master Data', items: [
        { r: 'masterdata', t: 'Branches & Lists',  i: 'layers' },
        { r: 'services',   t: 'Service Catalogue', i: 'spray' }
      ]},
      { g: 'Sales & Operations', items: [
        { r: 'clients',   t: 'Customers',        i: 'building' },
        { r: 'contracts', t: 'Contracts',        i: 'shield', c: () => K().expiring, hot: true },
        { r: 'amc',       t: 'AMC',              i: 'calcheck', c: () => K().todayOpen },
        { r: 'onetime',   t: 'One-time service', i: 'zap' },
        { r: 'schedule',  t: 'Schedule',         i: 'calendar' },
        { r: 'team',      t: 'Technicians',      i: 'hardhat' },
        { r: 'audits',    t: 'Audits',           i: 'clipcheck' }
      ]},
      { g: 'Resources', items: [
        { r: 'inventory', t: 'Inventory', i: 'package', c: () => K().lowStock, hot: true }
      ]}
    ],
    sales: [
      { g: '', items: [{ r: 'dashboard', t: 'Dashboard', i: 'grid' }]},
      { g: 'Master Data', items: [
        { r: 'services', t: 'Service Catalogue', i: 'spray' }
      ]},
      { g: 'Sales & Operations', items: [
        { r: 'clients',    t: 'Customers',        i: 'building' },
        { r: 'leads',      t: 'Leads',            i: 'userplus', c: () => K().openLeads },
        { r: 'quotations', t: 'Quotations',       i: 'filetext' },
        { r: 'contracts',  t: 'Contracts',        i: 'shield' },
        { r: 'amc',        t: 'AMC',              i: 'calcheck' },
        { r: 'onetime',    t: 'One-time service', i: 'zap' }
      ]}
    ],
    accounts: [
      { g: '', items: [{ r: 'dashboard', t: 'Dashboard', i: 'grid' }]},
      { g: 'Billing', items: [
        { r: 'invoices',   t: 'Invoices & Payments', i: 'receipt' },
        { r: 'quotations', t: 'Quotations',          i: 'filetext' },
        { r: 'contracts',  t: 'Contracts',           i: 'shield' }
      ]},
      { g: 'Reference', items: [
        { r: 'clients', t: 'Customers', i: 'building' },
        { r: 'reports', t: 'Reports', i: 'chart' }
      ]}
    ],
    tech: [
      { g: '', items: [
        { r: 'my-work',     t: "Today's Work", i: 'zap' },
        { r: 'my-schedule', t: 'My Schedule',  i: 'calendar' },
        { r: 'my-history',  t: 'Work History', i: 'clipcheck' },
        { r: 'my-stock',    t: 'My Stock',     i: 'package' },
        { r: 'profile',     t: 'My Profile',   i: 'user' }
      ]}
    ],
    client: [
      { g: '', items: [
        { r: 'portal',          t: 'Overview',        i: 'grid' },
        { r: 'portal-contracts',t: 'My Contracts',    i: 'shield' },
        { r: 'portal-visits',   t: 'Service History', i: 'clipcheck' },
        { r: 'portal-invoices', t: 'Invoices',        i: 'receipt' },
        { r: 'portal-request',  t: 'Request Service', i: 'plus' }
      ]}
    ]
  };

  const TABS = {
    admin:    ['dashboard', 'clients', 'amc', 'onetime', '__more'],
    ops:      ['dashboard', 'amc', 'onetime', 'schedule', '__more'],
    sales:    ['dashboard', 'clients', 'leads', 'quotations', '__more'],
    accounts: ['dashboard', 'invoices', 'contracts', 'clients', '__more'],
    tech:     ['my-work', 'my-schedule', 'my-history', 'profile'],
    client:   ['portal', 'portal-contracts', 'portal-visits', 'portal-invoices']
  };

  const TITLES = {
    dashboard: 'Dashboard', leads: 'Leads', quotations: 'Quotations',
    contracts: 'Contracts', jobs: 'Services', schedule: 'Schedule', clients: 'Customers',
    amc: 'AMC', onetime: 'One-time service',
    services: 'Service Catalogue', team: 'Team', inventory: 'Inventory', audits: 'Audits',
    masterdata: 'Master Data', approve: 'Your quotation', pdf: 'Quotation PDF',
    board: 'Service assignment',
    invoices: 'Invoices & Payments', reports: 'Reports', settings: 'Settings',
    'my-work': "Today's Work", 'my-schedule': 'My Schedule', 'my-history': 'Work History',
    'my-stock': 'My Stock', profile: 'My Profile',
    portal: 'Overview', 'portal-contracts': 'My Contracts', 'portal-visits': 'Service History',
    'portal-invoices': 'Invoices', 'portal-request': 'Request Service'
  };

  const DEFAULT_ROUTE = { admin: 'dashboard', ops: 'dashboard', sales: 'dashboard',
    accounts: 'dashboard', tech: 'my-work', client: 'portal' };

  /* Routes reachable by drill-down even if not in the sidebar */
  const EXTRA = {
    admin:    ['profile', 'approve', 'pdf', 'jobs', 'contract-new', 'board'],
    ops:      ['profile', 'invoices', 'reports', 'approve', 'pdf', 'jobs', 'contract-new', 'board'],
    sales:    ['profile', 'jobs', 'approve', 'pdf', 'schedule', 'contract-new', 'board'],
    accounts: ['profile', 'approve', 'pdf'],
    tech:     ['jobs', 'approve', 'pdf'],
    client:   ['profile', 'approve', 'pdf']
  };

  function allowed(role) {
    const set = {};
    (NAV[role] || []).forEach(g => g.items.forEach(i => { set[i.r] = 1; }));
    (EXTRA[role] || []).forEach(r => { set[r] = 1; });
    return set;
  }

  /* ================================================================= chrome */
  let ME = null;
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    S.load();

    // Deep link support: app.html?as=U04 or app.html?role=tech#/my-work
    const qp = new URLSearchParams(location.search || '');
    const asUser = qp.get('as');
    const asRole = qp.get('role');
    if (asUser && S.user(asUser)) S.setSession(asUser);
    else if (asRole) {
      const u = S.get().users.filter(x => x.role === asRole)[0];
      if (u) S.setSession(u.id);
    }

    if (!S.me() && (qp.get('q') || /^#\/(approve|pdf)\//.test(location.hash || ''))) {
      const guest = S.get().users.filter(x => x.role === 'client')[0] || S.get().users[0];
      if (guest) S.setSession(guest.id);
    }

    ME = S.me();
    if (!ME) { location.replace('index.html'); return; }

    U.qs('#sbMark').innerHTML = ico('shieldcheck');
    U.qs('#sbClose').innerHTML = ico('x');
    U.qs('#menuBtn').innerHTML = ico('menu');
    U.qs('#searchBtn').innerHTML = ico('search');
    U.qs('#bellBtn').innerHTML = ico('bell') + '<i class="dot"></i>';
    U.qs('#sbRole').textContent = Seed.ROLES[ME.role].label;

    renderUserChip();
    renderNav();
    renderTabs();
    renderQuickBtn();
    wire();
    route();
  }

  function renderUserChip() {
    U.qs('#userChip').innerHTML =
      U.avatar(ME, 'av-sm') +
      `<div class="grow" style="text-align:left;min-width:0">
         <div class="truncate" style="font-size:13px;font-weight:620">${U.esc(ME.name)}</div>
         <div class="truncate" style="font-size:11px;color:var(--muted)">${U.esc(ME.title)}</div>
       </div>` + ico('cup', '', 15);

    U.qs('#userMenu').innerHTML =
      `<div style="padding:9px 10px 8px">
         <div style="font-size:13px;font-weight:650">${U.esc(ME.name)}</div>
         <div style="font-size:11.5px;color:var(--muted)">${U.esc(ME.email || ME.phone)}</div>
       </div>
       <div class="dropsep"></div>
       <a class="dropitem" href="#/profile">${ico('user')} My profile</a>
       <button class="dropitem" data-act="switch">${ico('users')} Switch role</button>
       <button class="dropitem" data-act="reset">${ico('refresh')} Reset demo data</button>
       <div class="dropsep"></div>
       <button class="dropitem dgr" data-act="logout">${ico('logout')} Sign out</button>`;
  }

  function renderNav() {
    const nav = U.qs('#nav');
    nav.innerHTML = (NAV[ME.role] || []).map(grp =>
      `<div class="navgroup">
         ${grp.g ? `<div class="navlabel">${U.esc(grp.g)}</div>` : ''}
         ${grp.items.map(it => {
           const n = it.c ? it.c() : 0;
           return `<a class="navitem" href="#/${it.r}" data-route="${it.r}">
             ${ico(it.i)}<span class="grow truncate">${U.esc(it.t)}</span>
             ${n ? `<span class="navcount${it.hot ? ' hot' : ''}">${n}</span>` : ''}
           </a>`;
         }).join('')}
       </div>`
    ).join('');
  }

  function renderTabs() {
    const list = TABS[ME.role] || [];
    const flat = {};
    (NAV[ME.role] || []).forEach(g => g.items.forEach(i => { flat[i.r] = i; }));

    U.qs('#tabbar').innerHTML = list.map(r => {
      if (r === '__more') {
        return `<button class="tabitem" data-more>${ico('menu')}<span>More</span></button>`;
      }
      const it = flat[r] || { t: TITLES[r] || r, i: 'grid' };
      const n = it.c ? it.c() : 0;
      const short = { 'Dashboard': 'Home', 'Quotations': 'Quotes', 'AMC Contracts': 'AMC',
        'One-time service': 'One-time', 'Customers': 'Clients',
        "Today's Work": 'Today', 'My Schedule': 'Schedule', 'Work History': 'History',
        'My Profile': 'Profile', 'Invoices & Payments': 'Invoices', 'Service History': 'Visits',
        'My Contracts': 'Contracts', 'Technicians': 'Team', 'Overview': 'Home' }[it.t] || it.t;
      return `<a class="tabitem" href="#/${r}" data-route="${r}">
        ${ico(it.i)}<span>${U.esc(short)}</span>
        ${n ? `<i class="tabdot">${n > 9 ? '9+' : n}</i>` : ''}
      </a>`;
    }).join('');
  }

  /* Quick-create menu. Icon-only so it never duplicates the page's own
     primary action button sitting a few pixels below it. */
  const QUICK = {
    quote:    { t: 'New quotation',    i: 'filetext',  go: () => V.quotations.newQuote() },
    lead:     { t: 'New lead',         i: 'userplus',  go: () => V.leads.newLead() },
    job:      { t: 'Schedule a service',   i: 'briefcase', go: () => V.jobs.newJob() },
    contract: { t: 'New contract',     i: 'shield',    go: () => V['contract-new'].choose() },
    client:   { t: 'Add customer',       i: 'building',  go: () => V.clients.addCustomer() },
    payment:  { t: 'Record payment',   i: 'rupee',     go: () => V.invoices.quickPay() },
    request:  { t: 'Request service',  i: 'plus',      go: () => { location.hash = '#/portal-request'; } },
    member:   { t: 'Add team member',  i: 'userplus',  go: () => V.team.addMember() }
  };

  const QUICK_BY_ROLE = {
    admin:    ['client', 'lead', 'quote', 'job', 'contract', 'member'],
    ops:      ['job', 'contract', 'member'],
    sales:    ['client', 'lead', 'quote'],
    accounts: ['payment', 'quote'],
    client:   ['request'],
    tech:     []
  };

  function renderQuickBtn() {
    const keys = QUICK_BY_ROLE[ME.role] || [];
    const wrap = U.qs('#quickWrap');
    if (!keys.length) { wrap.style.display = 'none'; return; }

    U.qs('#quickBtn').innerHTML = ico('plus') + ico('cdown', '', 13);
    U.qs('#quickMenu').innerHTML = keys.map(k =>
      `<button class="dropitem" data-quick="${k}">${ico(QUICK[k].i)} ${U.esc(QUICK[k].t)}</button>`).join('');

    U.qs('#quickMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-quick]');
      if (!b) return;
      const menu = U.qs('#quickMenu');
      menu.style.display = 'none';
      menu.classList.remove('shown');
      const q = QUICK[b.getAttribute('data-quick')];
      if (q) q.go();
    });
  }

  /* ================================================================ router */
  function resolve() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    let name = parts[0] || DEFAULT_ROUTE[ME.role];
    const id = parts[1] || null;

    const perm = allowed(ME.role);
    if (!perm[name] && !V[name]) name = DEFAULT_ROUTE[ME.role];
    if (!perm[name]) name = DEFAULT_ROUTE[ME.role];

    const detailKey = name + 'Detail';
    const key = (id && V[detailKey]) ? detailKey : name;
    return { key: key, name: name, id: id };
  }

  /** Screens shown to a customer, stripped of every piece of app chrome. */
  const BARE = ['approve', 'pdf'];

  let currentRoute = null;

  function route() {
    const r = resolve();
    currentRoute = r;
    const view = V[r.key];

    if (!view) {
      swapPage(U.empty({ icon: 'alertcircle', title: 'Screen not available', text: 'This module is not part of your role.' }));
      return;
    }

    const ctx = { id: r.id, me: ME, role: ME.role, go: go, refresh: route };
    let html = '';
    try { html = view.render(ctx) || ''; }
    catch (e) {
      html = U.empty({ icon: 'alertcircle', title: 'Could not render this screen', text: String(e && e.message || e) });
      if (w.console) console.error(e);
    }
    // narrow may depend on who is looking — the technician flow is a phone
    // column, the same screen for a manager is a full-width desk page.
    const isNarrow = typeof view.narrow === 'function' ? view.narrow(ctx) : view.narrow;
    const root = swapPage(html, isNarrow);
    try { w.scrollTo(0, 0); } catch (e) { /* non-browser host */ }

    if (view.mount) { try { view.mount(root, ctx); } catch (e) { if (w.console) console.error(e); } }

    const title = (view.title ? (typeof view.title === 'function' ? view.title(ctx) : view.title) : TITLES[r.name]) || 'PestOps';
    U.qs('#tbTitle').textContent = title;
    U.qs('#tbCrumb').textContent = view.crumb ? (typeof view.crumb === 'function' ? view.crumb(ctx) : view.crumb) : '';
    d.title = title + ' · PestOps';

    // The two customer-facing screens are a document, not the app. No sidebar,
    // no top bar, no navigation -- the person reading it does not work here.
    d.body.classList.toggle('bare', BARE.indexOf(r.name) >= 0);

    U.qsa('#nav .navitem').forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === r.name));
    U.qsa('#tabbar .tabitem').forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === r.name));

    closeDrawer();
  }

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  /** Re-render current screen and refresh sidebar counters. */
  function refresh() { renderNav(); renderTabs(); route(); }

  /* ================================================================== wire */
  function openDrawer()  { U.qs('#sidebar').classList.add('open'); U.qs('#scrim').classList.add('on'); }
  function closeDrawer() { U.qs('#sidebar').classList.remove('open'); U.qs('#scrim').classList.remove('on'); }

  function wire() {
    w.addEventListener('hashchange', route);
    U.qs('#menuBtn').onclick = openDrawer;
    U.qs('#sbClose').onclick = closeDrawer;
    U.qs('#scrim').onclick = closeDrawer;

    U.qs('#tabbar').addEventListener('click', e => {
      if (e.target.closest('[data-more]')) openDrawer();
    });

    U.qs('#userMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.getAttribute('data-act');
      if (a === 'switch' || a === 'logout') { S.clearSession(); location.href = 'index.html'; }
      if (a === 'reset') {
        U.confirm({ title: 'Reset demo data?', message: 'All changes you made in the demo will be discarded and the sample business restored.', confirmText: 'Reset', tone: 'danger' })
          .then(ok => { if (ok) { S.reset(); U.toast('Demo data restored'); refresh(); } });
      }
    });

    U.qs('#searchBtn').onclick = openSearch;
    U.qs('#bellBtn').addEventListener('click', renderBell);

    d.addEventListener('keydown', e => {
      if (e.key === '/' && !/input|textarea|select/i.test((e.target.tagName || ''))) {
        e.preventDefault(); openSearch();
      }
    });
  }

  /* ========================================================= notifications */
  function renderBell() {
    const n = S.get().notifications;
    U.qs('#bellMenu').innerHTML =
      `<div class="row between" style="padding:11px 13px;border-bottom:1px solid var(--line)">
         <strong style="font-size:13.5px">Notifications</strong>
         <span class="badge b-red">${n.filter(x => x.unread).length} new</span>
       </div>
       <div style="max-height:352px;overflow-y:auto">
         ${n.map(x => `<div class="row-top g-10" style="padding:11px 13px;border-bottom:1px solid var(--line);${x.unread ? 'background:var(--brand-50)' : ''}">
            <div class="tile-ico ${U.TONE_CLS[x.tone] || 'i-gray'}" style="width:30px;height:30px">${ico(x.icon, '', 15)}</div>
            <div class="grow" style="min-width:0">
              <div style="font-size:12.5px;font-weight:620;line-height:1.35">${U.esc(x.title)}</div>
              <div style="font-size:11.5px;color:var(--muted);line-height:1.45;margin-top:2px">${U.esc(x.body)}</div>
              <div style="font-size:10.5px;color:var(--muted-2);margin-top:3px">${U.esc(x.at)}</div>
            </div>
         </div>`).join('')}
       </div>
       <button class="dropitem center" style="justify-content:center;font-size:12.5px" data-close>Mark all as read</button>`;

    U.qs('#bellMenu').addEventListener('click', e => {
      if (e.target.closest('[data-close]')) {
        S.get().notifications.forEach(x => { x.unread = false; });
        S.save();
        U.qs('#bellBtn .dot').style.display = 'none';
        U.qs('#bellMenu').style.display = 'none';
        U.qs('#bellMenu').classList.remove('shown');
        U.toast('All notifications marked read');
      }
    }, { once: true });
  }

  /* ================================================================ search */
  function openSearch() {
    const m = U.modal({
      title: 'Search everything',
      sub: 'Customers, services, quotations, contracts, invoices',
      body: `<div class="searchbar" style="max-width:none">${ico('search')}
               <input id="gq" placeholder="Type a name, number or ID…" autocomplete="off">
             </div>
             <div id="gres" class="mt-16"></div>`,
      onMount(root, close) {
        const inp = U.qs('#gq', root);
        const res = U.qs('#gres', root);

        function run() {
          const q = inp.value.trim().toLowerCase();
          if (q.length < 1) {
            res.innerHTML = `<div class="muted t-sm" style="padding:8px 2px">Start typing to search across the whole system.</div>`;
            return;
          }
          const db = S.get();
          const hits = [];
          const push = (icon, title, sub, href) => hits.push({ icon, title, sub, href });

          db.clients.forEach(c => { if ((c.name + c.contact + c.phone + c.id).toLowerCase().includes(q)) push('building', c.name, c.type + ' · ' + c.id, '#/clients/' + c.id); });
          db.jobs.forEach(j => { if ((j.id + S.clientName(j.clientId) + S.jobTitle(j)).toLowerCase().includes(q)) push('briefcase', j.id + ' — ' + S.jobTitle(j), S.clientName(j.clientId) + ' · ' + S.fmtDate(j.date), '#/jobs/' + j.id); });
          db.quotations.forEach(x => { if ((x.id + x.title).toLowerCase().includes(q)) push('filetext', x.id + ' — ' + x.title, S.money(S.quoteTotals(x).total), '#/quotations/' + x.id); });
          db.contracts.forEach(x => { if ((x.id + S.clientName(x.clientId)).toLowerCase().includes(q)) push('shield', x.id, S.clientName(x.clientId) + ' · ' + S.planSummary(x), '#/contracts/' + x.id); });
          db.invoices.forEach(x => { if ((x.id + S.clientName(x.clientId)).toLowerCase().includes(q)) push('receipt', x.id, S.clientName(x.clientId) + ' · ' + S.money(S.invoiceTotals(x).total), '#/invoices/' + x.id); });
          db.leads.forEach(x => { if ((x.id + x.name + x.phone).toLowerCase().includes(q)) push('userplus', x.name, 'Lead · ' + x.id, '#/leads'); });

          const perm = allowed(ME.role);
          const shown = hits.filter(h => perm[h.href.replace('#/', '').split('/')[0]] || (EXTRA[ME.role] || []).includes(h.href.replace('#/', '').split('/')[0])).slice(0, 12);

          res.innerHTML = shown.length
            ? shown.map(h => `<a class="dropitem" href="${h.href}" data-hit style="padding:10px">
                ${ico(h.icon)}<div class="grow" style="min-width:0">
                  <div class="truncate" style="font-size:13px;font-weight:600">${U.esc(h.title)}</div>
                  <div class="truncate" style="font-size:11.5px;color:var(--muted)">${U.esc(h.sub)}</div>
                </div>${ico('cright', '', 14)}</a>`).join('')
            : `<div class="muted t-sm" style="padding:8px 2px">No matches for “${U.esc(q)}”.</div>`;
        }

        inp.addEventListener('input', U.debounce(run, 130));
        res.addEventListener('click', e => { if (e.target.closest('[data-hit]')) close(); });
        run();
      }
    });
    return m;
  }

  /* ================================================================ expose */
  w.App = { go: go, refresh: refresh, route: route, me: () => ME, NAV: NAV, TITLES: TITLES, openSearch: openSearch };

  d.addEventListener('DOMContentLoaded', boot);
  if (d.readyState !== 'loading') boot();
})(window, document);
