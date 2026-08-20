/* ==========================================================================
   PestOps — Shared render components used across views
   ========================================================================== */
(function (w) {
  'use strict';
  const esc = U.esc, attr = U.attr;

  /* ------------------------------------------------------------ page head */
  function pageHead(cfg) {
    const c = cfg || {};
    return `<div class="pagehead">
      <div class="grow">
        <div class="ttl">${esc(c.title)}</div>
        ${c.sub ? `<div class="sub">${c.subHtml ? c.sub : esc(c.sub)}</div>` : ''}
      </div>
      ${c.actions ? `<div class="row g-8 wrap">${c.actions}</div>` : ''}
    </div>`;
  }

  function backLink(href, label) {
    return `<a href="${attr(href)}" class="btn btn-quiet btn-sm no-print" style="margin-left:-11px;margin-bottom:6px">
      ${ico('aleft')} ${esc(label)}</a>`;
  }

  /* ---------------------------------------------------------------- stats */
  function stat(c) {
    return `<div class="stat">
      ${c.icon ? `<div class="ico ${c.tone || 'i-brand'}">${ico(c.icon)}</div>` : ''}
      <div class="label">${esc(c.label)}</div>
      <div class="value" style="${c.color ? 'color:' + attr(c.color) : ''}">${c.value}</div>
      ${c.foot ? `<div class="foot">${c.foot}</div>` : ''}
    </div>`;
  }

  function trend(pct, up) {
    return `<span class="trend ${up ? 'up' : 'down'}">${ico(up ? 'trendup' : 'trenddown')}${esc(pct)}</span>`;
  }

  /* --------------------------------------------------------------- cells */
  function clientCell(clientId, sub) {
    const c = S.client(clientId);
    if (!c) return '<span class="muted">—</span>';
    return `<div class="row g-10">
      ${U.avatarName(c.name, c.color, 'av-sm')}
      <div style="min-width:0">
        <div class="truncate fw-6">${esc(c.name)}</div>
        <div class="truncate t-sm muted">${esc(sub || c.type + ' · ' + c.city)}</div>
      </div>
    </div>`;
  }

  function userCell(userId, sub) {
    const u = S.user(userId);
    if (!u) return `<span class="badge b-amber">${ico('alert')}Unassigned</span>`;
    return `<div class="row g-8">
      ${U.avatar(u, 'av-xs')}
      <div style="min-width:0">
        <div class="truncate" style="font-size:12.5px;font-weight:600">${esc(u.name)}</div>
        ${sub ? `<div class="truncate t-xs muted">${esc(sub)}</div>` : ''}
      </div>
    </div>`;
  }

  function techStack(ids) {
    if (!ids || !ids.length) return `<span class="badge b-amber">${ico('alert')}Unassigned</span>`;
    return `<div class="av-stack">${ids.map(id => U.avatar(S.user(id), 'av-xs')).join('')}</div>`;
  }

  /* ----------------------------------------------------------- service pieces */
  function jobStatus(j) {
    const s = S.JOB_STATUS[j.status] || S.JOB_STATUS.scheduled;
    return `<span class="badge ${s.cls}"><i class="pip"></i>${esc(s.label)}</span>`;
  }
  function jobType(j) {
    const t = S.JOB_TYPE[j.type] || S.JOB_TYPE['One-Time'];
    return `<span class="badge ${t.cls}">${ico(t.icon)}${esc(j.type)}</span>`;
  }

  /** Compact clickable service row for dashboards and lists. */
  function jobRow(j, opts) {
    const o = opts || {};
    const tp = S.timeParts(j.slot);
    const c = S.client(j.clientId);
    return `<a class="row g-12" href="#/jobs/${j.id}" style="padding:11px 4px;border-bottom:1px solid var(--line)">
      <div style="width:52px;flex-shrink:0;text-align:center">
        <div style="font-size:13.5px;font-weight:700;letter-spacing:-.02em">${esc(tp.hh)}</div>
        <div style="font-size:9.5px;font-weight:650;color:var(--muted-2)">${esc(tp.ap)}</div>
      </div>
      <div class="grow" style="min-width:0">
        <div class="row g-6">
          <span class="truncate fw-6" style="font-size:13.5px">${esc(c ? c.name : '—')}</span>
          ${j.priority === 'high' ? `<span class="badge b-red" style="height:18px;padding:0 6px;font-size:10px">Priority</span>` : ''}
        </div>
        <div class="truncate t-sm muted">${esc(S.jobTitle(j))}${j.contractId ? ' · ' + esc(j.contractId) : ''}</div>
      </div>
      ${o.hideTech ? '' : `<div class="desk-only">${techStack(j.techIds)}</div>`}
      ${jobStatus(j)}
    </a>`;
  }

  /* --------------------------------------------------------------- misc */
  function sectionCard(title, bodyHtml, rightHtml, opts) {
    const o = opts || {};
    return `<section class="card">
      <div class="card-hd"><h3 class="grow">${esc(title)}</h3>${rightHtml || ''}</div>
      <div class="${o.flush ? '' : 'card-bd'}">${bodyHtml}</div>
      ${o.footer ? `<div class="card-ft">${o.footer}</div>` : ''}
    </section>`;
  }

  function alertRow(cfg) {
    const c = cfg;
    return `<a class="row g-11" href="${attr(c.href || '#')}" style="display:flex;gap:11px;padding:11px 0;border-bottom:1px solid var(--line)">
      <div class="tile-ico ${c.tone}" style="width:32px;height:32px">${ico(c.icon, '', 16)}</div>
      <div class="grow" style="min-width:0">
        <div class="truncate" style="font-size:13px;font-weight:600">${esc(c.title)}</div>
        <div class="truncate t-sm muted">${esc(c.sub)}</div>
      </div>
      ${ico('cright', '', 15)}
    </a>`;
  }

  function kv(pairs) {
    return `<dl class="kv">${pairs.filter(Boolean).map(p =>
      `<dt>${esc(p[0])}</dt><dd>${p[2] ? p[1] : esc(p[1])}</dd>`).join('')}</dl>`;
  }

  function tabsBar(tabs, active, attrName) {
    return `<div class="tabs">${tabs.map(t =>
      `<button class="tab ${t.id === active ? 'on' : ''}" ${attrName || 'data-tab'}="${attr(t.id)}">
        ${esc(t.label)}${t.n != null ? `<span class="cnt">${t.n}</span>` : ''}
      </button>`).join('')}</div>`;
  }

  function searchRow(placeholder, extraHtml, id) {
    return `<div class="row g-10 wrap mb-16">
      <div class="searchbar">${ico('search')}<input id="${attr(id || 'q')}" placeholder="${attr(placeholder)}" autocomplete="off"></div>
      ${extraHtml || ''}
    </div>`;
  }

  function contractPill(c) {
    const st = S.contractStatus(c);
    return `<span class="badge ${st.cls}"><i class="pip"></i>${esc(st.label)}</span>`;
  }

  function ratingRow(n, count) {
    return `<div class="row g-6">${U.stars(n)}<span class="t-sm muted">${n ? n.toFixed(1) : '—'}${count ? ' (' + count + ')' : ''}</span></div>`;
  }

  /** Rows of the "what happens next" hint used on empty/instructional areas. */
  function hint(text, icon) {
    return `<div class="banner ban-brand">${ico(icon || 'info')}<div>${text}</div></div>`;
  }

  /* ------------------------------------------------------------ signing */
  /**
   * Signature boxes. A quotation and a contract are the same document at two
   * moments, so both sign the same way — the markup and the capture live here
   * rather than being written twice and drifting apart.
   *
   * pads: [{ key, label, name, req, onFile }]
   *
   * `onFile` is a signature already held against a person -- uploaded on their
   * team profile -- so it is shown as-is rather than asking them to draw it
   * again on every document.
   */
  function sigBoxes(pads) {
    return '<div class="grid grid-2">' + pads.map(function (p) {
      if (p.onFile) {
        return `<div>
          <div class="row between mb-6">
            <span class="flabel" style="margin:0">${U.esc(p.label)}</span>
            <span class="badge b-green">${ico('check', '', 12)}On file</span>
          </div>
          <div class="wo-sig">
            <div class="onfile"><img src="${U.attr(p.onFile)}" alt="${U.attr(p.name || 'Signature')}"></div>
            <div class="nm">${U.esc(p.name || '')}</div>
          </div>
        </div>`;
      }
      return `<div>
        <div class="row between mb-6">
          <span class="flabel" style="margin:0">${U.esc(p.label)}${p.req === false ? '' : '<span class="req">*</span>'}</span>
          <button class="btn btn-quiet btn-sm" type="button" data-clearsig="${U.attr(p.key)}">${ico('rotate')} Clear</button>
        </div>
        <div class="wo-sig">
          <canvas data-sig="${U.attr(p.key)}"></canvas>
          <div class="nm">${U.esc(p.name || '')}</div>
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  /**
   * Wire every signature canvas inside `root` and return
   * { key: { inked, data, clear } }. `seed` re-inks boxes that were already
   * signed, so reopening a document to edit it does not wipe the signatures.
   */
  function sigMount(root, seed) {
    const sig = {};
    U.qsa('[data-sig]', root).forEach(function (cv) {
      const key = cv.getAttribute('data-sig');
      const st = sig[key] = { inked: false, data: (seed && seed[key]) || '', clear: null };
      const g = cv.getContext('2d');
      if (!g) return;
      const dpr = w.devicePixelRatio || 1;

      /**
       * Size the buffer to the box. Inside a modal the box can still be
       * unmeasured on the first pass, so a zero width is re-measured a frame
       * later — otherwise every stroke lands offset from the pointer.
       */
      function size() {
        const px = cv.getBoundingClientRect().width || cv.offsetWidth ||
          (cv.parentNode && cv.parentNode.clientWidth) || 0;
        cv.width = Math.max(240, px) * dpr;
        cv.height = 108 * dpr;
        g.scale(dpr, dpr);
        g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0F1729';

        // Already signed — put the ink back so it can be seen and kept.
        if (st.data && st.data.indexOf('data:image') === 0) {
          const img = new Image();
          img.onload = function () { g.drawImage(img, 0, 0, cv.width / dpr, cv.height / dpr); };
          img.src = st.data;
          st.inked = true; cv.classList.add('inked');
        }
        return px;
      }
      if (!size() && w.requestAnimationFrame) w.requestAnimationFrame(size);

      let drawing = false;
      const pt = e => {
        const r = cv.getBoundingClientRect();
        const p = e.touches ? e.touches[0] : e;
        return { x: p.clientX - r.left, y: p.clientY - r.top };
      };
      const down = e => { e.preventDefault(); drawing = true; st.inked = true; cv.classList.add('inked');
        const p = pt(e); g.beginPath(); g.moveTo(p.x, p.y); };
      const move = e => { if (!drawing) return; e.preventDefault(); const p = pt(e); g.lineTo(p.x, p.y); g.stroke(); };
      const up = () => { if (drawing) { drawing = false; try { st.data = cv.toDataURL('image/png'); } catch (err) { st.data = 'signed'; } } };

      cv.addEventListener('mousedown', down);
      cv.addEventListener('mousemove', move);
      w.addEventListener('mouseup', up);
      cv.addEventListener('touchstart', down, { passive: false });
      cv.addEventListener('touchmove', move, { passive: false });
      cv.addEventListener('touchend', up);
      st.clear = () => { g.clearRect(0, 0, cv.width, cv.height); st.inked = false; st.data = ''; cv.classList.remove('inked'); };
    });

    root.addEventListener('click', function (e) {
      const b = e.target.closest('[data-clearsig]');
      if (!b) return;
      e.preventDefault();
      const st = sig[b.getAttribute('data-clearsig')];
      if (st && st.clear) st.clear();
    });

    return sig;
  }

  w.C = {
    pageHead, backLink, stat, trend, clientCell, userCell, techStack,
    jobStatus, jobType, jobRow, sectionCard, alertRow, kv, tabsBar,
    searchRow, contractPill, ratingRow, hint, sigBoxes, sigMount
  };
})(window);
