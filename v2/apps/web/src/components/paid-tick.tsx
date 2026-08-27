'use client';

/* ============================================================================
   The moment the money lands.

   A payment that records itself is the best thing this app does and the
   easiest to miss: the screen changes behind a dialog somebody is still
   looking at, so they close it believing nothing happened. That is exactly
   what happened on the first live rupee — paid, receipted, and the person who
   took it had no idea.

   So it is drawn. The ring closes, the tick strikes, the amount rises, and
   only then does the dialog stand aside. Somebody just handed over money;
   half a second of acknowledgement is not decoration.

   The keyframes live in globals.css, and they collapse to nothing under
   prefers-reduced-motion — the words still arrive, which is the part that
   matters.
   ========================================================================== */

import { money } from 'shared';

export default function PaidTick({ amount, receiptId, settled, note }: {
  amount: number;
  receiptId?: string;
  /** How many invoices this payment settled, when it settled more than one. */
  settled?: number;
  note?: string;
}) {
  return (
    <div className="py-9 text-center">
      <svg viewBox="0 0 60 60" className="w-[76px] h-[76px] mx-auto paid-pop" aria-hidden="true">
        <circle cx="30" cy="30" r="27" fill="none" stroke="#17624A"
          strokeWidth="3.5" strokeLinecap="round" className="paid-ring"
          transform="rotate(-90 30 30)" />
        <path d="M19 30.5 L26.5 38 L41 22.5" fill="none" stroke="#17624A"
          strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="paid-mark" />
      </svg>

      <p className="paid-rise text-[20px] font-bold tracking-[-0.01em] mt-4">
        {money(amount)} received
      </p>
      <p className="paid-rise-2 text-[13px] text-muted mt-1.5 px-4 leading-relaxed">
        {note || (
          <>
            Receipt {receiptId || 'issued'}
            {settled && settled > 1 ? ` · settled ${settled} invoices, oldest first` : ''}
          </>
        )}
      </p>
    </div>
  );
}
