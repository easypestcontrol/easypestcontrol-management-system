'use client';

/* ============================================================================
   Asking before doing.

   The browser's own confirm() is a grey strip nailed to the top of the window
   with the site's hostname on it. It looks like the browser talking, not the
   app, and on a phone it is the single most out-of-place thing on the screen.

   This is the app asking: a white card in the middle, the question in plain
   words, and two buttons that say what they do. The one that goes ahead is
   solid — red when the thing cannot be undone — and the one that backs out is
   outlined, so the safe choice is never the loud one.
   ========================================================================== */

import { useEffect } from 'react';

export interface ConfirmSpec {
  title: string;
  /** One line under the title. What actually happens. */
  body?: string;
  /** The button that goes ahead. Say the verb: "Delete", "Raise invoice". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Solid red instead of solid black — for anything that cannot be undone. */
  danger?: boolean;
  onConfirm: () => void;
}

export default function Confirm({ spec, onClose }: {
  spec: ConfirmSpec | null; onClose: () => void;
}) {
  useEffect(() => {
    if (!spec) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [spec, onClose]);

  if (!spec) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-navy/45 flex items-center justify-center p-5"
      onClick={onClose}>
      <div className="w-full max-w-[360px] bg-white rounded-[22px] p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-bold leading-snug">{spec.title}</h2>
        {spec.body && (
          <p className="text-[13.5px] text-muted mt-2 leading-relaxed">{spec.body}</p>
        )}
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button"
            onClick={() => { onClose(); spec.onConfirm(); }}
            className={'h-12 rounded-xl text-white text-[15px] font-bold active:brightness-90 '
              + (spec.danger ? 'bg-accent' : 'bg-navy')}>
            {spec.confirmLabel}
          </button>
          <button type="button" onClick={onClose}
            className={'h-12 rounded-xl bg-white text-[15px] font-semibold border active:bg-wash '
              + (spec.danger ? 'border-accent text-accent' : 'border-line text-ink')}>
            {spec.cancelLabel || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
