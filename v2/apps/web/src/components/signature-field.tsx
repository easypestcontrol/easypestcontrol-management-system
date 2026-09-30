'use client';

/* ============================================================================
   A signature, as a field on a form.

   One box that is either the signature or an invitation to sign. Tapping it
   opens the full-screen pad (sign-full.tsx); once there is a signature the
   box shows it, with "Sign again" and "Remove" underneath. Anything else a
   form wants to offer beside it - "get it by link instead" - goes in as
   children, so every place that takes a signature looks and works the same.
   ========================================================================== */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import SignFull from '@/components/sign-full';

export default function SignatureField({ value, onChange, title, who, note, children, readOnly }: {
  value: string;
  onChange: (dataUrl: string) => void;
  /** The heading of the full-screen pad: "Customer signature". */
  title: string;
  /** Printed under the signing line: the person's name. */
  who?: string;
  /** A line under the box: "On file since 30 Sep 2026". */
  note?: string;
  /** Extra actions beside Sign / Remove. */
  children?: React.ReactNode;
  /** Shown, never changed (a signature kept on a profile). */
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-signature-field>
      {value ? (
        <div className="rounded-xl border border-line bg-white px-3 py-2 flex items-center justify-center h-[96px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={title} className="max-h-[80px] max-w-full object-contain" />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} disabled={readOnly}
          className="w-full h-[96px] rounded-xl border-2 border-dashed border-line bg-wash
            flex flex-col items-center justify-center gap-1 text-muted active:bg-line-soft hover:border-accent hover:text-accent transition-colors">
          <Icon name="edit" size={20} />
          <span className="text-[14px] font-semibold">Tap to sign</span>
        </button>
      )}

      {note && <p className="text-[11.5px] text-muted mt-1.5">{note}</p>}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button type="button" onClick={() => setOpen(true)}
            className="h-10 lg:h-9 px-3.5 rounded-lg border border-line text-[13.5px] lg:text-[12.5px] font-semibold hover:bg-wash active:bg-wash">
            {value ? 'Sign again' : 'Sign now'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange('')}
              className="h-10 lg:h-9 px-3 rounded-lg text-[13.5px] lg:text-[12.5px] font-semibold text-accent hover:bg-red-wash active:bg-red-wash">
              Remove
            </button>
          )}
          {children}
        </div>
      )}

      {open && (
        <SignFull title={title} who={who}
          onCancel={() => setOpen(false)}
          onDone={(d) => { onChange(d); setOpen(false); }} />
      )}
    </div>
  );
}
