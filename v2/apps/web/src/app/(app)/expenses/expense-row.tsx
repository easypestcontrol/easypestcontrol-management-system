'use client';

/* One expense as a row the office acts on — the same row on the day page and
   in a branch's report, so the two never drift. Pending lines can be approved
   or rejected; approved, part-paid and bounced lines can be paid. A closed
   report shows the lines and no buttons.

   PersonGroup is the person above the rows: their day in one line (how much,
   how much of it pending, owed, paid), a per-person Approve all and Pay all,
   and a chevron that opens the lines themselves. */

import { useState } from 'react';
import Link from 'next/link';
import { money } from 'shared';
import { Icon } from '@/components/icons';
import { initials } from '../contracts/lib';
import { PAYABLE, catIcon, chip, type Exp } from './ui';

export function ExpenseRow({ e, busy, locked, onApprove, onReject, onPay, onReceipt }: {
  e: Exp;
  busy: boolean;
  /** The report is closed: look, don't touch. */
  locked: boolean;
  onApprove: (e: Exp) => void;
  onReject: (e: Exp) => void;
  onPay: (e: Exp) => void;
  onReceipt: (e: Exp) => void;
}) {
  const c = chip(e.status);
  const due = e.amount - (e.paidAmount || 0);
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-line-soft last:border-0">
      <span className="w-9 h-9 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0 mt-0.5">
        <Icon name={catIcon(e.category)} size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold">
          {e.category}
          {e.source === 'auto_trip' && (
            <Link href={'/trips/' + e.tripId}
              className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-wash text-muted border border-line align-middle whitespace-nowrap hover:text-accent">
              AUTO · {e.tripId}
            </Link>
          )}
        </span>
        <span className="block text-[11.5px] text-muted">
          {[e.merchant, e.note && e.source !== 'auto_trip' ? e.note : '',
            e.source === 'auto_trip' ? e.km + ' km × ' + money(e.rate) + '/km' : ''].filter(Boolean).join(' · ')}
        </span>
        {e.status === 'rejected' && e.rejectReason && (
          <span className="block text-[11.5px] text-accent mt-1">Reason: {e.rejectReason}</span>
        )}
        {e.hasReceipt && (
          <button onClick={() => onReceipt(e)}
            className="mt-1 text-[11.5px] font-semibold text-navy hover:text-accent inline-flex items-center gap-1">
            <Icon name="report" size={12} /> View receipt
          </button>
        )}
      </span>
      <span className="text-right shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-[13.5px] font-bold tabular-nums">{money(e.amount)}</span>
        {e.paidAmount > 0 && e.paidAmount < e.amount && (
          <span className="text-[11px] text-muted tabular-nums">{money(e.paidAmount)} paid · {money(due)} owed</span>
        )}
        <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ' + c.cls}>{c.label}</span>
        {!locked && e.status === 'pending' && (
          <span className="flex gap-1.5">
            <button disabled={busy} onClick={() => onApprove(e)}
              className="h-7 px-2.5 rounded border border-line text-[11.5px] font-semibold hover:bg-wash">Approve</button>
            <button disabled={busy} onClick={() => onReject(e)}
              className="h-7 px-2.5 rounded border border-red-line text-accent text-[11.5px] font-semibold hover:bg-rose">Reject</button>
          </span>
        )}
        {!locked && PAYABLE.includes(e.status) && (
          <button disabled={busy} onClick={() => onPay(e)}
            className="h-7 px-2.5 rounded bg-accent text-white text-[11.5px] font-semibold hover:brightness-90">
            {e.status === 'payment_failed' ? 'Retry payment' : e.status === 'partial' ? 'Pay the rest' : 'Pay'}
          </button>
        )}
      </span>
    </div>
  );
}

export interface Group { userId: string; name: string; color: string; rows: Exp[]; sum: number }

/** Rows grouped by the person, in the order they came. */
export function groupByPerson(rows: Exp[]): Group[] {
  const groups: Group[] = [];
  for (const e of rows) {
    let g = groups.find((x) => x.userId === e.userId);
    if (!g) { g = { userId: e.userId, name: e.employeeName, color: e.employeeColor, rows: [], sum: 0 }; groups.push(g); }
    g.rows.push(e); g.sum += e.amount;
  }
  return groups;
}

export function PersonGroup({ g, busy, locked, defaultOpen = false, onApproveAll, onPayAll, onApprove, onReject, onPay, onReceipt }: {
  g: Group;
  busy: boolean;
  locked: boolean;
  /** Open on first render; the day page starts closed, a single report open. */
  defaultOpen?: boolean;
  onApproveAll: (g: Group, pending: Exp[]) => void;
  onPayAll: (g: Group, payable: Exp[], due: number) => void;
  onApprove: (e: Exp) => void;
  onReject: (e: Exp) => void;
  onPay: (e: Exp) => void;
  onReceipt: (e: Exp) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const pending = g.rows.filter((e) => e.status === 'pending');
  const payable = g.rows.filter((e) => PAYABLE.includes(e.status));
  const pendingSum = pending.reduce((a, e) => a + e.amount, 0);
  const due = payable.reduce((a, e) => a + e.amount - (e.paidAmount || 0), 0);
  const paid = g.rows.reduce((a, e) => a + (e.paidAmount || 0), 0);
  const bits = [
    g.rows.length + (g.rows.length === 1 ? ' expense' : ' expenses'),
    pendingSum > 0 ? money(pendingSum) + ' pending' : '',
    due > 0 ? money(due) + ' to pay' : '',
    paid > 0 ? money(paid) + ' paid' : '',
  ].filter(Boolean);

  return (
    <div className="border-b border-line-soft last:border-0">
      {/* At a desk one line: name, total, the two buttons, the chevron. On a
          phone the buttons take a line of their own under the name, so the
          name never shrinks to an initial to make room for them. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 lg:px-4 py-2.5 bg-wash">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
            style={{ background: g.color }}>{initials(g.name)}</span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold truncate">{g.name}</span>
            <span className="block text-[11.5px] text-muted truncate">{bits.join(' · ')}</span>
          </span>
        </button>
        <span className="text-[12.5px] font-bold tabular-nums shrink-0">{money(g.sum)}</span>
        {!locked && (pending.length > 0 || due > 0) && (
          <span className="flex gap-2 shrink-0 max-lg:basis-full max-lg:order-last">
            {pending.length > 0 && (
              <button disabled={busy} onClick={() => onApproveAll(g, pending)}
                className="h-9 lg:h-8 px-3 lg:px-2.5 rounded bg-accent text-white text-[12px] lg:text-[11.5px] font-bold whitespace-nowrap hover:brightness-90">
                Approve all ({pending.length})
              </button>
            )}
            {due > 0 && (
              <button disabled={busy} onClick={() => onPayAll(g, payable, due)}
                className="h-9 lg:h-8 px-3 lg:px-2.5 rounded border border-line bg-white text-[12px] lg:text-[11.5px] font-semibold whitespace-nowrap hover:bg-wash">
                Pay all
              </button>
            )}
          </span>
        )}
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Hide ' + g.name + "'s expenses" : 'Show ' + g.name + "'s expenses"}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-white shrink-0">
          <Icon name="chevDown" size={16} className={'transition-transform ' + (open ? 'rotate-180' : '')} />
        </button>
      </div>
      {open && g.rows.map((e) => (
        <ExpenseRow key={e.id} e={e} busy={busy} locked={locked}
          onApprove={onApprove} onReject={onReject} onPay={onPay} onReceipt={onReceipt} />
      ))}
    </div>
  );
}

export function ReceiptModal({ receipt, onClose }: {
  receipt: { title: string; images: string[] };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-soft">
          <h2 className="text-[14px] font-bold">Receipt · {receipt.title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded hover:bg-wash flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {receipt.images.length === 0 ? <p className="text-[12.5px] text-muted text-center py-6">No receipt image.</p>
            // eslint-disable-next-line @next/next/no-img-element
            : receipt.images.map((img, i) => <img key={i} src={img} alt="receipt" className="w-full rounded border border-line" />)}
        </div>
      </div>
    </div>
  );
}
