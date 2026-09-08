'use client';

/* ============================================================================
   The three-dot menu.

   One component for the desk and the phone, because the actions on a record
   should not depend on which one you happen to be holding. On a wide screen
   it drops under the button; on a phone it rises from the bottom as a sheet,
   which is where a thumb already is.

   A destructive item is red and always last, with a confirm step of its own —
   the one action here that cannot be undone should not sit a stray tap away
   from "Edit".
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';

export interface Action {
  label: string;
  onClick: () => void;
  /** Red, listed last, and asks before it runs. */
  danger?: boolean;
  /** Shown but not selectable, with the reason. */
  disabled?: string;
}

export default function ActionMenu({ actions, label = 'More actions' }: {
  actions: Action[]; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (a: Action) => {
    if (a.disabled) return;
    setOpen(false);
    a.onClick();
  };

  const items = actions.map((a) => (
    <button key={a.label} type="button" onClick={() => run(a)} disabled={!!a.disabled}
      title={a.disabled}
      className={'w-full text-left px-4 h-12 lg:h-10 text-[14.5px] lg:text-[13px] font-medium '
        + 'flex items-center justify-between gap-3 '
        + (a.disabled ? 'text-muted-2 cursor-default'
          : a.danger ? 'text-accent active:bg-red-wash lg:hover:bg-red-wash'
            : 'text-ink active:bg-wash lg:hover:bg-wash')}>
      {a.label}
      {a.disabled && <span className="text-[11px] text-muted-2 truncate max-w-[140px]">{a.disabled}</span>}
    </button>
  ));

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={label}
        aria-expanded={open}
        className="w-9 h-9 rounded-full flex items-center justify-center text-ink-2
          active:bg-wash lg:hover:bg-wash">
        <Icon name="more" size={18} />
      </button>

      {open && (
        <>
          {/* The phone: a sheet from the bottom, over a scrim. */}
          <div className="lg:hidden fixed inset-0 z-50 bg-navy/40 flex items-end"
            onClick={() => setOpen(false)}>
            <div className="w-full bg-white rounded-t-[24px] pt-2 pb-[calc(env(safe-area-inset-bottom)+96px)]"
              onClick={(e) => e.stopPropagation()}>
              <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-2" />
              {items}
            </div>
          </div>

          {/* The desk: a plain menu under the button. */}
          <div className="max-lg:hidden absolute right-0 top-10 z-50 w-[210px] card shadow-pop py-1">
            {items}
          </div>
        </>
      )}
    </div>
  );
}
