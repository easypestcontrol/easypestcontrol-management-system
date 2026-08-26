'use client';

/* ============================================================================
   Service Catalogue — the answer to "what services do you provide?".
   Ported from v1 services.js: category chips, search, editor with the
   chemicals picker and the PDF information sheet (≤1.5 MB, stored as a data
   URL, auto-attached to quotations). Delete is refused by the server while
   jobs, contracts or quotations still name the service.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { usePager } from '@/components/pager';
import { money } from 'shared';
import { ListScreen } from '@/components/mobile';

const CATS = ['All', 'Residential', 'Commercial', 'Industrial', 'Specialised'];
const MAX_PDF_KB = 1500; // v1 services.js:14

interface Service {
  id: string; code: string; name: string; cat: string; price: number;
  unit: string; mins: number; warranty: string; chem: string[];
  desc: string; pdf: string; used: number;
}

interface Chem { id: string; name: string; cat: string; unit: string }

interface Draft {
  name: string; code: string; cat: string; price: string; unit: string;
  mins: string; warranty: string; desc: string; chem: string[]; pdf: string;
}

// v1 services.js:146-153 — editor pre-fills use || so blanks show the default
function toDraft(s: Service | null): Draft {
  return {
    name: s?.name || '', code: s?.code || '', cat: s?.cat || 'Residential',
    price: String(s?.price || 1500), unit: s?.unit || 'per visit',
    mins: String(s?.mins || 60), warranty: s?.warranty || '3 months',
    desc: s?.desc || '', chem: s?.chem || [], pdf: s?.pdf || '',
  };
}

/** v1 store.js:365-370. */
function durationText(mins: number) {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

export default function Services() {
  const [rows, setRows] = useState<Service[] | null>(null);
  const [chems, setChems] = useState<Chem[]>([]);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');

  // editor state — open when draft is set; editingId '' means "new service"
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<Service[]>('/services').then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    api.get<Chem[]>('/services/chemicals').then(setChems).catch(() => {});
  }, [load]);

  const needle = q.toLowerCase();
  const visible = (rows ?? []).filter((s) =>
    (cat === 'All' || s.cat === cat) &&
    (!needle || (s.name + s.code + s.desc).toLowerCase().includes(needle)));
  const withSheet = (rows ?? []).filter((s) => s.pdf).length;
  const pg = usePager(visible);

  function open(s: Service | null) {
    setDraft(toDraft(s));
    setEditingId(s?.id || '');
    setErr('');
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  function onPdf(f: File) {
    setErr('');
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      setErr('That is not a PDF — choose a .pdf file'); return;
    }
    if (Math.round(f.size / 1024) > MAX_PDF_KB) {
      setErr(`PDF is too large — keep it under ${MAX_PDF_KB / 1000} MB`); return;
    }
    const reader = new FileReader();
    reader.onload = () => set('pdf', String(reader.result || ''));
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!draft) return;
    setErr('');
    if (!draft.name.trim()) { setErr('Service name is required'); return; }
    const body = {
      name: draft.name.trim(),
      // v1 services.js:224 — code defaults to the first three letters
      code: draft.code.trim() || draft.name.trim().slice(0, 3).toUpperCase(),
      cat: draft.cat,
      price: parseFloat(draft.price) || 0,
      unit: draft.unit.trim(),
      mins: parseInt(draft.mins, 10) || 60,
      warranty: draft.warranty.trim(),
      desc: draft.desc.trim(),
      chem: draft.chem,
      pdf: draft.pdf,
    };
    setSaving(true);
    try {
      if (editingId) await api.patch('/services/' + editingId, body);
      else await api.post('/services', body);
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
    const s = rows?.find((x) => x.id === editingId);
    if (!window.confirm(
      `Remove ${s?.name || editingId}? It disappears from the catalogue and from quotation line items.` +
      (s?.pdf ? ' Its information sheet is deleted too.' : ''))) return;
    setErr('');
    try {
      await api.del('/services/' + editingId);
      setDraft(null);
      load();
    } catch (e) {
      // the server refuses while jobs / contracts / quotations still name it
      setErr(e instanceof ApiError ? e.message : 'Could not remove');
    }
  }

  return (
    <>
      {/* The price list, for when somebody asks what a treatment costs. */}
      <ListScreen
        back="/dashboard"
        title="Service catalogue"
        loading={!rows}
        search={q}
        onSearch={setQ}
        rows={(rows || []).map((sv) => ({
          id: sv.id,
          title: sv.name,
          amount: sv.price ? money(sv.price) : undefined,
          meta: [sv.code, sv.cat, sv.mins ? sv.mins + ' min' : ''].filter(Boolean).join(' \u00b7 '),
          tone: 'plain' as const,
          state: sv.used ? sv.used + ' on contracts' : 'Not used yet',
        }))}
        empty="Nothing in the catalogue"
        emptyHint="List what you sell before raising a quotation."
        fabOnClick={() => open(null)}
        fabLabel="Add service"
      />
    <div className="max-lg:hidden">
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Service Catalogue</h1>
          {rows && (
            <span className="text-muted-2 text-[12.5px]">
              {rows.length} services · {withSheet} with an information sheet
            </span>
          )}
        </div>
        <button onClick={() => open(null)}
          className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> Add service
        </button>
      </div>

      <div className="px-6 py-3 border-b border-line-soft flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 w-[280px] h-8 px-3 rounded border border-line bg-wash focus-within:bg-white">
          <Icon name="search" size={14} className="text-muted-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…"
            className="flex-1 bg-transparent outline-none text-[13px]" />
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={'h-7 px-3 rounded-full text-[12.5px] border transition-colors ' +
                (cat === c ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {!rows ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">No services match</p>
          <p className="text-muted text-[13px] mt-1">Try another category or search term.</p>
        </div>
      ) : (
        <table className="ztable">
          <thead>
            <tr>
              <th>Service</th><th>Category</th><th style={{ textAlign: 'right' }}>Rate</th>
              <th>Duration</th><th>Warranty</th><th>Chemicals</th><th>Sheet</th>
              <th style={{ textAlign: 'right' }}>Delivered</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((s) => (
              <tr key={s.id} className="zrow" onClick={() => open(s)}>
                <td>
                  <span className="block font-medium text-navy">{s.name}</span>
                  <span className="block text-[11px] text-muted-2">{s.id} · {s.code}</span>
                </td>
                <td><span className="zpill outline">{s.cat}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <span className="block font-medium">{money(s.price)}</span>
                  <span className="block text-[11px] text-muted-2">{s.unit}</span>
                </td>
                <td>{durationText(s.mins)}</td>
                <td>{s.warranty || '—'}</td>
                <td className="text-muted">{s.chem.length || '—'}</td>
                <td>{s.pdf ? <span className="zpill red">PDF</span> : <span className="text-muted-2">—</span>}</td>
                <td style={{ textAlign: 'right' }} className="text-muted">{s.used} jobs</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pg.el}

      {/* ------------------------------------------------------------ editor */}
    </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy/40 overflow-y-auto py-10"
          onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="w-[640px] max-w-[94vw] bg-white rounded-md shadow-pop border border-line">
            <div className="flex items-center justify-between px-5 h-[52px] border-b border-line">
              <h2 className="text-[15px] font-semibold">{editingId ? 'Edit service' : 'Add service'}</h2>
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
                  <span className={labelCls}>Service name <span className="text-accent">*</span></span>
                  <input className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelCls}>Short code</span>
                  <input className={inputCls} value={draft.code} placeholder="e.g. GPC"
                    onChange={(e) => set('code', e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelCls}>Category</span>
                  <select className={inputCls} value={draft.cat} onChange={(e) => set('cat', e.target.value)}>
                    {CATS.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={labelCls}>Standard rate (₹)</span>
                  <input type="number" step={100} className={inputCls} value={draft.price}
                    onChange={(e) => set('price', e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelCls}>Charged</span>
                  <input className={inputCls} value={draft.unit} placeholder="per visit"
                    onChange={(e) => set('unit', e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelCls}>Duration (minutes)</span>
                  <input type="number" step={15} className={inputCls} value={draft.mins}
                    onChange={(e) => set('mins', e.target.value)} />
                </label>
                <label className="block col-span-2">
                  <span className={labelCls}>Warranty</span>
                  <input className={inputCls} value={draft.warranty} onChange={(e) => set('warranty', e.target.value)} />
                </label>
                <label className="block col-span-2">
                  <span className={labelCls}>What the service covers</span>
                  <textarea className={inputCls + ' h-auto py-2 min-h-[72px]'} value={draft.desc}
                    onChange={(e) => set('desc', e.target.value)} />
                </label>
              </div>

              {/* --------------------------------------------------- chemicals */}
              <p className={labelCls + ' mt-4'}>Chemicals used</p>
              {chems.length ? (
                <div className="flex gap-1.5 flex-wrap">
                  {chems.map((c) => {
                    const on = draft.chem.includes(c.id);
                    return (
                      <button key={c.id} type="button" title={c.cat}
                        onClick={() => set('chem', on
                          ? draft.chem.filter((x) => x !== c.id)
                          : [...draft.chem, c.id])}
                        className={'h-7 px-2.5 rounded-full border text-[12px] font-medium flex items-center gap-1 transition-colors ' +
                          (on ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
                        {on && <Icon name="check" size={12} />} {c.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted text-[12.5px]">
                  Nothing in the chemical store yet — add items under Inventory first.
                </p>
              )}

              {/* --------------------------------------------------- PDF sheet */}
              <p className={labelCls + ' mt-4'}>Service information sheet (PDF)</p>
              {draft.pdf ? (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded border border-line">
                  <span className="zpill red">PDF</span>
                  <span className="flex-1 text-[13px] text-ink-2">
                    Sheet attached — sent automatically with any quotation that includes this service.
                  </span>
                  <button onClick={() => set('pdf', '')} title="Remove"
                    className="w-8 h-8 rounded border border-line text-muted hover:text-accent hover:bg-red-wash flex items-center justify-center shrink-0">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash cursor-pointer">
                    <Icon name="upload" size={13} /> Choose PDF
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPdf(f);
                        e.target.value = '';
                      }} />
                  </label>
                  <p className="text-muted-2 text-[11.5px] mt-1.5">
                    Sent to the customer automatically with any quotation that includes this
                    service. Up to {MAX_PDF_KB / 1000} MB.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 h-[60px] border-t border-line">
              <div>
                {editingId && (
                  <button onClick={remove}
                    className="h-9 px-4 rounded border border-line text-[13px] font-medium text-accent hover:bg-red-wash">
                    Remove service
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
                  <Icon name="check" size={14} /> Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
