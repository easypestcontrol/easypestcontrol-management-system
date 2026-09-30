'use client';

/* ============================================================================
   Download PDF: the sheet on screen, as an A4 PDF file - no print dialog.

   Printing was the old way, and it depended on the browser: the Android app
   printed the zoomed phone view as a postage stamp in the middle of a page,
   Chrome added its date, title and address to every sheet, and backgrounds
   went missing unless the person found the setting. So the PDF is made here,
   from the same sheet the preview shows:

   1. a copy of the sheet is laid out off screen at its full 820px width (the
      phone's zoom is not copied), without the on-screen-only controls;
   2. it is drawn at twice the resolution, so text stays sharp when zoomed;
   3. it is cut into A4 pages - only between rows, never through one: each
      page ends at the lowest row edge that fits;
   4. the file is saved: in the Android app through its download bridge
      (MainActivity AndroidDL.save -> Downloads), anywhere else as a normal
      browser download.
   ========================================================================== */

const SHEET_W = 820;          // px, the sheet's own width
const PAGE_W_MM = 210;        // A4
const PAGE_H_MM = 297;
const EDGE_MM = 8;            // white edge top and bottom of every page
const SCALE = 2;              // drawing resolution

type AndroidDL = { save?: (url: string, name: string) => void };

/** Make the PDF of `sheet` and save it as `fileName` (".pdf" is added). */
export async function downloadSheetPdf(sheet: HTMLElement, fileName: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  // 1. an off-screen copy at full width
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + SHEET_W + 'px;background:#fff;z-index:-1;';
  const copy = sheet.cloneNode(true) as HTMLElement;
  copy.removeAttribute('style'); // the phone zoom lives in the inline style
  copy.classList.add('pdf-copy'); // designed type sizes, not the phone's larger ones (globals.css)
  copy.style.cssText = 'width:' + SHEET_W + 'px;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none;background:#fff;';
  copy.querySelectorAll('.no-print').forEach((n) => n.remove());
  // what is only for paper (a blank line to sign on) is shown
  copy.querySelectorAll<HTMLElement>('.print\\:block').forEach((n) => { n.style.display = 'block'; });
  host.appendChild(copy);
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    await Promise.all(Array.from(copy.querySelectorAll('img')).map((img) =>
      img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; })));

    // where a page may end: under any row or block, never inside one
    const top = copy.getBoundingClientRect().top;
    const cuts = new Set<number>();
    copy.querySelectorAll<HTMLElement>('.break-inside-avoid, tr, li, p, [class*="divide-y"] > *, .p-10 > *')
      .forEach((n) => { const b = n.getBoundingClientRect(); if (b.height) cuts.add(Math.round(b.bottom - top)); });
    const fullH = Math.ceil(copy.getBoundingClientRect().height);

    // 2. draw it
    const canvas = await toCanvas(copy, {
      pixelRatio: SCALE, backgroundColor: '#ffffff', width: SHEET_W, height: fullH, cacheBust: false,
    });

    // 3. cut into A4 pages
    const mmPerPx = PAGE_W_MM / SHEET_W;
    const pageH = Math.floor((PAGE_H_MM - EDGE_MM * 2) / mmPerPx);
    const sorted = Array.from(cuts).filter((y) => y > 0 && y < fullH).sort((a, b) => a - b);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let start = 0;
    let first = true;
    while (start < fullH - 2) {
      let end = Math.min(fullH, start + pageH);
      if (end < fullH) {
        const fit = sorted.filter((y) => y > start + pageH * 0.4 && y <= end);
        if (fit.length) end = fit[fit.length - 1];
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round((end - start) * SCALE));
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(start * SCALE), canvas.width, slice.height, 0, 0, slice.width, slice.height);
      if (!first) pdf.addPage('a4', 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, EDGE_MM, PAGE_W_MM, (end - start) * mmPerPx);
      first = false;
      start = end;
    }

    // 4. save
    const name = (fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document') + '.pdf';
    const app = typeof window !== 'undefined'
      ? (window as unknown as { AndroidDL?: AndroidDL }).AndroidDL : undefined;
    if (app?.save) app.save(pdf.output('datauristring'), name);
    else pdf.save(name);
  } finally {
    host.remove();
  }
}
