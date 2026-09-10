'use client';

/* ============================================================================
   Add an expense, as a screen.

   The same reason the customer form became one: a popup has no place in the
   phone's history, so the back gesture went straight past it and closed the
   app. Claiming petrol at the end of a shift should not be able to do that.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import AddExpense from '../add-expense';

export default function NewExpense() {
  const router = useRouter();
  return (
    <AddExpense
      page
      onClose={() => router.back()}
      onDone={() => router.replace('/expenses')} />
  );
}
