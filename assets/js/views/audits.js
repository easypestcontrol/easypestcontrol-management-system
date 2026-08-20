/* ==========================================================================
   View: Audits — site quality, safety compliance and pest trend audits
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'all';

  function score(a) {
    const scored = a.items.filter(i => i.v === 'pass' || i.v === 'fail');
    if (!scored.length) return { pct: 0, pass: 0, fail: 0, na: a.items.filter(i => i.v === 'na').length, total: a.items.length, done: 0 };
    const pass = scored.filter(i => i.v === 'pass').length;
    return {
      pct: Math.round(pass / scored.length * 100),
      pass: pass, fail: scored.length - pass,
      na: a.items.filter(i => i.v === 'na').length,
      total: a.items.length,
      done: a.items.filter(i => i.v).length
    };
  }
  function grade(pct) {
    if (pct >= 90) return { label: 'Excellent', cls: 'b-green', color: 'var(--success-500)' };
    if (pct >= 75) return { label: 'Satisfactory', cls: 'b-blue', color: 'var(--info-500)' };
    if (pct >= 60) return { label: 'Needs improvement', cls: 'b-amber', color: 'var(--warn-500)' };
    return { label: 'Critical', cls: 'b-red', color: 'var(--danger-500)' };
  }

  function newAudit() {
    const types = Object.keys(Seed.AUDIT_TEMPLATES);
    const clients = S.get().clients;
    const staff = S.get().users.filter(u => ['admin', 'ops'].indexOf(u.role) >= 0);

    U.modal({
      title: 'Start a new audit', sub: 'Pick a template — the checklist is loaded automatically',
      body: `${U.field('Audit type', `<select class="select" id="aType">${U.selectOpts(types)}</select>`)}
        <div class="mt-14">${U.field('Customer / site', `<select class="select" id="aClient">${clients.map(c =>
          `<option value="${attr(c.id)}">${esc(c.name)}</option>`).join('')}</select>`)}</div>
        <div class="grid grid-2 mt-14">
          ${U.field('Audit date', `<input class="input" id="aDate" type="date" value="${attr(S.todayISO())}">`)}
          ${U.field('Auditor', `<select class="select" id="aBy">${staff.map(u =>
            `<option value="${attr(u.id)}">${esc(u.name)}</option>`).join('')}</select>`)}
        </div>
        <div class="mt-14" id="aPrev"></div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('clipcheck')} Start audit</button>`,
      onMount(root, close) {
        function prev() {
          const t = U.qs('#aType', root).value;
          const items = Seed.AUDIT_TEMPLATES[t] || [];
          U.qs('#aPrev', root).innerHTML =
            `<div class="flabel mb-8">Checklist (${items.length} points)</div>
             <div class="card" style="max-height:170px;overflow-y:auto;padding:10px 13px">
               ${items.map(x => `<div class="row-top g-8" style="padding:4px 0;font-size:12.5px">
                 ${ico('check', 'brand shrink0', 14)}<span>${esc(x)}</span></div>`).join('')}
             </div>`;
        }
        U.qs('#aType', root).addEventListener('change', prev); prev();

        U.qs('[data-save]', root).onclick = () => {
          const t = U.qs('#aType', root).value;
          const db = S.get();
          db.seq.audit = (db.seq.audit || 100) + 1;
          const cid = U.qs('#aClient', root).value;
          const contract = db.contracts.filter(c => c.clientId === cid)[0];
          const a = {
            id: 'AUD-' + db.seq.audit, type: t, clientId: cid,
            contractId: contract ? contract.id : null, jobId: null,
            date: U.qs('#aDate', root).value || S.todayISO(),
            auditorId: U.qs('#aBy', root).value, status: 'draft',
            items: Seed.AUDIT_TEMPLATES[t].map(x => ({ t: x, v: '', r: '' })),
            remarks: ''
          };
          db.audits.unshift(a); S.save(); close();
          U.toast('Audit ' + a.id + ' started');
          location.hash = '#/audits/' + a.id;
          App.refresh();
        };
      }
    });
  }

  /* ================================================================= detail */
  V.auditsDetail = {
    title: ctx => (S.audit(ctx.id) || {}).id || 'Audit',
    crumb: 'Audits',
    narrow: true,
    render(ctx) {
      const a = S.audit(ctx.id);
      if (!a) return C.backLink('#/audits', 'All audits') +
        U.empty({ icon: 'clipcheck', title: 'Audit not found', text: 'It may have been removed.' });
      const sc = score(a);
      const g = grade(sc.pct);
      const cl = S.client(a.clientId);
      const editable = a.status !== 'completed';

      return C.backLink('#/audits', 'All audits') +
      `<div class="row between wrap g-12 mb-20">
        <div style="min-width:0">
          <div class="row g-8 wrap">
            <h2 class="mono">${esc(a.id)}</h2>
            <span class="badge ${a.status === 'completed' ? 'b-green' : 'b-amber'} badge-lg">${esc(a.status === 'completed' ? 'Completed' : 'In progress')}</span>
          </div>
          <div class="muted t-base mt-4">${esc(a.type)} · ${esc(cl ? cl.name : '—')} · ${esc(S.fmtDate(a.date))}</div>
        </div>
        <div class="row g-8 wrap no-print">
          <button class="btn btn-ghost btn-sm" data-act="print">${ico('printer')} Print</button>
          ${editable ? `<button class="btn btn-primary btn-sm" data-act="complete">${ico('check')} Complete audit</button>`
            : `<button class="btn btn-wa btn-sm" data-act="share">${ico('whatsapp')} Share with customer</button>`}
        </div>
      </div>

      <div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Score', value: sc.pct + '%', icon: 'target', tone: 'i-brand', color: g.color, foot: g.label })}
        ${C.stat({ label: 'Passed', value: sc.pass, icon: 'checkcircle', tone: 'i-green', foot: 'of ' + sc.total + ' checkpoints' })}
        ${C.stat({ label: 'Failed', value: sc.fail, icon: 'xcircle', tone: sc.fail ? 'i-red' : 'i-gray', foot: sc.fail ? 'Corrective action needed' : 'None' })}
        ${C.stat({ label: 'Completed', value: sc.done + '/' + sc.total, icon: 'clipcheck', tone: 'i-blue', foot: 'Checkpoints answered' })}
      </div>

      <div class="grid mb-20 split-wide">
        ${C.sectionCard('Audit details', C.kv([
          ['Audit no.', a.id], ['Type', a.type],
          ['Customer', cl ? cl.name : '—'],
          ['Site', cl ? cl.addr + ', ' + cl.city : '—'],
          a.contractId ? ['Contract', '<a class="brand fw-6" href="#/contracts/' + attr(a.contractId) + '">' + esc(a.contractId) + '</a>', true] : null,
          ['Auditor', S.userName(a.auditorId)],
          ['Date', S.fmtDate(a.date)]
        ]) + `<div class="row center mt-16">${U.ring(sc.pct, 96, g.color)}</div>
             <div class="center-txt mt-8"><span class="badge ${g.cls} badge-lg">${esc(g.label)}</span></div>`)}

        ${C.sectionCard('Checklist',
          `<div>${a.items.map((it, i) => `
            <div class="auditrow">
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-base">${esc(it.t)}</div>
                ${editable
                  ? `<input class="input mt-6" data-remark="${i}" placeholder="Remarks (optional)" value="${attr(it.r)}" style="height:32px;font-size:12.5px">`
                  : (it.r ? `<div class="t-sm muted mt-4">${esc(it.r)}</div>` : '')}
              </div>
              ${editable ? `<div class="scorepick">
                <button class="${it.v === 'pass' ? 'on pass' : ''}" data-set="${i}:pass" title="Pass">${ico('check')}</button>
                <button class="${it.v === 'fail' ? 'on fail' : ''}" data-set="${i}:fail" title="Fail">${ico('x')}</button>
                <button class="${it.v === 'na' ? 'on na' : ''}" data-set="${i}:na" title="Not applicable">${ico('minus')}</button>
              </div>`
              : `<span class="badge ${it.v === 'pass' ? 'b-green' : it.v === 'fail' ? 'b-red' : 'b-gray'}">
                  ${it.v === 'pass' ? 'Pass' : it.v === 'fail' ? 'Fail' : 'N/A'}</span>`}
            </div>`).join('')}</div>`, '', { flush: false })}
      </div>

      ${C.sectionCard('Auditor remarks',
        editable
          ? `<textarea class="textarea" id="aRemarks" placeholder="Overall observations and corrective actions…">${esc(a.remarks)}</textarea>`
          : `<div style="font-size:13.5px;line-height:1.65">${esc(a.remarks || 'No remarks recorded.')}</div>`)}`;
    },
    mount(root, ctx) {
      const a = S.audit(ctx.id);
      if (!a) return;

      root.addEventListener('input', e => {
        const r = e.target.closest('[data-remark]');
        if (r) { a.items[+r.getAttribute('data-remark')].r = r.value; S.save(); }
        const rem = e.target.closest('#aRemarks');
        if (rem) { a.remarks = rem.value; S.save(); }
      });

      root.addEventListener('click', e => {
        const st = e.target.closest('[data-set]');
        if (st) {
          const [i, v] = st.getAttribute('data-set').split(':');
          a.items[+i].v = a.items[+i].v === v ? '' : v;
          S.save(); ctx.refresh(); return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.getAttribute('data-act');
        if (act === 'print') { w.print(); return; }
        if (act === 'share') {
          U.whatsapp((S.client(a.clientId) || {}).phone,
            `Audit report ${a.id} (${a.type}) — score ${score(a).pct}%. Full report attached.`, 'Audit report shared');
          return;
        }
        if (act === 'complete') {
          const sc = score(a);
          if (sc.done < a.items.length) {
            U.toast('Answer all ' + a.items.length + ' checkpoints first', { tone: 'err', sub: sc.done + ' answered so far' });
            return;
          }
          const rem = U.qs('#aRemarks', root);
          if (rem) a.remarks = rem.value;
          a.status = 'completed'; S.save(); ctx.refresh();
          U.toast('Audit completed', { sub: 'Score ' + sc.pct + '% · ' + grade(sc.pct).label });
        }
      });
    }
  };

  /* =================================================================== list */
  V.audits = {
    title: 'Audits',
    render(ctx) {
      const all = S.get().audits;
      const rows = all.filter(a => tab === 'all' || (tab === 'open' ? a.status !== 'completed' : a.status === 'completed'));
      const done = all.filter(a => a.status === 'completed');
      const avg = done.length ? Math.round(done.reduce((s, a) => s + score(a).pct, 0) / done.length) : 0;
      const fails = done.reduce((s, a) => s + score(a).fail, 0);

      return C.pageHead({
        title: 'Audits',
        sub: all.length + ' audits · average score ' + avg + '%',
        actions: `<button class="btn btn-primary btn-sm" data-new>${ico('plus')} New audit</button>`
      }) +

      `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Average score', value: avg + '%', icon: 'target', tone: 'i-brand', color: grade(avg).color, foot: grade(avg).label })}
        ${C.stat({ label: 'Audits completed', value: done.length, icon: 'clipcheck', tone: 'i-green', foot: all.length + ' total raised' })}
        ${C.stat({ label: 'Open non-conformities', value: fails, icon: 'alert', tone: fails ? 'i-red' : 'i-gray', foot: 'Failed checkpoints' })}
        ${C.stat({ label: 'In progress', value: all.length - done.length, icon: 'edit', tone: 'i-amber', foot: 'Awaiting completion' })}
      </div>

      ${C.tabsBar([
        { id: 'all', label: 'All', n: all.length },
        { id: 'open', label: 'In progress', n: all.length - done.length },
        { id: 'done', label: 'Completed', n: done.length }
      ], tab)}

      <div class="mt-20">${rows.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(305px,1fr))">
        ${rows.map(a => {
          const sc = score(a);
          const g = grade(sc.pct);
          const cl = S.client(a.clientId);
          return `<a class="card card-int" href="#/audits/${a.id}" style="padding:16px;display:block">
            <div class="row between g-10 mb-12">
              <span class="badge b-gray">${esc(a.type)}</span>
              <span class="badge ${a.status === 'completed' ? 'b-green' : 'b-amber'}">${esc(a.status === 'completed' ? 'Completed' : 'In progress')}</span>
            </div>
            <div class="row g-12 mb-12">
              ${a.status === 'completed' ? U.ring(sc.pct, 54, g.color)
                : `<div class="tile-ico lg i-amber" style="width:54px;height:54px;border-radius:50%">${ico('edit', '', 22)}</div>`}
              <div class="grow" style="min-width:0">
                <div class="truncate fw-7 t-md">${esc(cl ? cl.name : '—')}</div>
                <div class="t-sm muted mono">${esc(a.id)} · ${esc(S.fmtDate(a.date))}</div>
                ${a.status === 'completed' ? `<span class="badge ${g.cls} mt-6">${esc(g.label)}</span>`
                  : `<div class="t-sm muted mt-4">${sc.done} of ${sc.total} checkpoints done</div>`}
              </div>
            </div>
            <div class="row between g-8" style="padding-top:11px;border-top:1px solid var(--line)">
              ${C.userCell(a.auditorId, 'Auditor')}
              ${sc.fail ? `<span class="badge b-red">${sc.fail} failed</span>` : `<span class="t-sm muted">No issues</span>`}
            </div>
          </a>`;
        }).join('')}
      </div>` : U.empty({ icon: 'clipcheck', title: 'No audits here', text: 'Start one to check service quality, safety or pest trends.' })}</div>`;
    },
    mount(root, ctx) {
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-new]')) newAudit();
      });
    }
  };
})(window);
