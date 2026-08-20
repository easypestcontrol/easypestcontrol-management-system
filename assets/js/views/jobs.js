/* ==========================================================================
   View: Services — list, manager detail, and the technician execution flow
   ("today's work → start → finish → photo proof")
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'today';
  let query = '';
  let techFilter = '';

  const SLOTS = ['06:00', '08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:30', '17:00', '18:30', '20:00', '22:00'];

  /* ------------------------------------------------------- image handling */
  function shrinkImage(file, max) {
    return U.fileToDataUrl(file).then(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (max || 520) / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        try { resolve(cv.toDataURL('image/jpeg', 0.72)); }
        catch (e) { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    }));
  }

  /* =================================================================== list */
  function listRows() {
    const q = query.toLowerCase();
    const today = S.todayISO();
    return S.get().jobs.filter(j => {
      if (techFilter && (j.techIds || []).indexOf(techFilter) < 0) return false;
      if (tab === 'today' && j.date !== today) return false;
      if (tab === 'upcoming' && !(S.dayDelta(j.date) > 0)) return false;
      if (tab === 'open' && j.status === 'completed') return false;
      if (tab === 'completed' && j.status !== 'completed') return false;
      if (tab === 'unassigned' && (j.techIds || []).length) return false;
      if (!q) return true;
      return (j.id + S.clientName(j.clientId) + S.jobTitle(j) + j.type).toLowerCase().indexOf(q) >= 0;
    }).sort((a, b) => (a.date + a.slot) < (b.date + b.slot) ? (tab === 'completed' ? 1 : -1) : (tab === 'completed' ? -1 : 1));
  }

  function renderList(ctx) {
    const all = S.get().jobs;
    const today = S.todayISO();
    const counts = {
      today: all.filter(j => j.date === today).length,
      upcoming: all.filter(j => S.dayDelta(j.date) > 0).length,
      open: all.filter(j => j.status !== 'completed').length,
      unassigned: all.filter(j => !(j.techIds || []).length).length,
      completed: all.filter(j => j.status === 'completed').length
    };
    const rows = listRows();
    const techs = S.get().users.filter(u => u.role === 'tech');

    return C.pageHead({
      title: 'Services',
      sub: counts.today + ' scheduled today · ' + counts.unassigned + ' waiting for a technician',
      actions: `<button class="btn btn-ghost btn-sm" data-act="wa-remind">${ico('whatsapp')} Remind customers</button>
                <button class="btn btn-primary btn-sm" data-new>${ico('plus')} Schedule service</button>`
    }) +
    C.tabsBar([
      { id: 'today', label: 'Today', n: counts.today },
      { id: 'upcoming', label: 'Upcoming', n: counts.upcoming },
      { id: 'open', label: 'All open', n: counts.open },
      { id: 'unassigned', label: 'Unassigned', n: counts.unassigned },
      { id: 'completed', label: 'Completed', n: counts.completed }
    ], tab) +
    `<div class="mt-16">` + C.searchRow('Search by reference, customer or service…',
      `<select class="select" id="jTech" style="width:auto;min-width:168px">
         <option value="">All technicians</option>
         ${techs.map(t => `<option value="${attr(t.id)}"${techFilter === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
       </select>`, 'jq') + `</div>` +

    (rows.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th>Ref</th><th>Customer &amp; site</th><th>Service</th>
        <th>Scheduled</th><th>Technician</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows.map(j => {
        const t = S.JOB_TYPE[j.type] || S.JOB_TYPE['One-Time'];
        return `<tr class="clickable" data-go="#/jobs/${j.id}">
          <td><div class="row g-8">
            <div class="tile-ico ${{ 'b-brand': 'i-brand', 'b-blue': 'i-blue', 'b-amber': 'i-amber', 'b-red': 'i-red', 'b-violet': 'i-violet' }[t.cls]}">${ico(t.icon)}</div>
            <div><div class="fw-6 mono t-base">${esc(j.id)}</div>
            <div class="t-sm muted">${esc(j.type)}${j.visitNo ? ' ' + j.visitNo + '/' + j.ofVisits : ''}</div></div>
          </div></td>
          <td>${C.clientCell(j.clientId)}</td>
          <td class="t-base truncate" style="max-width:190px">${esc(S.jobTitle(j))}</td>
          <td><div class="fw-6 t-base">${esc(S.relDay(j.date))}</div><div class="t-sm muted">${esc(S.fmtTime(j.slot))}</div></td>
          <td>${C.techStack(j.techIds)}</td>
          <td>${C.jobStatus(j)}${j.priority === 'high' ? ' <span class="badge b-red" style="height:19px">Priority</span>' : ''}</td>
          <td class="tight">${ico('cright', 'muted-2', 15)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`
    : U.empty({ icon: 'briefcase', title: 'No services in this view', text: 'Try a different tab or clear the filters.' }));
  }

  /* ================================================================= create */
  function newJob(pre) {
    const p = pre || {};
    const clients = S.get().clients;
    const techs = S.get().users.filter(u => u.role === 'tech');
    const svcs = S.get().services;

    U.modal({
      title: 'Schedule a service',
      sub: 'Assign it now or leave it in the unassigned queue',
      size: 'md',
      body: `<div class="grid grid-2">
          ${U.field('Customer', `<select class="select" id="jClient">${clients.map(c =>
            `<option value="${attr(c.id)}"${p.clientId === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`, '', true)}
          ${U.field('Service type', `<select class="select" id="jType">${U.selectOpts(['One-Time', 'Callback', 'Complaint', 'Inspection', 'AMC Visit'], null, null, 'One-Time')}</select>`)}
          ${U.field('Date', `<input class="input" id="jDate" type="date" value="${attr(Seed.D(1))}">`, '', true)}
          ${U.field('Time slot', `<select class="select" id="jSlot">${SLOTS.map(s =>
            `<option value="${attr(s)}"${s === '10:00' ? ' selected' : ''}>${esc(S.fmtTime(s))}</option>`).join('')}</select>`)}
          ${U.field('Technician', `<select class="select" id="jTechSel"><option value="">— unassigned —</option>
            ${techs.map(t => `<option value="${attr(t.id)}">${esc(t.name)}</option>`).join('')}</select>`)}
          ${U.field('Priority', `<select class="select" id="jPri"><option value="normal">Normal</option><option value="high">High priority</option></select>`)}
        </div>
        <div class="mt-14">${U.field('Services', `<div class="card" style="max-height:158px;overflow-y:auto;padding:8px 12px">
          ${svcs.map(s => `<label class="check" style="padding:5px 0">
            <input type="checkbox" name="jsvc" value="${attr(s.id)}"${(p.serviceIds || []).indexOf(s.id) >= 0 ? ' checked' : ''}>
            <span class="box">${ico('check')}</span><span class="txt">${esc(s.name)} <span class="muted">· ${esc(s.mins)} min</span></span></label>`).join('')}
        </div>`, '', true)}</div>
        <div class="mt-14">${U.field('Instructions for the technician',
          `<textarea class="textarea" id="jNotes" placeholder="Access, contact person, what to look out for…"></textarea>`)}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('calendar')} Schedule service</button>`,
      onMount(root, close) {
        U.qs('[data-save]', root).onclick = () => {
          const sel = U.qsa('input[name=jsvc]:checked', root).map(i => i.value);
          if (!sel.length) { U.toast('Pick at least one service', { tone: 'err' }); return; }
          const tid = U.qs('#jTechSel', root).value;
          const j = {
            id: S.nextId('job', 'JOB-', 4),
            type: U.qs('#jType', root).value,
            contractId: null,
            clientId: U.qs('#jClient', root).value,
            serviceIds: sel,
            date: U.qs('#jDate', root).value || Seed.D(1),
            slot: U.qs('#jSlot', root).value,
            mins: sel.reduce((s, id) => s + ((S.service(id) || {}).mins || 60), 0),
            techIds: tid ? [tid] : [],
            status: 'scheduled',
            priority: U.qs('#jPri', root).value,
            visitNo: 0, ofVisits: 0,
            notes: U.qs('#jNotes', root).value.trim(),
            exec: null
          };
          S.get().jobs.push(j); S.save(); close();
          U.toast('Service ' + j.id + ' scheduled', { sub: S.clientName(j.clientId) + ' · ' + S.fmtDate(j.date) + ' at ' + S.fmtTime(j.slot) });
          if (tid) U.whatsapp(S.user(tid).phone, `New service ${j.id} — ${S.clientName(j.clientId)}, ${S.fmtDate(j.date)} ${S.fmtTime(j.slot)}.`, 'Technician notified');
          location.hash = '#/jobs/' + j.id;
          App.refresh();
        };
      }
    });
  }

  /* ============================================================ report card */
  function reportCard(j) {
    const x = j.exec;
    if (!x) return '';
    const dur = x.durationMins || S.minutesBetween(x.startedAt, x.finishedAt);
    return C.sectionCard('Service report',
      `<div class="grid grid-4 mb-16" style="gap:12px">
        ${C.stat({ label: 'Checked in', value: `<span style="font-size:19px">${esc(S.fmtTime((x.checkinAt || '').slice(-5)))}</span>`, icon: 'pin', tone: 'i-blue' })}
        ${C.stat({ label: 'Work started', value: `<span style="font-size:19px">${esc(S.fmtTime((x.startedAt || '').slice(-5)))}</span>`, icon: 'play', tone: 'i-brand' })}
        ${C.stat({ label: 'Completed', value: `<span style="font-size:19px">${esc(S.fmtTime((x.finishedAt || '').slice(-5)))}</span>`, icon: 'checkcircle', tone: 'i-green' })}
        ${C.stat({ label: 'Time on site', value: `<span style="font-size:19px">${esc(S.durationText(dur))}</span>`, icon: 'timer', tone: 'i-violet' })}
      </div>

      ${x.geo ? `<div class="row g-8 t-sm muted mb-16">${ico('navigation', '', 14)} GPS verified at check-in — ${esc(x.geo)}</div>` : ''}

      <div class="grid grid-2 mb-16">
        <div>
          <div class="flabel mb-8">Before treatment</div>
          <div class="photogrid">${(x.photosBefore || []).map(p =>
            `<div class="photo"><img src="${attr(p)}" alt="Before" data-zoom="${attr(p)}"></div>`).join('')
            || '<div class="t-sm muted">No photos</div>'}</div>
        </div>
        <div>
          <div class="flabel mb-8">After treatment</div>
          <div class="photogrid">${(x.photosAfter || []).map(p =>
            `<div class="photo"><img src="${attr(p)}" alt="After" data-zoom="${attr(p)}"></div>`).join('')
            || '<div class="t-sm muted">No photos</div>'}</div>
        </div>
      </div>

      ${(x.findings || []).length ? `<div class="mb-16">
        <div class="flabel mb-8">Pest activity observed</div>
        <div class="row g-6 wrap">${x.findings.map(f =>
          `<span class="badge ${f.indexOf('No activity') === 0 ? 'b-green' : 'b-amber'} badge-lg">${ico('bug')}${esc(f)}</span>`).join('')}</div>
      </div>` : ''}

      ${(x.chemicals || []).length ? `<div class="mb-16">
        <div class="flabel mb-8">Chemicals used</div>
        <div class="tablewrap"><table class="tbl" style="min-width:0">
          <thead><tr><th>Product</th><th>Active ingredient</th><th class="r">Quantity</th></tr></thead>
          <tbody>${x.chemicals.map(c => {
            const it = S.item(c.id) || {};
            return `<tr><td class="fw-6">${esc(it.name || c.id)}</td>
              <td class="t-sm muted">${esc(it.ai || '—')}</td>
              <td class="r fw-6">${c.qty} ${esc(it.unit || '')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>` : ''}

      ${x.observations ? `<div class="mb-16">
        <div class="flabel mb-6">Technician observations</div>
        <div class="card card-pad" style="background:var(--surface-2);font-size:13px;line-height:1.65">${esc(x.observations)}</div>
      </div>` : ''}

      <div class="row between wrap g-16" style="padding-top:14px;border-top:1px solid var(--line)">
        <div>
          <div class="flabel mb-4">Customer acknowledgement</div>
          ${x.signature ? `<div class="row g-8">
            <div class="tile-ico i-green">${ico('pen', '', 17)}</div>
            <div><div class="fw-6 t-base">${esc(x.signedBy || 'Signed on site')}</div>
            <div class="t-sm muted">Digitally signed on completion</div></div>
          </div>` : '<span class="badge b-amber">Not signed</span>'}
        </div>
        ${x.rating ? `<div style="text-align:right">
          <div class="flabel mb-4">Customer rating</div>
          ${U.stars(x.rating, 17)}
          ${x.feedback ? `<div class="t-sm muted mt-4" style="max-width:280px">“${esc(x.feedback)}”</div>` : ''}
        </div>` : ''}
      </div>`,
      `<button class="btn btn-wa btn-sm no-print" data-act="wa-report">${ico('whatsapp')} Send to customer</button>
       <button class="btn btn-ghost btn-sm no-print" data-act="print">${ico('printer')} Print</button>`);
  }

  /* ========================================================= manager detail */
  function managerDetail(j, ctx) {
    const cl = S.client(j.clientId);
    const c = j.contractId ? S.contract(j.contractId) : null;
    const canManage = ['admin', 'ops', 'sales'].indexOf(ctx.role) >= 0;

    const tech = S.user((j.techIds || [])[0]);
    const svcCount = (j.serviceIds || []).length;
    const done = j.status === 'completed';
    const exec = j.exec || {};

    return C.backLink('#/jobs', 'All services') +
    `<div class="row between wrap g-12 mb-20">
      <div class="row g-12" style="min-width:0">
        ${U.avatarName(cl ? cl.name : '?', cl ? cl.color : '', 'av-lg')}
        <div style="min-width:0">
          <div class="row g-8 wrap">
            <h2 class="truncate">${esc(cl ? cl.name : 'Service')}</h2>
            ${C.jobStatus(j)} ${C.jobType(j)}
            ${j.priority === 'high' ? `<span class="badge b-red">${ico('alert')}Priority</span>` : ''}
          </div>
          <div class="muted t-base mt-2">${esc(j.id)} · ${esc(S.jobTitle(j))} · ${esc(S.fmtLong(j.date))} at ${esc(S.fmtTime(j.slot))}</div>
        </div>
      </div>
      ${canManage ? `<div class="row g-8 wrap no-print">
        <button class="btn btn-ghost btn-sm" data-act="wa-customer">${ico('whatsapp')} Notify customer</button>
        ${(function () {
          // Billing lives with the service it is for. One rule decides whether
          // it can be raised, shared with the contract page's schedule.
          const inv = S.invoiceForJob(j.id);
          if (inv) return `<a class="btn btn-ghost btn-sm" href="#/invoices/${attr(inv.id)}">${ico('receipt')} ${esc(inv.id)}</a>`;
          const why = S.billBlock(j);
          return why
            ? `<button class="btn btn-ghost btn-sm" disabled title="${attr(why)}">${ico('receipt')} Raise invoice</button>`
            : `<button class="btn btn-soft btn-sm" data-act="bill">${ico('receipt')} Raise invoice</button>`;
        })()}
        ${j.status !== 'completed' ? `<button class="btn btn-ghost btn-sm" data-act="reschedule">${ico('calendar')} Reschedule</button>
          <button class="btn btn-primary btn-sm" data-act="assign">${ico('hardhat')} ${(j.techIds || []).length ? 'Reassign' : 'Assign technician'}</button>` : ''}
      </div>` : ''}
    </div>

    <div class="grid grid-4 mb-20">
      ${C.stat({ label: done ? 'Completed' : 'Scheduled', value: S.fmtTime(j.slot),
        icon: 'calcheck', tone: done ? 'i-green' : 'i-brand', foot: S.fmtDate(j.date) + ' · ' + S.relDay(j.date) })}
      ${C.stat({ label: done ? 'Time on site' : 'Estimated duration',
        value: S.durationText(done ? (exec.durationMins || j.mins) : j.mins),
        icon: 'timer', tone: 'i-blue', foot: svcCount + ' service' + (svcCount === 1 ? '' : 's') + ' this visit' })}
      ${C.stat({ label: c ? 'AMC visit' : 'Service type',
        value: c ? (j.visitNo || 1) + '<span style="font-size:17px;color:var(--muted-2)">/' + (j.ofVisits || c.totalVisits || 1) + '</span>' : esc(j.type),
        icon: c ? 'shield' : 'zap', tone: c ? 'i-violet' : 'i-amber',
        foot: c ? esc(c.id) : 'One-time service' })}
      ${C.stat({ label: 'Technician', value: tech ? esc(tech.name.split(' ')[0]) : '—',
        icon: 'hardhat', tone: tech ? 'i-brand' : 'i-amber',
        foot: tech ? esc(tech.title) : 'Not assigned yet' })}
    </div>

    ${!(j.techIds || []).length && j.status !== 'completed' ? `<div class="banner ban-amber mb-16">${ico('alert')}
      <div><div class="bt">No technician assigned</div>This service will not appear on anyone's "Today's Work" screen until you assign it.</div></div>` : ''}

    ${j.status === 'inprogress' ? `<div class="banner ban-blue mb-16">${ico('timer')}
      <div><div class="bt">${esc(S.userName(j.techIds[0]))} is on site right now</div>
      Checked in at ${esc(S.fmtTime((j.exec.checkinAt || '').slice(-5)))} · work started ${esc(S.fmtTime((j.exec.startedAt || '').slice(-5)))}</div></div>` : ''}

    <div class="grid mb-20 split-rail">
      <div class="col g-16">
        ${C.sectionCard('Customer & site',
          `<div class="row g-12 mb-14">
            ${U.avatarName(cl ? cl.name : '?', cl ? cl.color : '', 'av-lg')}
            <div style="min-width:0">
              <div class="fw-7" style="font-size:14.5px">${esc(cl ? cl.name : '—')}</div>
              <div class="t-sm muted">${esc(cl ? cl.type + ' · ' + cl.area : '')}</div>
            </div>
          </div>
          ${C.kv([
            ['Contact', cl ? cl.contact : '—'],
            ['Phone', cl ? cl.phone : '—'],
            ['Site address', cl ? cl.addr + ', ' + cl.city + ' — ' + cl.pin : '—']
          ])}
          ${cl ? `<a class="btn btn-quiet btn-sm btn-block mt-14" href="#/clients/${attr(cl.id)}">View customer file ${ico('cright')}</a>` : ''}`)}

        ${C.sectionCard('Assignment', `
          ${(j.techIds || []).length ? (j.techIds.map(id => {
            const u = S.user(id);
            return `<div class="row g-11 mb-12">
              ${U.avatar(u, 'av-lg')}
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-md">${esc(u.name)}</div>
                <div class="t-sm muted">${esc(u.title)} · ${esc(u.licence || '')}</div>
              </div>
            </div>
            ${C.kv([['Phone', u.phone], ['Skills', (u.skills || []).join(', ')], ['Rating', (u.rating || 0).toFixed(1) + ' ★']])}`;
          }).join('')) : `<div class="t-sm muted">Nobody assigned yet.</div>`}`)}
      </div>

      <div class="col g-16">
        ${C.sectionCard('Service details', C.kv([
          ['Service number', j.id],
          ['Type', j.type + (j.visitNo ? ' — visit ' + j.visitNo + ' of ' + j.ofVisits : '')],
          ['Services', j.serviceIds.map(S.svcName).join(', ')],
          ['Scheduled', S.fmtLong(j.date) + ' at ' + S.fmtTime(j.slot)],
          ['Estimated duration', S.durationText(j.mins)],
          c ? ['Contract', '<a class="brand fw-6" href="#/contracts/' + attr(c.id) + '">' + esc(c.id) + '</a> · ' + esc(S.planSummary(c, true)), true] : null,
          ['Warranty', j.serviceIds.map(s => (S.service(s) || {}).warranty).filter(Boolean).join(', ') || '—']
        ]) + (j.notes ? `<div class="banner ban-amber mt-14">${ico('info')}
          <div><div class="bt">Instructions for the technician</div>${esc(j.notes)}</div></div>` : ''))}

        ${j.status === 'completed' ? reportCard(j)
          : C.sectionCard('Service report',
              U.empty({ icon: 'camera', title: 'Report not available yet',
                text: 'The technician fills this in from the field — timings, before/after photos, chemicals used, findings and the customer signature.' }))}
      </div>
    </div>`;
  }

  /* ====================================================== technician detail */
  let timerHandle = null;

  function stepCard(n, title, state, bodyHtml, subtitle) {
    return `<div class="stepcard ${state}">
      <div class="stepcard-hd">
        <div class="stepnum">${state === 'done' ? ico('check') : n}</div>
        <div class="grow"><div class="fw-6" style="font-size:13.5px">${esc(title)}</div>
        ${subtitle ? `<div class="t-sm muted">${esc(subtitle)}</div>` : ''}</div>
        ${state === 'locked' ? ico('lock', 'muted-2', 15) : ''}
      </div>
      ${state !== 'locked' && bodyHtml ? `<div class="stepcard-bd">${bodyHtml}</div>` : ''}
    </div>`;
  }

  function techDetail(j, ctx) {
    const cl = S.client(j.clientId) || {};
    const x = j.exec || {};
    const hasTravel = j.status === 'enroute' || !!x.checkinAt;
    const hasCheckin = !!x.checkinAt;
    const hasBefore = (x.photosBefore || []).length > 0;
    const hasStart = !!x.startedAt;
    const hasAfter = (x.photosAfter || []).length > 0;
    const hasSign = !!x.signature;
    const done = j.status === 'completed';

    const st = (cond, active) => done ? 'done' : cond ? 'done' : active ? 'active' : 'locked';

    if (done) {
      return C.backLink('#/my-work', "Today's work") +
        `<div class="banner ban-green mb-16">${ico('checkcircle')}
          <div><div class="bt">Service completed</div>Finished at ${esc(S.fmtTime((x.finishedAt || '').slice(-5)))} · ${esc(S.durationText(x.durationMins))} on site. The report has gone to ${esc(cl.contact || 'the customer')}.</div></div>` +
        jobHeaderCard(j, cl) +
        reportCard(j);
    }

    return C.backLink('#/my-work', "Today's work") +
      jobHeaderCard(j, cl) +

      (j.status === 'inprogress' ? `<div class="card card-pad mb-16" style="border-color:var(--brand-300)">
        <div class="timer-box"><div><div class="lbl">Time on site</div><span id="liveTimer">00:00</span></div></div>
      </div>` : '') +

      `<div class="col g-10 mt-16">
        ${stepCard(1, 'Start travel to site', st(hasTravel, true),
          `<button class="btn btn-primary btn-block" data-step="travel">${ico('navigation')} I'm on my way</button>`,
          hasTravel ? 'Travel started' : 'Tap when you leave for this service')}

        ${stepCard(2, 'Check in at site', st(hasCheckin, hasTravel && !hasCheckin),
          hasCheckin ? `<div class="row g-8 t-sm muted">${ico('pin', '', 14)} ${esc(x.geo || '')} · ${esc(S.fmtTime((x.checkinAt || '').slice(-5)))}</div>`
            : `<button class="btn btn-primary btn-block" data-step="checkin">${ico('pin')} Check in with GPS</button>`,
          hasCheckin ? 'Checked in at ' + S.fmtTime((x.checkinAt || '').slice(-5)) : 'Location is stamped on the report')}

        ${stepCard(3, 'Before-treatment photos', st(hasBefore, hasCheckin && !hasBefore),
          photoBlock(j, 'photosBefore', 'before'),
          (x.photosBefore || []).length + ' photo(s) added')}

        ${stepCard(4, 'Start the work', st(hasStart, hasBefore && !hasStart),
          hasStart ? `<div class="row g-8 t-sm muted">${ico('play', '', 14)} Started at ${esc(S.fmtTime((x.startedAt || '').slice(-5)))}</div>`
            : `<button class="btn btn-primary btn-block btn-lg" data-step="start">${ico('play')} Start work</button>`,
          hasStart ? 'Timer running' : 'The clock starts when you tap this')}

        ${stepCard(5, 'Chemicals used', hasStart ? 'active' : 'locked',
          chemBlock(j), (x.chemicals || []).length + ' item(s) recorded')}

        ${stepCard(6, 'What did you find?', hasStart ? 'active' : 'locked',
          findingsBlock(j), (x.findings || []).length + ' observation(s)')}

        ${stepCard(7, 'After-treatment photos', st(hasAfter, hasStart && !hasAfter),
          photoBlock(j, 'photosAfter', 'after'),
          (x.photosAfter || []).length + ' photo(s) added')}

        ${stepCard(8, 'Customer signature & rating', st(hasSign, hasAfter && !hasSign),
          signBlock(j), hasSign ? 'Signed by ' + (x.signedBy || '—') : 'Hand the phone to the customer')}
      </div>

      <div class="actionbar">
        <button class="btn btn-primary btn-lg btn-block ${hasSign && hasAfter ? '' : 'is-disabled'}" data-step="finish">
          ${ico('checkcircle')} Finish service &amp; send report
        </button>
      </div>`;
  }

  function jobHeaderCard(j, cl) {
    return `<div class="card card-pad mb-16">
      <div class="row between g-10 mb-12">
        <div class="row g-8 wrap">${C.jobType(j)}${C.jobStatus(j)}
          ${j.priority === 'high' ? `<span class="badge b-red">${ico('alert')}Priority</span>` : ''}</div>
        <span class="mono t-sm muted">${esc(j.id)}</span>
      </div>
      <div class="fw-7" style="font-size:17px;letter-spacing:-.02em">${esc(cl.name || '—')}</div>
      <div class="t-base muted mt-2">${esc(S.jobTitle(j))}${j.visitNo ? ' · visit ' + j.visitNo + ' of ' + j.ofVisits : ''}</div>

      <div class="row g-14 wrap mt-12 t-base">
        <span class="row g-6">${ico('clock', 'muted', 15)}${esc(S.fmtTime(j.slot))}</span>
        <span class="row g-6">${ico('timer', 'muted', 15)}${esc(S.durationText(j.mins))}</span>
        <span class="row g-6">${ico('calendar', 'muted', 15)}${esc(S.relDay(j.date))}</span>
      </div>

      <div class="row-top g-8 mt-12 t-base" style="color:var(--ink-2)">
        ${ico('pin', 'muted shrink0', 15)}<span>${esc(cl.addr || '')}${cl.city ? ', ' + esc(cl.city) : ''}</span>
      </div>

      <div class="grid grid-3 mt-14" style="gap:8px">
        <a class="btn btn-ghost btn-sm" href="tel:${attr(cl.phone || '')}">${ico('phone')} Call</a>
        <button class="btn btn-ghost btn-sm" data-act="wa-customer">${ico('whatsapp')} Chat</button>
        <button class="btn btn-ghost btn-sm" data-act="map">${ico('navigation')} Navigate</button>
      </div>

      ${j.notes ? `<div class="banner ban-amber mt-14">${ico('info')}
        <div><div class="bt">Site instructions</div>${esc(j.notes)}</div></div>` : ''}
    </div>`;
  }

  function photoBlock(j, key, kind) {
    const list = (j.exec && j.exec[key]) || [];
    return `<div class="photogrid">
      ${list.map((p, i) => `<div class="photo"><img src="${attr(p)}" alt="">
        <button class="rm" data-rmphoto="${kind}:${i}">${ico('x')}</button></div>`).join('')}
      <label class="photo-add">
        ${ico('camera')}<span>Camera</span>
        <input type="file" accept="image/*" capture="environment" data-photo="${kind}" hidden>
      </label>
      <button class="photo-add" data-sample="${kind}">${ico('image')}<span>Sample</span></button>
    </div>`;
  }

  function chemBlock(j) {
    const used = (j.exec && j.exec.chemicals) || [];
    const chems = S.get().inventory.filter(i => i.cat === 'Chemical');
    return `${used.length ? `<div class="col g-8 mb-10">${used.map((c, i) => {
      const it = S.item(c.id) || {};
      return `<div class="row g-10 card" style="padding:9px 11px">
        <div class="tile-ico i-brand" style="width:30px;height:30px">${ico('flask', '', 15)}</div>
        <div class="grow" style="min-width:0"><div class="truncate fw-6 t-base">${esc(it.name)}</div>
        <div class="t-sm muted">${esc(it.ai || '')}</div></div>
        <span class="fw-7 t-base nowrap">${c.qty} ${esc(it.unit || '')}</span>
        <button class="iconbtn" style="width:28px;height:28px" data-rmchem="${i}">${ico('x', '', 14)}</button>
      </div>`;
    }).join('')}</div>` : ''}
    <div class="row g-8">
      <select class="select grow" data-chemsel>${chems.map(c =>
        `<option value="${attr(c.id)}">${esc(c.name)} (${esc(c.unit)})</option>`).join('')}</select>
      <input class="input" data-chemqty type="number" min="1" value="50" style="width:88px">
      <button class="btn btn-soft" data-step="addchem">${ico('plus')}</button>
    </div>`;
  }

  function findingsBlock(j) {
    const sel = (j.exec && j.exec.findings) || [];
    const obs = (j.exec && j.exec.observations) || '';
    return `<div class="row g-6 wrap mb-12">
      ${Seed.FINDINGS.map(f => `<button class="chip ${sel.indexOf(f) >= 0 ? 'on' : ''}" data-finding="${attr(f)}">${esc(f)}</button>`).join('')}
    </div>
    <textarea class="textarea" data-obs placeholder="Anything else the customer should know? Recommendations, structural gaps, follow-up needed…">${esc(obs)}</textarea>`;
  }

  function signBlock(j) {
    const x = j.exec || {};
    if (x.signature) {
      return `<div class="row g-10">
        <div class="tile-ico i-green">${ico('checkcircle', '', 17)}</div>
        <div class="grow"><div class="fw-6 t-base">Signed by ${esc(x.signedBy)}</div>
        ${x.rating ? U.stars(x.rating) : ''}</div>
        <button class="btn btn-ghost btn-sm" data-step="resign">Redo</button>
      </div>`;
    }
    return `<div class="field mb-10">
        <label class="flabel">Customer name</label>
        <input class="input" data-signname placeholder="Who is signing?" value="${attr((S.client(j.clientId) || {}).contact || '')}">
      </div>
      <div class="flabel mb-6">Signature</div>
      <canvas class="sigpad" data-sigpad></canvas>
      <div class="row between mt-8">
        <button class="btn btn-quiet btn-sm" data-step="clearsig">${ico('rotate')} Clear</button>
        <div class="row g-6">
          <span class="t-sm muted">Rating:</span>
          ${[1, 2, 3, 4, 5].map(n => `<button class="iconbtn" style="width:26px;height:26px" data-rate="${n}">${ico('star', '', 17)}</button>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-block mt-12" data-step="savesig">${ico('pen')} Save signature</button>`;
  }

  /* ------------------------------------------------ technician interactions */
  function ensureExec(j) {
    if (!j.exec) {
      j.exec = { checkinAt: null, startedAt: null, finishedAt: null, durationMins: 0, geo: '',
        photosBefore: [], photosAfter: [], chemicals: [], findings: [], observations: '',
        signedBy: '', signature: false, rating: 0, feedback: '' };
    }
    return j.exec;
  }

  function geoStamp() {
    return new Promise(resolve => {
      const fallback = '13.0' + (300 + Math.floor(Math.random() * 400)) + '° N, 80.2' + (300 + Math.floor(Math.random() * 400)) + '° E';
      if (!navigator.geolocation) return resolve(fallback);
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, 2500);
      navigator.geolocation.getCurrentPosition(
        pos => { if (settled) return; settled = true; clearTimeout(t);
          resolve(pos.coords.latitude.toFixed(4) + '° N, ' + pos.coords.longitude.toFixed(4) + '° E'); },
        () => { if (settled) return; settled = true; clearTimeout(t); resolve(fallback); },
        { timeout: 2400, maximumAge: 60000 }
      );
    });
  }

  function startTimer(j) {
    if (timerHandle) clearInterval(timerHandle);
    const el = U.qs('#liveTimer');
    if (!el || !j.exec || !j.exec.startedAt) return;
    const t0 = new Date(j.exec.startedAt.replace(' ', 'T')).getTime();
    function tick() {
      const node = U.qs('#liveTimer');
      if (!node) { clearInterval(timerHandle); timerHandle = null; return; }
      const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      node.textContent = (hh !== '00' ? hh + ':' : '') + mm + ':' + ss;
    }
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function bindSigPad(root, state) {
    const cv = U.qs('[data-sigpad]', root);
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = w.devicePixelRatio || 1;
    cv.width = Math.max(280, rect.width) * dpr;
    cv.height = 168 * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0F1729';

    let drawing = false;
    function pt(e) {
      const r = cv.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function down(e) { e.preventDefault(); drawing = true; state.inked = true; cv.classList.add('inked'); const p = pt(e); g.beginPath(); g.moveTo(p.x, p.y); }
    function move(e) { if (!drawing) return; e.preventDefault(); const p = pt(e); g.lineTo(p.x, p.y); g.stroke(); }
    function up() { drawing = false; }

    cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move);
    w.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', up);
    state.clear = () => { g.clearRect(0, 0, cv.width, cv.height); state.inked = false; cv.classList.remove('inked'); };
  }

  function bindTech(root, ctx, j) {
    const sig = { inked: false, rating: 0 };
    bindSigPad(root, sig);
    if (j.status === 'inprogress') startTimer(j);

    root.addEventListener('change', e => {
      const inp = e.target.closest('[data-photo]');
      if (inp && inp.files && inp.files[0]) {
        const kind = inp.getAttribute('data-photo');
        shrinkImage(inp.files[0], 520).then(src => {
          const x = ensureExec(j);
          (kind === 'before' ? x.photosBefore : x.photosAfter).push(src);
          S.save(); ctx.refresh();
          U.toast('Photo added');
        });
      }
    });

    root.addEventListener('click', e => {
      /* ---- shared customer actions ---- */
      if (e.target.closest('[data-act=wa-customer]')) {
        const cl = S.client(j.clientId) || {};
        U.whatsapp(cl.phone, `Hello ${cl.contact}, this is ${(S.me() || {}).name} from Shield Pest Control. I am on the way for your ${S.jobTitle(j)} service (${j.id}).`);
        return;
      }
      if (e.target.closest('[data-act=map]')) {
        const cl = S.client(j.clientId) || {};
        U.toast('Opening navigation', { icon: 'navigation', sub: cl.addr + ', ' + cl.city });
        return;
      }
      const zoom = e.target.closest('[data-zoom]');
      if (zoom) { U.lightbox(zoom.getAttribute('data-zoom')); return; }

      /* ---- sample photo ---- */
      const sm = e.target.closest('[data-sample]');
      if (sm) {
        const kind = sm.getAttribute('data-sample');
        const x = ensureExec(j);
        const src = Seed.photo(kind === 'before' ? 'Before' : 'After', kind === 'before' ? 24 : 152);
        (kind === 'before' ? x.photosBefore : x.photosAfter).push(src);
        S.save(); ctx.refresh(); U.toast('Sample photo added', { sub: 'On a phone this opens the camera' });
        return;
      }
      const rm = e.target.closest('[data-rmphoto]');
      if (rm) {
        const [kind, i] = rm.getAttribute('data-rmphoto').split(':');
        const x = ensureExec(j);
        (kind === 'before' ? x.photosBefore : x.photosAfter).splice(+i, 1);
        S.save(); ctx.refresh(); return;
      }

      /* ---- findings ---- */
      const fb = e.target.closest('[data-finding]');
      if (fb) {
        const x = ensureExec(j);
        const f = fb.getAttribute('data-finding');
        const i = x.findings.indexOf(f);
        if (i >= 0) x.findings.splice(i, 1); else x.findings.push(f);
        fb.classList.toggle('on');
        S.save(); return;
      }

      /* ---- chemicals ---- */
      const rc = e.target.closest('[data-rmchem]');
      if (rc) { ensureExec(j).chemicals.splice(+rc.getAttribute('data-rmchem'), 1); S.save(); ctx.refresh(); return; }

      /* ---- rating ---- */
      const rate = e.target.closest('[data-rate]');
      if (rate) {
        sig.rating = +rate.getAttribute('data-rate');
        U.qsa('[data-rate]', root).forEach((b, i) => {
          b.style.color = i < sig.rating ? '#F59E0B' : 'var(--muted-2)';
        });
        return;
      }

      /* ---- steps ---- */
      const sb = e.target.closest('[data-step]');
      if (!sb) return;
      const step = sb.getAttribute('data-step');
      const x = ensureExec(j);

      if (step === 'travel') {
        j.status = 'enroute'; S.save(); ctx.refresh();
        const cl = S.client(j.clientId) || {};
        U.whatsapp(cl.phone, `Your technician ${(S.me() || {}).name} is on the way and will reach around ${S.fmtTime(j.slot)}.`, 'Customer notified — technician en route');
        return;
      }

      if (step === 'checkin') {
        sb.classList.add('is-disabled');
        sb.innerHTML = ico('timer') + ' Getting location…';
        geoStamp().then(geo => {
          x.geo = geo; x.checkinAt = S.nowStamp();
          j.status = 'enroute'; S.save(); ctx.refresh();
          U.toast('Checked in on site', { sub: geo });
        });
        return;
      }

      if (step === 'start') {
        x.startedAt = S.nowStamp();
        j.status = 'inprogress'; S.save(); ctx.refresh();
        U.toast('Work started', { sub: 'Timer is running' });
        return;
      }

      if (step === 'addchem') {
        const sel = U.qs('[data-chemsel]', root);
        const qty = parseFloat(U.qs('[data-chemqty]', root).value) || 0;
        if (!qty) { U.toast('Enter a quantity', { tone: 'err' }); return; }
        x.chemicals.push({ id: sel.value, qty: qty });
        S.save(); ctx.refresh();
        U.toast('Chemical recorded', { sub: 'It will be deducted from stock on completion' });
        return;
      }

      if (step === 'clearsig') { sig.clear && sig.clear(); return; }
      if (step === 'resign') { x.signature = false; x.signedBy = ''; x.rating = 0; S.save(); ctx.refresh(); return; }

      if (step === 'savesig') {
        const nm = U.qs('[data-signname]', root);
        if (!sig.inked) { U.toast('Ask the customer to sign in the box', { tone: 'err' }); return; }
        if (!nm.value.trim()) { U.toast('Enter the name of the person signing', { tone: 'err' }); return; }
        x.signature = true;
        x.signedBy = nm.value.trim();
        x.rating = sig.rating || 5;
        const obs = U.qs('[data-obs]', root);
        if (obs) x.observations = obs.value.trim();
        S.save(); ctx.refresh();
        U.toast('Signature captured', { sub: 'You can finish the service now' });
        return;
      }

      if (step === 'finish') {
        if (sb.classList.contains('is-disabled')) {
          U.toast('Add after-photos and the customer signature first', { tone: 'err' });
          return;
        }
        const obs = U.qs('[data-obs]', root);
        if (obs) x.observations = obs.value.trim();
        x.finishedAt = S.nowStamp();
        x.durationMins = S.minutesBetween(x.startedAt, x.finishedAt) || 1;
        j.status = 'completed';
        S.consumeStock(j.id, x.chemicals, (S.me() || {}).id);
        S.save();

        const cl = S.client(j.clientId) || {};
        U.modal({
          title: 'Service completed',
          sub: j.id + ' · ' + S.jobTitle(j),
          body: `<div class="center-txt" style="padding:8px 0 4px">
              <div class="tile-ico lg i-green" style="margin:0 auto 14px;width:58px;height:58px;border-radius:50%">${ico('checkcircle', '', 30)}</div>
              <div style="font-size:17px;font-weight:680">Nice work, ${esc((S.me() || {}).name.split(' ')[0])}</div>
              <div class="muted t-base mt-4">${esc(S.durationText(x.durationMins))} on site at ${esc(cl.name)}</div>
            </div>
            <div class="grid grid-3 mt-16" style="gap:10px">
              ${C.stat({ label: 'Photos', value: (x.photosBefore.length + x.photosAfter.length), icon: 'camera', tone: 'i-blue' })}
              ${C.stat({ label: 'Chemicals', value: x.chemicals.length, icon: 'flask', tone: 'i-brand' })}
              ${C.stat({ label: 'Rating', value: (x.rating || 5) + '★', icon: 'star', tone: 'i-amber' })}
            </div>`,
          footer: `<button class="btn btn-ghost" data-close>Close</button>
                   <button class="btn btn-wa" data-send>${ico('whatsapp')} Send report to customer</button>`,
          onMount(mroot, close) {
            U.qs('[data-send]', mroot).onclick = () => {
              U.whatsapp(cl.phone, `Service completed at ${cl.name} — ${S.jobTitle(j)} (${j.id}). Report with before/after photos attached. Next visit as per your AMC schedule.`, 'Service report sent to customer');
              close();
              location.hash = '#/my-work';
            };
          }
        });
        App.refresh();
      }
    });
  }

  /* ================================================================ detail */
  V.jobsDetail = {
    title: ctx => (S.job(ctx.id) || {}).id || 'Service',
    crumb: ctx => ctx.role === 'tech' ? "Today's work" : 'Services',
    narrow: ctx => ctx.role === 'tech',
    render(ctx) {
      const j = S.job(ctx.id);
      if (!j) return C.backLink(ctx.role === 'tech' ? '#/my-work' : '#/jobs', 'Back') +
        U.empty({ icon: 'briefcase', title: 'Service not found', text: 'This service may have been removed. Use the link above to go back.' });
      if (ctx.role === 'tech') return techDetail(j, ctx);
      return managerDetail(j, ctx);
    },
    mount(root, ctx) {
      const j = S.job(ctx.id);
      if (!j) return;
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }

      if (ctx.role === 'tech') { bindTech(root, ctx, j); return; }

      root.addEventListener('click', e => {
        const zoom = e.target.closest('[data-zoom]');
        if (zoom) { U.lightbox(zoom.getAttribute('data-zoom')); return; }

        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');

        if (a === 'bill') {
          const why = S.billBlock(j);
          if (why) { U.toast('Not billable', { tone: 'err', sub: why }); return; }
          const c = S.contract(j.contractId);
          const lines = S.linesFor(c, j.serviceIds);
          const sub = lines.reduce((x, l) => x + l.qty * l.rate, 0);
          const t = S.taxSplit(sub, S.supplyState({ clientId: j.clientId }));
          U.confirm({
            title: 'Raise invoice for this visit?',
            message: [
              lines.map(l => l.name + ' — ' + S.money(l.rate)).join(', '),
              'Subtotal ' + S.money(sub) + ' · GST ' + S.money(t.gst),
              'Total ' + S.money(sub + t.gst) + ', priced from the contract.'
            ].join(' · '),
            confirmText: 'Raise invoice'
          }).then(ok => {
            if (!ok) return;
            const inv = S.invoiceFromVisit(j);
            U.toast('Invoice ' + inv.id + ' raised', { sub: S.clientName(j.clientId) + ' · due ' + S.fmtDate(inv.due) });
            location.hash = '#/invoices/' + inv.id;
            App.refresh();
          });
          return;
        }

        const cl = S.client(j.clientId) || {};

        if (a === 'print') { w.print(); return; }
        // Still used by the technician's on-site card.
        if (a === 'map') { U.toast('Opening navigation', { icon: 'navigation', sub: cl.addr + ', ' + cl.city }); return; }
        if (a === 'wa-customer') {
          U.whatsapp(cl.phone, `Reminder: your ${S.jobTitle(j)} service is scheduled on ${S.fmtDate(j.date)} at ${S.fmtTime(j.slot)}. Technician: ${S.userName((j.techIds || [])[0]) || 'to be assigned'}.`);
          return;
        }
        if (a === 'wa-report') {
          U.whatsapp(cl.phone, `Service report for ${j.id} — ${S.jobTitle(j)} completed on ${S.fmtDate(j.date)}. Before/after photos and chemicals used attached.`, 'Service report sent');
          return;
        }
        if (a === 'assign') {
          const techs = S.get().users.filter(u => u.role === 'tech');
          U.modal({
            title: 'Assign technician', sub: S.fmtDate(j.date) + ' at ' + S.fmtTime(j.slot),
            body: `<div class="col g-8">${techs.map(t => {
              const load = S.jobsOn(j.date, t.id).length;
              const busy = load > 3;
              const mine = (j.techIds || []).indexOf(t.id) >= 0;
              return `<button class="rolecard" data-t="${attr(t.id)}"${mine ? ' aria-current="true"' : ''}>
                <span class="pickrow">
                  ${U.avatar(t, 'av-lg')}
                  <span class="who">
                    <span class="nm">${esc(t.name)}${mine ? ' <span class="badge b-green">On this job</span>' : ''}</span>
                    <span class="sk">${esc((t.skills || []).join(' · ')) || esc(t.title || 'Technician')}</span>
                  </span>
                  <span class="load">
                    <span class="n" style="color:${busy ? 'var(--danger-700)' : (load ? 'var(--ink)' : 'var(--muted-2)')}">${load}</span>
                    <span class="l">that day</span>
                  </span>
                </span>
                ${ico('cright')}</button>`;
            }).join('')}</div>`,
            onMount(mroot, close) {
              mroot.addEventListener('click', ev => {
                const t = ev.target.closest('[data-t]');
                if (!t) return;
                const tid = t.getAttribute('data-t');
                // This used to be `j.techIds = [tid]`, which took a four-person
                // crew down to one without saying so. It is a toggle now, and
                // it stops at what the visit actually needs.
                const need = Math.max(1, S.jobCrewSize(j));
                const on = (j.techIds || []).slice();
                const at = on.indexOf(tid);
                let msg;
                if (at >= 0) {
                  on.splice(at, 1);
                  msg = S.userName(tid) + ' taken off ' + j.id;
                } else {
                  if (on.length >= need) on.shift();     // the oldest pick makes way
                  on.push(tid);
                  msg = S.userName(tid) + ' assigned to ' + j.id;
                }
                j.techIds = on;
                S.save(); close(); ctx.refresh();
                U.toast(msg, { sub: on.length + ' of ' + need + ' on this visit' });
                if (at >= 0) { App.refresh(); return; }
                U.whatsapp(S.user(tid).phone, `New service assigned: ${j.id} — ${S.clientName(j.clientId)} on ${S.fmtDate(j.date)} at ${S.fmtTime(j.slot)}.`, 'Technician notified');
                App.refresh();
              });
            }
          });
          return;
        }
        if (a === 'reschedule') {
          U.modal({
            title: 'Reschedule service', sub: j.id + ' · currently ' + S.fmtDate(j.date) + ' at ' + S.fmtTime(j.slot),
            body: `<div class="grid grid-2">
                ${U.field('New date', `<input class="input" id="rDate" type="date" value="${attr(j.date)}">`)}
                ${U.field('New time', `<select class="select" id="rSlot">${SLOTS.map(s =>
                  `<option value="${attr(s)}"${s === j.slot ? ' selected' : ''}>${esc(S.fmtTime(s))}</option>`).join('')}</select>`)}
              </div>
              <div class="mt-14">${U.field('Reason (goes to the customer)', `<input class="input" id="rWhy" placeholder="e.g. Customer requested a different day">`)}</div>`,
            footer: `<button class="btn btn-ghost" data-close>Cancel</button>
                     <button class="btn btn-primary" data-ok>${ico('calendar')} Reschedule</button>`,
            onMount(mroot, close) {
              U.qs('[data-ok]', mroot).onclick = () => {
                j.date = U.qs('#rDate', mroot).value || j.date;
                j.slot = U.qs('#rSlot', mroot).value;
                S.save(); close(); ctx.refresh();
                U.toast('Rescheduled to ' + S.fmtDate(j.date) + ' at ' + S.fmtTime(j.slot));
                U.whatsapp(cl.phone, `Your service has been rescheduled to ${S.fmtDate(j.date)} at ${S.fmtTime(j.slot)}. ${U.qs('#rWhy', mroot).value || ''}`.trim(), 'Customer informed');
                App.refresh();
              };
            }
          });
        }
      });
    }
  };

  /* ================================================================== list */
  V.jobs = {
    title: 'Services',
    newJob: newJob,
    render: renderList,
    mount(root, ctx) {
      const qi = U.qs('#jq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      const tf = U.qs('#jTech', root);
      if (tf) tf.addEventListener('change', () => { techFilter = tf.value; ctx.refresh(); });

      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-new]')) return newJob();
        if (e.target.closest('[data-act=wa-remind]')) {
          const n = S.jobsOn(Seed.D(1)).length;
          U.whatsapp(n + ' clients', 'Reminder: your pest control service is scheduled tomorrow.', 'Reminders queued for tomorrow\'s ' + n + ' jobs');
          return;
        }
        const go = e.target.closest('[data-go]');
        if (go) location.hash = go.getAttribute('data-go');
      });
    }
  };
})(window);
