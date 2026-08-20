'use client';

/* ============================================================================
   The admin's branch lens. One dropdown, the same on every section: default
   "All branches", pick one to narrow the whole page. It is a FILTER, never a
   switch — one login, one dashboard, all five branches behind it.

   Only someone who can see more than one branch gets the control (the admin,
   or a manager assigned to several). Everyone else's branch is implied and
   enforced server-side — this control is convenience, the API is the wall.

   The choice sticks while moving between sections (sessionStorage), so Leads
   on Madurai flows into Invoices on Madurai; a new login starts back on All.
   ========================================================================== */

import { useEffect, useState, type ReactNode } from 'react';
import { api, getToken, type Bootstrap, type SessionUser } from '@/lib/api';

const KEY = 'pestops.branchFilter';

export function useBranchFilter(): { branch: string; el: ReactNode } {
  const [branch, setBranch] = useState<string>(() =>
    typeof window === 'undefined' ? '' : sessionStorage.getItem(KEY) || '');
  const [rows, setRows] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!getToken()) return;
    Promise.all([
      api.get<SessionUser>('/auth/me'),
      api.get<Bootstrap>('/org/bootstrap'),
    ]).then(([me, boot]) => {
      if (me.role === 'admin') {
        setRows(boot.branches.map((b) => ({ id: b.id, name: b.name })));
      } else {
        const mine = boot.users.find((u) => u.id === me.id)?.branches || [];
        if (mine.length > 1) {
          setRows(boot.branches
            .filter((b) => mine.includes(b.id))
            .map((b) => ({ id: b.id, name: b.name })));
        }
      }
    }).catch(() => {});
  }, []);

  const pick = (v: string) => {
    setBranch(v);
    try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ }
  };

  const el = rows.length > 1 ? (
    <select value={branch} onChange={(e) => pick(e.target.value)}
      title="See one branch, or the whole company"
      className="h-9 px-2.5 rounded border border-line bg-white text-[12.5px] font-medium outline-none focus:border-navy">
      <option value="">All branches</option>
      {rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  ) : null;

  return { branch, el };
}
