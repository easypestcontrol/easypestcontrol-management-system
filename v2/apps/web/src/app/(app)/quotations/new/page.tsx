'use client';

/* New quotation — the builder, optionally preloaded from a lead or customer
   (other modules deep-link here: /quotations/new?lead=LD-1042). */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Builder from '../builder';

function NewInner() {
  const sp = useSearchParams();
  return (
    <Builder
      presetClient={sp.get('client') || ''}
      presetLead={sp.get('lead') || ''}
    />
  );
}

export default function NewQuotation() {
  return (
    <Suspense fallback={<p className="p-6 text-muted text-[13px]">Loading…</p>}>
      <NewInner />
    </Suspense>
  );
}
