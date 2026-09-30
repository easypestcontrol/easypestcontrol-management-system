'use client';

/* ============================================================================
   Download PDF: the sheet on screen, as an A4 PDF file - no print dialog.

   Printing depended on the browser: the Android app printed the zoomed
   phone view as a postage stamp in the middle of a page, Chrome added its
   date, title and address to every sheet, and backgrounds went missing
   unless the person found the setting. So every document's PDF - contract,
   quotation, invoice, service report, purchase order, a batch of invoices -
   is made here, from the same sheet the screen shows:

   1. a copy of the sheet is laid out in a hidden frame 1280px wide, so it
      takes its DESKTOP layout even when the button is pressed on a phone
      (a sheet's sm:/lg: classes answer to the frame, not to the phone), at
      its full width with no zoom and without the on-screen-only controls;
   2. it is drawn at twice the resolution, so text stays sharp;
   3. it is cut into A4 pages - only between rows, never through one;
      each sheet of a batch starts on a new page;
   4. the file is saved: in the Android app through its download bridge
      (MainActivity AndroidDL.save -> Downloads), anywhere else as a normal
      browser download.
   ========================================================================== */

const SHEET_W = 820;          // px, the width every document sheet is drawn at
const PAGE_W_MM = 210;        // A4
const PAGE_H_MM = 297;
const EDGE_MM = 8;            // white edge top and bottom of every page
const SCALE = 2;              // drawing resolution

type AndroidDL = { save?: (url: string, name: string) => void };
type Pdf = InstanceType<(typeof import('jspdf'))['jsPDF']>;

/** Make one PDF of `sheet` and save it as `fileName` (".pdf" is added). */
export function downloadSheetPdf(sheet: HTMLElement, fileName: string): Promise<void> {
  return downloadSheetsPdf([sheet], fileName);
}

/** Several sheets in one PDF, each starting on a new page. */
export async function downloadSheetsPdf(sheets: HTMLElement[], fileName: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const stage = await makeStage();
  try {
    let first = true;
    for (const sheet of sheets) {
      const copy = stage.place(sheet);
      await settle(copy);
      first = await addSheet(pdf, copy, toCanvas, first);
      copy.remove();
    }
  } finally {
    stage.remove();
  }
  save(pdf, fileName);
}

/* ------------------------------------------------------------ the stage */

/**
 * Somewhere to lay the copy out at desktop width: a hidden same-origin frame
 * carrying this page's stylesheets. If a frame cannot be made, the copy is
 * laid out off screen in this page instead (right size, but a phone's
 * layout rules then apply to it).
 */
async function makeStage(): Promise<{ place: (sheet: HTMLElement) => HTMLElement; remove: () => void }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-30000px;top:0;width:1280px;height:1400px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return inPage();
  }
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
  doc.documentElement.className = document.documentElement.className;
  doc.body.className = document.body.className;
  doc.body.style.cssText = 'margin:0;background:#fff;';
  const loads: Array<Promise<unknown>> = [];
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
    const c = doc.importNode(n, true) as HTMLElement;
    if (c instanceof HTMLLinkElement || c.tagName === 'LINK') {
      loads.push(new Promise((res) => { c.addEventListener('load', res); c.addEventListener('error', res); setTimeout(res, 4000); }));
    }
    doc.head.appendChild(c);
  });
  await Promise.all(loads);
  const host = doc.createElement('div');
  host.style.cssText = 'width:' + SHEET_W + 'px;background:#fff;';
  doc.body.appendChild(host);
  return {
    place: (sheet) => {
      const copy = prepare(doc.importNode(sheet, true) as HTMLElement);
      host.appendChild(copy);
      return copy;
    },
    remove: () => frame.remove(),
  };
}

function inPage(): { place: (sheet: HTMLElement) => HTMLElement; remove: () => void } {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:' + SHEET_W + 'px;background:#fff;z-index:-1;';
  document.body.appendChild(host);
  return {
    place: (sheet) => {
      const copy = prepare(sheet.cloneNode(true) as HTMLElement);
      host.appendChild(copy);
      return copy;
    },
    remove: () => host.remove(),
  };
}

/** The copy as paper: full width, no zoom or frame, nothing that is only for the screen. */
function prepare(copy: HTMLElement): HTMLElement {
  copy.removeAttribute('style'); // the phone zoom / fit-to-width scale live in the inline style
  copy.classList.add('pdf-copy'); // designed type sizes, not the phone's larger ones (globals.css)
  copy.style.cssText = 'display:block;width:' + SHEET_W + 'px;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none;background:#fff;transform:none;zoom:1;';
  copy.querySelectorAll('.no-print, .doc-stamp').forEach((n) => n.remove());
  // what is only for paper (a line to sign on) is shown
  copy.querySelectorAll<HTMLElement>('.print\\:block').forEach((n) => { n.style.display = 'block'; });
  copy.querySelectorAll<HTMLElement>('.print\\:hidden').forEach((n) => { n.style.display = 'none'; });
  return copy;
}

async function settle(copy: HTMLElement) {
  const doc = copy.ownerDocument;
  try { await doc.fonts?.ready; } catch { /* fonts are best effort */ }
  await Promise.all(Array.from(copy.querySelectorAll('img')).map((img) =>
    img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 6000); })));
  await new Promise((r) => setTimeout(r, 50));
}

/* ------------------------------------------------------------ the pages */

async function addSheet(
  pdf: Pdf,
  copy: HTMLElement,
  toCanvas: (typeof import('html-to-image'))['toCanvas'],
  first: boolean,
): Promise<boolean> {
  // where a page may end: under any row or block, never inside one
  const top = copy.getBoundingClientRect().top;
  const cuts = new Set<number>();
  copy.querySelectorAll<HTMLElement>(
    '.break-inside-avoid, tr, li, p, [class*="divide-y"] > *, .p-10 > *, .p-8 > *, .p-6 > *',
  ).forEach((n) => { const b = n.getBoundingClientRect(); if (b.height) cuts.add(Math.round(b.bottom - top)); });
  const fullH = Math.ceil(copy.getBoundingClientRect().height);

  const canvas = await toCanvas(copy, {
    pixelRatio: SCALE, backgroundColor: '#ffffff', width: SHEET_W, height: fullH, cacheBust: false,
  });

  const mmPerPx = PAGE_W_MM / SHEET_W;
  const pageH = Math.floor((PAGE_H_MM - EDGE_MM * 2) / mmPerPx);
  const sorted = Array.from(cuts).filter((y) => y > 0 && y < fullH).sort((a, b) => a - b);
  let start = 0;
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
  return first;
}

function save(pdf: Pdf, fileName: string) {
  const name = (fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document') + '.pdf';
  const app = typeof window !== 'undefined'
    ? (window as unknown as { AndroidDL?: AndroidDL }).AndroidDL : undefined;
  if (app?.save) app.save(pdf.output('datauristring'), name);
  else pdf.save(name);
}

/**
 * A button's whole job: find the sheet(s), make the PDF, and only if that
 * fails open the print dialog as a last resort.
 */
export async function downloadPdfOf(selector: string, fileName: string): Promise<void> {
  const sheets = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (!sheets.length) { window.print(); return; }
  try {
    await downloadSheetsPdf(sheets, fileName);
  } catch {
    window.print();
  }
}
