'use client';

/* ============================================================================
   "Keep a copy" — the card that sits above a document sheet and turns it into
   a PDF. Download makes an A4 PDF of the sheet on the page ([data-paper]) and
   saves it straight away - no print dialog (lib/sheet-pdf.ts). Only if that
   fails does it fall back to the print dialog. Lifted from the public
   quotation (approve/[id]) so the contract, the service report and the
   invoice wear the same one.

   `no-print` keeps the card off the printed page and out of the PDF.
   ========================================================================== */

import { useState } from 'react';
import { downloadSheetPdf } from '@/lib/sheet-pdf';

export function DownloadPdfCard({ label, onDownload, shareHref, fileName }: {
  /** What the document is — e.g. "The full contract, as a PDF". */
  label: string;
  /** Replaces the built-in download entirely. */
  onDownload?: () => void;
  /** A WhatsApp link that sends this page to the customer - shown as a second
      button when the page knows who the customer is. */
  shareHref?: string;
  /** The saved file's name, without ".pdf". Defaults to the page title. */
  fileName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function download() {
    if (onDownload) { onDownload(); return; }
    const sheet = document.querySelector<HTMLElement>('[data-paper]');
    if (!sheet) { window.print(); return; }
    setBusy(true); setErr('');
    try {
      await downloadSheetPdf(sheet, fileName || document.title || 'document');
    } catch {
      setErr('Could not make the PDF here - opening the print dialog instead.');
      window.print();
    }
    setBusy(false);
  }

  return (
    <div data-pdf-card className="no-print rounded border border-line bg-white p-4 mb-4
      flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="text-[12px] text-muted mt-0.5">
          {busy ? 'Making the PDF…' : 'An A4 PDF, saved straight to your downloads.'}
        </p>
        {err && <p className="text-[12px] text-accent mt-0.5">{err}</p>}
      </div>
      <span className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={download} disabled={busy}
          className="h-9 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash disabled:opacity-60">
          {busy ? 'Preparing…' : 'Download PDF'}
        </button>
        {shareHref && (
          <a href={shareHref} target="_blank" rel="noreferrer"
            className="h-9 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash
              inline-flex items-center">
            Share
          </a>
        )}
      </span>
    </div>
  );
}
