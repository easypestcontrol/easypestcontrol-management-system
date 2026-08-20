/* ============================================================================
   One-off: give the stock that already exists a branch to sit on.

   Before purchasing, stock was a single company number. Now it lives on a
   branch shelf, and the invariant is that an item's `stock` equals the sum of
   its shelves. Existing stock has no branch recorded — it has to land somewhere
   or the two numbers disagree from the first day.

   It all goes to the head-office branch (the first one), which is the honest
   default: that is where a single-store company's chemicals actually were. Move
   what belongs elsewhere with a branch transfer, which leaves a ledger row.

   Safe to run twice: items that already have shelves are skipped.
   ========================================================================== */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const branches = await prisma.branch.findMany({ orderBy: { id: 'asc' } });
  if (!branches.length) throw new Error('No branches — seed those first');
  const home = branches[0];

  const items = await prisma.inventoryItem.findMany();
  const existing = await prisma.branchStock.findMany();
  const has = new Set(existing.map((b) => b.itemId));

  let moved = 0;
  let skipped = 0;
  for (const item of items) {
    if (has.has(item.id)) { skipped += 1; continue; }
    if (item.stock === 0) continue;
    await prisma.$transaction([
      prisma.branchStock.create({
        data: { branchId: home.id, itemId: item.id, qty: item.stock, reorder: item.reorder },
      }),
      prisma.stockMove.create({
        data: {
          itemId: item.id, branchId: home.id,
          date: new Date().toISOString().slice(0, 10),
          qty: item.stock, dir: 'in',
          note: `Opening stock at ${home.name}`,
        },
      }),
    ]);
    moved += 1;
  }

  // Prove the invariant rather than assume it.
  const shelves = await prisma.branchStock.findMany();
  const sum = new Map();
  for (const b of shelves) sum.set(b.itemId, (sum.get(b.itemId) || 0) + b.qty);
  const off = items.filter((i) => (sum.get(i.id) || 0) !== i.stock);

  console.log(`${moved} item(s) placed at ${home.name}, ${skipped} already had shelves`);
  if (off.length) {
    console.log('MISMATCH — item.stock does not equal the sum of its shelves:');
    for (const i of off) console.log(`  ${i.id} ${i.name}: stock ${i.stock}, shelves ${sum.get(i.id) || 0}`);
  } else {
    console.log('Every item total matches the sum of its branch shelves.');
  }
}

main().finally(() => prisma.$disconnect());
