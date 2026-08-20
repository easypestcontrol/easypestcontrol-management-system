'use client';

/* ============================================================================
   Expenses — the folder shelf. The client's Zoho flow: make a folder for the
   day, put the day's spends inside it, submit the folder. The admin's shelf
   leads with what needs a decision; everyone else sees their own folders and
   what the company still owes them.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from 'shared';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';

interface Row {
  id: string; title: string; date: string; status: string; branch: string;
  by: string; byName: string; byColor: string; count: number; total: number;
  payMode: string;
}
interface List { canManage: boolean; kmRate: number; rows: Row[] }

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open — still adding', cls: 'zpill outline' },
  submitted: { label: 'Waiting for approval', cls: 'zpill red' },
  approved: { label: 'Approved — payment due', cls: 'zpill red' },
  rejected: { label: 'Returned', cls: 'zpill red' },
  paid: { label: 'Paid', cls: 'zpill navy' },
};

const fmtDate = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

export default function ExpensesPage() {
  const router = useRouter();
  const [data, setData] = useState<List | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.get<List>('/expenses').then(setData).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function newFolder() {
    if (creating) return;
    setCreating(true); setErr('');
    try {
      const r = await api.post<{ id: string }>('/expenses/reports', {});
      router.push('/expenses/' + r.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the folder');
      setCreating(false);
    }
  }

  if (!data) return <div className="p-6 text-muted text-[13px]">Loading…</div>;

  const rows = data.rows;
  const queue = rows.filter((r) => r.status === 'submitted');
  const toPay = rows.filter((r) => r.status === 'approved');
  const rest = rows.filter((r) => r.status !== 'submitted' && r.status !== 'approved');
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTotal = rows.filter((r) => r.date.startsWith(monthKey) && r.status !== 'rejected')
    .reduce((a, r) => a + r.total, 0);
  const owed = rows.filter((r) => r.status === 'approved').reduce((a, r) => a + r.total, 0);

  const card = (r: Row) => (
    <button key={r.id} onClick={() => router.push('/expenses/' + r.id)}
      className="w-full text-left rounded-md border border-line bg-white shadow-card px-4 py-3 flex items-center gap-3 hover:border-navy/50 transition-colors">
      <span className="w-9 h-9 rounded bg-wash text-navy flex items-center justify-center shrink-0">
        <Icon name="report" size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold truncate">{r.title}</span>
        <span className="block text-[11.5px] text-muted truncate">
          {data.canManage && <>{r.byName} · </>}
          {r.count} expense{r.count === 1 ? '' : 's'} · {fmtDate(r.date)} · {r.id}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-[14px] font-bold">{money(r.total)}</span>
        <span className={STATUS[r.status]?.cls || 'zpill outline'}>{STATUS[r.status]?.label || r.status}</span>
      </span>
    </button>
  );

  return (
    <div className="p-4 lg:p-6 max-w-[860px]">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Expenses</h1>
          <p className="text-muted text-[13px] mt-0.5">
            A folder per day, the day&rsquo;s spends inside it. Submit the folder and the
            admin approves and pays it back.
          </p>
        </div>
        <button onClick={newFolder} disabled={creating}
          className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          <Icon name="plus" size={15} /> New folder for today
        </button>
      </div>
      {err && <p className="text-[12.5px] text-accent mb-3">{err}</p>}

      {/* -------------------------------------------------- summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">This month</p>
          <p className="mt-1 text-[18px] font-bold leading-none">{money(monthTotal)}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {data.canManage ? 'To approve' : 'With the admin'}
          </p>
          <p className={'mt-1 text-[18px] font-bold leading-none ' + (queue.length ? 'text-accent' : '')}>
            {queue.length}
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-3.5 shadow-card">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {data.canManage ? 'To pay out' : 'Owed to you'}
          </p>
          <p className={'mt-1 text-[18px] font-bold leading-none ' + (owed > 0 ? 'text-accent' : '')}>
            {money(owed)}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-line p-10 text-center text-muted text-[13px]">
          No expense folders yet. Make one for today and put the day&rsquo;s bills inside.
        </div>
      ) : (
        <>
          {data.canManage && queue.length > 0 && (
            <>
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-accent mb-2">
                Waiting for your decision
              </h2>
              <div className="flex flex-col gap-2 mb-5">{queue.map(card)}</div>
            </>
          )}
          {data.canManage && toPay.length > 0 && (
            <>
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted mb-2">
                Approved — pay these out
              </h2>
              <div className="flex flex-col gap-2 mb-5">{toPay.map(card)}</div>
            </>
          )}
          {(data.canManage ? rest : rows).length > 0 && (
            <>
              {data.canManage && (queue.length > 0 || toPay.length > 0) && (
                <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted mb-2">Everything else</h2>
              )}
              <div className="flex flex-col gap-2">
                {(data.canManage ? rest : rows).map(card)}
              </div>
            </>
          )}
        </>
      )}

      {data.canManage && !data.kmRate && (
        <p className="mt-5 text-[12px] text-muted">
          Trip allowances need a rate: set <b>₹ per km</b> in Settings → Organisation.
        </p>
      )}
    </div>
  );
}
