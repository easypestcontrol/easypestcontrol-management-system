/* ==========================================================================
   View: Technician app — Today's Work, schedule, history, stock
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let heroTimer = null;

  function myJobs(ctx) { return S.jobsForTech(ctx.me.id); }

  function jobCard(j, opts) {
    const o = opts || {};
    const tp = S.timeParts(j.slot);
    const cl = S.client(j.clientId) || {};
    const live = j.status === 'inprogress';
    return `<a class="jobcard ${live ? 'live' : ''}" href="#/jobs/${j.id}">
      <div class="jtime">
        <div class="hh">${esc(tp.hh)}</div>
        <div class="ap">${esc(tp.ap)}</div>
      </div>
      <div class="grow" style="min-width:0">
        <div class="row-top between g-8 mb-4">
          <span class="fw-7" style="font-size:14px;line-height:1.32">${esc(cl.name)}</span>
          <span class="shrink0">${C.jobStatus(j)}</span>
        </div>
        <div class="t-base muted clamp-2">${esc(S.jobTitle(j))}</div>
        <div class="row-top g-6 mt-6 t-sm muted">
          ${ico('pin', 'shrink0', 13)}<span class="truncate">${esc(cl.addr || '')}</span>
        </div>
        <div class="row g-6 wrap mt-8">
          ${C.jobType(j)}
          ${j.priority === 'high' ? `<span class="badge b-red">${ico('alert')}Priority</span>` : ''}
          ${o.showDate ? `<span class="badge b-gray">${esc(S.relDay(j.date))}</span>` : ''}
          <span class="badge b-gray">${ico('timer')}${esc(S.durationText(j.mins))}</span>
        </div>
      </div>
      <div class="row center shrink0" style="width:20px">${ico('cright', 'muted-2', 17)}</div>
    </a>`;
  }

  /* ============================================================ Today's Work */
  V['my-work'] = {
    title: "Today's Work",
    narrow: true,
    render(ctx) {
      const today = S.todayISO();
      const jobs = S.jobsOn(today, ctx.me.id);
      const done = jobs.filter(j => j.status === 'completed');
      const active = jobs.filter(j => j.status === 'inprogress' || j.status === 'enroute')[0];
      const next = jobs.filter(j => j.status === 'scheduled')[0];
      const mins = done.reduce((s, j) => s + ((j.exec || {}).durationMins || 0), 0);
      const upcoming = S.jobsForTech(ctx.me.id)
        .filter(j => S.dayDelta(j.date) > 0 && j.status !== 'completed')
        .sort((a, b) => (a.date + a.slot) < (b.date + b.slot) ? -1 : 1).slice(0, 3);

      return `<div class="tech-hero mb-16">
        <div class="row between g-10">
          <div style="min-width:0">
            <div class="greet">${esc(S.fmtLong(today))}</div>
            <div class="nm truncate">Hi ${esc(ctx.me.name.split(' ')[0])} 👋</div>
          </div>
          ${U.avatar(ctx.me, 'av-lg')}
        </div>
        <div class="tech-metrics">
          <div class="tech-metric"><div class="v">${jobs.length}</div><div class="k">Services today</div></div>
          <div class="tech-metric"><div class="v">${done.length}</div><div class="k">Completed</div></div>
          <div class="tech-metric"><div class="v">${Math.round(mins / 60 * 10) / 10}h</div><div class="k">On site</div></div>
        </div>
      </div>

      ${active ? `<div class="card mb-16" style="border-color:var(--brand-400);box-shadow:0 0 0 3px var(--brand-50)">
        <div class="card-bd">
          <div class="row between g-8 mb-10">
            <span class="badge b-amber badge-lg"><i class="pip pulse-dot"></i>${esc(active.status === 'inprogress' ? 'Work in progress' : 'On the way')}</span>
            ${active.status === 'inprogress' && active.exec && active.exec.startedAt
              ? `<span class="mono fw-7 t-md" id="heroTimer">00:00</span>` : ''}
          </div>
          <div class="fw-7" style="font-size:16px">${esc(S.clientName(active.clientId))}</div>
          <div class="t-base muted">${esc(S.jobTitle(active))}</div>
          <a class="btn btn-primary btn-lg btn-block mt-14" href="#/jobs/${active.id}">
            ${ico('aright')} Continue this service</a>
        </div>
      </div>` : next ? `<div class="card mb-16">
        <div class="card-bd">
          <div class="row between g-8 mb-10">
            <span class="badge b-blue badge-lg">${ico('clock')}Next service</span>
            <span class="fw-7 t-md">${esc(S.fmtTime(next.slot))}</span>
          </div>
          <div class="fw-7" style="font-size:16px">${esc(S.clientName(next.clientId))}</div>
          <div class="t-base muted">${esc(S.jobTitle(next))}</div>
          <div class="row-top g-6 mt-8 t-sm muted">
            ${ico('pin', 'shrink0', 14)}<span>${esc((S.client(next.clientId) || {}).addr || '')}</span>
          </div>
          <a class="btn btn-primary btn-lg btn-block mt-14" href="#/jobs/${next.id}">
            ${ico('play')} Start this service</a>
        </div>
      </div>` : `<div class="card mb-16"><div class="card-bd">
        ${U.empty({ icon: 'checkcircle', title: jobs.length ? 'All done for today!' : 'Nothing scheduled today',
          text: jobs.length ? 'You finished every service on your list. Well done.' : 'Enjoy the break — check your upcoming schedule below.' })}
      </div></div>`}

      ${C.sectionCard("Today's services",
        jobs.length ? `<div class="col g-10">${jobs.map(j => jobCard(j)).join('')}</div>`
          : `<div class="t-sm muted center-txt" style="padding:10px 0">Nothing on the list today.</div>`,
        `<span class="badge b-brand">${done.length}/${jobs.length}</span>`)}

      ${upcoming.length ? `<div class="mt-16">${C.sectionCard('Coming up',
        `<div class="col g-10">${upcoming.map(j => jobCard(j, { showDate: true })).join('')}</div>`,
        `<a href="#/my-schedule" class="btn btn-ghost btn-sm">All ${ico('cright')}</a>`)}</div>` : ''}`;
    },
    mount(root, ctx) {
      if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
      const active = S.jobsOn(S.todayISO(), ctx.me.id).filter(j => j.status === 'inprogress')[0];
      const el = U.qs('#heroTimer', root);
      if (active && active.exec && active.exec.startedAt && el) {
        const t0 = new Date(active.exec.startedAt.replace(' ', 'T')).getTime();
        const tick = () => {
          const node = U.qs('#heroTimer');
          if (!node) { clearInterval(heroTimer); heroTimer = null; return; }
          const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
          const hh = String(Math.floor(s / 3600)).padStart(2, '0');
          const mm = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
          const ss = String(s % 60).padStart(2, '0');
          node.textContent = (hh !== '00' ? hh + ':' : '') + mm + ':' + ss;
        };
        tick();
        heroTimer = setInterval(tick, 1000);
      }
    }
  };

  /* ============================================================== Schedule */
  V['my-schedule'] = {
    title: 'My Schedule',
    narrow: true,
    render(ctx) {
      const all = myJobs(ctx).filter(j => S.dayDelta(j.date) >= 0 && j.status !== 'completed')
        .sort((a, b) => (a.date + a.slot) < (b.date + b.slot) ? -1 : 1);
      const byDate = {};
      all.forEach(j => { (byDate[j.date] = byDate[j.date] || []).push(j); });
      const dates = Object.keys(byDate).sort();

      const week = [];
      for (let i = 0; i < 7; i++) {
        const d = Seed.D(i);
        week.push({ iso: d, n: S.jobsOn(d, ctx.me.id).length });
      }

      return C.pageHead({ title: 'My Schedule', sub: all.length + ' upcoming services assigned to you' }) +

      `<div class="card card-pad mb-16">
        <div class="flabel mb-10">Next 7 days</div>
        <div class="daystrip" style="padding-bottom:0">
          ${week.map(x => {
            const d = S.parse(x.iso);
            return `<div class="daybox ${x.iso === S.todayISO() ? 'on' : ''}">
              <div class="dw">${esc(S.DOW[d.getDay()])}</div>
              <div class="dn">${d.getDate()}</div>
              ${x.n ? `<div class="t-xs" style="font-weight:700;margin-top:2px">${x.n}</div>` : '<div style="height:14px"></div>'}
            </div>`;
          }).join('')}
        </div>
      </div>

      ${dates.length ? dates.map(d => `<div class="mb-16">
        <div class="row between mb-10">
          <div class="row g-8">
            <span class="fw-7 t-md">${esc(S.fmtDay(d))}</span>
            <span class="badge b-gray">${esc(S.relDay(d))}</span>
          </div>
          <span class="t-sm muted">${byDate[d].length} service${byDate[d].length > 1 ? 's' : ''}</span>
        </div>
        <div class="col g-10">${byDate[d].map(j => jobCard(j)).join('')}</div>
      </div>`).join('')
      : U.empty({ icon: 'calendar', title: 'No upcoming services', text: 'Your schedule is clear. New services appear here as soon as the office assigns them.' })}`;
    }
  };

  /* =============================================================== History */
  V['my-history'] = {
    title: 'Work History',
    narrow: true,
    render(ctx) {
      const done = myJobs(ctx).filter(j => j.status === 'completed')
        .sort((a, b) => a.date > b.date ? -1 : 1);
      const mins = done.reduce((s, j) => s + ((j.exec || {}).durationMins || 0), 0);
      const rated = done.filter(j => j.exec && j.exec.rating);
      const avg = rated.length ? rated.reduce((s, j) => s + j.exec.rating, 0) / rated.length : 0;
      const thisMonth = done.filter(j => j.date.slice(0, 7) === S.todayISO().slice(0, 7));

      return C.pageHead({ title: 'Work History', sub: done.length + ' services completed' }) +

      `<div class="grid grid-3 mb-20" style="gap:12px">
        ${C.stat({ label: 'This month', value: thisMonth.length, icon: 'calcheck', tone: 'i-brand', foot: done.length + ' all time' })}
        ${C.stat({ label: 'Hours on site', value: Math.round(mins / 60) + 'h', icon: 'timer', tone: 'i-blue', foot: 'Tracked by the app' })}
        ${C.stat({ label: 'Rating', value: avg.toFixed(1) + '★', icon: 'star', tone: 'i-amber', foot: rated.length + ' ratings' })}
      </div>

      ${done.length ? `<div class="col g-10">${done.slice(0, 25).map(j => {
        const x = j.exec || {};
        return `<a class="card card-int" href="#/jobs/${j.id}" style="padding:13px;display:flex;gap:12px;align-items:flex-start">
          ${(x.photosAfter || [])[0]
            ? `<img src="${attr(x.photosAfter[0])}" style="width:52px;height:52px;border-radius:9px;object-fit:cover;flex-shrink:0">`
            : `<div class="tile-ico lg i-gray">${ico('image')}</div>`}
          <div class="grow" style="min-width:0">
            <div class="row between g-8">
              <span class="truncate fw-7 t-base">${esc(S.clientName(j.clientId))}</span>
              <span class="t-sm muted nowrap">${esc(S.fmtShort(j.date))}</span>
            </div>
            <div class="truncate t-sm muted">${esc(S.jobTitle(j))}</div>
            <div class="row g-6 wrap mt-8">
              <span class="badge b-gray">${ico('timer')}${esc(S.durationText(x.durationMins))}</span>
              ${x.rating ? `<span class="badge b-amber">${ico('star')}${x.rating}</span>` : ''}
              ${(x.photosBefore || []).length + (x.photosAfter || []).length
                ? `<span class="badge b-blue">${ico('camera')}${(x.photosBefore || []).length + (x.photosAfter || []).length}</span>` : ''}
            </div>
          </div>
        </a>`;
      }).join('')}</div>`
      : U.empty({ icon: 'clipcheck', title: 'No completed services yet', text: 'Finished services and their reports show up here.' })}`;
    }
  };

  /* ================================================================= Stock */
  V['my-stock'] = {
    title: 'My Stock',
    narrow: true,
    render(ctx) {
      const db = S.get();
      const issued = db.stockMoves.filter(m => m.type === 'Issued' && m.ref === ctx.me.id);
      const consumed = db.stockMoves.filter(m => m.type === 'Consumed' && m.by === ctx.me.id);
      const myJobsList = myJobs(ctx).filter(j => j.exec && (j.exec.chemicals || []).length);

      const bal = {};
      issued.forEach(m => { bal[m.itemId] = (bal[m.itemId] || 0) + Math.abs(m.qty); });
      consumed.forEach(m => { bal[m.itemId] = (bal[m.itemId] || 0) - Math.abs(m.qty); });

      const chems = db.inventory.filter(i => i.cat === 'Chemical');

      return C.pageHead({ title: 'My Stock', sub: 'What you are carrying and what you have used' }) +

      `${C.sectionCard('Issued to me',
        Object.keys(bal).length ? `<div class="col g-10">${Object.keys(bal).map(id => {
          const it = S.item(id) || {};
          return `<div class="row g-11 card" style="padding:11px 12px">
            <div class="tile-ico i-brand">${ico(it.cat === 'Chemical' ? 'flask' : 'box')}</div>
            <div class="grow" style="min-width:0">
              <div class="truncate fw-6 t-base">${esc(it.name)}</div>
              <div class="t-sm muted">${esc(it.ai || it.pack || '')}</div>
            </div>
            <div style="text-align:right">
              <div class="fw-7">${Math.max(0, Math.round(bal[id]))} ${esc(it.unit || '')}</div>
              <div class="t-xs muted">on hand</div>
            </div>
          </div>`;
        }).join('')}</div>`
        : `<div class="t-sm muted">Nothing issued to you yet. The office issues chemicals from Inventory.</div>`)}

      <div class="mt-16">${C.sectionCard('Used on services',
        myJobsList.length ? `<div class="tablewrap"><table class="tbl" style="min-width:0">
          <thead><tr><th>Ref</th><th>Product</th><th class="r">Qty</th></tr></thead>
          <tbody>${myJobsList.slice(0, 15).map(j => j.exec.chemicals.map((c, i) => {
            const it = S.item(c.id) || {};
            return `<tr class="clickable" data-go="#/jobs/${j.id}">
              ${i === 0 ? `<td rowspan="${j.exec.chemicals.length}">
                <div class="fw-6 t-base">${esc(S.clientName(j.clientId))}</div>
                <div class="t-sm muted">${esc(S.fmtShort(j.date))} · ${esc(j.id)}</div></td>` : ''}
              <td class="t-base">${esc(it.name || c.id)}</td>
              <td class="r fw-6">${c.qty} ${esc(it.unit || '')}</td>
            </tr>`;
          }).join('')).join('')}</tbody>
        </table></div>`
        : `<div class="t-sm muted">No chemical usage recorded yet.</div>`, '', { flush: true })}</div>

      <div class="mt-16">${C.sectionCard('Warehouse levels',
        `<div class="col g-10">${chems.slice(0, 6).map(i => `
          <div>
            <div class="row between mb-4">
              <span class="t-base fw-6 truncate">${esc(i.name)}</span>
              <span class="t-sm ${i.stock < i.min ? 'danger fw-6' : 'muted'}">${i.stock} ${esc(i.unit)}</span>
            </div>
            ${U.bar(Math.min(100, i.stock / Math.max(1, i.min * 2) * 100), i.stock < i.min ? 'red' : '')}
          </div>`).join('')}</div>`,
        '', { footer: 'Ask the office to issue stock before you run out.' })}</div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) location.hash = go.getAttribute('data-go');
      });
    }
  };
})(window);
