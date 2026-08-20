/* One-time branch setup + backfill.
   1. The real five branches: BR-01 Chennai (absorbing the three demo locality
      branches and their areas), BR-02 Madurai, BR-03 Tiruchi, BR-04 Coimbatore,
      BR-05 Pondicherry.
   2. Every user, customer and document stamped with its branch via the chain.
   Run from v2/:  node branchfill.mjs                                        */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const lower = (s) => (s || '').trim().toLowerCase();

const branches = await p.branch.findMany();
console.log('branches before:', branches.map((b) => b.id + ':' + b.name).join(', '));

// -- 1. Chennai absorbs the demo locality branches ---------------------------
const areaUnion = [];
for (const b of branches) {
  for (const a of b.areas || []) if (!areaUnion.includes(a)) areaUnion.push(a);
  if (b.name && !areaUnion.includes(b.name)) areaUnion.push(b.name);
}
await p.branch.upsert({
  where: { id: 'BR-01' },
  create: { id: 'BR-01', name: 'Chennai', code: 'CHN', areas: areaUnion },
  update: { name: 'Chennai', code: 'CHN', areas: areaUnion },
});

// every reference to the old locality branches now means Chennai
const OLD = branches.map((b) => b.id).filter((id) => id !== 'BR-01');
for (const id of OLD) {
  await p.client.updateMany({ where: { branch: id }, data: { branch: 'BR-01' } });
  for (const m of ['lead', 'quotation', 'contract', 'purchaseOrder']) {
    await p[m].updateMany({ where: { branch: id }, data: { branch: 'BR-01' } });
  }
  const users = await p.user.findMany({ where: { branches: { has: id } } });
  for (const u of users) {
    const set = u.branches.filter((x) => x !== id);
    if (!set.includes('BR-01')) set.push('BR-01');
    await p.user.update({ where: { id: u.id }, data: { branches: set } });
  }
  await p.branchStock.updateMany({ where: { branchId: id }, data: { branchId: 'BR-01' } }).catch(() => {});
  await p.stockMove.updateMany({ where: { branchId: id }, data: { branchId: 'BR-01' } }).catch(() => {});
  await p.branch.delete({ where: { id } });
}

// -- the other four cities ---------------------------------------------------
const CITIES = [
  ['BR-02', 'Madurai', 'MDU'], ['BR-03', 'Tiruchi', 'TRY'],
  ['BR-04', 'Coimbatore', 'CBE'], ['BR-05', 'Pondicherry', 'PDY'],
];
for (const [id, name, code] of CITIES) {
  await p.branch.upsert({
    where: { id },
    create: { id, name, code, areas: [name] },
    update: { name, code },
  });
}

// -- 2. people: everyone unassigned is Chennai staff (today's reality) -------
const noBranch = await p.user.findMany({ where: { branches: { isEmpty: true } } });
for (const u of noBranch) {
  await p.user.update({ where: { id: u.id }, data: { branches: ['BR-01'] } });
}
console.log('users defaulted to Chennai:', noBranch.map((u) => u.id).join(', ') || 'none');

// -- customers: explicit, inferred from area, else Chennai -------------------
const allBranches = await p.branch.findMany();
const infer = (area) => {
  const a = lower(area);
  if (!a) return '';
  for (const b of allBranches) {
    if ((b.areas || []).some((x) => lower(x) === a)) return b.id;
  }
  return '';
};
let inferred = 0, defaulted = 0;
for (const c of await p.client.findMany({ where: { branch: '' } })) {
  const b = infer(c.area) || 'BR-01';
  if (b === 'BR-01' && !infer(c.area)) defaulted++; else inferred++;
  await p.client.update({ where: { id: c.id }, data: { branch: b } });
}
console.log('customers stamped — inferred:', inferred, '| defaulted to Chennai:', defaulted);

// -- documents follow their customer ----------------------------------------
const byClient = new Map((await p.client.findMany({ select: { id: true, branch: true } }))
  .map((c) => [c.id, c.branch]));

async function stamp(model, rows) {
  let n = 0;
  for (const r of rows) {
    const b = byClient.get(r.clientId) || 'BR-01';
    await p[model].update({ where: { id: r.id }, data: { branch: b } });
    n++;
  }
  console.log(model + ' stamped:', n);
}
await stamp('quotation', await p.quotation.findMany({ where: { branch: '' }, select: { id: true, clientId: true } }));
await stamp('contract', await p.contract.findMany({ where: { branch: '' }, select: { id: true, clientId: true } }));
await stamp('job', await p.job.findMany({ where: { branch: '' }, select: { id: true, clientId: true } }));
await stamp('invoice', await p.invoice.findMany({ where: { branch: '' }, select: { id: true, clientId: true } }));

// leads have no customer — anything unstamped is Chennai (today's book)
const leads = await p.lead.updateMany({ where: { branch: '' }, data: { branch: 'BR-01' } });
console.log('leads stamped:', leads.count);
const pos = await p.purchaseOrder.updateMany({ where: { branch: '' }, data: { branch: 'BR-01' } });
console.log('purchase orders stamped:', pos.count);

console.log('branches after:', (await p.branch.findMany({ orderBy: { id: 'asc' } }))
  .map((b) => b.id + ':' + b.name + ' [' + (b.areas || []).length + ' areas]').join(', '));
await p.$disconnect();
