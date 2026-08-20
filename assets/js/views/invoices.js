/* ==========================================================================
   View: Invoices & Payments — GST tax invoice, receipts, collections
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'open';
  let query = '';
  const MODES = ['UPI', 'Bank Transfer', 'Cash', 'Cheque', 'Card'];

  function syncAll() { S.get().invoices.forEach(S.syncInvoiceStatus); }

  /* =================================================================== list */
  function renderList(ctx) {
    syncAll();
    const db = S.get();
    const q = query.toLowerCase();
    const rows = db.invoices.filter(i => {
      if (tab === 'open' && i.status === 'paid') return false;
      if (tab === 'overdue' && i.status !== 'overdue') return false;
      if (tab === 'paid' && i.status !== 'paid') return false;
      if (!q) return true;
      return (i.id + S.clientName(i.clientId) + i.period).toLowerCase().indexOf(q) >= 0;
    });

    const counts = {
      all: db.invoices.length,
      open: db.invoices.filter(i => i.status !== 'paid').length,
      overdue: db.invoices.filter(i => i.status === 'overdue').length,
      paid: db.invoices.filter(i => i.status === 'paid').length
    };
    const receivable = db.invoices.reduce((s, i) => s + S.invoiceTotals(i).balance, 0);
    const canBill = ['admin', 'accounts'].indexOf(ctx.role) >= 0;

    return C.pageHead({
      title: 'Invoices & Payments',
      sub: S.money(receivable) + ' outstanding across ' + counts.open + ' open invoices',
      actions: `${canBill ? `<button class="btn btn-ghost btn-sm" data-act="remind">${ico('whatsapp')} Send reminders</button>
                <button class="btn btn-primary btn-sm" data-act="pay">${ico('rupee')} Record payment</button>` : ''}`
    }) +

    C.tabsBar([
      { id: 'open', label: 'Open', n: counts.open },
      { id: 'overdue', label: 'Overdue', n: counts.overdue },
      { id: 'paid', label: 'Paid', n: counts.paid },
      { id: 'all', label: 'All', n: counts.all }
    ], tab) +

    `<div class="mt-16">` + C.searchRow('Search by invoice number or customer…', '', 'iq') + `</div>` +

    (rows.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr><th>Invoice</th><th>Customer</th><th>Period</th><th>Due</th>
        <th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(i => {
        const t = S.invoiceTotals(i);
        const st = S.INV_STATUS[i.status];
        const late = -S.dayDelta(i.due);
        return `<tr class="clickable" data-go="#/invoices/${i.id}">
          <td><div class="fw-6 mono t-base">${esc(i.id)}</div><div class="t-sm muted">${esc(S.fmtDate(i.date))}</div></td>
          <td>${C.clientCell(i.clientId)}</td>
          <td class="t-base truncate" style="max-width:190px">${esc(i.period)}</td>
          <td class="t-base ${late > 0 && i.status !== 'paid' ? 'danger fw-6' : ''}">${esc(S.fmtDate(i.due))}
            ${late > 0 && i.status !== 'paid' ? `<div class="t-sm">${late} days late</div>` : ''}</td>
          <td class="r fw-6">${S.money(t.total)}</td>
          <td class="r t-base muted">${S.money(t.paid)}</td>
          <td class="r fw-7 ${t.balance > 0 ? 'danger' : 'success'}">${S.money(t.balance)}</td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td class="tight">${ico('cright', 'muted-2', 15)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`
    : U.empty({ icon: 'receipt', title: 'Nothing here', text: 'No invoices match this view.' }));
  }

  /* ================================================================ payment */
  function payModal(inv) {
    const t = S.invoiceTotals(inv);
    U.modal({
      title: 'Record payment', sub: inv.id + ' · ' + S.clientName(inv.clientId),
      body: `<div class="card card-pad mb-16" style="background:var(--surface-2)">
          <div class="row between t-base mb-6"><span class="muted">Invoice total</span><strong>${S.money(t.total)}</strong></div>
          <div class="row between t-base mb-6"><span class="muted">Already paid</span><strong>${S.money(t.paid)}</strong></div>
          <div class="divider mb-6"></div>
          <div class="row between"><strong>Balance due</strong><strong class="t-lg danger">${S.money(t.balance)}</strong></div>
        </div>
        <div class="grid grid-2">
          ${U.field('Amount received (₹)', `<input class="input" id="pAmt" type="number" value="${Math.round(t.balance)}">`, '', true)}
          ${U.field('Payment mode', `<select class="select" id="pMode">${U.selectOpts(MODES)}</select>`)}
        </div>
        <div class="mt-14">${U.field('Reference', `<input class="input" id="pRef" placeholder="UTR / cheque no. / txn id">`)}</div>
        <div class="mt-14">${U.field('Date received', `<input class="input" id="pDate" type="date" value="${attr(S.todayISO())}">`)}</div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-ok>${ico('check')} Record &amp; issue receipt</button>`,
      onMount(root, close) {
        U.qs('[data-ok]', root).onclick = () => {
          const amt = parseFloat(U.qs('#pAmt', root).value) || 0;
          if (amt <= 0) { U.toast('Enter an amount', { tone: 'err' }); return; }
          const p = S.recordPayment(inv, amt, U.qs('#pMode', root).value, U.qs('#pRef', root).value.trim());
          p.date = U.qs('#pDate', root).value || S.todayISO();
          S.syncInvoiceStatus(inv); S.save(); close();
          U.toast('Receipt ' + p.id + ' issued', { sub: S.money(amt) + ' recorded against ' + inv.id });
          U.whatsapp((S.client(inv.clientId) || {}).phone,
            `Payment of ${S.money(amt)} received against invoice ${inv.id}. Receipt ${p.id} attached. Thank you!`, 'Receipt sent to customer');
          App.refresh();
        };
      }
    });
  }

  function quickPay() {
    syncAll();
    const open = S.get().invoices.filter(i => i.status !== 'paid');
    if (!open.length) { U.toast('No open invoices'); return; }
    U.modal({
      title: 'Record a payment', sub: 'Pick the invoice that was settled',
      body: `<div class="col g-8">${open.map(i => {
        const t = S.invoiceTotals(i);
        return `<button class="rolecard" data-inv="${attr(i.id)}">
          <div class="tile-ico lg ${i.status === 'overdue' ? 'i-red' : 'i-blue'}">${ico('receipt')}</div>
          <div class="grow"><div class="rc-name">${esc(S.clientName(i.clientId))}</div>
          <div class="rc-desc">${esc(i.id)} · due ${esc(S.fmtDate(i.due))}</div></div>
          <div style="text-align:right"><div class="fw-7">${S.money(t.balance)}</div>
          <div class="t-xs muted">balance</div></div></button>`;
      }).join('')}</div>`,
      onMount(root, close) {
        root.addEventListener('click', e => {
          const b = e.target.closest('[data-inv]');
          if (b) { close(); payModal(S.invoice(b.getAttribute('data-inv'))); }
        });
      }
    });
  }

  /* ================================================================ receipt */
  function receiptDoc(p) {
    const inv = S.invoice(p.invoiceId);
    const co = S.get().company;
    const cl = S.client(inv.clientId) || {};
    U.modal({
      title: 'Payment receipt', sub: p.id, size: 'md',
      body: `<div class="doc" style="box-shadow:none;border:0"><div class="doc-inner" style="padding:8px 2px">
        <div class="doc-head">
          <div><div class="doc-co-name">${esc(co.name)}</div>
            <div class="doc-co-line">${esc(co.addr1)}<br>${esc(co.addr2)}<br>GSTIN: ${esc(co.gstin)}</div></div>
          <div style="text-align:right"><div class="doc-title" style="font-size:20px">RECEIPT</div>
            <div class="doc-no">${esc(p.id)}</div>
            <div class="doc-co-line mt-6">Date: <strong>${esc(S.fmtDate(p.date))}</strong></div></div>
        </div>
        <div class="doc-hr"></div>
        ${C.kv([
          ['Received from', cl.name || '—'],
          ['Against invoice', inv.id + ' — ' + inv.period],
          ['Payment mode', p.mode],
          ['Reference', p.ref || '—'],
          ['Received by', S.userName(p.by)]
        ])}
        <div class="card card-pad mt-16" style="background:var(--brand-50);border-color:var(--brand-200)">
          <div class="row between"><span class="fw-6">Amount received</span>
            <span class="t-xl fw-7 brand">${S.money(p.amount)}</span></div>
          <div class="t-sm muted mt-6">${esc(S.amountInWords(p.amount))}</div>
        </div>
        <div class="doc-hr"></div>
        <div class="t-sm muted center-txt">This is a computer-generated receipt and does not require a signature.</div>
      </div></div>`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>
               <button class="btn btn-wa" data-send>${ico('whatsapp')} Send to customer</button>`,
      onMount(root, close) {
        U.qs('[data-send]', root).onclick = () => {
          U.whatsapp(cl.phone, `Receipt ${p.id} for ${S.money(p.amount)} against invoice ${inv.id}. Thank you for your payment.`, 'Receipt sent');
          close();
        };
      }
    });
  }

  /* ================================================================ document */
  function invoiceDoc(inv) {
    const co = S.get().company;
    const cl = S.client(inv.clientId) || {};
    const t = S.invoiceTotals(inv);
    const st = S.INV_STATUS[inv.status];
    const stampColor = { paid: 'var(--success-500)', overdue: 'var(--danger-500)', partial: 'var(--warn-500)', unpaid: 'var(--info-500)' }[inv.status];
    const c = inv.contractId ? S.contract(inv.contractId) : null;
    // The visits this invoice actually bills for — what makes it auditable.
    const covered = (inv.jobIds || []).map(S.job).filter(Boolean);

    return `<div class="doc"><div class="doc-inner">
      <div class="doc-head">
        <div>
          <div class="row g-10 mb-10">
            <div class="brandmark" style="width:38px;height:38px">${ico('shieldcheck')}</div>
            <div><div class="doc-co-name">${esc(co.name)}</div>
            <div class="doc-co-line">${esc(co.tagline)}</div></div>
          </div>
          <div class="doc-co-line">${esc(co.addr1)}<br>${esc(co.addr2)}<br>
            ${esc(co.phone)} · ${esc(co.email)}<br>GSTIN: ${esc(co.gstin)}</div>
        </div>
        <div style="text-align:right">
          <div class="doc-stamp" style="color:${stampColor};border-color:${stampColor}">${esc(st.label)}</div>
          <div class="doc-title">TAX INVOICE</div>
          <div class="doc-no">${esc(inv.id)}</div>
          <div class="doc-co-line mt-8">
            Invoice date: <strong>${esc(S.fmtDate(inv.date))}</strong><br>
            Due date: <strong>${esc(S.fmtDate(inv.due))}</strong>
          </div>
        </div>
      </div>

      <div class="doc-hr"></div>

      <div class="row-top between g-24 wrap">
        <div style="min-width:230px">
          <div class="doc-sec-label">Bill to</div>
          <div style="font-size:14.5px;font-weight:700">${esc(cl.name || '—')}</div>
          <div class="doc-co-line mt-4">${esc(cl.contact || '')}<br>
            ${esc(cl.addr || '')}${cl.city ? ', ' + esc(cl.city) : ''}${cl.pin ? ' — ' + esc(cl.pin) : ''}<br>
            ${esc(cl.phone || '')}${cl.gstin ? '<br>GSTIN: ' + esc(cl.gstin) : ''}</div>
        </div>
        <div style="min-width:190px">
          <div class="doc-sec-label">Billing period</div>
          <div style="font-size:13px;font-weight:600">${esc(inv.period)}</div>
          ${covered.length ? `<div class="doc-co-line mt-6">Covers ${covered.length === 1 ? 'visit' : 'visits'}:
            <strong>${covered.map(j => esc(S.fmtDate(j.date))).join(', ')}</strong></div>` : ''}
          ${c ? `<div class="doc-co-line mt-6">Contract: <strong>${esc(c.id)}</strong><br>
            ${esc(S.planSummary(c))} · ${esc(c.billing)} billing<br>
            Place of supply: <strong>${esc(S.supplyState(inv))}</strong></div>`
            : `<div class="doc-co-line mt-6">Place of supply: <strong>${esc(S.supplyState(inv))}</strong><br>SAC: <strong>998531</strong></div>`}
        </div>
      </div>

      <div style="margin-top:22px">
        <table class="doc-tbl">
          <thead><tr><th style="width:34px">#</th><th>Description of service</th>
            <th class="c" style="width:64px">SAC</th><th class="c" style="width:50px">Qty</th>
            <th class="r" style="width:92px">Rate</th><th class="r" style="width:104px">Amount</th></tr></thead>
          <tbody>${inv.items.map((it, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td style="font-weight:600">${esc(it.name)}</td>
            <td class="c mono">998531</td>
            <td class="c">${it.qty}</td>
            <td class="r">${S.money(it.rate)}</td>
            <td class="r" style="font-weight:650">${S.money(it.qty * it.rate)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="row-top between g-24 mt-18 wrap">
        <div class="grow" style="min-width:230px;max-width:360px">
          <div class="doc-sec-label">Payment details</div>
          <div style="font-size:11.5px;color:var(--muted);line-height:1.75">
            Bank: ${esc(co.bank.name)}<br>
            A/c no: ${esc(co.bank.ac)}<br>
            IFSC: ${esc(co.bank.ifsc)}<br>
            UPI: <strong style="color:var(--ink-2)">${esc(co.upi)}</strong>
          </div>
          <div class="doc-sec-label" style="margin-top:14px">Declaration</div>
          <div style="font-size:10.5px;color:var(--muted);line-height:1.6">
            We declare that this invoice shows the actual price of the services described
            and that all particulars are true and correct. Services rendered under CIB&amp;RC
            approved chemicals by licensed applicators.
          </div>
        </div>
        <div class="doc-totals">
          <div class="tr"><span class="muted">Taxable value</span><span>${S.money(t.sub)}</span></div>
          ${S.taxRows(t).map(r => `<div class="tr"><span class="muted">${esc(r[0])}</span><span>${S.money(r[1])}</span></div>`).join('')}
          <div class="tr grand"><span>Invoice total</span><span>${S.money(t.total)}</span></div>
          ${t.paid ? `<div class="tr" style="color:var(--success-700)"><span>Amount paid</span><span>− ${S.money(t.paid)}</span></div>
            <div class="tr" style="font-weight:700;border-top:1px solid var(--line);padding-top:8px">
              <span>Balance due</span><span style="color:${t.balance > 0 ? 'var(--danger-700)' : 'var(--success-700)'}">${S.money(t.balance)}</span></div>` : ''}
          <div style="font-size:10.5px;color:var(--muted);margin-top:7px;line-height:1.5">${esc(S.amountInWords(t.total))}</div>
        </div>
      </div>

      <div class="doc-hr"></div>
      <div class="row-top between g-24 wrap">
        <div style="font-size:10.5px;color:var(--muted);line-height:1.6;max-width:330px">
          Payment due within 15 days of invoice date. Interest at 18% p.a. applies on
          overdue amounts. Subject to Chennai jurisdiction.
        </div>
        <div style="text-align:center;min-width:180px">
          <div style="height:42px"></div>
          <div style="border-top:1px solid var(--line-2);padding-top:7px;font-size:11.5px;font-weight:650">For ${esc(co.name)}</div>
          <div style="font-size:10.5px;color:var(--muted)">Authorised signatory</div>
        </div>
      </div>
    </div></div>`;
  }

  /* ================================================================= detail */
  V.invoicesDetail = {
    title: ctx => (S.invoice(ctx.id) || {}).id || 'Invoice',
    crumb: 'Invoices',
    narrow: true,
    render(ctx) {
      const inv = S.invoice(ctx.id);
      if (!inv) return C.backLink('#/invoices', 'All invoices') +
        U.empty({ icon: 'receipt', title: 'Invoice not found', text: 'It may have been removed.' });
      S.syncInvoiceStatus(inv);
      const t = S.invoiceTotals(inv);
      const pays = S.get().payments.filter(p => p.invoiceId === inv.id);
      const canBill = ['admin', 'accounts'].indexOf(ctx.role) >= 0;
      const late = -S.dayDelta(inv.due);

      return C.backLink('#/invoices', 'All invoices') +
      `<div class="row between wrap g-12 mb-16 no-print">
        <div>
          <div class="row g-8"><h2 class="mono">${esc(inv.id)}</h2>
            <span class="badge ${S.INV_STATUS[inv.status].cls} badge-lg">${esc(S.INV_STATUS[inv.status].label)}</span></div>
          <div class="muted t-base mt-4">${esc(S.clientName(inv.clientId))} · ${S.money(t.total)} · due ${esc(S.fmtDate(inv.due))}</div>
        </div>
        <div class="row g-8 wrap">
          <button class="btn btn-ghost btn-sm" data-act="print">${ico('printer')} Print / PDF</button>
          <button class="btn btn-wa btn-sm" data-act="send">${ico('whatsapp')} Send to customer</button>
          ${canBill && t.balance > 0 ? `<button class="btn btn-primary btn-sm" data-act="pay">${ico('rupee')} Record payment</button>` : ''}
        </div>
      </div>

      ${inv.status === 'overdue' ? `<div class="banner ban-red mb-16 no-print">${ico('alert')}
        <div><div class="bt">Overdue by ${late} days</div>
        ${S.money(t.balance)} is still outstanding. Send a reminder or record the payment if already received.</div></div>` : ''}
      ${inv.status === 'paid' ? `<div class="banner ban-green mb-16 no-print">${ico('checkcircle')}
        <div><div class="bt">Fully paid</div>Settled on ${esc(S.fmtDate((pays[0] || {}).date))} via ${esc((pays[0] || {}).mode || '—')}.</div></div>` : ''}

      ${pays.length ? `<div class="card mb-16 no-print">
        <div class="card-hd"><h3 class="grow">Payment history</h3>
          <span class="badge b-green">${S.money(t.paid)} received</span></div>
        <div class="card-bd" style="padding-top:6px;padding-bottom:6px">
          ${pays.map(p => `<button class="row g-11 btn-quiet" data-receipt="${attr(p.id)}"
            style="width:100%;padding:10px 0;border-bottom:1px solid var(--line);text-align:left;border-radius:0">
            <div class="tile-ico i-green">${ico('rupee', '', 17)}</div>
            <div class="grow" style="min-width:0">
              <div class="fw-6 t-base">${S.money(p.amount)} · ${esc(p.mode)}</div>
              <div class="t-sm muted">${esc(p.id)} · ${esc(S.fmtDate(p.date))} · ${esc(p.ref)}</div>
            </div>
            <span class="badge b-gray">${ico('eye')}Receipt</span>
          </button>`).join('')}
        </div>
      </div>` : ''}

      ${invoiceDoc(inv)}`;
    },
    mount(root, ctx) {
      const inv = S.invoice(ctx.id);
      if (!inv) return;
      root.addEventListener('click', e => {
        const rb = e.target.closest('[data-receipt]');
        if (rb) {
          const p = S.get().payments.filter(x => x.id === rb.getAttribute('data-receipt'))[0];
          if (p) receiptDoc(p);
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.getAttribute('data-act');
        if (a === 'print') { w.print(); return; }
        if (a === 'pay') { payModal(inv); return; }
        if (a === 'send') {
          const t = S.invoiceTotals(inv);
          U.whatsapp((S.client(inv.clientId) || {}).phone,
            `Invoice ${inv.id} for ${S.money(t.total)} — ${inv.period}. Due ${S.fmtDate(inv.due)}. Pay via UPI ${S.get().company.upi}.`,
            'Invoice sent on WhatsApp');
        }
      });
    }
  };

  /* =================================================================== view */
  V.invoices = {
    title: 'Invoices & Payments',
    quickPay: quickPay,
    render: renderList,
    mount(root, ctx) {
      const qi = U.qs('#iq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        const go = e.target.closest('[data-go]');
        if (go) { location.hash = go.getAttribute('data-go'); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.getAttribute('data-act') === 'pay') return quickPay();
        if (b.getAttribute('data-act') === 'remind') {
          const od = S.get().invoices.filter(i => i.status === 'overdue' || i.status === 'unpaid');
          U.whatsapp(od.length + ' clients', 'Reminder: your invoice is due. Kindly arrange payment at your convenience.',
            'Reminders sent to ' + od.length + ' customer(s)');
        }
      });
    }
  };
})(window);
