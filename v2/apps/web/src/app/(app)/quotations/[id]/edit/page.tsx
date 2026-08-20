'use client';

/* Edit quotation — the same builder, loaded with the stored document.
   A quotation that already became a contract is the record of what was
   agreed and cannot be reopened (quotations.js:1373); the API enforces it
   and this page explains it. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Builder from '../../builder';
import { type QuoteFull } from '../../lib';

export default function EditQuotation() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [q, setQ] = useState<QuoteFull | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<QuoteFull>('/quotations/' + id)
      .then(setQ)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Quotation not found</p>
        <p className="text-muted text-[13px] mt-1">It may have been deleted.</p>
        <Link href="/quotations" className="inline-block mt-4 text-[13px] text-navy font-medium hover:underline">
          All quotations
        </Link>
      </div>
    );
  }
  if (!q) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  if (q.contractId) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">{q.id} can no longer be edited</p>
        <p className="text-muted text-[13px] mt-1">
          Contract {q.contractId} was generated from it — the quotation is the record of what was agreed.
        </p>
        <Link href={'/quotations/' + q.id} className="inline-block mt-4 text-[13px] text-navy font-medium hover:underline">
          View the quotation
        </Link>
      </div>
    );
  }

  return <Builder edit={q} />;
}
