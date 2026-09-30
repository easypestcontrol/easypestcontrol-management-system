'use client';

/* ============================================================================
   The way back out of a document.

   A quotation, a contract, a service report, an invoice: each has a public
   page that is only the document - no shell, no menu - because the customer
   who opens the link is not a user of the system. But the office opens the
   very same page from inside the app ("Open", "View contract") and then had
   nothing to press: on a phone the document filled the screen and the only
   way out was the hardware key, which an iPhone does not have.

   So the document carries one bar, and only when there is somewhere to go:
     - there is a page behind this one in the history (it was opened from the
       app, or from anywhere else) - Back goes there;
     - or the person is signed in and the page was opened fresh in a new tab -
       Back goes to the record this document belongs to.
   A customer who tapped a WhatsApp link has neither, and sees no bar at all:
   a Back button that goes nowhere is worse than none.

   It never prints: the PDF is the document, not the chrome around it.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/api';

export default function DocBack({ title, sub, fallback, className = '' }: {
  /** What this is - "Quotation", "Service report". */
  title: string;
  /** Which one - its number. */
  sub?: string;
  /** Where a signed-in person lands when there is no history to go back to. */
  fallback?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  /* "Is the page behind this one ours?" History alone cannot say: a fresh
     tab can carry an entry that is not the app at all, and going back to it
     strands the person on a blank page. The referrer can - it is the app's
     own origin exactly when this page was opened from inside the app. */
  const cameFromApp = () => {
    try { return !!document.referrer && new URL(document.referrer).origin === window.location.origin; }
    catch { return false; }
  };

  useEffect(() => {
    const staff = !!getToken();
    const canGoBack = window.history.length > 1 && cameFromApp();
    // Staff always have somewhere to go (the record); a customer only when
    // they really did arrive from one of our own pages.
    setShow(staff ? canGoBack || !!fallback : canGoBack);
  }, [fallback]);
  if (!show) return null;

  const back = () => {
    if (window.history.length > 1 && cameFromApp()) { window.history.back(); return; }
    if (fallback && getToken()) { window.location.href = fallback; return; }
    if (window.history.length > 1) { window.history.back(); return; }
    window.close();
  };

  return (
    <div data-doc-back className={'no-print sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#e3e6ee] ' + className}>
      <div className="max-w-[860px] mx-auto h-[56px] px-2 flex items-center gap-1">
        <button type="button" onClick={back} aria-label="Back"
          className="h-10 pl-1.5 pr-3.5 rounded-full flex items-center gap-1 text-[#141414] hover:bg-black/5 active:bg-black/10 shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="text-[14px] font-semibold">Back</span>
        </button>
        <span className="min-w-0 ml-1">
          <span className="block text-[15px] font-semibold leading-tight truncate text-[#141414]">{title}</span>
          {sub && <span className="block text-[12px] text-gray-500 leading-tight truncate">{sub}</span>}
        </span>
      </div>
    </div>
  );
}
