/* ============================================================================
   Demo data — the sample business, ported from v1's Seed.build({demo:true}).

   Run AFTER seed.ts:  npm run db:demo --workspace api
   Idempotent-ish: skips entirely if any client already exists.

   Dates are relative to today so the demo is always "live": visits behind
   today are completed, today has work in progress AND an unassigned queue
   (so the dispatch board has something to do), the future is scheduled.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';
import { planVisits, type ContractInput } from 'shared';

const prisma = new PrismaClient();

const D = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  if (await prisma.client.count() > 0) {
    console.log('Clients exist — demo seed skipped (wipe first to reload).');
    return;
  }

  /* ------------------------------------------------------------ customers */
  const clients = [
    { id: 'CL-001', name: 'Sri Krishna Apartments', type: 'Residential', contact: 'Meera Krishnan', phone: '+91 98842 31007', addr: '18, 3rd Cross Street, Kasturba Nagar', city: 'Chennai', area: 'Adyar', pin: '600020', color: '#1B2E65', since: D(-420) },
    { id: 'CL-002', name: 'Grand Bay Hotel', type: 'Commercial', contact: 'Vikram Bose', phone: '+91 90031 55670', addr: '2, Beach Road', city: 'Chennai', area: 'Besant Nagar', pin: '600090', gstin: '33AAFCG2211K1Z2', color: '#FF0000', since: D(-388) },
    { id: 'CL-003', name: 'Medlife Multi-Speciality Hospital', type: 'Commercial', contact: 'Admin Office', phone: '+91 90030 88112', addr: '77, Velachery Main Road', city: 'Chennai', area: 'Velachery', pin: '600042', gstin: '33AACCM8899P1ZK', color: '#1B2E65', since: D(-355) },
    { id: 'CL-004', name: 'Kumar Residence', type: 'Residential', contact: 'S. Kumar', phone: '+91 98410 22334', addr: '5, Lake View Street', city: 'Chennai', area: 'Anna Nagar', pin: '600040', color: '#FF0000', since: D(-300) },
    { id: 'CL-005', name: 'TechNova Solutions Pvt Ltd', type: 'Commercial', contact: 'Facilities Desk', phone: '+91 90030 44777', addr: 'Plot 12, OMR IT Park', city: 'Chennai', area: 'Perungudi', pin: '600096', gstin: '33AABCT4455N1ZR', color: '#1B2E65', since: D(-270) },
    { id: 'CL-006', name: 'Fresh Basket Supermarket', type: 'Commercial', contact: 'S. Iyer', phone: '+91 90030 12280', addr: '112, Velachery Main Road', city: 'Chennai', area: 'Velachery', pin: '600042', gstin: '33AABCF9988D1ZQ', color: '#FF0000', since: D(-190) },
    { id: 'CL-007', name: 'Nithya Dental Clinic', type: 'Commercial', contact: 'Dr. Nithya', phone: '+91 98410 77821', addr: '40, 2nd Avenue', city: 'Chennai', area: 'Anna Nagar', pin: '600040', color: '#1B2E65', since: D(-120) },
    { id: 'CL-008', name: 'Sai Ganesh Mess', type: 'Commercial', contact: 'Ganesh', phone: '+91 90000 00001', addr: '12 Bazaar Road', city: 'Chennai', area: 'Adyar', pin: '600020', color: '#FF0000', since: D(-60) },
  ];
  for (const c of clients) await prisma.client.create({ data: c });

  /* ---------------------------------------------------------------- leads */
  const leads = [
    { id: 'LD-1035', name: 'Ocean Pearl Restaurant', phone: '+91 90000 11223', type: 'Commercial', area: 'Thiruvanmiyur', source: 'Walk-in', stage: 'new' as const, value: 48000, owner: 'U03', branch: 'BR-01', followUp: D(1) },
    { id: 'LD-1036', name: 'Green Meadows Villa', phone: '+91 90000 22334', type: 'Residential', area: 'Sholinganallur', source: 'Website', stage: 'new' as const, value: 12000, owner: 'U03', branch: 'BR-03', followUp: D(2) },
    { id: 'LD-1037', name: 'Sunrise Public School', phone: '+91 90000 33445', type: 'Commercial', area: 'Anna Nagar', source: 'Referral', stage: 'followup' as const, value: 96000, owner: 'U03', branch: 'BR-02', followUp: D(-1), notes: 'Principal wants a campus walk-through first.' },
    { id: 'LD-1038', name: 'Blue Fin Seafood Kitchen', phone: '+91 90000 44556', type: 'Commercial', area: 'Besant Nagar', source: 'WhatsApp', stage: 'inspection' as const, value: 54000, owner: 'U02', branch: 'BR-01', followUp: D(3) },
    { id: 'LD-1039', name: 'Harmony Old Age Home', phone: '+91 90000 55667', type: 'Commercial', area: 'Velachery', source: 'Referral', stage: 'quoted' as const, value: 72000, owner: 'U03', branch: 'BR-03', followUp: D(4) },
    { id: 'LD-1040', name: 'Casa Blanca Apartments', phone: '+91 90000 66778', type: 'Residential', area: 'Mogappair', source: 'Website', stage: 'lost' as const, value: 30000, owner: 'U03', branch: 'BR-02' },
  ];
  for (const l of leads) {
    await prisma.lead.create({
      data: {
        ...l,
        log: [{ at: D(-7) + 'T10:00', by: l.owner, text: 'Enquiry received via ' + l.source }] as never,
      },
    });
  }

  /* ----------------------------------------------------------- quotations */
  await prisma.quotation.create({
    data: {
      id: 'QT-2048', leadId: 'LD-1039', date: D(-6), status: 'sent', mode: 'amc',
      months: 12, freq: 'Monthly', title: 'Annual pest programme — Harmony Old Age Home',
      placeOfSupply: 'Tamil Nadu', owner: 'U03', branch: 'BR-03',
      terms: ['Prices are per visit and exclusive of GST.', 'Payment due within 15 days of invoice.'],
      items: { create: [
        { svId: 'SV01', desc: 'All rooms + kitchen + dining', qty: 12, rate: 2400, visits: 12, order: 0 },
        { svId: 'SV07', desc: 'Bait stations, monthly service', qty: 12, rate: 2000, visits: 12, order: 1 },
      ] },
    },
  });
  await prisma.quotation.create({
    data: {
      id: 'QT-2049', clientId: 'CL-004', date: D(-3), status: 'draft', mode: 'onetime',
      title: 'Bed bug treatment — 3 bedrooms', placeOfSupply: 'Tamil Nadu', owner: 'U03', branch: 'BR-02',
      items: { create: [{ svId: 'SV06', desc: 'Two-round treatment, 15 days apart', qty: 3, rate: 2500, order: 0 }] },
    },
  });

  /* ------------------------------------------------- contracts + visits */
  type PlanRow = { svId: string; visits: number; mins: number; slot: string; crew: number; techIds: string[]; freq: string };
  const mkContract = async (c: {
    id: string; clientId: string; start: string; months: number; value: number;
    billing: string; owner: string; branch: string; scope: string; plan: PlanRow[];
  }) => {
    const start = c.start;
    const end = D(0) <= start ? start : ''; // placeholder, set below
    const endISO = (() => { const d = new Date(start); d.setMonth(d.getMonth() + c.months); return d.toISOString().slice(0, 10); })();
    const dayRule = 'dom:' + Number(start.slice(8, 10));

    const input: ContractInput = {
      id: c.id, start, end: endISO, months: c.months, slot: '10:00',
      mergeSameDay: true, workdaysOnly: true, blackout: [],
      plan: c.plan.map((l) => ({ ...l, dayRule, startAt: start, months: 0 })),
    };
    const visits = planVisits(input);

    await prisma.contract.create({
      data: {
        id: c.id, clientId: c.clientId, mode: 'amc', start, end: endISO, months: c.months,
        freq: c.plan[0]?.freq || 'Monthly', billing: c.billing, value: c.value,
        owner: c.owner, branch: c.branch, scope: c.scope,
        site: clients.find((x) => x.id === c.clientId)?.addr || '',
        slot: '10:00', totalVisits: visits.length, agreedAt: start + 'T10:00',
        placeOfSupply: 'Tamil Nadu',
        plan: { create: c.plan.map((l, i) => ({
          svId: l.svId, visits: l.visits, mins: l.mins, dayRule, startAt: start,
          slot: l.slot, freq: l.freq, crew: l.crew, techIds: l.techIds, order: i,
        })) },
      },
    });

    let n = 0;
    for (const v of visits) {
      n++;
      const done = v.date < D(0);
      await prisma.job.create({
        data: {
          id: 'JOB-' + (900 + (await prisma.job.count())),
          type: 'AMC Visit', contractId: c.id, clientId: c.clientId,
          serviceIds: v.serviceIds, date: v.date, slot: v.slot, mins: v.mins,
          techIds: v.techIds, crewNeed: v.crew,
          status: done ? 'completed' : 'scheduled',
          visitNo: n, ofVisits: visits.length,
          exec: done ? {
            checkinAt: v.date + 'T10:05', startedAt: v.date + 'T10:10',
            finishedAt: v.date + 'T11:20', durationMins: 70,
            findings: ['No fresh activity observed'], observations: 'Routine service completed.',
            signedBy: 'Site contact', signature: true, rating: 5,
          } as never : undefined,
        },
      });
    }
    return visits.length;
  };

  await mkContract({
    id: 'AMC-2026-01', clientId: 'CL-001', start: D(-214), months: 12, value: 66000,
    billing: 'Quarterly', owner: 'U02', branch: 'BR-01',
    scope: 'All 48 flats + common areas, terrace, basement and STP room.',
    plan: [
      { svId: 'SV01', visits: 12, mins: 60, slot: '09:00', crew: 2, techIds: ['U04', 'U05'], freq: 'Monthly' },
      { svId: 'SV08', visits: 4, mins: 75, slot: '09:00', crew: 2, techIds: ['U04', 'U05'], freq: 'Quarterly' },
    ],
  });
  // the awkward one — 2 + 4 crews, short of people (the case the crew model exists for)
  await mkContract({
    id: 'AMC-2026-02', clientId: 'CL-008', start: D(-45), months: 12, value: 23128,
    billing: 'Quarterly', owner: 'U02', branch: 'BR-01',
    scope: 'Kitchen, store and dining hall — full commercial programme.',
    plan: [
      { svId: 'SV03', visits: 4, mins: 40, slot: '10:00', crew: 2, techIds: ['U06'], freq: 'Quarterly' },
      { svId: 'SV13', visits: 4, mins: 60, slot: '10:00', crew: 4, techIds: ['U06', 'U09'], freq: 'Quarterly' },
    ],
  });
  await mkContract({
    id: 'AMC-2026-03', clientId: 'CL-003', start: D(-152), months: 12, value: 186000,
    billing: 'Monthly', owner: 'U02', branch: 'BR-03',
    scope: 'Wards, OT block, kitchen and waste yard. Fogging after visiting hours only.',
    plan: [
      { svId: 'SV07', visits: 12, mins: 60, slot: '19:00', crew: 1, techIds: ['U06'], freq: 'Monthly' },
      { svId: 'SV11', visits: 12, mins: 60, slot: '19:00', crew: 1, techIds: ['U10'], freq: 'Monthly' },
      { svId: 'SV13', visits: 6, mins: 60, slot: '19:00', crew: 3, techIds: [], freq: 'Bi-Monthly' },
    ],
  });
  await mkContract({
    id: 'AMC-2026-04', clientId: 'CL-002', start: D(-100), months: 12, value: 148000,
    billing: 'Monthly', owner: 'U02', branch: 'BR-01',
    scope: 'Kitchens, restaurants, stores, staff quarters and pool deck.',
    plan: [
      { svId: 'SV03', visits: 12, mins: 40, slot: '23:00', crew: 2, techIds: ['U11', 'U10'], freq: 'Monthly' },
      { svId: 'SV07', visits: 12, mins: 60, slot: '23:00', crew: 2, techIds: ['U11', 'U10'], freq: 'Monthly' },
    ],
  });

  /* ------------------------------------------- today's queue for the board */
  const oneOffs = [
    { type: 'Callback', clientId: 'CL-002', serviceIds: ['SV03'], date: D(0), slot: '11:00', mins: 40, priority: 'high' as const, notes: 'Kitchen staff reported roaches again two days after the last spray.' },
    { type: 'Complaint', clientId: 'CL-006', serviceIds: ['SV07'], date: D(0), slot: '15:00', mins: 60, priority: 'urgent' as const, notes: 'Rodent seen in the dry store during an FSSAI walk-through.' },
    { type: 'One-Time', clientId: 'CL-003', serviceIds: ['SV13'], date: D(0), slot: '17:00', mins: 60, priority: 'normal' as const, notes: 'Extra fly treatment ahead of a weekend function.' },
    { type: 'One-Time', clientId: 'CL-005', serviceIds: ['SV04'], date: D(1), slot: '09:00', mins: 240, priority: 'high' as const, notes: 'Post-construction termite barrier, ground floor. Four-person drilling crew.', crewNeed: 4 },
    { type: 'Inspection', clientId: 'CL-007', serviceIds: ['SV01'], date: D(1), slot: '11:30', mins: 45, priority: 'normal' as const, notes: 'Survey before quoting — new enquiry from the Adyar WhatsApp group.' },
  ];
  for (const j of oneOffs) {
    await prisma.job.create({
      data: {
        id: 'JOB-' + (900 + (await prisma.job.count())),
        ...j, techIds: [], crewNeed: j.crewNeed || 1, status: 'scheduled', visitNo: 1, ofVisits: 1,
      },
    });
  }

  /* ------------------------------------------------- invoices + payments */
  await prisma.invoice.create({
    data: {
      id: 'INV-3313', clientId: 'CL-001', contractId: 'AMC-2026-01', date: D(-30), due: D(-15),
      period: 'Quarter 2', status: 'paid', placeOfSupply: 'Tamil Nadu',
      items: [{ desc: 'AMC — Quarter 2 of 4', qty: 1, rate: 16500 }] as never,
      payments: { create: [{ id: 'RCT-882', date: D(-18), amount: 19470, mode: 'UPI', ref: 'UPI/442213' }] },
    },
  });
  await prisma.invoice.create({
    data: {
      id: 'INV-3314', clientId: 'CL-004', date: D(-20), due: D(-5),
      period: 'One-time service', status: 'overdue', placeOfSupply: 'Tamil Nadu',
      items: [{ desc: 'Bed bug treatment — 2 bedrooms', qty: 2, rate: 2500 }] as never,
    },
  });
  await prisma.invoice.create({
    data: {
      id: 'INV-3315', clientId: 'CL-003', contractId: 'AMC-2026-03', date: D(-8), due: D(7),
      period: 'Month 5', status: 'partial', placeOfSupply: 'Tamil Nadu',
      items: [{ desc: 'AMC — monthly programme', qty: 1, rate: 15500 }] as never,
      payments: { create: [{ id: 'RCT-883', date: D(-2), amount: 9000, mode: 'Transfer', ref: 'NEFT/88112' }] },
    },
  });

  const [jobs, done] = await Promise.all([
    prisma.job.count(),
    prisma.job.count({ where: { status: 'completed' } }),
  ]);
  console.log(`Demo loaded: ${clients.length} customers, ${leads.length} leads, 2 quotations, 4 contracts, ${jobs} visits (${done} completed), 3 invoices.`);
}

main().finally(() => prisma.$disconnect());
