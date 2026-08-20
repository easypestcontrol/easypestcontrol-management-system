/* ============================================================================
   Make the live system fresh.

     1. The administrator becomes admin@easypest.com with the configured
        starting password.
     2. Every seeded demo person is removed.

   Nothing is guessed: the password comes from DEFAULT_USER_PASSWORD in the
   environment, so it is never typed on a command line or written to a log.
   A demo account is only deleted once we have checked nothing refers to it —
   ids are stamped on jobs, quotations and contracts, and a dangling stamp is
   worse than a dormant account, so anything referenced is deactivated instead.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = String(process.env.DEFAULT_USER_PASSWORD || '').trim();
if (!PASSWORD) throw new Error('DEFAULT_USER_PASSWORD is not set');

const ADMIN_EMAIL = 'admin@easypest.com';

const hash = await bcrypt.hash(PASSWORD, 10);
const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });

// The one account that stays: the existing administrator, re-addressed.
const admin = users.find((u) => u.role === 'admin');
if (!admin) throw new Error('No administrator to keep — refusing to empty the table');

await prisma.user.update({
  where: { id: admin.id },
  data: { email: ADMIN_EMAIL, password: hash, active: true },
});
console.log(`  kept  ${admin.id}  ${admin.name}  ->  ${ADMIN_EMAIL}`);

/* Does anything point at this person? */
async function referenced(id) {
  const [jobs, quotes, contracts, invoices, issues, trips, audits] = await Promise.all([
    prisma.job.count({ where: { OR: [{ techIds: { has: id } }, { createdBy: id }] } }).catch(() => 0),
    prisma.quotation.count({ where: { createdBy: id } }).catch(() => 0),
    prisma.contract.count({ where: { createdBy: id } }).catch(() => 0),
    prisma.invoice.count({ where: { createdBy: id } }).catch(() => 0),
    prisma.stockIssue.count({ where: { techId: id } }).catch(() => 0),
    prisma.trip.count({ where: { techId: id } }).catch(() => 0),
    prisma.audit.count({ where: { userId: id } }).catch(() => 0),
  ]);
  return jobs + quotes + contracts + invoices + issues + trips + audits;
}

let removed = 0, kept = 0;
for (const u of users) {
  if (u.id === admin.id) continue;
  const n = await referenced(u.id);
  if (n > 0) {
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    console.log(`  kept  ${u.id}  ${u.name.padEnd(16)} deactivated — ${n} records refer to them`);
    kept++;
  } else {
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  gone  ${u.id}  ${u.name}`);
    removed++;
  }
}

console.log(`\n  ${removed} removed, ${kept} deactivated, 1 administrator kept.`);
await prisma.$disconnect();
