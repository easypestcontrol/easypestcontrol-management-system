/* ============================================================================
   A starting row for each service this app already depends on.

   The figures are placeholders — nobody but you knows what your VPS costs or
   which mailbox Cloudflare bills. The point is that the shape is there and the
   limits are the real ones each provider meters, so filling it in is editing
   four rows rather than remembering what to write down.

   Safe to run twice: a service already recorded is left alone.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED = [
  {
    id: 'CR-01',
    service: 'VPS',
    provider: '',
    plan: '',
    cycle: 'Monthly',
    note: 'Runs the API, the web app and PostgreSQL. See deploy/DEPLOY.md.',
    quotas: [
      { label: 'Disk', unit: 'GB', order: 0 },
      { label: 'Bandwidth', unit: 'GB / month', order: 1 },
      { label: 'Memory', unit: 'GB', order: 2 },
    ],
  },
  {
    id: 'CR-02',
    service: 'Cloudflare R2',
    provider: 'Cloudflare',
    plan: '',
    cycle: 'Pay as you go',
    console: 'https://dash.cloudflare.com',
    note: 'Object storage. Free tier is 10 GB, then billed on use.',
    quotas: [
      { label: 'Storage', unit: 'GB', limit: 10, order: 0 },
      { label: 'Class A operations', unit: 'ops / month', limit: 1000000, order: 1 },
      { label: 'Class B operations', unit: 'ops / month', limit: 10000000, order: 2 },
    ],
  },
  {
    id: 'CR-03',
    service: 'Ola Maps',
    provider: 'Ola Krutrim',
    plan: '',
    cycle: 'Monthly',
    console: 'https://maps.olakrutrim.com',
    note: 'Geocoding and routing for trips and in-app navigation. Key lives in Settings → Integrations.',
    quotas: [{ label: 'API calls', unit: 'calls / month', order: 0 }],
  },
  {
    id: 'CR-04',
    service: 'Razorpay',
    provider: 'Razorpay',
    plan: '',
    cycle: 'Pay as you go',
    console: 'https://dashboard.razorpay.com',
    note: 'UPI QR collection. Charged per transaction, no ceiling. Keys not yet added.',
    quotas: [],
  },
];

async function main() {
  for (const c of SEED) {
    const exists = await prisma.credential.findFirst({ where: { service: c.service } });
    if (exists) { console.log(`  ${c.service} already recorded — left alone`); continue; }
    const { quotas, ...rest } = c;
    await prisma.credential.create({
      data: { ...rest, quotas: { create: quotas } },
    });
    console.log(`  added ${c.service}${quotas.length ? ` with ${quotas.length} limit(s)` : ''}`);
  }
  const n = await prisma.credential.count();
  console.log(`\n${n} service(s) on the credentials page. Fill in the account, cost and renewal date for each.`);
}

main().finally(() => prisma.$disconnect());
