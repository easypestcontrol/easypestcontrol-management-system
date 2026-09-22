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
import Confirm, { type ConfirmSpec } from '@/components/confirm';
import { Facts, ListScreen, Sheet, btnPrimary } from '@/components/mobile';

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

/* 44px under a thumb, 36px under a mouse. */
const inputCls =
  'w-full h-11 lg:h-9 px-3 rounded border border-line text-[15px] lg:text-[13.5px] '
  + 'outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

export default function Branches() {
  const [rows, setRows] = useState<BranchRow[] | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  /** The branch being looked at on the phone. */
  const [preview, setPreview] = useState<BranchRow | null>(null);
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);

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

  /* The app asking, not the browser. */
  function askRemove() {
    const b = rows?.find((x) => x.id === editingId);
    setAsk({
      title: 'Remove ' + (b?.name || editingId) + '?',
      body: 'The branch disappears from the team member form and from lead capture. '
        + 'Records already tagged to it keep the tag.',
      confirmLabel: 'Remove branch',
      cancelLabel: 'Keep it',
      danger: true,
      onConfirm: remove,
    });
  }

  async function remove() {
    if (!editingId) return;
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
      {/* Set up once and rarely touched — but "rarely" is not "never", and the
          phone used to be the one place you could read a branch and not fix a
          wrong phone number on it. */}
      <ListScreen
        back="/dashboard"
        title="Branches"
        loading={!rows}
        rows={(rows || []).map((b) => ({
          id: b.id,
          onClick: () => setPreview(b),
          title: b.name,
          right: b.code,
          meta: [b.phone, b.areas.length
            ? b.areas.length + (b.areas.length === 1 ? ' area' : ' areas') : '']
            .filter(Boolean).join(' \u00b7 '),
          tone: (b.staff ? 'plain' : 'warn') as 'plain' | 'warn',
          state: b.staff
            ? b.staff + (b.staff === 1 ? ' person' : ' people')
            : 'Nobody posted',
        }))}
        empty="No branches yet"
        emptyHint="Every customer, service and invoice belongs to one."
        fabOnClick={() => open(null)}
        fabLabel="Add branch"
      />

      {/* A branch is mostly the ground it covers, so the areas are the body of
          the sheet rather than a count in a corner: that list is what decides
          where a new lead lands. */}
      {preview && (
        <Sheet title={preview.name} sub={preview.id + ' \u00b7 ' + preview.code}
          onClose={() => setPreview(null)}
          actions={
            <button className={btnPrimary}
              onClick={() => { const b = preview; setPreview(null); open(b); }}>
              <Icon name="edit" size={17} /> Edit branch
            </button>
          }>
          <Facts rows={[
            ['Short code', preview.code],
            ['Phone', preview.phone],
            ['People posted', preview.staff],
            ['Leads', preview.leads],
            ['Areas covered', preview.areas.length],
          ]} />

          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
            Areas covered
          </p>
          {preview.areas.length ? (
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {preview.areas.map((a) => (
                <span key={a}
                  className="h-8 px-3 rounded-full bg-ground text-[13.5px] font-semibold
                    inline-flex items-center">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-[14px] text-muted leading-relaxed">
              None listed — leads from this side of town are not routed here yet.
            </p>
          )}
        </Sheet>
      )}
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
    </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-start justify-center
          bg-navy/40 lg:overflow-y-auto lg:py-10"
          onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="w-full lg:w-[560px] lg:max-w-[94vw] bg-white rounded-t-[24px] lg:rounded-md
            shadow-pop lg:border border-line max-h-[92vh] lg:max-h-none flex flex-col lg:block">
            <div className="flex items-center justify-between px-5 h-[56px] lg:h-[52px]
              border-b border-line shrink-0">
              <div>
                <h2 className="text-[16px] lg:text-[15px] font-bold lg:font-semibold leading-tight">
                  {editingId ? 'Edit branch' : 'Add branch'}
                </h2>
                <p className="text-muted-2 text-[11.5px] max-lg:hidden">
                  Team members and leads are posted to branches
                </p>
              </div>
              <button onClick={() => setDraft(null)} aria-label="Close"
                className="w-9 h-9 -mr-2 flex items-center justify-center text-muted hover:text-navy">
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto lg:overflow-visible flex-1 min-h-0">
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
                <label className="block sm:col-span-2">
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

              {/* The phone keeps Cancel and Save in the footer; removal sits
                  down here, away from the thumb's resting place. */}
              {editingId && (
                <button onClick={askRemove}
                  className="lg:hidden mt-6 w-full h-12 rounded-xl border border-accent
                    text-accent text-[15px] font-bold active:bg-red-wash">
                  Remove branch
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 lg:px-5 pt-3 pb-3
              lg:h-[60px] lg:py-0 border-t border-line shrink-0
              pb-[calc(env(safe-area-inset-bottom)+12px)] lg:pb-0">
              <div className="max-lg:hidden">
                {editingId && (
                  <button onClick={askRemove}
                    className="h-9 px-4 rounded border border-line text-[13px] font-medium text-accent hover:bg-red-wash">
                    Remove branch
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 max-lg:w-full">
                <button onClick={() => setDraft(null)}
                  className="max-lg:flex-1 h-12 lg:h-9 px-4 rounded-xl lg:rounded border border-line
                    text-[15px] lg:text-[13px] font-bold lg:font-medium hover:bg-wash">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="max-lg:flex-1 flex items-center justify-center gap-1.5 h-12 lg:h-9 px-4
                    rounded-xl lg:rounded bg-accent text-white text-[15px] lg:text-[13px] font-bold
                    lg:font-semibold hover:brightness-90 disabled:opacity-60">
                  <Icon name="check" size={15} /> {saving ? 'Saving…' : editingId ? 'Save' : 'Add branch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Confirm spec={ask} onClose={() => setAsk(null)} />
    </>
  );
}
