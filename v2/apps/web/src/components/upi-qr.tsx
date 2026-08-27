'use client';

/* ============================================================================
   Just the code.

   Razorpay hands back a whole poster: a "Powered by Razorpay" header, BHIM and
   UPI marks, the GPay / PhonePe / Paytm strip, the company name — and the
   actual scannable code is about a third of it. Shown whole it is enormous and
   the code inside is small; shrunk to fit, the code stops being readable.
   Neither is what somebody holding a phone across a counter needs.

   So the poster is measured and the code is cut out of it. The finding lives
   in the shared engine (findCode) where it is tested against a synthetic
   poster without a browser; it returns null rather than guess, and null means
   show the poster whole.

   Two things about HOW the image is loaded, both learned the hard way:

     · It cannot be an <img src> pointing at our API. Every route in this app
       authenticates with a bearer token, and an image tag cannot send a
       header — so the browser asked without one and got a 401, and the QR
       simply did not appear. It is fetched properly and handed to the image
       as a blob instead.

     · It cannot be loaded straight from rzp.io either, because reading the
       pixels of a cross-origin image taints the canvas. A blob from our own
       origin is readable; that is the whole reason the proxy exists.

   If anything at all goes wrong, Razorpay's own poster is shown from their
   URL. Big and ugly, but scannable, and a QR nobody can pay is the one
   outcome that must not happen.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { findCode } from 'shared';
import { getToken } from '@/lib/api';

export default function UpiQr({ src, fallback, size = 232 }: {
  /** Our own authenticated endpoint, so the pixels can be read. */
  src: string;
  /** Razorpay's own image, shown whole if the crop cannot be done. */
  fallback?: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'working' | 'cropped' | 'raw'>('working');

  useEffect(() => {
    let dead = false;
    let objectUrl = '';

    (async () => {
      try {
        // A header, which is exactly what an <img> tag cannot send.
        const res = await fetch(src, {
          headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {},
        });
        if (!res.ok) throw new Error('image ' + res.status);
        const blob = await res.blob();
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('decode failed'));
          el.src = objectUrl;
        });
        if (dead) return;

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) throw new Error('no image');

        const read = document.createElement('canvas');
        read.width = w;
        read.height = h;
        const rc = read.getContext('2d', { willReadFrequently: true });
        if (!rc) throw new Error('no context');
        rc.drawImage(img, 0, 0);
        const { data } = rc.getImageData(0, 0, w, h);

        const box = findCode(data, w, h);
        if (!box) throw new Error('no code found');

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
        oc.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
        setState('cropped');
      } catch {
        // Scannable beats tidy.
        if (!dead) setState('raw');
      }
    })();

    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, size]);

  if (state === 'raw') {
    if (!fallback) {
      return (
        <p className="text-[12.5px] text-muted text-center py-6 px-4 leading-relaxed">
          The QR could not be opened. Send a payment link instead — it works the
          same way and records itself.
        </p>
      );
    }
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={fallback} alt="Scan to pay with any UPI app"
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
