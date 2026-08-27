'use client';

/* ============================================================================
   The Share button. Opens OUR bottom sheet — the same on every page and on
   every origin — with the link shown in full, a WhatsApp send (straight to
   the customer's number when the page knows it), and a Copy that works even
   inside the Android app on the plain-http LAN, where navigator.share and
   the async clipboard API simply do not exist.
   ========================================================================== */

import { useState } from 'react';
import { waLink, waNumber } from 'shared';
import { Icon } from '@/components/icons';

export default function ShareLink({ path, title, phone, text }: {
  path: string; title?: string; phone?: string; text?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = (typeof window !== 'undefined' ? window.location.origin : '') + path;
  const msg = (text || title || 'Here is your document') + '\n' + url;
  const wa = waLink(phone, msg);
  // Whether we can land on the customer's own chat, or must ask.
  const known = !!waNumber(phone);

  function copy() {
    // The async clipboard API needs https. The textarea trick works
    // everywhere — including the app on the LAN — so it is the one we use.
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the link box below is selectable by hand */ }
  }

  return (
    <>
      <button onClick={() => { setCopied(false); setOpen(true); }}
        className="flex items-center gap-1.5 h-8 px-3.5 rounded border border-line text-[13px] font-medium hover:bg-wash">
        <Icon name="upload" size={13} /> Share
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-navy/50 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:max-w-[440px] rounded-t-xl sm:rounded-lg shadow-xl p-5
            pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold">{title || 'Share'}</h2>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-wash">
                <Icon name="x" size={15} />
              </button>
            </div>

            {/* the link itself — visible, selectable, never hidden in a prompt */}
            <p className="break-all text-[12px] leading-relaxed rounded border border-line bg-wash
              px-3 py-2.5 select-all">
              {url}
            </p>

            <div className="flex flex-col gap-2.5 mt-4">
              <a href={wa} target="_blank" rel="noreferrer"
                className="h-12 rounded text-white text-[14px] font-semibold flex items-center
                  justify-center gap-2 hover:brightness-95"
                style={{ background: '#25D366' }}>
                Share via WhatsApp{known ? '' : '…'}
              </a>
              <button onClick={copy}
                className="h-12 rounded border border-navy text-navy text-[14px] font-semibold hover:bg-wash">
                {copied ? 'Link copied ✓' : 'Copy link'}
              </button>
            </div>
            <p className="text-[11.5px] text-muted mt-3">
              {known
                ? 'WhatsApp opens the customer’s chat with the link ready to send.'
                : 'WhatsApp opens with the link ready — pick who to send it to.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
