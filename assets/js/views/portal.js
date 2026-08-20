/* ==========================================================================
   View: Customer Portal — what the customer sees ("trackable for all customers")
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  function myClient(ctx) { return S.client(ctx.me.clientId) || S.get().clients[0]; }

  function contractsOf(c) { return S.get().contracts.filter(x => x.clientId === c.id); }
  function jobsOf(c) { return S.jobsForClient(c.id); }
  function invoicesOf(c) { return S.get().invoices.filter(i => i.clientId === c.id); }

  /* --------------------------------------------------------- report modal */
  function showReport(j) {
    const x = j.exec || {};
    U.modal({
      title: 'Service report', sub: j.id + ' · ' + S.fmtDate(j.date), size: 'lg',
      body: `<div class="row g-8 wrap mb-16">
          ${C.jobType(j)}
          <span class="badge b-green badge-lg">${ico('checkcircle')}Completed</span>
          <span class="badge b-gray badge-lg">${ico('timer')}${esc(S.durationText(x.durationMins))}</span>
          ${x.rating ? `<span class="badge b-amber badge-lg">${ico('star')}${x.rating} / 5</span>` : ''}
        </div>
        ${C.kv([
          ['Service', S.jobTitle(j)],
          ['Date', S.fmtLong(j.date)],
          ['Technician', S.userName((j.techIds || [])[0])],
          ['Arrived', S.fmtTime((x.checkinAt || '').slice(-5))],
          ['Completed', S.fmtTime((x.finishedAt || '').slice(-5))],
          ['Signed by', x.signedBy || '—']
        ])}
        <div class="grid grid-2 mt-16">
          <div><div class="flabel mb-8">Before</div>
            <div class="photogrid">${(x.photosBefore || []).map(p =>
              `<div class="photo"><img src="${attr(p)}" data-zoom="${attr(p)}" alt="Before"></div>`).join('') || '<div class="t-sm muted">—</div>'}</div></div>
          <div><div class="flabel mb-8">After</div>
            <div class="photogrid">${(x.photosAfter || []).map(p =>
              `<div class="photo"><img src="${attr(p)}" data-zoom="${attr(p)}" alt="After"></div>`).join('') || '<div class="t-sm muted">—</div>'}</div></div>
        </div>
        ${(x.findings || []).length ? `<div class="mt-16"><div class="flabel mb-8">What we found</div>
          <div class="row g-6 wrap">${x.findings.map(f =>
            `<span class="badge ${f.indexOf('No activity') === 0 ? 'b-green' : 'b-amber'} badge-lg">${ico('bug')}${esc(f)}</span>`).join('')}</div></div>` : ''}
        ${x.observations ? `<div class="mt-16"><div class="flabel mb-6">Technician notes</div>
          <div class="card card-pad" style="background:var(--surface-2);font-size:13px;line-height:1.65">${esc(x.observations)}</div></div>` : ''}
        ${(x.chemicals || []).length ? `<div class="mt-16"><div class="flabel mb-8">Chemicals used</div>
          ${x.chemicals.map(c => {
            const it = S.item(c.id) || {};
            return `<div class="row g-10 card mb-8" style="padding:10px 12px">
              <div class="tile-ico i-brand" style="width:30px;height:30px">${ico('flask', '', 15)}</div>
              <div class="grow" style="min-width:0"><div class="fw-6 t-base truncate">${esc(it.name)}</div>
              <div class="t-sm muted">${esc(it.ai || '')} · ${esc(it.cib || '')}</div></div>
              <span class="fw-6 nowrap">${c.qty} ${esc(it.unit || '')}</span>
            </div>`;
          }).join('')}</div>` : ''}`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>
               <button class="btn btn-primary" data-dl>${ico('download')} Download PDF</button>`,
      onMount(root, close) {
        root.addEventListener('click', e => {
          const z = e.target.closest('[data-zoom]');
          if (z) U.lightbox(z.getAttribute('data-zoom'));
          if (e.target.closest('[data-dl]')) { U.toast('Report downloaded', { sub: j.id + '-service-report.pdf' }); close(); }
        });
      }
    });
  }

  function showInvoice(inv) {
    const t = S.invoiceTotals(inv);
    const co = S.get().company;
    U.modal({
      title: 'Invoice ' + inv.id, sub: inv.period, size: 'md',
      body: `<div class="row between g-10 mb-16">
          <span class="badge ${S.INV_STATUS[inv.status].cls} badge-lg">${esc(S.INV_STATUS[inv.status].label)}</span>
          <span class="t-xl fw-7">${S.money(t.total)}</span>
        </div>
        ${C.kv([
          ['Invoice date', S.fmtDate(inv.date)],
          ['Due date', S.fmtDate(inv.due)],
          ['Period', inv.period],
          ['Taxable value', S.money(t.sub)],
          ...S.taxRows(t).map(r => [r[0], S.money(r[1])]),
          ['Total', S.money(t.total)],
          ['Paid', S.money(t.paid)],
          ['Balance', S.money(t.balance)]
        ])}
        <div class="mt-16">
          <div class="flabel mb-8">Items</div>
          ${inv.items.map(i => `<div class="row between card mb-8" style="padding:11px 12px">
            <span class="t-base truncate">${esc(i.name)}</span>
            <span class="fw-6 nowrap">${S.money(i.qty * i.rate)}</span></div>`).join('')}
        </div>
        ${t.balance > 0 ? `<div class="banner ban-brand mt-16">${ico('rupee')}
          <div><div class="bt">Pay via UPI</div>${esc(co.upi)} · or bank transfer to ${esc(co.bank.ac)} (${esc(co.bank.ifsc)})</div></div>` : ''}`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>
               ${t.balance > 0 ? `<button class="btn btn-primary" data-pay>${ico('card')} Pay ${S.money(t.balance)}</button>`
                 : `<button class="btn btn-ghost" data-dl>${ico('download')} Download</button>`}`,
      onMount(root, close) {
        root.addEventListener('click', e => {
          if (e.target.closest('[data-pay]')) {
            U.toast('Redirecting to payment gateway', { sub: 'UPI · ' + S.money(t.balance) + ' to ' + co.upi });
            close();
          }
          if (e.target.closest('[data-dl]')) { U.toast('Invoice downloaded', { sub: inv.id + '.pdf' }); close(); }
        });
      }
    });
  }

  /* =============================================================== Overview */
  V.portal = {
    title: 'Overview',
    narrow: true,
    render(ctx) {
      const c = myClient(ctx);
      const contracts = contractsOf(c);
      const live = contracts.filter(x => S.contractStatus(x).key !== 'expired');
      const jobs = jobsOf(c);
      const done = jobs.filter(j => j.status === 'completed');
      const next = jobs.filter(j => j.status !== 'completed' && S.dayDelta(j.date) >= 0)
        .sort((a, b) => a.date < b.date ? -1 : 1)[0];
      const invs = invoicesOf(c);
      invs.forEach(S.syncInvoiceStatus);
      const due = invs.reduce((s, i) => s + S.invoiceTotals(i).balance, 0);
      const rated = done.filter(j => j.exec && j.exec.rating);

      return `<div class="portal-hero mb-20">
        <div class="row between g-12 wrap">
          <div style="min-width:0">
            <div style="font-size:12px;color:rgba(255,255,255,.72);font-weight:550">Welcome back</div>
            <div style="font-size:22px;font-weight:700;letter-spacing:-.02em" class="truncate">${esc(c.name)}</div>
            <div style="font-size:13px;color:rgba(255,255,255,.76);margin-top:3px">${esc(c.area)} · ${esc(c.addr)}</div>
          </div>
          ${live.length ? `<span class="badge badge-lg" style="background:rgba(255,255,255,.18);color:#fff">${ico('shieldcheck')}Protected under AMC</span>` : ''}
        </div>
        <div class="tech-metrics" style="grid-template-columns:repeat(3,1fr)">
          <div class="tech-metric"><div class="v">${done.length}</div><div class="k">Services done</div></div>
          <div class="tech-metric"><div class="v">${live.length}</div><div class="k">Active contracts</div></div>
          <div class="tech-metric"><div class="v">${rated.length ? (rated.reduce((s, j) => s + j.exec.rating, 0) / rated.length).toFixed(1) : '—'}</div><div class="k">Your rating</div></div>
        </div>
      </div>

      ${next ? `<div class="card mb-20" style="border-color:var(--brand-300)">
        <div class="card-bd">
          <div class="row between g-10 mb-10">
            <span class="badge b-brand badge-lg">${ico('calcheck')}Next scheduled visit</span>
            <span class="badge b-gray">${esc(S.relDay(next.date))}</span>
          </div>
          <div class="fw-7" style="font-size:17px">${esc(S.jobTitle(next))}</div>
          <div class="t-base muted mt-2">${esc(S.fmtLong(next.date))} at ${esc(S.fmtTime(next.slot))}</div>
          <div class="row g-11 mt-14" style="padding-top:13px;border-top:1px solid var(--line)">
            ${(next.techIds || []).length ? U.avatar(S.user(next.techIds[0]), 'av-sm') : `<div class="tile-ico i-gray">${ico('user')}</div>`}
            <div class="grow"><div class="fw-6 t-base">${esc(S.userName((next.techIds || [])[0]))}</div>
            <div class="t-sm muted">Assigned technician</div></div>
            <button class="btn btn-ghost btn-sm" data-act="reschedule">${ico('calendar')} Request change</button>
          </div>
        </div>
      </div>` : ''}

      ${due > 0 ? `<div class="banner ban-amber mb-20">${ico('receipt')}
        <div><div class="bt">${S.money(due)} outstanding</div>
        You have ${invs.filter(i => i.status !== 'paid').length} unpaid invoice(s).
        <a href="#/portal-invoices" class="brand fw-6">View and pay →</a></div></div>` : ''}

      <div class="grid grid-2 mb-20">
        ${C.sectionCard('My contracts',
          live.length ? `<div class="col g-12">${live.map(x => {
            const p = S.contractProgress(x);
            return `<a class="row g-12 card" href="#/portal-contracts" style="padding:12px">
              ${U.ring(p.pct, 48)}
              <div class="grow" style="min-width:0">
                <div class="fw-6 t-base truncate">${esc(x.serviceIds.map(S.svcName).join(' + '))}</div>
                <div class="t-sm muted">${esc(S.planSummary(x, true))} · ${p.done} of ${p.total} visits done</div>
                <div class="t-sm muted">Valid till ${esc(S.fmtDate(x.end))}</div>
              </div>${ico('cright', 'muted-2', 16)}
            </a>`;
          }).join('')}</div>`
          : `<div class="t-sm muted">No active contract. <a href="#/portal-request" class="brand fw-6">Request a service →</a></div>`)}

        ${C.sectionCard('Recent service reports',
          done.length ? `<div class="col g-10">${done.slice(0, 4).map(j => `
            <button class="row g-11 card" data-report="${attr(j.id)}" style="padding:11px;text-align:left;width:100%">
              ${(j.exec.photosAfter || [])[0]
                ? `<img src="${attr(j.exec.photosAfter[0])}" style="width:42px;height:42px;border-radius:8px;object-fit:cover">`
                : `<div class="tile-ico i-gray">${ico('image')}</div>`}
              <div class="grow" style="min-width:0">
                <div class="truncate fw-6 t-base">${esc(S.jobTitle(j))}</div>
                <div class="t-sm muted">${esc(S.fmtDate(j.date))} · ${esc(S.userName(j.techIds[0]))}</div>
              </div>${ico('cright', 'muted-2', 16)}
            </button>`).join('')}</div>`
          : `<div class="t-sm muted">No completed visits yet.</div>`,
          `<a href="#/portal-visits" class="btn btn-ghost btn-sm">All ${ico('cright')}</a>`)}
      </div>

      <div class="grid grid-2">
        ${C.sectionCard('Need something?',
          `<div class="col g-10">
            <a class="btn btn-primary btn-block" href="#/portal-request">${ico('plus')} Request a service</a>
            <button class="btn btn-ghost btn-block" data-act="wa">${ico('whatsapp')} Chat with our team</button>
            <a class="btn btn-ghost btn-block" href="tel:${attr(S.get().company.phone)}">${ico('phone')} Call ${esc(S.get().company.phone)}</a>
          </div>`)}
        ${C.sectionCard('Your service provider', C.kv([
          ['Company', S.get().company.name],
          ['Licence', S.get().company.licence],
          ['GSTIN', S.get().company.gstin],
          ['Phone', S.get().company.phone],
          ['Email', S.get().company.email]
        ]))}
      </div>`;
    },
    mount(root, ctx) { bindPortal(root, ctx); }
  };

  /* ============================================================== Contracts */
  V['portal-contracts'] = {
    title: 'My Contracts',
    narrow: true,
    render(ctx) {
      const c = myClient(ctx);
      const contracts = contractsOf(c);
      if (!contracts.length) return C.pageHead({ title: 'My Contracts' }) +
        U.empty({ icon: 'shield', title: 'No contracts yet', text: 'Request a service and we will send you a proposal.' });

      return C.pageHead({ title: 'My Contracts', sub: contracts.length + ' contract(s) on file' }) +
        contracts.map(x => {
          const p = S.contractProgress(x);
          const st = S.contractStatus(x);
          return `<div class="card mb-16">
            <div class="card-hd">
              <div class="grow"><h3>${esc(x.serviceIds.map(S.svcName).join(' + '))}</h3>
                <div class="t-sm muted mono">${esc(x.id)}</div></div>
              ${C.contractPill(x)}
            </div>
            <div class="card-bd">
              <div class="row g-16 wrap mb-16">
                ${U.ring(p.pct, 72)}
                <div class="grow" style="min-width:150px">
                  <div class="t-sm muted">Visits completed</div>
                  <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">${p.done} <span class="muted" style="font-size:15px;font-weight:500">of ${p.total}</span></div>
                  <div class="t-sm muted mt-4">${esc(S.planSummary(x))} · valid till ${esc(S.fmtDate(x.end))}</div>
                </div>
              </div>
              ${C.kv([
                ['Contract period', S.fmtDate(x.start) + ' → ' + S.fmtDate(x.end)],
                ['Services covered', x.serviceIds.map(S.svcName).join(', ')],
                ['Site', x.site],
                ['Scope', x.scope]
              ])}
              <div class="mt-16">
                <div class="flabel mb-10">Visit schedule</div>
                <div class="tablewrap"><table class="tbl" style="min-width:0">
                  <thead><tr><th>#</th><th>Date</th><th>Technician</th><th>Status</th><th></th></tr></thead>
                  <tbody>${p.jobs.map(j => `<tr${j.status === 'completed' ? ' class="clickable" data-report="' + attr(j.id) + '"' : ''}>
                    <td class="muted fw-6">${j.visitNo || '—'}</td>
                    <td><div class="fw-6 t-base">${esc(S.fmtDate(j.date))}</div>
                        <div class="t-sm muted">${esc(S.fmtTime(j.slot))}</div></td>
                    <td class="t-base">${esc(S.userName((j.techIds || [])[0]))}</td>
                    <td>${C.jobStatus(j)}</td>
                    <td class="tight">${j.status === 'completed' ? `<span class="badge b-gray">${ico('eye')}Report</span>` : ''}</td>
                  </tr>`).join('')}</tbody>
                </table></div>
              </div>
            </div>
            ${st.key === 'expiring' ? `<div class="card-ft">
              <div class="row between g-10 wrap">
                <span class="t-base warn fw-6">${ico('alert')} Expires in ${S.dayDelta(x.end)} days</span>
                <button class="btn btn-primary btn-sm" data-act="renew">${ico('refresh')} Request renewal</button>
              </div></div>` : ''}
          </div>`;
        }).join('');
    },
    mount(root, ctx) { bindPortal(root, ctx); }
  };

  /* ================================================================= Visits */
  V['portal-visits'] = {
    title: 'Service History',
    narrow: true,
    render(ctx) {
      const c = myClient(ctx);
      const jobs = jobsOf(c);
      const done = jobs.filter(j => j.status === 'completed');
      const upcoming = jobs.filter(j => j.status !== 'completed' && S.dayDelta(j.date) >= 0)
        .sort((a, b) => a.date < b.date ? -1 : 1);

      return C.pageHead({ title: 'Service History', sub: done.length + ' completed visits with full photo proof' }) +

      (upcoming.length ? `<div class="mb-20">${C.sectionCard('Upcoming visits',
        `<div style="margin:-11px 0">${upcoming.slice(0, 4).map(j => `
          <div class="row g-12" style="padding:11px 4px;border-bottom:1px solid var(--line)">
            <div style="width:52px;flex-shrink:0;text-align:center">
              <div class="fw-7" style="font-size:13.5px">${esc(S.timeParts(j.slot).hh)}</div>
              <div class="t-xs muted fw-6">${esc(S.timeParts(j.slot).ap)}</div>
            </div>
            <div class="grow" style="min-width:0">
              <div class="truncate fw-6 t-base">${esc(S.jobTitle(j))}</div>
              <div class="truncate t-sm muted">${esc(S.fmtDay(j.date))} · ${esc(S.userName((j.techIds || [])[0]))}</div>
            </div>
            ${C.jobStatus(j)}
          </div>`).join('')}</div>`)}</div>` : '') +

      (done.length ? `<div class="col g-12">${done.map(j => {
        const x = j.exec || {};
        return `<button class="card card-int" data-report="${attr(j.id)}" style="padding:14px;text-align:left;width:100%;display:block">
          <div class="row between g-10 mb-10">
            <div class="row g-8 wrap">${C.jobType(j)}<span class="badge b-green">${ico('checkcircle')}Completed</span></div>
            <span class="t-sm muted nowrap">${esc(S.fmtDate(j.date))}</span>
          </div>
          <div class="fw-7" style="font-size:14.5px">${esc(S.jobTitle(j))}</div>
          <div class="t-sm muted mt-2">By ${esc(S.userName((j.techIds || [])[0]))} · ${esc(S.durationText(x.durationMins))} on site</div>
          ${(x.findings || []).length ? `<div class="row g-5 wrap mt-10">${x.findings.map(f =>
            `<span class="badge ${f.indexOf('No activity') === 0 ? 'b-green' : 'b-amber'}">${esc(f)}</span>`).join('')}</div>` : ''}
          <div class="row between g-10 mt-12" style="padding-top:12px;border-top:1px solid var(--line)">
            <div class="row g-6">
              ${((x.photosBefore || []).concat(x.photosAfter || [])).slice(0, 4).map(p =>
                `<img src="${attr(p)}" style="width:36px;height:36px;border-radius:7px;object-fit:cover">`).join('')}
              ${((x.photosBefore || []).length + (x.photosAfter || []).length) > 4
                ? `<span class="t-sm muted">+${(x.photosBefore || []).length + (x.photosAfter || []).length - 4}</span>` : ''}
            </div>
            ${x.rating ? U.stars(x.rating, 14) : `<span class="t-sm muted">Not rated</span>`}
          </div>
        </button>`;
      }).join('')}</div>`
      : U.empty({ icon: 'clipcheck', title: 'No completed visits yet', text: 'Your service reports will appear here after the first visit.' }));
    },
    mount(root, ctx) { bindPortal(root, ctx); }
  };

  /* =============================================================== Invoices */
  V['portal-invoices'] = {
    title: 'Invoices',
    narrow: true,
    render(ctx) {
      const c = myClient(ctx);
      const invs = invoicesOf(c);
      invs.forEach(S.syncInvoiceStatus);
      const due = invs.reduce((s, i) => s + S.invoiceTotals(i).balance, 0);
      const paid = invs.reduce((s, i) => s + S.invoiceTotals(i).paid, 0);

      return C.pageHead({ title: 'Invoices', sub: invs.length + ' invoices on your account' }) +

      `<div class="grid grid-2 mb-20">
        ${C.stat({ label: 'Outstanding', value: S.moneyShort(due), icon: 'rupee', tone: due > 0 ? 'i-amber' : 'i-green',
          color: due > 0 ? 'var(--warn-700)' : '', foot: invs.filter(i => i.status !== 'paid').length + ' unpaid' })}
        ${C.stat({ label: 'Paid to date', value: S.moneyShort(paid), icon: 'checkcircle', tone: 'i-green', foot: 'Thank you!' })}
      </div>

      ${invs.length ? `<div class="col g-10">${invs.map(i => {
        const t = S.invoiceTotals(i);
        const st = S.INV_STATUS[i.status];
        return `<button class="card card-int" data-inv="${attr(i.id)}" style="padding:14px;text-align:left;width:100%;display:block">
          <div class="row between g-10 mb-8">
            <span class="fw-7 mono t-base">${esc(i.id)}</span>
            <span class="badge ${st.cls}">${esc(st.label)}</span>
          </div>
          <div class="t-base truncate">${esc(i.period)}</div>
          <div class="t-sm muted mt-2">Raised ${esc(S.fmtDate(i.date))} · due ${esc(S.fmtDate(i.due))}</div>
          <div class="row between g-10 mt-12" style="padding-top:12px;border-top:1px solid var(--line)">
            <div><div class="t-xs muted fw-6">TOTAL</div><div class="fw-7 t-md">${S.money(t.total)}</div></div>
            <div style="text-align:right"><div class="t-xs muted fw-6">BALANCE</div>
              <div class="fw-7 t-md ${t.balance > 0 ? 'danger' : 'success'}">${S.money(t.balance)}</div></div>
          </div>
        </button>`;
      }).join('')}</div>`
      : U.empty({ icon: 'receipt', title: 'No invoices yet', text: '' })}`;
    },
    mount(root, ctx) { bindPortal(root, ctx); }
  };

  /* ================================================================ Request */
  V['portal-request'] = {
    title: 'Request Service',
    narrow: true,
    render(ctx) {
      const c = myClient(ctx);
      const svcs = S.get().services;
      return C.pageHead({ title: 'Request a service', sub: 'Tell us what you need — the office picks it up immediately' }) +

      `<div class="card">
        <div class="card-bd">
          ${U.field('What do you need?', `<select class="select" id="rType">
            <option value="Complaint">Report a pest problem (urgent)</option>
            <option value="One-Time">Book a one-time treatment</option>
            <option value="Callback">Re-treatment under warranty</option>
            <option value="Inspection">Request a site inspection</option>
          </select>`)}

          <div class="mt-16">${U.field('Which service?',
            `<div class="card" style="max-height:210px;overflow-y:auto;padding:8px 12px">
              ${svcs.map(s => `<label class="check" style="padding:6px 0">
                <input type="radio" name="rsvc" value="${attr(s.id)}"${s.id === 'SV01' ? ' checked' : ''}>
                <span class="box radio">${ico('check')}</span>
                <span class="txt">${esc(s.name)}<span class="muted"> · from ${S.money(s.price)}</span></span></label>`).join('')}
            </div>`)}</div>

          <div class="grid grid-2 mt-16">
            ${U.field('Preferred date', `<input class="input" id="rDate" type="date" value="${attr(Seed.D(2))}">`)}
            ${U.field('Preferred time', `<select class="select" id="rSlot">
              ${['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map(s =>
                `<option value="${attr(s)}">${esc(S.fmtTime(s))}</option>`).join('')}</select>`)}
          </div>

          <div class="mt-16">${U.field('Describe the problem',
            `<textarea class="textarea" id="rNote" placeholder="Where exactly did you see the pests? How long has it been going on?"></textarea>`)}</div>

          <div class="mt-16">${C.hint('Requests raised here land straight in the operations queue. You will get a WhatsApp confirmation with the technician name and time slot.', 'whatsapp')}</div>
        </div>
        <div class="card-ft">
          <button class="btn btn-primary btn-lg btn-block" id="rSend">${ico('send')} Send request</button>
        </div>
      </div>

      <div class="mt-20">${C.sectionCard('Or reach us directly',
        `<div class="grid grid-2" style="gap:10px">
          <a class="btn btn-ghost" href="tel:${attr(S.get().company.phone)}">${ico('phone')} ${esc(S.get().company.phone)}</a>
          <button class="btn btn-wa" data-act="wa">${ico('whatsapp')} WhatsApp us</button>
        </div>`)}</div>`;
    },
    mount(root, ctx) {
      bindPortal(root, ctx);
      const btn = U.qs('#rSend', root);
      if (!btn) return;
      btn.onclick = () => {
        const c = myClient(ctx);
        const sv = (U.qs('input[name=rsvc]:checked', root) || {}).value || 'SV01';
        const type = U.qs('#rType', root).value;
        const j = {
          id: S.nextId('job', 'JOB-', 4), type: type, contractId: null,
          clientId: c.id, serviceIds: [sv],
          date: U.qs('#rDate', root).value || Seed.D(2),
          slot: U.qs('#rSlot', root).value,
          mins: (S.service(sv) || {}).mins || 60,
          techIds: [], status: 'scheduled',
          priority: type === 'Complaint' ? 'high' : 'normal',
          visitNo: 0, ofVisits: 0,
          notes: 'Raised by customer through the portal. ' + (U.qs('#rNote', root).value.trim() || ''),
          exec: null
        };
        S.get().jobs.push(j);
        S.get().notifications.unshift({
          id: 'N' + Date.now(), icon: 'userplus', tone: 'blue',
          title: 'Service request — ' + c.name,
          body: S.svcName(sv) + ' requested for ' + S.fmtDate(j.date) + '. Needs a technician.',
          at: 'just now', unread: true
        });
        S.save();
        U.modal({
          title: 'Request received', sub: j.id,
          body: `<div class="center-txt" style="padding:8px 0">
            <div class="tile-ico lg i-green" style="margin:0 auto 14px;width:58px;height:58px;border-radius:50%">${ico('checkcircle', '', 30)}</div>
            <div style="font-size:16px;font-weight:650">We've got it</div>
            <div class="muted t-base mt-6" style="line-height:1.6">
              Your request for <strong>${esc(S.svcName(sv))}</strong> on
              <strong>${esc(S.fmtDate(j.date))}</strong> at <strong>${esc(S.fmtTime(j.slot))}</strong> is with our operations team.
              You'll get a WhatsApp with the technician's name shortly.</div>
          </div>`,
          footer: `<button class="btn btn-primary btn-block" data-close>Done</button>`
        });
        App.refresh();
      };
    }
  };

  /* ---------------------------------------------------------------- shared */
  function bindPortal(root, ctx) {
    root.addEventListener('click', e => {
      const rp = e.target.closest('[data-report]');
      if (rp) { const j = S.job(rp.getAttribute('data-report')); if (j) showReport(j); return; }
      const iv = e.target.closest('[data-inv]');
      if (iv) { const i = S.invoice(iv.getAttribute('data-inv')); if (i) showInvoice(i); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.getAttribute('data-act');
      const co = S.get().company;
      if (a === 'wa') U.whatsapp(co.phone, 'Hello, I need help with a pest control service.', 'Message sent to Shield Pest Control');
      if (a === 'reschedule') U.toast('Reschedule request sent', { sub: 'Our team will call you to confirm a new slot' });
      if (a === 'renew') U.toast('Renewal request sent', { sub: 'You will receive the renewal quotation shortly' });
    });
  }
})(window);
