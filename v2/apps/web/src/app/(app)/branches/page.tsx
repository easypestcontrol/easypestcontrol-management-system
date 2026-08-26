'use client';

/* ============================================================================
   Branches — the territory map. Each branch carries the localities it covers;
   a customer or lead captured in one of those areas is routed to this branch
   and to the people posted here. Ported from v1 masterdata.js (branch tab).

   Save rules: name + code required, code uppercased (≤6) and unique, areas
   deduped ignoring case. Delete is refused by the server while staff are
   still posted there — records already tagged to a removed branch keep the
   tag.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { ListScreen } from '@/components/mobile';

interface BranchRow {
  id: string; name: string; code: string; phone: string; areas: string[];
  staff: number; leads: number;
}

interface Draft { name: string; code: string; phone: string; areas: string[] }

function toDraft(b: BranchRow | null): Draft {
  return {
    name: b?.name || '', code: b?.code || '', phone: b?.phone || '',
    areas: b?.areas ? [...b.areas] : [],
  };
}

const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

export default function Branches() {
  const [rows, setRows] = useState<BranchRow[] | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<BranchRow[]>('/branches').then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  const coveredAreas = new Set(
    (rows ?? []).flatMap((b) => b.areas.map((a) => a.toLowerCase())),
  ).size;

  function open(b: BranchRow | null) {
    setDraft(toDraft(b));
    setEditingId(b?.id || '');
    setAreaInput('');
    setErr('');
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  /** Add whatever is typed — comma-splits and dedupes ignoring case (v1 masterdata.js:74-76). */
  function addAreas(raw: string) {
    if (!draft) return;
    const next = [...draft.areas];
    for (const part of raw.split(',')) {
      const v = part.trim();
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    set('areas', next);
    setAreaInput('');
  }

  async function save() {
    if (!draft) return;
    setErr('');
    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();
    if (!name || !code) { setErr('Branch name and short code are required'); return; }

    const body = {
      name, code, phone: draft.phone.trim(),
      // anything still sitting in the input counts too
      areas: areaInput.trim()
        ? [...draft.areas, ...areaInput.split(',').map((x) => x.trim()).filter(Boolean)]
        : draft.areas,
    };
    setSaving(true);
    try {
      if (editingId) await api.patch('/branches/' + editingId, body);
      else await api.post('/branches', body);
      setDraft(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    const b = rows?.find((x) => x.id === editingId);
    if (!window.confirm(
      `Remove ${b?.name || editingId}? The branch disappears from the team member form ` +
      'and from lead capture. Records already tagged to it keep the tag.')) return;
    setErr('');
    try {
      await api.del('/branches/' + editingId);
      setDraft(null);
      load();
    } catch (e) {
      // the server refuses while staff are still posted there
      setErr(e instanceof ApiError ? e.message : 'Could not remove');
    }
  }

  return (
    <>
      {/* Set up once and rarely touched, so the phone only reads it. */}
      <ListScreen
        title="Branches"
        loading={!rows}
        rows={(rows || []).map((b) => ({
          id: b.id,
          title: b.name,
          right: b.code,
          meta: [b.phone, b.areas.length ? b.areas.length + ' areas' : ''].filter(Boolean).join(' \u00b7 '),
          tone: 'plain' as const,
          state: b.staff + (b.staff === 1 ? ' person' : ' people'),
        }))}
        empty="No branches yet"
        emptyHint="Every customer, service and invoice belongs to one."
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Branches</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {rows.length} branches · {coveredAreas} areas covered
            </span>
          )}
        </div>
        <button onClick={() => open(null)}
          className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> Add branch
        </button>
      </div>

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No branches yet</p>
          <p className="text-muted text-[13px] mt-1">
            Add your first branch to start posting people to it.
          </p>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th>Branch</th><th>Phone</th><th>Areas covered</th>
              <th style={{ textAlign: 'right' }}>Staff</th>
              <th style={{ textAlign: 'right' }}>Leads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="zrow" onClick={() => open(b)}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded bg-navy text-white flex items-center justify-center shrink-0">
                      <Icon name="branch" size={14} />
                    </span>
                    <span>
                      <span className="block font-medium text-navy">{b.name}</span>
                      <span className="block text-[11px] text-muted-2">{b.id} · {b.code}</span>
                    </span>
                  </span>
                </td>
                <td>{b.phone || '—'}</td>
                <td>
                  {b.areas.length ? (
                    <span className="flex gap-1 flex-wrap max-w-[420px]">
                      {b.areas.slice(0, 6).map((a) => (
                        <span key={a} className="zpill outline">{a}</span>
                      ))}
                      {b.areas.length > 6 && (
                        <span className="zpill">+{b.areas.length - 6} more</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted">
                      None listed — leads from this side of town are not routed here yet.
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }} className="font-medium">{b.staff}</td>
                <td style={{ textAlign: 'right' }} className="text-muted">{b.leads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ------------------------------------------------------------ editor */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy/40 overflow-y-auto py-10"
          onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="w-[560px] max-w-[94vw] bg-white rounded-md shadow-pop border border-line">
            <div className="flex items-center justify-between px-5 h-[52px] border-b border-line">
              <div>
                <h2 className="text-[15px] font-semibold leading-tight">
                  {editingId ? 'Edit branch' : 'Add branch'}
                </h2>
                <p className="text-muted-2 text-[11.5px]">
                  Team members and leads are posted to branches
                </p>
              </div>
              <button onClick={() => setDraft(null)} className="text-muted hover:text-navy">
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="p-5">
              {err && (
                <div className="mb-4 px-4 py-2.5 rounded border border-red-line bg-red-wash text-[13px] text-accent font-medium">
                  {err}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className={labelCls}>Branch name <span className="text-accent">*</span></span>
                  <input className={inputCls} value={draft.name} placeholder="e.g. Anna Nagar"
                    onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelCls}>Short code <span className="text-accent">*</span></span>
                  <input className={inputCls + ' uppercase'} value={draft.code} placeholder="e.g. ANR"
                    maxLength={6} onChange={(e) => set('code', e.target.value.toUpperCase())} />
                </label>
                <label className="block col-span-2">
                  <span className={labelCls}>Phone</span>
                  <input className={inputCls} value={draft.phone} placeholder="+91 "
                    onChange={(e) => set('phone', e.target.value)} />
                </label>
              </div>

              {/* ---------------------------------------------- areas tag editor */}
              <p className={labelCls + ' mt-4'}>Areas covered</p>
              <div className="rounded border border-line px-2 py-2 flex gap-1.5 flex-wrap focus-within:border-navy">
                {draft.areas.map((a) => (
                  <span key={a} className="zpill outline flex items-center gap-1">
                    {a}
                    <button type="button" title="Remove"
                      onClick={() => set('areas', draft.areas.filter((x) => x !== a))}
                      className="text-muted hover:text-accent">
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
                <input value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addAreas(areaInput);
                    } else if (e.key === 'Backspace' && !areaInput && draft.areas.length) {
                      set('areas', draft.areas.slice(0, -1));
                    }
                  }}
                  onBlur={() => areaInput.trim() && addAreas(areaInput)}
                  placeholder={draft.areas.length ? 'Add another…' : 'Adyar, Besant Nagar, Thiruvanmiyur'}
                  className="flex-1 min-w-[140px] h-7 px-1 bg-transparent outline-none text-[13px]" />
              </div>
              <p className="text-muted-2 text-[11.5px] mt-1.5">
                Press Enter or comma to add. A customer or lead captured in one of these
                localities is routed to this branch and to the people posted here.
              </p>
            </div>

            <div className="flex items-center justify-between px-5 h-[60px] border-t border-line">
              <div>
                {editingId && (
                  <button onClick={remove}
                    className="h-9 px-4 rounded border border-line text-[13px] font-medium text-accent hover:bg-red-wash">
                    Remove branch
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDraft(null)}
                  className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
                  <Icon name="check" size={14} /> {editingId ? 'Save branch' : 'Add branch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
