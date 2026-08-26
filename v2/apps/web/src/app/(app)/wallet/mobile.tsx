'use client';

/* ============================================================================
   Wallets, on a phone.

   Two different screens behind one route. A technician sees his own cash in
   hand and every receipt behind it — the number he will be asked to hand
   over. The office sees each technician's holding, so it can tell at a
   glance who is carrying money that has not come back yet.

   Cash in hand leads either way, because unhanded cash is the only thing on
   this screen that can go wrong.
   ========================================================================== */

import { BackBar, Card, Chip, Screen, money, niceDate } from '@/components/mobile';

interface Entry {
  receipt: string; invoiceId: string; customer: string;
  amount: number; date: string; settled: boolean;
}
interface Mine { kind: 'mine'; inHand: number; entries: Entry[] }
interface Office {
  kind: 'office';
  techs: Array<{ techId: string; name: string; color: string; inHand: number; entries: Entry[] }>;
}

function Receipts({ entries }: { entries: Entry[] }) {
  const open = entries.filter((e) => !e.settled);
  const rows = open.length ? open : entries;
  return (
    <>
      {rows.slice(0, 12).map((e) => (
        <div key={e.receipt} className="px-4 py-3 border-b border-line-soft last:border-b-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-bold truncate">{e.customer}</span>
            <span className="text-[15px] font-bold tabular-nums shrink-0">{money(e.amount)}</span>
          </span>
          <span className="block text-[13px] text-muted mt-0.5">
            {[niceDate(e.date), e.invoiceId, e.receipt].filter(Boolean).join(' · ')}
          </span>
          <span className="block mt-1.5">
            <Chip tone={e.settled ? 'good' : 'warn'}>
              {e.settled ? 'Handed over' : 'Still in hand'}
            </Chip>
          </span>
        </div>
      ))}
    </>
  );
}

export default function WalletMobile({ data }: { data: Mine | Office | null }) {
  if (!data) {
    return (
      <Screen>
      <BackBar title="Collections" fallback={'/dashboard'} />
        <div className="px-4 pt-4 flex flex-col gap-3">
          {[0, 1].map((i) => <div key={i} className="h-[120px] rounded-2xl bg-white animate-pulse" />)}
        </div>
      </Screen>
    );
  }

  /* ------------------------------------------------------------ one person */
  if (data.kind === 'mine') {
    return (
      <Screen>
      <BackBar title="Collections" fallback={'/dashboard'} />
        <div className="bg-white px-4 pt-3 pb-5 text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
            Cash in your hand
          </p>
          <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">
            {money(data.inHand)}
          </p>
          <p className="text-[13.5px] text-muted mt-1">
            {data.inHand > 0
              ? 'Hand this to the office and it clears'
              : 'Nothing to hand over'}
          </p>
        </div>
        <div className="px-4 pt-3">
          {data.entries.length > 0 ? (
            <Card title="What you collected" flush className="mb-4">
              <Receipts entries={data.entries} />
            </Card>
          ) : (
            <Card>
              <p className="text-[16px] font-bold text-center">No collections yet</p>
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                Cash you take against an invoice appears here until you hand it in.
              </p>
            </Card>
          )}
        </div>
      </Screen>
    );
  }

  /* ---------------------------------------------------------- the office */
  const holding = data.techs.filter((t) => t.inHand > 0);
  const total = data.techs.reduce((a, t) => a + t.inHand, 0);

  return (
    <Screen>
      <BackBar title="Collections" fallback={'/dashboard'} />
      <div className="bg-white px-4 pt-3 pb-5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
          Cash out with the team
        </p>
        <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">{money(total)}</p>
        <p className="text-[13.5px] text-muted mt-1">
          {holding.length
            ? `${holding.length} ${holding.length === 1 ? 'person is' : 'people are'} carrying it`
            : 'Everything has been handed in'}
        </p>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {data.techs.map((t) => (
          <Card key={t.techId} flush>
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line-soft">
              <span className="w-10 h-10 rounded-full text-white text-[13px] font-bold
                flex items-center justify-center shrink-0"
                style={{ background: t.color || '#141414' }}>
                {t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold truncate">{t.name}</span>
                <span className="block text-[13px] text-muted mt-0.5">
                  {t.entries.filter((e) => !e.settled).length} open receipts
                </span>
              </span>
              <span className={'text-[17px] font-bold tabular-nums shrink-0 '
                + (t.inHand > 0 ? 'text-rose-ink' : 'text-muted-2')}>
                {money(t.inHand)}
              </span>
            </div>
            {t.inHand > 0 && <Receipts entries={t.entries} />}
          </Card>
        ))}
        <div className="h-2" />
      </div>
    </Screen>
  );
}
