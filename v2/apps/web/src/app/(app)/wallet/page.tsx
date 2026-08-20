'use client';

/* ============================================================================
   Wallets. A technician sees the cash sitting in their pocket — every rupee
   they collected, noted with invoice, customer, date and time. The office
   (admin / ops / accounts) sees every holder's wallet and marks the cash
   deposited when it reaches the drawer.

   The office view is built to be read in five seconds: a summary strip, then
   ONE line per person — who, how many receipts, how much. The receipts
   themselves are behind a tap, not dumped on the page.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money } from 'shared';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
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
  const [open, setOpen] = useState<string>(''); // which wallet is expanded

  const load = () => api.get<Mine | Office>('/wallet').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  async function settle(techId: string, name: string, amount: number, count: number) {
    if (!window.confirm(
      `Take ${money(amount)} from ${name} into the drawer?\n` +
      `All ${count} in-hand receipt${count === 1 ? '' : 's'} will be marked deposited ` +
      `and ${name} gets a confirmation.`,
    )) return;
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
  const holders = data.techs.filter((t) => t.inHand > 0);
  const cleared = data.techs.filter((t) => t.inHand === 0);
  const fieldCash = holders.reduce((a, t) => a + t.inHand, 0);
  const receiptsOut = holders.reduce((a, t) => a + t.entries.filter((e) => !e.settled).length, 0);

  return (
    <div className="p-4 lg:p-6 max-w-[900px]">
      <h1 className="text-[20px] font-semibold">Collections &amp; wallets</h1>
      <p className="text-muted text-[13px] mt-0.5 mb-4">
        Cash collected against invoices sits in the collector&rsquo;s wallet until it
        reaches the office drawer. Tap a person to see their receipts.
      </p>
      {note && <p className="text-[12.5px] font-medium text-navy mb-3">{note}</p>}

      {/* ------------------------------------------------ the summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Cash in the field</p>
          <p className={'mt-1 text-[20px] font-bold leading-none ' + (fieldCash > 0 ? 'text-accent' : 'text-ink')}>
            {money(fieldCash)}
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Holding it</p>
          <p className="mt-1 text-[20px] font-bold leading-none">
            {holders.length} <span className="text-[12px] font-normal text-muted">people</span>
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Receipts out</p>
          <p className="mt-1 text-[20px] font-bold leading-none">{receiptsOut}</p>
        </div>
      </div>

      {data.techs.length === 0 ? (
        <div className="rounded-md border border-line p-10 text-center text-muted text-[13px]">
          No cash collections recorded yet.
        </div>
      ) : (
        <>
          {/* --------------------- people still holding cash, one line each */}
          {holders.map((t) => {
            const openNow = open === t.techId;
            const held = t.entries.filter((e) => !e.settled);
            return (
              <section key={t.techId}
                className={'rounded-md border mb-3 overflow-hidden bg-white shadow-card ' +
                  (openNow ? 'border-navy' : 'border-line')}>
                <button onClick={() => setOpen(openNow ? '' : t.techId)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-wash">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ background: t.color }}>{initials(t.name)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate">{t.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {held.length} receipt{held.length === 1 ? '' : 's'} in hand
                    </span>
                  </span>
                  <span className="text-[15px] font-bold text-accent shrink-0">{money(t.inHand)}</span>
                  <Icon name="chevDown" size={14}
                    className={'text-muted-2 shrink-0 transition-transform ' + (openNow ? 'rotate-180' : '')} />
                </button>

                {openNow && (
                  <div className="border-t border-line-soft">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-wash border-b border-line-soft">
                      <span className="text-[12px] text-muted">
                        When the cash reaches the drawer, close the wallet in one go:
                      </span>
                      <button onClick={() => settle(t.techId, t.name, t.inHand, held.length)}
                        className="h-8 px-3.5 rounded bg-navy text-white text-[12px] font-semibold hover:brightness-110 shrink-0">
                        Mark {money(t.inHand)} deposited
                      </button>
                    </div>
                    <EntriesTable entries={held} compact />
                    <DepositedHistory entries={t.entries.filter((e) => e.settled)} />
                  </div>
                )}
              </section>
            );
          })}

          {holders.length === 0 && (
            <div className="rounded-md border border-line p-6 text-center text-[13px] text-muted mb-3">
              Every rupee collected has reached the drawer — no cash in the field.
            </div>
          )}

          {/* ------------- everyone square with the drawer, tucked at the end */}
          {cleared.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-muted hover:text-ink">
                All settled — {cleared.length} {cleared.length === 1 ? 'person' : 'people'} with nothing in hand
              </summary>
              <div className="mt-2">
                {cleared.map((t) => {
                  const openNow = open === t.techId;
                  return (
                    <section key={t.techId} className="rounded-md border border-line mb-2 overflow-hidden bg-white">
                      <button onClick={() => setOpen(openNow ? '' : t.techId)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-wash">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                          style={{ background: t.color }}>{initials(t.name)}</span>
                        <span className="flex-1 text-[13px] font-medium truncate">{t.name}</span>
                        <span className="zpill navy shrink-0">all deposited</span>
                        <Icon name="chevDown" size={13}
                          className={'text-muted-2 shrink-0 transition-transform ' + (openNow ? 'rotate-180' : '')} />
                      </button>
                      {openNow && <div className="border-t border-line-soft"><EntriesTable entries={t.entries} compact /></div>}
                    </section>
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Old receipts that already reached the drawer — kept close but out of the way. */
function DepositedHistory({ entries }: { entries: Entry[] }) {
  const [show, setShow] = useState(false);
  if (!entries.length) return null;
  return (
    <div className="border-t border-line-soft">
      <button onClick={() => setShow(!show)}
        className="w-full text-left px-4 py-2 text-[12px] font-semibold text-muted hover:text-ink hover:bg-wash">
        {show ? 'Hide' : 'Show'} deposited history ({entries.length})
      </button>
      {show && <EntriesTable entries={entries} compact />}
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
