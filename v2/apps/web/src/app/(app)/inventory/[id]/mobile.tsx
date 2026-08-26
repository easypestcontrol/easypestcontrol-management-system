'use client';

/* ============================================================================
   One stock item, on a phone.

   Asked in the store or on the way to a job: how much is left, where is it,
   and is more coming. So the quantity leads, the per-branch split sits under
   it because "we have 12 litres" is useless if all twelve are in Madurai,
   and the movement ledger is last — it answers "where did it go?", which is
   a question asked after the fact.
   ========================================================================== */

import { Card, Chip, Screen, niceDate, type Tone } from '@/components/mobile';

interface Move {
  id: number; date: string; qty: number; dir: string;
  jobId: string; note: string; branchName?: string; vendor?: string;
}
interface Item {
  id: string; name: string; cat: string; unit: string;
  stock: number; reorder: number; note: string; onOrder: number;
  branches: Array<{ branchId: string; qty: number; reorder: number }>;
  moves: Move[];
}

function stockState(i: Item): { tone: Tone; label: string } {
  if (i.stock <= 0) return { tone: 'bad', label: 'Out of stock' };
  if (i.stock < i.reorder) return { tone: 'warn', label: 'Below reorder level' };
  return { tone: 'good', label: 'In stock' };
}

/** in / out / transfer, said the way a storekeeper would say it. */
function moveWords(m: Move): { tone: Tone; label: string } {
  if (m.dir === 'in') return { tone: 'good', label: m.vendor ? 'Received' : 'Added' };
  if (m.dir === 'out') return { tone: 'bad', label: m.jobId ? 'Used on a job' : 'Issued' };
  return { tone: 'info', label: 'Moved between branches' };
}

export default function ItemMobile({ item, branchName, onIssue, onMove, canManage }: {
  item: Item;
  branchName: (id: string) => string;
  onIssue: () => void;
  onMove: () => void;
  canManage: boolean;
}) {
  const st = stockState(item);

  return (
    <Screen>
      <div className="bg-white px-4 pt-3 pb-5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">On the shelf</p>
        <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">
          {item.stock}<span className="text-[22px] text-muted-2 font-semibold"> {item.unit}</span>
        </p>
        <p className="text-[13.5px] text-muted mt-1">
          {item.name} · {item.cat}
        </p>
        <div className="mt-2.5 flex items-center justify-center gap-2">
          <Chip tone={st.tone}>{st.label}</Chip>
          {item.onOrder > 0 && <Chip tone="info">{item.onOrder} {item.unit} on order</Chip>}
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {/* Twelve litres is useless if all twelve are in another city. */}
        {item.branches.length > 0 && (
          <Card title="Where it is" flush>
            {item.branches.map((b) => (
              <div key={b.branchId}
                className="flex items-center justify-between px-4 py-3 border-b border-line-soft last:border-b-0">
                <span className="text-[14.5px]">{branchName(b.branchId) || b.branchId}</span>
                <span className="text-[15px] font-bold tabular-nums">
                  {b.qty} <span className="text-[13px] text-muted font-normal">{item.unit}</span>
                </span>
              </div>
            ))}
          </Card>
        )}

        {item.note && (
          <Card title="Note"><p className="text-[14.5px] leading-relaxed">{item.note}</p></Card>
        )}

        {item.moves.length > 0 && (
          <Card title="Movements" flush className="mb-4">
            {item.moves.slice(0, 12).map((m) => {
              const w = moveWords(m);
              return (
                <div key={m.id} className="px-4 py-3 border-b border-line-soft last:border-b-0">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-bold tabular-nums">
                      {m.dir === 'out' ? '−' : '+'}{Math.abs(m.qty)} {item.unit}
                    </span>
                    <span className="text-[13px] text-muted">{niceDate(m.date)}</span>
                  </span>
                  <span className="block text-[13px] text-muted mt-0.5">
                    {[m.branchName, m.vendor, m.jobId, m.note].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block mt-1.5"><Chip tone={w.tone}>{w.label}</Chip></span>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {canManage && (
        <div className="lg:hidden fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-line
          px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] flex gap-2">
          <button onClick={onIssue}
            className="flex-1 h-[52px] rounded-xl bg-accent text-white font-bold text-[15.5px]
              active:brightness-90">
            Issue to a technician
          </button>
          <button onClick={onMove}
            className="w-[52px] h-[52px] rounded-xl bg-wash font-bold text-[20px] active:brightness-95"
            aria-label="Move between branches">⇄</button>
        </div>
      )}
    </Screen>
  );
}
