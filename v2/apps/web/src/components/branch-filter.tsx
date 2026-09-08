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
import { Icon } from '@/components/icons';
import { api, getToken, type Bootstrap, type SessionUser } from '@/lib/api';

const KEY = 'pestops.branchFilter';

/**
 * The branch picker for the phone's red band.
 *
 * A native <select> opens the operating system's own list — a white box with
 * a blue highlight and system fonts, dropped on top of the brand. It is the
 * one control on that screen that belongs to Windows rather than to this app.
 * This is a sheet instead: our type, our red, our corners, and a tick against
 * the branch you are on.
 */
function BranchSheet({ rows, value, onPick }: {
  rows: Array<{ id: string; name: string }>; value: string; onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = rows.find((r) => r.id === value)?.name || 'All branches';
  const items = [{ id: '', name: 'All branches' }, ...rows];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="h-10 max-w-[150px] pl-3.5 pr-2.5 rounded-full text-white text-[13px] font-semibold
          inline-flex items-center gap-1.5 border border-hero-line active:brightness-95"
        style={{ background: 'var(--color-hero-soft)' }}>
        <span className="truncate">{label}</span>
        <Icon name="chevDown" size={14} className="shrink-0 opacity-80" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-navy/45 flex items-end lg:items-center lg:justify-center"
          onClick={() => setOpen(false)}>
          <div className="w-full lg:max-w-[360px] bg-white rounded-t-[24px] lg:rounded-[22px]
            pt-2 pb-[calc(env(safe-area-inset-bottom)+96px)] lg:pb-2"
            onClick={(e) => e.stopPropagation()}>
            <span className="lg:hidden block w-10 h-1 rounded-full bg-line mx-auto mb-1" />
            <p className="px-5 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-2">
              Branch
            </p>
            {items.map((r) => {
              const on = r.id === value;
              return (
                <button key={r.id || 'all'} type="button"
                  onClick={() => { onPick(r.id); setOpen(false); }}
                  className={'w-full text-left px-5 h-12 flex items-center justify-between gap-3 '
                    + 'text-[15px] active:bg-wash ' + (on ? 'font-bold text-accent' : 'text-ink')}>
                  {r.name}
                  {on && <Icon name="check" size={16} className="text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export function useBranchFilter(): { branch: string; el: ReactNode; heroEl: ReactNode } {
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

  const options = (
    <>
      <option value="">All branches</option>
      {rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </>
  );

  const el = rows.length > 1 ? (
    <select value={branch} onChange={(e) => pick(e.target.value)}
      title="See one branch, or the whole company"
      className="h-9 px-2.5 rounded border border-line bg-white text-[12.5px] font-medium outline-none focus:border-navy">
      {options}
    </select>
  ) : null;

  /* The band gets a picker of our own, not the operating system’s. */
  const heroEl = rows.length > 1
    ? <BranchSheet rows={rows} value={branch} onPick={pick} />
    : null;

  return { branch, el, heroEl };
}
