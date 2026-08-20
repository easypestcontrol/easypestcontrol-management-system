/* ==========================================================================
   View: Reports — business, delivery, productivity and pest-trend analysis
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc;

  let tab = 'business';

  const PALETTE = ['#0B7454', '#2FA981', '#7C3AED', '#2E90FA', '#F79009', '#F04438', '#94A3B8'];

  function pestTrend() {
    const map = {};
    S.get().jobs.filter(j => j.status === 'completed' && j.exec).forEach(j => {
      (j.exec.findings || []).forEach(f => {
        if (f.indexOf('No activity') === 0) return;
        const key = f.split('—')[0].trim();
        map[key] = (map[key] || 0) + 1;
      });
    });
    return Object.keys(map).map(k => ({ label: k, n: map[k] })).sort((a, b) => b.n - a.n);
  }

  function chemUse() {
    const map = {};
    S.get().jobs.filter(j => j.exec && (j.exec.chemicals || []).length).forEach(j => {
      j.exec.chemicals.forEach(c => { map[c.id] = (map[c.id] || 0) + c.qty; });
    });
    return Object.keys(map).map(id => {
      const it = S.item(id) || {};
      return { id: id, name: it.name || id, unit: it.unit || '', qty: map[id], cost: (it.cost || 0) * map[id] };
    }).sort((a, b) => b.cost - a.cost);
  }

  function clientValue() {
    return S.get().clients.map(c => {
      const invs = S.get().invoices.filter(i => i.clientId === c.id);
      const billed = invs.reduce((s, i) => s + S.invoiceTotals(i).total, 0);
      const visits = S.jobsForClient(c.id).filter(j => j.status === 'completed').length;
      return { c: c, billed: billed, visits: visits };
    }).sort((a, b) => b.billed - a.billed);
  }

  function businessTab() {
    const s = S.monthlySeries();
    const k = S.kpis();
    const maxRev = Math.max(1, ...s.map(x => x.revenue));
    const cv = clientValue();
    const totalBilled = cv.reduce((a, b) => a + b.billed, 0);

    return `<div class="grid grid-4 mb-20">
      ${C.stat({ label: 'Billed (6 months)', value: S.moneyShort(s.reduce((a, b) => a + b.revenue, 0)), icon: 'chart', tone: 'i-brand', foot: 'Including GST' })}
      ${C.stat({ label: 'Contract book', value: S.moneyShort(S.get().contracts.filter(c => S.contractStatus(c).key !== 'expired').reduce((a, b) => a + b.value, 0)), icon: 'shield', tone: 'i-violet', foot: k.activeContracts + ' live AMCs' })}
      ${C.stat({ label: 'Collected', value: S.moneyShort(S.get().payments.reduce((a, b) => a + b.amount, 0)), icon: 'rupee', tone: 'i-green', foot: S.get().payments.length + ' receipts' })}
      ${C.stat({ label: 'Outstanding', value: S.moneyShort(k.receivable), icon: 'alert', tone: k.overdue ? 'i-red' : 'i-amber', foot: S.moneyShort(k.overdue) + ' overdue' })}
    </div>

    <div class="grid grid-2 mb-20">
      ${C.sectionCard('Revenue by month',
        `<div class="chart">${s.map(m => `<div class="chart-col">
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="height:${m.revenue / maxRev * 100}%" title="${esc(S.money(m.revenue))}"></div>
          </div>
          <div class="chart-lbl">${esc(m.label)}</div>
        </div>`).join('')}</div>
        <div class="row between mt-14 t-sm muted"><span>Oldest</span><span>Highest: ${S.moneyShort(maxRev)}</span></div>`)}

      ${C.sectionCard('Revenue by customer',
        `<div class="col g-12">${cv.slice(0, 6).map((x, i) => `
          <div>
            <div class="row between mb-4">
              <span class="t-base fw-6 truncate">${esc(x.c.name)}</span>
              <span class="t-sm muted nowrap">${S.moneyShort(x.billed)} · ${x.visits} visits</span>
            </div>
            <div class="bar"><i style="width:${totalBilled ? x.billed / cv[0].billed * 100 : 0}%;background:${PALETTE[i % PALETTE.length]}"></i></div>
          </div>`).join('')}</div>`)}
    </div>

    ${C.sectionCard('Customer value ranking',
      `<div class="tablewrap"><table class="tbl">
        <thead><tr><th>#</th><th>Customer</th><th>Type</th><th class="r">Visits delivered</th><th class="r">Billed</th><th class="r">Share</th></tr></thead>
        <tbody>${cv.map((x, i) => `<tr class="clickable" data-go="#/clients/${x.c.id}">
          <td class="muted fw-6">${i + 1}</td>
          <td>${C.clientCell(x.c.id)}</td>
          <td><span class="badge b-gray">${esc(x.c.type)}</span></td>
          <td class="r fw-6">${x.visits}</td>
          <td class="r fw-7">${S.money(x.billed)}</td>
          <td class="r t-base muted">${totalBilled ? Math.round(x.billed / totalBilled * 100) : 0}%</td>
        </tr>`).join('')}</tbody>
      </table></div>`, '', { flush: true })}`;
  }

  function deliveryTab() {
    const s = S.monthlySeries();
    const mix = S.serviceMix();
    const slices = mix.map((m, i) => ({ label: m.name, n: m.n, color: PALETTE[i % PALETTE.length] }));
    const all = S.get().jobs;
    const done = all.filter(j => j.status === 'completed');
    const rated = done.filter(j => j.exec && j.exec.rating);
    const avgDur = done.filter(j => j.exec && j.exec.durationMins);
    const byType = {};
    all.forEach(j => { byType[j.type] = (byType[j.type] || 0) + 1; });

    return `<div class="grid grid-4 mb-20">
      ${C.stat({ label: 'Visits delivered', value: done.length, icon: 'calcheck', tone: 'i-brand', foot: all.length + ' scheduled all time' })}
      ${C.stat({ label: 'Completion rate', value: Math.round(done.length / Math.max(1, all.filter(j => S.dayDelta(j.date) <= 0).length) * 100) + '%', icon: 'target', tone: 'i-green', foot: 'Of visits due to date' })}
      ${C.stat({ label: 'Average time on site', value: S.durationText(avgDur.length ? avgDur.reduce((a, b) => a + b.exec.durationMins, 0) / avgDur.length : 0), icon: 'timer', tone: 'i-blue', foot: 'Measured by the app' })}
      ${C.stat({ label: 'Customer rating', value: (rated.length ? rated.reduce((a, b) => a + b.exec.rating, 0) / rated.length : 0).toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: rated.length + ' rated visits' })}
    </div>

    <div class="grid grid-2 mb-20">
      ${C.sectionCard('Scheduled vs completed',
        U.chart(s.map(m => ({ label: m.label, a: m.done, b: Math.max(0, m.total - m.done) })), { aLabel: 'Completed', bLabel: 'Pending' }) +
        `<div class="row g-16 mt-12" style="justify-content:center">
          <div class="legend-item"><i class="sw" style="background:var(--brand-500)"></i>Completed</div>
          <div class="legend-item"><i class="sw" style="background:var(--brand-200)"></i>Pending</div>
        </div>`)}

      ${C.sectionCard('Service mix',
        `<div class="row g-20 wrap" style="justify-content:center">${U.donut(slices)}
          <div class="legend grow" style="min-width:160px">${slices.map(x =>
            `<div class="legend-item"><i class="sw" style="background:${x.color}"></i>
             <span class="grow truncate">${esc(x.label)}</span><strong>${x.n}</strong></div>`).join('')}</div>
        </div>`)}
    </div>

    ${C.sectionCard('Services by type',
      `<div class="grid grid-auto">${Object.keys(byType).map(t => {
        const meta = S.JOB_TYPE[t] || S.JOB_TYPE['One-Time'];
        return `<div class="card card-pad">
          <div class="row between mb-8"><span class="badge ${meta.cls}">${ico(meta.icon)}${esc(t)}</span>
            <span class="fw-7 t-lg">${byType[t]}</span></div>
          ${U.bar(byType[t] / all.length * 100)}
          <div class="t-sm muted mt-6">${Math.round(byType[t] / all.length * 100)}% of all services</div>
        </div>`;
      }).join('')}</div>`)}`;
  }

  function peopleTab() {
    const board = S.techLeaderboard();
    const maxDone = Math.max(1, ...board.map(b => b.done));
    return `<div class="grid grid-3 mb-20">
      ${C.stat({ label: 'Technicians', value: board.length, icon: 'hardhat', tone: 'i-brand', foot: 'Active in the field' })}
      ${C.stat({ label: 'Visits per technician', value: Math.round(board.reduce((a, b) => a + b.done, 0) / Math.max(1, board.length)), icon: 'chart', tone: 'i-blue', foot: 'Average, all time' })}
      ${C.stat({ label: 'Average rating', value: (board.reduce((a, b) => a + b.rating, 0) / Math.max(1, board.length)).toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: 'Across the team' })}
    </div>

    ${C.sectionCard('Technician productivity',
      `<div class="tablewrap"><table class="tbl">
        <thead><tr><th>Technician</th><th>Services completed</th><th class="c">Today</th><th class="c">Open</th><th class="c">On-time</th><th class="c">Rating</th></tr></thead>
        <tbody>${board.map(b => `<tr class="clickable" data-go="#/team/${b.u.id}">
          <td><div class="row g-10">${U.avatar(b.u, 'av-sm')}
            <div><div class="fw-6">${esc(b.u.name)}</div><div class="t-sm muted">${esc((b.u.skills || []).join(', '))}</div></div></div></td>
          <td style="min-width:170px"><div class="row g-10">${U.bar(b.done / maxDone * 100)}
            <span class="fw-7 nowrap">${b.done}</span></div></td>
          <td class="c fw-6">${b.todayDone}/${b.today}</td>
          <td class="c">${b.total - b.done}</td>
          <td class="c"><span class="badge ${b.onTime >= 92 ? 'b-green' : 'b-amber'}">${b.onTime}%</span></td>
          <td class="c">${U.stars(b.rating, 12)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`, '', { flush: true })}`;
  }

  function pestTab() {
    const trend = pestTrend();
    const maxT = Math.max(1, ...trend.map(t => t.n));
    const chem = chemUse();
    const totalCost = chem.reduce((a, b) => a + b.cost, 0);

    return `<div class="grid grid-2 mb-20">
      ${C.sectionCard('Pest activity reported',
        trend.length ? `<div class="col g-12">${trend.map((t, i) => `
          <div>
            <div class="row between mb-4"><span class="t-base fw-6">${esc(t.label)}</span>
              <span class="t-sm muted">${t.n} sightings</span></div>
            <div class="bar thick"><i style="width:${t.n / maxT * 100}%;background:${PALETTE[i % PALETTE.length]}"></i></div>
          </div>`).join('')}</div>`
        : `<div class="t-sm muted">No pest activity recorded yet.</div>`,
        '', { footer: 'Sourced from technician findings on completed service reports.' })}

      ${C.sectionCard('Chemical consumption',
        chem.length ? `<div class="tablewrap"><table class="tbl" style="min-width:0">
          <thead><tr><th>Product</th><th class="r">Used</th><th class="r">Cost</th></tr></thead>
          <tbody>${chem.map(c => `<tr>
            <td class="fw-6 truncate">${esc(c.name)}</td>
            <td class="r">${Math.round(c.qty)} ${esc(c.unit)}</td>
            <td class="r fw-6">${S.money(c.cost)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td class="fw-7">Total</td><td></td><td class="r fw-7">${S.money(totalCost)}</td></tr></tfoot>
        </table></div>`
        : `<div class="t-sm muted">No chemical usage recorded yet.</div>`,
        '', { footer: 'Deducted automatically from stock when a technician finishes a service.' })}
    </div>

    ${C.sectionCard('Sites needing attention',
      `<div class="tablewrap"><table class="tbl">
        <thead><tr><th>Customer</th><th>Last visit</th><th>Findings on last visit</th><th class="c">Rating</th><th></th></tr></thead>
        <tbody>${S.get().clients.map(c => {
          const js = S.jobsForClient(c.id).filter(j => j.status === 'completed');
          const last = js[0];
          if (!last) return '';
          const f = (last.exec || {}).findings || [];
          const bad = f.filter(x => x.indexOf('No activity') !== 0).length;
          return `<tr class="clickable" data-go="#/clients/${c.id}">
            <td>${C.clientCell(c.id)}</td>
            <td class="t-base">${esc(S.fmtDate(last.date))}<div class="t-sm muted">${esc(S.relDay(last.date))}</div></td>
            <td>${f.length ? `<div class="row g-4 wrap">${f.map(x =>
              `<span class="badge ${x.indexOf('No activity') === 0 ? 'b-green' : 'b-amber'}">${esc(x)}</span>`).join('')}</div>` : '<span class="muted">—</span>'}</td>
            <td class="c">${(last.exec || {}).rating ? U.stars(last.exec.rating, 12) : '—'}</td>
            <td class="tight">${bad >= 2 ? `<span class="badge b-red">${ico('alert')}Watch</span>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`, '', { flush: true })}`;
  }

  V.reports = {
    title: 'Reports',
    render(ctx) {
      const tabs = [
        { id: 'business', label: 'Business' },
        { id: 'delivery', label: 'Service delivery' },
        { id: 'people', label: 'Technicians' },
        { id: 'pest', label: 'Pest & chemical trends' }
      ];
      let body = '';
      if (tab === 'business') body = businessTab();
      else if (tab === 'delivery') body = deliveryTab();
      else if (tab === 'people') body = peopleTab();
      else body = pestTab();

      return C.pageHead({
        title: 'Reports',
        sub: 'Live figures from every module — no spreadsheets involved',
        actions: `<button class="btn btn-ghost btn-sm" data-act="print">${ico('printer')} Print</button>
                  <button class="btn btn-ghost btn-sm" data-act="export">${ico('download')} Export CSV</button>`
      }) +
      C.tabsBar(tabs, tab) +
      `<div class="mt-20">${body}</div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.getAttribute('data-act') === 'print') w.print();
        if (b.getAttribute('data-act') === 'export') U.toast('Export queued', { sub: 'CSV will download in the production build' });
      });
    }
  };
})(window);
