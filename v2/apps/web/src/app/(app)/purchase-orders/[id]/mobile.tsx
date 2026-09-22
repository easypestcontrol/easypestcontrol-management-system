'use client';

/* ============================================================================
   One purchase order, on a phone.

   Opened standing at a delivery: the van has arrived and somebody needs to
   know whether what is on it matches what was ordered. So the counts lead —
   packs received against packs ordered, line by line — and the money is
   secondary, because nobody argues about the rate while the driver waits.
   ========================================================================== */

import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, Screen, niceDate, type Tone } from '@/components/mobile';

interface Line {
  id: number; itemId: string; name: string; baseUnit: string;
  packUnit: string; packSize: number; qty: number; rate: number; receivedQty: number;
}
interface Po {
  id: string; date: string; expected: string; status: string; notes: string;
  items: Line[];
  vendor: { id: string; name: string; phone: string; city: string } | null;
}

/**
 * What the order is worth, in base units rather than rupees.
 *
 * This line used to print `money(po.totals.total)` and crashed the screen:
 * the API sends no `totals` on a purchase order, and it never did. That is
 * not an oversight to paper over with a zero — an order says what we want and
 * how much of it, and the price is whatever the vendor invoices (the printed
 * document carries no money either, deliberately). Every rate in the payload
 * is 0, so the figure would have read "₹0" even had it not thrown.
 *
 * So the line says what the order actually is: 5,000 ml, 4 nos.
 */
function orderSize(items: Line[]): string {
  const by = new Map<string, number>();
  for (const l of items) {
    const unit = l.baseUnit || 'nos';
    by.set(unit, (by.get(unit) || 0) + l.qty * (l.packSize || 1));
  }
  return [...by].map(([u, n]) => n.toLocaleString('en-IN') + ' ' + u).join(' · ');
}

function stateOf(po: Po): { tone: Tone; label: string } {
  const ordered = po.items.reduce((a, l) => a + l.qty, 0);
  const got = po.items.reduce((a, l) => a + l.receivedQty, 0);
  if (po.status === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (po.status === 'draft') return { tone: 'plain', label: 'Draft' };
  if (got >= ordered && ordered > 0) return { tone: 'good', label: 'All received' };
  if (got > 0) return { tone: 'warn', label: `${got} of ${ordered} packs received` };
  return { tone: 'info', label: 'Nothing received yet' };
}

export default function PoMobile({ po, onReceive, canReceive }: {
  po: Po; onReceive: () => void; canReceive: boolean;
}) {
  const st = stateOf(po);
  const ordered = po.items.reduce((a, l) => a + l.qty, 0);
  const got = po.items.reduce((a, l) => a + l.receivedQty, 0);
  const outstanding = got < ordered;

  return (
    <Screen>
      <BackBar title={po.id} fallback={'/purchase-orders'} sub={po.vendor?.name || undefined} />
      <div className="bg-white px-4 pt-3 pb-5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
          Packs received
        </p>
        <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">
          {got}<span className="text-muted-2"> / {ordered}</span>
        </p>
        <p className="text-[13.5px] text-muted mt-1">
          {po.id} · {orderSize(po.items)}
        </p>
        <div className="mt-2.5"><Chip tone={st.tone}>{st.label}</Chip></div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {po.vendor && (
          <Card>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold truncate">{po.vendor.name}</span>
                <span className="block text-[13px] text-muted truncate mt-0.5">
                  {[po.vendor.city, 'ordered ' + niceDate(po.date),
                    po.expected ? 'due ' + niceDate(po.expected) : '']
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              {po.vendor.phone && (
                <a href={'tel:' + po.vendor.phone} aria-label="Call the vendor"
                  className="w-11 h-11 rounded-full bg-rose flex items-center justify-center shrink-0">
                  <Icon name="phone" size={19} className="text-rose-ink" />
                </a>
              )}
            </div>
          </Card>
        )}

        {/* Line by line, because a delivery is checked line by line. */}
        <Card title="What was ordered" flush className="mb-4">
          {po.items.map((l) => {
            const done = l.receivedQty >= l.qty;
            const part = l.receivedQty > 0 && !done;
            return (
              <div key={l.id} className="px-4 py-3.5 border-b border-line-soft last:border-b-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold truncate">{l.name}</span>
                  <span className="text-[15px] font-bold tabular-nums shrink-0">
                    {l.receivedQty}/{l.qty}
                  </span>
                </span>
                {/* The pack arithmetic, in the vendor's units and ours — the
                    same line the printed order carries. A rate is only shown
                    when one was actually agreed; printing "₹0 each" against
                    every line, which is what the payload holds, says the
                    chemical is free. */}
                <span className="block text-[13px] text-muted mt-0.5">
                  {l.packSize > 1
                    /* "10 packet × 500 g = 5,000 g" — what we ordered in the
                       vendor's units and what it means in ours. */
                    ? l.qty + ' ' + (l.packUnit || 'pack') + ' × ' + l.packSize + ' '
                      + l.baseUnit + ' = '
                      + (l.qty * l.packSize).toLocaleString('en-IN') + ' ' + l.baseUnit
                    /* A pack of one is just a quantity; the multiplication
                       only makes it look like there is something to check. */
                    : l.qty.toLocaleString('en-IN') + ' ' + l.baseUnit}
                  {l.rate > 0 ? ' · ₹' + Math.round(l.rate).toLocaleString('en-IN') + ' each' : ''}
                </span>
                <span className="block mt-1.5">
                  <Chip tone={done ? 'good' : part ? 'warn' : 'info'}>
                    {done ? 'Received' : part ? 'Part received' : 'Not arrived'}
                  </Chip>
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      {canReceive && outstanding && po.status !== 'cancelled' && (
        <div className="lg:hidden fixed left-0 right-0 z-30 bottom-[calc(max(12px,env(safe-area-inset-bottom))+70px)] bg-white border-t border-line
          px-4 pt-2.5 pb-2.5">
          <button onClick={onReceive}
            className="w-full h-[52px] rounded-xl bg-accent text-white font-bold text-[16px]
              active:brightness-90">
            Mark what arrived
          </button>
        </div>
      )}
    </Screen>
  );
}
