'use client';

/* ============================================================================
   One quotation, on a phone.

   Opened to send it, chase it, or read the price out loud. So the total
   leads, the approval link is one tap away as a WhatsApp message, and the
   lines are there to answer "what's included?" without opening a PDF.

   Printing and editing stay on the desktop: a quotation is composed sitting
   down, and pretending otherwise produces a document nobody wants to send.
   ========================================================================== */

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Card, Chip, Screen, money, niceDate, type Tone } from '@/components/mobile';

interface Item { svId: string; desc: string; qty: number; rate: number }
interface Party { name: string; contact: string; phone: string; city: string }

function stateOf(status: string): { tone: Tone; label: string } {
  if (status === 'approved') return { tone: 'good', label: 'Approved' };
  if (status === 'rejected') return { tone: 'bad', label: 'Turned down' };
  if (status === 'sent') return { tone: 'info', label: 'With the customer' };
  return { tone: 'plain', label: 'Draft' };
}

export default function QuoteMobile({ q, total, rows, approveUrl, waText }: {
  q: {
    id: string; date: string; status: string; mode: string; title: string;
    months: number; freq: string; items: Item[]; party: Party | null;
  };
  total: number;
  /** The tax breakdown the document already computed — not recomputed here. */
  rows: Array<[string, number]>;
  approveUrl: string;
  waText: string;
}) {
  const st = stateOf(q.status);
  const phone = (q.party?.phone || '').replace(/\D/g, '').slice(-10);

  return (
    <Screen>
      <div className="bg-white px-4 pt-3 pb-5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-muted">
          {q.mode === 'amc' ? 'Contract value' : 'Quoted'}
        </p>
        <p className="text-[38px] font-bold tracking-[-0.03em] tabular-nums mt-1">{money(total)}</p>
        <p className="text-[13.5px] text-muted mt-1">
          {q.id} · {niceDate(q.date)}
          {q.mode === 'amc' && q.months ? ` · ${q.months} months` : ''}
        </p>
        <div className="mt-2.5"><Chip tone={st.tone}>{st.label}</Chip></div>

        <div className="grid grid-cols-3 gap-1.5 mt-5">
          {phone && (
            <a href={'https://wa.me/91' + phone + '?text=' + encodeURIComponent(waText)}
              className="flex flex-col items-center gap-1.5 active:opacity-60">
              <span className="w-[46px] h-[46px] rounded-full bg-mint flex items-center justify-center">
                <Icon name="upload" size={19} className="text-mint-ink" />
              </span>
              <span className="text-[12.5px] text-muted font-medium">Send</span>
            </a>
          )}
          {phone && (
            <a href={'tel:' + q.party?.phone} className="flex flex-col items-center gap-1.5 active:opacity-60">
              <span className="w-[46px] h-[46px] rounded-full bg-wash flex items-center justify-center">
                <Icon name="phone" size={19} />
              </span>
              <span className="text-[12.5px] text-muted font-medium">Call</span>
            </a>
          )}
          <a href={approveUrl} className="flex flex-col items-center gap-1.5 active:opacity-60">
            <span className="w-[46px] h-[46px] rounded-full bg-wash flex items-center justify-center">
              <Icon name="quote" size={19} />
            </span>
            <span className="text-[12.5px] text-muted font-medium">Open</span>
          </a>
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {q.party && (
          <Card>
            <span className="block text-[15.5px] font-bold truncate">{q.party.name}</span>
            <span className="block text-[13px] text-muted truncate mt-0.5">
              {[q.party.contact, q.party.city].filter(Boolean).join(' · ')}
            </span>
          </Card>
        )}

        <Card title="What is included" flush>
          {q.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 px-4 py-3 border-b border-line-soft">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-medium">{it.desc}</span>
                {it.qty > 1 && (
                  <span className="block text-[12.5px] text-muted mt-0.5">
                    {it.qty} × {money(it.rate)}
                  </span>
                )}
              </span>
              <span className="text-[14.5px] font-semibold tabular-nums shrink-0">
                {money(it.qty * it.rate)}
              </span>
            </div>
          ))}
          <div className="px-4 py-3 flex flex-col gap-1.5">
            {rows.map(([label, value]) => (
              <span key={label} className="flex justify-between text-[13.5px]">
                <span className="text-muted">{label}</span>
                <span className="font-semibold tabular-nums">{money(value)}</span>
              </span>
            ))}
            <span className="flex justify-between text-[17px] font-bold mt-1 pt-2 border-t border-line">
              <span>Total</span><span className="tabular-nums">{money(total)}</span>
            </span>
          </div>
        </Card>

        {/* The link the customer taps to accept. Copyable, because a phone
            keyboard is the worst way to retype a URL. */}
        <Card title="Approval link">
          <button
            onClick={() => navigator.clipboard?.writeText(approveUrl).catch(() => {})}
            className="w-full text-left rounded-xl bg-ground px-3.5 py-3 active:brightness-95">
            <span className="block text-[13px] break-all">{approveUrl}</span>
            <span className="block text-[12.5px] text-accent font-semibold mt-1.5">Tap to copy</span>
          </button>
        </Card>

        <p className="text-[13px] text-muted text-center px-4 pb-4 leading-relaxed">
          Editing and printing are on the desktop — a quotation is composed sitting down.
        </p>
      </div>
    </Screen>
  );
}
