'use client';

/* ============================================================================
   The customer's portal, as a thing on their page.

   A QR, then two buttons: Share link (WhatsApp, to the customer's own number
   with the link already in the message) and Copy link. It sits in the
   customer's left rail at a desk and in a card on the phone — the same
   component, so the two never drift. It used to live behind a "Portal QR"
   button and a sheet; a key you hand out belongs where you can see it.

   Copy uses the textarea trick rather than the async clipboard API, because
   the latter needs https and the Android shell talks plain http on the LAN.
   ========================================================================== */

import { useState } from 'react';
import { waLink } from 'shared';
import { Icon } from '@/components/icons';

export default function PortalCard({ url, qr, phone, greeting, size = 168 }: {
  url: string;
  /** The QR as a data URL, drawn by the caller from `url`. */
  qr: string;
  phone?: string;
  /** The line above the link in the WhatsApp message. */
  greeting: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
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
    } catch { /* nothing to do; the share button still carries the link */ }
  }

  return (
    <div>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code for the customer's portal link" width={size} height={size}
          className="rounded-[12px] border border-line-soft bg-white p-1.5" />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <a href={waLink(phone, greeting + '\n' + url)} target="_blank" rel="noreferrer"
          className="h-10 rounded-[12px] text-white text-[13px] font-semibold flex items-center
            justify-center gap-1.5 hover:brightness-95"
          style={{ background: '#25D366' }}>
          <Icon name="upload" size={14} /> Share link
        </a>
        <button type="button" onClick={copy}
          className="h-10 rounded-[12px] border border-line text-ink text-[13px] font-semibold
            hover:bg-wash transition-colors">
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
