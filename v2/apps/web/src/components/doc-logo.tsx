'use client';

/* ============================================================================
   The company logo at the head of a document.

   Two things made it look pushed to the right: the uploaded picture carries
   its own white margin around the mark, and it was sized by height, so its
   width had nothing to do with the company name printed under it. Here the
   margin is trimmed off (any near-white or transparent border), and the
   logo takes exactly the width of the name below it - it starts at the
   first letter and ends at the last. The parent is `w-fit`, so the name
   sets the width and the logo follows it (width 0 + min-width 100% means
   the picture never widens the block itself).
   ========================================================================== */

import { useEffect, useState } from 'react';

const trimmed = new Map<string, string>();

/** The picture with its blank border cut away; the original if it cannot be read. */
function trim(src: string): Promise<string> {
  const hit = trimmed.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d')!;
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const blank = d[k + 3] < 16 || (d[k] > 240 && d[k + 1] > 240 && d[k + 2] > 240);
            if (blank) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) {
          trimmed.set(src, src); resolve(src); return;
        }
        const out = document.createElement('canvas');
        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
        out.getContext('2d')!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
        const url = out.toDataURL('image/png');
        trimmed.set(src, url); resolve(url);
      } catch { trimmed.set(src, src); resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function DocLogo({ src, className = '' }: { src: string; className?: string }) {
  const [url, setUrl] = useState(() => trimmed.get(src) || '');
  useEffect(() => {
    let live = true;
    trim(src).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [src]);
  if (!url) return <div className="h-[64px]" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" data-doc-logo
      className={'block w-0 min-w-full h-auto max-h-[96px] object-contain object-left ' + className} />
  );
}
