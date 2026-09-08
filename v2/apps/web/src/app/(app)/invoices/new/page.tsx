'use client';

/* ============================================================================
   New invoice, as a screen.

   Same reason as the customer form: a dialog has no place in history, so the
   back key and the back gesture went straight past it. Both modes live here —
   raising against a contract and a standalone bill — because picking the
   contract is a step inside the same job, not a second popup on top of the
   first.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { CreateDialog } from '../create-invoice';

export default function NewInvoice() {
  const router = useRouter();
  return (
    <CreateDialog
      page
      onClose={() => router.back()}
      onCreated={(id) => router.replace('/invoices/' + id)} />
  );
}
