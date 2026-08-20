/* ==========================================================================
   PestOps — UI kit: escaping, modals, toasts, pickers, small renderers
   ========================================================================== */
(function (w, d) {
  'use strict';

  /* ------------------------------------------------------------ dom utils */
  const qs  = (sel, root) => (root || d).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || d).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(s) { return esc(s).replace(/\n/g, ' '); }

  /* ------------------------------------------------------------- avatars */
  function initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] + (p.length > 1 ? (p[p.length - 1] || '')[0] : '')).toUpperCase();
  }
  function avatar(u, cls) {
    if (!u) return `<div class="av ${cls || ''}" style="background:#94A3B8">?</div>`;
    // A member with an uploaded photo shows the photo; everyone else keeps initials.
    if (u.photo) {
      return `<div class="av ${cls || ''}" title="${attr(u.name)}"
        style="background:${attr(u.color || '#0B7454')} url('${attr(u.photo)}') center/cover no-repeat;color:transparent"></div>`;
    }
    return `<div class="av ${cls || ''}" style="background:${attr(u.color || '#0B7454')}" title="${attr(u.name)}">${esc(initials(u.name))}</div>`;
  }
  function avatarName(name, color, cls) {
    return `<div class="av ${cls || ''}" style="background:${attr(color || '#0B7454')}">${esc(initials(name))}</div>`;
  }

  /* -------------------------------------------------------------- badges */
  function badge(text, cls, pip) {
    return `<span class="badge ${cls || 'b-gray'}">${pip ? '<i class="pip"></i>' : ''}${esc(text)}</span>`;
  }
  function stars(n, size) {
    const v = Math.round(n || 0);
    let out = `<span class="row g-2" style="color:#F59E0B">`;
    for (let i = 1; i <= 5; i++) {
      out += `<span style="opacity:${i <= v ? 1 : .22};display:inline-flex">${w.ico('star', '', size || 13)}</span>`;
    }
    return out + '</span>';
  }

  /* -------------------------------------------------------------- toasts */
  function toastRoot() {
    let r = qs('.toaster');
    if (!r) { r = d.createElement('div'); r.className = 'toaster'; d.body.appendChild(r); }
    return r;
  }
  function toast(msg, opts) {
    const o = opts || {};
    const el = d.createElement('div');
    el.className = 'toast ' + (o.tone || 'ok');
    const icon = o.icon || (o.tone === 'err' ? 'alertcircle' : o.tone === 'wa' ? 'whatsapp' : 'checkcircle');
    el.innerHTML = w.ico(icon) + `<div class="grow"><div>${esc(msg)}</div>${o.sub ? `<div class="tsub">${esc(o.sub)}</div>` : ''}</div>` +
      (o.action ? `<button class="tact" type="button">${esc(o.action.label)}</button>` : '');
    toastRoot().appendChild(el);

    // An action gets the toast a little longer, and dismisses it once used.
    if (o.action) {
      const b = qs('.tact', el);
      if (b) b.addEventListener('click', function () {
        try { o.action.run(); } catch (e) { /* the caller's problem, not the toast's */ }
        el.classList.add('out');
        setTimeout(() => el.remove(), 220);
      });
    }

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, o.ms || (o.action ? 6000 : 3200));
  }

  /* -------------------------------------------------------------- modals */
  let openModals = 0;

  function modal(cfg) {
    const c = cfg || {};
    const scrim = d.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML =
      `<div class="modal ${c.size ? 'modal-' + c.size : ''}" role="dialog" aria-modal="true">
         <div class="sheet-grip"></div>
         ${c.title ? `<div class="modal-hd">
           <div class="grow"><h3>${esc(c.title)}</h3>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</div>
           <button class="iconbtn" data-close aria-label="Close">${w.ico('x')}</button>
         </div>` : ''}
         <div class="modal-bd">${c.body || ''}</div>
         ${c.footer ? `<div class="modal-ft">${c.footer}</div>` : ''}
       </div>`;
    d.body.appendChild(scrim);
    d.body.style.overflow = 'hidden';
    openModals++;

    function close() {
      scrim.remove();
      openModals = Math.max(0, openModals - 1);
      if (!openModals) d.body.style.overflow = '';
      d.removeEventListener('keydown', onKey);
      // Fires however the modal went away — saved, cancelled, Escape or scrim.
      if (c.onClose) c.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    scrim.addEventListener('click', e => {
      if (e.target === scrim && c.dismissable !== false) close();
      if (e.target.closest('[data-close]')) close();
    });
    d.addEventListener('keydown', onKey);

    const root = qs('.modal', scrim);
    if (c.onMount) c.onMount(root, close);
    const f = qs('input,select,textarea', root);
    if (f && w.innerWidth > 720) setTimeout(() => f.focus(), 60);
    return { el: root, close: close };
  }

  function confirm(cfg) {
    const c = cfg || {};
    return new Promise(resolve => {
      const m = modal({
        title: c.title || 'Are you sure?',
        body: `<p style="font-size:14px;color:var(--ink-2);line-height:1.6">${esc(c.message || '')}</p>`,
        footer:
          `<button class="btn btn-ghost" data-close>${esc(c.cancelText || 'Cancel')}</button>
           <button class="btn ${c.tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(c.confirmText || 'Confirm')}</button>`,
        onMount(root, close) {
          root.addEventListener('click', e => {
            if (e.target.closest('[data-ok]')) { close(); resolve(true); }
            else if (e.target.closest('[data-close]')) { resolve(false); }
          });
        }
      });
      m.el.closest('.modal-scrim').addEventListener('click', e => {
        if (e.target.classList.contains('modal-scrim')) resolve(false);
      });
    });
  }

  /* ------------------------------------------------------------ dropdowns */
  d.addEventListener('click', e => {
    const trigger = e.target.closest('[data-drop]');
    qsa('.dropmenu.shown').forEach(m => {
      if (!trigger || m !== qs('.dropmenu', trigger.closest('.dropdown'))) {
        m.classList.remove('shown'); m.style.display = 'none';
      }
    });
    if (trigger) {
      const menu = qs('.dropmenu', trigger.closest('.dropdown'));
      if (menu) {
        const showing = menu.classList.toggle('shown');
        menu.style.display = showing ? 'block' : 'none';
      }
      e.stopPropagation();
    }
  });

  /* ------------------------------------------------------------- widgets */
  function empty(cfg) {
    const c = cfg || {};
    return `<div class="empty">
      <div class="ico">${w.ico(c.icon || 'search')}</div>
      <h4>${esc(c.title || 'Nothing here yet')}</h4>
      <p>${esc(c.text || '')}</p>
      ${c.action ? c.action : ''}
    </div>`;
  }

  function field(label, control, hint, req) {
    return `<div class="field">
      <label class="flabel">${esc(label)}${req ? '<span class="req">*</span>' : ''}</label>
      ${control}
      ${hint ? `<div class="fhint">${esc(hint)}</div>` : ''}
    </div>`;
  }

  function selectOpts(list, valueKey, labelKey, selected) {
    return list.map(o => {
      const v = typeof o === 'string' ? o : o[valueKey];
      const l = typeof o === 'string' ? o : o[labelKey];
      return `<option value="${attr(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('');
  }

  /**
   * Scrollable tick-list used wherever one record belongs to many of something
   * (a member posted to several branches, services on a lead).
   * `items` are { id, label, sub }. Read the result with
   * qsa('input[name=<name>]:checked').
   */
  function checklist(name, items, selected, opts) {
    const o = opts || {};
    const sel = selected || [];
    const rows = (items || []).map(it => `<label class="check" style="padding:5px 0">
      <input type="checkbox" name="${attr(name)}" value="${attr(it.id)}"${sel.indexOf(it.id) >= 0 ? ' checked' : ''}>
      <span class="box">${w.ico('check')}</span>
      <span class="txt">${esc(it.label)}${it.sub ? ` <span class="muted">· ${esc(it.sub)}</span>` : ''}</span>
    </label>`).join('');
    return `<div class="card" style="max-height:${o.max || 172}px;overflow-y:auto;padding:8px 12px">
      ${rows || `<div class="t-sm muted" style="padding:7px 0">${esc(o.empty || 'Nothing to choose from yet.')}</div>`}
    </div>`;
  }

  /** Downscale a picked image so photo-heavy records still fit in localStorage. */
  function shrinkImage(file, max) {
    return fileToDataUrl(file).then(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (max || 520) / Math.max(img.width, img.height));
        const cv = d.createElement('canvas');
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

  function bar(pct, tone) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return `<div class="bar"><i class="${tone || ''}" style="width:${p}%"></i></div>`;
  }

  function ring(pct, size, color) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return `<div class="ring" style="--p:${p};--sz:${size || 62}px;--c:${color || 'var(--brand-500)'}"><span>${p}%</span></div>`;
  }

  /** Simple two-series column chart. rows: [{label, a, b}] */
  function chart(rows, cfg) {
    const c = cfg || {};
    const max = Math.max(1, ...rows.map(r => Math.max(r.a || 0, (r.a || 0) + (r.b || 0))));
    return `<div class="chart">${rows.map(r => {
      const ha = Math.round((r.a || 0) / max * 100);
      const hb = Math.round((r.b || 0) / max * 100);
      return `<div class="chart-col">
        <div class="chart-bar-wrap">
          ${r.b ? `<div class="chart-bar b2" style="height:${hb}%" title="${attr(c.bLabel || 'B')}: ${r.b}"></div>` : ''}
          <div class="chart-bar" style="height:${ha}%;${r.b ? 'border-radius:4px 4px 0 0' : ''}" title="${attr(c.aLabel || 'A')}: ${r.a}"></div>
        </div>
        <div class="chart-lbl">${esc(r.label)}</div>
      </div>`;
    }).join('')}</div>`;
  }

  /** Donut using conic-gradient. slices: [{label, n, color}] */
  function donut(slices, size) {
    const total = slices.reduce((s, x) => s + x.n, 0) || 1;
    let acc = 0;
    const stops = slices.map(s => {
      const from = acc / total * 100;
      acc += s.n;
      const to = acc / total * 100;
      return `${s.color} ${from}% ${to}%`;
    }).join(',');
    const sz = size || 132;
    return `<div style="position:relative;width:${sz}px;height:${sz}px;flex-shrink:0">
      <div style="width:100%;height:100%;border-radius:50%;background:conic-gradient(${stops})"></div>
      <div style="position:absolute;inset:26%;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center">
        <div><div style="font-size:20px;font-weight:700;letter-spacing:-.02em">${total}</div>
        <div style="font-size:9.5px;color:var(--muted);font-weight:600">VISITS</div></div>
      </div>
    </div>`;
  }

  /* -------------------------------------------------------------- misc */
  function copy(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast((label || 'Copied') + ' to clipboard'),
        () => toast('Copy failed', { tone: 'err' })
      );
    } else { toast('Copied: ' + text); }
  }

  /** Demo WhatsApp send — simulates the message the customer sends manually today. */
  function whatsapp(phone, message, label) {
    toast(label || 'WhatsApp message sent', { tone: 'wa', icon: 'whatsapp', sub: phone + ' — ' + message.slice(0, 58) + (message.length > 58 ? '…' : '') });
  }

  /* ----------------------------------------------------------- phone / wa */
  const DEFAULT_CC = '91';

  /**
   * A number in the form WhatsApp wants: country code + subscriber, digits
   * only. A bare 10-digit Indian number gets +91; anything already carrying a
   * country code is left alone. Leading 0 or 00 is stripped either way.
   */
  function phoneDigits(raw, cc) {
    let x = String(raw == null ? '' : raw).replace(/\D/g, '');
    x = x.replace(/^00+/, '').replace(/^0+/, '');
    if (!x) return '';
    if (x.length === 10) x = (cc || DEFAULT_CC) + x;
    return x;
  }

  /** The same number, readable: +91 74189 32321. */
  function phonePretty(raw, cc) {
    const x = phoneDigits(raw, cc);
    if (!x) return '';
    if (x.length === 12 && x.indexOf('91') === 0) {
      return '+91 ' + x.slice(2, 7) + ' ' + x.slice(7);
    }
    return '+' + x;
  }

  /** A number is usable once it has a country code and a plausible length. */
  function phoneValid(raw, cc) {
    const x = phoneDigits(raw, cc);
    return x.length >= 11 && x.length <= 15;
  }

  /**
   * wa.me opens the chat with one specific number, message already typed.
   * It cannot carry a file — that is what the share sheet is for, and the
   * share sheet in turn cannot be addressed. One or the other, never both.
   */
  function waLink(phone, message, cc) {
    return 'https://wa.me/' + phoneDigits(phone, cc) +
      '?text=' + encodeURIComponent(message || '');
  }

  /** The desktop / mobile app protocol — skips the wa.me redirect page. */
  function waAppLink(phone, message, cc) {
    return 'whatsapp://send?phone=' + phoneDigits(phone, cc) +
      '&text=' + encodeURIComponent(message || '');
  }

  /**
   * Open a URL in a new tab from inside a click handler. An anchor click
   * survives pop-up blockers that reject window.open.
   */
  function openTab(url) {
    try {
      const a = d.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      d.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (e) {
      const win = w.open(url, '_blank', 'noopener');
      if (!win) {
        toast('Allow pop-ups to open WhatsApp', { tone: 'err', sub: 'Or copy the message and send it yourself' });
        return false;
      }
      return true;
    }
  }

  /** Straight into the chat with that number. */
  function openWhatsapp(phone, message, opts) {
    const o = opts || {};
    if (!phoneValid(phone, o.cc)) {
      toast('That number does not look right', { tone: 'err', sub: 'Include the country code, or use a 10-digit Indian number' });
      return false;
    }
    return openTab(o.app ? waAppLink(phone, message, o.cc) : waLink(phone, message, o.cc));
  }

  /** Hand the browser a file to save — used for service sheets and exports. */
  function download(filename, dataUrl) {
    const a = d.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'download';
    d.body.appendChild(a);
    a.click();
    a.remove();
  }

  function fileSizeText(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function lightbox(src) {
    modal({
      size: 'lg',
      body: `<img src="${attr(src)}" alt="" style="width:100%;border-radius:var(--r-md)">`,
      onMount(root) { qs('.modal-bd', root).style.padding = '10px'; }
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const a = arguments, c = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(c, a), ms || 200);
    };
  }

  function timeAgo(stamp) {
    if (!stamp) return '';
    const t = new Date(String(stamp).replace(' ', 'T'));
    const mins = Math.round((Date.now() - t.getTime()) / 60000);
    if (isNaN(mins)) return '';
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const h = Math.round(mins / 60);
    if (h < 24) return h + ' hr' + (h > 1 ? 's' : '') + ' ago';
    const dd = Math.round(h / 24);
    if (dd < 30) return dd + ' day' + (dd > 1 ? 's' : '') + ' ago';
    return w.S.fmtDate(String(stamp).slice(0, 10));
  }

  const TONE_CLS = { green: 'i-green', red: 'i-red', amber: 'i-amber', blue: 'i-blue', violet: 'i-violet', brand: 'i-brand', gray: 'i-gray' };

  w.U = {
    qs, qsa, esc, attr, initials, avatar, avatarName, badge, stars,
    toast, modal, confirm, empty, field, selectOpts, checklist, shrinkImage,
    bar, ring, chart, donut,
    copy, whatsapp, waLink, waAppLink, openWhatsapp, openTab,
    phoneDigits, phonePretty, phoneValid, download, fileSizeText,
    fileToDataUrl, lightbox, debounce, timeAgo, TONE_CLS
  };
})(window, document);
