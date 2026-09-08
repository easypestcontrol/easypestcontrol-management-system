'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Client } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import CustomerForm from './customer-form';
import { useBranchFilter } from '@/components/branch-filter';
import { ListScreen, PickChip, Chip, compact } from '@/components/mobile';

export default function Customers() {
  const router = useRouter();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [place, setPlace] = useState('');
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

  /* Two filters, over the list already fetched: whether they are on the books
     right now, and where they are. Both are answers to questions asked at a
     desk with a phone in hand — "who in Anna Nagar" and "who is still ours" —
     so neither is worth a round trip to the server. */
  const places = Array.from(new Set((rows || [])
    .map((c) => c.area || c.city || '').filter(Boolean))).sort();
  const shown = (rows || []).filter((c) => {
    const live = (c.contracts || 0) > 0;
    if (state === 'active' && !live) return false;
    if (state === 'past' && live) return false;
    if (place && (c.area || c.city || '') !== place) return false;
    return true;
  });

  // The topbar's "+ New → Customer" arrives as /customers?new=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new')) setCreating(true);
  }, []);

  return (
    <>
      {/* On a phone this list answers one question: who is this person and how
          do I reach them. The table below carries GST numbers and joining
          dates, which nobody looks up standing at a gate. */}
      <ListScreen
        title="Customers"
        loading={!rows}
        search={q}
        onSearch={setQ}
        pinSearch
        searchPlaceholder="Search customers"
        chips={
          <>
            <PickChip label="Status" value={state} onPick={setState}
              options={[
                { key: '', label: 'All customers' },
                { key: 'active', label: 'Active' },
                { key: 'past', label: 'Past' },
              ]} />
            <PickChip label="Location" value={place} onPick={setPlace}
              options={[{ key: '', label: 'All locations' },
                ...places.map((a) => ({ key: a, label: a }))]} />
          </>
        }
        rows={shown.map((c) => ({
          id: c.id,
          href: '/customers/' + c.id,
          /* The name and where they are, and nothing else. A contact, a phone
             number and a Residential/Commercial tag on every row turned a
             list of twelve customers into a wall of text you had to read
             rather than scan. All of it is on the customer's own page, one
             tap away. */
          title: c.name,
          /* Who to ask for and where they are, on one line. The phone number
             and the Residential/Commercial tag are on their own page — they
             were what made this list unreadable. */
          meta: [c.contact === c.name ? '' : c.contact, c.area || c.city]
            .filter(Boolean).join('  ·  '),
          /* Initials of the business, because they sit against the business
             name — initials of the contact beside a different name read as a
             mistake. */
          avatar: c.name,
          /* What this customer is worth to the business, in the two numbers
             anybody actually asks for: how much work has been done, and how
             much of it has been billed. Both come from the list call, so the
             row costs nothing extra to draw. */
          stats: [
            (c.services || 0) > 0 ? c.services + ' service' + (c.services === 1 ? '' : 's') : '',
            (c.billed || 0) > 0 ? compact(c.billed || 0) + ' billed' : '',
          ].filter(Boolean).join('  ·  ') || 'No work yet',
          /* On the books or not — a live contract is the whole difference,
             and it is the first thing asked about a name on this list. */
          pill: (
            <Chip tone={(c.contracts || 0) > 0 ? 'good' : 'plain'}>
              {(c.contracts || 0) > 0 ? 'Active' : 'Past'}
            </Chip>
          ),
        }))}
        empty={q || state || place ? 'Nothing matches that' : 'No customers yet'}
        emptyHint={q || state || place
          ? 'Try a phone number, part of the name, or clear the filters.'
          : 'Add the first one with the red button.'}
        fabHref="/customers/new"
        fabLabel="Add customer"
      />

    <div className="max-lg:hidden">
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

    </div>
      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onDone={(c) => { setCreating(false); router.push('/customers/' + c.id); }} />
      )}
    </>
  );
}
