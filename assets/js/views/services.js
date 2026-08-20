/* ==========================================================================
   View: Service Catalogue — the answer to "what services do you provide?"
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let cat = 'All';
  let query = '';

  const CATS = ['All', 'Residential', 'Commercial', 'Industrial', 'Specialised'];
  const MAX_PDF_KB = 1500;   // one sheet; localStorage holds about 5 MB in total
  const CAT_TONE = { Residential: 'i-brand', Commercial: 'i-blue', Industrial: 'i-amber', Specialised: 'i-violet' };
  const CAT_BADGE = { Residential: 'b-brand', Commercial: 'b-blue', Industrial: 'b-amber', Specialised: 'b-violet' };

  /** Only admin and ops maintain the catalogue; everyone else reads it. */
  function mayEdit() {
    const me = S.me();
    return !!me && ['admin', 'ops'].indexOf(me.role) >= 0;
  }

  function usageOf(sid) {
    return S.get().jobs.filter(j => (j.serviceIds || []).indexOf(sid) >= 0).length;
  }

  /** Everything already pointing at this service — a delete would orphan it. */
  function referencesTo(sid) {
    const db = S.get();
    const out = [];
    const jobs = db.jobs.filter(j => (j.serviceIds || []).indexOf(sid) >= 0).length;
    const contracts = db.contracts.filter(c => (c.serviceIds || []).indexOf(sid) >= 0).length;
    const quotes = db.quotations.filter(q => (q.items || []).some(i => i.svId === sid)).length;
    const leads = db.leads.filter(l => (l.interest || []).indexOf(sid) >= 0).length;
    if (jobs) out.push(jobs + ' job' + (jobs === 1 ? '' : 's'));
    if (contracts) out.push(contracts + ' contract' + (contracts === 1 ? '' : 's'));
    if (quotes) out.push(quotes + ' quotation' + (quotes === 1 ? '' : 's'));
    if (leads) out.push(leads + ' lead' + (leads === 1 ? '' : 's'));
    return out;
  }

  /**
   * A service on a service or contract cannot be removed — those records name it,
   * and dropping it would leave them pointing at nothing. Retire it by editing
   * instead, exactly like a branch that still has staff posted to it.
   */
  function removeService(s, ctx) {
    const used = referencesTo(s.id);
    if (used.length) {
      U.toast('Cannot remove ' + s.name, {
        tone: 'err',
        sub: 'Still used by ' + used.join(', ') + ' — edit it instead of deleting'
      });
      return;
    }
    U.confirm({
      title: 'Remove ' + s.name + '?',
      message: 'It disappears from the catalogue, from quotation line items and from the lead capture list.' +
        (s.pdf ? ' Its information sheet is deleted too.' : ''),
      confirmText: 'Remove', tone: 'danger'
    }).then(ok => {
      if (!ok) return;
      const db = S.get();
      db.services = db.services.filter(x => x.id !== s.id);
      S.save();
      ctx.refresh();
      U.toast('Service removed', { sub: s.name });
    });
  }

  function detail(s) {
    const chems = (s.chem || []).map(S.item).filter(Boolean);
    U.modal({
      title: s.name, sub: s.cat + ' · code ' + s.code, size: 'md',
      body: `<div class="row g-8 wrap mb-16">
          <span class="badge ${CAT_BADGE[s.cat]} badge-lg">${esc(s.cat)}</span>
          <span class="badge b-gray badge-lg">${ico('timer')}${esc(s.mins)} min</span>
          <span class="badge b-green badge-lg">${ico('shieldcheck')}${esc(s.warranty)} warranty</span>
          <span class="badge b-brand badge-lg">${ico('rupee')}${S.money(s.price)} ${esc(s.unit)}</span>
        </div>
        <div class="card card-pad mb-16" style="background:var(--surface-2);font-size:13.5px;line-height:1.65">${esc(s.desc)}</div>
        ${C.kv([
          ['Service code', s.code],
          ['Category', s.cat],
          ['Standard rate', S.money(s.price) + ' ' + s.unit],
          ['Typical duration', S.durationText(s.mins)],
          ['Warranty offered', s.warranty],
          ['Normally done', s.defaultFreq || 'Monthly'],
          ['Times delivered', usageOf(s.id) + ' jobs']
        ])}

        ${(s.checklist || []).length ? `<div class="mt-16">
          <div class="flabel mb-8">On-site checklist · ${s.checklist.length} items</div>
          <div class="card card-pad" style="background:var(--surface-2)">
            <div class="col g-7">${s.checklist.map(x => `<div class="row g-8 t-base" style="color:var(--ink-2)">
              ${ico('checkcircle', '', 15)}<span>${esc(x)}</span></div>`).join('')}</div>
          </div>
        </div>` : ''}
        <div class="mt-16">
          <div class="flabel mb-8">Service information sheet</div>
          ${s.pdf ? `<div class="row g-10 card" style="padding:11px 13px">
              <div class="tile-ico i-red" style="width:32px;height:32px">${ico('filetext', '', 16)}</div>
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-base truncate">${esc(s.pdf.name)}</div>
                <div class="t-sm muted">PDF · ${esc(U.fileSizeText(s.pdf.size))} · attached to every quotation containing this service</div>
              </div>
              <button class="btn btn-ghost btn-sm nowrap" data-getpdf>${ico('download')} Download</button>
            </div>`
            : `<div class="banner ban-amber">${ico('alert')}<div>No sheet attached. Quotations that include this service will go out without its information PDF.</div></div>`}
        </div>

        ${chems.length ? `<div class="mt-16">
          <div class="flabel mb-8">Chemicals used</div>
          ${chems.map(c => `<div class="row g-10 card mb-8" style="padding:10px 12px">
            <div class="tile-ico i-brand" style="width:30px;height:30px">${ico('flask', '', 15)}</div>
            <div class="grow" style="min-width:0"><div class="fw-6 t-base truncate">${esc(c.name)}</div>
            <div class="t-sm muted">${esc(c.ai)}</div></div>
            <span class="badge b-gray">${esc(c.cib || '—')}</span>
          </div>`).join('')}
        </div>` : ''}`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>
               ${mayEdit() ? `<button class="btn btn-soft" data-edit>${ico('pen')} Edit service</button>` : ''}
               <button class="btn btn-primary" data-quote>${ico('filetext')} Quote this service</button>`,
      onMount(root, close) {
        U.qs('[data-quote]', root).onclick = () => {
          close();
          if (V.quotations) V.quotations.newQuote({ serviceIds: [s.id] });
        };
        const ed = U.qs('[data-edit]', root);
        if (ed) ed.onclick = () => { close(); editor(s); };
        const dl = U.qs('[data-getpdf]', root);
        if (dl) dl.onclick = () => U.download(s.pdf.name, s.pdf.data);
      }
    });
  }

  function editor(existing) {
    const s = existing || {};
    U.modal({
      title: existing ? 'Edit service' : 'Add service', size: 'md',
      body: `<div class="grid grid-2">
          ${U.field('Service name', `<input class="input" id="sName" value="${attr(s.name || '')}">`, '', true)}
          ${U.field('Short code', `<input class="input" id="sCode" value="${attr(s.code || '')}" placeholder="e.g. GPC">`)}
          ${U.field('Category', `<select class="select" id="sCat">${U.selectOpts(CATS.slice(1), null, null, s.cat || 'Residential')}</select>`)}
          ${U.field('Standard rate (₹)', `<input class="input" id="sPrice" type="number" step="100" value="${attr(s.price || 1500)}">`)}
          ${U.field('Charged', `<input class="input" id="sUnit" value="${attr(s.unit || 'per visit')}">`)}
          ${U.field('Duration (minutes)', `<input class="input" id="sMins" type="number" step="15" value="${attr(s.mins || 60)}">`)}
          ${U.field('Warranty', `<input class="input" id="sWar" value="${attr(s.warranty || '3 months')}">`)}
          ${U.field('Normally done', `<select class="select" id="sFreq">${U.selectOpts(Seed.FREQS, null, null, s.defaultFreq || 'Monthly')}</select>`,
            'The interval a new contract starts from.')}
        </div>
        <div class="mt-14">${U.field('What the service covers', `<textarea class="textarea" id="sDesc">${esc(s.desc || '')}</textarea>`)}</div>
        <div class="mt-14">${U.field('On-site checklist — one item per line',
          `<textarea class="textarea" id="sList" style="min-height:132px;font-size:13px;line-height:1.6"
            placeholder="All numbered bait stations located and opened&#10;Bait consumption recorded station by station">${esc((s.checklist || []).join('\n'))}</textarea>`,
          'The technician has to tick every line before a visit can be finished. A visit covering several services gets all their checklists.')}</div>
        <div class="mt-14">${U.field('Service information sheet (PDF)',
          `<div id="sPdfBox"></div>
           <label class="btn btn-soft btn-sm mt-8" style="cursor:pointer">
             ${ico('upload')} Choose PDF
             <input type="file" accept="application/pdf,.pdf" id="sPdfIn" hidden>
           </label>`,
          'Sent to the customer automatically with any quotation that includes this service. Up to ' + MAX_PDF_KB / 1000 + ' MB.')}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} Save</button>`,
      onMount(root, close) {
        let pdf = s.pdf ? { name: s.pdf.name, size: s.pdf.size, data: s.pdf.data } : null;

        function renderPdf() {
          U.qs('#sPdfBox', root).innerHTML = pdf
            ? `<div class="row g-10 card" style="padding:10px 12px">
                 <div class="tile-ico i-red" style="width:30px;height:30px">${ico('filetext', '', 15)}</div>
                 <div class="grow" style="min-width:0">
                   <div class="fw-6 t-base truncate">${esc(pdf.name)}</div>
                   <div class="t-sm muted">${esc(U.fileSizeText(pdf.size))}</div>
                 </div>
                 <button class="iconbtn" type="button" data-rmpdf title="Remove">${ico('trash', '', 15)}</button>
               </div>`
            : `<div class="t-sm muted">No sheet attached yet.</div>`;
        }
        renderPdf();

        U.qs('#sPdfIn', root).addEventListener('change', function () {
          const f = this.files && this.files[0];
          this.value = '';
          if (!f) return;
          if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
            U.toast('That is not a PDF', { tone: 'err', sub: 'Choose a .pdf file' });
            return;
          }
          const kb = Math.round(f.size / 1024);
          if (kb > MAX_PDF_KB) {
            U.toast('PDF is too large', { tone: 'err', sub: U.fileSizeText(f.size) + ' — keep it under ' + (MAX_PDF_KB / 1000) + ' MB' });
            return;
          }
          if (S.storageWouldOverflow(kb * 1.37)) {
            U.toast('Not enough browser storage left', { tone: 'err',
              sub: 'Using ' + S.storageUse().pct + '% of the 5 MB limit — remove a sheet or a photo first' });
            return;
          }
          U.fileToDataUrl(f).then(data => {
            pdf = { name: f.name, size: f.size, data: data };
            renderPdf();
            U.toast('Sheet attached', { sub: f.name + ' · ' + U.fileSizeText(f.size) });
          });
        });

        root.addEventListener('click', e => {
          if (e.target.closest('[data-rmpdf]')) { pdf = null; renderPdf(); }
        });

        U.qs('[data-save]', root).onclick = () => {
          const name = U.qs('#sName', root).value.trim();
          if (!name) { U.toast('Service name is required', { tone: 'err' }); return; }
          const db = S.get();
          const rec = existing || { id: 'SV' + String(db.services.length + 1).padStart(2, '0'), chem: [] };
          rec.name = name;
          rec.code = U.qs('#sCode', root).value.trim() || name.slice(0, 3).toUpperCase();
          rec.cat = U.qs('#sCat', root).value;
          rec.price = parseFloat(U.qs('#sPrice', root).value) || 0;
          rec.unit = U.qs('#sUnit', root).value.trim();
          rec.mins = parseInt(U.qs('#sMins', root).value, 10) || 60;
          rec.warranty = U.qs('#sWar', root).value.trim();
          rec.desc = U.qs('#sDesc', root).value.trim();
          rec.defaultFreq = U.qs('#sFreq', root).value;
          rec.checklist = U.qs('#sList', root).value.split('\n').map(x => x.trim()).filter(Boolean);
          rec.pdf = pdf;
          if (!existing) db.services.push(rec);
          S.save(); close(); App.refresh();
          U.toast(existing ? 'Service updated' : 'Service added', { sub: rec.name });
        };
      }
    });
  }

  V.services = {
    title: 'Service Catalogue',
    render(ctx) {
      const q = query.toLowerCase();
      const rows = S.get().services.filter(s =>
        (cat === 'All' || s.cat === cat) &&
        (!q || (s.name + s.code + s.desc).toLowerCase().indexOf(q) >= 0));
      const canEdit = ['admin', 'ops'].indexOf(ctx.role) >= 0;

      return C.pageHead({
        title: 'Service Catalogue',
        sub: S.get().services.length + ' services · ' +
             S.get().services.filter(x => (x.checklist || []).length).length + ' with a checklist · ' +
             S.get().services.filter(x => x.pdf).length + ' with an information sheet',
        actions: `<button class="btn btn-ghost btn-sm" data-act="share">${ico('whatsapp')} Send list to customer</button>
                  ${canEdit ? `<button class="btn btn-primary btn-sm" data-new>${ico('plus')} Add service</button>` : ''}`
      }) +
      C.searchRow('Search services…',
        `<div class="row g-6 wrap">${CATS.map(c =>
          `<button class="chip ${cat === c ? 'on' : ''}" data-cat="${attr(c)}">${esc(c)}</button>`).join('')}</div>`, 'sq') +

      (rows.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(292px,1fr))">
        ${rows.map(s => `<div class="card card-int" style="padding:16px" data-svc="${attr(s.id)}">
          <div class="row between g-10 mb-10">
            <div class="tile-ico lg ${CAT_TONE[s.cat]}">${ico('spray')}</div>
            <div class="row g-6">
              <span class="badge ${CAT_BADGE[s.cat]}">${esc(s.cat)}</span>
              ${canEdit ? `<button class="iconbtn" style="width:28px;height:28px" data-edit="${attr(s.id)}" title="Edit service">${ico('pen', '', 14)}</button>
              <button class="iconbtn" style="width:28px;height:28px" data-del="${attr(s.id)}" title="Remove service">${ico('trash', '', 14)}</button>` : ''}
            </div>
          </div>
          <div class="fw-7" style="font-size:14.5px;letter-spacing:-.015em">${esc(s.name)}</div>
          <div class="t-sm muted mono mt-2">${esc(s.code)}</div>
          <div class="t-sm muted clamp-2 mt-8" style="line-height:1.55;min-height:36px">${esc(s.desc)}</div>
          <div class="row g-8 wrap mt-12">
            <span class="badge b-gray">${ico('timer')}${esc(S.durationText(s.mins))}</span>
            <span class="badge b-green">${ico('shieldcheck')}${esc(s.warranty)}</span>
            <span class="badge b-blue">${ico('calcheck')}${esc(s.defaultFreq || 'Monthly')}</span>
            ${(s.checklist || []).length ? `<span class="badge b-violet">${ico('clipcheck')}${s.checklist.length}</span>` : ''}
            ${s.pdf ? `<span class="badge b-red" title="${attr(s.pdf.name)}">${ico('filetext')}Sheet</span>` : ''}
          </div>
          <div class="row between g-8 mt-12" style="padding-top:12px;border-top:1px solid var(--line)">
            <div><div class="fw-7" style="font-size:17px;letter-spacing:-.02em">${S.money(s.price)}</div>
            <div class="t-xs muted">${esc(s.unit)}</div></div>
            <span class="t-sm muted">${usageOf(s.id)} services</span>
          </div>
        </div>`).join('')}
      </div>` : U.empty({ icon: 'spray', title: 'No services match', text: 'Try another category or search term.' }));
    },
    mount(root, ctx) {
      const qi = U.qs('#sq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        const cb = e.target.closest('[data-cat]');
        if (cb) { cat = cb.getAttribute('data-cat'); ctx.refresh(); return; }
        if (e.target.closest('[data-new]')) return editor(null);

        // These sit inside the card, so they have to be caught before it.
        const ed = e.target.closest('[data-edit]');
        if (ed) return editor(S.service(ed.getAttribute('data-edit')));

        const del = e.target.closest('[data-del]');
        if (del) return removeService(S.service(del.getAttribute('data-del')), ctx);

        if (e.target.closest('[data-act=share]')) {
          U.whatsapp('Customer', 'Here is our full service list with rates — ' + S.get().services.length + ' services covering residential, commercial and specialised treatment.', 'Service catalogue sent');
          return;
        }
        const sc = e.target.closest('[data-svc]');
        if (sc) detail(S.service(sc.getAttribute('data-svc')));
      });
    }
  };
})(window);
