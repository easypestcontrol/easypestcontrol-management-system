'use client';

/* ============================================================================
   New customer, as a screen.

   On a phone this was a floating dialog, which is a desktop idea: it has no
   place in history, so Android's back key went past it and closed the whole
   app instead of closing the form. A route has history. Back — the key, the
   gesture, or the arrow in the corner — now does the one thing it should.

   The desktop keeps the dialog: on a wide screen a modal over the list is the
   right shape, and the list stays visible behind it.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import CustomerForm from '../customer-form';

export default function NewCustomer() {
  const router = useRouter();
  return (
    <CustomerForm
      page
      onClose={() => router.back()}
      onDone={(c) => router.replace('/customers/' + c.id)} />
  );
}
