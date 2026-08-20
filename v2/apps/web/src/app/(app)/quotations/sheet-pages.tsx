'use client';

/* ============================================================================
   A service information sheet, shown as PLAIN PAGES — each PDF page is
   rendered to an image in the browser (pdf.js), so the pages simply stack
   and flow with the quotation. No embedded viewer, no trapped scrolling,
   and it works on every phone, Android included.
   ========================================================================== */

import { useEffect, useState } from 'react';

const MAX_PAGES = 8; // sheets are short; anything longer is offered as a download

export default function SheetPages({ url }: { url: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [more, setMore] = useState(0); // pages beyond the cap
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc =
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument(url).promise;
        const n = Math.min(doc.numPages, MAX_PAGES);
        const out: string[] = [];
        for (let i = 1; i <= n; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });
          const cv = document.createElement('canvas');
          cv.width = vp.width;
          cv.height = vp.height;
          const ctx = cv.getContext('2d');
          if (!ctx) throw new Error('no canvas');
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          if (dead) return;
          out.push(cv.toDataURL('image/png'));
        }
        if (!dead) {
          setPages(out);
          setMore(Math.max(0, doc.numPages - n));
          setState('ready');
        }
      } catch {
        if (!dead) setState('error');
      }
    })();
    return () => { dead = true; };
  }, [url]);

  if (state === 'loading') {
    return <p className="px-4 py-8 text-center text-[12.5px] text-muted">Loading the sheet…</p>;
  }
  if (state === 'error') {
    return (
      <p className="px-4 py-6 text-center text-[12.5px] text-muted">
        The sheet could not be shown here —{' '}
        <a href={url} target="_blank" rel="noreferrer" className="text-navy font-semibold underline">
          open the PDF instead
        </a>.
      </p>
    );
  }
  return (
    <div>
      {pages.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={p} alt={'Sheet page ' + (i + 1)}
          className="w-full block border-t border-line-soft first:border-t-0" />
      ))}
      {more > 0 && (
        <p className="px-4 py-2.5 text-[11.5px] text-muted text-center border-t border-line-soft">
          + {more} more page{more === 1 ? '' : 's'} in the downloadable PDF.
        </p>
      )}
    </div>
  );
}
