'use client';

/* ============================================================================
   A booked window, set in one go.

   Two separate clocks for "from" and "to" is two dialogs, four taps of the
   dial and a chance to close the second one having forgotten why it opened —
   and it lets somebody book ten in the morning until one in the morning,
   because neither clock has ever heard of the other.

   So one control, one dialog, both ends. Tap the start hour, tap its minutes,
   and it moves to the finish by itself; adjust either afterwards by tapping
   its number at the top. The window is checked before it can be saved,
   because a service that finishes before it starts is not a service, and the
   technician's day is planned from these two numbers.

   Values go in and come out as "HH:MM" on a twenty-four hour clock, the same
   strings the rest of the app stores.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function parse(v: string): { h: number; m: number } | null {
  const bits = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
  if (!bits) return null;
  const h = Number(bits[1]);
  const m = Number(bits[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (v: string) => { const t = parse(v); return t ? t.h * 60 + t.m : -1; };

/** "14:30" → "2:30 PM". Empty stays empty. */
export function label12(v: string): string {
  const t = parse(v);
  if (!t) return '';
  return (t.h % 12 === 0 ? 12 : t.h % 12) + ':' + pad(t.m) + ' ' + (t.h < 12 ? 'AM' : 'PM');
}

/** "10:00 AM – 12:00 PM", or empty when neither end is set. */
export function windowLabel(from: string, to: string): string {
  const a = label12(from);
  const b = label12(to);
  if (!a && !b) return '';
  return b ? a + ' – ' + b : a;
}

type Half = 'from' | 'to';

export default function TimeRangePicker({
  from, to, onChange, className = '', disabled, placeholder = 'Set the window',
}: {
  /** "HH:MM" — the start of the booked window. */
  from: string;
  /** "HH:MM" — the end. */
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* Which end is being set, and whether we are on its hour or its minutes. */
  const [half, setHalf] = useState<Half>('from');
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');

  const [aH, setAH] = useState(10);   // from, 24h
  const [aM, setAM] = useState(0);
  const [bH, setBH] = useState(12);   // to, 24h
  const [bM, setBM] = useState(0);

  function openIt() {
    if (disabled) return;
    const a = parse(from) || { h: 10, m: 0 };
    // Default the finish to two hours after the start, which is what a visit
    // is booked for unless somebody says otherwise.
    const b = parse(to) || { h: (a.h + 2) % 24, m: a.m };
    setAH(a.h); setAM(a.m); setBH(b.h); setBM(b.m);
    setHalf('from'); setMode('hour');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const box = useRef<HTMLDivElement>(null);

  const h24 = half === 'from' ? aH : bH;
  const min = half === 'from' ? aM : bM;
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const setH = (v: number) => (half === 'from' ? setAH(v) : setBH(v));
  const setM = (v: number) => (half === 'from' ? setAM(v) : setBM(v));

  function pickHour(n12: number) {
    setH(period === 'AM' ? (n12 === 12 ? 0 : n12) : (n12 === 12 ? 12 : n12 + 12));
    setMode('minute');
  }

  function pickMinute(v: number) {
    setM(v);
    // Setting the start rolls straight on to the finish — that is the whole
    // point of one dialog rather than two.
    if (half === 'from') { setHalf('to'); setMode('hour'); } else { setMode('hour'); }
  }

  function setPeriod(p: 'AM' | 'PM') {
    if (p === period) return;
    setH(p === 'AM' ? h24 - 12 : h24 + 12);
  }

  const fromStr = pad(aH) + ':' + pad(aM);
  const toStr = pad(bH) + ':' + pad(bM);
  const mins = toMin(toStr) - toMin(fromStr);
  const backwards = mins <= 0;

  const R = 96;
  const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
  const active = mode === 'hour' ? (h12 === 12 ? 12 : h12) : (min === 0 ? 12 : min / 5);
  const handAngle = (active % 12) * 30;

  const readout = (which: Half, hh: number, mm: number, name: string) => {
    const on = half === which;
    const p = hh < 12 ? 'AM' : 'PM';
    const twelve = hh % 12 === 0 ? 12 : hh % 12;
    return (
      <button type="button"
        onClick={() => { setHalf(which); setMode('hour'); }}
        className={'flex-1 rounded-xl px-3 py-2 text-left border '
          + (on ? 'border-accent bg-rose' : 'border-line hover:bg-wash')}>
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
          {name}
        </span>
        <span className={'block text-[22px] font-bold leading-tight tabular-nums '
          + (on ? 'text-accent' : 'text-ink')}>
          {twelve}:{pad(mm)} <span className="text-[13px]">{p}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      <button type="button" onClick={openIt} disabled={disabled}
        className={className + ' text-left disabled:opacity-60'}>
        {windowLabel(from, to) || <span className="text-muted-2">{placeholder}</span>}
      </button>

      {open && mounted && createPortal((
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy/45"
          onClick={() => setOpen(false)}>
          <div ref={box} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[22px] w-full max-w-[340px] p-5 shadow-pop">

            {/* both ends, always visible, either one tappable */}
            <div className="flex items-stretch gap-2">
              {readout('from', aH, aM, 'From')}
              {readout('to', bH, bM, 'Until')}
            </div>

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-[12.5px] text-muted">
                {mode === 'hour' ? 'Tap the hour' : 'Tap the minutes'}
              </p>
              <span className="flex gap-1">
                {(['AM', 'PM'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={'w-11 h-8 rounded-lg text-[13px] font-bold '
                      + (period === p ? 'bg-accent text-white' : 'bg-wash text-muted')}>
                    {p}
                  </button>
                ))}
              </span>
            </div>

            <div className="relative mx-auto mt-3" style={{ width: 244, height: 244 }}>
              <div className="absolute inset-0 rounded-full bg-wash" />
              <div className="absolute left-1/2 top-1/2 bg-accent rounded-full"
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
                const text = mode === 'hour' ? n : pad((n % 12) * 5);
                const isOn = active === n;
                return (
                  <button key={n} type="button"
                    onClick={() => (mode === 'hour' ? pickHour(n) : pickMinute((n % 12) * 5))}
                    style={{ left: x, top: y }}
                    className={'absolute w-11 h-11 -translate-x-1/2 -translate-y-1/2 rounded-full '
                      + 'text-[15.5px] font-semibold tabular-nums flex items-center justify-center '
                      + (isOn ? 'bg-accent text-white' : 'text-ink hover:bg-white active:bg-white')}>
                    {text}
                  </button>
                );
              })}
            </div>

            {/* A window that ends before it starts is the mistake this control
                exists to stop — two separate clocks could not see each other. */}
            <p className={'text-[12.5px] mt-3 text-center leading-relaxed '
              + (backwards ? 'text-accent font-semibold' : 'text-muted')}>
              {backwards
                ? 'The finish has to be after the start.'
                : mins >= 60
                  ? Math.round(mins / 6) / 10 + ' hr — the technician is booked for exactly this long.'
                  : mins + ' min — the technician is booked for exactly this long.'}
            </p>

            <div className="flex items-center justify-end gap-2 mt-3">
              <button type="button" onClick={() => setOpen(false)}
                className="h-10 px-4 rounded-lg border border-line text-[14px] font-medium hover:bg-wash">
                Cancel
              </button>
              <button type="button" disabled={backwards}
                onClick={() => { onChange(fromStr, toStr); setOpen(false); }}
                className="h-10 px-5 rounded-lg bg-accent text-white text-[14px] font-bold
                  hover:brightness-90 disabled:opacity-50">
                Set the window
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
