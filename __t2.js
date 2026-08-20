(function(){
  var LOG = [];
  function px(n){ return Math.round(n*100)/100; }

  function harvest(page){
    var q = function(s){ return page.querySelector(s); };
    var ph = q('.pagehead'), dweek = q('.dweek');
    if(!ph || !dweek) return null;
    var oldRow = dweek.nextElementSibling;
    return { ph:ph, dweek:dweek, oldRow:oldRow,
      auto:q('[data-auto]'), balance:q('[data-balance]'), sel:q('#bdBranch'),
      seg:q('.seg'), dense:q('[data-dense]'), print:q('[data-print]'),
      date:q('#bdDate'), chips:q('.dchips'),
      stats: oldRow ? oldRow.querySelector('.row.g-14') : null };
  }

  function nums(statsEl){
    var t = statsEl ? statsEl.textContent.replace(/\s+/g,' ') : '';
    return {
      total:  (t.match(/(\d+)\s*services/)||[0,'0'])[1],
      asg:    (t.match(/(\d+)\s*assigned/)||[0,'0'])[1],
      wait:   (t.match(/(\d+)\s*waiting/)||[0,'0'])[1],
      busy:   (t.match(/(\d+)\/(\d+)\s*busy/)||[0,'0','0'])[1],
      people: (t.match(/(\d+)\/(\d+)\s*busy/)||[0,'0','0'])[2],
      util:   (t.match(/(\d+)%/)||[0,'0'])[1],
      over:   (t.match(/(\d+)\s*over hours/)||[0,''])[1]
    };
  }

  function build(){
    var page = document.getElementById('page');
    var h = harvest(page);
    if(!h) return false;

    var n = nums(h.stats);
    var utilCls = n.util > 100 ? ' bad' : n.util > 85 ? ' warn' : '';
    var dsum =
      '<div class="dsum" role="group" aria-label="Day summary">' +
        '<div class="f on"><b>'+n.asg+'</b><i>/'+n.total+'</i><span>assigned</span></div>' +
        '<div class="f wait'+(n.wait==='0'?' zero':'')+'"><b>'+n.wait+'</b><span>waiting</span></div>' +
        '<div class="f"><b>'+n.busy+'</b><i>/'+n.people+'</i><span>busy</span></div>' +
        '<div class="f util'+utilCls+'"><span class="bar"><span style="width:'+Math.min(100,n.util)+'%"></span></span><b>'+n.util+'%</b><span>of day</span></div>' +
        (n.over ? '<div class="f over"><b>'+n.over+'</b><span>over hours</span></div>' : '') +
      '</div>';

    var mlab = (function(){
      var cells = h.dweek.querySelectorAll('[data-day]');
      if(!cells.length) return '';
      var a = new Date(cells[0].getAttribute('data-day')+'T00:00:00');
      var b = new Date(cells[cells.length-1].getAttribute('data-day')+'T00:00:00');
      var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if(a.getMonth()===b.getMonth()) return M[a.getMonth()]+' '+a.getFullYear();
      if(a.getFullYear()===b.getFullYear()) return M[a.getMonth()]+' – '+M[b.getMonth()]+' '+a.getFullYear();
      return M[a.getMonth()]+' '+a.getFullYear()+' – '+M[b.getMonth()]+' '+b.getFullYear();
    })();

    var card = document.createElement('div');
    card.className = 'dctl noprint';
    card.innerHTML =
      '<div class="dctl-r1">' +
        '<span class="dctl-when">'+mlab+'</span>' +
        '<span class="dctl-sep"></span>' +
        '<div class="dctl-grp week">' +
          '<button class="iconbtn" data-nav="-1" aria-label="Previous day" title="Previous day">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
          '<div class="dweek" id="__wk"></div>' +
          '<button class="iconbtn" data-nav="1" aria-label="Next day" title="Next day">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>' +
        '</div>' +
        '<div class="dctl-grp jump">' +
          '<span class="dctl-sep"></span>' +
          '<button class="btn btn-ghost btn-sm" data-nav="0">Today</button>' +
          '<span id="__date"></span>' +
        '</div>' +
      '</div>' +
      '<div class="dctl-r2">' +
        '<div class="dctl-grp lens"><span id="__chips"></span><span id="__sel"></span></div>' +
        dsum +
        '<div class="dctl-grp tools">' +
          '<span id="__seg"></span>' +
          '<span class="dctl-sep"></span>' +
          '<span id="__dense"></span><span id="__print"></span>' +
          '<span class="dctl-sep"></span>' +
          '<span id="__bal"></span><span id="__auto"></span>' +
        '</div>' +
      '</div>';

    h.ph.parentNode.insertBefore(card, h.ph);
    var put = function(id, el){ var s = card.querySelector(id); if(el && s) s.parentNode.replaceChild(el, s); };
    var wk = card.querySelector('#__wk');
    wk.innerHTML = h.dweek.innerHTML;
    wk.removeAttribute('id');
    put('#__date', h.date);
    put('#__chips', h.chips);
    put('#__sel', h.sel);
    put('#__seg', h.seg);
    put('#__dense', h.dense);
    put('#__print', h.print);
    put('#__bal', h.balance);
    put('#__auto', h.auto);

    [h.sel, h.date].forEach(function(e){ if(e) e.removeAttribute('style'); });
    if(h.auto){
      h.auto.className = 'btn btn-primary btn-sm';
      var cnt = (h.auto.textContent.match(/(\d+)/)||[0,''])[1];
      var sv = h.auto.querySelector('svg');
      h.auto.innerHTML = (sv?sv.outerHTML:'') + ' Auto-assign' + (cnt ? '<span class="cnt">'+cnt+'</span>' : '');
      if(h.auto.disabled) h.auto.title = 'Nothing is waiting — every job today has somebody on it';
    }
    if(h.balance) h.balance.title = 'Even out the workload across the team';
    if(/[?&]noq=1/.test(location.href) && h.auto){
      h.auto.disabled = true;
      h.auto.title = 'Nothing is waiting — every job today has somebody on it';
      var sv2 = h.auto.querySelector('svg');
      h.auto.innerHTML = (sv2?sv2.outerHTML:'') + ' Auto-assign';
    }
    if(h.dense) h.dense.classList.toggle('on', document.querySelector('.dboard.dense') != null);

    h.ph.remove();
    h.dweek.remove();
    if(h.oldRow) h.oldRow.remove();
    return true;
  }

  function measure(tag){
    var page = document.getElementById('page');
    var board = page.querySelector('.dboard');
    var drow = page.querySelector('.drow');
    var pr = page.getBoundingClientRect();
    var o = {
      tag: tag,
      vw: document.documentElement.clientWidth,
      chromeToFirstRow: drow ? px(drow.getBoundingClientRect().top - pr.top) : null,
      chromeToBoard: board ? px(board.getBoundingClientRect().top - pr.top) : null,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth
    };
    var d = page.querySelector('.dctl');
    if(d){
      o.dctlH = px(d.getBoundingClientRect().height);
      var r1 = d.querySelector('.dctl-r1'), r2 = d.querySelector('.dctl-r2');
      o.r1H = px(r1.getBoundingClientRect().height);
      o.r2H = px(r2.getBoundingClientRect().height);
      var kids = [].slice.call(r2.children);
      var tops = kids.map(function(k){ return px(k.getBoundingClientRect().top); });
      o.r2Lines = tops.filter(function(v,i){ return tops.indexOf(v)===i; }).length;
      o.r2Widths = kids.map(function(k){ return k.className.split(' ')[0]+':'+px(k.getBoundingClientRect().width); }).join(' | ');
      o.r2Inner = px(r2.clientWidth);
      var k1 = [].slice.call(r1.children);
      var t1 = k1.map(function(k){ return px(k.getBoundingClientRect().top); });
      o.r1Lines = t1.filter(function(v,i){ return t1.indexOf(v)===i; }).length;
      o.r1Widths = k1.map(function(k){ return ((k.className||k.tagName)+'').split(' ')[0]+':'+px(k.getBoundingClientRect().width); }).join(' | ');
      var dd = d.querySelector('.dday');
      if(dd) o.dday = px(dd.getBoundingClientRect().height) + 'h x ' + px(dd.getBoundingClientRect().width) + 'w';
      var ds = d.querySelector('.dsum');
      if(ds) o.dsumW = px(ds.getBoundingClientRect().width);
      var hs = {};
      [].slice.call(d.querySelectorAll('.btn,.select,.input,.seg,.iconbtn,.chip,.dsum')).forEach(function(e){
        var k = (e.className+'').split(' ').slice(0,2).join('.');
        hs[k] = px(e.getBoundingClientRect().height);
      });
      o.heights = JSON.stringify(hs);
    } else {
      var ph = page.querySelector('.pagehead'), dw = page.querySelector('.dweek');
      if(ph) o.pageheadH = px(ph.getBoundingClientRect().height);
      if(dw) o.dweekH = px(dw.getBoundingClientRect().height);
      if(dw && dw.nextElementSibling) o.oldRowH = px(dw.nextElementSibling.getBoundingClientRect().height);
    }
    var bad = [];
    [].slice.call(document.querySelectorAll('body *')).forEach(function(e){
      var r = e.getBoundingClientRect();
      if(r.width && r.right > document.documentElement.clientWidth + 1)
        bad.push(e.tagName+'.'+((e.className+'').split(' ')[0]||'')+' right='+px(r.right));
    });
    o.pastViewport = bad.slice(0,8).join(' ;; ') || 'none';
    return o;
  }

  function go(){
    var page = document.getElementById('page');
    if(!page || !page.querySelector('.dboard')) return setTimeout(go, 150);
    var before = measure('BEFORE');
    var ok = build();
    setTimeout(function(){
      var after = measure(ok ? 'AFTER' : 'BUILD-FAILED');
      var pre = document.createElement('pre');
      pre.id = 'RES';
      pre.textContent = '===BEFORE===\n' + JSON.stringify(before,null,1) + '\n===AFTER===\n' + JSON.stringify(after,null,1) + '\n===END===';
      document.body.appendChild(pre);
    }, 150);
  }
  if(document.readyState === 'complete') setTimeout(go,400); else window.addEventListener('load', function(){ setTimeout(go,400); });
})();
