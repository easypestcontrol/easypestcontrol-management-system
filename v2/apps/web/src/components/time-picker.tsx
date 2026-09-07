'use client';

/* ============================================================================
   Picking a time on a clock face.

   The native <input type="time"> is a pair of tiny spinners. On a phone it
   becomes two scrolling columns you have to flick to the right number, and
   booking a ten o'clock inspection takes several careful goes — which is
   exactly the complaint. On a desktop it is barely better: three separate
   fields to tab through, and a 24-hour reading nobody in this office thinks in.

   So: a clock. Tap the hour on the dial, tap the minute, choose AM or PM.
   Twelve-hour throughout, because that is how the time gets said on the phone
   to the customer.

   The VALUE does not change. It goes in and comes out as "HH:MM" on a
   twenty-four hour clock, the same string the native input produced, so every
   screen and every endpoint that already handles it carries on unchanged.
   Twelve-hour is a way of showing the number, not of storing it.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** "14:30" → { h: 14, m: 30 }. Anything unreadable comes back null. */
function parse(v: string): { h: number; m: number } | null {
  const bits = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
  if (!bits) return null;
  const h = Number(bits[1]);
  const m = Number(bits[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** What a person reads: "10:00 AM". Empty stays empty. */
export function timeLabel(v: string): string {
  const t = parse(v);
  if (!t) return '';
  const period = t.h < 12 ? 'AM' : 'PM';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return h12 + ':' + pad(t.m) + ' ' + period;
}

export default function TimePicker({ value, onChange, className = '', disabled, id }: {
  /** "HH:MM", twenty-four hour — exactly what <input type="time"> uses. */
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  /* Portals need a document, which the server render does not have. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = parse(value) || { h: 9, m: 0 };
  const [h24, setH24] = useState(current.h);
  const [min, setMin] = useState(current.m);
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  // Re-read the value each time it opens: the field may have been set
  // elsewhere since this picker was last used.
  function openIt() {
    if (disabled) return;
    const t = parse(value) || { h: 9, m: 0 };
    setH24(t.h);
    setMin(t.m);
    setMode('hour');
    setOpen(true);
  }

  function commit(hour = h24, minute = min) {
    onChange(pad(hour) + ':' + pad(minute));
    setOpen(false);
  }

  /* Escape closes without changing anything — the same as Cancel. */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function pickHour(n12: number) {
    // Keep whichever half of the day is showing.
    const next = period === 'AM' ? (n12 === 12 ? 0 : n12) : (n12 === 12 ? 12 : n12 + 12);
    setH24(next);
    setMode('minute');
  }

  function setPeriod(p: 'AM' | 'PM') {
    if (p === period) return;
    setH24(p === 'AM' ? h24 - 12 : h24 + 12);
  }

  /* -------------------------------------------------------------- the dial

     Twelve positions on a circle, twelve o'clock at the top and going round
     clockwise. In minute mode the same twelve positions are the five-minute
     marks, which is the granularity a visit is ever booked at.              */
  const R = 96;
  const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
  const active = mode === 'hour' ? (h12 === 12 ? 12 : h12) : (min === 0 ? 12 : min / 5);
  const handAngle = (active % 12) * 30;

  return (
    <>
      <button type="button" id={id} onClick={openIt} disabled={disabled}
        className={className + ' text-left disabled:opacity-60'}>
        {timeLabel(value) || <span className="text-muted-2">Pick a time</span>}
      </button>

      {open && mounted && createPortal((
        /*
         * Rendered on the body, not where the field sits.
         *
         * This picker is opened from inside drawers and dialogs, and those are
         * `fixed … z-40` — which creates a stacking context. A child of one
         * cannot paint above anything outside it however high its own z-index
         * goes, so the dim overlay covered the page but left the sidebar and
         * the drawer itself bright and clickable behind a modal. It looked
         * like a colour problem and was a nesting one; no z-index would have
         * fixed it.
         */
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy/45"
          onClick={() => setOpen(false)}>
          <div ref={box} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[22px] w-full max-w-[320px] p-5 shadow-pop">

            {/* what has been chosen so far, and the two halves of the day */}
            <div className="flex items-center justify-center gap-3">
              <span className="flex items-baseline gap-1 tabular-nums">
                <button type="button" onClick={() => setMode('hour')}
                  className={'text-[38px] font-bold leading-none px-1 rounded '
                    + (mode === 'hour' ? 'text-accent' : 'text-ink')}>
                  {h12}
                </button>
                <span className="text-[32px] font-bold leading-none">:</span>
                <button type="button" onClick={() => setMode('minute')}
                  className={'text-[38px] font-bold leading-none px-1 rounded '
                    + (mode === 'minute' ? 'text-accent' : 'text-ink')}>
                  {pad(min)}
                </button>
              </span>
              <span className="flex flex-col gap-1">
                {(['AM', 'PM'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={'w-12 h-8 rounded-lg text-[13.5px] font-bold '
                      + (period === p ? 'bg-accent text-white' : 'bg-wash text-muted')}>
                    {p}
                  </button>
                ))}
              </span>
            </div>

            <p className="text-center text-[12.5px] text-muted mt-2">
              {mode === 'hour' ? 'Tap the hour' : 'Tap the minutes'}
            </p>

            {/* the face */}
            <div className="relative mx-auto mt-3" style={{ width: 244, height: 244 }}>
              <div className="absolute inset-0 rounded-full bg-wash" />
              {/* the hand, pointing at whatever is chosen */}
              <div className="absolute left-1/2 top-1/2 origin-bottom bg-accent rounded-full"
                style={{
                  width: 2, height: R,
                  transform: `translate(-50%,-100%) rotate(${handAngle}deg)`,
                  transformOrigin: '50% 100%',
                }} />
              <span className="absolute left-1/2 top-1/2 w-2.5 h-2.5 rounded-full bg-accent
                -translate-x-1/2 -translate-y-1/2" />

              {numbers.map((n) => {
                const angle = ((n * 30) - 90) * (Math.PI / 180);
                const x = 122 + R * Math.cos(angle);
                const y = 122 + R * Math.sin(angle);
                const label = mode === 'hour' ? n : pad((n % 12) * 5);
                const isOn = active === n;
                return (
                  <button key={n} type="button"
                    onClick={() => (mode === 'hour' ? pickHour(n) : setMin((n % 12) * 5))}
                    style={{ left: x, top: y }}
                    className={'absolute w-11 h-11 -translate-x-1/2 -translate-y-1/2 rounded-full '
                      + 'text-[15.5px] font-semibold tabular-nums flex items-center justify-center '
                      + (isOn ? 'bg-accent text-white' : 'text-ink hover:bg-white active:bg-white')}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={() => setOpen(false)}
                className="h-10 px-4 rounded-lg border border-line text-[14px] font-medium hover:bg-wash">
                Cancel
              </button>
              <button type="button" onClick={() => commit()}
                className="h-10 px-5 rounded-lg bg-accent text-white text-[14px] font-bold
                  hover:brightness-90">
                Set {h12}:{pad(min)} {period}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
