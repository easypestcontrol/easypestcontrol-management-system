/* ==========================================================================
   Views: AMC and One-time service — the two halves of delivery.

   They are deliberately shaped differently, because the work is different.
   An AMC is a contract with a plan behind it, so that module is contract-led:
   each row is an agreement, and its whole visit schedule sits underneath it.
   A one-time service has nothing recurring about it, so that module is a
   plain diary of services by date.
   ========================================================================== */
(function (w) {
  'use strict';
  const V = (w.V = w.V || {});
  const esc = U.esc, attr = U.attr;

  const isOneTime = c => c && c.mode === 'onetime';

  /**
   * Which module a service belongs to. The contract decides: one raised as a
   * one-time contract stays one-time however it was generated, and a job with
   * no contract at all is a one-off by definition.
   */
  function categoryOf(j) {
    if (!j.contractId) return 'onetime';
    return isOneTime(S.contract(j.contractId)) ? 'onetime' : 'amc';
  }

  /* ====================================================== AMC — contract led */
  // Cards start closed — the list reads as one row per contract, and the
  // schedule underneath is opened on demand. Ids the user has opened are
  // remembered, so switching tabs does not shut them again.
  const amcState = { tab: 'active', q: '', expanded: {} };

  const AMC_TABS = [
    { id: 'active',   label: 'Active' },
    { id: 'expiring', label: 'Expiring soon' },
    { id: 'expired',  label: 'Expired' },
    { id: 'all',      label: 'All' }
  ];

  function amcContracts() {
    return S.get().contracts.filter(c => !isOneTime(c));
  }

  function amcRows() {
    const q = amcState.q.toLowerCase();
    return amcContracts().filter(c => {
      const k = S.contractStatus(c).key;
      if (amcState.tab === 'active' && k === 'expired') return false;
      if (amcState.tab === 'expiring' && k !== 'expiring') return false;
      if (amcState.tab === 'expired' && k !== 'expired') return false;
      if (!q) return true;
      return (c.id + S.clientName(c.clientId) + (c.site || '')).toLowerCase().indexOf(q) >= 0;
    }).sort((a, b) => a.end < b.end ? -1 : 1);
  }

  V.amc = {
    title: 'AMC',

    render(ctx) {
      const all = amcContracts();
      const rows = amcRows();
      const counts = {
        active: all.filter(c => S.contractStatus(c).key !== 'expired').length,
        expiring: all.filter(c => S.contractStatus(c).key === 'expiring').length,
        expired: all.filter(c => S.contractStatus(c).key === 'expired').length,
        all: all.length
      };
      const visits = S.get().jobs.filter(j => categoryOf(j) === 'amc');
      const dueToday = visits.filter(j => S.dayDelta(j.date) === 0 && j.status !== 'cancelled').length;
      const value = all.filter(c => S.contractStatus(c).key !== 'expired')
        .reduce((s, c) => s + (c.value || 0), 0);
      const canPlan = ['admin', 'ops'].indexOf(ctx.role) >= 0;

      return C.pageHead({
        title: 'AMC',
        sub: 'Recurring contracts and every visit they produce',
        actions: canPlan
          ? `<button class="btn btn-primary btn-sm" data-newcontract>${ico('plus')} New AMC contract</button>` : ''
      }) +

      `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Live contracts', value: counts.active, icon: 'shield', tone: 'i-brand',
          foot: counts.all + ' on the books all time' })}
        ${C.stat({ label: 'Annual value', value: S.moneyShort(value), icon: 'rupee', tone: 'i-violet',
          foot: 'Across every live contract' })}
        ${C.stat({ label: 'Visits today', value: dueToday, icon: 'calendar',
          tone: dueToday ? 'i-blue' : 'i-gray', foot: dueToday ? 'On the board now' : 'Nothing today' })}
        ${C.stat({ label: 'Expiring soon', value: counts.expiring, icon: 'timer',
          tone: counts.expiring ? 'i-amber' : 'i-green',
          foot: counts.expiring ? 'Within 30 days — send renewals' : 'None in the next 30 days' })}
      </div>` +

      C.searchRow('Search by contract number, customer or site…', '', 'amcq') +
      C.tabsBar(AMC_TABS.map(t => Object.assign({}, t, { n: counts[t.id] })), amcState.tab) +

      `<div class="mt-16">${
        rows.length ? rows.map(c => {
          const pr = S.contractProgress(c);
          const st = S.contractStatus(c);
          const cl = S.client(c.clientId);
          // The point of this card: every remaining date, not just the next.
          const upcoming = pr.jobs
            .filter(j => j.status !== 'completed' && j.status !== 'cancelled')
            .sort((a, b) => a.date < b.date ? -1 : 1);

          const folded = !amcState.expanded[c.id];

          return `<section class="card mb-16">
            <div class="card-hd">
              <div class="row g-10 grow" style="min-width:0">
                ${U.avatarName(cl ? cl.name : '?', cl ? cl.color : '', 'av-sm')}
                <div style="min-width:0">
                  <div class="fw-7 truncate" style="font-size:14px">${esc(cl ? cl.name : '—')}</div>
                  <div class="t-sm muted"><span class="mono">${esc(c.id)}</span> · ${esc(S.planSummary(c, true))}</div>
                </div>
              </div>
              <div class="row g-8">
                ${(function () {
                  const sf = S.staffing(c);
                  return (c.plan || []).length && !sf.ok
                    ? `<span class="badge b-amber" title="${attr(sf.short.map(r => r.name + ': ' + r.short + ' more').join(', '))}">${ico('alert')}${sf.missing} to assign</span>`
                    : '';
                })()}
                <span class="badge ${st.cls}"><i class="pip"></i>${esc(st.label)}</span>
                <a class="btn btn-ghost btn-sm nowrap" href="#/contracts/${attr(c.id)}">Open contract ${ico('cright', '', 14)}</a>
                <button class="foldbtn ${folded ? 'folded' : ''}" data-fold="${attr(c.id)}"
                  title="${folded ? 'Show' : 'Hide'} the schedule" aria-expanded="${folded ? 'false' : 'true'}">
                  ${ico('cdown', '', 17)}</button>
              </div>
            </div>

            <div class="card-bd foldbody ${folded ? 'folded' : ''}" data-foldbody="${attr(c.id)}">
              <div class="row g-20 wrap mb-14">
                <div style="min-width:158px">
                  <div class="t-xs muted fw-6">PROGRESS</div>
                  <div class="fw-7 t-md">${pr.done} <span class="muted fw-5">of ${pr.total} visits</span></div>
                  ${U.bar(pr.pct)}
                </div>
                <div><div class="t-xs muted fw-6">PERIOD</div>
                  <div class="t-sm mt-4">${esc(S.fmtShort(c.start))} → ${esc(S.fmtDate(c.end))}</div></div>
                <div><div class="t-xs muted fw-6">VALUE</div>
                  <div class="t-sm mt-4"><span class="fw-7">${S.money(c.value)}</span>
                    <span class="muted">· ${esc(c.billing || '—')}</span></div></div>
                <div><div class="t-xs muted fw-6">SERVICES</div>
                  <div class="row g-4 mt-4">${(c.serviceIds || []).map(x =>
                    `<span class="badge b-gray">${esc((S.service(x) || {}).code || '')}</span>`).join('')}</div></div>
              </div>

              <div class="t-xs muted fw-6 mb-8">VISIT SCHEDULE · ${upcoming.length} remaining of ${pr.total}</div>
              ${upcoming.length
                ? `<div class="tablewrap"><table class="tbl">
                    <thead><tr><th style="width:42px">#</th><th>Date</th><th>Time</th>
                      <th>Services</th><th>Technician</th><th>Status</th></tr></thead>
                    <tbody>${upcoming.map(j => `<tr class="clickable" data-go="#/jobs/${attr(j.id)}">
                      <td class="muted">${j.visitNo || ''}</td>
                      <td class="nowrap"><div class="fw-6">${esc(S.fmtDate(j.date))}</div>
                        <div class="t-xs muted">${esc(S.relDay(j.date))}</div></td>
                      <td class="nowrap">${esc(S.fmtTime(j.slot))}</td>
                      <td><div class="row g-4">${(j.serviceIds || []).map(x =>
                        `<span class="badge b-gray">${esc((S.service(x) || {}).code || '')}</span>`).join('')}</div></td>
                      <td class="nowrap">${(j.techIds || []).length
                        ? esc(S.userName(j.techIds[0]))
                        : '<span class="badge b-amber">Unassigned</span>'}</td>
                      <td>${C.jobStatus(j)}</td>
                    </tr>`).join('')}</tbody>
                  </table></div>`
                : (pr.done >= pr.total
                    ? `<div class="t-sm muted">Every visit on this contract is done — renew it to generate the next term.</div>`
                    : `<div class="banner ban-amber">${ico('alert')}<div>
                        <div class="bt">${pr.total - pr.done} visit${pr.total - pr.done === 1 ? '' : 's'} still owed, none scheduled</div>
                        The plan says ${pr.total} but only ${pr.jobs.length} have been generated. Open the contract and
                        edit the plan to put the rest on the calendar.</div></div>`)}
            </div>
          </section>`;
        }).join('')
        : U.empty({ icon: 'shield', title: 'No AMC contracts in this view',
            text: 'Create one and its whole visit schedule is generated for you.' })
      }</div>`;
    },

    mount(root, ctx) {
      const qi = U.qs('#amcq', root);
      if (qi) {
        qi.value = amcState.q;
        qi.addEventListener('input', U.debounce(() => { amcState.q = qi.value; ctx.refresh(); }, 220));
      }
      root.addEventListener('click', e => {
        // Fold without re-rendering, so the page does not jump under the click.
        const fb = e.target.closest('[data-fold]');
        if (fb) {
          const id = fb.getAttribute('data-fold');
          const now = !!amcState.expanded[id];      // folded after this click?
          amcState.expanded[id] = !amcState.expanded[id];
          fb.classList.toggle('folded', now);
          fb.setAttribute('aria-expanded', now ? 'false' : 'true');
          fb.setAttribute('title', (now ? 'Show' : 'Hide') + ' the schedule');
          const body = U.qs('[data-foldbody="' + id + '"]', root);
          if (body) body.classList.toggle('folded', now);
          return;
        }

        const tb = e.target.closest('[data-tab]');
        if (tb) { amcState.tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-newcontract]') && V['contract-new']) return V['contract-new'].start('amc');
        const go = e.target.closest('[data-go]');
        if (go) location.hash = go.getAttribute('data-go');
      });
    }
  };

  /* ================================================ One-time — service led */
  const oneState = { tab: 'upcoming', q: '' };

  const ONE_TABS = [
    { id: 'upcoming',  label: 'Upcoming' },
    { id: 'today',     label: 'Today' },
    { id: 'unplanned', label: 'Needs a date' },
    { id: 'done',      label: 'Completed' },
    { id: 'all',       label: 'All' }
  ];

  /** A service with no date, or sitting in the past unfinished, needs attention. */
  function unplanned(j) {
    if (j.status === 'completed' || j.status === 'cancelled') return false;
    return !j.date || !j.slot || S.dayDelta(j.date) < 0;
  }

  function oneJobs() { return S.get().jobs.filter(j => categoryOf(j) === 'onetime'); }

  function oneRows() {
    const q = oneState.q.toLowerCase();
    return oneJobs().filter(j => {
      if (oneState.tab === 'today') return S.dayDelta(j.date) === 0 && j.status !== 'cancelled';
      if (oneState.tab === 'upcoming') return S.dayDelta(j.date) >= 0 && j.status !== 'completed' && j.status !== 'cancelled';
      if (oneState.tab === 'unplanned') return unplanned(j);
      if (oneState.tab === 'done') return j.status === 'completed';
      return true;
    }).filter(j => !q ||
      (S.clientName(j.clientId) + ' ' + S.jobTitle(j) + ' ' + j.id).toLowerCase().indexOf(q) >= 0)
      .sort((a, b) => (a.date + a.slot) < (b.date + b.slot) ? -1 : 1);
  }

  /** Group a day's worth of services under a date heading. */
  function grouped(rows) {
    const days = [];
    const seen = {};
    rows.forEach(j => {
      const k = j.date || 'none';
      if (!seen[k]) { seen[k] = { date: j.date, jobs: [] }; days.push(seen[k]); }
      seen[k].jobs.push(j);
    });
    return days;
  }

  V.onetime = {
    title: 'One-time service',

    render(ctx) {
      const all = oneJobs();
      const rows = oneRows();
      const n = {
        total: all.length,
        today: all.filter(j => S.dayDelta(j.date) === 0 && j.status !== 'cancelled').length,
        unplanned: all.filter(unplanned).length,
        done: all.filter(j => j.status === 'completed').length
      };
      const canPlan = ['admin', 'ops'].indexOf(ctx.role) >= 0;

      return C.pageHead({
        title: 'One-time service',
        sub: 'Single services — one-time contracts and standalone jobs · ' + n.total + ' in total',
        actions: canPlan
          ? `<button class="btn btn-primary btn-sm" data-newservice>${ico('plus')} New one-time service</button>` : ''
      }) +

      `<div class="grid grid-4 mb-20">
        ${C.stat({ label: 'Scheduled today', value: n.today, icon: 'calendar', tone: 'i-brand',
          foot: n.today ? 'On the board now' : 'Nothing today' })}
        ${C.stat({ label: 'Needs a date', value: n.unplanned, icon: 'alert',
          tone: n.unplanned ? 'i-amber' : 'i-gray',
          foot: n.unplanned ? 'Undated or overdue' : 'All planned' })}
        ${C.stat({ label: 'Completed', value: n.done, icon: 'calcheck', tone: 'i-green', foot: 'All time' })}
        ${C.stat({ label: 'Total services', value: n.total, icon: 'zap', tone: 'i-violet', foot: 'One-off jobs' })}
      </div>` +

      C.searchRow('Search by customer, service or number…', '', 'oneq') +
      C.tabsBar(ONE_TABS.map(t => Object.assign({}, t, {
        n: t.id === 'today' ? n.today : t.id === 'unplanned' ? n.unplanned
          : t.id === 'done' ? n.done : null
      })), oneState.tab) +

      `<div class="mt-16">${
        rows.length
          ? grouped(rows).map(day => `<section class="card mb-16">
              <div class="card-hd">
                <h3 class="grow">${day.date ? esc(S.fmtDay(day.date)) : 'No date set'}</h3>
                <span class="badge b-gray">${day.jobs.length} service${day.jobs.length === 1 ? '' : 's'}</span>
              </div>
              <div class="card-bd">${day.jobs.map(j => C.jobRow(j)).join('')}</div>
            </section>`).join('')
          : U.empty({ icon: 'zap', title: 'No one-time services in this view',
              text: 'Schedule one from a customer, a quotation or here.' })
      }</div>`;
    },

    mount(root, ctx) {
      const qi = U.qs('#oneq', root);
      if (qi) {
        qi.value = oneState.q;
        qi.addEventListener('input', U.debounce(() => { oneState.q = qi.value; ctx.refresh(); }, 220));
      }
      root.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { oneState.tab = tb.getAttribute('data-tab'); ctx.refresh(); return; }
        if (e.target.closest('[data-newservice]') && V['contract-new']) return V['contract-new'].start('onetime');
      });
    }
  };
})(window);
