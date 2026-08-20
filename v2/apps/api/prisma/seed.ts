/* ============================================================================
   Seed — the setup a fresh install needs, ported from v1's Seed.build().

   Master data is complete (company, 3 branches, 11 people, 15 services, the
   chemical store). Transactional demo data — the 8 customers, 129 visits,
   invoices — follows in the parity phase once the engine modules land; the
   app is fully usable without it.

   Every seeded person signs in with the password below. Change it on the VPS.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'pestops123';

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await prisma.company.upsert({
    where: { id: 'co' },
    update: {},
    create: {
      id: 'co',
      name: 'Shield Pest Solutions',
      tagline: 'Licensed pest management — Chennai',
      phone: '+91 98400 12345',
      email: 'care@shieldpest.in',
      gstin: '33AABCS1429B1ZP',
      addr: 'No. 42, Sardar Patel Road, 2nd Floor, Adyar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pin: '600020',
      gstRate: 18,
      hoursFrom: '09:00',
      hoursTo: '18:00',
      hoursDays: [1, 2, 3, 4, 5, 6],
      terms: [
        'Prices are per visit unless stated otherwise and exclusive of GST.',
        'Area to be vacated during treatment where indicated on the service sheet.',
        'Warranty covers re-treatment of the same pest at the same site only.',
        'Payment due within 15 days of invoice.',
      ],
    },
  });

  const branches = [
    { id: 'BR-01', name: 'Adyar — Head Office', code: 'ADY', phone: '+91 98400 12345',
      areas: ['Adyar', 'Besant Nagar', 'Thiruvanmiyur', 'Mylapore', 'Alwarpet',
        'Nungambakkam', 'T. Nagar', 'Kotturpuram', 'Saidapet', 'Egmore'] },
    { id: 'BR-02', name: 'Anna Nagar', code: 'ANR', phone: '+91 98400 23456',
      areas: ['Anna Nagar', 'Kilpauk', 'Aminjikarai', 'Mogappair', 'Ambattur',
        'Villivakkam', 'Korattur', 'Padi'] },
    { id: 'BR-03', name: 'OMR — Perungudi', code: 'OMR', phone: '+91 98400 34567',
      areas: ['Perungudi', 'Thoraipakkam', 'Sholinganallur', 'Velachery',
        'Madipakkam', 'Pallikaranai', 'Karapakkam', 'Navalur'] },
  ];
  for (const b of branches) {
    await prisma.branch.upsert({ where: { id: b.id }, update: {}, create: b });
  }

  type U = {
    id: string; name: string; role: 'admin' | 'ops' | 'sales' | 'tech' | 'accounts' | 'client';
    title: string; email: string; phone: string; color: string; joined: string;
    skills?: string[]; branches: string[]; empType?: string;
  };
  const users: U[] = [
    { id: 'U01', name: 'Rajesh Kumar', role: 'admin', title: 'Founder & Director',
      email: 'rajesh@shieldpest.in', phone: '+91 98400 11223', color: '#0B7454',
      joined: '2014-04-01', branches: ['BR-01'] },
    { id: 'U02', name: 'Priya Sharma', role: 'ops', title: 'Operations Manager',
      email: 'priya@shieldpest.in', phone: '+91 98411 22334', color: '#7F56D9',
      joined: '2016-08-16', branches: ['BR-01'] },
    { id: 'U03', name: 'Arun Prakash', role: 'sales', title: 'Sales Executive',
      email: 'arun@shieldpest.in', phone: '+91 90030 44521', color: '#2E90FA',
      joined: '2019-02-11', branches: ['BR-02'] },
    { id: 'U04', name: 'Karthik R', role: 'tech', title: 'Senior Technician',
      email: 'karthik@shieldpest.in', phone: '+91 99400 76512', color: '#F79009',
      joined: '2017-03-20', skills: ['Termite', 'Cockroach', 'Rodent', 'Fumigation'],
      branches: ['BR-01'] },
    { id: 'U05', name: 'Suresh M', role: 'tech', title: 'Technician',
      email: 'suresh@shieldpest.in', phone: '+91 89390 11284', color: '#12B76A',
      joined: '2020-09-05', skills: ['Cockroach', 'Bed Bug', 'Mosquito'],
      branches: ['BR-02'] },
    { id: 'U06', name: 'Vignesh S', role: 'tech', title: 'Technician',
      email: 'vignesh@shieldpest.in', phone: '+91 73580 90014', color: '#F04438',
      joined: '2022-11-02', skills: ['Rodent', 'Disinfection', 'Fly Control'],
      branches: ['BR-03'], empType: 'Probation' },
    { id: 'U07', name: 'Deepa Nair', role: 'accounts', title: 'Accounts & Billing',
      email: 'deepa@shieldpest.in', phone: '+91 94440 55810', color: '#DB2777',
      joined: '2019-06-18', branches: ['BR-01'] },
    { id: 'U09', name: 'Manoj Kumar', role: 'tech', title: 'Senior Technician',
      email: 'manoj@shieldpest.in', phone: '+91 98410 22764', color: '#7F56D9',
      joined: '2018-07-11', skills: ['Termite', 'Wood Borer', 'Fumigation'],
      branches: ['BR-01'] },
    { id: 'U10', name: 'Lakshmi Devi', role: 'tech', title: 'Technician',
      email: 'lakshmi@shieldpest.in', phone: '+91 90031 55408', color: '#0BA5EC',
      joined: '2021-01-18', skills: ['Disinfection', 'Fly Control', 'Mosquito'],
      branches: ['BR-02'] },
    { id: 'U11', name: 'Anand Raj', role: 'tech', title: 'Technician',
      email: 'anand@shieldpest.in', phone: '+91 94441 87330', color: '#DC6803',
      joined: '2023-04-24', skills: ['Cockroach', 'Rodent', 'Bed Bug'],
      branches: ['BR-03'] },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, password: hash, skills: u.skills || [], empType: u.empType || 'Full-time' },
    });
  }

  type S = { id: string; code: string; name: string; cat: string; price: number;
    unit: string; mins: number; warranty: string; chem: string[]; desc: string };
  const services: S[] = [
    { id: 'SV01', code: 'GPC', name: 'General Pest Control', cat: 'Residential', price: 1800, unit: 'per visit', mins: 60, warranty: '3 months', chem: ['IN01', 'IN03'], desc: 'Covers cockroach, ant, spider, silverfish and lizard. Gel + residual spray in kitchen, bathrooms and common areas.' },
    { id: 'SV02', code: 'CKG', name: 'Cockroach Control — Gel', cat: 'Residential', price: 1200, unit: 'per visit', mins: 45, warranty: '3 months', chem: ['IN01'], desc: 'Odourless gel baiting in kitchen hinges, cabinets and appliance gaps. No vacating required.' },
    { id: 'SV03', code: 'CKS', name: 'Cockroach Control — Spray', cat: 'Commercial', price: 900, unit: 'per visit', mins: 40, warranty: '1 month', chem: ['IN03'], desc: 'Residual surface spray for heavy infestation. Area must be vacated for 3–4 hours.' },
    { id: 'SV04', code: 'TRM-P', name: 'Termite Control — Post Const.', cat: 'Specialised', price: 18000, unit: 'per 1000 sq.ft', mins: 240, warranty: '5 years', chem: ['IN02'], desc: 'Drill-fill-seal chemical barrier along wall-floor junction at 12" intervals.' },
    { id: 'SV05', code: 'TRM-C', name: 'Termite Control — Pre Const.', cat: 'Specialised', price: 25000, unit: 'per 1000 sq.ft', mins: 300, warranty: '10 years', chem: ['IN02'], desc: 'Soil treatment during construction — foundation, backfill and plinth stages.' },
    { id: 'SV06', code: 'BBG', name: 'Bed Bug Treatment', cat: 'Residential', price: 2500, unit: 'per bedroom', mins: 90, warranty: '45 days', chem: ['IN04'], desc: 'Two-round treatment 15 days apart. Mattress, frame, upholstery and crevice spray.' },
    { id: 'SV07', code: 'ROD', name: 'Rodent Control', cat: 'Commercial', price: 2200, unit: 'per visit', mins: 60, warranty: '1 month', chem: ['IN05'], desc: 'Tamper-proof bait stations, glue boards and snap traps with numbered station map.' },
    { id: 'SV08', code: 'MOS', name: 'Mosquito Control — Fogging', cat: 'Commercial', price: 3500, unit: 'per visit', mins: 75, warranty: '15 days', chem: ['IN06'], desc: 'Thermal fogging of outdoor perimeter plus larvicide in stagnant water points.' },
    { id: 'SV09', code: 'WDB', name: 'Wood Borer Treatment', cat: 'Specialised', price: 4500, unit: 'per visit', mins: 120, warranty: '1 year', chem: ['IN02'], desc: 'Injection treatment into borer holes followed by surface coating on all wood work.' },
    { id: 'SV10', code: 'SNK', name: 'Snake Repellent Treatment', cat: 'Industrial', price: 3000, unit: 'per visit', mins: 90, warranty: '3 months', chem: ['IN07'], desc: 'Perimeter granular repellent with habitat clearance advisory.' },
    { id: 'SV11', code: 'DIS', name: 'Disinfection & Sanitisation', cat: 'Commercial', price: 2800, unit: 'per visit', mins: 60, warranty: '—', chem: ['IN08'], desc: 'Hospital-grade quaternary ammonium fogging for offices, clinics and schools.' },
    { id: 'SV12', code: 'BEE', name: 'Honey Bee / Wasp Removal', cat: 'Specialised', price: 2000, unit: 'per hive', mins: 60, warranty: '—', chem: ['IN03'], desc: 'Safe hive removal in protective gear, carried out after sunset.' },
    { id: 'SV13', code: 'FLY', name: 'Fly Control — Commercial', cat: 'Commercial', price: 4000, unit: 'per visit', mins: 60, warranty: '1 month', chem: ['IN06'], desc: 'Space spray, drain gel and insect light trap servicing for kitchens and food areas.' },
    { id: 'SV14', code: 'WTC', name: 'Water Tank Cleaning', cat: 'Residential', price: 1500, unit: 'per tank', mins: 90, warranty: '—', chem: ['IN08'], desc: 'De-silting, high-pressure scrub, vacuum and UV/chlorine disinfection.' },
    { id: 'SV15', code: 'LIZ', name: 'Lizard Control', cat: 'Residential', price: 1100, unit: 'per visit', mins: 40, warranty: '1 month', chem: ['IN03'], desc: 'Repellent spray on entry points, window grills and false ceiling voids.' },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  const inventory = [
    { id: 'IN01', name: 'Maxforce Cockroach Gel', cat: 'Chemical', unit: 'g', stock: 1840, reorder: 600 },
    { id: 'IN02', name: 'Premise SC Termiticide', cat: 'Chemical', unit: 'ml', stock: 4200, reorder: 2000 },
    { id: 'IN03', name: 'Deltamethrin 2.5% WP', cat: 'Chemical', unit: 'g', stock: 380, reorder: 800 },
    { id: 'IN04', name: 'Bed Bug Combo Kit', cat: 'Chemical', unit: 'ml', stock: 2600, reorder: 900 },
    { id: 'IN05', name: 'Bromadiolone Wax Blocks', cat: 'Chemical', unit: 'blocks', stock: 148, reorder: 200 },
    { id: 'IN06', name: 'Pyrethrum Fogging Conc.', cat: 'Chemical', unit: 'ml', stock: 5100, reorder: 1500 },
    { id: 'IN07', name: 'Snake Repellent Granule', cat: 'Chemical', unit: 'kg', stock: 22, reorder: 15 },
    { id: 'IN08', name: 'Quat Disinfectant Conc.', cat: 'Chemical', unit: 'ml', stock: 8400, reorder: 3000 },
    { id: 'IN20', name: 'Compression Sprayer 5 L', cat: 'Equipment', unit: 'nos', stock: 9, reorder: 6 },
    { id: 'IN21', name: 'Thermal Fogging Machine', cat: 'Equipment', unit: 'nos', stock: 3, reorder: 2 },
    { id: 'IN22', name: 'Tamper-proof Bait Station', cat: 'Consumable', unit: 'nos', stock: 64, reorder: 80 },
    { id: 'IN23', name: 'Glue Board — Rodent', cat: 'Consumable', unit: 'nos', stock: 210, reorder: 100 },
    { id: 'IN24', name: 'PPE Kit (mask+gloves+suit)', cat: 'Consumable', unit: 'sets', stock: 38, reorder: 40 },
    { id: 'IN25', name: 'Insect Light Trap Board', cat: 'Consumable', unit: 'nos', stock: 26, reorder: 20 },
  ];
  for (const i of inventory) {
    await prisma.inventoryItem.upsert({ where: { id: i.id }, update: {}, create: i });
    // Stock lives on a branch shelf, and `item.stock` is the sum of those
    // shelves. Seeding one without the other breaks that invariant on the
    // first day, so the opening stock is placed at the head office.
    if (i.stock > 0) {
      await prisma.branchStock.upsert({
        where: { branchId_itemId: { branchId: 'BR-01', itemId: i.id } },
        update: {},
        create: { branchId: 'BR-01', itemId: i.id, qty: i.stock, reorder: i.reorder },
      });
    }
  }

  // invoice/receipt counters sit AFTER the demo rows (INV-3315, RCT-883)
  const seqs = { client: 100, job: 1000, quote: 2050, contract: 0, invoice: 3315, receipt: 883, lead: 1042, audit: 119 };
  for (const [key, value] of Object.entries(seqs)) {
    await prisma.seq.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log('Seeded. Sign in as rajesh@shieldpest.in / ' + PASSWORD);
}

main().finally(() => prisma.$disconnect());
