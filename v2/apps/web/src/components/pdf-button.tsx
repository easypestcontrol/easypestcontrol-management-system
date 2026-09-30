'use client';

/* ============================================================================
   A "Download PDF" button for any screen that shows a document sheet: it
   makes an A4 PDF of the sheet(s) matching `selector` and saves it - no
   print dialog (lib/sheet-pdf.ts).
   ========================================================================== */

import { useState } from 'react';
import { downloadPdfOf } from '@/lib/sheet-pdf';

export function PdfButton({ selector, fileName, className, label = 'Download PDF' }: {
  /** The sheet(s) to put in the file, e.g. '.qdoc'. Several = one per page run. */
  selector: string;
  /** The saved file's name, without ".pdf". */
  fileName: string;
  className: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className={className + ' disabled:opacity-60'}
      onClick={async () => {
        setBusy(true);
        try { await downloadPdfOf(selector, fileName); } finally { setBusy(false); }
      }}>
      {busy ? 'Preparing PDF…' : label}
    </button>
  );
}
