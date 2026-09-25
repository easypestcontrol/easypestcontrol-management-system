/* ============================================================================
   The report engine — money out, stock, the work, and the overview.

   Phase 2 and 3 of the Zoho Books comparison: expenses and trips, purchases,
   inventory, service visits, contracts and renewals, the lead pipeline, the
   income-versus-spend view, the day book, cash settlement, audits, and the
   activity log. Same shape as the money-in reports: a function over the
   loaded books returning typed columns, rows, totals and headline figures.
   ========================================================================== */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TripsService } from '../trips/trips.service';
import { billingPlan, daysBetween, docTotals } from 'shared';
import { lineToInput } from '../contracts/plan';
import type { FilterSpec, Row, RunParams } from './report.types';
import {
  BUCKETS as _B, Ctx, Def, Extra, Need, inRange, isoDay, issued, monthLabel, niceDate, pct, r0, r1, sumOf,
} from './report-base';

void _B;

/* ----------------------------------------------------------------- utils */

function bump(map: Map<string, Row>, key: string, init: () => Row): Row {
  let r = map.get(key);
  if (!r) { r = init(); map.set(key, r); }
  return r;
}
const add = (r: Row, k: string, n: number) => { r[k] = (Number(r[k]) || 0) + n; };
const name = (c: Ctx, id: string, fallback = 'Former staff') => (id ? c.users.get(id) || fallback : '');
const branchName = (c: Ctx, id: string) => (id ? c.branches.get(id) || id : '');
const clientName = (c: Ctx, id: string) => c.clients.get(id)?.name || id || '—';

/** Expense statuses that mean the office accepted the claim. */
const ACCEPTED = new Set(['approved', 'processing', 'reimbursed', 'partial', 'payment_failed']);
/** What a line reads as, once part payment is taken into account. */
function expenseState(e: { status: string; amount: number; paidAmount: number }): string {
  if (e.status === 'reimbursed') return 'paid';
  if (e.status === 'partial' || (ACCEPTED.has(e.status) && e.paidAmount > 0 && e.paidAmount < e.amount)) return 'part paid';
  if (e.status === 'payment_failed') return 'payment failed';
  if (e.status === 'processing') return 'paying';
  return e.status;
}

const EXPENSE_STATUS: FilterSpec = {
  key: 'status', label: 'Status', kind: 'select',
  options: [
    { key: '', label: 'Every status' }, { key: 'pending', label: 'To verify' }, { key: 'approved', label: 'Approved, unpaid' },
    { key: 'part', label: 'Part paid' }, { key: 'paid', label: 'Paid' }, { key: 'rejected', label: 'Rejected' },
  ],
};
const expenseMatches = (e: { status: string; amount: number; paidAmount: number }, st: string) => {
  if (!st) return true;
  if (st === 'pending') return e.status === 'pending';
  if (st === 'approved') return ACCEPTED.has(e.status) && e.paidAmount <= 0;
  if (st === 'part') return ACCEPTED.has(e.status) && e.paidAmount > 0 && e.paidAmount < e.amount;
  if (st === 'paid') return e.status === 'reimbursed' || (ACCEPTED.has(e.status) && e.paidAmount >= e.amount && e.amount > 0);
  if (st === 'rejected') return e.status === 'rejected';
  return true;
};

const JOB_STATUS: FilterSpec = {
  key: 'status', label: 'Status', kind: 'select',
  options: [
    { key: '', label: 'Every status' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'enroute', label: 'En route' },
    { key: 'inprogress', label: 'In progress' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' },
  ],
};

/** A PO's money: ordered (ex GST after discount), GST, total, and the value of what arrived. */
function poMoney(c: Ctx, po: { items: Array<{ qty: number; rate: number; receivedQty: number }>; discount: number; placeOfSupply: string }) {
  const t = docTotals(po.items.map((l) => ({ qty: l.qty, rate: l.rate })), po.discount || 0, po.placeOfSupply || c.co.state, c.co.state, c.co.gstRate);
  const received = po.items.reduce((s, l) => s + l.receivedQty * l.rate, 0);
  return { taxable: t.sub - t.disc, gst: t.gst, total: t.total, received };
}

/* --------------------------------------------------------------- reports */

export const MORE_DEFS: Def[] = [
  /* ============================================================= EXPENSES */
  {
    key: 'expense-details', title: 'Expense details', section: 'Expenses', range: 'period', needs: ['expenses'],
    description: 'Every staff expense claim dated in the range: who, what, how much, and where it stands.',
    filters: [EXPENSE_STATUS, { key: 'category', label: 'Category', kind: 'select', options: [{ key: '', label: 'Every category' }] }], landscape: true,
    run(c) {
      const st = c.filters.status || ''; const cat = c.filters.category || '';
      const list = (c.x.expenses || [])
        .filter((e) => inRange(e.date, c.from, c.to) && expenseMatches(e, st) && (!cat || e.category === cat))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .map((e): Row => ({
          id: e.id, date: e.date, employee: name(c, e.userId), branch: branchName(c, e.branch), category: e.category,
          detail: [e.merchant, e.note].filter(Boolean).join(' · ') || (e.source === 'auto_trip' ? 'Trip ' + e.tripId + (e.km ? ' · ' + r1(e.km) + ' km' : '') : ''),
          amount: e.amount, state: expenseState(e),
          by: e.status === 'rejected' ? name(c, e.rejectedBy) : ACCEPTED.has(e.status) ? name(c, e.approvedBy) : '',
          reviewed: e.reviewedAt, paid: e.paidAmount, paidAt: e.paidAt.slice(0, 10), href: '/expenses/' + e.id,
        }));
      const accepted = (c.x.expenses || []).filter((e) => inRange(e.date, c.from, c.to) && expenseMatches(e, st) && (!cat || e.category === cat));
      const claimed = r0(accepted.reduce((s, e) => s + e.amount, 0));
      const approved = r0(accepted.filter((e) => ACCEPTED.has(e.status)).reduce((s, e) => s + e.amount, 0));
      const paid = r0(accepted.reduce((s, e) => s + e.paidAmount, 0));
      return {
        columns: [
          { key: 'id', label: 'Claim', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'employee', label: 'Employee', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'category', label: 'Category', type: 'text', tight: true },
          { key: 'detail', label: 'Detail', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'state', label: 'Status', type: 'text', tight: true },
          { key: 'by', label: 'Decided by', type: 'text', tight: true },
          { key: 'reviewed', label: 'Decided at', type: 'text', tight: true },
          { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'paidAt', label: 'Paid on', type: 'date' },
        ],
        rows: list,
        totals: { id: 'Total', employee: list.length + ' claims', amount: claimed, paid },
        stats: [
          { label: 'Claims', value: list.length, type: 'int' },
          { label: 'Claimed', value: claimed, type: 'money' },
          { label: 'Approved', value: approved, type: 'money' },
          { label: 'Paid', value: paid, type: 'money' },
          { label: 'Rejected', value: r0(accepted.filter((e) => e.status === 'rejected').reduce((s, e) => s + e.amount, 0)), type: 'money' },
        ],
        filterText: [st ? 'Status: ' + (EXPENSE_STATUS.options?.find((o) => o.key === st)?.label || st) : '', cat ? 'Category: ' + cat : ''].filter(Boolean),
      };
    },
  },
  {
    key: 'expenses-by-category', title: 'Expenses by category', section: 'Expenses', range: 'period', needs: ['expenses'],
    description: 'Claims in the range grouped by category: how many, how much, what was approved, paid and turned down.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const e of (c.x.expenses || []).filter((x) => inRange(x.date, c.from, c.to))) {
        const r = bump(rows, e.category || '(none)', () => ({ category: e.category || '(none)', claims: 0, claimed: 0, pending: 0, approved: 0, paid: 0, rejected: 0 }));
        add(r, 'claims', 1); add(r, 'claimed', e.amount);
        if (e.status === 'pending') add(r, 'pending', e.amount);
        if (ACCEPTED.has(e.status)) add(r, 'approved', e.amount);
        if (e.status === 'rejected') add(r, 'rejected', e.amount);
        add(r, 'paid', e.paidAmount);
      }
      const list = [...rows.values()].sort((a, b) => Number(b.claimed) - Number(a.claimed));
      return {
        columns: [
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'claims', label: 'Claims', type: 'int' },
          { key: 'claimed', label: 'Claimed', type: 'money' },
          { key: 'pending', label: 'To verify', type: 'money' },
          { key: 'approved', label: 'Approved', type: 'money' },
          { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'rejected', label: 'Rejected', type: 'money' },
        ],
        rows: list,
        totals: { category: 'Total', claims: sumOf(list, 'claims'), claimed: sumOf(list, 'claimed'), pending: sumOf(list, 'pending'), approved: sumOf(list, 'approved'), paid: sumOf(list, 'paid'), rejected: sumOf(list, 'rejected') },
        stats: [
          { label: 'Categories', value: list.length, type: 'int' },
          { label: 'Claimed', value: sumOf(list, 'claimed'), type: 'money' },
          { label: 'Approved', value: sumOf(list, 'approved'), type: 'money' },
          { label: 'Paid', value: sumOf(list, 'paid'), type: 'money' },
        ],
      };
    },
  },
  {
    key: 'expenses-by-employee', title: 'Expenses by employee', section: 'Expenses', range: 'period', needs: ['expenses'],
    description: 'Per person: what they claimed in the range, what was approved, what has been paid, and what is still owed to them.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const e of (c.x.expenses || []).filter((x) => inRange(x.date, c.from, c.to))) {
        const r = bump(rows, e.userId || '-', () => ({ employee: name(c, e.userId, 'Unknown'), branch: branchName(c, e.branch), claims: 0, claimed: 0, pending: 0, approved: 0, paid: 0, owed: 0, rejected: 0, ...(e.userId ? { href: '/team/' + e.userId } : {}) }));
        add(r, 'claims', 1); add(r, 'claimed', e.amount);
        if (e.status === 'pending') add(r, 'pending', e.amount);
        if (ACCEPTED.has(e.status)) { add(r, 'approved', e.amount); add(r, 'owed', Math.max(0, e.amount - e.paidAmount)); }
        if (e.status === 'rejected') add(r, 'rejected', e.amount);
        add(r, 'paid', e.paidAmount);
      }
      const list = [...rows.values()].sort((a, b) => Number(b.claimed) - Number(a.claimed));
      return {
        columns: [
          { key: 'employee', label: 'Employee', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'claims', label: 'Claims', type: 'int' },
          { key: 'claimed', label: 'Claimed', type: 'money' },
          { key: 'pending', label: 'To verify', type: 'money' },
          { key: 'approved', label: 'Approved', type: 'money' },
          { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'owed', label: 'Still owed', type: 'money' },
          { key: 'rejected', label: 'Rejected', type: 'money' },
        ],
        rows: list,
        totals: { employee: 'Total', claims: sumOf(list, 'claims'), claimed: sumOf(list, 'claimed'), pending: sumOf(list, 'pending'), approved: sumOf(list, 'approved'), paid: sumOf(list, 'paid'), owed: sumOf(list, 'owed'), rejected: sumOf(list, 'rejected') },
        stats: [
          { label: 'People', value: list.length, type: 'int' },
          { label: 'Claimed', value: sumOf(list, 'claimed'), type: 'money' },
          { label: 'Paid', value: sumOf(list, 'paid'), type: 'money' },
          { label: 'Still owed', value: sumOf(list, 'owed'), type: 'money' },
        ],
        note: 'Still owed = approved but not yet paid out. Trip allowances are claims like any other.',
      };
    },
  },
  {
    key: 'mileage-by-employee', title: 'Mileage by employee', section: 'Expenses', range: 'period', needs: ['trips'],
    description: 'Kilometres driven per person on finished trips in the range, at their rate, and what is still waiting for review.',
    run(c) {
      const rows = new Map<string, Row>();
      const km = new Map<string, number>();
      for (const t of (c.x.trips || []).filter((x) => x.status === 'done' && inRange(isoDay(x.endAt || x.startAt), c.from, c.to))) {
        const r = bump(rows, t.userId, () => ({ employee: name(c, t.userId), branch: branchName(c, t.branch), trips: 0, km: 0, rate: c.x.rateOf ? c.x.rateOf(t.branch, t.userId) : 0, allowance: 0, review: 0, rejected: 0, claimed: 0, href: '/team/' + t.userId }));
        add(r, 'trips', 1);
        if (t.review === 'rejected') { add(r, 'rejected', 1); continue; }
        km.set(t.userId, (km.get(t.userId) || 0) + t.distanceM / 1000);
        if (t.review === 'pending') add(r, 'review', 1);
        if (t.claimId) add(r, 'claimed', 1);
      }
      const list = [...rows.values()].map((r): Row => {
        const k = km.get(String(r.href).replace('/team/', '')) || 0;
        return { ...r, km: r1(k), allowance: r0(k * Number(r.rate)) };
      }).sort((a, b) => Number(b.allowance) - Number(a.allowance));
      return {
        columns: [
          { key: 'employee', label: 'Employee', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'trips', label: 'Trips', type: 'int' },
          { key: 'km', label: 'Km', type: 'num' },
          { key: 'rate', label: '₹ / km', type: 'num' },
          { key: 'allowance', label: 'Allowance', type: 'money' },
          { key: 'review', label: 'To review', type: 'int' },
          { key: 'rejected', label: 'Rejected', type: 'int' },
          { key: 'claimed', label: 'In a claim', type: 'int' },
        ],
        rows: list,
        totals: { employee: 'Total', trips: sumOf(list, 'trips'), km: r1(list.reduce((s, r) => s + Number(r.km), 0)), allowance: sumOf(list, 'allowance'), review: sumOf(list, 'review'), rejected: sumOf(list, 'rejected'), claimed: sumOf(list, 'claimed') },
        stats: [
          { label: 'Trips', value: sumOf(list, 'trips'), type: 'int' },
          { label: 'Kilometres', value: r1(list.reduce((s, r) => s + Number(r.km), 0)), type: 'num' },
          { label: 'Allowance', value: sumOf(list, 'allowance'), type: 'money' },
          { label: 'To review', value: sumOf(list, 'review'), type: 'int' },
        ],
        note: 'A trip counts on the day it finished. Rejected trips are listed but pay nothing. The rate is the person’s own, else their branch’s, else the company’s.',
      };
    },
  },

  /* ============================================================ PURCHASES */
  {
    key: 'purchase-order-details', title: 'Purchase order details', section: 'Purchases', range: 'period', needs: ['purchases'],
    description: 'Every purchase order dated in the range: vendor, status, packs ordered and received, and the money.',
    filters: [{ key: 'status', label: 'Status', kind: 'select', options: [{ key: '', label: 'Every status' }, { key: 'draft', label: 'Draft' }, { key: 'ordered', label: 'Ordered' }, { key: 'partial', label: 'Partly received' }, { key: 'received', label: 'Received' }, { key: 'cancelled', label: 'Cancelled' }] }], landscape: true,
    run(c) {
      const st = c.filters.status || '';
      const list = (c.x.purchases || []).filter((p) => inRange(p.date, c.from, c.to) && (!st || p.status === st))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p): Row => {
          const m = poMoney(c, p);
          return {
            id: p.id, date: p.date, vendor: p.vendorName, branch: branchName(c, p.branch), status: p.status,
            ordered: p.items.reduce((s, l) => s + l.qty, 0), got: p.items.reduce((s, l) => s + l.receivedQty, 0),
            taxable: r0(m.taxable), gst: r0(m.gst), total: m.total, received: r0(m.received), expected: p.expected, by: name(c, p.raisedBy), href: '/purchase-orders/' + p.id,
          };
        });
      const live = list.filter((r) => r.status !== 'draft' && r.status !== 'cancelled');
      return {
        columns: [
          { key: 'id', label: 'PO', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'vendor', label: 'Vendor', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'status', label: 'Status', type: 'text', tight: true },
          { key: 'ordered', label: 'Packs ordered', type: 'int' },
          { key: 'got', label: 'Packs received', type: 'int' },
          { key: 'taxable', label: 'Value', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
          { key: 'received', label: 'Received value', type: 'money' },
          { key: 'expected', label: 'Expected', type: 'date' },
          { key: 'by', label: 'Raised by', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', vendor: live.length + ' live', ordered: sumOf(live, 'ordered'), got: sumOf(live, 'got'), taxable: sumOf(live, 'taxable'), gst: sumOf(live, 'gst'), total: sumOf(live, 'total'), received: sumOf(live, 'received') },
        stats: [
          { label: 'Orders', value: list.length, type: 'int' },
          { label: 'Ordered value', value: sumOf(live, 'taxable'), type: 'money' },
          { label: 'Received value', value: sumOf(live, 'received'), type: 'money' },
          { label: 'Still to arrive', value: Math.max(0, sumOf(live, 'taxable') - sumOf(live, 'received')), type: 'money' },
        ],
        filterText: st ? ['Status: ' + st] : [],
        note: 'Value is ex-GST after discount. Received value is the packs that arrived at their ordered rate, before discount. Drafts and cancelled orders are listed but not added.',
      };
    },
  },
  {
    key: 'purchases-by-vendor', title: 'Purchases by vendor', section: 'Purchases', range: 'period', needs: ['purchases'],
    description: 'What was ordered from each vendor in the range, and how much of it has arrived.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const p of (c.x.purchases || []).filter((x) => inRange(x.date, c.from, c.to) && x.status !== 'draft' && x.status !== 'cancelled')) {
        const m = poMoney(c, p);
        const r = bump(rows, p.vendorId, () => ({ vendor: p.vendorName, orders: 0, packs: 0, taxable: 0, gst: 0, total: 0, received: 0 }));
        add(r, 'orders', 1); add(r, 'packs', p.items.reduce((s, l) => s + l.qty, 0));
        add(r, 'taxable', m.taxable); add(r, 'gst', m.gst); add(r, 'total', m.total); add(r, 'received', m.received);
      }
      const list = [...rows.values()].map((r): Row => ({ ...r, taxable: r0(Number(r.taxable)), gst: r0(Number(r.gst)), received: r0(Number(r.received)) })).sort((a, b) => Number(b.taxable) - Number(a.taxable));
      return {
        columns: [
          { key: 'vendor', label: 'Vendor', type: 'text' },
          { key: 'orders', label: 'Orders', type: 'int' },
          { key: 'packs', label: 'Packs', type: 'int' },
          { key: 'taxable', label: 'Ordered value', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
          { key: 'received', label: 'Received value', type: 'money' },
        ],
        rows: list,
        totals: { vendor: 'Total', orders: sumOf(list, 'orders'), packs: sumOf(list, 'packs'), taxable: sumOf(list, 'taxable'), gst: sumOf(list, 'gst'), total: sumOf(list, 'total'), received: sumOf(list, 'received') },
        stats: [
          { label: 'Vendors', value: list.length, type: 'int' },
          { label: 'Ordered value', value: sumOf(list, 'taxable'), type: 'money' },
          { label: 'GST', value: sumOf(list, 'gst'), type: 'money' },
          { label: 'Received value', value: sumOf(list, 'received'), type: 'money' },
        ],
        note: 'Live orders only (not drafts, not cancelled). Vendor bills are not recorded, so this is what was ordered, not what was paid.',
      };
    },
  },
  {
    key: 'purchases-by-item', title: 'Purchases by item', section: 'Purchases', range: 'period', needs: ['purchases'],
    description: 'Each product ordered in the range: packs ordered and received, the quantity in base units, the spend and the average pack rate.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const p of (c.x.purchases || []).filter((x) => inRange(x.date, c.from, c.to) && x.status !== 'draft' && x.status !== 'cancelled')) {
        for (const l of p.items) {
          const k = l.itemId || 'n:' + l.name.toLowerCase();
          const r = bump(rows, k, () => ({ item: l.name || l.itemId, cat: l.cat, pack: (l.packSize > 1 ? l.packSize + ' ' + l.baseUnit + ' ' : '') + (l.packUnit || 'pack'), orders: 0, ordered: 0, got: 0, units: 0, amount: 0, avg: 0, ...(l.itemId ? { href: '/inventory/' + l.itemId } : {}) }));
          add(r, 'orders', 1); add(r, 'ordered', l.qty); add(r, 'got', l.receivedQty); add(r, 'units', l.qty * l.packSize); add(r, 'amount', l.qty * l.rate);
        }
      }
      const list = [...rows.values()].map((r): Row => ({ ...r, avg: Number(r.ordered) ? r0(Number(r.amount) / Number(r.ordered)) : 0 })).sort((a, b) => Number(b.amount) - Number(a.amount));
      return {
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'cat', label: 'Category', type: 'text', tight: true },
          { key: 'pack', label: 'Pack', type: 'text', tight: true },
          { key: 'orders', label: 'Orders', type: 'int' },
          { key: 'ordered', label: 'Packs ordered', type: 'int' },
          { key: 'got', label: 'Packs received', type: 'int' },
          { key: 'units', label: 'Base units', type: 'int' },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'avg', label: 'Avg rate / pack', type: 'money' },
        ],
        rows: list,
        totals: { item: 'Total', orders: sumOf(list, 'orders'), ordered: sumOf(list, 'ordered'), got: sumOf(list, 'got'), amount: sumOf(list, 'amount') },
        stats: [
          { label: 'Items', value: list.length, type: 'int' },
          { label: 'Packs ordered', value: sumOf(list, 'ordered'), type: 'int' },
          { label: 'Amount', value: sumOf(list, 'amount'), type: 'money' },
        ],
        note: 'Line amounts ex-GST, before any order-level discount.',
      };
    },
  },

  /* ============================================================ INVENTORY */
  {
    key: 'stock-summary', title: 'Stock summary', section: 'Inventory', range: 'now', needs: ['stock', 'purchases'],
    description: 'Every product right now: on the shelf, in technicians’ hands, on order, and whether it is below its reorder level.',
    run(c) {
      const s = c.x.stock; if (!s) return { columns: [], rows: [], stats: [] };
      const inScope = (b: string) => c.scope === null || c.scope.includes(b);
      const shelf = new Map<string, number>(); const floor = new Map<string, number>();
      for (const b of s.branchStock) if (inScope(b.branchId)) { shelf.set(b.itemId, (shelf.get(b.itemId) || 0) + b.qty); floor.set(b.itemId, (floor.get(b.itemId) || 0) + b.reorder); }
      const hands = new Map<string, number>();
      for (const t of s.techStock) {
        const ub = c.userBranches.get(t.userId) || [];
        if (c.scope === null || ub.some((b) => c.scope!.includes(b))) hands.set(t.itemId, (hands.get(t.itemId) || 0) + t.qty);
      }
      const onOrder = new Map<string, number>();
      for (const p of (c.x.purchases || []).filter((x) => (x.status === 'ordered' || x.status === 'partial') && inScope(x.branch))) {
        for (const l of p.items) if (l.itemId) onOrder.set(l.itemId, (onOrder.get(l.itemId) || 0) + Math.max(0, l.qty - l.receivedQty) * l.packSize);
      }
      const list = s.items.map((it): Row => {
        const onShelf = c.scope === null ? it.stock : shelf.get(it.id) || 0;
        const level = c.scope === null ? it.reorder : floor.get(it.id) || it.reorder;
        return {
          item: it.name, cat: it.cat, unit: it.unit, shelf: onShelf, hands: hands.get(it.id) || 0, order: onOrder.get(it.id) || 0,
          reorder: level, state: level > 0 && onShelf < level ? 'LOW' : '', href: '/inventory/' + it.id,
        };
      }).sort((a, b) => (a.state === b.state ? String(a.item).localeCompare(String(b.item)) : a.state ? -1 : 1));
      return {
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'cat', label: 'Category', type: 'text', tight: true },
          { key: 'unit', label: 'Unit', type: 'text', tight: true },
          { key: 'shelf', label: 'On the shelf', type: 'int' },
          { key: 'hands', label: 'With technicians', type: 'int' },
          { key: 'order', label: 'On order', type: 'int' },
          { key: 'reorder', label: 'Reorder level', type: 'int' },
          { key: 'state', label: 'Alert', type: 'text', tight: true },
        ],
        rows: list,
        stats: [
          { label: 'Products', value: list.length, type: 'int' },
          { label: 'Below reorder level', value: list.filter((r) => r.state === 'LOW').length, type: 'int' },
          { label: 'With technicians (lines)', value: list.filter((r) => Number(r.hands) > 0).length, type: 'int' },
        ],
        note: 'Quantities in each item’s base unit. With a branch chosen, the shelf and reorder level are that branch’s; otherwise the company total.',
      };
    },
  },
  {
    key: 'stock-movement', title: 'Stock movement', section: 'Inventory', range: 'period', needs: ['stock'],
    description: 'Every movement on the stock ledger in the range: what came in from a purchase order, what went out to a service.',
    run(c) {
      const s = c.x.stock; if (!s) return { columns: [], rows: [], stats: [] };
      const item = new Map(s.items.map((i) => [i.id, i]));
      const list = s.moves.filter((m) => inRange(m.date, c.from, c.to))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m): Row => ({
          date: m.date, item: item.get(m.itemId)?.name || m.itemId, branch: branchName(c, m.branchId), dir: m.dir === 'in' ? 'In' : 'Out',
          qty: m.qty, unit: item.get(m.itemId)?.unit || '', ref: m.poId ? 'PO ' + m.poId : m.jobId ? 'Service ' + m.jobId : m.note, href: '/inventory/' + m.itemId,
        }));
      const inQ = list.filter((r) => r.dir === 'In').reduce((s2, r) => s2 + Number(r.qty), 0);
      const outQ = list.filter((r) => r.dir === 'Out').reduce((s2, r) => s2 + Number(r.qty), 0);
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'dir', label: 'In / out', type: 'text', tight: true },
          { key: 'qty', label: 'Quantity', type: 'int' },
          { key: 'unit', label: 'Unit', type: 'text', tight: true },
          { key: 'ref', label: 'Reference', type: 'text' },
        ],
        rows: list,
        stats: [
          { label: 'Movements', value: list.length, type: 'int' },
          { label: 'Units in', value: inQ, type: 'int' },
          { label: 'Units out', value: outQ, type: 'int' },
        ],
      };
    },
  },
  {
    key: 'inventory-valuation', title: 'Inventory valuation', section: 'Inventory', range: 'now', needs: ['stock'],
    description: 'What the stock on hand is worth at each item’s last purchase rate, on the shelf and with technicians.',
    run(c) {
      const s = c.x.stock; if (!s) return { columns: [], rows: [], stats: [] };
      const inScope = (b: string) => c.scope === null || c.scope.includes(b);
      const shelf = new Map<string, number>();
      for (const b of s.branchStock) if (inScope(b.branchId)) shelf.set(b.itemId, (shelf.get(b.itemId) || 0) + b.qty);
      const hands = new Map<string, number>();
      for (const t of s.techStock) {
        const ub = c.userBranches.get(t.userId) || [];
        if (c.scope === null || ub.some((b) => c.scope!.includes(b))) hands.set(t.itemId, (hands.get(t.itemId) || 0) + t.qty);
      }
      const list = s.items.map((it): Row => {
        const per = it.lastPackSize > 0 ? it.lastRate / it.lastPackSize : 0;
        const onShelf = c.scope === null ? it.stock : shelf.get(it.id) || 0;
        const inHands = hands.get(it.id) || 0;
        return {
          item: it.name, cat: it.cat, unit: it.unit, shelf: onShelf, hands: inHands,
          pack: it.lastPackSize > 1 ? it.lastPackSize + ' ' + it.unit + (it.lastPackUnit ? ' / ' + it.lastPackUnit : '') : it.lastPackUnit || '1 ' + it.unit,
          rate: it.lastRate, shelfValue: r0(onShelf * per), handsValue: r0(inHands * per), value: r0((onShelf + inHands) * per), href: '/inventory/' + it.id,
        };
      }).sort((a, b) => Number(b.value) - Number(a.value));
      return {
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'cat', label: 'Category', type: 'text', tight: true },
          { key: 'shelf', label: 'On the shelf', type: 'int' },
          { key: 'hands', label: 'With technicians', type: 'int' },
          { key: 'unit', label: 'Unit', type: 'text', tight: true },
          { key: 'pack', label: 'Last pack', type: 'text', tight: true },
          { key: 'rate', label: 'Last rate / pack', type: 'money' },
          { key: 'shelfValue', label: 'Shelf value', type: 'money' },
          { key: 'handsValue', label: 'In hands value', type: 'money' },
          { key: 'value', label: 'Total value', type: 'money' },
        ],
        rows: list,
        totals: { item: 'Total', shelfValue: sumOf(list, 'shelfValue'), handsValue: sumOf(list, 'handsValue'), value: sumOf(list, 'value') },
        stats: [
          { label: 'Products', value: list.length, type: 'int' },
          { label: 'Shelf value', value: sumOf(list, 'shelfValue'), type: 'money' },
          { label: 'With technicians', value: sumOf(list, 'handsValue'), type: 'money' },
          { label: 'Stock value', value: sumOf(list, 'value'), type: 'money' },
        ],
        note: 'Valued at the last purchase rate per pack, spread over the pack size. Not a FIFO valuation: an item never purchased through the app is worth nil here.',
      };
    },
  },
  {
    key: 'chemical-usage', title: 'Chemical usage', section: 'Inventory', range: 'period', needs: ['jobs', 'stock'],
    description: 'What technicians recorded using on completed visits in the range, per product, with an estimated cost at the last purchase rate.',
    run(c) {
      const s = c.x.stock; const item = new Map((s?.items || []).map((i) => [i.id, i]));
      const rows = new Map<string, Row>(); const visits = new Map<string, Set<string>>();
      for (const j of (c.x.jobs || []).filter((x) => x.status === 'completed' && inRange(x.date, c.from, c.to))) {
        for (const ch of j.exec?.chemicals || []) {
          const it = item.get(ch.id);
          const r = bump(rows, ch.id, () => ({ item: it?.name || ch.id, cat: it?.cat || '', unit: it?.unit || '', visits: 0, qty: 0, cost: 0, ...(it ? { href: '/inventory/' + it.id } : {}) }));
          add(r, 'qty', Number(ch.qty) || 0);
          const per = it && it.lastPackSize > 0 ? it.lastRate / it.lastPackSize : 0;
          add(r, 'cost', (Number(ch.qty) || 0) * per);
          const v = visits.get(ch.id) || new Set<string>(); v.add(j.id); visits.set(ch.id, v);
        }
      }
      const list = [...rows.entries()].map(([id, r]): Row => ({ ...r, visits: visits.get(id)?.size || 0, cost: r0(Number(r.cost)) })).sort((a, b) => Number(b.cost) - Number(a.cost));
      return {
        columns: [
          { key: 'item', label: 'Product', type: 'text' },
          { key: 'cat', label: 'Category', type: 'text', tight: true },
          { key: 'visits', label: 'Visits', type: 'int' },
          { key: 'qty', label: 'Quantity used', type: 'num' },
          { key: 'unit', label: 'Unit', type: 'text', tight: true },
          { key: 'cost', label: 'Est. cost', type: 'money' },
        ],
        rows: list,
        totals: { item: 'Total', visits: '', qty: '', cost: sumOf(list, 'cost') },
        stats: [
          { label: 'Products used', value: list.length, type: 'int' },
          { label: 'Visits with usage', value: new Set([...visits.values()].flatMap((v) => [...v])).size, type: 'int' },
          { label: 'Estimated cost', value: sumOf(list, 'cost'), type: 'money' },
        ],
        note: 'Cost = quantity × last purchase rate spread over the pack size. Only what the technician recorded on the visit.',
      };
    },
  },

  /* =========================================================== OPERATIONS */
  {
    key: 'visit-details', title: 'Service visit details', section: 'Operations', range: 'period', needs: ['jobs'],
    description: 'Every service visit dated in the range: customer, services, technicians, status, time on site, the customer’s rating.',
    filters: [JOB_STATUS], landscape: true,
    run(c) {
      const st = c.filters.status || '';
      const list = (c.x.jobs || []).filter((j) => inRange(j.date, c.from, c.to) && (!st || j.status === st))
        .sort((a, b) => b.date.localeCompare(a.date) || a.slot.localeCompare(b.slot))
        .map((j): Row => ({
          id: j.id, date: j.date, slot: j.slot, customer: clientName(c, j.clientId), type: j.type,
          services: j.serviceIds.map((s) => c.services.get(s)?.name || s).join(', '),
          techs: j.techIds.map((t) => name(c, t)).filter(Boolean).join(', '), status: j.status,
          mins: j.exec?.durationMins || (j.status === 'completed' ? j.mins : 0), rating: j.exec?.rating || '', invoice: j.invoiceId, contract: j.contractId, href: '/jobs/' + j.id,
        }));
      const done = list.filter((r) => r.status === 'completed');
      const rated = done.filter((r) => Number(r.rating) > 0);
      return {
        columns: [
          { key: 'id', label: 'Visit', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'slot', label: 'Slot', type: 'text', tight: true },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'type', label: 'Type', type: 'text', tight: true },
          { key: 'services', label: 'Services', type: 'text' },
          { key: 'techs', label: 'Technicians', type: 'text' },
          { key: 'status', label: 'Status', type: 'text', tight: true },
          { key: 'mins', label: 'Minutes', type: 'int' },
          { key: 'rating', label: 'Rating', type: 'num' },
          { key: 'invoice', label: 'Invoice', type: 'text', tight: true },
          { key: 'contract', label: 'Contract', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' visits', mins: sumOf(done, 'mins') },
        stats: [
          { label: 'Visits', value: list.length, type: 'int' },
          { label: 'Completed', value: done.length, type: 'int' },
          { label: 'Cancelled', value: list.filter((r) => r.status === 'cancelled').length, type: 'int' },
          { label: 'Average rating', value: rated.length ? r1(rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length) : 0, type: 'num' },
        ],
        filterText: st ? ['Status: ' + st] : [],
      };
    },
  },
  {
    key: 'visits-by-technician', title: 'Visits by technician', section: 'Operations', range: 'period', needs: ['jobs'],
    description: 'Per technician: visits assigned in the range, completed, cancelled and still open, with time on site and ratings.',
    run(c) {
      const rows = new Map<string, Row>(); const ratings = new Map<string, number[]>(); const mins = new Map<string, number[]>();
      for (const j of (c.x.jobs || []).filter((x) => inRange(x.date, c.from, c.to))) {
        for (const t of j.techIds) {
          const r = bump(rows, t, () => ({ tech: name(c, t), assigned: 0, done: 0, cancelled: 0, open: 0, rate: 0, mins: 0, rating: 0, href: '/team/' + t }));
          add(r, 'assigned', 1);
          if (j.status === 'completed') {
            add(r, 'done', 1);
            const m = j.exec?.durationMins || j.mins; if (m) mins.set(t, [...(mins.get(t) || []), m]);
            if (j.exec?.rating) ratings.set(t, [...(ratings.get(t) || []), j.exec.rating]);
          } else if (j.status === 'cancelled') add(r, 'cancelled', 1);
          else add(r, 'open', 1);
        }
      }
      const avg = (a: number[] | undefined) => (a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const list = [...rows.entries()].map(([t, r]): Row => ({
        ...r, rate: pct(Number(r.done), Number(r.assigned) - Number(r.cancelled)), mins: r0(avg(mins.get(t))), rating: ratings.get(t)?.length ? r1(avg(ratings.get(t))) : '',
      })).sort((a, b) => Number(b.done) - Number(a.done));
      return {
        columns: [
          { key: 'tech', label: 'Technician', type: 'text' },
          { key: 'assigned', label: 'Assigned', type: 'int' },
          { key: 'done', label: 'Completed', type: 'int' },
          { key: 'open', label: 'Open', type: 'int' },
          { key: 'cancelled', label: 'Cancelled', type: 'int' },
          { key: 'rate', label: 'Completion', type: 'pct' },
          { key: 'mins', label: 'Avg minutes', type: 'int' },
          { key: 'rating', label: 'Avg rating', type: 'num' },
        ],
        rows: list,
        totals: { tech: 'Total', assigned: sumOf(list, 'assigned'), done: sumOf(list, 'done'), open: sumOf(list, 'open'), cancelled: sumOf(list, 'cancelled') },
        stats: [
          { label: 'Technicians', value: list.length, type: 'int' },
          { label: 'Visits completed', value: sumOf(list, 'done'), type: 'int' },
          { label: 'Still open', value: sumOf(list, 'open'), type: 'int' },
        ],
        note: 'A visit with two technicians counts once for each of them. Completion = completed ÷ (assigned − cancelled).',
      };
    },
  },
  {
    key: 'visits-by-service', title: 'Visits by service', section: 'Operations', range: 'period', needs: ['jobs'],
    description: 'Per service type: visits scheduled in the range, completed, cancelled, and how many have been invoiced.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const j of (c.x.jobs || []).filter((x) => inRange(x.date, c.from, c.to))) {
        for (const s of j.serviceIds) {
          const sv = c.services.get(s);
          const r = bump(rows, s, () => ({ service: sv?.name || s, code: sv?.code || '', visits: 0, done: 0, open: 0, cancelled: 0, rate: 0, invoiced: 0 }));
          add(r, 'visits', 1);
          if (j.status === 'completed') add(r, 'done', 1); else if (j.status === 'cancelled') add(r, 'cancelled', 1); else add(r, 'open', 1);
          if (j.invoiceId) add(r, 'invoiced', 1);
        }
      }
      const list = [...rows.values()].map((r): Row => ({ ...r, rate: pct(Number(r.done), Number(r.visits) - Number(r.cancelled)) })).sort((a, b) => Number(b.visits) - Number(a.visits));
      return {
        columns: [
          { key: 'service', label: 'Service', type: 'text' },
          { key: 'code', label: 'Code', type: 'text', tight: true },
          { key: 'visits', label: 'Visits', type: 'int' },
          { key: 'done', label: 'Completed', type: 'int' },
          { key: 'open', label: 'Open', type: 'int' },
          { key: 'cancelled', label: 'Cancelled', type: 'int' },
          { key: 'rate', label: 'Completion', type: 'pct' },
          { key: 'invoiced', label: 'Invoiced', type: 'int' },
        ],
        rows: list,
        totals: { service: 'Total', visits: sumOf(list, 'visits'), done: sumOf(list, 'done'), open: sumOf(list, 'open'), cancelled: sumOf(list, 'cancelled'), invoiced: sumOf(list, 'invoiced') },
        stats: [
          { label: 'Services', value: list.length, type: 'int' },
          { label: 'Visits', value: sumOf(list, 'visits'), type: 'int' },
          { label: 'Completed', value: sumOf(list, 'done'), type: 'int' },
        ],
        note: 'A visit covering two services counts once under each.',
      };
    },
  },
  {
    key: 'contract-details', title: 'Contract details', section: 'Operations', range: 'now', needs: ['contracts', 'jobs'],
    description: 'Every contract as it stands: term, value, billing, visits done against planned, and whether it is live, expiring or expired.',
    filters: [{ key: 'status', label: 'Status', kind: 'select', options: [{ key: '', label: 'Every contract' }, { key: 'active', label: 'Active' }, { key: 'expiring', label: 'Expiring within 30 days' }, { key: 'expired', label: 'Expired' }] }], landscape: true,
    run(c) {
      const st = c.filters.status || '';
      const doneBy = new Map<string, number>(); const allBy = new Map<string, number>();
      for (const j of c.x.jobs || []) {
        if (!j.contractId) continue;
        if (j.status !== 'cancelled') allBy.set(j.contractId, (allBy.get(j.contractId) || 0) + 1);
        if (j.status === 'completed') doneBy.set(j.contractId, (doneBy.get(j.contractId) || 0) + 1);
      }
      const list = (c.x.contracts || []).map((k): Row => {
        const left = daysBetween(c.today, k.end);
        const state = left < 0 ? 'expired' : left <= 30 ? 'expiring' : 'active';
        return {
          id: k.id, customer: clientName(c, k.clientId), type: k.mode === 'amc' ? 'AMC' : 'One-time', start: k.start, end: k.end, left: Math.max(0, left),
          state, value: k.value, billing: k.billingMode === 'upfront' ? 'Upfront' : k.billingMode === 'pervisit' ? 'Per visit' : k.billing || 'Interval',
          done: doneBy.get(k.id) || 0, planned: k.totalVisits || allBy.get(k.id) || 0, owner: name(c, k.owner), branch: branchName(c, k.branch), href: '/contracts/' + k.id,
        };
      }).filter((r) => !st || r.state === st).sort((a, b) => String(a.end).localeCompare(String(b.end)));
      const active = list.filter((r) => r.state !== 'expired');
      return {
        columns: [
          { key: 'id', label: 'Contract', type: 'text', tight: true },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'type', label: 'Type', type: 'text', tight: true },
          { key: 'start', label: 'Start', type: 'date' },
          { key: 'end', label: 'End', type: 'date' },
          { key: 'left', label: 'Days left', type: 'days' },
          { key: 'state', label: 'Status', type: 'text', tight: true },
          { key: 'value', label: 'Value', type: 'money' },
          { key: 'billing', label: 'Billing', type: 'text', tight: true },
          { key: 'done', label: 'Visits done', type: 'int' },
          { key: 'planned', label: 'Planned', type: 'int' },
          { key: 'owner', label: 'Owner', type: 'text', tight: true },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' contracts', value: sumOf(list, 'value'), done: sumOf(list, 'done'), planned: sumOf(list, 'planned') },
        stats: [
          { label: 'Contracts', value: list.length, type: 'int' },
          { label: 'Live', value: active.length, type: 'int' },
          { label: 'Expiring in 30 days', value: list.filter((r) => r.state === 'expiring').length, type: 'int' },
          { label: 'Value of live contracts', value: sumOf(active, 'value'), type: 'money' },
        ],
        filterText: st ? ['Status: ' + st] : [],
      };
    },
  },
  {
    key: 'renewals-due', title: 'Renewals due', section: 'Operations', range: 'period', needs: ['contracts', 'jobs'],
    description: 'Contracts that end in the range: who to call, what the contract was worth, how much of the work was delivered.',
    run(c) {
      const doneBy = new Map<string, number>();
      for (const j of c.x.jobs || []) if (j.contractId && j.status === 'completed') doneBy.set(j.contractId, (doneBy.get(j.contractId) || 0) + 1);
      const list = (c.x.contracts || []).filter((k) => inRange(k.end, c.from, c.to))
        .sort((a, b) => a.end.localeCompare(b.end))
        .map((k): Row => ({
          id: k.id, customer: clientName(c, k.clientId), phone: c.clients.get(k.clientId)?.phone || '', type: k.mode === 'amc' ? 'AMC' : 'One-time',
          end: k.end, left: Math.max(0, daysBetween(c.today, k.end)), value: k.value, done: doneBy.get(k.id) || 0, planned: k.totalVisits, owner: name(c, k.owner), href: '/contracts/' + k.id,
        }));
      return {
        columns: [
          { key: 'id', label: 'Contract', type: 'text', tight: true },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text', tight: true },
          { key: 'type', label: 'Type', type: 'text', tight: true },
          { key: 'end', label: 'Ends', type: 'date' },
          { key: 'left', label: 'Days left', type: 'days' },
          { key: 'value', label: 'Value', type: 'money' },
          { key: 'done', label: 'Visits done', type: 'int' },
          { key: 'planned', label: 'Planned', type: 'int' },
          { key: 'owner', label: 'Owner', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' ending', value: sumOf(list, 'value') },
        stats: [
          { label: 'Contracts ending', value: list.length, type: 'int' },
          { label: 'Value to renew', value: sumOf(list, 'value'), type: 'money' },
          { label: 'AMC', value: list.filter((r) => r.type === 'AMC').length, type: 'int' },
        ],
      };
    },
  },
  {
    key: 'amc-billing-due', title: 'AMC billing due', section: 'Operations', range: 'period', needs: ['contracts'],
    description: 'Every installment that falls due in the range under the contracts’ billing plans, and whether its invoice has been raised.',
    run(c) {
      const byContract = new Map<string, Inv2[]>();
      for (const i of c.invoices) if (i.contractId && issued(i)) byContract.set(i.contractId, [...(byContract.get(i.contractId) || []), i]);
      const list: Row[] = [];
      const taken = new Set<string>();
      for (const k of c.x.contracts || []) {
        if (!k.value) continue;
        let plan: Array<{ seq: number; due: string; amount: number; label: string }> = [];
        try {
          plan = billingPlan({
            id: k.id, start: k.start, end: k.end, months: k.months, value: k.value, billingAmount: k.billingAmount || 0,
            billing: k.billing, billingMode: k.billingMode, slot: k.slot, mergeSameDay: k.mergeSameDay, workdaysOnly: k.workdaysOnly,
            blackout: k.blackout, plan: k.plan.map((l) => ({ ...lineToInput(l), rate: l.rate })),
          });
        } catch { plan = []; }
        for (const r of plan) {
          if (!inRange(r.due, c.from, c.to)) continue;
          // An installment is "raised" when an issued invoice of this contract
          // carries its sequence number, or failing that (older invoices carry
          // none) falls on its due date, or repeats its label. Each invoice
          // answers for one installment only. A per-visit line matches by date.
          const mine = (byContract.get(k.id) || []).filter((i) => !taken.has(i.id));
          const hit = k.billingMode === 'pervisit'
            ? mine.find((i) => i.date === r.due)
            : mine.filter((i) => i.kind !== 'visit').find((i) => ((i as unknown as { seq?: number }).seq || 0) === r.seq)
              || mine.filter((i) => i.kind !== 'visit').find((i) => i.date === r.due)
              || mine.filter((i) => i.kind !== 'visit').find((i) => i.period === r.label);
          if (hit) taken.add(hit.id);
          list.push({
            due: r.due, id: k.id, customer: clientName(c, k.clientId), what: r.label, amount: r.amount, gross: r0(r.amount * (1 + c.co.gstRate / 100)),
            mode: k.billingMode === 'upfront' ? 'Upfront' : k.billingMode === 'pervisit' ? 'Per visit' : 'Installment',
            invoice: hit ? hit.id : '', state: hit ? hit.status : 'not raised', href: hit ? '/invoices/' + hit.id : '/contracts/' + k.id,
          });
        }
      }
      list.sort((a, b) => String(a.due).localeCompare(String(b.due)));
      const open = list.filter((r) => r.state === 'not raised');
      return {
        columns: [
          { key: 'due', label: 'Due', type: 'date' },
          { key: 'id', label: 'Contract', type: 'text', tight: true },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'what', label: 'Installment', type: 'text' },
          { key: 'mode', label: 'Billing', type: 'text', tight: true },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'gross', label: 'Incl. GST', type: 'money' },
          { key: 'invoice', label: 'Invoice', type: 'text', tight: true },
          { key: 'state', label: 'Status', type: 'text', tight: true },
        ],
        rows: list,
        totals: { due: '', id: 'Total', customer: list.length + ' installments', amount: sumOf(list, 'amount'), gross: sumOf(list, 'gross') },
        stats: [
          { label: 'Installments due', value: list.length, type: 'int' },
          { label: 'Amount due', value: sumOf(list, 'amount'), type: 'money' },
          { label: 'Not yet raised', value: open.length, type: 'int' },
          { label: 'Not raised, value', value: sumOf(open, 'amount'), type: 'money' },
        ],
        note: 'Amounts ex-GST from each contract’s billing plan. Upfront and interval installments match an invoice by sequence; per-visit lines match by visit date.',
      };
    },
  },
  {
    key: 'lead-pipeline', title: 'Lead pipeline', section: 'Operations', range: 'period', needs: ['leads'],
    description: 'Leads created in the range: where they came from, where they stand, what was won and lost, and the value still in play.',
    filters: [{ key: 'group', label: 'Group by', kind: 'select', options: [{ key: '', label: 'Source' }, { key: 'owner', label: 'Owner' }, { key: 'type', label: 'Property type' }, { key: 'branch', label: 'Branch' }] }],
    run(c) {
      const by = c.filters.group || 'source';
      const rows = new Map<string, Row>();
      for (const l of (c.x.leads || []).filter((x) => inRange(isoDay(x.createdAt), c.from, c.to))) {
        const key = by === 'owner' ? l.owner || '-' : by === 'type' ? l.type || '-' : by === 'branch' ? l.branch || '-' : l.source || '-';
        const label = by === 'owner' ? name(c, l.owner, 'Unassigned') || 'Unassigned' : by === 'branch' ? branchName(c, l.branch) || '(no branch)' : key === '-' ? '(none)' : key;
        const r = bump(rows, key, () => ({ group: label, leads: 0, open: 0, won: 0, lost: 0, rate: 0, pipeline: 0, wonValue: 0, ...(by === 'owner' && l.owner ? { href: '/team/' + l.owner } : {}) }));
        add(r, 'leads', 1);
        if (l.stage === 'won') { add(r, 'won', 1); add(r, 'wonValue', l.value); }
        else if (l.stage === 'lost') add(r, 'lost', 1);
        else { add(r, 'open', 1); add(r, 'pipeline', l.value); }
      }
      const list = [...rows.values()].map((r): Row => ({ ...r, rate: pct(Number(r.won), Number(r.won) + Number(r.lost)) })).sort((a, b) => Number(b.leads) - Number(a.leads));
      const won = sumOf(list, 'won'); const lost = sumOf(list, 'lost');
      return {
        columns: [
          { key: 'group', label: by === 'owner' ? 'Owner' : by === 'type' ? 'Property type' : by === 'branch' ? 'Branch' : 'Source', type: 'text' },
          { key: 'leads', label: 'Leads', type: 'int' },
          { key: 'open', label: 'Open', type: 'int' },
          { key: 'won', label: 'Won', type: 'int' },
          { key: 'lost', label: 'Lost', type: 'int' },
          { key: 'rate', label: 'Win rate', type: 'pct' },
          { key: 'pipeline', label: 'Open pipeline', type: 'money' },
          { key: 'wonValue', label: 'Won value', type: 'money' },
        ],
        rows: list,
        totals: { group: 'Total', leads: sumOf(list, 'leads'), open: sumOf(list, 'open'), won, lost, rate: pct(won, won + lost), pipeline: sumOf(list, 'pipeline'), wonValue: sumOf(list, 'wonValue') },
        stats: [
          { label: 'Leads', value: sumOf(list, 'leads'), type: 'int' },
          { label: 'Won', value: won, type: 'int' },
          { label: 'Win rate', value: pct(won, won + lost), type: 'pct' },
          { label: 'Open pipeline', value: sumOf(list, 'pipeline'), type: 'money' },
        ],
        filterText: ['By ' + (by === 'type' ? 'property type' : by)],
        note: 'A lead’s value is its wanted services at catalogue prices. Win rate = won ÷ (won + lost).',
      };
    },
  },
  {
    key: 'audit-results', title: 'Audit results', section: 'Operations', range: 'period', needs: ['audits'],
    description: 'Site audits dated in the range: the score, the auditor, and how many findings are still open.',
    run(c) {
      const list = (c.x.audits || []).filter((a) => inRange(a.date, c.from, c.to))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a): Row => ({
          id: a.id, date: a.date, customer: clientName(c, a.clientId), auditor: a.auditor, score: a.score, status: a.status,
          findings: a.findings.length, open: a.findings.filter((f) => !f.closed).length,
          severe: a.findings.filter((f) => String(f.severity || '').toLowerCase() === 'high' || String(f.severity || '').toLowerCase() === 'critical').length,
        }));
      return {
        columns: [
          { key: 'id', label: 'Audit', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'auditor', label: 'Auditor', type: 'text', tight: true },
          { key: 'score', label: 'Score', type: 'int' },
          { key: 'status', label: 'Status', type: 'text', tight: true },
          { key: 'findings', label: 'Findings', type: 'int' },
          { key: 'open', label: 'Open', type: 'int' },
          { key: 'severe', label: 'High severity', type: 'int' },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' audits', score: list.length ? r0(list.reduce((s, r) => s + Number(r.score), 0) / list.length) : 0, findings: sumOf(list, 'findings'), open: sumOf(list, 'open'), severe: sumOf(list, 'severe') },
        stats: [
          { label: 'Audits', value: list.length, type: 'int' },
          { label: 'Average score', value: list.length ? r0(list.reduce((s, r) => s + Number(r.score), 0) / list.length) : 0, type: 'int' },
          { label: 'Open findings', value: sumOf(list, 'open'), type: 'int' },
        ],
        note: 'The score in the totals row is the average.',
      };
    },
  },

  /* ================================================================ MONEY */
  {
    key: 'income-vs-spend', title: 'Income vs spend', section: 'Money', range: 'period', needs: ['expenses', 'purchases'],
    description: 'Month by month: what was invoiced and collected against staff expenses approved and purchases received. Not an accounting P&L.',
    run(c) {
      const rows = new Map<string, Row>();
      const row = (ym: string) => bump(rows, ym, () => ({ month: monthLabel(ym), invoiced: 0, collected: 0, expenses: 0, purchases: 0, net: 0, _k: ym }));
      for (const i of c.invoices) {
        if (issued(i) && inRange(i.date, c.from, c.to)) add(row(i.date.slice(0, 7)), 'invoiced', i.taxable);
        for (const p of i.payments) if (inRange(p.date, c.from, c.to)) add(row(p.date.slice(0, 7)), 'collected', p.amount);
      }
      for (const e of c.x.expenses || []) if (ACCEPTED.has(e.status) && inRange(e.date, c.from, c.to)) add(row(e.date.slice(0, 7)), 'expenses', e.amount);
      for (const p of c.x.purchases || []) {
        if (p.status !== 'received' && p.status !== 'partial') continue;
        const d = (p.receivedAt || p.date).slice(0, 10);
        if (inRange(d, c.from, c.to)) add(row(d.slice(0, 7)), 'purchases', poMoney(c, p).received);
      }
      const list = [...rows.values()].sort((a, b) => String(a._k).localeCompare(String(b._k)))
        .map(({ _k, ...r }): Row => ({ ...r, invoiced: r0(Number(r.invoiced)), purchases: r0(Number(r.purchases)), net: r0(Number(r.invoiced) - Number(r.expenses) - Number(r.purchases)) }));
      return {
        columns: [
          { key: 'month', label: 'Month', type: 'text', tight: true },
          { key: 'invoiced', label: 'Invoiced (ex GST)', type: 'money' },
          { key: 'collected', label: 'Collected', type: 'money' },
          { key: 'expenses', label: 'Staff expenses', type: 'money' },
          { key: 'purchases', label: 'Purchases received', type: 'money' },
          { key: 'net', label: 'Net', type: 'money' },
        ],
        rows: list,
        totals: { month: 'Total', invoiced: sumOf(list, 'invoiced'), collected: sumOf(list, 'collected'), expenses: sumOf(list, 'expenses'), purchases: sumOf(list, 'purchases'), net: sumOf(list, 'net') },
        stats: [
          { label: 'Invoiced (ex GST)', value: sumOf(list, 'invoiced'), type: 'money' },
          { label: 'Collected', value: sumOf(list, 'collected'), type: 'money' },
          { label: 'Staff expenses', value: sumOf(list, 'expenses'), type: 'money' },
          { label: 'Purchases', value: sumOf(list, 'purchases'), type: 'money' },
          { label: 'Net', value: sumOf(list, 'net'), type: 'money' },
        ],
        note: 'Net = invoiced − approved staff expenses − purchases received. Salaries, rent and vendor bills are not recorded in the app, so this is not a profit figure.',
      };
    },
  },
  {
    key: 'day-book', title: 'Day book', section: 'Money', range: 'period', needs: ['expenses', 'purchases'],
    description: 'Every money event in date order: invoices raised, receipts taken, expenses paid out, purchases received.',
    landscape: true,
    run(c) {
      const list: Row[] = [];
      for (const i of c.invoices) {
        if (issued(i) && inRange(i.date, c.from, c.to)) list.push({ date: i.date, ord: 0, type: 'Invoice', doc: i.id, party: i.clientName, branch: '', billed: i.total, received: '', spent: '', href: '/invoices/' + i.id });
        for (const p of i.payments) if (inRange(p.date, c.from, c.to)) list.push({ date: p.date, ord: 1, type: 'Receipt · ' + p.mode, doc: p.id, party: i.clientName, branch: '', billed: '', received: p.amount, spent: '', href: '/invoices/' + i.id });
      }
      for (const e of c.x.expenses || []) {
        for (const p of e.payments || []) {
          const d = String(p.at || '').slice(0, 10);
          if (inRange(d, c.from, c.to)) list.push({ date: d, ord: 2, type: 'Expense paid · ' + (p.mode || e.payMode || ''), doc: e.id, party: name(c, e.userId), branch: branchName(c, e.branch), billed: '', received: '', spent: Number(p.amount) || 0, href: '/expenses/' + e.id });
        }
      }
      for (const p of c.x.purchases || []) {
        if (p.status !== 'received' && p.status !== 'partial') continue;
        const d = (p.receivedAt || p.date).slice(0, 10);
        if (inRange(d, c.from, c.to)) list.push({ date: d, ord: 3, type: 'Purchase received', doc: p.id, party: p.vendorName, branch: branchName(c, p.branch), billed: '', received: '', spent: r0(poMoney(c, p).received), href: '/purchase-orders/' + p.id });
      }
      list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.ord) - Number(b.ord) || String(a.doc).localeCompare(String(b.doc)));
      const rows = list.map(({ ord, ...r }): Row => r);
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'type', label: 'Event', type: 'text', tight: true },
          { key: 'doc', label: 'Document', type: 'text', tight: true },
          { key: 'party', label: 'Party', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text', tight: true },
          { key: 'billed', label: 'Billed', type: 'money' },
          { key: 'received', label: 'Received', type: 'money' },
          { key: 'spent', label: 'Paid out', type: 'money' },
        ],
        rows,
        totals: { date: '', type: 'Total', party: rows.length + ' events', billed: sumOf(rows, 'billed'), received: sumOf(rows, 'received'), spent: sumOf(rows, 'spent') },
        stats: [
          { label: 'Billed', value: sumOf(rows, 'billed'), type: 'money' },
          { label: 'Received', value: sumOf(rows, 'received'), type: 'money' },
          { label: 'Paid out', value: sumOf(rows, 'spent'), type: 'money' },
        ],
        note: 'Paid out = expense payouts on the day they were paid, plus purchases on the day they were received (their ordered rate). Vendor payments are not recorded.',
      };
    },
  },
  {
    key: 'cash-settlement', title: 'Cash settlement', section: 'Money', range: 'period',
    description: 'Cash each technician collected on site in the range, how much of it has been handed in, and what they are holding right now.',
    run(c) {
      const rows = new Map<string, Row>(); const oldest = new Map<string, string>();
      for (const i of c.invoices) {
        for (const p of i.payments) {
          if (p.mode !== 'Cash' || !p.by) continue;
          const r = bump(rows, p.by, () => ({ tech: name(c, p.by), collected: 0, handed: 0, pending: 0, inHand: 0, oldest: '', href: '/team/' + p.by }));
          if (inRange(p.date, c.from, c.to)) { add(r, 'collected', p.amount); add(r, p.settled ? 'handed' : 'pending', p.amount); }
          if (!p.settled) { add(r, 'inHand', p.amount); if (!oldest.get(p.by) || p.date < String(oldest.get(p.by))) oldest.set(p.by, p.date); }
        }
      }
      const list = [...rows.entries()].map(([id, r]): Row => ({ ...r, oldest: oldest.get(id) || '' })).filter((r) => Number(r.collected) > 0 || Number(r.inHand) > 0).sort((a, b) => Number(b.inHand) - Number(a.inHand));
      return {
        columns: [
          { key: 'tech', label: 'Technician', type: 'text' },
          { key: 'collected', label: 'Cash collected', type: 'money' },
          { key: 'handed', label: 'Handed in', type: 'money' },
          { key: 'pending', label: 'Not yet handed in', type: 'money' },
          { key: 'inHand', label: 'Holding now (all time)', type: 'money' },
          { key: 'oldest', label: 'Oldest unsettled', type: 'date' },
        ],
        rows: list,
        totals: { tech: 'Total', collected: sumOf(list, 'collected'), handed: sumOf(list, 'handed'), pending: sumOf(list, 'pending'), inHand: sumOf(list, 'inHand') },
        stats: [
          { label: 'Cash collected', value: sumOf(list, 'collected'), type: 'money' },
          { label: 'Handed in', value: sumOf(list, 'handed'), type: 'money' },
          { label: 'Held by technicians now', value: sumOf(list, 'inHand'), type: 'money' },
        ],
        note: 'Cash receipts only. "Holding now" counts every unsettled cash receipt whatever its date.',
      };
    },
  },
  {
    key: 'advances-credits', title: 'Advances and credits', section: 'Receivables', range: 'now', needs: ['credits' as Need],
    description: 'Money customers paid ahead or overpaid: how much was taken, how much has been applied to invoices, and what is still theirs to use.',
    run(c) {
      const list = ((c.x as Extra & { credits?: CreditRow[] }).credits || []).map((k): Row => ({
        date: isoDay(k.createdAt), customer: clientName(c, k.clientId), source: k.source, contract: k.contractId,
        amount: r0(k.amount / 100), used: r0(k.used / 100), available: r0((k.amount - k.used) / 100), note: k.note, href: '/customers/' + k.clientId,
      })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return {
        columns: [
          { key: 'date', label: 'Taken on', type: 'date' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'source', label: 'Kind', type: 'text', tight: true },
          { key: 'contract', label: 'Contract', type: 'text', tight: true },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'used', label: 'Applied', type: 'money' },
          { key: 'available', label: 'Available', type: 'money' },
          { key: 'note', label: 'Note', type: 'text' },
        ],
        rows: list,
        totals: { date: '', customer: 'Total', amount: sumOf(list, 'amount'), used: sumOf(list, 'used'), available: sumOf(list, 'available') },
        stats: [
          { label: 'Credits', value: list.length, type: 'int' },
          { label: 'Taken', value: sumOf(list, 'amount'), type: 'money' },
          { label: 'Applied', value: sumOf(list, 'used'), type: 'money' },
          { label: 'Available', value: sumOf(list, 'available'), type: 'money' },
        ],
      };
    },
  },

  /* ============================================================= ACTIVITY */
  {
    key: 'activity-log', title: 'Activity log', section: 'Activity', range: 'period', needs: ['notes'],
    description: 'Every notice the system sent in the range: approvals, payments, trips landing, tasks, reminders. Who it went to and when.',
    run(c) {
      const list = (c.x.notes || []).filter((n) => inRange(n.at.slice(0, 10), c.from, c.to))
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .slice(0, 3000)
        .map((n): Row => ({ at: n.at, to: n.userId ? name(c, n.userId) : 'Everyone', text: n.text }));
      return {
        columns: [
          { key: 'at', label: 'When', type: 'text', tight: true },
          { key: 'to', label: 'To', type: 'text', tight: true },
          { key: 'text', label: 'What happened', type: 'text' },
        ],
        rows: list,
        stats: [
          { label: 'Notices', value: list.length, type: 'int' },
          { label: 'People reached', value: new Set(list.map((r) => r.to)).size, type: 'int' },
        ],
        note: 'The app keeps no separate audit trail; this is the notice feed, capped at 3,000 rows.',
      };
    },
  },
];

type Inv2 = Ctx['invoices'][number];
interface CreditRow { clientId: string; amount: number; used: number; source: string; contractId: string; note: string; createdAt: Date }

/* ----------------------------------------------------------- the loaders */

/** Load only the books the report asked for, inside the branch scope. */
export async function loadExtra(prisma: PrismaService, trips: TripsService, p: RunParams, needs: Need[], userBranches: Map<string, string[]>, clientBranch: Map<string, string>): Promise<Extra> {
  const x: Extra & { credits?: CreditRow[] } = {};
  const bw = p.scope === null ? {} : { branch: { in: p.scope } };
  const want = new Set(needs);
  const inScope = (b: string) => p.scope === null || p.scope.includes(b);
  const jobs: Array<Promise<void>> = [];

  if (want.has('expenses')) jobs.push(prisma.expense.findMany({ where: bw }).then((rows) => {
    x.expenses = rows.map((e) => ({
      id: e.id, reportId: e.reportId, userId: e.userId, branch: e.branch, date: e.date, category: e.category, merchant: e.merchant, note: e.note,
      amount: e.amount, km: e.km, rate: e.rate, source: e.source, tripId: e.tripId, status: e.status, approvedBy: e.approvedBy, rejectedBy: e.rejectedBy,
      reviewedAt: e.reviewedAt, paidAt: e.paidAt, payMode: e.payMode, paidAmount: e.paidAmount,
      payments: (Array.isArray(e.payments) ? e.payments : []) as ExpenseRowPayments,
    }));
  }));
  if (want.has('trips')) jobs.push(Promise.all([
    prisma.trip.findMany({ where: { ...bw, status: { not: 'active' } }, select: { id: true, userId: true, branch: true, purpose: true, dest: true, status: true, startAt: true, endAt: true, distanceM: true, review: true, flagged: true, claimId: true, jobId: true } }),
    trips.rateFn(),
  ]).then(([rows, rf]) => { x.trips = rows; x.rateOf = rf.rateOf; }));
  if (want.has('purchases')) jobs.push(prisma.purchaseOrder.findMany({ where: bw, include: { items: true, vendor: { select: { name: true } } } }).then((rows) => {
    x.purchases = rows.map((o) => ({
      id: o.id, vendorId: o.vendorId, vendorName: o.vendor?.name || o.vendorId, date: o.date, expected: o.expected, status: o.status, branch: o.branch,
      placeOfSupply: o.placeOfSupply, discount: o.discount, raisedBy: o.raisedBy, receivedAt: o.receivedAt,
      items: o.items.map((l) => ({ itemId: l.itemId, name: l.name, cat: l.cat, baseUnit: l.baseUnit, packUnit: l.packUnit, packSize: l.packSize, qty: l.qty, rate: l.rate, receivedQty: l.receivedQty })),
    }));
  }));
  if (want.has('stock')) jobs.push(Promise.all([
    prisma.inventoryItem.findMany({ select: { id: true, name: true, cat: true, unit: true, stock: true, reorder: true, lastRate: true, lastPackUnit: true, lastPackSize: true } }),
    prisma.branchStock.findMany({ select: { branchId: true, itemId: true, qty: true, reorder: true } }),
    prisma.techStock.findMany({ select: { userId: true, itemId: true, qty: true } }),
    prisma.stockMove.findMany({ where: p.scope === null ? {} : { branchId: { in: p.scope } }, select: { itemId: true, branchId: true, date: true, qty: true, dir: true, jobId: true, poId: true, note: true } }),
  ]).then(([items, branchStock, techStock, moves]) => { x.stock = { items, branchStock, techStock, moves }; }));
  if (want.has('jobs')) jobs.push(prisma.job.findMany({ where: bw }).then((rows) => {
    x.jobs = rows.map((j) => ({
      id: j.id, type: j.type, contractId: j.contractId, clientId: j.clientId, branch: j.branch, serviceIds: j.serviceIds, date: j.date, slot: j.slot,
      mins: j.mins, techIds: j.techIds, headTechId: j.headTechId, status: j.status, invoiceId: j.invoiceId,
      exec: (j.exec && typeof j.exec === 'object' ? j.exec : null) as JobRow['exec'],
    }));
  }));
  if (want.has('contracts')) jobs.push(prisma.contract.findMany({ where: bw, include: { plan: true } }).then((rows) => {
    x.contracts = rows.map((k) => ({
      id: k.id, clientId: k.clientId, mode: k.mode, start: k.start, end: k.end, months: k.months, billing: k.billing, value: k.value, owner: k.owner,
      branch: k.branch, billingMode: k.billingMode, billingAmount: k.billingAmount, totalVisits: k.totalVisits, slot: k.slot,
      mergeSameDay: k.mergeSameDay, workdaysOnly: k.workdaysOnly, blackout: k.blackout, createdAt: k.createdAt,
      plan: k.plan as unknown as ContractRow['plan'],
    }));
  }));
  if (want.has('leads')) jobs.push(prisma.lead.findMany({ where: bw, select: { id: true, name: true, type: true, source: true, stage: true, value: true, owner: true, branch: true, clientId: true, contractId: true, createdAt: true } }).then((rows) => { x.leads = rows; }));
  if (want.has('audits')) jobs.push(prisma.audit.findMany().then((rows) => {
    x.audits = rows.filter((a) => inScope(clientBranch.get(a.clientId) || '')).map((a) => ({
      id: a.id, clientId: a.clientId, date: a.date, auditor: a.auditor, score: a.score, status: a.status,
      findings: (Array.isArray(a.findings) ? a.findings : []) as AuditRowFindings,
    }));
  }));
  if (want.has('notes')) jobs.push(prisma.notification.findMany({ select: { id: true, userId: true, at: true, text: true }, orderBy: { id: 'desc' }, take: 20000 }).then((rows) => {
    x.notes = rows.filter((n) => p.scope === null || !n.userId || (userBranches.get(n.userId) || []).some((b) => p.scope!.includes(b)));
  }));
  if (want.has('credits' as Need)) jobs.push(prisma.customerCredit.findMany().then((rows) => {
    x.credits = rows.filter((k) => inScope(clientBranch.get(k.clientId) || ''));
  }));
  await Promise.all(jobs);
  return x;
}

type ExpenseRowPayments = Array<{ at?: string; amount?: number; mode?: string; by?: string }>;
type AuditRowFindings = Array<{ severity?: string; closed?: boolean }>;
type ContractRow = import('./report-base').ContractRow;
type JobRow = import('./report-base').JobRow;

/** Distinct expense categories, for the details report's dropdown. */
export async function expenseCategoryOptions(prisma: PrismaService) {
  const rows = await prisma.expense.findMany({ select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
  return [{ key: '', label: 'Every category' }, ...rows.filter((r) => r.category).map((r) => ({ key: r.category, label: r.category }))];
}

export { BadRequestException, niceDate };
