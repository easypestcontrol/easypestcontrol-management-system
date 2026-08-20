/* ==========================================================================
   View: Inventory — chemicals, equipment, consumables and stock movements
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  let tab = 'Chemical';
  let query = '';

  function stockPct(i) { return Math.min(100, Math.round(i.stock / Math.max(1, i.min * 2) * 100)); }
  function stockTone(i) {
    if (i.stock < i.min) return 'red';
    if (i.stock < i.min * 1.4) return 'amber';
    return '';
  }
  function expiryState(i) {
    if (!i.expiry) return null;
    const d = S.dayDelta(i.expiry);
    if (d < 0) return { cls: 'b-red', label: 'Expired' };
    if (d < 90) return { cls: 'b-amber', label: d + ' days left' };
    return { cls: 'b-gray', label: S.fmtDate(i.expiry) };
  }

  function adjust(i, kind) {
    const techs = S.get().users.filter(u => u.role === 'tech');
    U.modal({
      title: kind === 'in' ? 'Record stock purchase' : 'Issue stock to technician',
      sub: i.name + ' · current ' + i.stock + ' ' + i.unit,
      body: `${U.field('Quantity (' + i.unit + ')', `<input class="input" id="aQty" type="number" min="1" value="${kind === 'in' ? 1000 : 100}">`, '', true)}
        <div class="mt-14">${kind === 'in'
          ? U.field('Purchase reference', `<input class="input" id="aRef" placeholder="PO number / invoice">`)
          : U.field('Issue to', `<select class="select" id="aRef">${techs.map(t => `<option value="${attr(t.id)}">${esc(t.name)}</option>`).join('')}</select>`)}
        </div>
        ${kind === 'in' ? `<div class="grid grid-2 mt-14">
          ${U.field('Batch number', `<input class="input" id="aBatch" value="${attr(i.batch || '')}">`)}
          ${U.field('Expiry date', `<input class="input" id="aExp" type="date" value="${attr(i.expiry || '')}">`)}
        </div>` : ''}`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-ok>${ico('check')} ${kind === 'in' ? 'Add to stock' : 'Issue'}</button>`,
      onMount(root, close) {
        U.qs('[data-ok]', root).onclick = () => {
          const qty = parseFloat(U.qs('#aQty', root).value) || 0;
          if (qty <= 0) { U.toast('Enter a quantity', { tone: 'err' }); return; }
          if (kind === 'out' && qty > i.stock) { U.toast('Not enough stock on hand', { tone: 'err' }); return; }
          const ref = U.qs('#aRef', root).value;
          i.stock += kind === 'in' ? qty : -qty;
          if (kind === 'in') {
            const b = U.qs('#aBatch', root).value.trim(); if (b) i.batch = b;
            const x = U.qs('#aExp', root).value; if (x) i.expiry = x;
          }
          S.get().stockMoves.unshift({
            id: 'SM-' + Math.floor(Math.random() * 900 + 500),
            date: S.todayISO(), itemId: i.id, qty: kind === 'in' ? qty : -qty,
            type: kind === 'in' ? 'Purchase' : 'Issued',
            ref: ref || '—', by: (S.me() || {}).id || 'U02'
          });
          S.save(); close(); App.refresh();
          U.toast(kind === 'in' ? 'Stock added' : 'Stock issued',
            { sub: i.name + ' · new balance ' + i.stock + ' ' + i.unit });
        };
      }
    });
  }

  function addItem() {
    U.modal({
      title: 'Add inventory item', size: 'md',
      body: `<div class="grid grid-2">
          ${U.field('Item name', `<input class="input" id="iName">`, '', true)}
          ${U.field('Category', `<select class="select" id="iCat">${U.selectOpts(['Chemical', 'Equipment', 'Consumable'])}</select>`)}
          ${U.field('Unit', `<input class="input" id="iUnit" placeholder="g / ml / nos">`)}
          ${U.field('Opening stock', `<input class="input" id="iStock" type="number" value="0">`)}
          ${U.field('Reorder level', `<input class="input" id="iMin" type="number" value="100">`)}
          ${U.field('Unit cost (₹)', `<input class="input" id="iCost" type="number" step="0.1" value="0">`)}
        </div>
        <div class="grid grid-2 mt-14">
          ${U.field('Active ingredient', `<input class="input" id="iAi" placeholder="e.g. Fipronil 0.05% w/w">`)}
          ${U.field('CIB&RC registration', `<input class="input" id="iCib" placeholder="CIR-…">`)}
        </div>
        <div class="grid grid-2 mt-14">
          ${U.field('Supplier', `<input class="input" id="iSup">`)}
          ${U.field('Expiry date', `<input class="input" id="iExp" type="date">`)}
        </div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn btn-primary" data-save>${ico('check')} Add item</button>`,
      onMount(root, close) {
        U.qs('[data-save]', root).onclick = () => {
          const name = U.qs('#iName', root).value.trim();
          if (!name) { U.toast('Item name is required', { tone: 'err' }); return; }
          const db = S.get();
          db.inventory.push({
            id: 'IN' + String(db.inventory.length + 30), name: name,
            cat: U.qs('#iCat', root).value, ai: U.qs('#iAi', root).value.trim(),
            unit: U.qs('#iUnit', root).value.trim() || 'nos',
            stock: parseFloat(U.qs('#iStock', root).value) || 0,
            min: parseFloat(U.qs('#iMin', root).value) || 0,
            cost: parseFloat(U.qs('#iCost', root).value) || 0,
            pack: '—', supplier: U.qs('#iSup', root).value.trim(), batch: '—',
            expiry: U.qs('#iExp', root).value, cib: U.qs('#iCib', root).value.trim()
          });
          S.save(); close(); App.refresh();
          U.toast('Item added to inventory', { sub: name });
        };
      }
    });
  }

  V.inventory = {
    title: 'Inventory',
    render(ctx) {
      const db = S.get();
      const inv = db.inventory;
      const q = query.toLowerCase();
      const low = inv.filter(i => i.stock < i.min);
      const expSoon = inv.filter(i => i.expiry && S.dayDelta(i.expiry) < 90);
      const value = inv.reduce((s, i) => s + i.stock * i.cost, 0);
      const canEdit = ['admin', 'ops'].indexOf(ctx.role) >= 0;

      const rows = tab === 'moves' ? [] : inv.filter(i =>
        i.cat === tab && (!q || (i.name + i.ai + i.supplier).toLowerCase().indexOf(q) >= 0));

      const counts = {
        Chemical: inv.filter(i => i.cat === 'Chemical').length,
        Equipment: inv.filter(i => i.cat === 'Equipment').length,
        Consumable: inv.filter(i => i.cat === 'Consumable').length,
        moves: db.stockMoves.length
      };

      return C.pageHead({
        title: 'Inventory',
        sub: inv.length + ' items · ' + S.money(value) + ' of stock on hand',
        actions: `${canEdit ? `<button class="btn btn-ghost btn-sm" data-act="po">${ico('truck')} Raise purchase order</button>
                  <button class="btn btn-primary btn-sm" data-new>${ico('plus')} Add item</button>` : ''}`
      }) +

      `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Stock value', value: S.moneyShort(value), icon: 'package', tone: 'i-brand', foot: inv.length + ' distinct items' })}
        ${C.stat({ label: 'Below reorder level', value: low.length, icon: 'alert', tone: low.length ? 'i-red' : 'i-green',
          color: low.length ? 'var(--danger-700)' : '', foot: low.length ? 'Order today' : 'All healthy' })}
        ${C.stat({ label: 'Expiring in 90 days', value: expSoon.length, icon: 'clock', tone: expSoon.length ? 'i-amber' : 'i-gray', foot: 'Chemicals only' })}
        ${C.stat({ label: 'Consumed this month', value: db.stockMoves.filter(m => m.qty < 0 && S.dayDelta(m.date) >= -30).length,
          icon: 'flask', tone: 'i-violet', foot: 'Recorded from service sheets' })}
      </div>

      ${low.length ? `<div class="banner ban-red mb-16">${ico('alert')}
        <div><div class="bt">${low.length} item${low.length > 1 ? 's are' : ' is'} below reorder level</div>
        ${esc(low.map(i => i.name + ' (' + i.stock + ' ' + i.unit + ')').join(', '))}</div></div>` : ''}

      ${C.tabsBar([
        { id: 'Chemical', label: 'Chemicals', n: counts.Chemical },
        { id: 'Equipment', label: 'Equipment', n: counts.Equipment },
        { id: 'Consumable', label: 'Consumables', n: counts.Consumable },
        { id: 'moves', label: 'Stock movements', n: counts.moves }
      ], tab)}

      <div class="mt-16">${tab !== 'moves' ? C.searchRow('Search items…', '', 'iq') : ''}</div>

      ${tab === 'moves'
        ? `<div class="card"><div class="tablewrap"><table class="tbl">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="r">Quantity</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>${db.stockMoves.map(m => {
              const it = S.item(m.itemId) || {};
              const tone = m.qty > 0 ? 'b-green' : m.type === 'Consumed' ? 'b-blue' : 'b-amber';
              return `<tr>
                <td class="t-base">${esc(S.fmtDate(m.date))}</td>
                <td class="fw-6">${esc(it.name || m.itemId)}</td>
                <td><span class="badge ${tone}">${esc(m.type)}</span></td>
                <td class="r fw-7 ${m.qty > 0 ? 'success' : ''}">${m.qty > 0 ? '+' : ''}${m.qty} ${esc(it.unit || '')}</td>
                <td class="t-base">${esc(m.type === 'Issued' ? S.userName(m.ref) : m.ref)}</td>
                <td>${C.userCell(m.by)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div></div>`
        : (rows.length ? `<div class="card"><div class="tablewrap"><table class="tbl">
            <thead><tr><th>Item</th><th>Stock on hand</th><th>Reorder</th>
              ${tab === 'Chemical' ? '<th>Batch / expiry</th><th>CIB&amp;RC</th>' : '<th>Supplier</th>'}
              <th class="r">Value</th>${canEdit ? '<th></th>' : ''}</tr></thead>
            <tbody>${rows.map(i => {
              const ex = expiryState(i);
              return `<tr>
                <td><div class="row g-10">
                  <div class="tile-ico ${i.cat === 'Chemical' ? 'i-brand' : i.cat === 'Equipment' ? 'i-violet' : 'i-blue'}">
                    ${ico(i.cat === 'Chemical' ? 'flask' : i.cat === 'Equipment' ? 'wrench' : 'box')}</div>
                  <div style="min-width:0"><div class="fw-6 truncate">${esc(i.name)}</div>
                  <div class="t-sm muted truncate">${esc(i.ai || i.pack)}</div></div>
                </div></td>
                <td style="min-width:160px"><div class="stockbar">
                  ${U.bar(stockPct(i), stockTone(i))}
                  <span class="fw-7 t-base nowrap ${i.stock < i.min ? 'danger' : ''}">${i.stock} ${esc(i.unit)}</span>
                </div></td>
                <td class="t-base muted">${i.min} ${esc(i.unit)}</td>
                ${tab === 'Chemical'
                  ? `<td><div class="t-base mono">${esc(i.batch)}</div>${ex ? `<span class="badge ${ex.cls}" style="height:19px">${esc(ex.label)}</span>` : ''}</td>
                     <td class="t-sm muted mono">${esc(i.cib || '—')}</td>`
                  : `<td class="t-base">${esc(i.supplier || '—')}</td>`}
                <td class="r fw-6">${S.money(i.stock * i.cost)}</td>
                ${canEdit ? `<td class="tight"><div class="row g-4">
                  <button class="btn btn-ghost btn-sm" data-in="${attr(i.id)}" title="Add stock">${ico('plus')}</button>
                  <button class="btn btn-ghost btn-sm" data-out="${attr(i.id)}" title="Issue">${ico('truck')}</button>
                </div></td>` : ''}
              </tr>`;
            }).join('')}</tbody>
          </table></div></div>`
          : U.empty({ icon: 'package', title: 'No items here', text: 'Try another category or search.' }))}`;
    },
    mount(root, ctx) {
      const qi = U.qs('#iq', root);
      if (qi) { qi.value = query; qi.addEventListener('input', U.debounce(() => { query = qi.value; ctx.refresh(); }, 220)); }
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-new]')) return addItem();
        if (e.target.closest('[data-act=po]')) {
          const low = S.get().inventory.filter(i => i.stock < i.min);
          U.toast('Purchase order drafted', { sub: low.length + ' low-stock items added automatically' });
          return;
        }
        const bi = e.target.closest('[data-in]');
        if (bi) return adjust(S.item(bi.getAttribute('data-in')), 'in');
        const bo = e.target.closest('[data-out]');
        if (bo) return adjust(S.item(bo.getAttribute('data-out')), 'out');
      });
    }
  };
})(window);
