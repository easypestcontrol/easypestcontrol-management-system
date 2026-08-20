/* ==========================================================================
   View: Dashboard (role aware)
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc;

  /* ------------------------------------------------------ shared sections */
  function todayBoard() {
    const jobs = S.jobsOn(S.todayISO());
    const body = jobs.length
      ? `<div style="margin:-11px 0">${jobs.map(j => C.jobRow(j)).join('')}</div>`
      : U.empty({ icon: 'calendar', title: 'No services scheduled today', text: 'Nothing on the board for today.' });
    const done = jobs.filter(j => j.status === 'completed').length;
    return C.sectionCard(
      "Today's operations",
      body,
      `<span class="badge b-brand">${done}/${jobs.length} done</span>
       <a href="#/schedule" class="btn btn-ghost btn-sm">Schedule ${ico('cright')}</a>`
    );
  }

  function attentionCard() {
    const k = S.kpis();
    const rows = [];

    k.unassignedList.slice(0, 2).forEach(j => rows.push(C.alertRow({
      icon: 'userplus', tone: 'i-amber', href: '#/jobs/' + j.id,
      title: 'Service ' + j.id + ' has no technician',
      sub: S.clientName(j.clientId) + ' · ' + S.relDay(j.date) + ' at ' + S.fmtTime(j.slot)
    })));

    k.expiringList.slice(0, 2).forEach(c => rows.push(C.alertRow({
      icon: 'shield', tone: 'i-violet', href: '#/contracts/' + c.id,
      title: 'AMC expiring in ' + S.dayDelta(c.end) + ' days',
      sub: S.clientName(c.clientId) + ' · ' + c.id + ' · renewal value ' + S.money(c.value)
    })));

    k.lowStockList.slice(0, 2).forEach(i => rows.push(C.alertRow({
      icon: 'package', tone: 'i-red', href: '#/inventory',
      title: 'Low stock — ' + i.name,
      sub: i.stock + ' ' + i.unit + ' left, reorder level is ' + i.min + ' ' + i.unit
    })));

    S.get().invoices.filter(i => i.status === 'overdue').slice(0, 2).forEach(i => rows.push(C.alertRow({
      icon: 'receipt', tone: 'i-red', href: '#/invoices/' + i.id,
      title: 'Invoice overdue — ' + S.money(S.invoiceTotals(i).balance),
      sub: S.clientName(i.clientId) + ' · ' + i.id + ' · ' + Math.abs(S.dayDelta(i.due)) + ' days late'
    })));

    return C.sectionCard('Needs attention',
      rows.length ? `<div style="margin:-11px 0">${rows.join('')}</div>`
        : U.empty({ icon: 'checkcircle', title: 'All clear', text: 'Nothing needs your attention right now.' }),
      `<span class="badge b-red">${rows.length}</span>`);
  }

  function deliveryChart() {
    const s = S.monthlySeries();
    return C.sectionCard('Service delivery — last 6 months',
      U.chart(s.map(m => ({ label: m.label, a: m.done, b: Math.max(0, m.total - m.done) })),
        { aLabel: 'Completed', bLabel: 'Pending' }) +
      `<div class="row g-16 mt-12" style="justify-content:center">
         <div class="legend-item"><i class="sw" style="background:var(--brand-500)"></i>Completed visits</div>
         <div class="legend-item"><i class="sw" style="background:var(--brand-200)"></i>Scheduled / pending</div>
       </div>`);
  }

  function serviceMixCard() {
    const mix = S.serviceMix();
    const palette = ['#0B7454', '#2FA981', '#7C3AED', '#2E90FA', '#F79009', '#94A3B8'];
    const slices = mix.map((m, i) => ({ label: m.name, n: m.n, color: palette[i % palette.length] }));
    return C.sectionCard('Service mix',
      `<div class="row g-20 wrap" style="justify-content:center">
         ${U.donut(slices)}
         <div class="legend grow" style="min-width:170px">
           ${slices.map(s => `<div class="legend-item"><i class="sw" style="background:${s.color}"></i>
             <span class="grow truncate">${esc(s.label)}</span><strong>${s.n}</strong></div>`).join('')}
         </div>
       </div>`);
  }

  function techCard() {
    const rows = S.techLeaderboard();
    return C.sectionCard('Technician performance',
      `<div class="col g-14">${rows.map(r => `
        <div class="row g-11">
          ${U.avatar(r.u, 'av-sm')}
          <div class="grow" style="min-width:0">
            <div class="row between g-8">
              <span class="truncate fw-6" style="font-size:13px">${esc(r.u.name)}</span>
              <span class="t-sm muted nowrap">${r.done} done</span>
            </div>
            <div class="row g-8 mt-4">
              ${U.bar(r.total ? r.done / r.total * 100 : 0)}
              <span class="t-xs muted nowrap" style="width:56px;text-align:right">${r.rating.toFixed(1)} ★</span>
            </div>
          </div>
        </div>`).join('')}</div>`,
      `<a href="#/team" class="btn btn-ghost btn-sm">All ${ico('cright')}</a>`);
  }

  function activityCard() {
    const feed = S.activityFeed(7);
    return C.sectionCard('Recent activity',
      `<div class="tl">${feed.map(f => `
        <div class="tl-item">
          <div class="dot done">${ico('check')}</div>
          <a href="${f.href}" style="display:block">
            <div style="font-size:13px;font-weight:600;line-height:1.4">${esc(f.title)}</div>
            <div class="t-sm muted">${esc(f.sub)} · ${esc(U.timeAgo(f.at))}</div>
          </a>
        </div>`).join('')}</div>`);
  }

  /* ------------------------------------------------------------- by role */
  function adminDash(ctx) {
    const k = S.kpis();
    return C.pageHead({
      title: 'Good ' + greetPart() + ', ' + ctx.me.name.split(' ')[0],
      sub: S.fmtLong(S.todayISO()) + ' · ' + k.todayTotal + ' services on the board today',
      actions: `<button class="btn btn-ghost btn-sm" data-act="wa-digest">${ico('whatsapp')} Send daily digest</button>
                <a href="#/schedule" class="btn btn-primary btn-sm">${ico('calendar')} Open schedule</a>`
    }) +
    `<div class="grid grid-4 mb-20">
      ${C.stat({ label: "Today's services", value: k.todayDone + '<span style="font-size:17px;color:var(--muted-2)">/' + k.todayTotal + '</span>',
        icon: 'briefcase', tone: 'i-brand', foot: `<span>${k.todayOpen} still open</span>` })}
      ${C.stat({ label: 'Active AMC contracts', value: k.activeContracts, icon: 'shield', tone: 'i-violet',
        foot: k.expiring ? `<span class="warn fw-6">${k.expiring} expiring in 30 days</span>` : 'All healthy' })}
      ${C.stat({ label: 'Receivables', value: S.moneyShort(k.receivable), icon: 'rupee', tone: 'i-amber',
        foot: k.overdue ? `<span class="danger fw-6">${S.moneyShort(k.overdue)} overdue</span>` : 'Nothing overdue' })}
      ${C.stat({ label: 'Open pipeline', value: S.moneyShort(k.pipeline), icon: 'trendup', tone: 'i-blue',
        foot: k.openLeads + ' live leads' })}
    </div>

    <div class="grid mb-20 split-main">
      ${todayBoard()}
      ${attentionCard()}
    </div>

    <div class="grid grid-2 mb-20">
      ${deliveryChart()}
      ${serviceMixCard()}
    </div>

    <div class="grid mb-20 split-rail">
      ${techCard()}
      ${activityCard()}
    </div>`;
  }

  function opsDash(ctx) {
    const k = S.kpis();
    const today = S.todayISO();
    const techs = S.get().users.filter(u => u.role === 'tech');
    const inprog = S.get().jobs.filter(j => j.status === 'inprogress');

    return C.pageHead({
      title: 'Dispatch board',
      sub: S.fmtLong(today) + ' · ' + k.todayTotal + ' services across ' + techs.length + ' technicians',
      actions: `<button class="btn btn-ghost btn-sm" data-act="wa-roster">${ico('whatsapp')} Send roster to team</button>
                <a href="#/schedule" class="btn btn-primary btn-sm">${ico('calendar')} Open scheduler</a>`
    }) +
    `<div class="grid grid-4 mb-20">
      ${C.stat({ label: "Today's services", value: k.todayTotal, icon: 'briefcase', tone: 'i-brand', foot: k.todayDone + ' completed' })}
      ${C.stat({ label: 'In progress now', value: inprog.length, icon: 'timer', tone: 'i-amber',
        foot: inprog.length ? esc(S.userName(inprog[0].techIds[0])) + ' on site' : 'No active service' })}
      ${C.stat({ label: 'Unassigned', value: k.unassigned, icon: 'alert', tone: k.unassigned ? 'i-red' : 'i-gray',
        foot: k.unassigned ? 'Needs a technician' : 'Everything assigned' })}
      ${C.stat({ label: 'Low stock items', value: k.lowStock, icon: 'package', tone: k.lowStock ? 'i-red' : 'i-green', foot: 'Below reorder level' })}
    </div>

    <section class="card mb-20">
      <div class="card-hd"><h3 class="grow">Technician boards — today</h3>
        <a href="#/team" class="btn btn-ghost btn-sm">Team ${ico('cright')}</a></div>
      <div class="card-bd">
        <div class="kanban">
          ${techs.map(t => {
            const js = S.jobsOn(today, t.id);
            const done = js.filter(j => j.status === 'completed').length;
            return `<div class="kancol">
              <div class="kancol-hd">
                ${U.avatar(t, 'av-xs')}
                <span class="knm grow truncate">${esc(t.name)}</span>
                <span class="kct">${done}/${js.length}</span>
              </div>
              <div class="kancol-bd">
                ${js.length ? js.map(j => `
                  <a class="kancard" href="#/jobs/${j.id}">
                    <div class="row between g-6 mb-4">
                      <span class="t-sm fw-7 brand">${esc(S.fmtTime(j.slot))}</span>
                      ${C.jobStatus(j)}
                    </div>
                    <div class="truncate fw-6" style="font-size:12.5px">${esc(S.clientName(j.clientId))}</div>
                    <div class="truncate t-sm muted">${esc(S.jobTitle(j))}</div>
                  </a>`).join('')
                  : `<div class="t-sm muted center-txt" style="padding:16px 0">No services today</div>`}
              </div>
            </div>`;
          }).join('')}
          ${k.unassignedList.length ? `<div class="kancol" style="border-color:var(--warn-500);border-style:dashed">
            <div class="kancol-hd"><i class="kdot" style="background:var(--warn-500)"></i>
              <span class="knm grow">Unassigned</span><span class="kct">${k.unassignedList.length}</span></div>
            <div class="kancol-bd">
              ${k.unassignedList.map(j => `<a class="kancard" href="#/jobs/${j.id}">
                <div class="row between g-6 mb-4"><span class="t-sm fw-7 warn">${esc(S.relDay(j.date))}</span>${C.jobType(j)}</div>
                <div class="truncate fw-6" style="font-size:12.5px">${esc(S.clientName(j.clientId))}</div>
                <div class="truncate t-sm muted">${esc(S.jobTitle(j))}</div>
              </a>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>
    </section>

    <div class="grid mb-20 split-even">
      ${attentionCard()}
      ${deliveryChart()}
    </div>`;
  }

  function salesDash(ctx) {
    const k = S.kpis();
    const db = S.get();
    const stages = Seed.LEAD_STAGES;
    const counts = {};
    stages.forEach(s => { counts[s.id] = db.leads.filter(l => l.stage === s.id).length; });
    const maxC = Math.max(1, ...Object.values(counts));
    const won = counts.won, lost = counts.lost;
    const convRate = (won + lost) ? Math.round(won / (won + lost) * 100) : 0;
    const openQuotes = db.quotations.filter(q => q.status === 'sent');

    return C.pageHead({
      title: 'Sales dashboard',
      sub: 'Pipeline, quotations and conversion for ' + esc(ctx.me.name),
      actions: `<button class="btn btn-ghost btn-sm" data-act="new-lead">${ico('userplus')} New lead</button>
                <a href="#/quotations" class="btn btn-primary btn-sm">${ico('filetext')} New quotation</a>`
    }) +
    `<div class="grid grid-4 mb-20">
      ${C.stat({ label: 'Open leads', value: k.openLeads, icon: 'userplus', tone: 'i-blue', foot: 'Across ' + S.OPEN_LEAD_STAGES.length + ' live stages' })}
      ${C.stat({ label: 'Pipeline value', value: S.moneyShort(k.pipeline), icon: 'trendup', tone: 'i-brand', foot: 'Weighted at quoted value' })}
      ${C.stat({ label: 'Quotes awaiting reply', value: openQuotes.length, icon: 'filetext', tone: 'i-amber',
        foot: S.moneyShort(openQuotes.reduce((s, q) => s + S.quoteTotals(q).total, 0)) + ' in play' })}
      ${C.stat({ label: 'Win rate', value: convRate + '%', icon: 'target', tone: 'i-violet', foot: won + ' won · ' + lost + ' lost' })}
    </div>

    <div class="grid mb-20 split-rail">
      ${C.sectionCard('Pipeline by stage',
        `<div class="col g-14">${stages.map(s => `
          <div>
            <div class="row between mb-4">
              <span class="row g-7 t-base fw-6"><i style="width:8px;height:8px;border-radius:50%;background:${s.color}"></i>${esc(s.label)}</span>
              <span class="t-sm muted">${counts[s.id]} · ${S.moneyShort(db.leads.filter(l => l.stage === s.id).reduce((a, b) => a + b.value, 0))}</span>
            </div>
            <div class="bar thick"><i style="width:${counts[s.id] / maxC * 100}%;background:${s.color}"></i></div>
          </div>`).join('')}</div>`,
        `<a href="#/leads" class="btn btn-ghost btn-sm">Pipeline ${ico('cright')}</a>`)}

      ${C.sectionCard('Quotations awaiting customer response',
        openQuotes.length ? `<div class="tablewrap"><table class="tbl" style="min-width:0">
          <tbody>${openQuotes.map(q => {
            const t = S.quoteTotals(q);
            const days = S.dayDelta(q.valid);
            return `<tr class="clickable" data-go="#/quotations/${q.id}">
              <td><div class="fw-6 truncate">${esc(q.title)}</div>
                  <div class="t-sm muted">${esc(q.id)} · sent ${esc(S.relDay(q.date))}</div></td>
              <td class="r tight"><div class="fw-7">${S.money(t.total)}</div>
                  <div class="t-sm ${days < 3 ? 'danger' : 'muted'}">${days >= 0 ? 'expires in ' + days + 'd' : 'expired'}</div></td>
            </tr>`;
          }).join('')}</tbody></table></div>`
          : U.empty({ icon: 'filetext', title: 'No open quotations', text: 'Everything has been answered.' }))}
    </div>

    <div class="grid grid-2 mb-20">
      ${C.sectionCard('Latest leads',
        `<div class="col">${db.leads.slice(0, 6).map(l => {
          const st = stages.find(s => s.id === l.stage);
          return `<a class="row g-11" href="#/leads" style="padding:10px 0;border-bottom:1px solid var(--line)">
            ${U.avatarName(l.name, st.color, 'av-sm')}
            <div class="grow" style="min-width:0">
              <div class="truncate fw-6" style="font-size:13px">${esc(l.name)}</div>
              <div class="truncate t-sm muted">${esc(l.source)} · ${esc(l.area)} · ${esc(S.relDay(l.created))}</div>
            </div>
            <div style="text-align:right"><div class="fw-7 t-base">${S.moneyShort(l.value)}</div>
            <div class="t-xs" style="color:${st.color};font-weight:650">${esc(st.label)}</div></div>
          </a>`;
        }).join('')}</div>`,
        `<a href="#/leads" class="btn btn-ghost btn-sm">All ${ico('cright')}</a>`)}
      ${activityCard()}
    </div>`;
  }

  function accountsDash(ctx) {
    const db = S.get();
    db.invoices.forEach(S.syncInvoiceStatus);
    const k = S.kpis();
    const unpaid = db.invoices.filter(i => i.status !== 'paid');
    const collected = db.payments.filter(p => S.dayDelta(p.date) >= -30).reduce((s, p) => s + p.amount, 0);

    const buckets = [
      { label: 'Not due yet', n: 0, v: 0, color: '#2E90FA' },
      { label: '1–30 days', n: 0, v: 0, color: '#F79009' },
      { label: '31–60 days', n: 0, v: 0, color: '#F04438' },
      { label: '60+ days', n: 0, v: 0, color: '#B42318' }
    ];
    unpaid.forEach(i => {
      const late = -S.dayDelta(i.due);
      const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
      buckets[b].n++; buckets[b].v += S.invoiceTotals(i).balance;
    });
    const maxV = Math.max(1, ...buckets.map(b => b.v));

    return C.pageHead({
      title: 'Accounts dashboard',
      sub: 'Receivables, collections and billing for ' + S.get().company.name,
      actions: `<button class="btn btn-ghost btn-sm" data-act="wa-reminders">${ico('whatsapp')} Send payment reminders</button>
                <a href="#/invoices" class="btn btn-primary btn-sm">${ico('receipt')} Invoices</a>`
    }) +
    `<div class="grid grid-4 mb-20">
      ${C.stat({ label: 'Total receivable', value: S.moneyShort(k.receivable), icon: 'rupee', tone: 'i-brand', foot: unpaid.length + ' open invoices' })}
      ${C.stat({ label: 'Overdue', value: S.moneyShort(k.overdue), icon: 'alert', tone: 'i-red', color: k.overdue ? 'var(--danger-700)' : '', foot: 'Needs follow-up today' })}
      ${C.stat({ label: 'Collected (30 days)', value: S.moneyShort(collected), icon: 'checkcircle', tone: 'i-green', foot: db.payments.length + ' receipts issued' })}
      ${C.stat({ label: 'Billed (30 days)', value: S.moneyShort(k.monthRev), icon: 'chart', tone: 'i-blue', foot: 'Including GST' })}
    </div>

    <div class="grid mb-20 split-rail">
      ${C.sectionCard('Receivables ageing',
        `<div class="col g-14">${buckets.map(b => `
          <div>
            <div class="row between mb-4">
              <span class="t-base fw-6">${esc(b.label)}</span>
              <span class="t-sm muted">${b.n} · ${S.moneyShort(b.v)}</span>
            </div>
            <div class="bar thick"><i style="width:${b.v / maxV * 100}%;background:${b.color}"></i></div>
          </div>`).join('')}</div>`)}

      ${C.sectionCard('Open invoices',
        `<div class="tablewrap"><table class="tbl" style="min-width:0"><tbody>
          ${unpaid.map(i => {
            const t = S.invoiceTotals(i);
            const st = S.INV_STATUS[i.status];
            return `<tr class="clickable" data-go="#/invoices/${i.id}">
              <td><div class="fw-6 truncate">${esc(S.clientName(i.clientId))}</div>
                  <div class="t-sm muted">${esc(i.id)} · due ${esc(S.relDay(i.due))}</div></td>
              <td class="tight"><span class="badge ${st.cls}">${esc(st.label)}</span></td>
              <td class="r tight fw-7">${S.money(t.balance)}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>`,
        `<a href="#/invoices" class="btn btn-ghost btn-sm">All ${ico('cright')}</a>`)}
    </div>

    <div class="grid grid-2 mb-20">
      ${C.sectionCard('Recent receipts',
        `<div class="col">${db.payments.slice(0, 6).map(p => `
          <a class="row g-11" href="#/invoices/${p.invoiceId}" style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div class="tile-ico i-green">${ico('rupee', '', 17)}</div>
            <div class="grow" style="min-width:0">
              <div class="truncate fw-6" style="font-size:13px">${esc(S.clientName((S.invoice(p.invoiceId) || {}).clientId))}</div>
              <div class="truncate t-sm muted">${esc(p.id)} · ${esc(p.mode)} · ${esc(S.fmtDate(p.date))}</div>
            </div>
            <div class="fw-7">${S.money(p.amount)}</div>
          </a>`).join('')}</div>`)}
      ${deliveryChart()}
    </div>`;
  }

  function greetPart() {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }

  /* --------------------------------------------------------------- view */
  V.dashboard = {
    title: 'Dashboard',
    render(ctx) {
      if (ctx.role === 'ops') return opsDash(ctx);
      if (ctx.role === 'sales') return salesDash(ctx);
      if (ctx.role === 'accounts') return accountsDash(ctx);
      return adminDash(ctx);
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const tr = e.target.closest('[data-go]');
        if (tr) { location.hash = tr.getAttribute('data-go'); return; }

        const act = e.target.closest('[data-act]');
        if (!act) return;
        const a = act.getAttribute('data-act');

        if (a === 'wa-digest') {
          const k = S.kpis();
          U.whatsapp('+91 98400 12345',
            `Daily digest — ${S.fmtDate(S.todayISO())}: ${k.todayDone}/${k.todayTotal} services done, ${k.unassigned} unassigned, ${S.moneyShort(k.overdue)} overdue.`,
            'Daily digest sent to management group');
        }
        if (a === 'wa-roster') {
          const n = S.jobsOn(S.todayISO()).length;
          U.whatsapp('Technician group', `Today's roster: ${n} services assigned. Check the app for your list.`, 'Roster pushed to all technicians');
        }
        if (a === 'wa-reminders') {
          const od = S.get().invoices.filter(i => i.status === 'overdue');
          U.whatsapp(od.length + ' clients', 'Gentle reminder: your invoice is past due. Kindly arrange payment.',
            'Payment reminders sent to ' + od.length + ' customer(s)');
        }
        if (a === 'new-lead' && V.leads && V.leads.newLead) V.leads.newLead();
      });
    }
  };
})(window);
