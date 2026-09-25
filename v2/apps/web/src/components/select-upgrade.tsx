'use client';

/* ============================================================================
   Every dropdown in the app, on a phone.

   A native <select> hands the screen to the operating system: a full-height
   list in system type with a blue highlight bar, dropped on top of whatever
   you were filling in. It is the one control in this app that is not this
   app, and there are eighty-one of them across thirty screens — customer
   type, branch, technician, category, quotation type, frequency, every one.

   Editing eighty-one call sites to wrap each in a component is thirty files
   of risk for one behaviour. So this is one listener instead: on a phone it
   catches the tap BEFORE the operating system opens its list, reads the
   options straight out of the <select> that was tapped, and shows them as our
   own sheet. A tap, not a touch: a finger that lands on a select on its way
   to scrolling the form opens nothing. Choosing one writes the value back through React's own setter and fires the change event, so every form keeps working exactly as it did —
   no props, no rewrites, and a <select> added tomorrow is upgraded too.

   A desk keeps the real control: a mouse and a keyboard are what it was
   designed for. Anything that genuinely wants the native list can say so with
   `data-native`.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

interface Opt { value: string; label: string; group: string; disabled: boolean }

/** The options of a <select>, flattened, with their group names kept. */
function optionsOf(el: HTMLSelectElement): Opt[] {
  return Array.from(el.querySelectorAll('option')).map((o) => ({
    value: o.value,
    label: (o.label || o.textContent || '').trim(),
    group: (o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : '') || '',
    disabled: o.disabled,
  }));
}

/**
 * Set the value the way React will notice.
 *
 * React tracks the last value it wrote on the DOM node; assigning `.value`
 * directly leaves that tracker untouched, so the change event is swallowed as
 * a no-op and the form never hears about the choice. Going through the
 * prototype's setter updates the node without the tracker seeing it, and the
 * dispatched event then reads as a real change.
 */
function writeValue(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function SelectUpgrade() {
  const [el, setEl] = useState<HTMLSelectElement | null>(null);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    const phone = () => window.matchMedia('(max-width: 1023px)').matches;

    /** The <select> this event is about, if it is one we take over. */
    const selectOf = (e: Event) => {
      if (!phone()) return null;
      const t = e.target as HTMLElement | null;
      const sel = t?.closest?.('select') as HTMLSelectElement | null;
      if (!sel || sel.disabled || sel.multiple || sel.dataset.native !== undefined) return null;
      if (!sel.options.length) return null;
      return sel;
    };

    /* A finger landing on a select is not yet a choice: on a form with thirty
       fields it is usually the start of a scroll. So nothing opens on the
       touch. What we cancel is the mousedown — from a mouse, or the one a
       tap synthesises after the finger lifts — because that is the event the
       operating system's own list (and the field's focus) hang off. A scroll
       never synthesises one, and cancelling it leaves nothing behind; cancelling
       pointerdown instead leaves Chromium's touch state stale after a scroll
       ends in pointercancel, and the next tap's click never arrives. */
    const arm = (e: Event) => {
      if (selectOf(e)) e.preventDefault();
    };

    /* The tap. A browser makes a click out of a touch only when the finger
       stayed put — a scroll, or a touch that stops one mid-flight, never
       produces one. That is exactly the "did they mean this field" judgement
       we need, and the browser has already made it, so this is the one place
       the sheet opens. Being the click that opens it, there is no trailing
       click left over to land on the backdrop and shut it again. */
    const open = (e: Event) => {
      const sel = selectOf(e);
      if (!sel) return;
      e.preventDefault();
      e.stopPropagation();
      setQ('');
      setOpts(optionsOf(sel));
      setEl(sel);
    };

    document.addEventListener('mousedown', arm, true);
    document.addEventListener('click', open, true);
    return () => {
      document.removeEventListener('mousedown', arm, true);
      document.removeEventListener('click', open, true);
    };
  }, []);

  useEffect(() => {
    if (!el) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEl(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [el]);

  if (!el) return null;

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? opts.filter((o) => (o.label + ' ' + o.group).toLowerCase().includes(needle))
    : opts;

  /* What to call the sheet: the field's own label, if the markup gave it one,
     and otherwise nothing — a heading invented here would be a guess. */
  const labelled = el.getAttribute('aria-label')
    || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')?.textContent)
    || el.closest('label')?.querySelector('span')?.textContent
    || '';
  const title = String(labelled || 'Choose').trim().replace(/\s*\*$/, '');

  let lastGroup = '';

  return (
    <div className="lg:hidden fixed inset-0 z-[90] bg-navy/45 flex items-end"
      onClick={() => setEl(null)}>
      <div className="w-full bg-white text-ink rounded-t-[24px] pt-2 max-h-[78vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1 shrink-0" />
        <div className="px-5 py-2 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[16px] font-bold truncate">{title}</p>
          <button type="button" onClick={() => setEl(null)} aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-2 active:bg-wash shrink-0">
            <Icon name="x" size={16} />
          </button>
        </div>

        {opts.length > 8 && (
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
          ) : shown.map((o, i) => {
            const on = o.value === el.value;
            const head = o.group && o.group !== lastGroup ? o.group : '';
            lastGroup = o.group;
            return (
              <div key={o.value + '-' + i}>
                {head && (
                  <p className="px-5 pt-3 pb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                    {head}
                  </p>
                )}
                <button type="button" disabled={o.disabled}
                  onClick={() => { writeValue(el, o.value); setEl(null); }}
                  className={'w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 '
                    + 'border-b border-line-soft last:border-b-0 active:bg-wash '
                    + (o.disabled ? 'text-muted-2 ' : '')
                    + (on ? 'bg-rose' : '')}>
                  <span className={'text-[15px] min-w-0 truncate '
                    + (on ? 'font-bold text-accent' : 'font-medium')}>
                    {o.label || '—'}
                  </span>
                  {on && <Icon name="check" size={16} className="text-accent shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
