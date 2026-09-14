'use client';

/* ============================================================================
   A choice that belongs to this app.

   A native <select> on a phone hands the screen to the operating system: a
   full-height list in system type with a blue highlight bar, sitting on top of
   whatever you were filling in. With sixteen services in it you cannot see
   what anything costs, you cannot search, and you cannot tell where the list
   ends — and it is the one control in the form that does not look like the
   form.

   So below `lg` this is a field that opens our own sheet: the options as rows
   you tap, a tick against the one that is chosen, a note on the right for the
   price or whatever else the caller needs, and a search box once the list is
   long enough to need one.

   At a desk it stays a real <select>. A mouse and a keyboard are what that
   control was designed for, and the desk has no complaint.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

export interface SheetOption {
  value: string;
  label: string;
  /** Shown on the right of the row — a price, a code, a count. */
  note?: string;
}

export default function SelectSheet({
  value, onChange, options, placeholder = 'Choose…', title, className = '', disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SheetOption[];
  placeholder?: string;
  /** The sheet's heading. Defaults to the placeholder. */
  title?: string;
  /** The classes the surrounding form uses for its fields. */
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const picked = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => (o.label + ' ' + (o.note || '')).toLowerCase().includes(needle))
    : options;

  return (
    <>
      {/* the desk keeps its select */}
      <select value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={'max-lg:hidden ' + className}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* the phone gets a field that opens a sheet */}
      <button type="button" disabled={disabled}
        onClick={() => { setQ(''); setOpen(true); }}
        className={'lg:hidden text-left flex items-center justify-between gap-2 ' + className}>
        <span className={'truncate ' + (picked ? '' : 'text-muted-2')}>
          {picked ? picked.label : placeholder}
        </span>
        <Icon name="chevDown" size={16} className="text-muted-2 shrink-0" />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[80] bg-navy/45 flex items-end"
          onClick={() => setOpen(false)}>
          <div className="w-full bg-white text-ink rounded-t-[24px] pt-2 max-h-[78vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1 shrink-0" />
            <div className="px-5 py-2 flex items-center justify-between gap-3 shrink-0">
              <p className="text-[16px] font-bold">{title || placeholder}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-2 active:bg-wash">
                <Icon name="x" size={16} />
              </button>
            </div>

            {options.length > 8 && (
              <div className="px-4 pb-2 shrink-0">
                <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-ground">
                  <Icon name="search" size={16} className="text-muted-2 shrink-0" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                    placeholder="Search"
                    className="flex-1 min-w-0 bg-transparent text-[15px] outline-none" />
                </label>
              </div>
            )}

            <div className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
              {shown.length === 0 ? (
                <p className="px-5 py-6 text-[14px] text-muted">Nothing matches that.</p>
              ) : shown.map((o) => {
                const on = o.value === value;
                return (
                  <button key={o.value} type="button"
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    className={'w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 '
                      + 'border-b border-line-soft last:border-b-0 active:bg-wash '
                      + (on ? 'bg-rose' : '')}>
                    <span className={'text-[15px] min-w-0 truncate '
                      + (on ? 'font-bold text-accent' : 'font-medium')}>
                      {o.label}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {o.note && <span className="text-[13.5px] text-muted">{o.note}</span>}
                      {on && <Icon name="check" size={16} className="text-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
