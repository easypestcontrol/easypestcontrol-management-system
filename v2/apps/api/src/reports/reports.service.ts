/* ============================================================================
   The report engine — money in.

   Every report here is one function over the same loaded books: invoices with
   their totals worked out the way the invoice screen works them out
   (docTotals, then paid and balance from the receipts), receipts, customers,
   quotations. The function returns columns, rows, a totals row and a few
   headline figures; the viewer, the PDF, the spreadsheet and the CSV are all
   drawn from that and know nothing about invoices.

   Two kinds of range, because Zoho's reports split the same way:
     period — what happened between two dates (invoices raised, money taken)
     as of  — where things stood on a date (balances, ageing)

   Drafts and cancelled invoices are out of every total: a draft is not a
   sale yet and a cancelled one never was. The status the rows show is the
   DERIVED one (paid / partial / overdue / sent), never the stored column,
   exactly as the invoice list derives it.
   ========================================================================== */
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { daysBetween, docTotals, money } from 'shared';
import { PrismaService } from '../prisma.service';
import { TripsService } from '../trips/trips.service';
import type { Col, FilterSpec, ReportMeta, ReportResult, Row, RunParams } from './report.types';
import {
  BUCKETS, Ctx, Def, Inv, Item, Need, SAC, bucketOf, inRange, issued, monthLabel, niceDate, r0, r1,
} from './report-base';
import { MORE_DEFS, expenseCategoryOptions, loadExtra } from './reports-more';

const STATUS_FILTER: FilterSpec = {
  key: 'status', label: 'Status', kind: 'select',
  options: [
    { key: '', label: 'Every status' }, { key: 'open', label: 'Open (unpaid)' },
    { key: 'sent', label: 'Sent' }, { key: 'partial', label: 'Part paid' },
    { key: 'overdue', label: 'Overdue' }, { key: 'paid', label: 'Paid' },
    { key: 'draft', label: 'Draft' }, { key: 'cancelled', label: 'Cancelled' },
  ],
};

const DEFS: Def[] = [
  /* ================================================================ SALES */
  {
    key: 'sales-by-customer', title: 'Sales by customer', section: 'Sales', range: 'period',
    description: 'What each customer was invoiced in the range, with GST, and how much of it has come in.',
    run(c) {
      const rows = new Map<string, Row & { n: number }>();
      for (const i of c.invoices.filter((x) => issued(x) && inRange(x.date, c.from, c.to))) {
        const r = rows.get(i.clientId) || {
          customer: i.clientName, invoices: 0, taxable: 0, gst: 0, total: 0, paid: 0, balance: 0,
          href: '/customers/' + i.clientId, n: 0,
        };
        r.invoices = (r.invoices as number) + 1;
        r.taxable = (r.taxable as number) + i.taxable;
        r.gst = (r.gst as number) + i.gst;
        r.total = (r.total as number) + i.total;
        r.paid = (r.paid as number) + i.paid;
        r.balance = (r.balance as number) + i.balance;
        rows.set(i.clientId, r);
      }
      const list = [...rows.values()].sort((a, b) => (b.total as number) - (a.total as number));
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'invoices', label: 'Invoices', type: 'int' },
          { key: 'taxable', label: 'Sales', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Sales incl. GST', type: 'money' },
          { key: 'paid', label: 'Received', type: 'money' },
          { key: 'balance', label: 'Balance', type: 'money' },
        ],
        rows: list.map(({ n: _n, ...r }): Row => ({ ...r, taxable: r0(r.taxable as number), gst: r0(r.gst as number) })),
        totals: { customer: 'Total', invoices: sum('invoices'), taxable: sum('taxable'), gst: sum('gst'), total: sum('total'), paid: sum('paid'), balance: sum('balance') },
        stats: [
          { label: 'Customers billed', value: list.length, type: 'int' },
          { label: 'Sales', value: sum('taxable'), type: 'money' },
          { label: 'GST', value: sum('gst'), type: 'money' },
          { label: 'Sales incl. GST', value: sum('total'), type: 'money' },
        ],
        note: 'Issued invoices dated in the range. Received and Balance are against those invoices, to date.',
      };
    },
  },
  {
    key: 'sales-by-service', title: 'Sales by service', section: 'Sales', range: 'period',
    description: 'Every service line invoiced in the range: how many, for how much, at what average rate.',
    run(c) {
      const rows = new Map<string, { service: string; code: string; invs: Set<string>; qty: number; amount: number }>();
      for (const i of c.invoices.filter((x) => issued(x) && inRange(x.date, c.from, c.to))) {
        for (const it of i.items) {
          const sv = it.svId ? c.services.get(it.svId) : undefined;
          const key = it.svId || 'desc:' + String(it.desc || '').trim().toLowerCase();
          const r = rows.get(key) || { service: sv?.name || String(it.desc || '').trim() || '(no description)', code: sv?.code || '', invs: new Set<string>(), qty: 0, amount: 0 };
          r.invs.add(i.id);
          r.qty += Number(it.qty) || 0;
          r.amount += (Number(it.qty) || 0) * (Number(it.rate) || 0);
          rows.set(key, r);
        }
      }
      const list = [...rows.values()].sort((a, b) => b.amount - a.amount).map((r) => ({
        service: r.service, code: r.code, invoices: r.invs.size, qty: r.qty, amount: r0(r.amount),
        avg: r.qty ? r0(r.amount / r.qty) : 0,
      }));
      const qty = list.reduce((s, r) => s + r.qty, 0);
      const amount = r0(list.reduce((s, r) => s + r.amount, 0));
      return {
        columns: [
          { key: 'service', label: 'Service', type: 'text' },
          { key: 'code', label: 'Code', type: 'text', tight: true },
          { key: 'invoices', label: 'Invoices', type: 'int' },
          { key: 'qty', label: 'Quantity', type: 'num' },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'avg', label: 'Average rate', type: 'money' },
        ],
        rows: list,
        totals: { service: 'Total', invoices: '', qty, amount, avg: qty ? r0(amount / qty) : 0 },
        stats: [
          { label: 'Services sold', value: list.length, type: 'int' },
          { label: 'Units', value: qty, type: 'num' },
          { label: 'Amount', value: amount, type: 'money' },
        ],
        note: 'Line amounts before invoice discount and before GST.',
      };
    },
  },
  {
    key: 'sales-by-salesperson', title: 'Sales by salesperson', section: 'Sales', range: 'period',
    description: 'Invoices in the range credited to the person who owns the contract, the quotation or the lead.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const i of c.invoices.filter((x) => issued(x) && inRange(x.date, c.from, c.to))) {
        const owner = i.owner || '';
        const key = owner || '—';
        const r = rows.get(key) || {
          person: owner ? c.users.get(owner) || owner : 'Unassigned', invoices: 0, taxable: 0, gst: 0, total: 0,
          ...(owner ? { href: '/team/' + owner } : {}),
        };
        r.invoices = (r.invoices as number) + 1;
        r.taxable = (r.taxable as number) + i.taxable;
        r.gst = (r.gst as number) + i.gst;
        r.total = (r.total as number) + i.total;
        rows.set(key, r);
      }
      const list = [...rows.values()].sort((a, b) => (b.total as number) - (a.total as number))
        .map((r): Row => ({ ...r, taxable: r0(r.taxable as number), gst: r0(r.gst as number) }));
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'person', label: 'Salesperson', type: 'text' },
          { key: 'invoices', label: 'Invoices', type: 'int' },
          { key: 'taxable', label: 'Sales', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Sales incl. GST', type: 'money' },
        ],
        rows: list,
        totals: { person: 'Total', invoices: sum('invoices'), taxable: sum('taxable'), gst: sum('gst'), total: sum('total') },
        stats: [
          { label: 'Salespeople', value: list.filter((r) => r.person !== 'Unassigned').length, type: 'int' },
          { label: 'Sales', value: sum('taxable'), type: 'money' },
          { label: 'Sales incl. GST', value: sum('total'), type: 'money' },
        ],
        note: "An invoice is credited to its contract's owner, else the owner of the customer's latest quotation, else the lead's owner.",
      };
    },
  },
  {
    key: 'sales-summary', title: 'Sales summary', section: 'Sales', range: 'period',
    description: 'Invoices raised and money collected, day by day or month by month.',
    filters: [{
      key: 'group', label: 'Group by', kind: 'select',
      options: [{ key: '', label: 'Automatic' }, { key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }],
    }],
    run(c) {
      const span = daysBetween(c.from, c.to);
      const by = c.filters.group === 'day' || c.filters.group === 'month' ? c.filters.group : span > 62 ? 'month' : 'day';
      const keyOf = (d: string) => (by === 'day' ? d : d.slice(0, 7));
      const labelOf = (k: string) => (by === 'day' ? niceDate(k) : monthLabel(k));
      const rows = new Map<string, Row>();
      const blank = (k: string): Row => ({ period: labelOf(k), invoices: 0, taxable: 0, gst: 0, total: 0, collected: 0, _k: k });
      for (const i of c.invoices) {
        if (issued(i) && inRange(i.date, c.from, c.to)) {
          const k = keyOf(i.date);
          const r = rows.get(k) || blank(k);
          r.invoices = (r.invoices as number) + 1;
          r.taxable = (r.taxable as number) + i.taxable;
          r.gst = (r.gst as number) + i.gst;
          r.total = (r.total as number) + i.total;
          rows.set(k, r);
        }
        for (const p of i.payments) {
          if (!inRange(p.date, c.from, c.to)) continue;
          const k = keyOf(p.date);
          const r = rows.get(k) || blank(k);
          r.collected = (r.collected as number) + p.amount;
          rows.set(k, r);
        }
      }
      const list = [...rows.values()].sort((a, b) => String(a._k).localeCompare(String(b._k)))
        .map(({ _k, ...r }): Row => ({ ...r, taxable: r0(r.taxable as number), gst: r0(r.gst as number) }));
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'period', label: by === 'day' ? 'Day' : 'Month', type: 'text', tight: true },
          { key: 'invoices', label: 'Invoices', type: 'int' },
          { key: 'taxable', label: 'Sales', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Billed incl. GST', type: 'money' },
          { key: 'collected', label: 'Collected', type: 'money' },
        ],
        rows: list,
        totals: { period: 'Total', invoices: sum('invoices'), taxable: sum('taxable'), gst: sum('gst'), total: sum('total'), collected: sum('collected') },
        stats: [
          { label: 'Invoices', value: sum('invoices'), type: 'int' },
          { label: 'Sales', value: sum('taxable'), type: 'money' },
          { label: 'Billed incl. GST', value: sum('total'), type: 'money' },
          { label: 'Collected', value: sum('collected'), type: 'money' },
        ],
        filterText: ['By ' + by],
        note: 'Collected counts every receipt dated in the period, whichever invoice it settles.',
      };
    },
  },

  /* ========================================================== RECEIVABLES */
  {
    key: 'invoice-details', title: 'Invoice details', section: 'Receivables', range: 'period',
    description: 'Every invoice dated in the range with its status, totals, what is paid and what is still owed.',
    filters: [STATUS_FILTER], landscape: true,
    run(c) {
      const st = c.filters.status || '';
      const list = c.invoices
        .filter((i) => inRange(i.date, c.from, c.to))
        .filter((i) => !st || (st === 'open' ? issued(i) && i.status !== 'paid' : i.status === st))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .map((i) => ({
          id: i.id, date: i.date, due: i.due, customer: i.clientName, kind: i.kind, status: i.status,
          taxable: r0(i.taxable), gst: r0(i.gst), total: i.total, paid: i.paid, balance: i.balance,
          late: issued(i) && i.status !== 'paid' ? Math.max(0, daysBetween(i.due, c.today)) : 0,
          href: '/invoices/' + i.id,
        }));
      const live = list.filter((r) => r.status !== 'draft' && r.status !== 'cancelled');
      const sum = (k: 'taxable' | 'gst' | 'total' | 'paid' | 'balance') => r0(live.reduce((s, r) => s + r[k], 0));
      return {
        columns: [
          { key: 'id', label: 'Invoice', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'due', label: 'Due', type: 'date' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'kind', label: 'Kind', type: 'text', tight: true },
          { key: 'status', label: 'Status', type: 'text', tight: true },
          { key: 'taxable', label: 'Taxable', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
          { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'balance', label: 'Balance', type: 'money' },
          { key: 'late', label: 'Days late', type: 'days' },
        ],
        rows: list,
        totals: { id: 'Total', customer: live.length + ' issued', taxable: sum('taxable'), gst: sum('gst'), total: sum('total'), paid: sum('paid'), balance: sum('balance') },
        stats: [
          { label: 'Invoices', value: list.length, type: 'int' },
          { label: 'Billed', value: sum('total'), type: 'money' },
          { label: 'Paid', value: sum('paid'), type: 'money' },
          { label: 'Balance', value: sum('balance'), type: 'money' },
        ],
        filterText: st ? ['Status: ' + (STATUS_FILTER.options?.find((o) => o.key === st)?.label || st)] : [],
        note: 'Totals count issued invoices only; drafts and cancelled invoices are listed but not added.',
      };
    },
  },
  {
    key: 'customer-balance', title: 'Customer balance summary', section: 'Receivables', range: 'asOf',
    description: 'Where every customer stood on the date: opening balance, invoiced, received, and what is owed.',
    run(c) {
      const rows = new Map<string, Row>();
      const start = (id: string): Row => {
        const cl = c.clients.get(id);
        return { customer: cl?.name || id, opening: cl?.openingBalance || 0, invoiced: 0, received: 0, balance: 0, href: '/customers/' + id };
      };
      for (const i of c.invoices.filter((x) => issued(x) && x.date <= c.to)) {
        const r = rows.get(i.clientId) || start(i.clientId);
        r.invoiced = (r.invoiced as number) + i.total;
        r.received = (r.received as number) + i.payments.filter((p) => p.date <= c.to).reduce((s, p) => s + p.amount, 0);
        rows.set(i.clientId, r);
      }
      for (const cl of c.clients.values()) {
        if (cl.openingBalance && !rows.has(cl.id)) rows.set(cl.id, start(cl.id));
      }
      const list = [...rows.values()].map((r): Row => ({
        ...r, balance: (r.opening as number) + (r.invoiced as number) - (r.received as number),
      })).sort((a, b) => (b.balance as number) - (a.balance as number));
      const sum = (k: 'opening' | 'invoiced' | 'received' | 'balance') => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'opening', label: 'Opening balance', type: 'money' },
          { key: 'invoiced', label: 'Invoiced', type: 'money' },
          { key: 'received', label: 'Received', type: 'money' },
          { key: 'balance', label: 'Balance', type: 'money' },
        ],
        rows: list,
        totals: { customer: 'Total', opening: sum('opening'), invoiced: sum('invoiced'), received: sum('received'), balance: sum('balance') },
        stats: [
          { label: 'Customers', value: list.length, type: 'int' },
          { label: 'Invoiced to date', value: sum('invoiced'), type: 'money' },
          { label: 'Received to date', value: sum('received'), type: 'money' },
          { label: 'Balance owed', value: sum('balance'), type: 'money' },
        ],
        note: 'Balance = opening balance + issued invoices − receipts, everything dated on or before the date.',
      };
    },
  },
  {
    key: 'ageing-summary', title: 'Receivables ageing summary', section: 'Receivables', range: 'asOf',
    description: 'Open invoice balances per customer, by how late they were on the date.',
    run(c) {
      const rows = new Map<string, Row>();
      for (const i of c.invoices.filter((x) => issued(x) && x.date <= c.to)) {
        const paid = i.payments.filter((p) => p.date <= c.to).reduce((s, p) => s + p.amount, 0);
        const bal = Math.max(0, i.total - paid);
        if (bal <= 0.5) continue;
        const r = rows.get(i.clientId) || { customer: i.clientName, b0: 0, b1: 0, b2: 0, b3: 0, total: 0, href: '/customers/' + i.clientId };
        const k = 'b' + bucketOf(daysBetween(i.due, c.to));
        r[k] = (r[k] as number) + bal;
        r.total = (r.total as number) + bal;
        rows.set(i.clientId, r);
      }
      const list = [...rows.values()].sort((a, b) => (b.total as number) - (a.total as number))
        .map((r): Row => ({ ...r, b0: r0(r.b0 as number), b1: r0(r.b1 as number), b2: r0(r.b2 as number), b3: r0(r.b3 as number), total: r0(r.total as number) }));
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'b0', label: BUCKETS[0], type: 'money' },
          { key: 'b1', label: BUCKETS[1], type: 'money' },
          { key: 'b2', label: BUCKETS[2], type: 'money' },
          { key: 'b3', label: BUCKETS[3], type: 'money' },
          { key: 'total', label: 'Total owed', type: 'money' },
        ],
        rows: list,
        totals: { customer: 'Total', b0: sum('b0'), b1: sum('b1'), b2: sum('b2'), b3: sum('b3'), total: sum('total') },
        stats: [
          { label: 'Customers owing', value: list.length, type: 'int' },
          { label: 'Outstanding', value: sum('total'), type: 'money' },
          { label: 'Overdue', value: sum('b1') + sum('b2') + sum('b3'), type: 'money' },
          { label: 'Over 60 days', value: sum('b3'), type: 'money' },
        ],
      };
    },
  },
  {
    key: 'ageing-details', title: 'Receivables ageing details', section: 'Receivables', range: 'asOf',
    description: 'Every open invoice on the date, oldest debt first.',
    run(c) {
      const list: Row[] = [];
      for (const i of c.invoices.filter((x) => issued(x) && x.date <= c.to)) {
        const paid = i.payments.filter((p) => p.date <= c.to).reduce((s, p) => s + p.amount, 0);
        const bal = Math.max(0, i.total - paid);
        if (bal <= 0.5) continue;
        const late = daysBetween(i.due, c.to);
        list.push({
          id: i.id, date: i.date, due: i.due, customer: i.clientName, late: Math.max(0, late),
          bucket: BUCKETS[bucketOf(late)], total: i.total, paid, balance: r0(bal), href: '/invoices/' + i.id,
        });
      }
      list.sort((a, b) => (b.late as number) - (a.late as number));
      const sum = (k: 'total' | 'paid' | 'balance') => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'id', label: 'Invoice', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'due', label: 'Due', type: 'date' },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'late', label: 'Days late', type: 'days' },
          { key: 'bucket', label: 'Bucket', type: 'text', tight: true },
          { key: 'total', label: 'Total', type: 'money' },
          { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'balance', label: 'Balance', type: 'money' },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' open', total: sum('total'), paid: sum('paid'), balance: sum('balance') },
        stats: [
          { label: 'Open invoices', value: list.length, type: 'int' },
          { label: 'Outstanding', value: sum('balance'), type: 'money' },
          { label: 'Overdue', value: r0(list.filter((r) => (r.late as number) > 0).reduce((s, r) => s + (r.balance as number), 0)), type: 'money' },
        ],
      };
    },
  },
  {
    key: 'quote-details', title: 'Quote details', section: 'Receivables', range: 'period',
    description: 'Every quotation dated in the range: value, status, who owns it and whether it became a contract.',
    filters: [{
      key: 'status', label: 'Status', kind: 'select',
      options: [{ key: '', label: 'Every status' }, { key: 'draft', label: 'Draft' }, { key: 'sent', label: 'Sent' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }],
    }], landscape: true,
    run(c) {
      const qs = c.quotes.filter((q) => inRange(String(q.date), c.from, c.to));
      const st = c.filters.status || '';
      const list = qs.filter((q) => !st || q.status === st);
      const sum = (k: 'taxable' | 'gst' | 'total') => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      const ok = list.filter((q) => q.status === 'approved');
      return {
        columns: [
          { key: 'id', label: 'Quote', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'party', label: 'Customer / lead', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'mode', label: 'Type', type: 'text', tight: true },
          { key: 'status', label: 'Status', type: 'text', tight: true },
          { key: 'taxable', label: 'Value', type: 'money' },
          { key: 'gst', label: 'GST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'approvedAt', label: 'Approved on', type: 'date' },
          { key: 'contract', label: 'Contract', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', party: list.length + ' quotes', taxable: sum('taxable'), gst: sum('gst'), total: sum('total') },
        stats: [
          { label: 'Quotes', value: list.length, type: 'int' },
          { label: 'Quoted value', value: sum('taxable'), type: 'money' },
          { label: 'Approved', value: ok.length, type: 'int' },
          { label: 'Approved value', value: r0(ok.reduce((s, r) => s + (r.taxable as number), 0)), type: 'money' },
        ],
        filterText: st ? ['Status: ' + st] : [],
      };
    },
  },

  /* ==================================================== PAYMENTS RECEIVED */
  {
    key: 'payments-received', title: 'Payments received', section: 'Payments received', range: 'period',
    description: 'Every receipt in the range: who paid, against which invoice, how, and who collected it.',
    filters: [{ key: 'mode', label: 'Mode', kind: 'select', options: [{ key: '', label: 'Every mode' }] }], landscape: true,
    run(c) {
      const md = c.filters.mode || '';
      const list: Row[] = [];
      for (const i of c.invoices) {
        for (const p of i.payments) {
          if (!inRange(p.date, c.from, c.to)) continue;
          if (md && p.mode !== md) continue;
          list.push({
            id: p.id, date: p.date, at: p.at || '', customer: i.clientName, invoice: i.id, amount: p.amount,
            mode: p.mode, ref: p.ref || '', by: p.by ? c.users.get(p.by) || p.by : '',
            settled: p.mode === 'Cash' ? (p.settled ? 'Yes' : 'No') : '—', href: '/invoices/' + i.id,
          });
        }
      }
      list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
      const total = r0(list.reduce((s, r) => s + (r.amount as number), 0));
      const cash = list.filter((r) => r.mode === 'Cash');
      return {
        columns: [
          { key: 'id', label: 'Receipt', type: 'text', tight: true },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'at', label: 'Time', type: 'text', tight: true },
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'invoice', label: 'Invoice', type: 'text', tight: true },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'mode', label: 'Mode', type: 'text', tight: true },
          { key: 'ref', label: 'Reference', type: 'text' },
          { key: 'by', label: 'Collected by', type: 'text' },
          { key: 'settled', label: 'Cash handed in', type: 'text', tight: true },
        ],
        rows: list,
        totals: { id: 'Total', customer: list.length + ' receipts', amount: total },
        stats: [
          { label: 'Receipts', value: list.length, type: 'int' },
          { label: 'Collected', value: total, type: 'money' },
          { label: 'In cash', value: r0(cash.reduce((s, r) => s + (r.amount as number), 0)), type: 'money' },
          { label: 'Cash not handed in', value: r0(cash.filter((r) => r.settled === 'No').reduce((s, r) => s + (r.amount as number), 0)), type: 'money' },
        ],
        filterText: md ? ['Mode: ' + md] : [],
      };
    },
  },
  {
    key: 'time-to-get-paid', title: 'Time to get paid', section: 'Payments received', range: 'period',
    description: 'How long each customer takes to settle an invoice, for invoices settled in the range.',
    run(c) {
      const rows = new Map<string, Row>();
      const days = new Map<string, number[]>();
      for (const i of c.invoices.filter((x) => issued(x) && x.status === 'paid' && x.payments.length)) {
        const last = i.payments.map((p) => p.date).sort().slice(-1)[0];
        if (!inRange(last, c.from, c.to)) continue;
        const d = Math.max(0, daysBetween(i.date, last));
        const r = rows.get(i.clientId) || { customer: i.clientName, invoices: 0, avg: 0, t0: 0, t1: 0, t2: 0, t3: 0, amount: 0, href: '/customers/' + i.clientId };
        r.invoices = (r.invoices as number) + 1;
        r.amount = (r.amount as number) + i.total;
        const k = d <= 15 ? 't0' : d <= 30 ? 't1' : d <= 45 ? 't2' : 't3';
        r[k] = (r[k] as number) + 1;
        days.set(i.clientId, [...(days.get(i.clientId) || []), d]);
        rows.set(i.clientId, r);
      }
      const list = [...rows.entries()].map(([id, r]): Row => {
        const ds = days.get(id) || [];
        return { ...r, avg: r1(ds.reduce((s, x) => s + x, 0) / Math.max(1, ds.length)) };
      }).sort((a, b) => (b.avg as number) - (a.avg as number));
      const all = [...days.values()].flat();
      const n = all.length;
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'customer', label: 'Customer', type: 'text' },
          { key: 'invoices', label: 'Invoices paid', type: 'int' },
          { key: 'avg', label: 'Average days', type: 'num' },
          { key: 't0', label: '0–15 days', type: 'int' },
          { key: 't1', label: '16–30 days', type: 'int' },
          { key: 't2', label: '31–45 days', type: 'int' },
          { key: 't3', label: '45+ days', type: 'int' },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows: list,
        totals: { customer: 'Total', invoices: n, avg: n ? r1(all.reduce((s, x) => s + x, 0) / n) : 0, t0: sum('t0'), t1: sum('t1'), t2: sum('t2'), t3: sum('t3'), amount: sum('amount') },
        stats: [
          { label: 'Invoices settled', value: n, type: 'int' },
          { label: 'Average days to pay', value: n ? r1(all.reduce((s, x) => s + x, 0) / n) : 0, type: 'num' },
          { label: 'Paid within 15 days', value: n ? r0((sum('t0') / n) * 100) : 0, type: 'pct' },
          { label: 'Took over 45 days', value: sum('t3'), type: 'int' },
        ],
        note: 'Days from the invoice date to the receipt that settled it. An invoice counts in the range its last receipt falls in.',
      };
    },
  },
  {
    key: 'customer-statement', title: 'Customer statement', section: 'Receivables', range: 'period',
    description: 'One customer, every invoice and receipt in the range, with a running balance — the statement of account to send them.',
    filters: [{ key: 'client', label: 'Customer', kind: 'client', required: true }],
    run(c) {
      const id = c.filters.client || '';
      const cl = c.clients.get(id);
      if (!cl) throw new BadRequestException('Pick a customer for the statement');
      const mine = c.invoices.filter((i) => i.clientId === id && issued(i));
      let opening = cl.openingBalance || 0;
      for (const i of mine) {
        if (i.date < c.from) opening += i.total;
        opening -= i.payments.filter((p) => p.date < c.from).reduce((s, p) => s + p.amount, 0);
      }
      const events: Array<{ date: string; ord: number; id: string; what: string; debit: number; credit: number; href: string }> = [];
      for (const i of mine) {
        if (inRange(i.date, c.from, c.to)) {
          events.push({ date: i.date, ord: 0, id: i.id, what: 'Invoice' + (i.period ? ' · ' + i.period : '') + ' · due ' + niceDate(i.due), debit: i.total, credit: 0, href: '/invoices/' + i.id });
        }
        for (const p of i.payments) {
          if (!inRange(p.date, c.from, c.to)) continue;
          events.push({ date: p.date, ord: 1, id: p.id, what: 'Payment received · ' + p.mode + (p.ref ? ' · ' + p.ref : '') + ' · against ' + i.id, debit: 0, credit: p.amount, href: '/invoices/' + i.id });
        }
      }
      events.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord || a.id.localeCompare(b.id));
      let bal = opening;
      const list: Row[] = [{ date: c.from, id: '', what: 'Opening balance', debit: '', credit: '', balance: r0(opening) }];
      for (const e of events) {
        bal += e.debit - e.credit;
        list.push({ date: e.date, id: e.id, what: e.what, debit: e.debit || '', credit: e.credit || '', balance: r0(bal), href: e.href });
      }
      const debit = r0(events.reduce((s, e) => s + e.debit, 0));
      const credit = r0(events.reduce((s, e) => s + e.credit, 0));
      return {
        title: 'Statement · ' + cl.name,
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'id', label: 'Document', type: 'text', tight: true },
          { key: 'what', label: 'Particulars', type: 'text', w: 3 },
          { key: 'debit', label: 'Invoiced', type: 'money' },
          { key: 'credit', label: 'Received', type: 'money' },
          { key: 'balance', label: 'Balance', type: 'money' },
        ],
        rows: list,
        totals: { date: '', id: '', what: 'Closing balance', debit, credit, balance: r0(bal) },
        stats: [
          { label: 'Opening balance', value: r0(opening), type: 'money' },
          { label: 'Invoiced', value: debit, type: 'money' },
          { label: 'Received', value: credit, type: 'money' },
          { label: 'Closing balance', value: r0(bal), type: 'money' },
        ],
        filterText: [cl.name + (cl.gstin ? ' · GSTIN ' + cl.gstin : '') + (cl.phone ? ' · ' + cl.phone : '')],
        note: 'Opening balance carries the customer’s recorded opening balance plus everything invoiced and received before the first date.',
      };
    },
  },

  /* ================================================================ TAXES */
  {
    key: 'gst-summary', title: 'GST summary', section: 'Taxes', range: 'period',
    description: 'Taxable value and CGST / SGST / IGST on issued invoices, month by month, business customers apart from consumers.',
    landscape: true,
    run(c) {
      const rows = new Map<string, Row>();
      for (const i of c.invoices.filter((x) => issued(x) && inRange(x.date, c.from, c.to))) {
        const ym = i.date.slice(0, 7);
        const cl = c.clients.get(i.clientId);
        const type = cl?.gstin ? 'B2B' : 'B2C';
        const k = ym + '|' + type;
        const r = rows.get(k) || { month: monthLabel(ym), type, invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0, _k: k };
        r.invoices = (r.invoices as number) + 1;
        r.taxable = (r.taxable as number) + i.taxable;
        r.cgst = (r.cgst as number) + i.cgst;
        r.sgst = (r.sgst as number) + i.sgst;
        r.igst = (r.igst as number) + i.igst;
        r.tax = (r.tax as number) + i.gst;
        r.total = (r.total as number) + i.total;
        rows.set(k, r);
      }
      const list = [...rows.values()].sort((a, b) => String(a._k).localeCompare(String(b._k)))
        .map(({ _k, ...r }): Row => ({ ...r, taxable: r0(r.taxable as number), cgst: r0(r.cgst as number), sgst: r0(r.sgst as number), igst: r0(r.igst as number), tax: r0(r.tax as number) }));
      const sum = (k: string) => r0(list.reduce((s, r) => s + (r[k] as number), 0));
      return {
        columns: [
          { key: 'month', label: 'Month', type: 'text', tight: true },
          { key: 'type', label: 'Supply', type: 'text', tight: true },
          { key: 'invoices', label: 'Invoices', type: 'int' },
          { key: 'taxable', label: 'Taxable value', type: 'money' },
          { key: 'cgst', label: 'CGST', type: 'money' },
          { key: 'sgst', label: 'SGST', type: 'money' },
          { key: 'igst', label: 'IGST', type: 'money' },
          { key: 'tax', label: 'Total tax', type: 'money' },
          { key: 'total', label: 'Invoice value', type: 'money' },
        ],
        rows: list,
        totals: { month: 'Total', invoices: sum('invoices'), taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax'), total: sum('total') },
        stats: [
          { label: 'Taxable value', value: sum('taxable'), type: 'money' },
          { label: 'CGST', value: sum('cgst'), type: 'money' },
          { label: 'SGST', value: sum('sgst'), type: 'money' },
          { label: 'IGST', value: sum('igst'), type: 'money' },
          { label: 'Total tax', value: sum('tax'), type: 'money' },
        ],
        note: `Issued invoices only. B2B = customer with a GSTIN, B2C = everyone else. Every line is SAC ${SAC} at ${c.co.gstRate}%; in-state supplies split CGST/SGST, other states carry IGST.`,
      };
    },
  },
];

const ALL: Def[] = [...DEFS, ...MORE_DEFS];
const BY_KEY = new Map(ALL.map((d) => [d.key, d]));

/* --------------------------------------------------------------- service */

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private trips: TripsService) {}

  /** The index: every report, in section order, with its filters. */
  async catalogue(): Promise<ReportMeta[]> {
    const [modes, cats] = await Promise.all([
      this.prisma.payment.findMany({ select: { mode: true }, distinct: ['mode'], orderBy: { mode: 'asc' } }),
      expenseCategoryOptions(this.prisma),
    ]);
    return ALL.map(({ run: _run, needs: _needs, ...meta }) => {
      if (meta.key === 'payments-received') {
        return { ...meta, filters: [{ key: 'mode', label: 'Mode', kind: 'select' as const, options: [{ key: '', label: 'Every mode' }, ...modes.map((m) => ({ key: m.mode, label: m.mode }))] }] };
      }
      if (meta.key === 'expense-details') {
        return { ...meta, filters: (meta.filters || []).map((f) => (f.key === 'category' ? { ...f, options: cats } : f)) };
      }
      return meta;
    });
  }

  meta(key: string): ReportMeta {
    const d = BY_KEY.get(key);
    if (!d) throw new NotFoundException('No such report');
    const { run: _run, needs: _needs, ...meta } = d;
    return meta;
  }

  /** Customers a statement can be run for, inside the branch scope. */
  async clientOptions(scope: string[] | null) {
    const rows = await this.prisma.client.findMany({
      where: scope === null ? {} : { branch: { in: scope } },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ key: r.id, label: r.name }));
  }

  async run(key: string, p: RunParams, byName: string): Promise<ReportResult> {
    const def = BY_KEY.get(key);
    if (!def) throw new NotFoundException('No such report');
    const ctx = await this.load(p, def.needs || []);
    const out = def.run(ctx);
    const branchName = p.scope === null ? 'All branches'
      : (await this.prisma.branch.findMany({ where: { id: { in: p.scope } }, select: { name: true } })).map((b) => b.name).join(', ') || 'No branch';
    const now = new Date();
    return {
      key: def.key,
      title: out.title || def.title,
      section: def.section,
      description: def.description,
      range: { from: p.from, to: p.to, kind: def.range },
      branchName,
      filterText: out.filterText || [],
      columns: out.columns,
      rows: out.rows,
      totals: out.totals,
      stats: out.stats,
      note: out.note,
      generatedAt: now.toISOString(),
      generatedBy: byName,
    };
  }

  /** The books, loaded once per run and shared by every report. */
  private async load(p: RunParams, needs: Need[]): Promise<Ctx> {
    const bw = p.scope === null ? {} : { branch: { in: p.scope } };
    const [co, invoices, clients, users, services, contracts, quotes, leads, branchRows] = await Promise.all([
      this.prisma.company.findFirst(),
      this.prisma.invoice.findMany({ where: bw, include: { payments: true } }),
      this.prisma.client.findMany({ select: { id: true, name: true, gstin: true, openingBalance: true, phone: true, branch: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true, branches: true } }),
      this.prisma.service.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.contract.findMany({ select: { id: true, owner: true } }),
      this.prisma.quotation.findMany({ where: bw, include: { items: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
      this.prisma.lead.findMany({ select: { id: true, clientId: true, owner: true, name: true } }),
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);
    const homeState = co?.state || 'Tamil Nadu';
    const gstRate = co?.gstRate || 18;
    const today = new Date();
    const todayISO = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const contractOwner = new Map(contracts.map((c) => [c.id, c.owner]));
    // The latest quotation per customer and the lead that became the customer:
    // the two fallbacks for whose sale an invoice is.
    const quoteOwner = new Map<string, string>();
    for (const q of quotes) if (q.clientId && q.owner && !quoteOwner.has(q.clientId)) quoteOwner.set(q.clientId, q.owner);
    const leadOwner = new Map<string, string>();
    for (const l of leads) if (l.clientId && l.owner && !leadOwner.has(l.clientId)) leadOwner.set(l.clientId, l.owner);

    const inv: Inv[] = invoices.map((i) => {
      const items = (Array.isArray(i.items) ? i.items : []) as Item[];
      const t = docTotals(items, i.discount || 0, i.placeOfSupply || homeState, homeState, gstRate);
      const paid = i.payments.reduce((s, x) => s + x.amount, 0);
      const balance = Math.max(0, t.total - paid);
      let status: string = i.status;
      if (i.status !== 'cancelled' && !(i.status === 'draft' && paid <= 0)) {
        status = balance <= 0.5 ? 'paid' : paid > 0 ? 'partial' : daysBetween(i.due, todayISO) > 0 ? 'overdue' : 'sent';
      }
      const inter = t.tax.interState;
      return {
        id: i.id, clientId: i.clientId, clientName: clientMap.get(i.clientId)?.name || i.clientId,
        contractId: i.contractId, kind: i.kind, date: i.date, due: i.due, period: i.period,
        stored: i.status, status, items,
        sub: t.sub, disc: t.disc, taxable: t.sub - t.disc, gst: t.gst,
        cgst: inter ? 0 : t.gst / 2, sgst: inter ? 0 : t.gst / 2, igst: inter ? t.gst : 0, interState: inter,
        total: t.total, paid, balance,
        payments: i.payments.map((x) => ({ id: x.id, date: x.date, amount: x.amount, mode: x.mode, ref: x.ref, by: x.by, at: x.at, settled: x.settled })),
        owner: (i.contractId && contractOwner.get(i.contractId)) || quoteOwner.get(i.clientId) || leadOwner.get(i.clientId) || '',
      };
    });

    const leadName = new Map(leads.map((l) => [l.id, l.name]));
    const quoteRows: Row[] = quotes.map((q) => {
      const t = docTotals(q.items, q.discount || 0, q.placeOfSupply || homeState, homeState, gstRate);
      return {
        id: q.id, date: q.date,
        party: (q.clientId && clientMap.get(q.clientId)?.name) || (q.leadId && leadName.get(q.leadId)) || '—',
        title: q.title || '', mode: q.mode === 'amc' ? 'AMC' : 'One-time', status: q.status,
        taxable: r0(t.sub - t.disc), gst: r0(t.gst), total: t.total,
        owner: q.owner ? userMap.get(q.owner) || q.owner : '', approvedAt: (q.approvedAt || '').slice(0, 10),
        contract: q.contractId || '', href: '/quotations/' + q.id,
      };
    });

    const userBranches = new Map(users.map((u) => [u.id, u.branches || []]));
    const clientBranch = new Map(clients.map((c) => [c.id, c.branch]));
    const x = needs.length ? await loadExtra(this.prisma, this.trips, p, needs, userBranches, clientBranch) : {};
    return {
      ...p, today: todayISO,
      co: { name: co?.name || '', gstin: co?.gstin || '', state: homeState, gstRate },
      clients: clientMap, users: userMap, userBranches,
      branches: new Map(branchRows.map((b) => [b.id, b.name])),
      services: new Map(services.map((s) => [s.id, { name: s.name, code: s.code }])),
      invoices: inv, quotes: quoteRows, x,
    };
  }
}

/** Shared by the renderers: a cell as the office reads it. */
export function fmtCell(v: string | number | undefined, type: Col['type']): string {
  if (v === undefined || v === null || v === '') return '';
  switch (type) {
    case 'money': return typeof v === 'number' ? money(v) : String(v);
    case 'int': return typeof v === 'number' ? String(Math.round(v)) : String(v);
    case 'num': return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
    case 'pct': return typeof v === 'number' ? v + '%' : String(v);
    case 'days': return typeof v === 'number' ? (v > 0 ? String(v) : '') : String(v);
    case 'date': return niceDate(String(v));
    default: return String(v);
  }
}
