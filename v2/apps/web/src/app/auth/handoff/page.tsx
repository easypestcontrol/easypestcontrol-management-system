'use client';

/* Token handoff — lands a pre-issued token in this browser and moves on.
   Used by e2e checks today; the customer-portal magic links will use it too. */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken } from '@/lib/api';

function Handoff() {
  const router = useRouter();
  const q = useSearchParams();

  useEffect(() => {
    const t = q.get('token');
    if (t) setToken(t);
    router.replace(q.get('to') || '/dashboard');
  }, [q, router]);

  return <p className="p-6 text-muted text-[13px]">Signing you in…</p>;
}

export default function Page() {
  return <Suspense><Handoff /></Suspense>;
}
