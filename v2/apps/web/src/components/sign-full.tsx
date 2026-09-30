'use client';

/* ============================================================================
   Signing, with the whole screen.

   The signature box used to be a strip a hundred pixels tall in the middle of
   a form. On a phone that is a fingernail of space: a customer handed the
   phone across a doorstep signed once, badly, and the page scrolled under
   their finger while they did it.

   This takes the screen. Nothing scrolls, nothing else can be touched, the
   line to sign on runs the full width, and turning the phone sideways simply
   makes it bigger - what has been drawn is kept, the same shape, in the new
   space. Clear starts over; Use this signature hands back a PNG cropped to
   the ink, so the image is the signature and not a screenful of white.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Pt = { x: number; y: number };

const INK = '#141414';

export default function SignFull({ title, who, onCancel, onDone }: {
  /** "Customer signature", "Sign for Easy Pest Control". */
  title: string;
  /** Whose hand this is - printed under the line. */
  who?: string;
  onCancel: () => void;
  /** A PNG data URL, cropped to what was drawn. */
  onDone: (dataUrl: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /* Strokes are kept in the pixels of the pad as it was when the first one
     was drawn (`base`). A turned phone shows that same drawing scaled to fit
     and centred - never stretched, which is what storing them as fractions
     of the screen did to a signature. */
  const strokes = useRef<Pt[][]>([]);
  const base = useRef<{ w: number; h: number } | null>(null);
  const live = useRef<Pt[] | null>(null);
  const [hasInk, setHasInk] = useState(false);
  /* On the body, not where it was called from: a card with a transform or a
     scrolling <main> around it would otherwise clip "the whole screen". */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** How the drawing sits in the pad right now: a scale and an offset. */
  const fit = useCallback(() => {
    const bx = box.current!;
    const w = bx.clientWidth; const h = bx.clientHeight;
    const b = base.current || { w, h };
    const k = Math.min(w / b.w, h / b.h);
    return { w, h, k, ox: (w - b.w * k) / 2, oy: (h - b.h * k) / 2 };
  }, []);

  const penOf = (b: { w: number; h: number }) => Math.max(2.4, Math.min(b.w, b.h) / 150);

  const redraw = useCallback(() => {
    const cv = canvas.current; const bx = box.current;
    if (!cv || !bx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const f = fit();
    if (cv.width !== Math.round(f.w * dpr) || cv.height !== Math.round(f.h * dpr)) {
      cv.width = Math.round(f.w * dpr); cv.height = Math.round(f.h * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, f.w, f.h);
    if (!base.current) return;
    ctx.translate(f.ox, f.oy); ctx.scale(f.k, f.k);
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = penOf(base.current);
    for (const s of strokes.current) drawStroke(ctx, s);
  }, [fit]);

  useEffect(() => {
    if (!mounted) return;
    redraw();
    const bx = box.current;
    const ro = typeof ResizeObserver !== 'undefined' && bx ? new ResizeObserver(redraw) : null;
    if (ro && bx) ro.observe(bx);
    window.addEventListener('orientationchange', redraw);
    // Nothing behind the pad may scroll while a finger is on it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', redraw);
      document.body.style.overflow = prev;
    };
  }, [redraw, mounted]);

  const at = (e: React.PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    const f = fit();
    return { x: (e.clientX - r.left - f.ox) / f.k, y: (e.clientY - r.top - f.oy) / f.k };
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    try { canvas.current!.setPointerCapture(e.pointerId); } catch { /* not every WebView allows it */ }
    if (!base.current) base.current = { w: box.current!.clientWidth, h: box.current!.clientHeight };
    live.current = [at(e)];
    strokes.current.push(live.current);
    redraw();
  }
  function move(e: React.PointerEvent) {
    if (!live.current) return;
    e.preventDefault();
    live.current.push(at(e));
    redraw();
  }
  function up() {
    if (!live.current) return;
    // A tap is a dot: an "i", a full stop, the end of a flourish.
    if (live.current.length === 1) live.current.push({ ...live.current[0], x: live.current[0].x + 0.5 });
    live.current = null;
    setHasInk(strokes.current.length > 0);
    redraw();
  }

  function clear() {
    strokes.current = []; live.current = null; base.current = null;
    setHasInk(false); redraw();
  }

  /* The signature alone: cropped to the ink with a little air around it,
     drawn at a size that prints sharply and still stays a small image. */
  function done() {
    const b = base.current;
    if (!b || !strokes.current.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes.current) for (const p of s) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const pad = 14;
    const cw = Math.max(40, x1 - x0) + pad * 2;
    const ch = Math.max(24, y1 - y0) + pad * 2;
    const scale = Math.min(2, 560 / cw, 320 / ch);
    const out = document.createElement('canvas');
    out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
    const ctx = out.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.translate(pad - x0, pad - y0);
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = penOf(b);
    for (const s of strokes.current) drawStroke(ctx, s);
    onDone(out.toDataURL('image/png'));
  }

  if (!mounted) return null;
  return createPortal((
    <div data-sign-full className="fixed inset-0 z-[9000] bg-white flex flex-col select-none"
      style={{ touchAction: 'none' }}>
      <div className="flex items-center gap-2 h-14 px-3 border-b border-line shrink-0
        pt-[env(safe-area-inset-top)] box-content">
        <button type="button" onClick={onCancel}
          className="h-10 px-3 rounded-full text-[14px] font-semibold text-ink-2 active:bg-wash">
          Cancel
        </button>
        <span className="min-w-0 flex-1 text-center">
          <span className="block text-[15px] font-bold truncate">{title}</span>
          <span className="block text-[11.5px] text-muted truncate">Sign with your finger</span>
        </span>
        <button type="button" onClick={clear} disabled={!hasInk}
          className="h-10 px-3 rounded-full text-[14px] font-semibold text-accent disabled:text-muted-2 active:bg-wash">
          Clear
        </button>
      </div>

      <div ref={box} className="relative flex-1 min-h-0 bg-white">
        {/* The line to sign on. Part of the screen, not of the signature:
            it is never in the image that is kept. */}
        <div className="pointer-events-none absolute left-[6%] right-[6%] top-[68%]">
          <div className="border-t-2 border-dashed border-line" />
          <p className="mt-2 text-center text-[12.5px] text-muted-2">
            {who ? who : 'Sign above the line'}
          </p>
        </div>
        {!hasInk && (
          <p className="pointer-events-none absolute inset-x-0 top-[34%] text-center text-[22px] font-semibold text-line">
            Sign here
          </p>
        )}
        <canvas ref={canvas} aria-label={title}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      </div>

      <div className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-line flex items-center gap-3">
        <p className="flex-1 text-[11.5px] text-muted leading-snug lg:hidden">
          Turn the phone sideways for more room.
        </p>
        <span className="flex-1 max-lg:hidden" />
        <button type="button" onClick={done} disabled={!hasInk}
          className="h-12 px-6 rounded-xl bg-accent text-white text-[15px] font-bold disabled:opacity-40 active:brightness-90">
          Use this signature
        </button>
      </div>
    </div>
  ), document.body);
}

/** One stroke, smoothed through the midpoints so a fast hand is not a polygon. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Pt[]) {
  if (!s.length) return;
  ctx.beginPath();
  ctx.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length - 1; i++) {
    ctx.quadraticCurveTo(s[i].x, s[i].y, (s[i].x + s[i + 1].x) / 2, (s[i].y + s[i + 1].y) / 2);
  }
  const last = s[s.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}
