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
import {
  Dialog, PayDialog, STATUS_LABEL, fmtDate, pillClass, todayISO,
  type ContractOption, type InvoiceDetail, type InvoiceRow, type ListResponse,
} from './ui';
import { useBranchFilter } from '@/components/branch-filter';

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
  const [quickPay, setQuickPay] = useState(false);
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { api.get<SessionUser>('/auth/me').then(setMe).catch(() => {}); }, []);

  const bf = useBranchFilter();
  useEffect(() => {
    const url = '/invoices?status=' + tab + (q ? '&q=' + encodeURIComponent(q) : '')
      + (bf.branch ? '&branch=' + bf.branch : '');
    const t = setTimeout(() => {
      api.get<ListResponse>(url).then(setData).catch(() => setData(null));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, q, rev, bf.branch]);

  const canBill = !!me && (me.role === 'admin' || me.role === 'accounts'); // v1 invoices.js:34

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
    <div>
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

      {/* ------------------------------------------------------- ageing */}
      {data && data.counts.all > 0 && (
        <div className="px-4 lg:px-6 py-3 border-b border-line-soft flex flex-wrap gap-x-8 gap-y-2">
          {data.ageing.map((b, i) => (
            <div key={b.label}>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-2 font-semibold">{b.label}</div>
              <div className={'text-[14px] font-semibold ' + (i >= 2 && b.v > 0 ? 'text-accent' : i === 0 ? 'text-muted' : 'text-ink')}>
                {money(b.v)} <span className="text-[11.5px] font-normal text-muted-2">· {b.n} inv</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------- search */}
      <div className="px-4 lg:px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 lg:max-w-[340px] h-10 lg:h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by invoice number or customer…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {/* -------------------------------------------------------- table */}
      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : data.rows.length === 0 ? (
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
              <th>Invoice</th><th>Customer</th><th>Period</th><th>Due</th>
              <th className="text-right!">Amount</th>
              <th className="text-right!">Paid</th>
              <th className="text-right!">Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((i) => {
              const late = i.daysLate > 0 && i.status !== 'paid';
              return (
                <tr key={i.id} className="zrow" onClick={() => router.push('/invoices/' + i.id)}>
                  <td>
                    <span className="block font-semibold text-navy">{i.id}</span>
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
                  <td><span className={pillClass(i.status)}>{STATUS_LABEL[i.status]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ------------------------------------------------------ dialogs */}
      {creating && (
        <CreateDialog onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); router.push('/invoices/' + id); }} />
      )}
      {quickPay && !payFor && (
        <QuickPayDialog onClose={() => setQuickPay(false)} onPick={setPayFor} />
      )}
      {payFor && (
        <PayDialog inv={payFor} onClose={() => setPayFor(null)}
          onDone={(rid, amt, settled) => paid(rid, amt, payFor.id, settled)} />
      )}
    </div>
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
              className="flex items-center gap-3 rounded-md border border-line p-3 text-left hover:bg-wash">
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

interface BillableService {
  jobId: string; visitNo: number; ofVisits: number;
  date: string; slot: string; status: string; title: string;
  crew: string[]; amount: number; inCycle: boolean; overdue: boolean;
}

interface Billable {
  contract: {
    id: string; clientId: string; clientName: string; mode: string;
    billing: string; billingMode: string; value: number;
    start: string; end: string; placeOfSupply: string; totalVisits: number;
  };
  cycle: { seq: number; label: string; due: string; amount: number } | null;
  services: BillableService[];
  billedServices: number;
  totalServices: number;
  billedValue: number;
}

const JOB_STATUS: Record<string, string> = {
  completed: 'done', inprogress: 'in progress', scheduled: 'scheduled',
};

function CreateDialog({ onClose, onCreated }: {
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [mode, setMode] = useState<'contract' | 'blank'>('contract');
  const [options, setOptions] = useState<ContractOption[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [home, setHome] = useState('Tamil Nadu');
  const [gstRate, setGstRate] = useState(18);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // from-contract
  const [sel, setSel] = useState('');
  const [label, setLabel] = useState('');
  const [bill, setBill] = useState<Billable | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  // standalone
  const [clientId, setClientId] = useState('');
  const [invNo, setInvNo] = useState('');
  const [period, setPeriod] = useState('');
  const [date, setDate] = useState(todayISO());
  const [due, setDue] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ desc: string; qty: number; rate: number }>>([
    { desc: '', qty: 1, rate: 0 },
  ]);

  useEffect(() => {
    api.get<ContractOption[]>('/invoices/contract-options').then(setOptions).catch(() => setOptions([]));
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
    api.get<Bootstrap>('/org/bootstrap').then((b) => {
      setHome(b.company.state || 'Tamil Nadu');
      setGstRate(b.company.gstRate || 18);
    }).catch(() => {});
  }, []);

  /* Picking a contract pulls its unbilled services. The ones falling in the
     period being billed come ticked; anything older and still unbilled shows
     above them, unticked, so a visit that slipped is visible rather than lost. */
  useEffect(() => {
    if (!sel) { setBill(null); setTicked(new Set()); return; }
    setBillBusy(true);
    api.get<Billable>('/invoices/billable/' + sel)
      .then((b) => {
        setBill(b);
        setTicked(new Set(b.services.filter((x) => x.inCycle).map((x) => x.jobId)));
      })
      .catch(() => setBill(null))
      .finally(() => setBillBusy(false));
  }, [sel]);

  const chosen = options?.find((o) => o.id === sel) || null;
  const picked = bill ? bill.services.filter((x) => ticked.has(x.jobId)) : [];
  const pickedTotal = picked.reduce((a, x) => a + x.amount, 0);
  const preview = useMemo(
    () => docTotals(items, 0, place || home, home, gstRate),
    [items, place, home, gstRate],
  );

  function setItem(idx: number, patch: Partial<{ desc: string; qty: number; rate: number }>) {
    setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function submit(status: 'draft' | 'sent') {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'contract') {
        if (!sel) { setErr('Pick a contract'); setBusy(false); return; }
        if (bill && bill.services.length && !picked.length) {
          setErr('Tick the services this invoice covers');
          setBusy(false);
          return;
        }
        const inv = await api.post<InvoiceDetail>('/invoices/from-contract/' + sel, {
          label: label.trim(),
          jobIds: picked.map((x) => x.jobId),
        });
        onCreated(inv.id);
        return;
      }
      const clean = items.filter((i) => i.desc.trim());
      if (!clientId) { setErr('Pick a customer'); setBusy(false); return; }
      if (!clean.length) { setErr('Add at least one line item'); setBusy(false); return; }
      const inv = await api.post<InvoiceDetail>('/invoices', {
        id: invNo.trim() || undefined,
        clientId, period, date, due: due || undefined,
        placeOfSupply: place, notes, items: clean, status,
      });
      onCreated(inv.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the invoice');
      setBusy(false);
    }
  }

  const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
  const inputCls = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';

  return (
    <Dialog title="New invoice" wide onClose={onClose}
      footer={
        <>
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          {mode === 'blank' && (
            <button onClick={() => submit('draft')} disabled={busy}
              className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash disabled:opacity-60">
              Save draft
            </button>
          )}
          <button onClick={() => submit('sent')} disabled={busy}
            className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            <Icon name="check" size={14} /> {mode === 'contract' ? 'Raise invoice' : 'Save & issue'}
          </button>
        </>
      }>
      {/* mode switch */}
      <div className="flex gap-1 rounded-md bg-wash p-1 mb-4 w-fit">
        {([['contract', 'From contract'], ['blank', 'Standalone']] as const).map(([m, l]) => (
          <button key={m} onClick={() => { setMode(m); setErr(''); }}
            className={'h-7 px-3 rounded text-[12.5px] font-medium ' +
              (mode === m ? 'bg-white text-navy shadow-card' : 'text-muted hover:text-ink')}>
            {l}
          </button>
        ))}
      </div>

      {mode === 'contract' ? (
        <>
          {!options ? (
            <p className="text-muted text-[13px]">Loading contracts…</p>
          ) : options.length === 0 ? (
            <p className="text-muted text-[13px]">
              Nothing left to bill on any contract — every service has been invoiced.
              Switch to Standalone to bill something else directly.
            </p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {options.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)}
                  className={'flex items-center gap-3 rounded-md border p-3 text-left ' +
                    (sel === o.id ? 'border-navy bg-wash' : 'border-line hover:bg-wash')}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{o.clientName}</span>
                    <span className="block text-[11.5px] text-muted">
                      {o.id} · {o.billing} billing · {fmtDate(o.start)} → {fmtDate(o.end)}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-bold text-[13px]">
                      {money(o.billableServices > 0 ? o.billableValue : o.perCycle)}
                    </span>
                    <span className="block text-[10.5px] text-muted-2">
                      {o.billableServices > 0
                        ? `${o.billableServices} service${o.billableServices > 1 ? 's' : ''} left to bill`
                        : 'next installment + GST'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {bill && (
            <div className="rounded-md border border-line overflow-hidden mb-4">
              <div className="px-3.5 py-2.5 border-b border-line-soft bg-wash flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold">
                  What this invoice covers
                </span>
                <span className="text-[11.5px] text-muted">
                  {bill.billedServices} of {bill.totalServices} services already billed
                  {bill.cycle && <> · billing {bill.cycle.label.toLowerCase()}</>}
                </span>
              </div>

              {/* Billed past its own value: the fault this design exists to stop.
                  Worth saying on the screen where the next one would be raised. */}
              {bill.billedValue > bill.contract.value && (
                <p className="px-3.5 py-2 text-[11.5px] text-accent border-b border-line-soft bg-red-wash">
                  {money(bill.billedValue)} has already been invoiced on a contract worth{' '}
                  {money(bill.contract.value)}.
                </p>
              )}

              {billBusy ? (
                <p className="px-3.5 py-4 text-[12.5px] text-muted">Loading services…</p>
              ) : bill.services.length === 0 ? (
                <p className="px-3.5 py-4 text-[12.5px] text-muted">
                  Every service on this contract has been billed. Nothing left to raise.
                </p>
              ) : (
                <div className="max-h-[280px] overflow-y-auto divide-y divide-line-soft">
                  {bill.services.map((x, i) => {
                    const on = ticked.has(x.jobId);
                    const firstOverdue = x.overdue
                      && bill.services.findIndex((y) => y.overdue) === i;
                    return (
                      <div key={x.jobId}>
                        {firstOverdue && (
                          <p className="px-3.5 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
                            Not billed from earlier periods
                          </p>
                        )}
                        <label className={'flex items-start gap-3 px-3.5 py-2.5 cursor-pointer '
                          + (on ? 'bg-wash' : 'hover:bg-wash')}>
                          <input type="checkbox" checked={on} className="mt-1"
                            onChange={() => setTicked((t) => {
                              const n = new Set(t);
                              if (n.has(x.jobId)) n.delete(x.jobId); else n.add(x.jobId);
                              return n;
                            })} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold truncate">
                              {x.ofVisits ? `Visit ${x.visitNo} of ${x.ofVisits} — ` : ''}{x.title}
                            </span>
                            <span className="block text-[11.5px] text-muted">
                              {fmtDate(x.date)} · {JOB_STATUS[x.status] || x.status}
                              {x.crew.length > 0 && <> · {x.crew.join(', ')}</>}
                            </span>
                          </span>
                          <span className="text-[12.5px] font-semibold shrink-0">{money(x.amount)}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {bill.services.length > 0 && (
                <div className="px-3.5 py-2.5 border-t border-line flex items-baseline justify-between bg-wash">
                  <span className="text-[12px] text-muted">
                    {picked.length} selected
                  </span>
                  <span className="text-[14px] font-bold text-navy">
                    {money(pickedTotal)} <span className="text-[11.5px] font-normal text-muted">+ GST</span>
                  </span>
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className={labelCls}>Billing period label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={chosen ? chosen.billing + ' billing' : 'e.g. Quarter 2'}
              className={inputCls} />
          </label>
          {chosen && (
            <p className="text-muted text-[12px] mt-3">
              {picked.length > 0
                ? `${picked.length} service line(s), ${money(pickedTotal)} plus GST, due 15 days from today.`
                : 'Tick the services this invoice covers. Each one is billed once — a service already invoiced is not on the list.'}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className={labelCls}>Customer *</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                className={inputCls + ' bg-white'}>
                <option value="">Pick a customer…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Billing period</span>
              <input value={period} onChange={(e) => setPeriod(e.target.value)}
                placeholder="e.g. One-time service" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Invoice no. (blank = automatic)</span>
              <input value={invNo} onChange={(e) => setInvNo(e.target.value)}
                placeholder="Auto — next INV number" className={inputCls + ' font-mono'} />
            </label>
            <span className="block" aria-hidden="true" />
            <label className="block">
              <span className={labelCls}>Invoice date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Due date (blank = 15 days)</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
            </label>
            <label className="block col-span-2">
              <span className={labelCls}>Place of supply (decides CGST/SGST vs IGST)</span>
              <input value={place} onChange={(e) => setPlace(e.target.value)}
                placeholder={home} className={inputCls} />
            </label>
          </div>

          <span className={labelCls}>Line items (rates ex-GST)</span>
          <div className="flex flex-col gap-2 mb-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })}
                  placeholder="Description of service" className={inputCls + ' flex-1'} />
                <input type="number" value={it.qty} min={1}
                  onChange={(e) => setItem(i, { qty: Number(e.target.value) || 1 })}
                  className={inputCls + ' w-[70px] text-right'} />
                <input type="number" value={it.rate}
                  onChange={(e) => setItem(i, { rate: Number(e.target.value) || 0 })}
                  className={inputCls + ' w-[110px] text-right'} />
                <span className="w-[92px] text-right text-[13px] font-semibold">
                  {money(it.qty * it.rate)}
                </span>
                <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  disabled={items.length === 1}
                  className="text-muted-2 hover:text-accent disabled:opacity-30" aria-label="Remove line">
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems((xs) => [...xs, { desc: '', qty: 1, rate: 0 }])}
            className="flex items-center gap-1 text-[12.5px] font-medium text-navy hover:text-accent mb-3">
            <Icon name="plus" size={13} /> Add line
          </button>

          <div className="rounded-md bg-wash p-3 text-[12.5px] flex flex-col gap-1 max-w-[300px] ml-auto">
            <span className="flex justify-between"><span className="text-muted">Taxable value</span><span>{money(preview.sub)}</span></span>
            {preview.tax.rows.map(([l, v]) => (
              <span key={l} className="flex justify-between"><span className="text-muted">{l}</span><span>{money(v)}</span></span>
            ))}
            <span className="flex justify-between border-t border-line pt-1 font-semibold">
              <span>Invoice total</span><span>{money(preview.total)}</span>
            </span>
          </div>

          <label className="block mt-3">
            <span className={labelCls}>Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </label>
        </>
      )}

      {err && <p className="text-accent text-[12.5px] mt-3">{err}</p>}
    </Dialog>
  );
}
