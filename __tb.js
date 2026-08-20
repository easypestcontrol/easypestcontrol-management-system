(function () {
  function build() {
    var page = document.getElementById('page');
    var head = page.querySelector('.pagehead');
    var wk = page.querySelector('.dweek');
    var navrow = page.querySelector('.row.between.wrap.g-10.mb-12');
    if (!head || !wk || !navrow) return false;
    var branch = head.querySelector('#bdBranch');
    var dateEl = navrow.querySelector('#bdDate');
    var auto = head.querySelector('[data-auto]');
    var autoDisabled = auto.hasAttribute('disabled');
    var cnt = (auto.textContent.trim().match(/(\d+)$/) || [])[1] || '';
    var autoSvg = auto.querySelector('svg').outerHTML;
    var balSvg = head.querySelector('[data-balance] svg').outerHTML;
    var denseSvg = head.querySelector('[data-dense] svg').outerHTML;
    var printSvg = head.querySelector('[data-print] svg').outerHTML;
    var prevSvg = navrow.querySelector('[data-nav="-1"] svg').outerHTML;
    var nextSvg = navrow.querySelector('[data-nav="1"] svg').outerHTML;
    var seg = head.querySelector('.seg');
    var zoomBtns = [].map.call(seg.querySelectorAll('button'), function (b) {
      return '<button data-zoom="' + b.getAttribute('data-zoom') + '" class="' + b.className + '">' + b.textContent.trim() + '</button>';
    }).join('');
    var chips = [].map.call(navrow.querySelectorAll('.dchips .chip'), function (c) {
      var a = c.hasAttribute('data-prio') ? 'data-prio' : 'data-filter="' + c.getAttribute('data-filter') + '"';
      var s = c.querySelector('svg');
      return '<button class="' + c.className + '" ' + a + '>' + (s ? s.outerHTML : '') + c.textContent.trim() + '</button>';
    }).join('');
    var days = [].map.call(wk.querySelectorAll('.dday'), function (d) {
      var n = d.querySelector('.dn').textContent, w = d.querySelector('.dw').textContent;
      var c = d.querySelector('.dc').textContent.trim();
      var num = (c.match(/^(\d+)/) || [])[1];
      var wait = d.querySelector('.dwait');
      return '<button class="' + d.className + '" data-day="' + d.getAttribute('data-day') + '">' +
        '<span class="dw">' + w + '</span><span class="dn">' + n + '</span>' +
        '<span class="dc">' + (num || '0') + '</span>' + (wait ? '<i class="dwait"></i>' : '') + '</button>';
    }).join('');
    var statSpans = [].map.call(navrow.querySelectorAll('.row.g-14 > span'), function (s) {
      return '<span class="' + s.className + '">' + s.innerHTML + '</span>';
    }).join('');
    statSpans = statSpans.replace(/of the day used/g, 'of day').replace(/ over hours/g, ' over').replace(/ services/g, ' jobs');

    var html = '<div class="dtb noprint">' +
      '<div class="dtb-row">' +
      '<div class="dnav">' +
      '<button class="btn btn-ghost btn-sm ico-only" data-nav="-1" title="Previous day">' + prevSvg + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-nav="0">Today</button>' +
      '<button class="btn btn-ghost btn-sm ico-only" data-nav="1" title="Next day">' + nextSvg + '</button>' +
      '<input class="input dtb-date" type="date" id="bdDate" value="' + dateEl.value + '">' +
      '</div>' +
      '<i class="vdivider"></i>' +
      '<div class="dweek">' + days + '</div>' +
      '<i class="vdivider"></i>' +
      '<div class="dtb-grp">' +
      '<button class="btn btn-soft btn-sm" data-balance>' + balSvg + ' Balance</button>' +
      '<button class="btn btn-primary btn-sm" data-auto' + (autoDisabled ? ' disabled' : '') + '>' + autoSvg + ' Auto-assign' + (cnt ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="dtb-row">' +
      '<select class="select dtb-branch" id="bdBranch">' + branch.innerHTML + '</select>' +
      '<i class="vdivider"></i>' +
      '<div class="dchips">' + chips + '</div>' +
      '<div class="dstats dtb-end">' + statSpans + '</div>' +
      '<i class="vdivider"></i>' +
      '<div class="seg">' + zoomBtns + '</div>' +
      '<i class="vdivider"></i>' +
      '<div class="dtb-grp">' +
      '<button class="btn btn-ghost btn-sm ico-only" data-dense title="Compact rows">' + denseSvg + '</button>' +
      '<button class="btn btn-ghost btn-sm ico-only" data-print title="Print this day">' + printSvg + '</button>' +
      '</div>' +
      '</div>' +
      '</div>';
    var frag = document.createElement('div');
    frag.innerHTML = html;
    page.insertBefore(frag.firstChild, head);
    head.remove(); wk.remove(); navrow.remove();
    return true;
  }

  function measure() {
    var out = [];
    var de = document.documentElement;
    out.push('VIEWPORT ' + de.clientWidth + 'x' + de.clientHeight + ' docScrollW=' + de.scrollWidth + ' bodyScrollW=' + document.body.scrollWidth);
    var page = document.getElementById('page');
    var pageBox = page.getBoundingClientRect();
    var pcs = getComputedStyle(page);
    out.push('page contentW=' + (page.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)).toFixed(1));
    var tb = page.querySelector('.dtb');
    var grid = page.querySelector('.dgrid');
    out.push('dtb h=' + tb.getBoundingClientRect().height.toFixed(2) + ' w=' + tb.getBoundingClientRect().width.toFixed(1));
    [].forEach.call(tb.querySelectorAll('.dtb-row'), function (r, i) {
      var kids = [].filter.call(r.children, function (k) { return k.getBoundingClientRect().width > 0; });
      var tops = {};
      kids.forEach(function (k) { var b = k.getBoundingClientRect(); tops[Math.round((b.top + b.bottom) / 2 / 6)] = 1; });
      out.push('  row' + i + ' h=' + r.getBoundingClientRect().height.toFixed(2) + ' lines=' + Object.keys(tops).length +
        ' [ ' + kids.map(function (k) { return (k.className || k.tagName) + ':' + k.getBoundingClientRect().width.toFixed(0); }).join(' | ') + ' ]');
    });
    out.push('CHROME page-top -> dgrid-top = ' + (grid.getBoundingClientRect().top - pageBox.top).toFixed(2));
    var hs = {};
    [].forEach.call(tb.querySelectorAll('.btn,.select,.input,.seg,.chip,.dday'), function (e) {
      var h = Math.round(e.getBoundingClientRect().height * 100) / 100;
      var k = (e.className || '').split(' ')[0] || e.tagName;
      hs[k] = hs[k] || {}; hs[k][h] = 1;
    });
    out.push('control heights: ' + Object.keys(hs).map(function (k) { return k + '=' + Object.keys(hs[k]).join('/'); }).join(' | '));
    var bad = [];
    [].forEach.call(page.querySelectorAll('*'), function (e) {
      var r = e.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > de.clientWidth + 0.5) bad.push('PASTVIEWPORT ' + e.tagName + '.' + (e.className || ''));
      var p = e.parentElement;
      if (!p || !p.closest || !p.closest('.dtb')) return;
      var pr = p.getBoundingClientRect(); var ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && r.right > pr.right + 0.6) bad.push('OVERPARENT ' + e.tagName + '.' + (e.className || '') + ' by ' + (r.right - pr.right).toFixed(1) + ' of .' + p.className);
    });
    out.push('dday clip: ' + [].map.call(tb.querySelectorAll('.dday'), function (d) { return d.clientWidth + '/' + d.scrollWidth; }).join(' '));
    out.push('overflow: ' + (bad.length ? bad.slice(0, 10).join(' ;; ') : 'NONE'));
    var db = page.querySelector('.dboard');
    out.push('dboard sW/cW=' + db.scrollWidth + '/' + db.clientWidth + ' dgrid sW/cW=' + grid.scrollWidth + '/' + grid.clientWidth);
    var pre = document.createElement('pre');
    pre.id = 'RES';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (document.getElementById('bdGrid')) {
      clearInterval(t);
      var ok = build();
      setTimeout(function () {
        var pre;
        if (!ok) { pre = document.createElement('pre'); pre.id = 'RES'; pre.textContent = 'BUILD FAILED'; document.body.appendChild(pre); return; }
        try { measure(); } catch (err) { pre = document.createElement('pre'); pre.id = 'RES'; pre.textContent = 'ERR ' + err.message; document.body.appendChild(pre); }
      }, 150);
    } else if (tries > 60) {
      clearInterval(t);
      var p = document.createElement('pre'); p.id = 'RES'; p.textContent = 'NO GRID'; document.body.appendChild(p);
    }
  }, 100);
})();
