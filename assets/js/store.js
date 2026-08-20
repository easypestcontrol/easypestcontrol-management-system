/* ==========================================================================
   PestOps — Store: persistence, derived data, formatting, business rules
   ========================================================================== */
(function (w) {
  'use strict';

  const DB_VER = 16;                 // bump to force every browser to reseed
  const DB_KEY = 'pestops.db.v16';
  const SESSION_KEY = 'pestops.session.v16';

  /* ---------------------------------------------------------------- state */
  let db = null;

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === DB_VER) { db = parsed; migrate(); return db; }
      }
    } catch (e) { /* fall through to reseed */ }
    // A first run comes with the sample business in it, because an empty app
    // cannot be explored. Settings has a one-click Clear for demo day.
    db = w.Seed.build({ demo: true });
    save();
    return db;
  }

  /**
   * Small corrections to an existing database, so a fix does not cost the
   * user their data. Each one is skipped the moment it no longer applies,
   * and anything they have edited themselves is left alone.
   */
  function migrate() {
    let dirty = false;

    // The quotation message used to promise a PDF attachment. A WhatsApp link
    // cannot carry a file, so it never arrived. Only the untouched wording is
    // replaced -- an edited template is theirs to keep.
    const t = (db.waTemplates || []).filter(x => x.k === 'quote_sent')[0];
    const stale = t && t.body && t.body.indexOf('attached to this message as a PDF') >= 0;
    if (stale) {
      const fresh = (w.Seed.WA_TEMPLATES || []).filter(x => x.k === 'quote_sent')[0];
      if (fresh) { t.body = fresh.body; dirty = true; }
    }

    if (dirty) save();
  }

  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { /* quota — demo still works in memory */ }
  }

  /**
   * Start over. `demo` decides whether the sample business comes with it, or
   * whether you get the company and its people and nothing else.
   */
  function reset(demo) {
    db = w.Seed.build({ demo: !!demo });
    save();
    return db;
  }

  function get() { return db || load(); }

  /* -------------------------------------------------------------- session */
  function session() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* noop */ }
    return null;
  }
  function setSession(userId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: userId, at: Date.now() }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function me() {
    const s = session();
    if (!s) return null;
    return get().users.find(u => u.id === s.userId) || null;
  }

  /* --------------------------------------------------- message templates */
  function waTemplate(key) {
    return (get().waTemplates || []).find(function (t) { return t.k === key; }) || null;
  }

  /**
   * Replace every {placeholder} in a template body from a plain map.
   * Anything the map does not supply is left visible as {name} so a missing
   * value is obvious in the preview rather than silently blank.
   */
  function fillTemplate(body, vars) {
    return String(body || '').replace(/\{(\w+)\}/g, function (whole, key) {
      const v = vars[key];
      return (v === undefined || v === null || v === '') ? whole : String(v);
    });
  }

  /* ------------------------------------------------------- storage budget */
  /**
   * Everything lives in localStorage, which browsers cap at roughly 5 MB.
   * Attached PDFs and photos are what actually fill it, so the upload screens
   * check this before writing.
   */
  const STORAGE_CAP_KB = 5 * 1024;

  function dbSizeKB() {
    try { return Math.round(JSON.stringify(db || get()).length / 1024); }
    catch (e) { return 0; }
  }
  function storageUse() {
    const used = dbSizeKB();
    return { usedKB: used, capKB: STORAGE_CAP_KB, pct: Math.min(100, Math.round(used / STORAGE_CAP_KB * 100)) };
  }
  /** Would adding this many KB push the database past what the browser keeps? */
  function storageWouldOverflow(addKB) {
    return dbSizeKB() + addKB > STORAGE_CAP_KB * 0.92;
  }

  /* ------------------------------------------------------ branch helpers */
  /** Every branch a person is posted to. Empty list means "not posted yet". */
  function userBranches(u) {
    return ((u && u.branches) || []).map(branch).filter(Boolean);
  }

  /** People posted to a branch — used by the branch card head-count. */
  function branchStaff(branchId) {
    return get().users.filter(function (u) {
      return u.role !== 'client' && (u.branches || []).indexOf(branchId) >= 0;
    });
  }

  /**
   * Staff who can own a lead: sales first, then the managers who also work the
   * pipeline. Technicians are field staff and never own a lead; accounts do
   * not chase them either.
   */
  function assignableUsers() {
    const rank = { sales: 0, ops: 1, admin: 2 };
    return get().users
      .filter(function (u) { return rank[u.role] != null; })
      .sort(function (a, b) { return rank[a.role] - rank[b.role]; });
  }

  /* ------------------------------------------------- territory → branch */
  /* Branches carry the localities they cover. Today that routes a lead to the
     right branch; the field-staff-by-area assignment is built on the same map. */
  /** Loose text key so "besant nagar" matches "Besant Nagar, Chennai". */
  function areaKey(v) {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Every locality a branch covers — master data, edited on the branch card. */
  function branchAreas(b) {
    const rec = typeof b === 'string' ? branch(b) : b;
    return (rec && rec.areas) || [];
  }

  /**
   * Which branch looks after this locality. Matches the branch's own area
   * list first, then falls back to the branch name and street address so a
   * locality nobody has listed yet ("Adyar") still finds its office.
   */
  function branchForArea(area) {
    const k = areaKey(area);
    if (!k) return null;
    const list = get().branches.filter(function (b) { return b.active !== false; });

    let hit = list.find(function (b) {
      return branchAreas(b).some(function (a) { return areaKey(a) === k; });
    });
    if (hit) return hit;

    hit = list.find(function (b) {
      return branchAreas(b).some(function (a) {
        const ak = areaKey(a);
        return ak && (ak.indexOf(k) >= 0 || k.indexOf(ak) >= 0);
      });
    });
    if (hit) return hit;

    return list.find(function (b) {
      const nk = areaKey(b.name), pk = areaKey(b.addr);
      return (nk && nk.indexOf(k) >= 0) || (pk && pk.indexOf(k) >= 0);
    }) || null;
  }

  /* --------------------------------------------------- lead stage helpers */
  /** Stages that still count as live pipeline (everything before won / lost). */
  const OPEN_LEAD_STAGES = ['new', 'followup', 'inspection', 'quoted', 'contract'];
  const isOpenLead = l => OPEN_LEAD_STAGES.indexOf(l.stage) >= 0;

  /* --------------------------------------------------- customer directory */
  /** Last 10 digits of a phone number — the only reliable way to match it. */
  function phoneKey(v) { return String(v || '').replace(/\D/g, '').slice(-10); }

  /**
   * One flat directory of everyone we already know: customers first (richest
   * record), then leads whose phone we have not already seen. Used by the
   * capture form to pull a returning customer's details back automatically.
   */
  function directory() {
    const d = get();
    const seen = {};
    const out = [];
    d.clients.forEach(function (c) {
      const k = phoneKey(c.phone);
      if (k) seen[k] = 1;
      out.push({
        kind: 'client', id: c.id, clientId: c.id,
        name: c.name, phone: c.phone, email: c.email || '',
        area: (String(c.addr || '').split(',').pop() || '').trim() || c.city || '',
        type: c.type || '', since: c.since || ''
      });
    });
    d.leads.forEach(function (l) {
      const k = phoneKey(l.phone);
      if (k && seen[k]) return;
      if (k) seen[k] = 1;
      out.push({
        kind: 'lead', id: l.id, clientId: l.clientId || '',
        name: l.name, phone: l.phone, email: l.email || '',
        area: l.area || '', type: l.type || '', since: l.created || ''
      });
    });
    return out;
  }

  /** Find a known customer by phone number, or failing that by exact name. */
  function findContact(term) {
    const t = String(term || '').trim();
    if (!t) return null;
    const dir = directory();
    const k = phoneKey(t);
    if (k.length >= 10) {
      const byPhone = dir.find(function (c) { return phoneKey(c.phone) === k; });
      if (byPhone) return byPhone;
    }
    const n = t.toLowerCase();
    return dir.find(function (c) { return c.name.toLowerCase() === n; }) || null;
  }

  /** Every past lead belonging to a known customer, newest first. */
  function contactHistory(contact) {
    if (!contact) return [];
    const k = phoneKey(contact.phone);
    return get().leads.filter(function (l) {
      return (contact.clientId && l.clientId === contact.clientId) ||
             (k && phoneKey(l.phone) === k);
    });
  }

  /* ------------------------------------------------------------- lookups */
  const by = (arr, id) => arr.find(x => x.id === id);
  const user     = id => by(get().users, id);
  const client   = id => by(get().clients, id);
  const service  = id => by(get().services, id);
  const contract = id => by(get().contracts, id);
  const job      = id => by(get().jobs, id);
  const quote    = id => by(get().quotations, id);
  const invoice  = id => by(get().invoices, id);
  const lead     = id => by(get().leads, id);
  const branch   = id => by(get().branches || [], id);
  const item     = id => by(get().inventory, id);
  const audit    = id => by(get().audits, id);

  const clientName = id => (client(id) || {}).name || '—';
  const branchName = id => (branch(id) || {}).name || '—';
  const userName   = id => (user(id) || {}).name || 'Unassigned';
  const svcName    = id => (service(id) || {}).name || '—';

  /* ------------------------------------------------------------- numbers */
  function money(n, opts) {
    const o = opts || {};
    const v = Math.round(Number(n) || 0);
    const s = Math.abs(v).toLocaleString('en-IN');
    return (v < 0 ? '-' : '') + (o.bare ? '' : '₹') + s;
  }
  function moneyShort(n) {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 10000000) return '₹' + (v / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    if (Math.abs(v) >= 100000)   return '₹' + (v / 100000).toFixed(2).replace(/\.00$/, '') + ' L';
    if (Math.abs(v) >= 1000)     return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return '₹' + v;
  }

  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function two(n) {
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  }
  function three(n) {
    if (n < 100) return two(n);
    return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '');
  }
  /** Indian numbering: crore / lakh / thousand */
  function amountInWords(n) {
    let v = Math.round(Number(n) || 0);
    if (v === 0) return 'Zero Rupees Only';
    const parts = [];
    const cr = Math.floor(v / 10000000); v %= 10000000;
    const lk = Math.floor(v / 100000);   v %= 100000;
    const th = Math.floor(v / 1000);     v %= 1000;
    if (cr) parts.push(three(cr) + ' Crore');
    if (lk) parts.push(three(lk) + ' Lakh');
    if (th) parts.push(three(th) + ' Thousand');
    if (v)  parts.push(three(v));
    return parts.join(' ') + ' Rupees Only';
  }

  /* --------------------------------------------------------------- dates */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function todayISO() { return w.Seed.D(0); }

  function parse(ds) {
    if (!ds) return null;
    const p = String(ds).slice(0, 10).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function fmtDate(ds)  { const d = parse(ds); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function fmtShort(ds) { const d = parse(ds); return d ? d.getDate() + ' ' + MON[d.getMonth()] : '—'; }
  function fmtDay(ds)   { const d = parse(ds); return d ? DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] : '—'; }
  function fmtLong(ds)  { const d = parse(ds); return d ? DOWL[d.getDay()] + ', ' + d.getDate() + ' ' + MONL[d.getMonth()] + ' ' + d.getFullYear() : '—'; }

  function dayDelta(ds) { return w.Seed.daysBetween(todayISO(), ds); }

  function relDay(ds) {
    const n = dayDelta(ds);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n > 1 && n < 7) return 'In ' + n + ' days';
    if (n < -1 && n > -7) return n * -1 + ' days ago';
    return fmtDate(ds);
  }

  function fmtTime(hhmm) {
    if (!hhmm) return '—';
    const t = String(hhmm).slice(-5);
    let h = parseInt(t.split(':')[0], 10);
    const m = t.split(':')[1];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ap;
  }
  function timeParts(hhmm) {
    const t = String(hhmm || '00:00').slice(-5);
    let h = parseInt(t.split(':')[0], 10);
    const m = t.split(':')[1];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { hh: h + ':' + m, ap: ap };
  }
  function durationText(mins) {
    const m = Math.max(0, Math.round(mins || 0));
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }
  function minutesBetween(aIso, bIso) {
    if (!aIso || !bIso) return 0;
    return Math.max(0, Math.round((new Date(bIso.replace(' ', 'T')) - new Date(aIso.replace(' ', 'T'))) / 60000));
  }
  function nowStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return todayISO() + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------------------------------------- statuses */
  const JOB_STATUS = {
    scheduled:  { label: 'Scheduled',   cls: 'b-blue',   dot: '#2E90FA' },
    enroute:    { label: 'En route',    cls: 'b-violet', dot: '#7C3AED' },
    inprogress: { label: 'In progress', cls: 'b-amber',  dot: '#F79009' },
    completed:  { label: 'Completed',   cls: 'b-green',  dot: '#12B76A' },
    cancelled:  { label: 'Cancelled',   cls: 'b-gray',   dot: '#94A3B8' }
  };
  const QUOTE_STATUS = {
    draft:    { label: 'Draft',    cls: 'b-gray' },
    sent:     { label: 'Sent',     cls: 'b-blue' },
    approved: { label: 'Approved', cls: 'b-green' },
    rejected: { label: 'Rejected', cls: 'b-red' },
    expired:  { label: 'Expired',  cls: 'b-amber' }
  };
  const INV_STATUS = {
    paid:    { label: 'Paid',    cls: 'b-green' },
    partial: { label: 'Partial', cls: 'b-amber' },
    unpaid:  { label: 'Unpaid',  cls: 'b-blue' },
    overdue: { label: 'Overdue', cls: 'b-red' }
  };
  const JOB_TYPE = {
    'AMC Visit':  { cls: 'b-brand',  icon: 'shield' },
    'One-Time':   { cls: 'b-blue',   icon: 'spray' },
    'Callback':   { cls: 'b-amber',  icon: 'rotate' },
    'Complaint':  { cls: 'b-red',    icon: 'alert' },
    'Inspection': { cls: 'b-violet', icon: 'search' }
  };

  function contractStatus(c) {
    const d = dayDelta(c.end);
    if (d < 0) return { key: 'expired',  label: 'Expired',  cls: 'b-gray' };
    if (d <= 30) return { key: 'expiring', label: 'Expiring soon', cls: 'b-amber' };
    return { key: 'active', label: 'Active', cls: 'b-green' };
  }

  /* ------------------------------------------------------------ computed */
  /* ---------------------------------------------------------------- tax */
  /** The state we bill from. Everything is compared against this. */
  function homeState() {
    return (get().company || {}).state || 'Tamil Nadu';
  }

  /**
   * Where a document is supplied to: whatever the record says, else whatever
   * the customer account says, else our own state.
   */
  function supplyState(rec) {
    if (rec && rec.placeOfSupply) return rec.placeOfSupply;
    const cl = rec && rec.clientId ? client(rec.clientId) : null;
    if (cl) {
      if (cl.placeOfSupply) return cl.placeOfSupply;
      if (cl.billing && cl.billing.state) return cl.billing.state;
    }
    return homeState();
  }

  /**
   * Is this record supplied outside our own state? One place answers it, so
   * a screen never has to re-derive the rule and get it subtly different.
   */
  function isInterState(rec) {
    return String(supplyState(rec)).trim().toLowerCase() !== homeState().trim().toLowerCase();
  }

  /**
   * Split a taxable amount the way GST actually works: half CGST and half
   * SGST inside our own state, a single IGST line anywhere else.
   */
  /**
   * Re-stamp the technicians on every visit still to come, from the plan.
   * A merged trip covers more than one service, so it gets everyone who is
   * on any of the services due that day.
   */
  function syncCrew(c) {
    const byService = {};
    (c.plan || []).forEach(l => { byService[l.svId] = w.Seed.lineCrew(l); });
    let n = 0;
    let held = 0;
    contractJobs(c.id).forEach(function (j) {
      // isFrozen already means "done, under way, or placed by hand". Testing
      // status alone silently overwrote every crew a dispatcher had dragged.
      if (isFrozen(j)) { held++; return; }
      const ids = [];
      (j.serviceIds || []).forEach(function (sv) {
        (byService[sv] || []).forEach(id => { if (ids.indexOf(id) < 0) ids.push(id); });
      });
      // A trip never carries more people than its biggest service needs.
      j.techIds = ids.slice(0, Math.max(1, jobCrewSize(j)));
      n++;
    });
    c.techId = ((c.plan || []).map(l => w.Seed.lineCrew(l)[0]).filter(Boolean))[0] || '';
    syncCrew.held = held;                    // read by the toast, so it can say so
    return n;
  }

  function taxSplit(taxable, place) {
    const rate = (get().company || {}).gstRate || 18;
    const gst = Math.max(0, taxable) * rate / 100;
    const inter = String(place || homeState()).trim().toLowerCase() !== homeState().trim().toLowerCase();
    return {
      rate: rate, gst: gst, interState: inter, place: place || homeState(),
      cgst: inter ? 0 : gst / 2, sgst: inter ? 0 : gst / 2,
      igst: inter ? gst : 0, half: rate / 2
    };
  }

  /** Is this place of supply inside India? */
  function inIndia(place) {
    const p = String(place || '').trim().toLowerCase();
    if (!p) return true;
    return (w.Seed.STATES || []).some(x => x.toLowerCase() === p);
  }

  /**
   * The tax rows a document should print, in order.
   *
   * Anywhere in India this is one combined GST line rather than the CGST and
   * SGST pair — the business asked for the single figure on its documents.
   * `taxSplit` still returns the halves, so a statutory breakdown is one call
   * away if a filing or a tax invoice ever needs it.
   */
  /**
   * The tax lines a document prints. Supply within the home state is split
   * into CGST + SGST; anywhere else is a single IGST line. Every screen goes
   * through here, so the place of supply changes the document everywhere at
   * once rather than on whichever screen remembered to do the split.
   */
  /* ------------------------------------------------------------ dispatch */

  /** The window the board draws, and the grain a drag snaps to. */
  const DAY_FROM = 6 * 60;          // 06:00
  const DAY_TO = 22 * 60;           // 22:00
  const SNAP = 15;                  // minutes

  const toMin = hhmm => {
    const p = String(hhmm || '0:0').split(':');
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  };
  const toHHMM = m => {
    const x = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
    return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
  };

  /**
   * When a technician works. Nothing recorded means the company default, so
   * the board is useful before anybody fills this in.
   */
  function workHours(u) {
    const co = get().company || {};
    const d = co.hours || { from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5, 6] };
    const h = (u && u.hours) || {};
    return {
      from: h.from || d.from,
      to: h.to || d.to,
      days: h.days && h.days.length ? h.days : d.days
    };
  }

  /** Is this person at work on this date, and does the span fit their day? */
  function onDuty(u, dateISO, fromMin, toMinute) {
    const h = workHours(u);
    const dow = parse(dateISO).getDay();
    if (h.days.indexOf(dow) < 0) return { ok: false, why: 'not a working day' };
    if (fromMin < toMin(h.from)) return { ok: false, why: 'starts before ' + fmtTime(h.from) };
    if (toMinute > toMin(h.to)) return { ok: false, why: 'runs past ' + fmtTime(h.to) };
    return { ok: true };
  }

  /** The branch whose patch this address sits in, matched on the area name. */
  function clientBranch(cl) {
    if (!cl) return null;
    if (cl.branch) return branch(cl.branch);
    // The branch lookup already knows how to read a locality name.
    const parts = ((cl.addr || '') + ', ' + (cl.city || '')).split(',');
    for (let i = parts.length - 1; i >= 0; i--) {
      const hit = branchForArea(parts[i]);
      if (hit) return hit;
    }
    return (get().branches || [])[0] || null;
  }

  /** The branch a job belongs to, through its customer. */
  function jobBranch(j) {
    const c = j && j.contractId ? contract(j.contractId) : null;
    if (c && c.branch) return branch(c.branch);
    return clientBranch(client(j && j.clientId));
  }

  /** Everything on one day that still needs a technician. */
  function unassignedOn(dateISO) {
    return get().jobs.filter(j =>
      j.date === dateISO && j.status !== 'cancelled' && !(j.techIds || []).length);
  }

  /**
   * Can this technician take this job at this minute? Answers with warnings,
   * never a refusal -- a dispatcher usually knows something the system does not.
   */
  function dropCheck(job, techId, dateISO, startMin) {
    const u = user(techId);
    const out = [];
    if (!u) return out;
    const mins = job.mins || 60;
    const end = startMin + mins;

    // Already somewhere else at that moment.
    jobsOn(dateISO, techId).forEach(function (o) {
      if (o.id === job.id) return;
      const a = toMin(o.slot), b = a + (o.mins || 60);
      if (startMin < b && end > a) {
        out.push({ level: 'block', text: 'Clashes with ' + o.id + ' (' + fmtTime(o.slot) + ')' });
      }
    });

    const duty = onDuty(u, dateISO, startMin, end);
    if (!duty.ok) out.push({ level: 'warn', text: 'Outside working hours — ' + duty.why });

    // Trained for the work?
    const names = (job.serviceIds || []).map(svcName);
    const skills = (u.skills || []).map(x => String(x).toLowerCase());
    if (skills.length && names.length) {
      const unmatched = names.filter(n =>
        !skills.some(sk => String(n).toLowerCase().indexOf(sk) >= 0 || sk.indexOf(String(n).toLowerCase()) >= 0));
      if (unmatched.length === names.length) {
        out.push({ level: 'warn', text: 'Not listed for ' + names.join(', ') });
      }
    }

    // The right side of town.
    const jb = jobBranch(job);
    if (jb && (u.branches || []).length && u.branches.indexOf(jb.id) < 0) {
      out.push({ level: 'warn', text: 'Different branch — this job is ' + jb.name });
    }

    // Enough of a gap to actually get there.
    const day = jobsOn(dateISO, techId).filter(o => o.id !== job.id)
      .map(o => ({ a: toMin(o.slot), b: toMin(o.slot) + (o.mins || 60), j: o }))
      .sort((x, y) => x.a - y.a);
    const before = day.filter(x => x.b <= startMin).pop();
    const after = day.filter(x => x.a >= end)[0];
    const gap = 30;
    if (before && startMin - before.b < gap) {
      out.push({ level: 'warn', text: 'Only ' + (startMin - before.b) + ' min after ' + before.j.id + ' to travel' });
    }
    if (after && after.a - end < gap) {
      out.push({ level: 'warn', text: 'Only ' + (after.a - end) + ' min before ' + after.j.id });
    }
    return out;
  }

  /**
   * Put a job on a technician at a time. `pinned` stops the AMC engine moving
   * it back the next time the plan is applied -- a hand placement wins.
   */
  function placeJob(jobId, techIds, dateISO, startMin) {
    const j = job(jobId);
    if (!j) return null;
    const before = { date: j.date, slot: j.slot, techIds: (j.techIds || []).slice(), pinned: !!j.pinned };
    j.date = dateISO || j.date;
    if (startMin != null) j.slot = toHHMM(Math.round(startMin / SNAP) * SNAP);
    if (techIds) {
      // The board clamped before calling; doing it here means every caller is.
      const seen = [];
      techIds.forEach(function (id) { if (id && seen.indexOf(id) < 0) seen.push(id); });
      j.techIds = seen.slice(0, Math.max(1, jobCrewSize(j)));
    }
    j.pinned = true;
    save();
    return before;                                   // hand back, so it can be undone
  }

  /** Take a job off everybody, and let the plan own it again. */
  function unassignJob(jobId) {
    const j = job(jobId);
    if (!j) return null;
    const before = { date: j.date, slot: j.slot, techIds: (j.techIds || []).slice(), pinned: !!j.pinned };
    j.techIds = [];
    j.pinned = false;                       // back under the engine's control
    save();
    return before;
  }

  /**
   * The free windows in somebody's day, in minutes. Working hours minus what is
   * already booked, with a travel buffer taken off each end of a job so a gap
   * that only exists on paper is not offered.
   */
  function freeGaps(techId, dateISO, buffer) {
    const u = user(techId);
    if (!u) return [];
    const h = workHours(u);
    if (h.days.indexOf(parse(dateISO).getDay()) < 0) return [];
    const pad = buffer == null ? 20 : buffer;

    const busy = jobsOn(dateISO, techId)
      .map(o => ({ a: toMin(o.slot) - pad, b: toMin(o.slot) + (o.mins || 60) + pad }))
      .sort((x, y) => x.a - y.a);

    const out = [];
    let at = toMin(h.from);
    const close = toMin(h.to);
    busy.forEach(function (b) {
      if (b.a > at) out.push({ from: at, to: Math.min(b.a, close) });
      at = Math.max(at, b.b);
    });
    if (at < close) out.push({ from: at, to: close });
    return out.filter(g => g.to - g.from > 0);
  }

  /** The earliest minute this person could start a job of `mins`, or null. */
  function firstFree(techId, dateISO, mins, notBefore) {
    const need = mins || 60;
    const floor = notBefore == null ? 0 : notBefore;
    const hit = freeGaps(techId, dateISO).filter(function (g) {
      return Math.max(g.from, floor) + need <= g.to;
    })[0];
    if (!hit) return null;
    return Math.ceil(Math.max(hit.from, floor) / SNAP) * SNAP;
  }

  /** How many people a job wants, read from the contract behind it. */
  function jobCrewSize(j) {
    if (!j || !j.contractId) return Math.max(1, ((j && j.techIds) || []).length);
    const c = contract(j.contractId);
    if (!c) return 1;
    let n = 1;
    (c.plan || []).forEach(function (l) {
      if ((j.serviceIds || []).indexOf(l.svId) >= 0) n = Math.max(n, l.crew || 1);
    });
    return n;
  }

  /**
   * Rank everybody for one job. The score is deliberately readable rather than
   * clever -- a dispatcher should be able to see why somebody came top.
   */
  function suggestTechs(j, dateISO, limit) {
    const jb = jobBranch(j);
    const names = (j.serviceIds || []).map(svcName);
    const mins = j.mins || 60;

    const rows = get().users.filter(u => u.role === 'tech').map(function (u) {
      const why = [];
      let score = 100;

      const h = workHours(u);
      const working = h.days.indexOf(parse(dateISO).getDay()) >= 0;
      if (!working) { score -= 80; why.push({ good: false, text: 'Not working today' }); }

      // The same patch as the customer.
      if (jb && (u.branches || []).indexOf(jb.id) >= 0) {
        score += 26; why.push({ good: true, text: 'Covers ' + jb.name });
      } else if (jb && (u.branches || []).length) {
        score -= 22; why.push({ good: false, text: 'Different branch to ' + jb.name });
      }

      // Trained for it.
      const skills = (u.skills || []).map(x => String(x).toLowerCase());
      if (skills.length && names.length) {
        const match = names.filter(n => skills.some(sk =>
          String(n).toLowerCase().indexOf(sk) >= 0 || sk.indexOf(String(n).toLowerCase()) >= 0));
        if (match.length) { score += 18; why.push({ good: true, text: 'Does ' + match[0] }); }
        else { score -= 16; why.push({ good: false, text: 'Not listed for this work' }); }
      }

      // How full the day already is.
      const booked = jobsOn(dateISO, u.id).reduce((a, o) => a + (o.mins || 60), 0);
      const avail = Math.max(60, toMin(h.to) - toMin(h.from));
      const pct = booked / avail;
      score -= Math.round(pct * 45);
      why.push({ good: pct < 0.8, text: Math.round(pct * 100) + '% booked' });

      // Somewhere to actually put it.
      const at = working ? firstFree(u.id, dateISO, mins) : null;
      if (at == null) { score -= 55; why.push({ good: false, text: 'No gap long enough' }); }
      else why.push({ good: true, text: 'Free from ' + fmtTime(toHHMM(at)) });

      return { user: u, score: score, at: at, why: why, booked: booked, avail: avail };
    });

    rows.sort((a, b) => b.score - a.score);
    return limit ? rows.slice(0, limit) : rows;
  }

  /**
   * Place everything waiting on a day. Urgent and long jobs go first, and each
   * placement is visible to the next -- assign them all against the same
   * snapshot and everybody lands on 9 AM.
   */
  function autoAssign(dateISO) {
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    const queue = unassignedOn(dateISO).slice().sort(function (a, b) {
      const d = (rank[a.priority] == null ? 2 : rank[a.priority]) -
                (rank[b.priority] == null ? 2 : rank[b.priority]);
      return d || (b.mins || 60) - (a.mins || 60);
    });

    const placed = [], skipped = [];
    queue.forEach(function (j) {
      const crew = Math.max(1, jobCrewSize(j));
      const ranked = suggestTechs(j, dateISO).filter(r => r.at != null);
      if (ranked.length < crew) { skipped.push(j); return; }

      const take = ranked.slice(0, crew);
      // Everyone on the crew has to be free at the same moment.
      let start = take.reduce((m, r) => Math.max(m, r.at), 0);
      let ok = false;
      for (let tries = 0; tries < 8; tries++) {
        const at = take.map(r => firstFree(r.user.id, dateISO, j.mins || 60, start));
        if (at.some(x => x == null)) break;
        const highest = Math.max.apply(null, at);
        if (highest === start) { ok = true; break; }
        start = highest;
      }
      if (!ok) { skipped.push(j); return; }

      placed.push({ jobId: j.id, before: placeJob(j.id, take.map(r => r.user.id), dateISO, start) });
    });
    return { placed: placed, skipped: skipped };
  }

  /**
   * Move work off anybody over their hours onto anybody under. Only single-
   * person, not-yet-started jobs move -- splitting a crew automatically is the
   * kind of help nobody asked for.
   */
  function balanceDay(dateISO) {
    const people = get().users.filter(u => u.role === 'tech');
    const moved = [];

    function state(u) {
      const h = workHours(u);
      const avail = Math.max(60, toMin(h.to) - toMin(h.from));
      const booked = jobsOn(dateISO, u.id).reduce((a, o) => a + (o.mins || 60), 0);
      return { u: u, booked: booked, avail: avail, over: booked - avail };
    }

    for (let pass = 0; pass < 12; pass++) {
      const rows = people.map(state).sort((a, b) => b.over - a.over);
      const worst = rows[0];
      if (!worst || worst.over <= 0) break;

      // The last movable job of the overloaded day.
      const cand = jobsOn(dateISO, worst.u.id)
        .filter(o => o.status !== 'completed' && o.status !== 'inprogress' &&
                     (o.techIds || []).length === 1)
        .sort((a, b) => toMin(b.slot) - toMin(a.slot))[0];
      if (!cand) break;

      const taker = rows.slice(1)
        .map(r => ({ r: r, at: firstFree(r.u.id, dateISO, cand.mins || 60) }))
        .filter(x => x.at != null && x.r.booked + (cand.mins || 60) <= x.r.avail)
        .sort((a, b) => a.r.booked - b.r.booked)[0];
      if (!taker) break;

      moved.push({
        jobId: cand.id, to: taker.r.u.id,
        before: placeJob(cand.id, [taker.r.u.id], dateISO, taker.at)
      });
    }
    return moved;
  }

  /** Put a batch of placements back where they were. */
  function undoBatch(list) {
    (list || []).forEach(x => restoreJob(x.jobId, x.before));
  }

  /** Put a job back exactly as it was. */
  function restoreJob(jobId, before) {
    const j = job(jobId);
    if (!j || !before) return;
    j.date = before.date; j.slot = before.slot;
    j.techIds = before.techIds.slice(); j.pinned = before.pinned;
    save();
  }

  /**
   * The most people this contract ever needs on site at once.
   *
   * Services landing on the same day share one trip and ONE crew works through
   * them -- the three who do the gel are two of the same three who then do the
   * termite. So a day needs its BIGGEST service, not the sum of everything
   * happening that day; and the contract needs its biggest day.
   *
   * Summing instead gave "7 technicians required" for a job four people could
   * never all be busy on.
   */
  function peakCrew(lines, visits) {
    const need = {};
    (lines || []).forEach(function (l) { need[l.svId] = Math.max(1, l.crew || 1); });

    let peak = 0;
    (visits || []).forEach(function (v) {
      let day = 0;
      (v.serviceIds || []).forEach(function (id) { day = Math.max(day, need[id] || 1); });
      peak = Math.max(peak, day);
    });

    // Nothing generated yet -- the biggest single service is the honest answer.
    if (!peak) (lines || []).forEach(function (l) { peak = Math.max(peak, Math.max(1, l.crew || 1)); });
    return peak;
  }

  /** The same figure for a contract that already exists. */
  function contractCrew(c) {
    if (!c || !(c.plan || []).length) return 0;
    return peakCrew(c.plan, w.Seed.planVisits(c));
  }

  /* ------------------------------------------------------------- staffing */
  /**
   * How a contract is staffed, line by line. A service says how many people
   * it takes (`crew`); this reports who is on it and how many are still
   * missing, so nothing goes out of the door half-assigned by accident.
   */
  function staffing(c) {
    const lines = (c && c.plan) || [];
    const rows = lines.map(function (l) {
      const need = Math.max(1, l.crew || 1);
      const have = w.Seed.lineCrew(l);
      return {
        svId: l.svId, name: svcName(l.svId), need: need, have: have,
        short: Math.max(0, need - have.length),
        // Clamping this to zero is how a line reading "3 of 2" reported ok.
        over: Math.max(0, have.length - need)
      };
    });
    const short = rows.filter(r => r.short > 0);
    const over = rows.filter(r => r.over > 0);
    return {
      rows: rows,
      short: short,
      over: over,
      missing: short.reduce((a, r) => a + r.short, 0),
      extra: over.reduce((a, r) => a + r.over, 0),
      ok: short.length === 0 && over.length === 0 && rows.length > 0
    };
  }

  /** Contracts that still need people put against a service. */
  function understaffed() {
    return get().contracts.filter(c => (c.plan || []).length && !staffing(c).ok);
  }

  function taxRows(t) {
    if (t.interState) return [['IGST ' + t.rate + '%', t.igst]];
    return [['CGST ' + t.half + '%', t.cgst], ['SGST ' + t.half + '%', t.sgst]];
  }

  function quoteTotals(q) {
    const sub = (q.items || []).reduce((s, i) => s + i.qty * i.rate, 0);
    const disc = (q && q.discount) || 0;
    const taxable = Math.max(0, sub - disc);
    const t = taxSplit(taxable, supplyState(q));
    return {
      sub: sub, disc: disc, taxable: taxable,
      gst: t.gst, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
      interState: t.interState, place: t.place, rate: t.rate, half: t.half,
      total: taxable + t.gst
    };
  }
  function invoiceTotals(inv) {
    const sub = (inv.items || []).reduce((s, i) => s + i.qty * i.rate, 0);
    const t = taxSplit(sub, supplyState(inv));
    const total = sub + t.gst;
    const paid = get().payments.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
    return {
      sub: sub, gst: t.gst, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
      interState: t.interState, place: t.place, rate: t.rate, half: t.half,
      total: total, paid: paid, balance: Math.max(0, total - paid)
    };
  }
  function syncInvoiceStatus(inv) {
    const t = invoiceTotals(inv);
    if (t.balance <= 0.5) inv.status = 'paid';
    else if (t.paid > 0) inv.status = 'partial';
    else inv.status = dayDelta(inv.due) < 0 ? 'overdue' : 'unpaid';
    return inv.status;
  }

  function contractJobs(cid) {
    return get().jobs.filter(j => j.contractId === cid)
      .sort((a, b) => a.date < b.date ? -1 : 1);
  }
  function contractProgress(c) {
    const js = contractJobs(c.id);
    const done = js.filter(j => j.status === 'completed').length;
    const total = c.totalVisits || js.length || 1;
    return { done: done, total: total, pct: Math.min(100, Math.round(done / total * 100)), jobs: js };
  }

  function jobsOn(dateISO, techId) {
    return get().jobs
      .filter(j => j.date === dateISO && (!techId || (j.techIds || []).indexOf(techId) >= 0))
      .sort((a, b) => (a.slot || '') < (b.slot || '') ? -1 : 1);
  }
  function jobsForTech(techId) {
    return get().jobs.filter(j => (j.techIds || []).indexOf(techId) >= 0);
  }
  function jobsForClient(cid) {
    return get().jobs.filter(j => j.clientId === cid).sort((a, b) => a.date > b.date ? -1 : 1);
  }

  function jobTitle(j) {
    const names = (j.serviceIds || []).map(svcName);
    return names.length ? names.join(' + ') : j.type;
  }

  /* ---------------------------------------------------- KPIs / dashboards */
  function kpis() {
    const d = get();
    const today = todayISO();
    const tJobs = d.jobs.filter(j => j.date === today);
    const done = tJobs.filter(j => j.status === 'completed').length;
    const active = d.contracts.filter(c => contractStatus(c).key !== 'expired');
    const expiring = d.contracts.filter(c => contractStatus(c).key === 'expiring');

    let receivable = 0, overdue = 0;
    d.invoices.forEach(i => {
      syncInvoiceStatus(i);
      const t = invoiceTotals(i);
      receivable += t.balance;
      if (i.status === 'overdue') overdue += t.balance;
    });

    const openLeads = d.leads.filter(l => OPEN_LEAD_STAGES.indexOf(l.stage) >= 0);
    const pipeline = openLeads.reduce((s, l) => s + l.value, 0);
    const lowStock = d.inventory.filter(i => i.stock < i.min);
    const unassigned = d.jobs.filter(j => (!j.techIds || !j.techIds.length) && dayDelta(j.date) >= 0 && j.status !== 'cancelled');

    const monthRev = d.invoices
      .filter(i => dayDelta(i.date) >= -30)
      .reduce((s, i) => s + invoiceTotals(i).total, 0);

    const ratings = d.jobs.filter(j => j.exec && j.exec.rating).map(j => j.exec.rating);
    const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;

    return {
      todayTotal: tJobs.length, todayDone: done, todayOpen: tJobs.length - done,
      activeContracts: active.length, expiring: expiring.length, expiringList: expiring,
      receivable: receivable, overdue: overdue,
      openLeads: openLeads.length, pipeline: pipeline,
      lowStock: lowStock.length, lowStockList: lowStock,
      unassigned: unassigned.length, unassignedList: unassigned,
      monthRev: monthRev, avgRating: avgRating,
      completedAll: d.jobs.filter(j => j.status === 'completed').length
    };
  }

  /** Last 6 months of scheduled vs completed visits + revenue */
  function monthlySeries() {
    const out = [];
    const now = parse(todayISO());
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
      const js = get().jobs.filter(j => j.date.slice(0, 7) === key);
      const inv = get().invoices.filter(x => x.date.slice(0, 7) === key);
      out.push({
        key: key, label: MON[m.getMonth()],
        total: js.length,
        done: js.filter(j => j.status === 'completed').length,
        revenue: inv.reduce((s, x) => s + invoiceTotals(x).total, 0)
      });
    }
    return out;
  }

  /** Pest-type distribution across completed services */
  function serviceMix() {
    const map = {};
    get().jobs.filter(j => j.status === 'completed').forEach(j => {
      (j.serviceIds || []).forEach(sid => { map[sid] = (map[sid] || 0) + 1; });
    });
    return Object.keys(map)
      .map(sid => ({ id: sid, name: svcName(sid), n: map[sid] }))
      .sort((a, b) => b.n - a.n).slice(0, 6);
  }

  function techLeaderboard() {
    return get().users.filter(u => u.role === 'tech').map(u => {
      const js = jobsForTech(u.id);
      const done = js.filter(j => j.status === 'completed');
      const rated = done.filter(j => j.exec && j.exec.rating);
      const todayJobs = js.filter(j => j.date === todayISO());
      return {
        u: u,
        total: js.length,
        done: done.length,
        today: todayJobs.length,
        todayDone: todayJobs.filter(j => j.status === 'completed').length,
        rating: rated.length ? (rated.reduce((s, j) => s + j.exec.rating, 0) / rated.length) : (u.rating || 0),
        onTime: 88 + (u.id.charCodeAt(2) % 11)
      };
    });
  }

  /* -------------------------------------------------------- id generation */
  function nextId(kind, prefix, pad) {
    const d = get();
    d.seq[kind] = (d.seq[kind] || 0) + 1;
    const n = d.seq[kind];
    return prefix + String(n).padStart(pad || 0, '0');
  }

  /* ------------------------------------------- business rule: AMC schedule */
  /**
   * The contract plan is the only thing that creates AMC visits. Everything
   * here works off Seed.planVisits, so the preview on screen and the services
   * actually written can never disagree.
   */

  /**
   * Contracts belonging to a lead. Newer ones carry leadId directly; older
   * ones are found through the quotation they were generated from, or through
   * the customer the lead was promoted into.
   */
  function leadContracts(l) {
    if (!l) return [];
    const quoteIds = get().quotations.filter(function (q) { return q.leadId === l.id; })
      .map(function (q) { return q.id; });
    return get().contracts.filter(function (c) {
      return c.leadId === l.id ||
        (c.id && c.id === l.contractId) ||
        (c.quoteId && quoteIds.indexOf(c.quoteId) >= 0) ||
        (l.clientId && c.clientId === l.clientId);
    });
  }

  /**
   * How a contract's cadence reads to a person. One interval across the board
   * still says "Monthly"; a mixed plan names which services run how often.
   */
  function planSummary(c, short) {
    const plan = (c && c.plan) || [];
    if (!plan.length) return (c && c.freq) || '—';
    const byFreq = {};
    plan.forEach(function (l) {
      const code = (service(l.svId) || {}).code || l.svId;
      (byFreq[l.freq] = byFreq[l.freq] || []).push(code);
    });
    const keys = Object.keys(byFreq);
    if (keys.length === 1) return keys[0];
    if (short) return keys.length + ' intervals';
    return keys.map(function (f) { return byFreq[f].join('/') + ' ' + f.toLowerCase(); }).join(', ');
  }

  /** A default plan for a set of services, ready to be edited before saving. */
  function defaultPlan(c, overrides) {
    return w.Seed.planFor(c, get().services, overrides || {});
  }

  /** The frequency whose visit count sits closest to what was quoted. */
  function freqForVisits(months, visits) {
    let best = 'Monthly', diff = Infinity;
    w.Seed.FREQS.forEach(function (f) {
      const n = Math.max(1, Math.round(months / w.Seed.FREQ_MONTHS[f]));
      const d = Math.abs(n - visits);
      if (d < diff) { diff = d; best = f; }
    });
    return best;
  }

  /**
   * Build a plan straight off the quotation. Each AMC line's quantity is the
   * number of visits that service was priced for, so the intervals the customer
   * already agreed to carry through instead of being flattened.
   */
  function planFromQuote(q, c) {
    const months = c.months || q.months || 12;
    const seen = {};
    return (q.items || []).filter(function (i) {
      if (!i.svId || seen[i.svId]) return false;
      seen[i.svId] = 1; return true;
    }).map(function (i) {
      const svc = service(i.svId) || {};
      // The line says it outright now: how many times, over how many months.
      const lineMonths = Math.max(1, i.months || months);
      const visits = Math.max(1, i.visits || Math.round(i.qty || 1));
      const term = w.Seed.daysBetween(c.start, w.Seed.addMonths(c.start, lineMonths));
      return {
        svId: i.svId,
        months: lineMonths,
        visits: visits,
        freq: w.Seed.cadenceLabel(term / visits, visits),
        mins: svc.mins || 60,
        dayRule: 'dom:' + w.Seed.dayOfMonth(c.start),
        slot: c.slot || '10:00',
        techId: c.techId || ''
      };
    });
  }

  const FROZEN = ['completed', 'inprogress', 'enroute'];
  /**
   * A visit the plan may not touch: one already being served, or one a
   * dispatcher has moved by hand on the board. A hand placement outranks a
   * generated one -- otherwise the next plan run quietly undoes the day's work.
   */
  const isFrozen = j => FROZEN.indexOf(j.status) >= 0 || !!j.pinned;

  function stampJob(j, pv, c) {
    j.serviceIds = pv.serviceIds.slice();
    j.techIds = pv.techIds.length ? pv.techIds.slice() : (c.techId ? [c.techId] : []);
    j.slot = pv.slot;
    j.mins = pv.mins;
    j.planRef = pv.planRef.slice();
    j.plannedAt = pv.date;
    return j;
  }

  /**
   * What applying the current plan would do, without doing it.
   * Visits already served — or being served right now — are never touched.
   */
  function planDiff(c) {
    const proposed = w.Seed.planVisits(c);
    const jobs = contractJobs(c.id);
    const frozen = jobs.filter(isFrozen);
    const frozenOn = {};
    frozen.forEach(function (j) { frozenOn[j.date] = 1; });

    const openOn = {};
    jobs.filter(function (j) { return !isFrozen(j); })
        .forEach(function (j) { (openOn[j.date] = openOn[j.date] || []).push(j); });

    const add = [], keep = [], update = [];
    proposed.forEach(function (pv) {
      if (frozenOn[pv.date]) return;                 // that day is already done
      const list = openOn[pv.date];
      if (list && list.length) {
        const j = list.shift();
        const same = j.mins === pv.mins && j.slot === pv.slot &&
          (j.serviceIds || []).join() === pv.serviceIds.join() &&
          (j.techIds || []).join() === pv.techIds.join();
        (same ? keep : update).push({ job: j, pv: pv });
      } else add.push(pv);
    });

    const remove = [];
    Object.keys(openOn).forEach(function (d) {
      openOn[d].forEach(function (j) { remove.push(j); });
    });

    return { proposed: proposed, frozen: frozen, add: add, keep: keep, update: update, remove: remove };
  }

  /** Things worth telling the user before they commit a plan. */
  function planWarnings(c, proposed) {
    const list = proposed || w.Seed.planVisits(c);
    const out = [];

    const pinned = contractJobs(c.id).filter(function (j) {
      return j.pinned && FROZEN.indexOf(j.status) < 0;
    }).length;
    if (pinned) out.push({ tone: 'ok', text: pinned + ' visit' + (pinned === 1 ? '' : 's') +
      ' placed by hand on the board will be left exactly where they are' });

    const moved = list.filter(function (v) { return v.movedFrom; }).length;
    if (moved) out.push({ tone: 'warn', text: moved + ' visit' + (moved === 1 ? '' : 's') + ' moved off a Sunday to the next working day' });

    const unassigned = list.filter(function (v) { return !v.techIds.length; }).length;
    if (unassigned) out.push({ tone: 'warn', text: unassigned + ' visit' + (unassigned === 1 ? '' : 's') + ' have no technician yet' });

    const clashes = [];
    list.forEach(function (v) {
      v.techIds.forEach(function (t) {
        const busy = jobsOn(v.date, t).filter(function (j) { return j.contractId !== c.id; }).length;
        if (busy >= 4 && clashes.length < 3) {
          clashes.push(userName(t) + ' already has ' + busy + ' services on ' + fmtDate(v.date));
        }
      });
    });
    clashes.forEach(function (t) { out.push({ tone: 'crit', text: t }); });

    if (!list.length) out.push({ tone: 'crit', text: 'This plan produces no visits at all' });
    return out;
  }

  /** Write the plan out: add what is missing, update what changed, drop the rest. */
  function applyPlan(c) {
    const d = planDiff(c);
    const dbx = get();

    d.remove.forEach(function (j) {
      const i = dbx.jobs.indexOf(j);
      if (i >= 0) dbx.jobs.splice(i, 1);
    });
    d.update.forEach(function (x) { stampJob(x.job, x.pv, c); });

    const made = d.add.map(function (pv) {
      const j = stampJob({
        id: nextId('job', 'JOB-', 4),
        type: 'AMC Visit',
        contractId: c.id,
        clientId: c.clientId,
        date: pv.date,
        status: dayDelta(pv.date) < 0 ? 'completed' : 'scheduled',
        priority: 'normal',
        notes: c.notes || '',
        exec: null
      }, pv, c);
      dbx.jobs.push(j);
      return j;
    });

    // Renumber the whole schedule so "visit 4 of 12" stays honest.
    const all = contractJobs(c.id);
    all.forEach(function (j, i) { j.visitNo = i + 1; j.ofVisits = all.length; });
    c.totalVisits = all.length;

    save();
    return { made: made, added: d.add.length, updated: d.update.length,
             removed: d.remove.length, kept: d.keep.length, frozen: d.frozen.length };
  }

  /** Create the schedule for a brand-new contract. */
  function generateVisits(c) {
    if (!c.plan || !c.plan.length) c.plan = defaultPlan(c);
    return applyPlan(c).made;
  }

  /** Convert an approved quotation into an AMC contract + its visit schedule. */
  function quoteToContract(q, opts) {
    const o = opts || {};
    const d = get();
    let cid = q.clientId;

    // Promote the lead into a customer record if the quote was raised on a lead
    if (!cid && q.leadId) {
      const l = lead(q.leadId);
      cid = 'CL-' + String(d.clients.length + 1).padStart(3, '0');
      d.clients.push({
        id: cid, name: l.name, type: l.type, contact: l.name, phone: l.phone, email: l.email,
        addr: l.area, city: 'Chennai', pin: '', gstin: '', since: todayISO(),
        color: '#0B7454', area: '—'
      });
      // The AMC existing is not the same as it being signed — that is the
      // Contract stage. The lead is only won when someone confirms the signature.
      if (l.stage !== 'won') l.stage = 'contract';
      l.clientId = cid;
    }

    const t = quoteTotals(q);
    const c = {
      id: 'AMC-' + new Date().getFullYear() + '-' + String((d.seq.contract = (d.seq.contract || 0) + 1)).padStart(2, '0'),
      clientId: cid,
      quoteId: q.id,
      start: o.start || todayISO(),
      months: o.months || q.months || 12,
      freq: o.freq || q.freq || 'Monthly',
      serviceIds: (q.items || []).map(i => i.svId).filter(Boolean),
      value: Math.round(t.total),
      billing: o.billing || 'Quarterly',
      owner: 'U02',
      techId: o.techId || '',
      site: (client(cid) || {}).addr || '',
      scope: q.title,
      slot: o.slot || '10:00',
      notes: q.notes || '',
      leadId: q.leadId || null,
      mergeSameDay: o.mergeSameDay !== false,
      workdaysOnly: o.workdaysOnly !== false,
      blackout: []
    };
    c.end = w.Seed.addMonths(c.start, c.months);
    // Each quoted line's quantity is that service's visit count for the term.
    c.plan = o.plan || planFromQuote(q, c);
    d.contracts.push(c);
    if (q.leadId) {
      const ld = lead(q.leadId);
      if (ld) { ld.contractId = c.id; ld.clientId = ld.clientId || cid; }
    }
    generateVisits(c);
    q.status = 'approved';
    q.contractId = c.id;
    save();
    return c;
  }

  /** Raise an invoice from a completed service or a contract billing cycle. */
  /* ------------------------------------------------------------ invoicing */
  /**
   * What one visit of `svId` costs under this contract. Contracts written
   * before rates were stored on the plan fall back to the catalogue price,
   * so nothing has to be migrated for them to bill correctly.
   */
  function contractRate(c, svId) {
    const line = ((c && c.plan) || []).filter(l => l.svId === svId)[0];
    if (line && line.rate != null && line.rate !== 0) return line.rate;
    return (service(svId) || {}).price || 0;
  }

  /** The invoice a visit sits on, or null if nobody has billed it. */
  function invoiceForJob(jobId) {
    return get().invoices.filter(i => (i.jobIds || []).indexOf(jobId) >= 0)[0] || null;
  }

  /** Completed visits on this contract that have not been billed. */
  function uninvoicedVisits(c) {
    if (!c) return [];
    return contractJobs(c.id).filter(j => j.status === 'completed' && !invoiceForJob(j.id));
  }

  /**
   * Why this visit cannot be invoiced, or '' when it can. One place decides
   * it, so the button, the row badge and the action all agree.
   */
  function billBlock(j) {
    if (!j) return 'Service not found';
    if (!j.contractId) return 'Not on a contract — invoices are raised against a contract';
    if (j.status === 'cancelled') return 'This visit was cancelled';
    if (j.status !== 'completed') return 'The visit has to be completed first';
    const had = invoiceForJob(j.id);
    if (had) return 'Already billed on ' + had.id;
    return '';
  }

  /** Invoice lines for a set of services, priced from the contract. */
  function linesFor(c, serviceIds) {
    return (serviceIds || []).map(function (id) {
      const sv = service(id) || {};
      return { svId: id, name: sv.name || 'Service', qty: 1, rate: contractRate(c, id) };
    }).filter(function (l) { return l.rate > 0 || l.name; });
  }

  /**
   * Raise the invoice for one completed AMC visit. The lines are the services
   * that visit actually carried, at the contract's own rates — never a share
   * of the headline value, which drifts from what was agreed.
   */
  function invoiceFromVisit(j, opts) {
    const o = opts || {};
    const c = contract(j.contractId);
    const d = get();
    const inv = {
      id: nextId('invoice', 'INV-', 0),
      clientId: j.clientId,
      contractId: j.contractId,
      jobIds: [j.id],
      mode: 'amc',
      date: todayISO(),
      due: o.due || w.Seed.D(15),
      period: o.period || ('Visit ' + (j.visitNo || '') + ' of ' + (j.ofVisits || '') +
        ' — ' + fmtDate(j.date)).replace(' of  —', ' —'),
      items: o.items || linesFor(c, j.serviceIds),
      status: 'unpaid'
    };
    d.invoices.unshift(inv);
    save();
    return inv;
  }

  /**
   * Raise the invoice for a one-time contract: everything it covers, once.
   * Priced off the contract's own service list rather than the job's, which
   * only carries the first couple for the technician's benefit.
   */
  function invoiceFromOneTime(c, opts) {
    const o = opts || {};
    const d = get();
    const jobs = contractJobs(c.id);
    const inv = {
      id: nextId('invoice', 'INV-', 0),
      clientId: c.clientId,
      contractId: c.id,
      jobIds: jobs.map(function (j) { return j.id; }),
      mode: 'onetime',
      date: todayISO(),
      due: o.due || w.Seed.D(15),
      period: o.period || ('One-time service — ' + fmtDate(c.start)),
      items: o.items || linesFor(c, c.serviceIds),
      status: 'unpaid'
    };
    d.invoices.unshift(inv);
    save();
    return inv;
  }

  function invoiceFromContract(c, label) {
    const d = get();
    const perCycle = Math.round(c.value / (w.Seed.FREQ_MONTHS[c.billing] ? (12 / w.Seed.FREQ_MONTHS[c.billing]) : 4));
    const inv = {
      id: nextId('invoice', 'INV-', 0),
      clientId: c.clientId, contractId: c.id,
      date: todayISO(), due: w.Seed.D(15),
      period: label || (c.billing + ' billing'),
      items: [{ name: 'AMC ' + c.billing + ' Service — ' + clientName(c.clientId), qty: 1, rate: Math.round(perCycle / 1.18) }],
      status: 'unpaid'
    };
    d.invoices.unshift(inv);
    save();
    return inv;
  }

  function recordPayment(inv, amount, mode, ref) {
    const d = get();
    const p = {
      id: nextId('receipt', 'RCP-', 0),
      invoiceId: inv.id, date: todayISO(), amount: Math.round(amount),
      mode: mode, ref: ref || '—', by: (me() || {}).id || 'U07'
    };
    d.payments.unshift(p);
    syncInvoiceStatus(inv);
    save();
    return p;
  }

  /** Deduct consumed chemicals from stock and log the movement. */
  function consumeStock(jobId, chemicals, byId) {
    const d = get();
    (chemicals || []).forEach(c => {
      const it = item(c.id);
      if (!it) return;
      it.stock = Math.max(0, it.stock - c.qty);
      d.stockMoves.unshift({
        id: 'SM-' + Math.floor(Math.random() * 900 + 500),
        date: todayISO(), itemId: c.id, qty: -c.qty,
        type: 'Consumed', ref: jobId, by: byId
      });
    });
    save();
  }

  function activityFeed(limit) {
    const d = get();
    const out = [];
    d.jobs.filter(j => j.status === 'completed' && j.exec)
      .sort((a, b) => (b.exec.finishedAt || '') > (a.exec.finishedAt || '') ? 1 : -1)
      .slice(0, 8).forEach(j => out.push({
        icon: 'checkcircle', tone: 'green', at: j.exec.finishedAt || j.date,
        title: userName(j.techIds[0]) + ' completed ' + jobTitle(j),
        sub: clientName(j.clientId) + ' • ' + j.id, href: '#/jobs/' + j.id
      }));
    d.quotations.slice(0, 4).forEach(q => out.push({
      icon: 'filetext', tone: 'blue', at: q.date + 'T12:00',
      title: 'Quotation ' + q.id + ' ' + (q.status === 'draft' ? 'drafted' : q.status),
      sub: (q.clientId ? clientName(q.clientId) : (lead(q.leadId) || {}).name) + ' • ' + money(quoteTotals(q).total),
      href: '#/quotations/' + q.id
    }));
    d.payments.slice(0, 4).forEach(p => out.push({
      icon: 'rupee', tone: 'brand', at: p.date + 'T11:00',
      title: 'Payment received ' + money(p.amount),
      sub: p.mode + ' • ' + p.invoiceId, href: '#/invoices/' + p.invoiceId
    }));
    d.leads.slice(0, 4).forEach(l => out.push({
      icon: 'userplus', tone: 'violet', at: l.created + 'T10:00',
      title: 'New lead — ' + l.name, sub: l.source + ' • ' + money(l.value), href: '#/leads'
    }));
    return out.sort((a, b) => a.at > b.at ? -1 : 1).slice(0, limit || 12);
  }

  /* -------------------------------------------------------------- export */
  w.S = {
    load: load, save: save, reset: reset, get: get,
    session: session, setSession: setSession, clearSession: clearSession, me: me,
    user: user, client: client, service: service, contract: contract, job: job,
    branch: branch, branchName: branchName, userBranches: userBranches,
    branchStaff: branchStaff, assignableUsers: assignableUsers,
    branchAreas: branchAreas, branchForArea: branchForArea, areaKey: areaKey,
    quote: quote, invoice: invoice, lead: lead, item: item, audit: audit,
    clientName: clientName, userName: userName, svcName: svcName, jobTitle: jobTitle,
    money: money, moneyShort: moneyShort, amountInWords: amountInWords,
    fmtDate: fmtDate, fmtShort: fmtShort, fmtDay: fmtDay, fmtLong: fmtLong,
    fmtTime: fmtTime, timeParts: timeParts, relDay: relDay, dayDelta: dayDelta,
    durationText: durationText, minutesBetween: minutesBetween, nowStamp: nowStamp,
    todayISO: todayISO, parse: parse, MON: MON, MONL: MONL, DOW: DOW, DOWL: DOWL,
    JOB_STATUS: JOB_STATUS, QUOTE_STATUS: QUOTE_STATUS, INV_STATUS: INV_STATUS, JOB_TYPE: JOB_TYPE,
    contractStatus: contractStatus, quoteTotals: quoteTotals, invoiceTotals: invoiceTotals,
    homeState: homeState, supplyState: supplyState, isInterState: isInterState, inIndia: inIndia,
    DAY_FROM: DAY_FROM, DAY_TO: DAY_TO, SNAP: SNAP, toMin: toMin, toHHMM: toHHMM,
    workHours: workHours, onDuty: onDuty, clientBranch: clientBranch, jobBranch: jobBranch,
    unassignedOn: unassignedOn, dropCheck: dropCheck, placeJob: placeJob, restoreJob: restoreJob,
    unassignJob: unassignJob, freeGaps: freeGaps, firstFree: firstFree, suggestTechs: suggestTechs,
    autoAssign: autoAssign, balanceDay: balanceDay, undoBatch: undoBatch, jobCrewSize: jobCrewSize,
    staffing: staffing,
    peakCrew: peakCrew, contractCrew: contractCrew,
    understaffed: understaffed,
    syncCrew: syncCrew,
    taxSplit: taxSplit, taxRows: taxRows,
    syncInvoiceStatus: syncInvoiceStatus, contractJobs: contractJobs, contractProgress: contractProgress,
    jobsOn: jobsOn, jobsForTech: jobsForTech, jobsForClient: jobsForClient,
    kpis: kpis, monthlySeries: monthlySeries, serviceMix: serviceMix, techLeaderboard: techLeaderboard,
    nextId: nextId, generateVisits: generateVisits, quoteToContract: quoteToContract,
    defaultPlan: defaultPlan, planFromQuote: planFromQuote, freqForVisits: freqForVisits,
    planSummary: planSummary, leadContracts: leadContracts,
    planDiff: planDiff, planWarnings: planWarnings, applyPlan: applyPlan,
    invoiceFromContract: invoiceFromContract, recordPayment: recordPayment,
    contractRate: contractRate, invoiceForJob: invoiceForJob,
    uninvoicedVisits: uninvoicedVisits, billBlock: billBlock, linesFor: linesFor,
    invoiceFromVisit: invoiceFromVisit, invoiceFromOneTime: invoiceFromOneTime,
    consumeStock: consumeStock, activityFeed: activityFeed,
    OPEN_LEAD_STAGES: OPEN_LEAD_STAGES, isOpenLead: isOpenLead,
    waTemplate: waTemplate, fillTemplate: fillTemplate,
    dbSizeKB: dbSizeKB, storageUse: storageUse, storageWouldOverflow: storageWouldOverflow,
    phoneKey: phoneKey, directory: directory, findContact: findContact,
    contactHistory: contactHistory
  };
})(window);
