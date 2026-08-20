/* ==========================================================================
   The dispatch board — technicians down the side, the day across the top,
   work as bars you pick up and drop.

   The whole geometry is one idea: the day is a span of minutes, and every bar
   is a fraction of it. In "fit" the fraction becomes a percentage so the whole
   day lands inside the viewport with nothing hidden off to the right; at a
   fixed zoom it becomes pixels and the grid scrolls sideways. Both modes read
   their scale back off the lane at drag time, so the pointer maths is shared.

   Dragging is built on pointer events rather than the browser's drag-and-drop,
   because that API does not exist on a phone — this way a finger, a mouse and
   a stylus all run the same code.
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  const RAIL = 190;
  const ZOOMS = { s: 1.2, m: 2.2, l: 3.6, xl: 6 };   // pixels per minute

  let date = null;
  let branchFilter = '';
  let zoom = 'fit';                       // 'fit', or a key of ZOOMS
  let dense = false;
  let collapsed = {};                     // branch id -> hidden
  let filter = { status: '', prio: false };
  let sel = null;                         // the selected job, for the keyboard
  let undoStack = [];                     // [{ label, entries: [{jobId, before}] }]

  /**
   * The window the board draws. Normally the working day, but it stretches to
   * hold anything actually booked outside it — a 22:00 warehouse job has to be
   * visible, not painted past the edge of the canvas.
   */
  let span = null;
  function bounds() {
    if (span) return span;
    let lo = S.DAY_FROM, hi = S.DAY_TO;
    dayJobs().forEach(function (j) {
      const a = S.toMin(j.slot);
      lo = Math.min(lo, a);
      hi = Math.max(hi, Math.min(24 * 60, a + (j.mins || 60)));   // clipped at midnight
    });
    span = { from: Math.floor(lo / 60) * 60, to: Math.ceil(hi / 60) * 60 };
    return span;
  }
  const dayFrom = () => bounds().from;
  const dayTo = () => bounds().to;
  const dayMins = () => Math.max(60, dayTo() - dayFrom());

  const fitting = () => zoom === 'fit';
  const pxMin = () => ZOOMS[zoom] || ZOOMS.m;

  /** Midnight is the end of this day, not a minute short of it. */
  const clockAt = m => (m >= 24 * 60 ? '12:00 AM' : S.fmtTime(S.toHHMM(m)));

  /** An offset from the start of the day, in whichever unit this mode uses. */
  function at(m) {
    const off = m - dayFrom();
    return fitting() ? (off / dayMins() * 100) + '%' : (off * pxMin()) + 'px';
  }
  /** A length of time, in whichever unit this mode uses. */
  function len(m) {
    return fitting() ? (m / dayMins() * 100) + '%' : (m * pxMin()) + 'px';
  }
  const laneW = () => (fitting() ? 'flex:1;min-width:0' : 'width:' + (dayMins() * pxMin()) + 'px;flex:none');
  const boardW = () => (fitting() ? 'width:100%' : 'width:' + (RAIL + dayMins() * pxMin()) + 'px');
  /** Where the now-line falls, measured from the left edge of the whole row. */
  function nowLeft(m) {
    const f = (m - dayFrom()) / dayMins();
    return fitting()
      ? 'calc(' + RAIL + 'px + (100% - ' + RAIL + 'px) * ' + f.toFixed(5) + ')'
      : (RAIL + (m - dayFrom()) * pxMin()) + 'px';
  }

  function init() {
    if (!date) date = S.todayISO();
    span = null;
  }

  /* ------------------------------------------------------------- the data */

  function techs() {
    let list = S.get().users.filter(u => u.role === 'tech');
    if (branchFilter) list = list.filter(u => (u.branches || []).indexOf(branchFilter) >= 0);
    return list;
  }

  /** Technicians grouped under the branch they belong to. */
  function groups() {
    const out = [], seen = {};
    (S.get().branches || []).forEach(function (b) {
      const people = techs().filter(u => (u.branches || []).indexOf(b.id) >= 0 && !seen[u.id]);
      people.forEach(u => { seen[u.id] = 1; });
      if (people.length) out.push({ branch: b, people: people });
    });
    const rest = techs().filter(u => !seen[u.id]);
    if (rest.length) out.push({ branch: { id: '_none', name: 'No branch' }, people: rest });
    return out;
  }

  const dayJobs = () => S.get().jobs.filter(j => j.date === date && j.status !== 'cancelled');
  const forTech = id => dayJobs().filter(j => (j.techIds || []).indexOf(id) >= 0);

  /** The filter chips only fade bars; they never change what is really there. */
  function passes(j) {
    if (filter.prio && j.priority !== 'high' && j.priority !== 'urgent') return false;
    if (filter.status === 'open' && j.status === 'completed') return false;
    if (filter.status === 'live' && j.status !== 'inprogress' && j.status !== 'enroute') return false;
    return true;
  }

  /** Minutes booked against minutes available, for the row's load bar. */
  function load(u) {
    const booked = forTech(u.id).reduce((a, j) => a + (j.mins || 60), 0);
    const h = S.workHours(u);
    const off = h.days.indexOf(S.parse(date).getDay()) < 0;
    const avail = Math.max(60, S.toMin(h.to) - S.toMin(h.from));
    return {
      booked: booked, avail: avail, off: off,
      pct: Math.round(booked / avail * 100),
      over: booked > avail
    };
  }

  /* ------------------------------------------------------------ the pieces */

  const TONE = {
    completed: 'done', inprogress: 'live', enroute: 'live',
    scheduled: 'plan', cancelled: 'off'
  };

  const barLabel = j => { const cl = S.client(j.clientId); return cl ? cl.name : 'Service'; };

  /** One job as a bar on one technician's lane. */
  function bar(j) {
    const start = S.toMin(j.slot);
    const mins = j.mins || 60;
    const stop = Math.min(dayTo(), start + mins);
    const clipped = start + mins > dayTo();
    const crew = (j.techIds || []).length;
    const tone = TONE[j.status] || 'plan';
    const locked = j.status === 'completed' || j.status === 'inprogress';

    return `<div class="dbar t-${tone}${locked ? ' locked' : ''}${j.pinned ? ' pinned' : ''}${
        sel === j.id ? ' sel' : ''}${passes(j) ? '' : ' dim'}"
      data-job="${attr(j.id)}"
      style="left:${at(start)};width:${len(Math.max(20, stop - start))}"
      title="${attr(j.id + ' · ' + barLabel(j) + ' · ' + S.fmtTime(j.slot) + ' – ' +
        S.fmtTime(S.toHHMM(start + mins)) + ' · ' + S.durationText(mins))}">
      <span class="hd">
        <span class="nm">${esc(barLabel(j))}</span>
        ${j.priority === 'high' || j.priority === 'urgent' ? ico('alert', '', 11) : ''}
        ${j.pinned ? ico('lock', '', 11) : ''}
      </span>
      <span class="mt">${esc(S.fmtTime(j.slot))} · ${esc(S.durationText(mins))}${
        crew > 1 ? ' · crew ' + crew : ''}${clipped ? ' · past midnight' : ''}</span>
      ${locked ? '' : '<span class="grip" data-resize></span>'}
    </div>`;
  }

  /** A card in the queue on the left. */
  function queueCard(j) {
    const cl = S.client(j.clientId);
    const br = S.jobBranch(j);
    const crew = S.jobCrewSize(j);
    return `<div class="qcard p-${attr(j.priority || 'normal')}" data-queue="${attr(j.id)}">
      <div class="row between g-8">
        <span class="mono t-xs fw-7">${esc(j.id)}</span>
        <span class="t-xs muted">${esc(S.durationText(j.mins || 60))}${crew > 1 ? ' · ' + crew + 'p' : ''}</span>
      </div>
      <div class="fw-6 t-base truncate mt-2">${esc(cl ? cl.name : '—')}</div>
      <div class="t-xs muted truncate">${esc((j.serviceIds || []).map(S.svcName).join(', '))}</div>
      <div class="row between g-6 mt-6">
        <span class="t-xs muted truncate">${ico('pin', '', 10)} ${esc(br ? br.name : (cl && cl.city) || '')}</span>
        <button class="btn btn-ghost btn-xs" data-suggest="${attr(j.id)}">Who?</button>
      </div>
    </div>`;
  }

  /** Seven days around the one being looked at, with what is on each. */
  function weekStrip() {
    const out = [];
    for (let i = -3; i <= 3; i++) {
      const d = Seed.addDays(date, i);
      const js = S.get().jobs.filter(x => x.date === d && x.status !== 'cancelled');
      const waiting = js.filter(x => !(x.techIds || []).length).length;
      out.push(`<button class="dday${d === date ? ' on' : ''}${d === S.todayISO() ? ' today' : ''}" data-day="${attr(d)}">
        <span class="dw">${esc(S.DOW[S.parse(d).getDay()])}</span>
        <span class="dn">${S.parse(d).getDate()}</span>
        <span class="dc">${js.length ? js.length + ' job' + (js.length === 1 ? '' : 's') : '—'}</span>
        ${waiting ? `<i class="dwait" title="${attr(waiting + ' unassigned')}"></i>` : ''}
      </button>`);
    }
    return out.join('');
  }

  /**
   * The same day written out as a run sheet. It is what a technician actually
   * wants on a phone, it prints, and it says out loud the thing the bars only
   * imply -- how long the hop between two jobs is.
   */
  function runSheet(gs) {
    const rows = [];
    gs.forEach(g => g.people.forEach(function (u) {
      const day = forTech(u.id).slice().sort((a, b) => S.toMin(a.slot) - S.toMin(b.slot));
      const l = load(u);
      rows.push(`<div class="rsheet">
        <div class="rhd">
          ${U.avatar(u, 'av-sm')}
          <div style="min-width:0;flex:1">
            <div class="fw-6 t-base truncate">${esc(u.name)}</div>
            <div class="t-xs muted">${l.off ? 'Day off' : day.length + ' stop' + (day.length === 1 ? '' : 's') +
              ' · ' + S.durationText(l.booked) + ' of ' + S.durationText(l.avail)}</div>
          </div>
          ${l.over ? `<span class="badge b-amber">${ico('alert')}Over hours</span>` : ''}
        </div>
        ${day.length ? `<ol class="rlist">${day.map(function (j, i) {
          const cl = S.client(j.clientId);
          const prev = day[i - 1];
          const hop = prev ? S.toMin(j.slot) - (S.toMin(prev.slot) + (prev.mins || 60)) : null;
          // A short hop is travel; a long one is just an empty afternoon.
          const hopText = hop == null ? '' :
            hop < 0 ? 'overlaps the last job by ' + S.durationText(-hop) :
            hop === 0 ? 'straight on to the next' :
            hop > 150 ? S.durationText(hop) + ' free' :
            S.durationText(hop) + ' to get there';
          return (hop != null ? `<li class="rhop${hop < 15 ? ' tight' : ''}">${esc(hopText)}</li>` : '') +
          `<li class="rstop" data-go="#/jobs/${attr(j.id)}">
            <span class="rt">${esc(S.fmtTime(j.slot))}</span>
            <span class="rb">
              <span class="fw-6 t-sm truncate">${esc(cl ? cl.name : '—')}</span>
              <span class="t-xs muted truncate">${esc((j.serviceIds || []).map(S.svcName).join(', '))}${
                cl && cl.addr ? ' · ' + esc(cl.addr) : ''}</span>
            </span>
            <span class="t-xs muted">${esc(S.durationText(j.mins || 60))}</span>
          </li>`;
        }).join('')}</ol>` : `<div class="t-xs muted" style="padding:10px 12px">Nothing booked.</div>`}
      </div>`);
    }));
    if (!rows.length) return '';
    return `<div class="rsheets mt-18">
      <div class="row between g-10 mb-10">
        <span class="fw-7 t-base">Run sheets</span>
        <span class="t-xs muted noprint">The same day written out — this is what prints</span>
      </div>
      <div class="rgrid">${rows.join('')}</div>
    </div>`;
  }

  /* -------------------------------------------------------------- the view */

  V.board = {
    title: 'Service assignment',
    crumb: 'Schedule',

    render(ctx) {
      init();
      const gs = groups();
      const queue = S.unassignedOn(date);
      const all = dayJobs();
      const assigned = all.filter(j => (j.techIds || []).length).length;
      const people = techs();
      const busy = people.filter(u => forTech(u.id).length).length;

      // The team's day in one number, so an overloaded board reads at a glance.
      let bookedAll = 0, availAll = 0, overAny = 0;
      people.forEach(function (u) {
        const l = load(u);
        bookedAll += l.booked;
        if (!l.off) availAll += l.avail;
        if (l.over) overAny++;
      });
      const util = availAll ? Math.round(bookedAll / availAll * 100) : 0;

      // A long day at a small scale needs fewer labels or they collide.
      const step = (fitting() && dayMins() > 12 * 60) || pxMin() < 1.5 ? 120 : 60;
      const hours = [];
      for (let m = dayFrom(); m <= dayTo(); m += step) hours.push(m);

      const now = new Date();
      const isToday = date === S.todayISO();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const showNow = isToday && nowMin >= dayFrom() && nowMin <= dayTo();

      return C.pageHead({
        title: 'Service assignment',
        sub: S.fmtLong(date) + ' · drag work onto whoever is free',
        actions: `<div class="row g-8 wrap">
          <button class="btn btn-primary btn-sm" data-auto${queue.length ? '' : ' disabled'}>
            ${ico('sparkle')} Auto-assign${queue.length ? ' ' + queue.length : ''}</button>
          <button class="btn btn-soft btn-sm" data-balance>${ico('shuffle')} Balance</button>
          <select class="select" id="bdBranch" style="height:34px;font-size:13px;width:auto;min-width:148px">
            <option value="">All branches</option>
            ${(S.get().branches || []).map(b => `<option value="${attr(b.id)}"${b.id === branchFilter ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
          <div class="seg">
            <button data-zoom="fit" class="${zoom === 'fit' ? 'on' : ''}" title="Fit the whole day on screen">Fit</button>
            <button data-zoom="s" class="${zoom === 's' ? 'on' : ''}">S</button>
            <button data-zoom="m" class="${zoom === 'm' ? 'on' : ''}">M</button>
            <button data-zoom="l" class="${zoom === 'l' ? 'on' : ''}">L</button>
            <button data-zoom="xl" class="${zoom === 'xl' ? 'on' : ''}">XL</button>
          </div>
          <button class="iconbtn" data-dense title="${dense ? 'Comfortable rows' : 'Compact rows'}">${ico('menu')}</button>
          <button class="iconbtn" data-print title="Print this day">${ico('download')}</button>
        </div>`
      }) +

      `<div class="dweek noprint">${weekStrip()}</div>

      <div class="row between wrap g-10 mb-12">
        <div class="row g-8 wrap">
          <button class="btn btn-ghost btn-sm" data-nav="-1">${ico('cleft')} Prev</button>
          <button class="btn btn-ghost btn-sm" data-nav="0">Today</button>
          <button class="btn btn-ghost btn-sm" data-nav="1">Next ${ico('cright')}</button>
          <input class="input" type="date" id="bdDate" value="${attr(date)}" style="height:32px;width:158px;font-size:13px">
          <span class="dchips">
            <button class="chip${!filter.status && !filter.prio ? ' on' : ''}" data-filter="">All</button>
            <button class="chip${filter.status === 'open' ? ' on' : ''}" data-filter="open">Not done</button>
            <button class="chip${filter.status === 'live' ? ' on' : ''}" data-filter="live">On the way</button>
            <button class="chip${filter.prio ? ' on' : ''}" data-prio>${ico('alert', '', 11)} Priority</button>
          </span>
        </div>
        <div class="row g-14 wrap t-sm muted">
          <span><strong class="ink">${all.length}</strong> services</span>
          <span><strong style="color:var(--brand-600)">${assigned}</strong> assigned</span>
          <span><strong style="color:var(--warn-700)">${queue.length}</strong> waiting</span>
          <span><strong class="ink">${busy}</strong>/${people.length} busy</span>
          <span class="dutil${util > 100 ? ' bad' : util > 85 ? ' warn' : ''}"><strong>${util}%</strong> of the day used${
            overAny ? ' · ' + overAny + ' over hours' : ''}</span>
        </div>
      </div>

      <div class="dboard${dense ? ' dense' : ''}${fitting() ? ' fit' : ''}">
        <aside class="dqueue" id="bdQueueWrap">
          <div class="hd">
            <span class="fw-7 t-base">Unassigned</span>
            <span class="badge ${queue.length ? 'b-amber' : 'b-green'}">${queue.length}</span>
          </div>
          <input class="input" id="bdQ" placeholder="Search customer, id, area…" style="height:32px;font-size:12.5px;margin:0 10px 10px">
          <div class="bd" id="bdQueue">
            ${queue.length ? queue.map(queueCard).join('')
              : `<div class="t-sm muted center-txt" style="padding:22px 10px">
                   ${ico('calcheck', 'muted', 22)}<div class="mt-6">Everything on this day has somebody on it.</div></div>`}
          </div>
          <div class="dropnote">Drop a bar here to take everybody off it</div>
        </aside>

        <div class="dgrid" id="bdGrid">
          <div class="dhead" style="${boardW()}">
            <div class="rail">Technician</div>
            <div class="times" style="${laneW()}">
              ${hours.map(m => `<span class="h${m === dayFrom() ? ' first' : ''}${
                m === dayTo() ? ' last' : ''}" style="left:${at(m)}">${esc(clockAt(m))}</span>`).join('')}
            </div>
          </div>

          <div class="dbody" style="${boardW()}">
            ${showNow ? `<div class="nowline" style="left:${nowLeft(nowMin)}"></div>` : ''}
            ${gs.map(g => {
              const shut = !!collapsed[g.branch.id];
              const jobsHere = g.people.reduce((a, u) => a + forTech(u.id).length, 0);
              return `<div class="bgrp${shut ? ' shut' : ''}" data-grp="${attr(g.branch.id)}">
                ${ico('cright', 'chev', 13)}<span class="dot"></span>${esc(g.branch.name)}
                <span class="muted fw-5">· ${g.people.length} technician${g.people.length === 1 ? '' : 's'} · ${jobsHere} job${jobsHere === 1 ? '' : 's'}</span>
              </div>` +
              (shut ? '' : g.people.map(u => {
                const l = load(u);
                const h = S.workHours(u);
                const gaps = l.off ? [] : S.freeGaps(u.id, date);
                return `<div class="drow${l.off ? ' off' : ''}${l.over ? ' over' : ''}" data-tech="${attr(u.id)}">
                  <div class="rail">
                    ${U.avatar(u, 'av-sm')}
                    <div style="min-width:0;flex:1">
                      <div class="fw-6 t-sm truncate">${esc(u.name)}</div>
                      <div class="t-xs ${l.over ? 'warn fw-6' : 'muted'}">${
                        l.off ? 'Day off' : S.durationText(l.booked) + ' of ' + S.durationText(l.avail)}</div>
                      ${l.off ? '' : `<div class="lbar${l.over ? ' over' : ''}"><i style="width:${Math.min(100, l.pct)}%"></i></div>`}
                    </div>
                  </div>
                  <div class="lane" style="${laneW()}">
                    ${l.off ? '' : `<div class="shade" style="left:0;width:${len(Math.max(0, S.toMin(h.from) - dayFrom()))}"></div>
                       <div class="shade" style="left:${at(S.toMin(h.to))};width:${len(Math.max(0, dayTo() - S.toMin(h.to)))}"></div>`}
                    ${gaps.filter(gp => gp.to - gp.from >= 45).map(gp =>
                      `<div class="gap" style="left:${at(gp.from)};width:${len(gp.to - gp.from)}"
                        title="${attr('Free ' + S.fmtTime(S.toHHMM(gp.from)) + ' – ' + S.fmtTime(S.toHHMM(gp.to)))}"><span>${
                        esc(S.durationText(gp.to - gp.from))} free</span></div>`).join('')}
                    ${hours.filter(m => m > dayFrom() && m < dayTo()).map(m =>
                      `<i class="tick" style="left:${at(m)}"></i>`).join('')}
                    ${forTech(u.id).map(bar).join('')}
                  </div>
                </div>`;
              }).join(''));
            }).join('')}
            ${gs.length ? '' : `<div class="t-sm muted center-txt" style="padding:40px">Nobody matches this branch filter.</div>`}
          </div>
        </div>
      </div>

      ${runSheet(gs)}

      <div class="dlegend row g-16 wrap mt-12 t-xs muted noprint">
        <span class="row g-6"><i class="sw t-plan"></i>Scheduled</span>
        <span class="row g-6"><i class="sw t-live"></i>On the way / in progress</span>
        <span class="row g-6"><i class="sw t-done"></i>Completed</span>
        <span class="row g-6"><i class="sw sw-gap"></i>Free time</span>
        <span class="row g-6">${ico('lock', '', 12)} Placed by hand — the plan will not move it</span>
        <span class="row g-6">Click a bar for its details · drag it sideways to retime · drag its right edge to lengthen</span>
      </div>`;
    },

    /* ---------------------------------------------------------- behaviour */
    mount(root, ctx) {
      const grid = U.qs('#bdGrid', root);
      const queueWrap = U.qs('#bdQueueWrap', root);
      const queueBd = U.qs('#bdQueue', root);

      /* ------------------------------------------------------- undo memory */
      function remember(label, entries) {
        if (!entries || !entries.length) return;
        undoStack.push({ label: label, entries: entries });
        if (undoStack.length > 20) undoStack.shift();
      }
      function undoLast() {
        const step = undoStack.pop();
        if (!step) { U.toast('Nothing left to undo'); return; }
        S.undoBatch(step.entries);
        ctx.refresh();
        U.toast('Undone', { sub: step.label });
      }

      /* ------------------------------------------------------- plain bits */
      root.addEventListener('click', function (e) {
        const nav = e.target.closest('[data-nav]');
        if (nav) {
          const d = Number(nav.getAttribute('data-nav'));
          date = d === 0 ? S.todayISO() : Seed.addDays(date, d);
          sel = null; ctx.refresh(); return;
        }
        const day = e.target.closest('[data-day]');
        if (day) { date = day.getAttribute('data-day'); sel = null; ctx.refresh(); return; }

        const z = e.target.closest('[data-zoom]');
        if (z) { zoom = z.getAttribute('data-zoom'); ctx.refresh(); return; }

        if (e.target.closest('[data-dense]')) { dense = !dense; ctx.refresh(); return; }
        if (e.target.closest('[data-print]')) { w.print(); return; }

        const f = e.target.closest('[data-filter]');
        if (f) {
          filter.status = f.getAttribute('data-filter');
          if (!filter.status) filter.prio = false;
          ctx.refresh(); return;
        }
        if (e.target.closest('[data-prio]')) { filter.prio = !filter.prio; ctx.refresh(); return; }

        const grp = e.target.closest('[data-grp]');
        if (grp) {
          const id = grp.getAttribute('data-grp');
          collapsed[id] = !collapsed[id];
          ctx.refresh(); return;
        }

        const sug = e.target.closest('[data-suggest]');
        if (sug) { e.preventDefault(); suggestFor(sug.getAttribute('data-suggest')); return; }

        if (e.target.closest('[data-auto]')) { runAuto(); return; }
        if (e.target.closest('[data-balance]')) { runBalance(); return; }
      });

      const dEl = U.qs('#bdDate', root);
      if (dEl) dEl.addEventListener('change', function () { date = this.value || date; sel = null; ctx.refresh(); });

      const bEl = U.qs('#bdBranch', root);
      if (bEl) bEl.addEventListener('change', function () { branchFilter = this.value; ctx.refresh(); });

      const qEl = U.qs('#bdQ', root);
      if (qEl) qEl.addEventListener('input', U.debounce(function () {
        const k = this.value.trim().toLowerCase();
        U.qsa('[data-queue]', queueBd).forEach(function (card) {
          card.style.display = !k || card.textContent.toLowerCase().indexOf(k) >= 0 ? '' : 'none';
        });
      }, 150));

      /* ------------------------------------------------------ the helpers */

      function runAuto() {
        if (!S.unassignedOn(date).length) { U.toast('Nothing is waiting on this day'); return; }
        const r = S.autoAssign(date);
        remember('Auto-assigned ' + r.placed.length + ' job' + (r.placed.length === 1 ? '' : 's'), r.placed);
        ctx.refresh();
        U.toast(r.placed.length + ' placed' + (r.skipped.length ? ' · ' + r.skipped.length + ' could not be' : ''), {
          tone: r.skipped.length ? 'warn' : 'ok',
          icon: 'sparkle',
          sub: r.skipped.length
            ? 'Nobody free and qualified for ' + r.skipped.map(x => x.id).slice(0, 3).join(', ')
            : 'Matched on branch, skill, how full the day is, and the gaps in it',
          action: { label: 'Undo', run: undoLast }
        });
      }

      function runBalance() {
        const moved = S.balanceDay(date);
        if (!moved.length) {
          U.toast('Nothing to even out', { sub: 'Nobody is over their hours with somewhere to move work to' });
          return;
        }
        remember('Moved ' + moved.length + ' job' + (moved.length === 1 ? '' : 's'), moved);
        ctx.refresh();
        U.toast(moved.length + ' job' + (moved.length === 1 ? '' : 's') + ' moved', {
          tone: 'ok', icon: 'shuffle',
          sub: 'Taken off the fullest days and given to whoever had room',
          action: { label: 'Undo', run: undoLast }
        });
      }

      /** Who should take this job — ranked, with the reasoning shown. */
      function suggestFor(jobId) {
        const j = S.job(jobId);
        if (!j) return;
        const rows = S.suggestTechs(j, date, 6);
        const cl = S.client(j.clientId);
        U.modal({
          title: 'Who should take ' + j.id + '?',
          sub: (cl ? cl.name + ' · ' : '') + S.durationText(j.mins || 60) +
               ' · ' + (j.serviceIds || []).map(S.svcName).join(', '),
          size: 'md',
          body: `<div class="col g-8">${rows.map(function (r) {
            return `<button type="button" class="sugrow${r.at == null ? ' none' : ''}"
              data-take="${attr(r.user.id)}" data-at="${attr(r.at == null ? '' : r.at)}">
              ${U.avatar(r.user, 'av-sm')}
              <div style="min-width:0;flex:1">
                <div class="row between g-8">
                  <span class="fw-6 t-base truncate">${esc(r.user.name)}</span>
                  <span class="t-xs ${r.at == null ? 'warn fw-6' : 'muted'}">${
                    r.at == null ? 'No room' : 'Free ' + S.fmtTime(S.toHHMM(r.at))}</span>
                </div>
                <div class="row g-6 wrap mt-4">${r.why.map(x =>
                  `<span class="rz ${x.good ? 'good' : 'bad'}">${esc(x.text)}</span>`).join('')}</div>
              </div>
              ${r.at == null ? '' : ico('cright', 'muted-2', 15)}
            </button>`;
          }).join('')}</div>`,
          footer: `<button class="btn btn-ghost" data-close>Close</button>`,
          onMount(mroot, close) {
            mroot.addEventListener('click', function (ev) {
              const row = ev.target.closest('[data-take]');
              if (!row) return;
              const atMin = row.getAttribute('data-at');
              if (atMin === '') { U.toast('No gap long enough on that day', { tone: 'warn' }); return; }
              const id = row.getAttribute('data-take');
              const before = S.placeJob(j.id, [id], date, Number(atMin));
              remember(j.id + ' to ' + S.userName(id), [{ jobId: j.id, before: before }]);
              close(); ctx.refresh();
              U.toast(j.id + ' → ' + S.userName(id), {
                tone: 'ok', icon: 'hardhat',
                sub: S.fmtTime(S.toHHMM(Number(atMin))),
                action: { label: 'Undo', run: undoLast }
              });
            });
          }
        });
      }

      /* ------------------------------------------------------- the popover */
      const closePop = () => { const p = U.qs('#bdPop'); if (p) p.remove(); };

      function popover(el, j) {
        closePop();
        if (!j) return;
        const crew = (j.techIds || []).map(S.userName);
        const cl = S.client(j.clientId);
        const start = S.toMin(j.slot);
        const locked = j.status === 'completed' || j.status === 'inprogress';

        const p = w.document.createElement('div');
        p.id = 'bdPop'; p.className = 'dpop';
        p.innerHTML = `
          <div class="row between g-8">
            <span class="mono t-xs fw-7">${esc(j.id)}</span>
            <button class="iconbtn" data-pclose aria-label="Close">${ico('x', '', 14)}</button>
          </div>
          <div class="fw-7 t-md mt-2 truncate">${esc(cl ? cl.name : '—')}</div>
          <div class="t-sm muted">${esc((j.serviceIds || []).map(S.svcName).join(', '))}</div>
          <div class="t-sm mt-8">${esc(S.fmtTime(j.slot))} – ${
            esc(S.fmtTime(S.toHHMM(start + (j.mins || 60))))} · ${esc(S.durationText(j.mins || 60))}</div>
          <div class="t-sm mt-4">${crew.length ? esc(crew.join(', ')) : 'Nobody on it yet'}</div>
          ${cl && cl.addr ? `<div class="t-xs muted mt-4">${ico('pin', '', 12)} ${esc(cl.addr)}</div>` : ''}
          ${locked ? `<div class="t-xs mt-10 warn">${ico('lock', '', 11)} Already under way — it stays where it is.</div>` : `
          <div class="row g-6 wrap mt-10">
            <button class="btn btn-ghost btn-xs" data-nudge="-15">−15m</button>
            <button class="btn btn-ghost btn-xs" data-nudge="15">+15m</button>
            <button class="btn btn-ghost btn-xs" data-grow="-15">Shorter</button>
            <button class="btn btn-ghost btn-xs" data-grow="15">Longer</button>
          </div>
          <div class="row g-6 wrap mt-6">
            <button class="btn btn-soft btn-xs" data-psuggest>Suggest somebody</button>
            <button class="btn btn-ghost btn-xs"${j.pinned ? '' : ' disabled'} data-punpin>Unpin</button>
            <button class="btn btn-ghost btn-xs" data-pfree>Unassign</button>
          </div>`}
          <a class="btn btn-primary btn-xs mt-10" style="width:100%;justify-content:center" href="#/jobs/${attr(j.id)}">Open the visit</a>`;

        w.document.body.appendChild(p);

        // Prefer below the bar; flip above and pull inside if it would run off.
        const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
        let top = r.bottom + 8;
        if (top + pr.height > w.innerHeight - 10) top = Math.max(10, r.top - pr.height - 8);
        let left = r.left;
        if (left + pr.width > w.innerWidth - 10) left = Math.max(10, w.innerWidth - pr.width - 10);
        p.style.top = top + 'px';
        p.style.left = left + 'px';

        p.addEventListener('click', function (ev) {
          if (ev.target.closest('[data-pclose]')) { closePop(); return; }

          const nudge = ev.target.closest('[data-nudge]');
          if (nudge) {
            const to = S.toMin(j.slot) + Number(nudge.getAttribute('data-nudge'));
            remember(j.id + ' retimed', [{ jobId: j.id, before: S.placeJob(j.id, null, date, Math.max(0, to)) }]);
            closePop(); ctx.refresh(); return;
          }

          const grow = ev.target.closest('[data-grow]');
          if (grow) {
            const live = S.job(j.id);
            const before = { date: live.date, slot: live.slot, techIds: (live.techIds || []).slice(), pinned: !!live.pinned };
            live.mins = Math.max(15, (live.mins || 60) + Number(grow.getAttribute('data-grow')));
            live.pinned = true;
            S.save();
            remember(j.id + ' duration', [{ jobId: j.id, before: before }]);
            closePop(); ctx.refresh(); return;
          }

          if (ev.target.closest('[data-psuggest]')) { closePop(); suggestFor(j.id); return; }

          if (ev.target.closest('[data-punpin]')) {
            const live = S.job(j.id);
            live.pinned = false; S.save();
            closePop(); ctx.refresh();
            U.toast(j.id + ' unpinned', { sub: 'The AMC plan is free to move it again' });
            return;
          }

          if (ev.target.closest('[data-pfree]')) {
            remember(j.id + ' unassigned', [{ jobId: j.id, before: S.unassignJob(j.id) }]);
            closePop(); sel = null; ctx.refresh();
            U.toast(j.id + ' is back in the queue', {
              tone: 'warn', action: { label: 'Undo', run: undoLast }
            });
          }
        });
      }

      function outsideDown(e) {
        const p = U.qs('#bdPop');
        if (p && !p.contains(e.target) && !e.target.closest('[data-job]')) closePop();
      }

      /* ------------------------------------------------------- the drag */
      let drag = null;

      /** Pixels per minute as the lane is actually drawn, whatever the mode. */
      const scaleOf = lane => lane.getBoundingClientRect().width / dayMins();

      function minuteAt(lane, clientX, grabOffset) {
        const r = lane.getBoundingClientRect();
        const raw = (clientX - r.left - (grabOffset || 0)) / scaleOf(lane) + dayFrom();
        const snapped = Math.round(raw / S.SNAP) * S.SNAP;
        return Math.max(dayFrom(), Math.min(dayTo() - 15, snapped));
      }

      function laneUnder(x, y) {
        // Walked explicitly rather than by elementFromPoint, because the ghost
        // sits under the pointer and would answer every time.
        const lanes = U.qsa('.lane', grid);
        for (let i = 0; i < lanes.length; i++) {
          const r = lanes[i].getBoundingClientRect();
          if (y >= r.top && y < r.bottom && x >= r.left && x < r.right) return lanes[i];
        }
        return null;
      }

      const overQueue = (x, y) => {
        if (!queueWrap) return false;
        const r = queueWrap.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };

      function tip(html, x, y, tone) {
        let t = U.qs('#bdTip');
        if (!t) {
          t = w.document.createElement('div');
          t.id = 'bdTip'; t.className = 'dtip';
          w.document.body.appendChild(t);
        }
        t.className = 'dtip ' + (tone || '');
        t.innerHTML = html;
        t.style.left = Math.min(x + 14, w.innerWidth - 300) + 'px';
        t.style.top = (y + 16) + 'px';
        return t;
      }
      const dropTip = () => { const t = U.qs('#bdTip'); if (t) t.remove(); };

      function begin(e, jobId, mode) {
        const j = S.job(jobId);
        if (!j) return;
        if (j.status === 'completed' || j.status === 'inprogress') {
          U.toast('That visit is already under way', { tone: 'warn', sub: 'Completed and in-progress work stays put' });
          return;
        }
        const src = e.target.closest('[data-job],[data-queue]');
        const r = src.getBoundingClientRect();
        drag = {
          job: j, mode: mode, src: src,
          grab: e.clientX - r.left,
          x0: e.clientX, y0: e.clientY, moved: false,
          ghost: null, lane: null, start: null, warns: [], toQueue: false
        };
      }

      /** The gesture only becomes a drag once it travels; a tap stays a tap. */
      function lift() {
        const d = drag;
        const r = d.src.getBoundingClientRect();
        const anyLane = grid ? U.qs('.lane', grid) : null;
        const g = d.src.cloneNode(true);
        g.classList.add('dghost');
        g.classList.remove('sel');
        g.style.width = (d.mode === 'queue' && anyLane
          ? Math.max(90, (d.job.mins || 60) * scaleOf(anyLane))
          : r.width) + 'px';
        g.style.height = r.height + 'px';
        g.style.left = '0px'; g.style.top = '0px';
        w.document.body.appendChild(g);
        d.ghost = g;
        d.src.classList.add('dragging');
        w.document.body.classList.add('ddragging');
        closePop();
      }

      function move(e) {
        if (!drag) return;
        if (!drag.moved) {
          if (Math.abs(e.clientX - drag.x0) < 4 && Math.abs(e.clientY - drag.y0) < 4) return;
          drag.moved = true;
          lift();
        }
        drag.ghost.style.transform =
          'translate(' + (e.clientX - drag.grab) + 'px,' + (e.clientY - 16) + 'px)';

        U.qsa('.lane.over', root).forEach(l => l.classList.remove('over', 'bad'));
        if (queueWrap) queueWrap.classList.remove('dropping');

        // Back to the queue means "take everybody off this job".
        if (drag.mode === 'move' && overQueue(e.clientX, e.clientY)) {
          drag.toQueue = true; drag.lane = null; drag.start = null;
          if (queueWrap) queueWrap.classList.add('dropping');
          tip(`<div class="tm">Unassign ${esc(drag.job.id)}</div>
               <div class="wh">It goes back to the waiting list</div>`, e.clientX, e.clientY, 'warn');
          return;
        }
        drag.toQueue = false;

        const lane = laneUnder(e.clientX, e.clientY);
        drag.lane = lane;
        if (!lane) { drag.start = null; dropTip(); return; }

        const techId = lane.closest('[data-tech]').getAttribute('data-tech');
        const start = minuteAt(lane, e.clientX, drag.mode === 'move' ? drag.grab : 0);
        drag.start = start;
        drag.tech = techId;

        const warns = S.dropCheck(drag.job, techId, date, start);
        drag.warns = warns;
        const blocked = warns.some(x => x.level === 'block');
        lane.classList.add('over');
        if (blocked) lane.classList.add('bad');

        const stop = S.toHHMM(start + (drag.job.mins || 60));
        tip(`<div class="tm">${esc(S.fmtTime(S.toHHMM(start)))} – ${esc(S.fmtTime(stop))}</div>
             <div class="wh">${esc(S.userName(techId))}</div>` +
            warns.map(x => `<div class="wn ${x.level}">${esc(x.text)}</div>`).join(''),
            e.clientX, e.clientY, blocked ? 'bad' : (warns.length ? 'warn' : 'ok'));
      }

      function end() {
        if (!drag) return;
        const d = drag;
        drag = null;
        w.document.body.classList.remove('ddragging');
        if (d.ghost) d.ghost.remove();
        if (d.src) d.src.classList.remove('dragging');
        U.qsa('.lane.over', root).forEach(l => l.classList.remove('over', 'bad'));
        if (queueWrap) queueWrap.classList.remove('dropping');
        dropTip();

        // A tap, not a drag — show what the bar is instead of moving it.
        if (!d.moved) {
          if (d.mode === 'move') { sel = d.job.id; popover(d.src, S.job(d.job.id)); }
          else suggestFor(d.job.id);
          return;
        }

        if (d.toQueue) {
          remember(d.job.id + ' unassigned', [{ jobId: d.job.id, before: S.unassignJob(d.job.id) }]);
          sel = null; ctx.refresh();
          U.toast(d.job.id + ' is back in the queue', {
            tone: 'warn', action: { label: 'Undo', run: undoLast }
          });
          return;
        }

        if (!d.lane || d.start == null) return;          // dropped nowhere

        const j = d.job;
        const crew = Math.max(1, S.jobCrewSize(j));
        let ids = [d.tech];
        // A job that takes a crew keeps the others; the dragged seat changes.
        if (crew > 1) {
          const keep = (j.techIds || []).filter(x => x !== d.tech).slice(0, crew - 1);
          ids = [d.tech].concat(keep);
        }

        remember(j.id + ' to ' + S.userName(d.tech),
          [{ jobId: j.id, before: S.placeJob(j.id, ids, date, d.start) }]);
        sel = j.id;

        const bad = d.warns.filter(x => x.level === 'block');
        U.toast(j.id + ' → ' + S.userName(d.tech), {
          tone: bad.length ? 'warn' : 'ok',
          icon: 'hardhat',
          sub: (bad.length ? bad[0].text + ' · ' : '') + S.fmtTime(S.toHHMM(d.start)),
          action: { label: 'Undo', run: undoLast }
        });
        ctx.refresh();
      }

      /* ------------------------------------------------------- resizing */
      let sizing = null;

      function beginResize(e, barEl) {
        const j = S.job(barEl.getAttribute('data-job'));
        if (!j) return;
        sizing = {
          job: j, el: barEl, x0: e.clientX, mins0: j.mins || 60,
          scale: scaleOf(barEl.closest('.lane'))
        };
        w.document.body.classList.add('ddragging');
        closePop();
      }

      function moveResize(e) {
        if (!sizing) return;
        const delta = (e.clientX - sizing.x0) / sizing.scale;
        const mins = Math.max(15, Math.round((sizing.mins0 + delta) / S.SNAP) * S.SNAP);
        sizing.mins = mins;
        sizing.el.style.width = len(mins);
        const start = S.toMin(sizing.job.slot);
        tip(`<div class="tm">${esc(S.durationText(mins))}</div>
             <div class="wh">${esc(S.fmtTime(sizing.job.slot))} – ${esc(S.fmtTime(S.toHHMM(start + mins)))}</div>`,
            e.clientX, e.clientY, 'ok');
      }

      function endResize() {
        if (!sizing) return;
        const s = sizing; sizing = null;
        w.document.body.classList.remove('ddragging');
        dropTip();
        if (!s.mins || s.mins === s.mins0) { ctx.refresh(); return; }
        const j = S.job(s.job.id);
        const before = { date: j.date, slot: j.slot, techIds: (j.techIds || []).slice(), pinned: !!j.pinned };
        j.mins = s.mins; j.pinned = true;
        S.save();
        remember(j.id + ' duration', [{ jobId: j.id, before: before }]);
        U.toast(j.id + ' now ' + S.durationText(s.mins), {
          sub: 'Duration set by hand', action: { label: 'Undo', run: undoLast }
        });
        ctx.refresh();
      }

      /* --------------------------------------------------- pointer wiring */
      function down(e) {
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('[data-suggest]')) return;     // that is a button, not a handle

        const handle = e.target.closest('[data-resize]');
        if (handle) {
          e.preventDefault();
          try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older engine */ }
          beginResize(e, handle.closest('[data-job]'));
          return;
        }

        const onBoard = e.target.closest('[data-job]');
        const inQueue = e.target.closest('[data-queue]');
        if (!onBoard && !inQueue) return;
        e.preventDefault();
        const el = onBoard || inQueue;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* older engine */ }
        begin(e, el.getAttribute(onBoard ? 'data-job' : 'data-queue'), onBoard ? 'move' : 'queue');
      }

      root.addEventListener('pointerdown', down);

      // Document level and in capture, so events still arrive after an element
      // has taken the pointer. The board re-mounts on every refresh, so the
      // previous set has to come off or they pile up one per visit.
      const onMove = e => { if (sizing) moveResize(e); else if (drag) move(e); };
      const onUp = () => { if (sizing) endResize(); else if (drag) end(); };
      if (w.__bdDoc) {
        w.document.removeEventListener('pointermove', w.__bdDoc.move, true);
        w.document.removeEventListener('pointerup', w.__bdDoc.up, true);
        w.document.removeEventListener('pointercancel', w.__bdDoc.up, true);
        w.document.removeEventListener('pointerdown', w.__bdDoc.out, true);
      }
      w.__bdDoc = { move: onMove, up: onUp, out: outsideDown };
      w.document.addEventListener('pointermove', onMove, true);
      w.document.addEventListener('pointerup', onUp, true);
      w.document.addEventListener('pointercancel', onUp, true);
      w.document.addEventListener('pointerdown', outsideDown, true);

      root.addEventListener('dblclick', function (e) {
        const b = e.target.closest('[data-job],[data-queue]');
        if (!b) return;
        location.hash = '#/jobs/' + (b.getAttribute('data-job') || b.getAttribute('data-queue'));
      });

      /* ------------------------------------------------------- keyboard */
      function onKey(e) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
        if (!U.qs('#bdGrid')) return;                      // the board is not on screen

        if (e.metaKey || e.ctrlKey) {
          if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLast(); }
          return;
        }
        if (e.key === 'Escape') { sel = null; closePop(); ctx.refresh(); return; }
        if (!sel) return;
        const j = S.job(sel);
        if (!j || j.status === 'completed' || j.status === 'inprogress') return;

        const step = e.shiftKey ? 60 : S.SNAP;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const to = S.toMin(j.slot) + (e.key === 'ArrowLeft' ? -step : step);
          remember(j.id + ' retimed', [{ jobId: j.id, before: S.placeJob(j.id, null, date, Math.max(0, to)) }]);
          ctx.refresh(); return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const list = techs();
          const cur = list.map(u => u.id).indexOf((j.techIds || [])[0]);
          const next = list[Math.max(0, Math.min(list.length - 1, cur + (e.key === 'ArrowUp' ? -1 : 1)))];
          if (!next || next.id === (j.techIds || [])[0]) return;
          remember(j.id + ' to ' + next.name,
            [{ jobId: j.id, before: S.placeJob(j.id, [next.id], date, S.toMin(j.slot)) }]);
          ctx.refresh(); return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remember(j.id + ' unassigned', [{ jobId: j.id, before: S.unassignJob(j.id) }]);
          sel = null; ctx.refresh();
          U.toast(j.id + ' is back in the queue', { tone: 'warn', action: { label: 'Undo', run: undoLast } });
        }
      }
      if (w.__bdKey) w.document.removeEventListener('keydown', w.__bdKey);
      w.__bdKey = onKey;
      w.document.addEventListener('keydown', onKey);

      /* --------------------------------------------------- first paint */
      // Land on the first thing happening rather than on the clock, so a board
      // opened late in the evening does not look empty.
      if (grid && !fitting()) {
        const first = dayJobs().map(j => S.toMin(j.slot)).sort((a, b) => a - b)[0];
        const start = first != null ? first : S.DAY_FROM;
        grid.scrollLeft = Math.max(0, (start - dayFrom()) * pxMin() - 100);
      }
    },

    /** Let other screens open the board on a particular day. */
    goto(dateISO) { date = dateISO || S.todayISO(); App.go('#/board'); }
  };
})(window);
