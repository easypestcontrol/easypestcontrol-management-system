/* One-time rename: every JOB-xxxx becomes SER-xxxx — the id itself and every
   place that mentions it (invoice links and line items, trips, stock issues
   and movements, notification and receipt texts). New services already mint
   as SER-. Run from v2/:  node serfill.mjs                                  */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const ren = (s) => (typeof s === 'string' ? s.replace(/\bJOB-/g, 'SER-') : s);

// -- the services themselves (plain string PK, nothing FK-references it) ----
const jobs = await p.job.findMany({ where: { id: { startsWith: 'JOB-' } }, select: { id: true } });
for (const j of jobs) {
  await p.job.update({ where: { id: j.id }, data: { id: ren(j.id) } });
}
console.log('services renamed:', jobs.length);

// -- invoices: the link column, the line items, the period text -------------
const invs = await p.invoice.findMany({
  select: { id: true, jobId: true, period: true, items: true },
});
let invTouched = 0;
for (const inv of invs) {
  const items = Array.isArray(inv.items)
    ? inv.items.map((it) => ({ ...it, desc: ren(it.desc), jobId: ren(it.jobId) }))
    : inv.items;
  const next = { jobId: ren(inv.jobId), period: ren(inv.period), items };
  if (next.jobId !== inv.jobId || next.period !== inv.period
      || JSON.stringify(items) !== JSON.stringify(inv.items)) {
    await p.invoice.update({ where: { id: inv.id }, data: next });
    invTouched++;
  }
}
console.log('invoices touched:', invTouched);

// -- everything else that carries the id or mentions it in text -------------
async function sweep(model, fields) {
  const rows = await p[model].findMany();
  let n = 0;
  for (const r of rows) {
    const data = {};
    for (const f of fields) {
      const v = ren(r[f]);
      if (v !== r[f]) data[f] = v;
    }
    if (Object.keys(data).length) {
      await p[model].update({ where: { id: r.id }, data });
      n++;
    }
  }
  console.log(model + ' touched:', n);
}
await sweep('trip', ['jobId', 'purpose']);
await sweep('stockIssue', ['jobId', 'note']);
await sweep('stockMove', ['jobId', 'note']);
await sweep('notification', ['text']);
await sweep('payment', ['ref']);

console.log('remaining JOB- ids:', (await p.job.count({ where: { id: { startsWith: 'JOB-' } } })));
await p.$disconnect();
