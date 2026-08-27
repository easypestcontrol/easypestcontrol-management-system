'use client';

/* ============================================================================
   Just the code.

   Razorpay hands back a whole poster: a "Powered by Razorpay" header, BHIM and
   UPI marks, the GPay / PhonePe / Paytm strip, the company name — and the
   actual scannable code is about a third of it. Shown whole, it is enormous
   and the code inside is small; shrunk to fit, the code stops being readable.
   Neither is what somebody holding a phone across a counter needs.

   So the poster is measured and the code is cut out of it.

   Finding it is done by looking rather than by hard-coded coordinates, because
   a crop pinned to today's layout breaks silently the day Razorpay redesigns
   the poster — and a payment QR that is silently wrong is unpayable. A QR is
   the only part of that image that is dense black-and-white: text rows are
   mostly white, the logos are colour. So we take the rows and columns whose
   dark pixels are dense and near-monochrome, and that band IS the code.

   If anything at all goes wrong — the image will not load, the canvas cannot
   be read, nothing dense is found — the original poster is shown instead. A
   big ugly QR beats no QR.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { findCode } from 'shared';

export default function UpiQr({ src, size = 232 }: {
  /** Same-origin, or the canvas cannot be read. */
  src: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'working' | 'cropped' | 'raw'>('working');

  useEffect(() => {
    let dead = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (dead) return;
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) throw new Error('no image');

        // Read it once, small, into an offscreen canvas.
        const read = document.createElement('canvas');
        read.width = w;
        read.height = h;
        const rc = read.getContext('2d', { willReadFrequently: true });
        if (!rc) throw new Error('no context');
        rc.drawImage(img, 0, 0);
        const { data } = rc.getImageData(0, 0, w, h);

        /* The finding is arithmetic, and it lives in the shared engine where
           it can be tested against a synthetic poster without a browser. It
           returns null rather than guess; null means show the original. */
        const box = findCode(data, w, h);
        if (!box) throw new Error('no code found');
        const { x: sx, y: sy, w: sw, h: sh } = box;

        const out = canvasRef.current;
        if (!out) return;
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        out.width = size * dpr;
        out.height = size * dpr;
        const oc = out.getContext('2d');
        if (!oc) throw new Error('no context');
        oc.fillStyle = '#fff';
        oc.fillRect(0, 0, out.width, out.height);
        // Crisp squares, not a blurred photograph of squares.
        oc.imageSmoothingEnabled = false;
        oc.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
        setState('cropped');
      } catch {
        // A big ugly QR beats no QR.
        setState('raw');
      }
    };

    img.onerror = () => { if (!dead) setState('raw'); };
    img.src = src;
    return () => { dead = true; };
  }, [src, size]);

  if (state === 'raw') {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={src} alt="Scan to pay with any UPI app"
        className="block w-full max-w-[300px] h-auto mx-auto rounded bg-white" />
    );
  }

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <canvas ref={canvasRef} width={size} height={size} aria-label="Scan to pay with any UPI app"
        className="block rounded-lg bg-white"
        style={{ width: size, height: size, opacity: state === 'cropped' ? 1 : 0 }} />
      {state === 'working' && (
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-wash">
          <span className="text-[12px] text-muted">Opening…</span>
        </div>
      )}
    </div>
  );
}
