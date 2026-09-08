'use client';

/* ============================================================================
   Invoices & Payments — the collections screen.

   v1: assets/js/views/invoices.js. List with status tabs and search, days-late
   column, receivables ageing (v1 accounts dashboard), quick record-payment
   picker, and raising invoices either from a contract's billing cycle
   (v1 invoiceFromContract) or standalone.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { docTotals, money } from 'shared';
import { api, type Bootstrap, type Client, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import {
  Dialog, PayDialog, STATUS_LABEL, fmtDate, pillClass, todayISO,
  type ContractOption, type InvoiceDetail, type InvoiceRow, type ListResponse,
} from './ui';
import { useBranchFilter } from '@/components/branch-filter';
import InvoicesMobile from './mobile';
import { CreateDialog } from './create-invoice';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
] as const;

export default function Invoices() {
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [tab, setTab] = useState<string>('all');
  const [q, setQ] = useState('');
  const [rev, setRev] = useState(0); // bumped after any write to refetch
  const [me, setMe] = useState<SessionUser | null>(null);

  const [creating, setCreating] = useState(false);
  // The finance kit: pick many invoices, take them out as ONE PDF.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bucket, setBucket] = useState(-1); // ageing card filter, -1 = off
  const [quickPay, setQuickPay] = useState(false);
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { api.get<SessionUser>('/auth/me').then(setMe).catch(() => {}); }, []);

  const bf = useBranchFilter();

  const filtered = useMemo(() => {
    const inBucket = (r: InvoiceRow) => {
      if (bucket < 0) return true;
      if (r.status === 'paid') return false; // ageing counts open money only
      if (bucket === 0) return r.daysLate <= 0;
      if (bucket === 1) return r.daysLate >= 1 && r.daysLate <= 30;
      if (bucket === 2) return r.daysLate >= 31 && r.daysLate <= 60;
      return r.daysLate > 60;
    };
    return (data?.rows || []).filter((r) =>
      (!from || r.date >= from) && (!to || r.date <= to) && inBucket(r));
  }, [data, from, to, bucket]);

  useEffect(() => {
    const url = '/invoices?status=' + tab + (q ? '&q=' + encodeURIComponent(q) : '')
      + (bf.branch ? '&branch=' + bf.branch : '');
    const t = setTimeout(() => {
      api.get<ListResponse>(url).then(setData).catch(() => setData(null));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, q, rev, bf.branch]);
  const pg = usePager(filtered);

  const canBill = !!me && (me.role === 'admin' || me.role === 'accounts'); // v1 invoices.js:34

  const allOnPage = pg.pageRows.length > 0 && pg.pageRows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s0) => {
    const n = new Set(s0);
    if (allOnPage) pg.pageRows.forEach((r) => n.delete(r.id));
    else pg.pageRows.forEach((r) => n.add(r.id));
    return n;
  });
  const toggleOne = (id: string) => setSel((s0) => {
    const n = new Set(s0);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selRows = (data?.rows || []).filter((r) => sel.has(r.id));
  const selTotal = selRows.reduce((a, r) => a + r.total, 0);

  function paid(receiptId: string, amount: number, invId: string, settled?: number) {
    setPayFor(null);
    setQuickPay(false);
    setNotice(
      `Receipt ${receiptId} issued — ${money(amount)} recorded`
      + (settled && settled > 1
        ? `, settling ${settled} invoices oldest first`
        : ` against ${invId}`),
    );
    setTimeout(() => setNotice(''), 5000);
    setRev((r) => r + 1);
  }

  return (
    <>
      {/* The phone gets a screen of its own. The ageing buckets, bulk select,
          date range and export below are a Monday-morning desk job; on a
          phone this list exists to answer "where is my bill?". */}
      <InvoicesMobile data={data} tab={tab} onTab={setTab} q={q} onQ={setQ}
        newHref="/invoices/new" />

    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Invoices &amp; Payments</h1>
          {data && (
            <span className="text-muted-2 text-[12.5px]">
              {money(data.receivable)} outstanding across {data.counts.open} open invoices
            </span>
          )}
        </div>
        {canBill && (
          <div className="flex items-center gap-2">
            {bf.el}
            <button onClick={() => setQuickPay(true)}
              className="h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
              Record payment
            </button>
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={14} /> New invoice
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="px-4 lg:px-6 py-2 border-b border-line-soft bg-wash text-[12.5px] text-ink-2">
          {notice}
        </div>
      )}

      {/* --------------------------------------------------------- tabs */}
      <div className="px-4 lg:px-6 border-b border-line flex gap-1 overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const n = data ? data.counts[t.id as keyof ListResponse['counts']] : null;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'h-12 lg:h-10 px-3 shrink-0 text-[13px] border-b-2 -mb-px transition-colors ' +
                (active
                  ? 'border-accent text-navy font-semibold'
                  : 'border-transparent text-muted hover:text-ink')}>
              {t.label}
              {n !== null && <span className={'ml-1.5 text-[11.5px] ' + (active ? 'text-muted' : 'text-muted-2')}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* ------------- ageing: how old the OPEN money is, as filter cards.
          "1–30 days" means invoices whose due date passed 1–30 days ago and
          are still unpaid. Tap a card to see exactly those; tap again to
          clear. Paid invoices never appear in these buckets. */}
      {data && data.counts.all > 0 && (
        <div className="px-4 lg:px-6 py-3 border-b border-line-soft grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {data.ageing.map((b, i) => (
            <button key={b.label} onClick={() => { setBucket(bucket === i ? -1 : i); setSel(new Set()); }}
              className={'text-left rounded-lg border px-3.5 py-2.5 shadow-card transition-colors '
                + (bucket === i ? 'border-navy bg-wash' : 'border-line hover:border-navy/50 bg-white')}>
              <span className="block text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold">
                {b.label}
              </span>
              <span className={'block text-[16px] font-bold mt-0.5 '
                + (i >= 2 && b.v > 0 ? 'text-accent' : i === 0 ? 'text-muted' : 'text-ink')}>
                {money(b.v)}
              </span>
              <span className="block text-[11px] text-muted-2 mt-0.5">
                {b.n} invoice{b.n === 1 ? '' : 's'}{bucket === i ? ' · filtering — tap to clear' : ' · tap to filter'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* -------------------------------------------- search + date range */}
      <div className="px-4 lg:px-6 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 lg:max-w-[340px] flex-1 min-w-[220px] h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by invoice number or customer…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
        <span className="flex items-center gap-2 text-[12px] text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="h-10 lg:h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none" />
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="h-10 lg:h-8 px-2 rounded border border-line text-[12.5px] bg-white outline-none" />
          {(from || to || bucket >= 0) && (
            <button onClick={() => { setFrom(''); setTo(''); setBucket(-1); }}
              className="h-8 px-2.5 rounded border border-line text-[12px] font-medium hover:bg-wash">
              Clear filters
            </button>
          )}
        </span>
      </div>

      {/* ------------------------------------------- the selection basket */}
      {sel.size > 0 && (
        <div className="px-4 lg:px-6 py-2.5 border-b border-line bg-wash flex items-center gap-3 flex-wrap sticky top-0 z-30">
          <span className="text-[13px] font-bold">
            {sel.size} invoice{sel.size === 1 ? '' : 's'} selected · {money(selTotal)}
          </span>
          <button onClick={() => window.open('/invoices/print?ids=' + Array.from(sel).join(','), '_blank')}
            className="h-9 px-4 rounded bg-navy text-white text-[12.5px] font-semibold hover:brightness-110">
            Download PDF
          </button>
          <button onClick={() => setSel(new Set())}
            className="h-9 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-white">
            Clear selection
          </button>
          <span className="text-[11.5px] text-muted">
            One file, one page per invoice — for the accounts records.
          </span>
        </div>
      )}

      {/* -------------------------------------------------------- table */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">Nothing here</p>
          <p className="text-muted text-[13px] mt-1">
            {data.counts.all === 0
              ? 'Raise the first invoice from a contract’s billing cycle, or create one standalone.'
              : 'No invoices match this view.'}
          </p>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th style={{ width: 46 }} onClick={toggleAll} title="Select everything on this page"
                className="cursor-pointer">
                <input type="checkbox" checked={allOnPage} readOnly
                  className="w-4 h-4 accent-[#FF0000] align-middle pointer-events-none" />
              </th>
              <th>Invoice</th><th>Customer</th><th>Period</th><th>Due</th>
              <th className="text-right!">Amount</th>
              <th className="text-right!">Paid</th>
              <th className="text-right!">Balance</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((i) => {
              const late = i.daysLate > 0 && i.status !== 'paid';
              return (
                <tr key={i.id} className="zrow" onClick={() => router.push('/invoices/' + i.id)}>
                  {/* The whole cell is the target — anywhere in the space
                      BEFORE the invoice number selects; the rest of the row
                      still opens the invoice. */}
                  <td onClick={(e) => { e.stopPropagation(); toggleOne(i.id); }}
                    className="cursor-pointer">
                    <input type="checkbox" checked={sel.has(i.id)} readOnly
                      className="w-4 h-4 accent-[#FF0000] align-middle pointer-events-none" />
                  </td>
                  <td>
                    {/* The tag rides on the LEFT beside the number, so an
                        overdue invoice jumps out while scanning down. */}
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-navy">{i.id}</span>
                      <span className={pillClass(i.status)}>{STATUS_LABEL[i.status]}</span>
                    </span>
                    <span className="block text-[11.5px] text-muted">{fmtDate(i.date)}</span>
                  </td>
                  <td className="font-medium">{i.clientName}</td>
                  <td className="max-w-[190px] truncate">{i.period || '—'}</td>
                  <td className={late ? 'text-accent font-semibold' : ''}>
                    {fmtDate(i.due)}
                    {late && <span className="block text-[11.5px] font-normal">{i.daysLate} days late</span>}
                  </td>
                  <td className="text-right font-semibold">{money(i.total)}</td>
                  <td className="text-right text-muted">{money(i.paid)}</td>
                  <td className={'text-right font-bold ' + (i.balance > 0 ? 'text-accent' : 'text-muted')}>
                    {money(i.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pg.el}

      {/* ------------------------------------------------------ dialogs */}
    </div>
      {creating && (
        <CreateDialog onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); router.push('/invoices/' + id); }} />
      )}
      {quickPay && !payFor && (
        <QuickPayDialog onClose={() => setQuickPay(false)} onPick={setPayFor} />
      )}
      {payFor && (
        <PayDialog inv={{ ...payFor, phone: payFor.clientPhone }}
          onClose={() => setPayFor(null)}
          onDone={(rid, amt, settled) => paid(rid, amt, payFor.id, settled)} />
      )}
    </>
  );
}

/* ============================================================== quick pay */
/* v1 quickPay — pick the open invoice that was settled (invoices.js:113-137). */

function QuickPayDialog({ onClose, onPick }: {
  onClose: () => void; onPick: (inv: InvoiceRow) => void;
}) {
  const [open, setOpen] = useState<InvoiceRow[] | null>(null);

  useEffect(() => {
    api.get<ListResponse>('/invoices?status=open')
      .then((d) => setOpen(d.rows)).catch(() => setOpen([]));
  }, []);

  return (
    <Dialog title="Record a payment" sub="Pick the invoice that was settled" onClose={onClose}>
      {!open ? (
        <p className="text-muted text-[13px]">Loading…</p>
      ) : open.length === 0 ? (
        <p className="text-muted text-[13px]">No open invoices.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((i) => (
            <button key={i.id} onClick={() => onPick(i)}
              className="flex items-center gap-3 card p-3 text-left hover:bg-wash">
              <span className={'w-9 h-9 rounded flex items-center justify-center shrink-0 ' +
                (i.status === 'overdue' ? 'bg-red-wash text-accent' : 'bg-wash text-navy')}>
                <Icon name="invoice" size={17} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate">{i.clientName}</span>
                <span className="block text-[11.5px] text-muted">{i.id} · due {fmtDate(i.due)}</span>
              </span>
              <span className="text-right">
                <span className="block font-bold text-[13px]">{money(i.balance)}</span>
                <span className="block text-[10.5px] text-muted-2">balance</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ============================================================ new invoice */

/* --------------------------------------------- the services on a contract

   Raising from a contract used to mean "raise the next installment". An
   installment is a sequence number, and a sequence number is a poor thing to
   hang money on — see INVOICING.md. What gets billed now is the work: the
   services on the contract, each priced, each billable exactly once.          */



