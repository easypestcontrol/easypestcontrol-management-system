'use client';

/* ============================================================================
   List pagination — one hook for every list screen. 20 rows to a page by
   default; the person picks 20 / 30 / 40 / 100 themselves. The hook hands
   back the current page's slice and the pager bar to drop under the table.
   ========================================================================== */

import { useState, type ReactNode } from 'react';

const SIZES = [20, 30, 40, 100];

const btn = 'h-8 px-2.5 rounded border border-line text-[12.5px] font-medium ' +
  'hover:bg-wash disabled:opacity-40 disabled:pointer-events-none';

export function usePager<T>(rows: T[]): { pageRows: T[]; el: ReactNode } {
  const [page, setPage] = useState(0);
  const [per, setPer] = useState(20);

  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(page, pages - 1); // filters can shrink the list under us
  const pageRows = rows.slice(p * per, p * per + per);

  const el = rows.length > 0 ? (
    <div className="flex items-center justify-between flex-wrap gap-3 px-4 lg:px-6 py-3 text-[12.5px]">
      <span className="text-muted">
        Showing {p * per + 1}–{Math.min(rows.length, (p + 1) * per)} of {rows.length}
      </span>
      <span className="flex items-center gap-2.5 flex-wrap">
        <label className="flex items-center gap-1.5 text-muted">
          Per page
          <select value={per}
            onChange={(e) => { setPer(Number(e.target.value)); setPage(0); }}
            className="h-8 px-2 rounded border border-line bg-white text-[12.5px] outline-none focus:border-navy">
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <button onClick={() => setPage(p - 1)} disabled={p === 0} className={btn}>‹ Prev</button>
            <span className="text-muted tabular-nums">{p + 1} / {pages}</span>
            <button onClick={() => setPage(p + 1)} disabled={p >= pages - 1} className={btn}>Next ›</button>
          </span>
        )}
      </span>
    </div>
  ) : null;

  return { pageRows, el };
}
