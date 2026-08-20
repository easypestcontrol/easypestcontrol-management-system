'use client';

/* ============================================================================
   Wallets. A technician sees the cash sitting in their pocket — every rupee
   they collected, noted with invoice, customer, date and time. The office
   (admin / ops / accounts) sees every technician's wallet and marks the cash
   deposited when it reaches the drawer.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money } from 'shared';
import { api } from '@/lib/api';
import { initials } from '../contracts/lib';

interface Entry {
  receipt: string; invoiceId: string; customer: string;
  amount: number; date: string; at: string; settled: boolean;
}
interface Mine { kind: 'mine'; inHand: number; entries: Entry[] }
interface Office {
  kind: 'office';
  techs: Array<{ techId: string; name: string; color: string; inHand: number; entries: Entry[] }>;
}

const fmtDate = (iso: string) => {
  const p = iso.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
};

export default function WalletPage() {
  const [data, setData] = useState<Mine | Office | null>(null);
  const [note, setNote] = useState('');

  const load = () => api.get<Mine | Office>('/wallet').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  async function settle(techId: string, name: string) {
    setNote('');
    try {
      const r = await api.post<{ settled: number; amount: number }>('/wallet/settle', { techId });
      setNote(money(r.amount) + ' from ' + name + ' marked deposited (' + r.settled + ' receipts).');
      load();
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not settle'); }
  }

  if (!data) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  /* ------------------------------------------------------- technician view */
  if (data.kind === 'mine') {
    return (
      <div className="p-6 max-w-[760px]">
        <h1 className="text-[20px] font-semibold">My wallet</h1>
        <p className="text-muted text-[13px] mt-0.5 mb-5">
          Cash you collected on site. Deposit it at the office — accounts marks it received.
        </p>

        <section className="rounded-md border-2 border-navy p-5 mb-6 flex items-baseline justify-between">
          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted">Cash in hand</span>
            <span className="block text-[32px] font-bold text-navy leading-tight">{money(data.inHand)}</span>
          </div>
          <span className="text-[12px] text-muted max-w-[240px] text-right">
            Every collection is recorded against your name, with the date and time.
          </span>
        </section>

        <EntriesTable entries={data.entries} />
      </div>
    );
  }

  /* ------------------------------------------------------------ office view */
  return (
    <div className="p-6 max-w-[900px]">
      <h1 className="text-[20px] font-semibold">Collections & wallets</h1>
      <p className="text-muted text-[13px] mt-0.5 mb-5">
        Cash held by whoever took it — a technician on site, or anyone in the office who
        recorded a cash payment against an invoice. Mark it deposited when it reaches the
        drawer.
      </p>
      {note && <p className="text-[12.5px] font-medium text-navy mb-3">{note}</p>}

      {data.techs.length === 0 ? (
        <div className="rounded-md border border-line p-10 text-center text-muted text-[13px]">
          No cash collections recorded yet.
        </div>
      ) : data.techs.map((t) => (
        <section key={t.techId} className="rounded-md border border-line mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft bg-wash">
            <span className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                style={{ background: t.color }}>{initials(t.name)}</span>
              <span className="text-[13.5px] font-semibold">{t.name}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={'text-[15px] font-bold ' + (t.inHand > 0 ? 'text-accent' : 'text-navy')}>
                {money(t.inHand)} in hand
              </span>
              {t.inHand > 0 && (
                <button onClick={() => settle(t.techId, t.name)}
                  className="h-8 px-3.5 rounded bg-navy text-white text-[12px] font-semibold hover:brightness-110">
                  Mark deposited
                </button>
              )}
            </span>
          </div>
          <EntriesTable entries={t.entries} compact />
        </section>
      ))}
    </div>
  );
}

function EntriesTable({ entries, compact }: { entries: Entry[]; compact?: boolean }) {
  if (!entries.length) {
    return <p className="text-muted text-[12.5px] px-4 py-4">No cash entries.</p>;
  }
  return (
    <>
    {/* phones: receipt cards */}
    <div className="lg:hidden flex flex-col divide-y divide-line-soft">
      {entries.slice(0, compact ? 8 : 50).map((e) => (
        <Link key={e.receipt} href={'/invoices/' + e.invoiceId}
          className="flex items-center gap-3 px-4 py-3 active:bg-wash">
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-semibold truncate">{e.customer}</span>
            <span className="block text-[11px] text-muted mt-0.5">
              {e.receipt} · {fmtDate(e.date)}{e.at ? ' ' + e.at : ''}
            </span>
          </span>
          <span className="text-right shrink-0">
            <span className="block text-[14px] font-bold">{money(e.amount)}</span>
            {e.settled
              ? <span className="zpill navy">deposited</span>
              : <span className="zpill red">in hand</span>}
          </span>
        </Link>
      ))}
    </div>

    <table className="ztable max-lg:hidden">
      <thead><tr>
        <th>Receipt</th><th>Invoice</th><th>Customer</th><th>When</th>
        <th className="text-right">Amount</th><th className="text-right">Status</th>
      </tr></thead>
      <tbody>
        {entries.slice(0, compact ? 8 : 50).map((e) => (
          <tr key={e.receipt}>
            <td className="font-mono text-[12px]">{e.receipt}</td>
            <td><Link href={'/invoices/' + e.invoiceId} className="text-navy hover:text-accent font-medium">
              {e.invoiceId}</Link></td>
            <td className="max-w-[180px] truncate">{e.customer}</td>
            <td className="text-[12.5px]">{fmtDate(e.date)}{e.at ? ' · ' + e.at : ''}</td>
            <td className="text-right font-semibold">{money(e.amount)}</td>
            <td className="text-right">
              {e.settled
                ? <span className="zpill navy">deposited</span>
                : <span className="zpill red">in hand</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}
