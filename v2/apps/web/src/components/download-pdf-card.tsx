'use client';

/* ============================================================================
   "Keep a copy" — the card that sits above a document sheet and turns it into
   a PDF. Download opens the device's own print dialog, where "Save as PDF" is
   the keep option on every phone and desktop. Lifted from the public quotation
   (approve/[id]) so the contract, and any other document, wear the same one.

   `no-print` keeps the card off the printed page — it is the door to the PDF,
   not part of it.
   ========================================================================== */

export function DownloadPdfCard({ label, onDownload }: {
  /** What the document is — e.g. "The full contract, as a PDF". */
  label: string;
  /** Defaults to the browser's print dialog (Save as PDF). Pass a handler to
      download a real file instead where one exists. */
  onDownload?: () => void;
}) {
  return (
    <div className="no-print rounded border border-line bg-white p-4 mb-4
      flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="text-[12px] text-muted mt-0.5">
          Download opens your device&rsquo;s print dialog &mdash; choose &ldquo;Save as PDF&rdquo; to keep a copy.
        </p>
      </div>
      <button type="button"
        onClick={() => (onDownload ? onDownload() : window.print())}
        className="h-9 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash shrink-0">
        Download PDF
      </button>
    </div>
  );
}
