/* ==========================================================================
   View: Schedule — month calendar + day dispatch board
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let view = 'month';
  let cursor = null;      // first of the displayed month
  let selDate = null;     // selected day (ISO)

  function init() {
    if (!cursor) {
      const t = S.parse(S.todayISO());
      cursor = new Date(t.getFullYear(), t.getMonth(), 1);
    }
    if (!selDate) selDate = S.todayISO();
  }

  const TONE = {
    completed:  { bg: '#ECFDF3', fg: '#027A48', br: '#12B76A' },
    inprogress: { bg: '#FFFAEB', fg: '#B54708', br: '#F79009' },
    enroute:    { bg: '#F5F3FF', fg: '#5B21B6', br: '#7C3AED' },
    scheduled:  { bg: '#EFF6FF', fg: '#175CD3', br: '#2E90FA' },
    cancelled:  { bg: '#F1F5F9', fg: '#64748B', br: '#94A3B8' }
  };

  /* ---------------------------------------------------------------- month */
  function monthGrid() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      const dsi = Seed.iso(dt);
      const jobs = S.jobsOn(dsi);
      cells.push({ d: dt, iso: dsi, out: dt.getMonth() !== m, today: dsi === S.todayISO(), jobs: jobs });
    }
    // Trim the trailing all-out week
    const weeks = cells.length / 7;
    const keep = [];
    for (let wI = 0; wI < weeks; wI++) {
      const row = cells.slice(wI * 7, wI * 7 + 7);
      if (wI >= 4 && row.every(c => c.out)) break;
      keep.push.apply(keep, row);
    }

    return `<div class="cal">
      ${S.DOW.map(x => `<div class="cal-dow">${esc(x)}</div>`).join('')}
      ${keep.map(c => `<div class="cal-cell ${c.out ? 'out' : ''} ${c.today ? 'today' : ''}" data-day="${attr(c.iso)}">
        <div class="row between">
          <span class="cal-num">${c.d.getDate()}</span>
          ${c.jobs.length > 2 ? `<span class="t-xs muted fw-6">${c.jobs.length}</span>` : ''}
        </div>
        ${c.jobs.slice(0, 3).map(j => {
          const t = TONE[j.status] || TONE.scheduled;
          return `<div class="cal-ev" style="background:${t.bg};color:${t.fg};border-color:${t.br}" data-job="${attr(j.id)}"
            title="${attr(S.fmtTime(j.slot) + ' — ' + S.clientName(j.clientId))}">
            ${esc(S.fmtTime(j.slot).replace(':00', ''))} ${esc(S.clientName(j.clientId))}</div>`;
        }).join('')}
        ${c.jobs.length > 3 ? `<div class="cal-more">+${c.jobs.length - 3} more</div>` : ''}
      </div>`).join('')}
    </div>`;
  }

  /* ------------------------------------------------------------------ day */
  function dayStrip() {
    const base = S.parse(selDate);
    const out = [];
    for (let i = -3; i <= 10; i++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const dsi = Seed.iso(dt);
      const n = S.jobsOn(dsi).length;
      out.push(`<button class="daybox ${dsi === selDate ? 'on' : ''}" data-day="${attr(dsi)}">
        <div class="dw">${esc(S.DOW[dt.getDay()])}</div>
        <div class="dn">${dt.getDate()}</div>
        ${n ? '<div class="dd"></div>' : '<div style="height:9px"></div>'}
      </button>`);
    }
    return `<div class="daystrip">${out.join('')}</div>`;
  }

  function dayBoard() {
    const techs = S.get().users.filter(u => u.role === 'tech');
    const all = S.jobsOn(selDate);
    const unassigned = all.filter(j => !(j.techIds || []).length);

    return `<div class="kanban mt-16">
      ${techs.map(t => {
        const js = all.filter(j => (j.techIds || []).indexOf(t.id) >= 0);
        const done = js.filter(j => j.status === 'completed').length;
        const mins = js.reduce((s, j) => s + (j.mins || 60), 0);
        return `<div class="kancol">
          <div class="kancol-hd">
            ${U.avatar(t, 'av-xs')}
            <span class="knm grow truncate">${esc(t.name)}</span>
            <span class="kct">${done}/${js.length}</span>
          </div>
          <div class="kancol-bd">
            ${js.length ? js.map(j => {
              const tone = TONE[j.status] || TONE.scheduled;
              return `<div class="kancard" data-job="${attr(j.id)}" style="border-left:3px solid ${tone.br}">
                <div class="row between g-6 mb-4">
                  <span class="t-sm fw-7">${esc(S.fmtTime(j.slot))}</span>
                  ${C.jobStatus(j)}
                </div>
                <div class="truncate fw-6" style="font-size:12.5px">${esc(S.clientName(j.clientId))}</div>
                <div class="truncate t-sm muted">${esc(S.jobTitle(j))}</div>
                <div class="row g-6 mt-6">
                  <span class="t-xs muted row g-4">${ico('timer', '', 11)}${esc(S.durationText(j.mins))}</span>
                  ${j.priority === 'high' ? `<span class="badge b-red" style="height:17px;font-size:9.5px">Priority</span>` : ''}
                </div>
              </div>`;
            }).join('') : `<div class="t-sm muted center-txt" style="padding:18px 0">Free all day</div>`}
          </div>
          <div class="kancol-ft row between">
            <span class="t-xs muted fw-6">WORKLOAD</span>
            <span class="t-sm fw-7 ${mins > 420 ? 'danger' : mins > 300 ? 'warn' : 'brand'}">${esc(S.durationText(mins))}</span>
          </div>
        </div>`;
      }).join('')}

      <div class="kancol" style="border-style:dashed;border-color:${unassigned.length ? 'var(--warn-500)' : 'var(--line-2)'}">
        <div class="kancol-hd">
          <i class="kdot" style="background:${unassigned.length ? 'var(--warn-500)' : 'var(--muted-2)'}"></i>
          <span class="knm grow">Unassigned</span><span class="kct">${unassigned.length}</span>
        </div>
        <div class="kancol-bd">
          ${unassigned.length ? unassigned.map(j => `<div class="kancard" data-job="${attr(j.id)}">
            <div class="row between g-6 mb-4"><span class="t-sm fw-7 warn">${esc(S.fmtTime(j.slot))}</span>${C.jobType(j)}</div>
            <div class="truncate fw-6" style="font-size:12.5px">${esc(S.clientName(j.clientId))}</div>
            <div class="truncate t-sm muted">${esc(S.jobTitle(j))}</div>
          </div>`).join('') : `<div class="t-sm muted center-txt" style="padding:18px 0">Everything assigned</div>`}
        </div>
      </div>
    </div>`;
  }

  /* ----------------------------------------------------------------- view */
  V.schedule = {
    title: 'Schedule',
    render(ctx) {
      init();
      const monthJobs = S.get().jobs.filter(j => j.date.slice(0, 7) === cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0'));
      const daySel = S.jobsOn(selDate);

      return C.pageHead({
        title: 'Schedule',
        sub: view === 'month'
          ? S.MONL[cursor.getMonth()] + ' ' + cursor.getFullYear() + ' · ' + monthJobs.length + ' visits planned'
          : S.fmtLong(selDate) + ' · ' + daySel.length + ' jobs',
        actions: `<div class="seg">
            <button data-view="month" class="${view === 'month' ? 'on' : ''}">Month</button>
            <button data-view="day" class="${view === 'day' ? 'on' : ''}">Day list</button>
          </div>
          <button class="btn btn-soft btn-sm" data-board>${ico('users')} Assign work</button>
          <button class="btn btn-primary btn-sm" data-new>${ico('plus')} Schedule service</button>`
      }) +

      (view === 'month' ? `
        <div class="card mb-16">
          <div class="card-hd">
            <button class="iconbtn" data-nav="-1">${ico('cleft')}</button>
            <h3 class="grow center-txt" style="text-align:center">${esc(S.MONL[cursor.getMonth()])} ${cursor.getFullYear()}</h3>
            <button class="iconbtn" data-nav="1">${ico('cright')}</button>
            <button class="btn btn-ghost btn-sm" data-nav="0">Today</button>
          </div>
          <div class="card-bd">${monthGrid()}</div>
          <div class="card-ft row g-16 wrap">
            ${['scheduled', 'enroute', 'inprogress', 'completed'].map(k =>
              `<span class="legend-item"><i class="sw" style="background:${TONE[k].br}"></i>${esc(S.JOB_STATUS[k].label)}</span>`).join('')}
          </div>
        </div>

        ${C.sectionCard(S.fmtLong(selDate),
          daySel.length ? `<div style="margin:-11px 0">${daySel.map(j => C.jobRow(j)).join('')}</div>`
            : U.empty({ icon: 'calendar', title: 'Nothing scheduled', text: 'Pick another day in the calendar above.' }),
          `<span class="badge b-brand">${daySel.length} services</span>`)}
      ` : `
        ${dayStrip()}
        <div class="row between wrap g-10 mt-8">
          <div class="row g-8">
            <button class="btn btn-ghost btn-sm" data-nav="-1">${ico('cleft')} Prev</button>
            <button class="btn btn-ghost btn-sm" data-nav="0">Today</button>
            <button class="btn btn-ghost btn-sm" data-nav="1">Next ${ico('cright')}</button>
          </div>
          <div class="row g-8">
            <span class="badge b-green badge-lg">${daySel.filter(j => j.status === 'completed').length} completed</span>
            <span class="badge b-blue badge-lg">${daySel.filter(j => j.status !== 'completed').length} open</span>
          </div>
        </div>
        ${dayBoard()}
      `);
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        if (e.target.closest('[data-board]')) {
          // The board opens on whichever day is being looked at.
          if (V.board) V.board.goto(selDate);
          return;
        }
        const vb = e.target.closest('[data-view]');
        if (vb) { view = vb.getAttribute('data-view'); ctx.refresh(); return; }

        const nb = e.target.closest('[data-nav]');
        if (nb) {
          const n = parseInt(nb.getAttribute('data-nav'), 10);
          if (view === 'month') {
            if (n === 0) { const t = S.parse(S.todayISO()); cursor = new Date(t.getFullYear(), t.getMonth(), 1); selDate = S.todayISO(); }
            else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
          } else {
            if (n === 0) selDate = S.todayISO();
            else { const dt = S.parse(selDate); dt.setDate(dt.getDate() + n); selDate = Seed.iso(dt); }
          }
          ctx.refresh(); return;
        }

        const job = e.target.closest('[data-job]');
        if (job) { location.hash = '#/jobs/' + job.getAttribute('data-job'); return; }

        const day = e.target.closest('[data-day]');
        if (day) { selDate = day.getAttribute('data-day'); ctx.refresh(); return; }

        if (e.target.closest('[data-new]') && V.jobs && V.jobs.newJob) V.jobs.newJob();
      });
    }
  };
})(window);
