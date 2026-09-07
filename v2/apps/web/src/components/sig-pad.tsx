'use client';

/* ============================================================================
   Signing with a finger or a mouse.

   Lived inside the contract creation form, which meant a signature could only
   ever be taken at the moment a contract was typed. In practice the paper
   comes back signed a day later, so the one screen that needed this most —
   editing an existing agreement — could not have it.
   ========================================================================== */

import { useRef } from 'react';

export default function SigPad({ onInk, height = 110 }: {
  /** Called with a PNG data URL each time the pen is lifted. */
  onInk: (dataUrl: string) => void;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  return (
    <canvas ref={ref} width={420} height={height}
      className="w-full rounded border border-line bg-wash touch-none"
      style={{ height }}
      onPointerDown={(e) => {
        drawing.current = true;
        ref.current!.setPointerCapture(e.pointerId);
        const ctx = ref.current!.getContext('2d')!;
        ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const ctx = ref.current!.getContext('2d')!;
        const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
      }}
      onPointerUp={() => {
        drawing.current = false;
        onInk(ref.current!.toDataURL('image/png'));
      }} />
  );
}
