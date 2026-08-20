/* ==========================================================================
   PestOps — Demo seed data
   All dates are generated relative to "today" so the demo never goes stale.
   ========================================================================== */
(function (w) {
  'use strict';

  /* ---------- date helpers ---------- */
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  function iso(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function D(offsetDays) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + offsetDays);
    return iso(d);
  }
  function addMonths(dateStr, n) {
    const [y, m, dd] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1 + n, dd);
    return iso(d);
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  /**
   * A clock time N minutes before "now", clamped into working hours.
   * Used so the in-progress service always shows a believable live timer,
   * whatever time of day the demo is opened.
   */
  function liveTime(minsAgo) {
    const now = new Date();
    let t = now.getHours() * 60 + now.getMinutes() - minsAgo;
    if (t < 8 * 60) t = 8 * 60 + 15;
    const p = n => String(n).padStart(2, '0');
    return p(Math.floor(t / 60)) + ':' + p(t % 60);
  }
  function liveSlot(minsAgo) {
    const t = liveTime(minsAgo).split(':');
    return t[0] + ':' + (Number(t[1]) < 30 ? '00' : '30');
  }

  /* ---------- placeholder photo (offline-safe SVG data URI) ---------- */
  function photo(label, hue) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${hue},32%,74%)"/>` +
      `<stop offset="1" stop-color="hsl(${hue},30%,52%)"/></linearGradient></defs>` +
      `<rect width="300" height="300" fill="url(#g)"/>` +
      `<circle cx="150" cy="118" r="42" fill="rgba(255,255,255,.28)"/>` +
      `<path d="M150 96v44M128 118h44" stroke="rgba(255,255,255,.85)" stroke-width="7" stroke-linecap="round"/>` +
      `<text x="150" y="200" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" ` +
      `fill="rgba(255,255,255,.95)" text-anchor="middle">${label}</text>` +
      `<text x="150" y="226" font-family="Inter,Arial,sans-serif" font-size="13" ` +
      `fill="rgba(255,255,255,.7)" text-anchor="middle">Site photo</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ======================================================================
     COMPANY
     ====================================================================== */
  const company = {
    name: 'Shield Pest Control Services',
    tagline: 'Licensed Pest Management • Since 2014',
    gstin: '33AABCS1429B1ZP',
    // Where we are registered. Supply to this state is CGST + SGST; anywhere
    // else is IGST at the full rate.
    state: 'Tamil Nadu',
    licence: 'TN/PCO/2014/1187',
    addr1: 'No. 42, Sardar Patel Road, 2nd Floor',
    addr2: 'Adyar, Chennai — 600 020',
    phone: '+91 98400 12345',
    email: 'ops@shieldpest.in',
    web: 'www.shieldpest.in',
    bank: { name: 'HDFC Bank, Adyar Branch', ac: '50200042118736', ifsc: 'HDFC0000521' },
    upi: 'shieldpest@hdfcbank',
    gstRate: 18,
    currency: '₹',
    terms: [
      'Quotation valid for 15 days from date of issue.',
      'Payment: 50% advance on confirmation, balance on completion of first service.',
      'All chemicals used are CIB&RC approved and applied by licensed applicators.',
      'Warranty covers re-treatment only; does not cover new infestation from external sources.',
      'Customer to vacate treated area for the duration advised by the technician.'
    ]
  };

  /* ======================================================================
     BRANCHES  (master data)
     ====================================================================== */
  const branches = [
    { id: 'BR-01', name: 'Adyar — Head Office', code: 'ADY', city: 'Chennai',
      addr: 'No. 42, Sardar Patel Road, 2nd Floor, Adyar', pin: '600020',
      phone: '+91 98400 12345', email: 'adyar@shieldpest.in', managerId: 'U01',
      gstin: '33AABCS1429B1ZP', opened: '2014-04-01', active: true,
      areas: ['Adyar', 'Besant Nagar', 'Thiruvanmiyur', 'Mylapore', 'Alwarpet',
              'Nungambakkam', 'T. Nagar', 'Kotturpuram', 'Saidapet', 'Egmore'] },
    { id: 'BR-02', name: 'Anna Nagar', code: 'ANR', city: 'Chennai',
      addr: '18, 3rd Avenue, Anna Nagar West', pin: '600040',
      phone: '+91 98410 22336', email: 'annanagar@shieldpest.in', managerId: 'U02',
      gstin: '33AABCS1429B1ZP', opened: '2019-08-12', active: true,
      areas: ['Anna Nagar', 'Ambattur', 'Porur', 'Poonamallee', 'Mogappair',
              'Kilpauk', 'Ayanavaram', 'Avadi', 'Vadapalani', 'West Mambalam'] },
    { id: 'BR-03', name: 'OMR — Perungudi', code: 'OMR', city: 'Chennai',
      addr: 'Thoraipakkam–Pallavaram Road, Perungudi', pin: '600096',
      phone: '+91 90030 44521', email: 'omr@shieldpest.in', managerId: 'U03',
      gstin: '33AABCS1429B1ZP', opened: '2023-02-01', active: true,
      areas: ['Perungudi', 'Thoraipakkam', 'Sholinganallur', 'Velachery', 'Guindy',
              'Navalur', 'Siruseri', 'Neelankarai', 'Karapakkam', 'Pallikaranai'] }
  ];

  /* ----------------------------------------------- customer master lists */
  const SALUTATIONS = ['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'];
  const CUSTOMER_TYPES = ['Business', 'Individual'];
  const LANGUAGES = ['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'];
  const CURRENCIES = ['INR - Indian Rupee', 'USD - US Dollar', 'AED - UAE Dirham', 'SGD - Singapore Dollar'];

  /* The GST registration status decides how tax is applied on every invoice. */
  const GST_TREATMENTS = [
    'Registered Business - Regular',
    'Registered Business - Composition',
    'Unregistered Business',
    'Consumer',
    'Overseas',
    'Special Economic Zone',
    'Deemed Export',
    'Tax Deductor',
    'SEZ Developer'
  ];

  const PAYMENT_TERMS = [
    'Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60',
    'Due end of the month', 'Due end of next month'
  ];

  /* Place of supply — the GST state code decides CGST+SGST vs IGST. */
  const STATES = [
    'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
    'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
    'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];

  const COUNTRIES = ['India', 'United Arab Emirates', 'Singapore', 'Sri Lanka', 'Malaysia', 'United States'];

  const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Son', 'Daughter', 'Guardian', 'Friend'];
  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Probation', 'Intern'];

  /* ======================================================================
     USERS / TEAM
     ====================================================================== */
  const users = [
    { id: 'U01', name: 'Rajesh Kumar',   role: 'admin',    title: 'Founder & Director',      phone: '+91 98400 12345', email: 'rajesh@shieldpest.in',  color: '#0B7454', joined: '2014-04-01',
      photo: '', branches: ['BR-01', 'BR-02', 'BR-03'], empType: 'Full-time', dob: '1978-02-14', blood: 'O+',
      aadhaar: '4821 7730 9155', addr: '9, Kasturba Nagar, Adyar, Chennai 600020', docs: [],
      emergency: [{ name: 'Lakshmi Kumar', relation: 'Spouse', phone: '+91 98400 12346' }] },
    { id: 'U02', name: 'Priya Sharma',   role: 'ops',      title: 'Operations Manager',      phone: '+91 98410 22336', email: 'priya@shieldpest.in',   color: '#7C3AED', joined: '2018-07-15',
      photo: '', branches: ['BR-01', 'BR-02'], empType: 'Full-time', dob: '1988-11-03', blood: 'B+',
      aadhaar: '7710 4425 8890', addr: '14/2, Ceebros Apartments, Alwarpet, Chennai 600018', docs: [],
      emergency: [{ name: 'Mohan Sharma', relation: 'Father', phone: '+91 98410 22337' }] },
    { id: 'U03', name: 'Arun Prakash',   role: 'sales',    title: 'Sales Executive',         phone: '+91 90030 44521', email: 'arun@shieldpest.in',    color: '#2E90FA', joined: '2021-01-11',
      photo: '', branches: ['BR-01', 'BR-03'], empType: 'Full-time', dob: '1994-06-21', blood: 'A+',
      aadhaar: '2298 6614 3072', addr: '5, Bharathi Street, Velachery, Chennai 600042', docs: [],
      emergency: [{ name: 'Prakash R', relation: 'Father', phone: '+91 90030 44522' },
                  { name: 'Divya A', relation: 'Sister', phone: '+91 90030 78115' }] },
    { id: 'U04', name: 'Karthik R',      role: 'tech',     title: 'Senior Technician',       phone: '+91 99400 76512', email: 'karthik@shieldpest.in', color: '#F79009', joined: '2017-03-20',
      skills: ['Termite', 'Cockroach', 'Rodent', 'Fumigation'], licence: 'TN/APP/2017/0912', rating: 4.8, jobsDone: 1284,
      photo: '', branches: ['BR-01'], empType: 'Full-time', dob: '1991-09-08', blood: 'O+',
      aadhaar: '6032 1178 4429', addr: '22, Ramakrishna Street, Thiruvanmiyur, Chennai 600041', docs: [],
      emergency: [{ name: 'Ravi R', relation: 'Father', phone: '+91 99400 76513' }] },
    { id: 'U05', name: 'Suresh M',       role: 'tech',     title: 'Technician',              phone: '+91 89390 11284', email: 'suresh@shieldpest.in',  color: '#12B76A', joined: '2020-09-05',
      skills: ['Cockroach', 'Bed Bug', 'Mosquito'], licence: 'TN/APP/2020/1455', rating: 4.6, jobsDone: 742,
      photo: '', branches: ['BR-02'], empType: 'Full-time', dob: '1995-01-27', blood: 'B-',
      aadhaar: '5514 8802 6631', addr: '7, Mettu Street, Ayanavaram, Chennai 600023', docs: [],
      emergency: [{ name: 'Kalaiselvi M', relation: 'Mother', phone: '+91 89390 11285' }] },
    { id: 'U06', name: 'Vignesh S',      role: 'tech',     title: 'Technician',              phone: '+91 73580 90014', email: 'vignesh@shieldpest.in', color: '#F04438', joined: '2022-11-02',
      skills: ['Rodent', 'Disinfection', 'Fly Control'], licence: 'TN/APP/2022/2201', rating: 4.4, jobsDone: 411,
      photo: '', branches: ['BR-03'], empType: 'Probation', dob: '1998-04-16', blood: 'AB+',
      aadhaar: '9106 3348 7725', addr: '31, Thoraipakkam Main Road, Chennai 600097', docs: [],
      emergency: [{ name: 'Saravanan S', relation: 'Brother', phone: '+91 73580 90015' }] },
    { id: 'U09', name: 'Manoj Kumar',    role: 'tech',     title: 'Senior Technician',       phone: '+91 98410 22764', email: 'manoj@shieldpest.in',   color: '#7F56D9', joined: '2018-07-11',
      skills: ['Termite', 'Wood Borer', 'Fumigation'], licence: 'TN/APP/2018/1140', rating: 4.7, jobsDone: 968,
      photo: '', branches: ['BR-01'], empType: 'Full-time', dob: '1988-02-27', blood: 'B+',
      aadhaar: '5521 8834 1907', addr: '12, Gandhi Street, Saidapet, Chennai 600015', docs: [],
      emergency: [{ name: 'Sudha K', relation: 'Wife', phone: '+91 98410 22765' }] },
    { id: 'U10', name: 'Lakshmi Devi',   role: 'tech',     title: 'Technician',              phone: '+91 90031 55408', email: 'lakshmi@shieldpest.in', color: '#0BA5EC', joined: '2021-01-18',
      skills: ['Disinfection', 'Fly Control', 'Mosquito'], licence: 'TN/APP/2021/1863', rating: 4.5, jobsDone: 522,
      photo: '', branches: ['BR-02'], empType: 'Full-time', dob: '1995-09-03', blood: 'O+',
      aadhaar: '7740 2216 9053', addr: '8/2, Poonamallee High Road, Aminjikarai, Chennai 600029', docs: [],
      emergency: [{ name: 'Devi R', relation: 'Mother', phone: '+91 90031 55409' }] },
    { id: 'U11', name: 'Anand Raj',      role: 'tech',     title: 'Technician',              phone: '+91 94441 87330', email: 'anand@shieldpest.in',   color: '#DC6803', joined: '2023-04-24',
      skills: ['Cockroach', 'Rodent', 'Bed Bug'], licence: 'TN/APP/2023/2410', rating: 4.2, jobsDone: 238,
      photo: '', branches: ['BR-03'], empType: 'Full-time', dob: '1999-11-30', blood: 'A+',
      aadhaar: '3318 6607 2244', addr: '55, Sholinganallur Main Road, Chennai 600119', docs: [],
      emergency: [{ name: 'Rajan A', relation: 'Father', phone: '+91 94441 87331' }] },
    { id: 'U07', name: 'Deepa Nair',     role: 'accounts', title: 'Accounts & Billing',      phone: '+91 94440 55810', email: 'deepa@shieldpest.in',   color: '#DB2777', joined: '2019-06-18',
      photo: '', branches: ['BR-01'], empType: 'Full-time', dob: '1990-12-09', blood: 'A-',
      aadhaar: '3387 2290 5518', addr: '3B, Lake View Road, West Mambalam, Chennai 600033', docs: [],
      emergency: [{ name: 'Suresh Nair', relation: 'Spouse', phone: '+91 94440 55811' }] },
    { id: 'U08', name: 'Meera Krishnan', role: 'client',   title: 'Facility Manager',        phone: '+91 98842 31007', email: 'meera@srikrishnaapts.in', color: '#0891B2', clientId: 'CL-001' }
  ];

  const ROLES = {
    admin:    { label: 'Administrator',      desc: 'Full access — business, money, people, settings', icon: 'shieldcheck', color: '#0B7454' },
    ops:      { label: 'Operations Manager', desc: 'Scheduling, dispatch, technicians, audits',       icon: 'route',       color: '#7C3AED' },
    sales:    { label: 'Sales Executive',    desc: 'Leads, quotations, customer onboarding',            icon: 'trendup',     color: '#2E90FA' },
    tech:     { label: 'Field Technician',   desc: "Today's work, service execution, photo proof",        icon: 'hardhat',     color: '#F79009' },
    accounts: { label: 'Accounts & Billing', desc: 'Invoices, receipts, payment follow-up',           icon: 'receipt',     color: '#DB2777' },
    client:   { label: 'Customer Portal',      desc: 'Contracts, visit history, reports, invoices',     icon: 'building',    color: '#0891B2' }
  };

  /* ======================================================================
     SERVICES
     ====================================================================== */
  const services = [
    { id: 'SV01', code: 'GPC',  name: 'General Pest Control',            cat: 'Residential',  price: 1800,  unit: 'per visit',      mins: 60, warranty: '3 months', chem: ['IN01', 'IN03'], desc: 'Covers cockroach, ant, spider, silverfish and lizard. Gel + residual spray in kitchen, bathrooms and common areas.' },
    { id: 'SV02', code: 'CKG',  name: 'Cockroach Control — Gel',         cat: 'Residential',  price: 1200,  unit: 'per visit',      mins: 45, warranty: '3 months', chem: ['IN01'],         desc: 'Odourless gel baiting in kitchen hinges, cabinets and appliance gaps. No vacating required.' },
    { id: 'SV03', code: 'CKS',  name: 'Cockroach Control — Spray',       cat: 'Commercial',   price: 900,   unit: 'per visit',      mins: 40, warranty: '1 month',  chem: ['IN03'],         desc: 'Residual surface spray for heavy infestation. Area must be vacated for 3–4 hours.' },
    { id: 'SV04', code: 'TRM-P',name: 'Termite Control — Post Const.',   cat: 'Specialised',  price: 18000, unit: 'per 1000 sq.ft', mins: 240,warranty: '5 years',  chem: ['IN02'],         desc: 'Drill-fill-seal chemical barrier along wall-floor junction at 12" intervals.' },
    { id: 'SV05', code: 'TRM-C',name: 'Termite Control — Pre Const.',    cat: 'Specialised',  price: 25000, unit: 'per 1000 sq.ft', mins: 300,warranty: '10 years', chem: ['IN02'],         desc: 'Soil treatment during construction — foundation, backfill and plinth stages.' },
    { id: 'SV06', code: 'BBG',  name: 'Bed Bug Treatment',               cat: 'Residential',  price: 2500,  unit: 'per bedroom',    mins: 90, warranty: '45 days',  chem: ['IN04'],         desc: 'Two-round treatment 15 days apart. Mattress, frame, upholstery and crevice spray.' },
    { id: 'SV07', code: 'ROD',  name: 'Rodent Control',                  cat: 'Commercial',   price: 2200,  unit: 'per visit',      mins: 60, warranty: '1 month',  chem: ['IN05'],         desc: 'Tamper-proof bait stations, glue boards and snap traps with numbered station map.' },
    { id: 'SV08', code: 'MOS',  name: 'Mosquito Control — Fogging',      cat: 'Commercial',   price: 3500,  unit: 'per visit',      mins: 75, warranty: '15 days',  chem: ['IN06'],         desc: 'Thermal fogging of outdoor perimeter plus larvicide in stagnant water points.' },
    { id: 'SV09', code: 'WDB',  name: 'Wood Borer Treatment',            cat: 'Specialised',  price: 4500,  unit: 'per visit',      mins: 120,warranty: '1 year',   chem: ['IN02'],         desc: 'Injection treatment into borer holes followed by surface coating on all wood work.' },
    { id: 'SV10', code: 'SNK',  name: 'Snake Repellent Treatment',       cat: 'Industrial',   price: 3000,  unit: 'per visit',      mins: 90, warranty: '3 months', chem: ['IN07'],         desc: 'Perimeter granular repellent with habitat clearance advisory.' },
    { id: 'SV11', code: 'DIS',  name: 'Disinfection & Sanitisation',     cat: 'Commercial',   price: 2800,  unit: 'per visit',      mins: 60, warranty: '—',        chem: ['IN08'],         desc: 'Hospital-grade quaternary ammonium fogging for offices, clinics and schools.' },
    { id: 'SV12', code: 'BEE',  name: 'Honey Bee / Wasp Removal',        cat: 'Specialised',  price: 2000,  unit: 'per hive',       mins: 60, warranty: '—',        chem: ['IN03'],         desc: 'Safe hive removal in protective gear, carried out after sunset.' },
    { id: 'SV13', code: 'FLY',  name: 'Fly Control — Commercial',        cat: 'Commercial',   price: 4000,  unit: 'per visit',      mins: 60, warranty: '1 month',  chem: ['IN06'],         desc: 'Space spray, drain gel and insect light trap servicing for kitchens and food areas.' },
    { id: 'SV14', code: 'WTC',  name: 'Water Tank Cleaning',             cat: 'Residential',  price: 1500,  unit: 'per tank',       mins: 90, warranty: '—',        chem: ['IN08'],         desc: 'De-silting, high-pressure scrub, vacuum and UV/chlorine disinfection.' },
    { id: 'SV15', code: 'LIZ',  name: 'Lizard Control',                  cat: 'Residential',  price: 1100,  unit: 'per visit',      mins: 40, warranty: '1 month',  chem: ['IN03'],         desc: 'Repellent spray on entry points, window grills and false ceiling voids.' }
  ];

  /* ----------------------------------------------------------------------
     How often each service is normally done, and what the technician has to
     tick off on site. A contract inherits the frequency and can override it;
     the checklist of a visit is the union of its services' checklists.
     ---------------------------------------------------------------------- */
  const SERVICE_META = {
    SV01: { freq: 'Monthly', checklist: [
      'Kitchen platform, sink and cabinet hinges gel-baited',
      'Bathrooms and drain points treated',
      'Skirting and wall-floor junction residual spray',
      'Balcony and window grill perimeter covered',
      'Customer briefed on re-entry time' ] },
    SV02: { freq: 'Quarterly', checklist: [
      'Old gel residue removed before fresh application',
      'Cabinet hinges, corners and shelf runners dotted',
      'Appliance gaps — fridge, oven, microwave — treated',
      'Sink undercarriage and drain mouth covered' ] },
    SV03: { freq: 'Monthly', checklist: [
      'Area confirmed vacated before spraying',
      'All harbourage points sprayed to run-off',
      'False ceiling voids and duct openings covered',
      'Re-entry time given to the customer in writing' ] },
    SV04: { freq: 'Yearly', checklist: [
      'Drill holes at 12 inch intervals along the wall-floor junction',
      'Chemical injected under pressure to refusal',
      'Holes sealed and finished flush',
      'Door and window frames treated',
      'Treatment map photographed for the file' ] },
    SV05: { freq: 'Yearly', checklist: [
      'Foundation trench soil treated',
      'Backfill treated layer by layer',
      'Plinth and apron area covered',
      'Chemical batch number and dilution recorded' ] },
    SV06: { freq: 'Half-Yearly', checklist: [
      'Mattress seams and tufts treated',
      'Bed frame, headboard and joints sprayed',
      'Upholstery and skirting crevices covered',
      'Second round booked 15 days out',
      'Customer briefed on hot-washing all linen' ] },
    SV07: { freq: 'Monthly', checklist: [
      'All numbered bait stations located and opened',
      'Bait consumption recorded station by station',
      'Spent bait replaced and station resealed',
      'Glue boards and snap traps checked',
      'Station map updated and photographed',
      'Entry points and burrows noted for the report' ] },
    SV08: { freq: 'Monthly', checklist: [
      'Residents warned before fogging starts',
      'Outdoor perimeter thermal fogging completed',
      'Stagnant water points larvicided',
      'Overhead tanks and sumps checked for breeding' ] },
    SV09: { freq: 'Yearly', checklist: [
      'Every borer exit hole injected',
      'Surface coating applied to exposed woodwork',
      'Furniture undersides and backs covered',
      'Affected items listed in the report' ] },
    SV10: { freq: 'Quarterly', checklist: [
      'Perimeter granular repellent applied',
      'Overgrowth and debris piles flagged to the customer',
      'Rodent activity checked — the primary food source',
      'Habitat clearance advisory given in writing' ] },
    SV11: { freq: 'Monthly', checklist: [
      'All contracted areas fogged at the correct dilution',
      'High-touch surfaces wiped separately',
      'Washrooms and pantry covered',
      'Contact time observed before re-entry' ] },
    SV12: { freq: 'Yearly', checklist: [
      'Work carried out after sunset',
      'Full protective gear worn and photographed',
      'Hive removed intact and disposed of safely',
      'Site cleared of residual comb' ] },
    SV13: { freq: 'Monthly', checklist: [
      'Insect light trap glue boards changed',
      'Drain gel applied to every kitchen drain',
      'Garbage yard and bin area space-sprayed',
      'Bin lids and waste handling checked',
      'Board catch count recorded for trending' ] },
    SV14: { freq: 'Half-Yearly', checklist: [
      'Tank drained and de-silted',
      'High-pressure scrub of walls and floor',
      'Vacuum removal of residue',
      'UV or chlorine disinfection completed',
      'Before and after photographs taken' ] },
    SV15: { freq: 'Quarterly', checklist: [
      'Entry points and window grills sprayed',
      'False ceiling voids treated',
      'Behind wall-mounted fixtures covered',
      'Outdoor light fittings noted as insect attractants' ] }
  };

  services.forEach(function (sv) {
    const m = SERVICE_META[sv.id] || {};
    sv.defaultFreq = m.freq || 'Monthly';
    sv.checklist = (m.checklist || []).slice();
    sv.pdf = sv.pdf || null;
  });

  /* ======================================================================
     CLIENTS
     ====================================================================== */
  const clients = [
    { id: 'CL-001', name: 'Sri Krishna Apartments', type: 'Society', contact: 'Meera Krishnan', phone: '+91 98842 31007', email: 'meera@srikrishnaapts.in',
      addr: '18, 3rd Cross Street, Kasturba Nagar', city: 'Adyar, Chennai', pin: '600020', gstin: '33AAATS4471K1Z9', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2021-06-12', color: '#0891B2', area: '48 units / 62,000 sq.ft' },
    { id: 'CL-002', name: 'Grand Bay Hotel', type: 'Hospitality', contact: 'Vikram Menon', phone: '+91 98404 78123', email: 'facilities@grandbay.co.in',
      addr: 'ECR Main Road, Neelankarai', city: 'Chennai', pin: '600115', gstin: '33AACCG9912L1ZK', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2019-02-04', color: '#7C3AED', area: '84 rooms / 41,000 sq.ft' },
    { id: 'CL-003', name: 'Medlife Multi-Speciality Hospital', type: 'Healthcare', contact: 'Dr. S. Ravichandran', phone: '+91 94441 20087', email: 'admin@medlifehosp.in',
      addr: '7, Venkatnarayana Road, T. Nagar', city: 'Chennai', pin: '600017', gstin: '33AAECM3320H1ZR', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2020-11-19', color: '#F04438', area: '120 beds / 55,000 sq.ft' },
    { id: 'CL-004', name: 'Anitha Residence', type: 'Residential', contact: 'Anitha Raghavan', phone: '+91 99620 33471', email: 'anitha.r@gmail.com',
      addr: 'Flat 4B, Lakshmi Enclave, Velachery', city: 'Chennai', pin: '600042', gstin: '', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2023-08-27', color: '#12B76A', area: '3 BHK / 1,450 sq.ft' },
    { id: 'CL-005', name: 'TechNova Solutions Pvt Ltd', type: 'Corporate', contact: 'Sandeep Iyer', phone: '+91 90031 55620', email: 'admin@technova.io',
      addr: 'Olympia Tech Park, Level 6, OMR', city: 'Chennai', pin: '600096', gstin: '33AAGCT7781M1ZF', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2022-03-15', color: '#2E90FA', area: '2 floors / 28,000 sq.ft' },
    { id: 'CL-006', name: 'Fresh Basket Supermarket', type: 'Retail', contact: 'Naveen Kumar', phone: '+91 89398 22140', email: 'naveen@freshbasket.in',
      addr: '2nd Avenue, Anna Nagar West', city: 'Chennai', pin: '600040', gstin: '33AAJFF2018P1ZT', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2023-01-09', color: '#F79009', area: '9,200 sq.ft' },
    { id: 'CL-007', name: 'Little Stars Play School', type: 'Education', contact: 'Fathima Begum', phone: '+91 97910 44832', email: 'principal@littlestars.edu.in',
      addr: '11, Mount Poonamallee Road, Porur', city: 'Chennai', pin: '600116', gstin: '', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2024-06-01', color: '#DB2777', area: '6,400 sq.ft' },
    { id: 'CL-008', name: 'Kumar Residence', type: 'Residential', contact: 'Ramesh Kumar', phone: '+91 94450 71129', email: 'ramesh.kumar58@gmail.com',
      addr: '22, Luz Church Road, Mylapore', city: 'Chennai', pin: '600004', gstin: '', placeOfSupply: 'Tamil Nadu', gstTreatment: 'Registered Business - Regular', since: '2024-10-22', color: '#0B7454', area: 'Independent house / 2,100 sq.ft' }
  ];

  /* ======================================================================
     LEADS
     ====================================================================== */
  const LEAD_SOURCES = ['WhatsApp', 'Call', 'Website', 'Referral', 'Walk-in', 'Instagram', 'JustDial'];
  const PROPERTY_TYPES = ['Residential', 'Society', 'Commercial', 'Retail', 'Industrial',
    'Healthcare', 'Education', 'Corporate', 'Hospitality'];

  const LEAD_STAGES = [
    { id: 'new',        label: 'New Lead',   color: '#2E90FA' },
    { id: 'followup',   label: 'Follow-up',  color: '#0891B2' },
    { id: 'inspection', label: 'Inspection', color: '#6366F1' },
    { id: 'quoted',     label: 'Quoted',     color: '#F79009' },
    { id: 'contract',   label: 'Contract',   color: '#7C3AED' },
    { id: 'won',        label: 'Won',        color: '#12B76A' },
    { id: 'lost',       label: 'Lost',       color: '#94A3B8' }
  ];

  const leads = [
    { id: 'LD-1042', name: 'Sowmya Balaji',        phone: '+91 98847 55210', email: 'sowmya.b@gmail.com',        source: 'WhatsApp',  type: 'Residential', area: 'Besant Nagar',  interest: ['SV02'],        stage: 'new',       value: 1200,  branch: 'BR-01', owner: 'U03', created: D(-1), note: 'Cockroaches in kitchen, wants gel treatment this week.' },
    { id: 'LD-1041', name: 'Aravind Textiles',     phone: '+91 90032 11458', email: 'purchase@aravindtex.in',    source: 'Website',   type: 'Industrial',  area: 'Ambattur',      interest: ['SV07','SV13'], stage: 'new',       value: 42000, branch: 'BR-02', owner: 'U03', created: D(-2), note: 'Godown rodent + fly issue. Needs annual contract quote.' },
    { id: 'LD-1040', name: 'Blue Orchid Café',     phone: '+91 98410 66772', email: 'hello@blueorchid.cafe',     source: 'Referral',  type: 'Commercial',  area: 'Nungambakkam', interest: ['SV03','SV13'], stage: 'followup', value: 26000, branch: 'BR-01', owner: 'U03', created: D(-4), followUp: D(2), followUpTime: '15:00', note: 'FSSAI audit next month — needs pest control certificate.' },
    { id: 'LD-1039', name: 'Prakash Villa',        phone: '+91 99401 30028', email: 'prakash.villa@gmail.com',   source: 'Call',      type: 'Residential', area: 'Thiruvanmiyur',interest: ['SV04'],        stage: 'inspection', value: 32000, branch: 'BR-01', owner: 'U03', created: D(-5), inspectAt: D(1), inspectTime: '11:00', inspectBy: 'U04', note: 'Termite in door frames. Site inspection booked to take measurements.' },
    { id: 'LD-1034', name: 'Nithya Dental Clinic',  phone: '+91 90256 71180', email: 'front@nithyadental.in',    source: 'Call',      type: 'Healthcare',  area: 'Adyar',         interest: ['SV01','SV11'], stage: 'followup', value: 4600,  branch: 'BR-01', owner: 'U03', created: D(-7), followUp: D(1), followUpTime: '10:30', note: 'Wants quarterly disinfection. Asked us to call back once their renovation finishes.' },
    { id: 'LD-1038', name: 'Sunrise Hostel',       phone: '+91 73584 90021', email: 'admin@sunrisehostel.in',    source: 'WhatsApp',  type: 'Commercial',  area: 'Guindy',        interest: ['SV06'],        stage: 'quoted',    value: 30000, branch: 'BR-03', owner: 'U03', created: D(-8), note: 'Bed bugs across 12 rooms. Quote QT-2041 sent, following up.' },
    { id: 'LD-1033', name: 'Sai Ganesh Mess',        phone: '+91 88254 33619', email: 'saiganeshmess@gmail.com',   source: 'Walk-in',   type: 'Commercial',  area: 'Velachery',     interest: ['SV03','SV13'], stage: 'followup', value: 4900,  branch: 'BR-03', owner: 'U03', created: D(-9), followUp: D(3), followUpTime: '16:00', note: 'Cockroach and fly problem in the kitchen. Owner is travelling — wants a call on Monday.' },
    { id: 'LD-1037', name: 'Vasanth Apartments',   phone: '+91 94441 82277', email: 'assoc@vasanthapts.in',      source: 'Referral',  type: 'Society',     area: 'Perungudi',     interest: ['SV01','SV08'], stage: 'contract',  value: 54000, branch: 'BR-03', owner: 'U03', created: D(-11),note: 'AMC for 32 flats. Quote QT-2040 accepted in principle — association meeting on the 20th to sign.' },
    { id: 'LD-1036', name: 'Little Stars Play School', phone: '+91 97910 44832', email: 'principal@littlestars.edu.in', source: 'Walk-in', type: 'Education', area: 'Porur', interest: ['SV01','SV11'], stage: 'won', value: 36000, branch: 'BR-02', owner: 'U03', created: D(-24), note: 'Converted to AMC-2025-07 — child-safe chemicals only.' },
    { id: 'LD-1035', name: 'Metro Cash Carry',     phone: '+91 89395 77410', email: 'ops@metrocc.in',            source: 'Website',   type: 'Retail',      area: 'Poonamallee',   interest: ['SV07'],        stage: 'lost',      value: 48000, branch: 'BR-02', owner: 'U03', created: D(-31),note: 'Went with existing vendor on price. Revisit at renewal in Feb.' }
  ];

  /* ======================================================================
     QUOTATIONS
     ====================================================================== */
  function line(svId, qty, rate, note) {
    const s = services.find(x => x.id === svId);
    return { svId: svId, name: s ? s.name : 'Custom item', desc: note || (s ? s.desc : ''), qty: qty, rate: rate, unit: s ? s.unit : 'nos' };
  }

  const quotations = [
    { id: 'QT-2043', clientId: 'CL-006', leadId: null, date: D(-1), valid: D(14), owner: 'U03', status: 'sent',
      title: 'Annual Pest Management — Fresh Basket, Anna Nagar', mode: 'amc', freq: 'Monthly', months: 12,
      items: [line('SV07', 12, 2200), line('SV13', 12, 4000), line('SV03', 4, 900)], discount: 8000, notes: 'Night servicing after 10 PM to avoid customer footfall.' },
    { id: 'QT-2042', clientId: null, leadId: 'LD-1041', date: D(-2), valid: D(13), owner: 'U03', status: 'draft',
      title: 'Godown Rodent & Fly Control — Aravind Textiles', mode: 'amc', freq: 'Monthly', months: 12,
      items: [line('SV07', 12, 2400), line('SV13', 6, 4200)], discount: 5000, notes: 'Bait station map to be handed over with first service report.' },
    { id: 'QT-2041', clientId: null, leadId: 'LD-1038', date: D(-8), valid: D(7), owner: 'U03', status: 'sent',
      title: 'Bed Bug Treatment — Sunrise Hostel (12 rooms)', mode: 'onetime', freq: '', months: 0,
      items: [line('SV06', 12, 2500, 'Two rounds per room, 15 days apart')], discount: 0, notes: 'Rooms to be vacated 4 hours. Linen to be hot-washed by customer.' },
    { id: 'QT-2040', clientId: null, leadId: 'LD-1037', date: D(-11), valid: D(4), owner: 'U03', status: 'sent',
      title: 'Society AMC — Vasanth Apartments (32 flats)', mode: 'amc', freq: 'Quarterly', months: 12,
      items: [line('SV01', 4, 9600, 'Common areas + 32 flats, per quarter'), line('SV08', 4, 3500)], discount: 6000, notes: 'Association billing, single consolidated invoice per quarter.' },
    { id: 'QT-2039', clientId: 'CL-007', leadId: 'LD-1036', date: D(-24), valid: D(-9), owner: 'U03', status: 'approved',
      title: 'Play School AMC — Little Stars, Porur', mode: 'amc', freq: 'Monthly', months: 12,
      items: [line('SV01', 12, 2200), line('SV11', 12, 800, 'Child-safe herbal formulation')], discount: 0, notes: 'All services on Saturdays after 2 PM only. Herbal / non-toxic chemicals.' },
    { id: 'QT-2038', clientId: 'CL-008', leadId: null, date: D(-18), valid: D(-3), owner: 'U03', status: 'rejected',
      title: 'Termite Treatment — Kumar Residence', mode: 'onetime', freq: '', months: 0,
      items: [line('SV04', 2.1, 18000, 'Post-construction, 2,100 sq.ft')], discount: 3000, notes: 'Customer deferred to next financial year.' }
  ];

  /* ======================================================================
     AMC CONTRACTS
     ====================================================================== */
  const FREQ_MONTHS = { 'Monthly': 1, 'Bi-Monthly': 2, 'Quarterly': 3, 'Half-Yearly': 6, 'Yearly': 12 };
  const FREQS = ['Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

  /* ======================================================================
     SCHEDULE ENGINE
     One implementation, used by the seed, by the store when a contract is
     saved, and by the contract screen to preview dates before anything is
     written. Pure — it never touches the database.
     ====================================================================== */

  const dayOfMonth = iso => Number(String(iso).split('-')[2]);

  /**
   * How a gap between visits reads to a person. Near a whole number of months
   * it gets the familiar name; anything faster is quoted in days, because
   * "every 8 days" is the only honest way to say four visits in a month.
   */
  function cadenceLabel(gapDays, visits) {
    if (visits === 1) return 'One-time';
    const near = [[30, 'Monthly'], [61, 'Bi-Monthly'], [91, 'Quarterly'],
                  [182, 'Half-Yearly'], [365, 'Yearly']];
    for (let i = 0; i < near.length; i++) {
      if (Math.abs(gapDays - near[i][0]) <= near[i][0] * 0.12) return near[i][1];
    }
    if (gapDays >= 7 && gapDays <= 8) return 'Weekly';
    if (gapDays >= 14 && gapDays <= 16) return 'Fortnightly';
    return 'Every ' + Math.round(gapDays) + ' days';
  }

  /** How many visits a line asks for, and how far apart they land. */
  function lineSpread(line, c) {
    const months = line.months || c.months || 12;
    const from = line.startAt || c.start;
    const term = Math.max(1, daysBetween(from, addMonths(from, months)));
    const visits = Math.max(1, line.visits ||
      Math.round(months / (FREQ_MONTHS[line.freq] || 1)));
    return { months: months, term: term, visits: visits, gap: term / visits };
  }

  /**
   * Move a proposed date onto the day the plan line asks for.
   * Only "dom:N" (fixed day of the month) is implemented; the field is a
   * string so "nth:2:SAT" and "gap:45" can be added without a schema change.
   */
  function applyDayRule(dateISO, rule) {
    const m = /^dom:(\d{1,2})$/.exec(rule || '');
    if (!m) return dateISO;
    const parts = dateISO.split('-').map(Number);
    const lastDay = new Date(parts[0], parts[1], 0).getDate();
    const day = Math.min(Math.max(1, Number(m[1])), lastDay);
    return parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /** Sunday and blackout dates push the visit forward to the next allowed day. */
  function nextAllowedDay(dateISO, blackout, workdaysOnly) {
    const list = blackout || [];
    const d = new Date(dateISO + 'T00:00:00');
    let guard = 0;
    while (guard++ < 21) {
      const cur = iso(d);
      const blocked = (workdaysOnly !== false && d.getDay() === 0) || list.indexOf(cur) >= 0;
      if (!blocked) return cur;
      d.setDate(d.getDate() + 1);
    }
    return iso(d);
  }

  /** A plan line with sensible defaults, ready to be edited on screen. */
  function planLine(svc, c, over) {
    const o = over || {};
    const freq = o.freq || svc.defaultFreq || 'Monthly';
    const step = FREQ_MONTHS[freq] || 1;
    return {
      svId: svc.id,
      freq: freq,
      // What one visit of this service costs under the contract. Invoicing
      // reads it from here so a rate agreed months ago is the rate billed,
      // whatever the catalogue says today.
      rate: o.rate != null ? o.rate : (svc.price || 0),
      months: o.months || c.months || 12,
      visits: o.visits || Math.max(1, Math.round((c.months || 12) / step)),
      mins: svc.mins || 60,
      dayRule: o.dayRule || ('dom:' + dayOfMonth(c.start)),
      slot: o.slot || c.slot || '10:00',
      // How many people the service takes, and who is actually on it. The
      // legacy single techId is still accepted as an override so old
      // overrides keep working, but it is never written back out.
      crew: Math.max(1, o.crew || 1),
      techIds: o.techIds ? o.techIds.slice()
             : (o.techId ? [o.techId] : (c.techId ? [c.techId] : []))
    };
  }

  /** Build a full plan for a contract from the services it covers. */
  function planFor(c, allServices, overrides) {
    const over = overrides || {};
    return (c.serviceIds || []).map(function (id) {
      const svc = allServices.find(function (x) { return x.id === id; });
      return svc ? planLine(svc, c, over[id]) : null;
    }).filter(Boolean);
  }

  /**
   * Turn a contract's plan into the visits it should produce.
   * Same date at the same site becomes one visit carrying every service due:
   * duration is the sum, technicians are the union, and each visit remembers
   * which plan lines created it.
   */
  /** The technicians a plan line is staffed with, old shape or new. */
  function lineCrew(l) {
    if (!l) return [];
    const list = (l.techIds && l.techIds.length) ? l.techIds.filter(Boolean)
               : (l.techId ? [l.techId] : []);
    // Every reader of a line's people comes through here, so one clamp means
    // stored data can never render as "3 of 2" however it got that way.
    return list.slice(0, Math.max(1, l.crew || 1));
  }

  function planVisits(c) {
    const plan = c.plan || [];
    const merge = c.mergeSameDay !== false;
    const groups = {};

    plan.forEach(function (line) {
      const sp = lineSpread(line, c);
      const n = sp.visits;
      // A month or more between visits keeps the calendar-month rhythm and the
      // "always the 5th" anchor. Anything faster is spread evenly in days,
      // because no day-of-month rule can describe an eight-day gap.
      const byMonth = sp.gap >= 28;
      const step = byMonth ? Math.max(1, Math.round(sp.months / n)) : 0;

      const from = line.startAt || c.start;
      for (let v = 0; v < n; v++) {
        const wanted = byMonth
          ? applyDayRule(addMonths(from, v * step), line.dayRule)
          : addDays(from, Math.round(v * sp.term / n));
        const date = nextAllowedDay(wanted, c.blackout, c.workdaysOnly);
        if (c.end && date > c.end) continue;          // never schedule past the term
        const key = merge ? date : date + '|' + line.svId;
        if (!groups[key]) groups[key] = { date: date, movedFrom: date === wanted ? '' : wanted, lines: [] };
        groups[key].lines.push(line);
      }
    });

    return Object.keys(groups).map(function (k) {
      const g = groups[k];
      const serviceIds = [], techIds = [], planRef = [];
      let mins = 0, slot = '';
      g.lines.forEach(function (l) {
        if (serviceIds.indexOf(l.svId) < 0) serviceIds.push(l.svId);
        // A service can need a crew, so each line carries a list. The older
        // single `techId` is still read, which keeps existing contracts working.
        lineCrew(l).forEach(function (id) { if (techIds.indexOf(id) < 0) techIds.push(id); });
        planRef.push((c.id || 'NEW') + '#' + l.svId);
        mins += l.mins || 60;
        if (!slot || (l.slot && l.slot < slot)) slot = l.slot;   // earliest start wins
      });
      return {
        date: g.date, movedFrom: g.movedFrom, serviceIds: serviceIds, techIds: techIds,
        planRef: planRef, mins: mins, slot: slot || c.slot || '10:00', lines: g.lines.length
      };
    }).sort(function (a, b) {
      return a.date === b.date ? (a.slot < b.slot ? -1 : 1) : (a.date < b.date ? -1 : 1);
    });
  }


  const contracts = [
    { id: 'AMC-2025-01', clientId: 'CL-001', quoteId: null, start: D(-214), months: 12, freq: 'Monthly',
      serviceIds: ['SV01', 'SV08'], value: 66000, billing: 'Quarterly', owner: 'U02', techId: 'U04',
      site: '18, 3rd Cross Street, Kasturba Nagar, Adyar', scope: 'All 48 flats + common areas, terrace, basement and STP room.',
      slot: '09:00', notes: 'Association requires 48-hour prior notice on the WhatsApp group.' },
    { id: 'AMC-2025-02', clientId: 'CL-002', quoteId: null, start: D(-181), months: 12, freq: 'Monthly',
      serviceIds: ['SV03', 'SV07', 'SV13'], value: 148000, billing: 'Monthly', owner: 'U02', techId: 'U04',
      site: 'ECR Main Road, Neelankarai', scope: 'Kitchen, banquet, 84 guest rooms (rotational 21/week), garbage yard, laundry.',
      slot: '23:00', notes: 'Night servicing only. Entry via staff gate, security pass at desk.' },
    { id: 'AMC-2025-03', clientId: 'CL-003', quoteId: null, start: D(-152), months: 12, freq: 'Monthly',
      serviceIds: ['SV07', 'SV11', 'SV13'], value: 186000, billing: 'Monthly', owner: 'U02', techId: 'U06',
      site: '7, Venkatnarayana Road, T. Nagar', scope: 'OT complex excluded. Wards, canteen, waste yard, ducts and basement parking.',
      slot: '06:00', notes: 'NABH documentation — signed service report + chemical MSDS mandatory each visit.' },
    { id: 'AMC-2025-04', clientId: 'CL-005', quoteId: null, start: D(-118), months: 12, freq: 'Quarterly',
      serviceIds: ['SV01', 'SV15'], value: 48000, billing: 'Half-Yearly', owner: 'U02', techId: 'U05',
      site: 'Olympia Tech Park, Level 6, OMR', scope: 'Workstations, pantry, server room perimeter, washrooms.',
      slot: '18:30', notes: 'After office hours. Server room — no aerosol, gel only.' },
    { id: 'AMC-2025-06', clientId: 'CL-006', quoteId: null, start: D(-64), months: 12, freq: 'Monthly',
      serviceIds: ['SV07', 'SV13'], value: 82000, billing: 'Quarterly', owner: 'U02', techId: 'U06',
      site: '2nd Avenue, Anna Nagar West', scope: 'Backstore, chiller room, produce section, staff canteen and loading bay.',
      slot: '22:00', notes: 'Bait station numbering map to be updated every visit.' },
    { id: 'AMC-2025-07', clientId: 'CL-007', quoteId: 'QT-2039', start: D(-22), months: 12, freq: 'Monthly',
      serviceIds: ['SV01', 'SV11'], value: 36000, billing: 'Quarterly', owner: 'U02', techId: 'U05',
      site: '11, Mount Poonamallee Road, Porur', scope: 'Classrooms, play area, pantry, washrooms and outdoor perimeter.',
      slot: '14:00', notes: 'Saturdays only, after 2 PM. Herbal / child-safe chemicals mandatory.' },
    { id: 'AMC-2024-11', clientId: 'CL-004', quoteId: null, start: D(-352), months: 12, freq: 'Quarterly',
      serviceIds: ['SV01'], value: 7200, billing: 'Yearly', owner: 'U02', techId: 'U05',
      site: 'Flat 4B, Lakshmi Enclave, Velachery', scope: '3 BHK — kitchen, bathrooms, balcony and store room.',
      slot: '10:30', notes: 'Prefers weekday mornings. Two pet cats — use pet-safe formulation.' }
  ];

  /* Per-contract deviations from the catalogue default — this is what makes
     the merge visible: monthly work stacking with quarterly work. */
  /**
   * Crew sizes are deliberately mixed so the board and the assignment dialog
   * have something real to chew on:
   *   - AMC-2025-01  fully staffed, a straightforward two-hander
   *   - AMC-2025-02  a 2 + 4 contract -- the awkward one, and short of people
   *   - AMC-2025-03  fogging takes three, nobody on it yet
   *   - AMC-2025-04  fully staffed across two services
   *   - AMC-2025-06  untouched, so there is a clean one-person contract too
   *   - AMC-2025-07  disinfection pair, half staffed
   */
  const PLAN_OVERRIDES = {
    'AMC-2025-01': {
      SV01: { crew: 2, techIds: ['U04', 'U05'] },
      SV08: { freq: 'Quarterly', crew: 2, techIds: ['U04', 'U05'] }
    },
    'AMC-2025-02': {
      SV03: { freq: 'Quarterly', crew: 2, techIds: ['U06'] },
      SV13: { crew: 4, techIds: ['U06', 'U09'] }
    },
    'AMC-2025-03': {
      SV13: { freq: 'Bi-Monthly', crew: 3, techIds: [] }
    },
    'AMC-2025-04': {
      SV01: { freq: 'Quarterly', crew: 2, techIds: ['U11', 'U10'] },
      SV15: { freq: 'Half-Yearly', crew: 2, techIds: ['U11', 'U10'] }
    },
    'AMC-2025-07': {
      SV11: { freq: 'Quarterly', crew: 2, techIds: ['U10'] }
    },
    'AMC-2024-11': {
      SV01: { freq: 'Quarterly', crew: 2, techIds: ['U04', 'U09'] }
    }
  };

  contracts.forEach(c => {
    c.end = addMonths(c.start, c.months);
    c.mergeSameDay = true;
    c.workdaysOnly = true;
    c.blackout = [];
    c.plan = planFor(c, services, PLAN_OVERRIDES[c.id] || {});
    c.totalVisits = planVisits(c).length;
  });

  /* ======================================================================
     JOBS — generated from contracts + hand-authored one-off work
     ====================================================================== */
  const SLOT_MINS = 90;
  const jobs = [];
  let jobSeq = 900;

  const FINDINGS = [
    'Cockroach activity — kitchen platform', 'Cockroach activity — sink area',
    'Rodent droppings observed', 'Rodent gnaw marks on packaging',
    'Ant trail — pantry shelf', 'Termite mud tube — door frame',
    'Mosquito breeding — stagnant water', 'Fly activity — waste bin area',
    'Spider webbing — ceiling corners', 'No activity observed'
  ];

  function pick(arr, n, seed) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(arr[(seed * 7 + i * 13) % arr.length]);
    return out.filter((v, i, a) => a.indexOf(v) === i);
  }

  contracts.forEach((c, ci) => {
    const visits = planVisits(c);
    visits.forEach((pv, v) => {
      const date = pv.date;
      const delta = daysBetween(D(0), date);
      // Only keep visits inside a sensible demo window
      if (delta < -210 || delta > 190) return;

      const id = 'JOB-' + (++jobSeq);
      const past = delta < 0;
      const isToday = delta === 0;

      const j = {
        id: id,
        type: 'AMC Visit',
        contractId: c.id,
        clientId: c.clientId,
        serviceIds: pv.serviceIds,
        date: date,
        slot: pv.slot,
        mins: pv.mins,
        techIds: pv.techIds.length ? pv.techIds : [c.techId],
        planRef: pv.planRef,
        plannedAt: date,
        status: past ? 'completed' : 'scheduled',
        priority: 'normal',
        visitNo: v + 1,
        ofVisits: visits.length,
        notes: c.notes,
        exec: null
      };

      if (past) {
        const dur = 48 + ((ci * 11 + v * 17) % 42);
        const startH = parseInt(pv.slot.split(':')[0], 10);
        const startM = parseInt(pv.slot.split(':')[1], 10) + ((v * 7) % 12);
        j.exec = {
          checkinAt: date + 'T' + String(startH).padStart(2, '0') + ':' + String(startM).padStart(2, '0'),
          startedAt: date + 'T' + String(startH).padStart(2, '0') + ':' + String(startM + 4).padStart(2, '0'),
          finishedAt: date + 'T' + String(startH + Math.floor((startM + dur) / 60)).padStart(2, '0') + ':' + String((startM + dur) % 60).padStart(2, '0'),
          durationMins: dur,
          geo: '13.00' + (10 + ci) + '° N, 80.2' + (50 + v % 9) + '° E',
          photosBefore: [photo('Before', 20 + ci * 40)],
          photosAfter: [photo('After', 150 + ci * 30)],
          chemicals: [{ id: c.serviceIds[0] === 'SV07' ? 'IN05' : 'IN01', qty: 40 + ((v * 13) % 60) }],
          findings: pick(FINDINGS, 2, ci + v),
          observations: v % 3 === 0
            ? 'Activity down compared to previous visit. Advised customer to seal gap under pantry door.'
            : 'Treatment completed as per scope. No re-infestation noted since last service.',
          signedBy: clients.find(x => x.id === c.clientId).contact,
          signature: true,
          rating: 4 + ((ci + v) % 2),
          feedback: v % 4 === 0 ? 'Technician was punctual and thorough.' : ''
        };
      }
      if (isToday) { j.status = 'scheduled'; }
      jobs.push(j);
    });
  });

  /* ---- Today's board: force a rich, demo-able day for every technician ---- */
  function makeJob(o) {
    return Object.assign({
      id: 'JOB-' + (++jobSeq), type: 'One-Time', contractId: null, mins: SLOT_MINS,
      status: 'scheduled', priority: 'normal', notes: '', exec: null, visitNo: 0, ofVisits: 0
    }, o);
  }

  // Karthik (U04) — today
  jobs.push(makeJob({ type: 'AMC Visit', contractId: 'AMC-2025-01', clientId: 'CL-001', serviceIds: ['SV01', 'SV08'],
    date: D(0), slot: '09:00', techIds: ['U04'], visitNo: 8, ofVisits: 12,
    notes: 'Block C reported cockroaches in flats 302 and 305 — treat on priority.', priority: 'high',
    status: 'completed', exec: {
      checkinAt: D(0) + 'T09:04', startedAt: D(0) + 'T09:09', finishedAt: D(0) + 'T10:21', durationMins: 72,
      geo: '13.0067° N, 80.2570° E',
      photosBefore: [photo('Before', 28)], photosAfter: [photo('After', 158)],
      chemicals: [{ id: 'IN01', qty: 60 }, { id: 'IN06', qty: 250 }],
      findings: ['Cockroach activity — kitchen platform', 'Mosquito breeding — stagnant water'],
      observations: 'Treated all 48 flats + common areas. Water stagnation near basement pump — informed association to clear.',
      signedBy: 'Meera Krishnan', signature: true, rating: 5, feedback: 'Very neat work, no mess left behind.'
    } }));
  jobs.push(makeJob({ clientId: 'CL-008', serviceIds: ['SV02'], date: D(0), slot: liveSlot(38), techIds: ['U04'],
    notes: 'First-time customer from a WhatsApp lead. Carry payment QR — collect ₹1,200 on completion.',
    status: 'inprogress', exec: {
      checkinAt: D(0) + 'T' + liveTime(31), startedAt: D(0) + 'T' + liveTime(26), finishedAt: null, durationMins: 0,
      geo: '13.0339° N, 80.2619° E',
      photosBefore: [photo('Before', 44)], photosAfter: [],
      chemicals: [], findings: [], observations: '', signedBy: '', signature: false, rating: 0, feedback: ''
    } }));
  jobs.push(makeJob({ type: 'Callback', clientId: 'CL-004', serviceIds: ['SV01'], date: D(0), slot: '14:30', techIds: ['U04'],
    priority: 'high', notes: 'Complaint — ants returned within 10 days of last service. Free re-treatment under warranty.' }));
  jobs.push(makeJob({ type: 'Inspection', clientId: 'CL-005', serviceIds: ['SV15'], date: D(0), slot: '16:30', techIds: ['U04'],
    notes: 'Pre-quotation site survey for lizard control on Level 6 cafeteria. Measure and photograph entry points.' }));

  // Suresh (U05) — today
  jobs.push(makeJob({ type: 'AMC Visit', contractId: 'AMC-2025-07', clientId: 'CL-007', serviceIds: ['SV01', 'SV11'],
    date: D(0), slot: '10:00', techIds: ['U05'], visitNo: 1, ofVisits: 12,
    notes: 'Herbal / child-safe chemicals only. School staff will escort — no aerosol near play area.',
    status: 'completed', exec: {
      checkinAt: D(0) + 'T10:02', startedAt: D(0) + 'T10:08', finishedAt: D(0) + 'T11:14', durationMins: 66,
      geo: '13.0369° N, 80.1560° E',
      photosBefore: [photo('Before', 200)], photosAfter: [photo('After', 120)],
      chemicals: [{ id: 'IN08', qty: 400 }], findings: ['Ant trail — pantry shelf'],
      observations: 'Herbal formulation used throughout. Ant trail traced to pantry window frame, sealed with silicone.',
      signedBy: 'Fathima Begum', signature: true, rating: 5, feedback: 'Handled very carefully around the children.'
    } }));
  jobs.push(makeJob({ clientId: 'CL-004', serviceIds: ['SV06'], date: D(0), slot: '13:00', techIds: ['U05'],
    notes: 'Round 2 of bed bug treatment. Confirm linen was hot-washed before starting.' }));
  jobs.push(makeJob({ type: 'AMC Visit', contractId: 'AMC-2025-04', clientId: 'CL-005', serviceIds: ['SV01', 'SV15'],
    date: D(0), slot: '18:30', techIds: ['U05'], visitNo: 2, ofVisits: 4,
    notes: 'After office hours. Server room — gel only, no aerosol under any circumstance.' }));

  // Vignesh (U06) — today
  jobs.push(makeJob({ type: 'AMC Visit', contractId: 'AMC-2025-03', clientId: 'CL-003', serviceIds: ['SV07', 'SV11'],
    date: D(0), slot: '06:00', techIds: ['U06'], visitNo: 6, ofVisits: 12,
    notes: 'NABH audit file — carry MSDS copies and get the report signed by duty nurse.',
    status: 'completed', exec: {
      checkinAt: D(0) + 'T06:03', startedAt: D(0) + 'T06:10', finishedAt: D(0) + 'T07:48', durationMins: 98,
      geo: '13.0389° N, 80.2340° E',
      photosBefore: [photo('Before', 350)], photosAfter: [photo('After', 140)],
      chemicals: [{ id: 'IN05', qty: 24 }, { id: 'IN08', qty: 600 }],
      findings: ['Rodent droppings observed', 'Fly activity — waste bin area'],
      observations: 'Droppings found near canteen store — 4 additional bait stations installed (S-19 to S-22). Waste yard needs daily clearing.',
      signedBy: 'Dr. S. Ravichandran', signature: true, rating: 4, feedback: ''
    } }));
  jobs.push(makeJob({ type: 'Complaint', clientId: 'CL-006', serviceIds: ['SV07'], date: D(0), slot: '12:00', techIds: ['U06'],
    priority: 'high', notes: 'URGENT — live rat sighted in produce section during store hours. Store manager escalated to owner.' }));
  jobs.push(makeJob({ type: 'AMC Visit', contractId: 'AMC-2025-06', clientId: 'CL-006', serviceIds: ['SV07', 'SV13'],
    date: D(0), slot: '22:00', techIds: ['U06'], visitNo: 3, ofVisits: 12,
    notes: 'Night service after store close. Update bait station map before leaving.' }));

  // Tomorrow + this week (spread across techs)
  jobs.push(makeJob({ clientId: 'CL-002', serviceIds: ['SV06'], date: D(1), slot: '11:00', techIds: ['U04'], notes: 'Rooms 214 and 216 — guest complaint, treat both.' }));
  jobs.push(makeJob({ clientId: 'CL-008', serviceIds: ['SV14'], date: D(1), slot: '09:00', techIds: ['U05'], notes: 'Overhead + sump tank cleaning. Customer will arrange water shut-off.' }));
  jobs.push(makeJob({ type: 'Inspection', clientId: 'CL-003', serviceIds: ['SV04'], date: D(2), slot: '10:00', techIds: ['U04'], notes: 'Termite inspection in old block before renovation quote.' }));
  jobs.push(makeJob({ clientId: 'CL-005', serviceIds: ['SV11'], date: D(2), slot: '19:00', techIds: ['U06'], notes: 'Quarterly office disinfection, both floors.' }));
  jobs.push(makeJob({ clientId: 'CL-001', serviceIds: ['SV14'], date: D(3), slot: '08:00', techIds: ['U05'], notes: 'Terrace tank cleaning — 4 tanks, association approved.' }));
  jobs.push(makeJob({ type: 'Callback', clientId: 'CL-007', serviceIds: ['SV01'], date: D(4), slot: '14:00', techIds: ['U05'], notes: 'Follow-up on ant complaint from first AMC visit.' }));
  jobs.push(makeJob({ clientId: 'CL-002', serviceIds: ['SV12'], date: D(5), slot: '19:30', techIds: ['U04'], priority: 'high', notes: 'Bee hive on 4th floor balcony. After sunset only, full protective gear.' }));

  /* ---- WAITING FOR SOMEBODY -------------------------------------------
     Work that has come in and has nobody on it yet. This is what the queue on
     the dispatch board is for, and without it none of Auto-assign, Balance or
     the suggester can be tried. Deliberately spread across branches, skills
     and priorities so the ranking has something to rank. ---- */

  // Today — the morning's callbacks, nobody allocated yet.
  jobs.push(makeJob({ type: 'Callback', clientId: 'CL-002', serviceIds: ['SV03'],
    date: D(0), slot: '11:00', mins: 40, techIds: [], priority: 'high',
    notes: 'Kitchen staff reported roaches again two days after the last spray. Owner is unhappy — send somebody today.' }));

  jobs.push(makeJob({ type: 'Complaint', clientId: 'CL-006', serviceIds: ['SV07'],
    date: D(0), slot: '15:00', mins: 60, techIds: [], priority: 'urgent',
    notes: 'Rodent seen in the dry store during an FSSAI walk-through. Needs attention before they reopen tomorrow.' }));

  jobs.push(makeJob({ clientId: 'CL-003', serviceIds: ['SV13'],
    date: D(0), slot: '17:00', mins: 60, techIds: [],
    notes: 'Extra fly treatment ahead of a function on the terrace this weekend.' }));

  // Tomorrow — a four-person job, so a crew has to be built rather than picked.
  jobs.push(makeJob({ clientId: 'CL-005', serviceIds: ['SV04'],
    date: D(1), slot: '09:00', mins: 240, techIds: [], priority: 'high',
    notes: 'Post-construction termite barrier, ground floor. Drilling crew — four people, full day.' }));

  jobs.push(makeJob({ type: 'Inspection', clientId: 'CL-008', serviceIds: ['SV01'],
    date: D(1), slot: '11:30', mins: 45, techIds: [],
    notes: 'New enquiry from the Adyar WhatsApp group — survey before quoting.' }));

  // Later in the week, so the queue is not only ever "today".
  jobs.push(makeJob({ clientId: 'CL-004', serviceIds: ['SV06'],
    date: D(2), slot: '10:00', mins: 90, techIds: [],
    notes: 'Bed bug treatment, two bedrooms. Customer asked for the same technician as last time if possible.' }));

  jobs.push(makeJob({ type: 'Callback', clientId: 'CL-007', serviceIds: ['SV11'],
    date: D(3), slot: '18:30', mins: 60, techIds: [],
    notes: 'Clinic wants the disinfection redone after their renovation dust settled.' }));

  /* ---- Historical one-off work, so past months aren't only AMC visits ----
     Deterministic (no Math.random) — the demo looks identical on every load. */
  const ONEOFF = ['SV02', 'SV06', 'SV07', 'SV09', 'SV11', 'SV12', 'SV14', 'SV15', 'SV04', 'SV08'];
  const ONEOFF_TYPES = ['One-Time', 'One-Time', 'One-Time', 'Callback', 'Complaint', 'Inspection'];
  const TECH_IDS = ['U04', 'U05', 'U06'];
  const CLIENT_IDS = clients.map(c => c.id);

  for (let k = 0; k < 46; k++) {
    const daysAgo = 6 + Math.floor(k * 3.3);          // spread across ~5 months
    if (daysAgo > 158) break;
    const date = D(-daysAgo);
    const sid = ONEOFF[k % ONEOFF.length];
    const svc = services.find(s => s.id === sid);
    const tid = TECH_IDS[k % TECH_IDS.length];
    const cid = CLIENT_IDS[(k * 3) % CLIENT_IDS.length];
    const startH = 8 + (k % 9);
    const dur = 40 + ((k * 17) % 70);
    const p = n => String(n).padStart(2, '0');

    jobs.push(makeJob({
      type: ONEOFF_TYPES[k % ONEOFF_TYPES.length],
      clientId: cid, serviceIds: [sid], date: date,
      slot: p(startH) + ':' + (k % 2 ? '30' : '00'),
      mins: svc ? svc.mins : 60,
      techIds: [tid], status: 'completed',
      notes: 'One-off service booked over the phone.',
      exec: {
        checkinAt: date + 'T' + p(startH) + ':' + p((k * 3) % 15),
        startedAt: date + 'T' + p(startH) + ':' + p(((k * 3) % 15) + 5),
        finishedAt: date + 'T' + p(startH + Math.floor(dur / 60)) + ':' + p(dur % 60),
        durationMins: dur,
        geo: '13.0' + (200 + k * 7) + '° N, 80.2' + (300 + k * 5) + '° E',
        photosBefore: [photo('Before', (k * 37) % 360)],
        photosAfter: [photo('After', (k * 37 + 140) % 360)],
        chemicals: [{ id: (svc && svc.chem && svc.chem[0]) || 'IN03', qty: 25 + ((k * 11) % 80) }],
        findings: pick(FINDINGS, 1 + (k % 2), k),
        observations: k % 2
          ? 'Treatment completed. Customer advised on housekeeping to prevent recurrence.'
          : 'Infestation cleared. Follow-up recommended if activity is seen within the warranty period.',
        signedBy: (clients.find(c => c.id === cid) || {}).contact || 'Customer',
        signature: true,
        rating: 4 + (k % 2),
        feedback: k % 5 === 0 ? 'Prompt and professional service.' : ''
      }
    }));
  }

  // A couple of unassigned services so dispatch has something to do
  jobs.push(makeJob({ clientId: 'CL-006', serviceIds: ['SV03'], date: D(1), slot: '22:30', techIds: [], notes: 'Additional kitchen spray requested by store manager — needs a technician assigned.' }));
  jobs.push(makeJob({ clientId: 'CL-003', serviceIds: ['SV11'], date: D(3), slot: '06:00', techIds: [], notes: 'Extra ward disinfection after discharge — unassigned.' }));

  /* ======================================================================
     INVENTORY
     ====================================================================== */
  const inventory = [
    { id: 'IN01', name: 'Maxforce Cockroach Gel', cat: 'Chemical', ai: 'Fipronil 0.05% w/w', unit: 'g',  stock: 1840, min: 600, cost: 4.2,  pack: '30 g syringe', supplier: 'Bayer Environmental', batch: 'BY-2451', expiry: D(384), cib: 'CIR-51234/2019' },
    { id: 'IN02', name: 'Premise SC Termiticide', cat: 'Chemical', ai: 'Imidacloprid 30.5% SC', unit: 'ml', stock: 4200, min: 2000, cost: 2.8, pack: '1 L bottle',   supplier: 'Bayer Environmental', batch: 'BY-3390', expiry: D(298), cib: 'CIR-44120/2018' },
    { id: 'IN03', name: 'Deltamethrin 2.5% WP',   cat: 'Chemical', ai: 'Deltamethrin 2.5% WP', unit: 'g',  stock: 380,  min: 800,  cost: 1.9,  pack: '500 g pouch',  supplier: 'Tagros Chemicals',    batch: 'TG-1178', expiry: D(210), cib: 'CIR-30987/2016' },
    { id: 'IN04', name: 'Bed Bug Combo Kit',      cat: 'Chemical', ai: 'Chlorfenapyr + IGR',   unit: 'ml', stock: 2600, min: 900,  cost: 6.5,  pack: '250 ml',       supplier: 'PestX Distributors',  batch: 'PX-7712', expiry: D(455), cib: 'CIR-60111/2021' },
    { id: 'IN05', name: 'Bromadiolone Wax Blocks',cat: 'Chemical', ai: 'Bromadiolone 0.005%',  unit: 'blocks', stock: 148, min: 200, cost: 12,  pack: '10 kg carton', supplier: 'Rodent Care India',   batch: 'RC-0455', expiry: D(520), cib: 'CIR-22874/2015' },
    { id: 'IN06', name: 'Pyrethrum Fogging Conc.',cat: 'Chemical', ai: 'Pyrethrum 2% EC',      unit: 'ml', stock: 5100, min: 1500, cost: 3.1,  pack: '5 L can',      supplier: 'Tagros Chemicals',    batch: 'TG-2204', expiry: D(340), cib: 'CIR-19003/2014' },
    { id: 'IN07', name: 'Snake Repellent Granule',cat: 'Chemical', ai: 'Naphthalene blend',    unit: 'kg', stock: 22,   min: 15,   cost: 340,  pack: '5 kg bag',     supplier: 'Agro Solutions',      batch: 'AG-8890', expiry: D(610), cib: 'CIR-77120/2020' },
    { id: 'IN08', name: 'Quat Disinfectant Conc.',cat: 'Chemical', ai: 'Benzalkonium Chloride 10%', unit: 'ml', stock: 8400, min: 3000, cost: 1.4, pack: '5 L can', supplier: 'MedClean Supplies',   batch: 'MC-5521', expiry: D(275), cib: 'CIR-88401/2020' },
    { id: 'IN20', name: 'Compression Sprayer 5 L',cat: 'Equipment', ai: '',                    unit: 'nos', stock: 9,   min: 6,    cost: 2400, pack: 'unit',         supplier: 'Neptune Equipments',  batch: '—',       expiry: '', cib: '' },
    { id: 'IN21', name: 'Thermal Fogging Machine',cat: 'Equipment', ai: '',                    unit: 'nos', stock: 3,   min: 2,    cost: 34000,pack: 'unit',         supplier: 'Neptune Equipments',  batch: '—',       expiry: '', cib: '' },
    { id: 'IN22', name: 'Tamper-proof Bait Station', cat: 'Consumable', ai: '',                unit: 'nos', stock: 64,  min: 80,   cost: 210,  pack: 'box of 10',    supplier: 'Rodent Care India',   batch: '—',       expiry: '', cib: '' },
    { id: 'IN23', name: 'Glue Board — Rodent',    cat: 'Consumable', ai: '',                   unit: 'nos', stock: 210, min: 100,  cost: 32,   pack: 'box of 50',    supplier: 'Rodent Care India',   batch: '—',       expiry: '', cib: '' },
    { id: 'IN24', name: 'PPE Kit (mask+gloves+suit)', cat: 'Consumable', ai: '',               unit: 'sets',stock: 38,  min: 40,   cost: 145,  pack: 'set',          supplier: 'SafeGuard Industrial',batch: '—',       expiry: '', cib: '' },
    { id: 'IN25', name: 'Insect Light Trap Board',cat: 'Consumable', ai: '',                   unit: 'nos', stock: 26,  min: 20,   cost: 95,   pack: 'box of 25',    supplier: 'PestX Distributors',  batch: '—',       expiry: '', cib: '' }
  ];

  const stockMoves = [
    { id: 'SM-441', date: D(0),  itemId: 'IN01', qty: -60,  type: 'Consumed', ref: 'JOB-0921', by: 'U04' },
    { id: 'SM-440', date: D(0),  itemId: 'IN05', qty: -24,  type: 'Consumed', ref: 'JOB-0925', by: 'U06' },
    { id: 'SM-439', date: D(0),  itemId: 'IN08', qty: -1000,type: 'Consumed', ref: 'JOB-0923', by: 'U06' },
    { id: 'SM-438', date: D(-1), itemId: 'IN03', qty: -420, type: 'Consumed', ref: 'JOB-0918', by: 'U05' },
    { id: 'SM-437', date: D(-2), itemId: 'IN02', qty: 5000, type: 'Purchase', ref: 'PO-1188',  by: 'U02' },
    { id: 'SM-436', date: D(-3), itemId: 'IN22', qty: -16,  type: 'Issued',   ref: 'U06',      by: 'U02' },
    { id: 'SM-435', date: D(-4), itemId: 'IN24', qty: -12,  type: 'Issued',   ref: 'U04',      by: 'U02' },
    { id: 'SM-434', date: D(-6), itemId: 'IN01', qty: 3000, type: 'Purchase', ref: 'PO-1187',  by: 'U02' }
  ];

  /* ======================================================================
     AUDITS
     ====================================================================== */
  const AUDIT_TEMPLATES = {
    'Site Quality Audit': [
      'All contracted areas covered as per scope',
      'Correct chemical and dosage used',
      'Bait stations intact, numbered and mapped',
      'Before / after photographs uploaded',
      'Service report signed by customer representative',
      'No chemical spillage or residue left behind',
      'Customer briefed on findings and precautions'
    ],
    'Safety & Compliance Audit': [
      'Technician wearing complete PPE',
      'Valid applicator licence carried on site',
      'MSDS available for all chemicals in use',
      'Chemicals stored in labelled, sealed containers',
      'Empty containers disposed as per norms',
      'First-aid kit present in service vehicle',
      'No unauthorised chemical decanting observed'
    ],
    'Pest Trend Audit': [
      'Pest activity reduced vs previous visit',
      'Recurring hotspots documented',
      'Customer-side hygiene recommendations issued',
      'Structural gaps / entry points recorded',
      'Trend chart updated in customer file'
    ]
  };

  const audits = [
    { id: 'AUD-118', type: 'Site Quality Audit', clientId: 'CL-003', contractId: 'AMC-2025-03', jobId: null,
      date: D(-3), auditorId: 'U02', status: 'completed',
      items: AUDIT_TEMPLATES['Site Quality Audit'].map((t, i) => ({ t: t, v: i === 5 ? 'fail' : 'pass', r: i === 5 ? 'Minor gel residue on canteen shelf edge — cleaned during audit.' : '' })),
      remarks: 'Overall service quality good. Technician counselled on wipe-down after gel application.' },
    { id: 'AUD-117', type: 'Safety & Compliance Audit', clientId: 'CL-002', contractId: 'AMC-2025-02', jobId: null,
      date: D(-9), auditorId: 'U02', status: 'completed',
      items: AUDIT_TEMPLATES['Safety & Compliance Audit'].map((t, i) => ({ t: t, v: i === 5 ? 'fail' : 'pass', r: i === 5 ? 'First-aid kit expired in vehicle TN-09-BX-4471. Replaced same day.' : '' })),
      remarks: 'Vehicle first-aid kits to be checked monthly. Added to ops checklist.' },
    { id: 'AUD-116', type: 'Pest Trend Audit', clientId: 'CL-006', contractId: 'AMC-2025-06', jobId: null,
      date: D(-16), auditorId: 'U01', status: 'completed',
      items: AUDIT_TEMPLATES['Pest Trend Audit'].map((t, i) => ({ t: t, v: i === 0 ? 'fail' : 'pass', r: i === 0 ? 'Rodent catch count up from 3 to 7. Loading bay shutter gap identified as entry point.' : '' })),
      remarks: 'Recommended customer seal loading bay shutter. Increased bait stations from 18 to 22.' },
    { id: 'AUD-119', type: 'Site Quality Audit', clientId: 'CL-001', contractId: 'AMC-2025-01', jobId: null,
      date: D(0), auditorId: 'U02', status: 'draft',
      items: AUDIT_TEMPLATES['Site Quality Audit'].map(t => ({ t: t, v: '', r: '' })), remarks: '' }
  ];

  /* ======================================================================
     INVOICES + PAYMENTS
     ====================================================================== */
  const invoices = [
    { id: 'INV-3312', clientId: 'CL-002', contractId: 'AMC-2025-02', date: D(-5),  due: D(10),  period: 'Monthly service — current month',
      items: [{ name: 'AMC Monthly Service — Grand Bay Hotel', qty: 1, rate: 12333 }], status: 'unpaid' },
    { id: 'INV-3311', clientId: 'CL-003', contractId: 'AMC-2025-03', date: D(-8),  due: D(7),   period: 'Monthly service — current month',
      items: [{ name: 'AMC Monthly Service — Medlife Hospital', qty: 1, rate: 15500 }], status: 'unpaid' },
    { id: 'INV-3310', clientId: 'CL-001', contractId: 'AMC-2025-01', date: D(-34), due: D(-19), period: 'Quarterly billing — Q3',
      items: [{ name: 'AMC Quarterly Service — Sri Krishna Apartments (3 visits)', qty: 1, rate: 16500 }], status: 'overdue' },
    { id: 'INV-3309', clientId: 'CL-006', contractId: 'AMC-2025-06', date: D(-40), due: D(-25), period: 'Quarterly billing',
      items: [{ name: 'AMC Quarterly Service — Fresh Basket (3 visits)', qty: 1, rate: 20500 }], status: 'partial' },
    { id: 'INV-3308', clientId: 'CL-005', contractId: 'AMC-2025-04', date: D(-52), due: D(-37), period: 'Half-yearly billing',
      items: [{ name: 'AMC Half-Yearly Service — TechNova Solutions (2 visits)', qty: 1, rate: 24000 }], status: 'paid' },
    { id: 'INV-3307', clientId: 'CL-004', contractId: null, date: D(-14), due: D(1), period: 'One-time service',
      items: [{ name: 'Bed Bug Treatment — Round 1 (2 bedrooms)', qty: 2, rate: 2500 }], status: 'paid' },
    { id: 'INV-3306', clientId: 'CL-008', contractId: null, date: D(-21), due: D(-6), period: 'One-time service',
      items: [{ name: 'General Pest Control — Kumar Residence', qty: 1, rate: 1800 }], status: 'paid' }
  ];

  const payments = [
    { id: 'RCP-881', invoiceId: 'INV-3308', date: D(-44), amount: 28320, mode: 'Bank Transfer', ref: 'HDFC/NEFT/9921004', by: 'U07' },
    { id: 'RCP-880', invoiceId: 'INV-3307', date: D(-12), amount: 5900,  mode: 'UPI',           ref: 'UPI/442190087712', by: 'U07' },
    { id: 'RCP-879', invoiceId: 'INV-3306', date: D(-19), amount: 2124,  mode: 'Cash',          ref: 'Collected on site', by: 'U04' },
    { id: 'RCP-878', invoiceId: 'INV-3309', date: D(-22), amount: 12000, mode: 'Cheque',        ref: 'ICICI 448821',     by: 'U07' }
  ];

  /* ---- Settled billing history, so revenue trends have something to plot ---- */
  const HIST = [
    ['CL-002', 'AMC-2025-02', 12333, 'Monthly service'], ['CL-003', 'AMC-2025-03', 15500, 'Monthly service'],
    ['CL-001', 'AMC-2025-01', 16500, 'Quarterly billing'], ['CL-006', 'AMC-2025-06', 20500, 'Quarterly billing'],
    ['CL-002', 'AMC-2025-02', 12333, 'Monthly service'], ['CL-003', 'AMC-2025-03', 15500, 'Monthly service'],
    ['CL-004', null, 4500, 'One-time service'], ['CL-008', null, 3000, 'One-time service'],
    ['CL-002', 'AMC-2025-02', 12333, 'Monthly service'], ['CL-003', 'AMC-2025-03', 15500, 'Monthly service'],
    ['CL-005', 'AMC-2025-04', 24000, 'Half-yearly billing'], ['CL-007', 'AMC-2025-07', 9000, 'Quarterly billing']
  ];
  let invSeq = 3305, rcpSeq = 877;
  HIST.forEach((h, i) => {
    const raised = D(-(28 + i * 11));
    const id = 'INV-' + (invSeq--);
    invoices.push({
      id: id, clientId: h[0], contractId: h[1], date: raised, due: D(-(13 + i * 11)),
      period: h[3], items: [{ name: h[3] + ' — ' + (clients.find(c => c.id === h[0]) || {}).name, qty: 1, rate: h[2] }],
      status: 'paid'
    });
    payments.push({
      id: 'RCP-' + (rcpSeq--), invoiceId: id, date: D(-(20 + i * 11)),
      amount: Math.round(h[2] * 1.18), mode: ['UPI', 'Bank Transfer', 'Cheque', 'Cash'][i % 4],
      ref: 'REF/' + (900000 + i * 137), by: 'U07'
    });
  });

  /* ======================================================================
     NOTIFICATIONS
     ====================================================================== */
  const notifications = [
    { id: 'N1', icon: 'alert',       tone: 'red',   title: 'Urgent complaint — Fresh Basket', body: 'Live rat sighted in produce section. Assigned to Vignesh S.', at: '2 min ago', unread: true },
    { id: 'N2', icon: 'checkcircle', tone: 'green', title: 'Service completed — Sri Krishna Apartments', body: 'Karthik R finished AMC visit 8 of 12. Customer rated 5★.', at: '48 min ago', unread: true },
    { id: 'N3', icon: 'package',     tone: 'amber', title: 'Low stock alert', body: 'Deltamethrin 2.5% WP is below reorder level (380 g of 800 g).', at: '3 hrs ago', unread: true },
    { id: 'N4', icon: 'receipt',     tone: 'red',   title: 'Invoice overdue', body: 'INV-3310 for ₹19,470 is 19 days past due — Sri Krishna Apartments.', at: 'Yesterday', unread: false },
    { id: 'N5', icon: 'filetext',    tone: 'blue',  title: 'Quotation viewed', body: 'Vasanth Apartments opened QT-2040. Follow up before it expires.', at: 'Yesterday', unread: false },
    { id: 'N6', icon: 'shield',      tone: 'amber', title: 'Contract expiring', body: 'AMC-2024-11 (Anitha Residence) expires in 13 days.', at: '2 days ago', unread: false }
  ];

  /* ======================================================================
     WHATSAPP MESSAGE TEMPLATES
     Editable under Settings → Notifications. {placeholders} are filled in
     from the record the message is being sent about.
     ====================================================================== */
  const WA_TEMPLATES = [
    { k: 'quote_sent', label: 'Quotation sent', on: true,
      trigger: 'When you share a quotation on WhatsApp',
      vars: ['client', 'quote_no', 'title', 'amount', 'valid_date', 'service_lines', 'approve_link', 'pdf_link', 'company', 'company_phone'],
      body:
        'Hello {customer},\n\n' +
        'Thank you for your enquiry. Your quotation {quote_no} is ready.\n\n' +
        'What we have quoted:\n{service_lines}\n\n' +
        'Total: {amount} incl. GST\n' +
        'Valid till: {valid_date}\n\n' +
        'Open the full quotation at the link below. You can download it as a PDF and read the service information sheet for each treatment, so you know exactly what is carried out, which chemicals are used and what warranty you get.\n\n' +
        'Accept or decline it there in one tap:\n{approve_link}\n\n' +
        'If the link does not open on your phone, simply reply to this message with ACCEPT or DECLINE and we will take it forward.\n\n' +
        '— {company}\n{company_phone}' },

    { k: 'quote_followup', label: 'Quotation follow-up', on: true,
      trigger: 'When a sent quotation is nearing its validity date',
      vars: ['client', 'quote_no', 'amount', 'valid_date', 'approve_link'],
      body: 'Hello {customer}, a gentle reminder that quotation {quote_no} for {amount} is valid till {valid_date}. ' +
            'Accept or decline here: {approve_link} — or just reply to this message.' },

    { k: 'visit_reminder', label: 'Visit reminder', on: true,
      trigger: '24 hours before a scheduled visit',
      vars: ['client', 'service', 'date', 'time', 'technician', 'tech_phone'],
      body: 'Reminder: your {service} service is scheduled on {date} at {time}. Technician: {technician}. Please keep the area accessible.' },

    { k: 'tech_enroute', label: 'Technician en route', on: true,
      trigger: 'When the technician taps "on my way"',
      vars: ['technician', 'time', 'tech_phone'],
      body: 'Your technician {technician} is on the way and will reach around {time}. Contact: {tech_phone}.' },

    { k: 'service_report', label: 'Service report', on: true,
      trigger: 'When a service is completed',
      vars: ['site', 'service', 'job_no', 'next_date'],
      body: 'Service completed at {site} — {service} ({job_no}). Report with before/after photos attached. Next visit: {next_date}.' },

    { k: 'invoice_raised', label: 'Invoice raised', on: true,
      trigger: 'When an invoice is generated',
      vars: ['invoice_no', 'amount', 'period', 'due_date', 'upi_id'],
      body: 'Invoice {invoice_no} for {amount} — {period}. Due {due_date}. Pay via UPI {upi_id}.' },

    { k: 'payment_receipt', label: 'Payment receipt', on: true,
      trigger: 'When a payment is recorded',
      vars: ['amount', 'invoice_no', 'receipt_no'],
      body: 'Payment of {amount} received against {invoice_no}. Receipt {receipt_no} attached. Thank you!' },

    { k: 'amc_renewal', label: 'AMC renewal', on: true,
      trigger: '30 days before contract expiry',
      vars: ['contract_no', 'end_date'],
      body: 'Your AMC {contract_no} expires on {end_date}. Shall we send the renewal quotation? Reply YES.' }
  ];

  /* ======================================================================
     EXPORT
     ====================================================================== */
  w.Seed = {
    /**
     * The company, its branches, its people and what it sells are setup -- the
     * app is unusable without them, so they are always here. Customers, leads,
     * quotations, contracts, visits and money are WORK, and a fresh install has
     * not done any yet.
     *
     * Seed.build({ demo: true }) brings the sample back for a walkthrough.
     */
    build: function (opts) {
      const demo = !!(opts && opts.demo);
      const copy = x => JSON.parse(JSON.stringify(x));
      const work = x => (demo ? copy(x) : []);
      return {
        v: 16,
        demo: demo,

        // ---- setup: always present
        company: copy(company),
        branches: copy(branches),
        users: copy(users),
        services: copy(services),
        inventory: copy(inventory),
        leadSources: LEAD_SOURCES.slice(),
        propertyTypes: PROPERTY_TYPES.slice(),
        waTemplates: copy(WA_TEMPLATES),

        // ---- the work: empty until somebody does some
        clients: work(clients),
        leads: work(leads),
        quotations: work(quotations),
        contracts: work(contracts),
        jobs: work(jobs),
        stockMoves: work(stockMoves),
        audits: work(audits),
        invoices: work(invoices),
        payments: work(payments),
        notifications: work(notifications),

        seq: demo
          ? { job: jobSeq, quote: 2043, contract: 8, invoice: 3312, receipt: 881, lead: 1042, audit: 119 }
          : { job: 1000, quote: 1000, contract: 0, invoice: 1000, receipt: 100, lead: 1000, audit: 100 }
      };
    },
    ROLES: ROLES,
    WA_TEMPLATES: WA_TEMPLATES,
    lineCrew: lineCrew,
    LEAD_STAGES: LEAD_STAGES,
    SALUTATIONS: SALUTATIONS,
    CUSTOMER_TYPES: CUSTOMER_TYPES,
    LANGUAGES: LANGUAGES,
    CURRENCIES: CURRENCIES,
    GST_TREATMENTS: GST_TREATMENTS,
    PAYMENT_TERMS: PAYMENT_TERMS,
    STATES: STATES,
    COUNTRIES: COUNTRIES,
    RELATIONS: RELATIONS,
    BLOOD_GROUPS: BLOOD_GROUPS,
    EMP_TYPES: EMP_TYPES,
    FREQ_MONTHS: FREQ_MONTHS,
    FREQS: FREQS,
    SERVICE_META: SERVICE_META,
    applyDayRule: applyDayRule,
    nextAllowedDay: nextAllowedDay,
    dayOfMonth: dayOfMonth,
    cadenceLabel: cadenceLabel,
    lineSpread: lineSpread,
    addDays: addDays,
    planLine: planLine,
    planFor: planFor,
    planVisits: planVisits,
    AUDIT_TEMPLATES: AUDIT_TEMPLATES,
    FINDINGS: FINDINGS,
    photo: photo,
    D: D,
    addMonths: addMonths,
    daysBetween: daysBetween,
    iso: iso
  };
})(window);
