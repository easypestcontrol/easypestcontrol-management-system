'use client';

/* A blank order. Arriving from a vendor's row pre-selects that vendor, which is
   the path the whole module is designed around: pick who you are buying from,
   then say what.

   The form reads the query string, and `useSearchParams` suspends during
   prerender — so the body sits inside a Suspense boundary. Without it the
   production build fails outright rather than at runtime, which is the better
   place to find out. */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import PoBuilder, { blankLine, type PoDraft } from '../builder';

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<PoDraft | null>(null);

  useEffect(() => {
    setDraft({
      vendorId: params.get('vendor') || '',
      date: todayISO(),
      expected: '',
      branch: '',
      notes: '',
      items: [blankLine()],
    });
  }, [params]);

  if (!draft) return <p className="p-4 lg:p-6 text-muted text-[14px]">Loading…</p>;

  return <PoBuilder initial={draft} onSaved={(id) => router.push('/purchase-orders/' + id)} />;
}

export default function NewPurchaseOrder() {
  return (
    <div>
      <div className="flex items-center gap-3 px-4 lg:px-6 h-[56px] border-b border-line">
        <Link href="/purchase-orders" className="text-muted hover:text-navy">
          <Icon name="chevRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-[17px] font-semibold">New purchase order</h1>
      </div>
      <Suspense fallback={<p className="p-4 lg:p-6 text-muted text-[14px]">Loading…</p>}>
        <NewOrderForm />
      </Suspense>
    </div>
  );
}
