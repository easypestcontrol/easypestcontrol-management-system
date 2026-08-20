'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Client } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import CustomerForm from './customer-form';
import { useBranchFilter } from '@/components/branch-filter';

export default function Customers() {
  const router = useRouter();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const bf = useBranchFilter();

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (bf.branch) p.set('branch', bf.branch);
      const qs = p.toString();
      api.get<Client[]>('/clients' + (qs ? '?' + qs : ''))
        .then(setRows).catch(() => setRows([]));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, bf.branch]);

  const pg = usePager(rows || []);

  // The topbar's "+ New → Customer" arrives as /customers?new=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new')) setCreating(true);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Customers</h1>
          {rows && <span className="text-muted-2 text-[12.5px]">{rows.length} records</span>}
        </div>
        <span className="flex items-center gap-3">
          {bf.el}
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New customer
          </button>
        </span>
      </div>

      <div className="px-6 py-3 border-b border-line-soft">
        <label className="flex items-center gap-2 max-w-[340px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, area…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
      </div>

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No customers yet</p>
          <p className="text-muted text-[13px] mt-1">
            They arrive from won leads, or add one directly.
          </p>
          <button onClick={() => setCreating(true)}
            className="mt-4 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            Add the first customer
          </button>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th>Customer</th><th>Type</th><th>Contact</th><th>Area</th>
              <th>City</th><th>GSTIN</th><th>Since</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((c) => (
              <tr key={c.id} className="zrow" onClick={() => router.push('/customers/' + c.id)}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: c.color || '#141414' }}>
                      {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </span>
                    <span>
                      <span className="block font-medium text-navy">{c.name}</span>
                      <span className="block text-[11px] text-muted-2">{c.id}</span>
                    </span>
                  </span>
                </td>
                <td><span className="zpill outline">{c.type}</span></td>
                <td>
                  <span className="block">{c.contact || '—'}</span>
                  <span className="block text-[11.5px] text-muted">{c.phone}</span>
                </td>
                <td>{c.area || '—'}</td>
                <td>{c.city || '—'}</td>
                <td className="text-[12px] text-muted">{c.gstin || '—'}</td>
                <td className="text-muted">{c.since || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pg.el}

      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onDone={(c) => { setCreating(false); router.push('/customers/' + c.id); }} />
      )}
    </div>
  );
}
