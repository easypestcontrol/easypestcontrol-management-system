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
import Confirm, { type ConfirmSpec } from '@/components/confirm';
import { Facts, ListScreen, Sheet, btnPrimary } from '@/components/mobile';

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

/* 44px under a thumb, 36px under a mouse. */
const inputCls =
  'w-full h-11 lg:h-9 px-3 rounded border border-line text-[15px] lg:text-[13.5px] '
  + 'outline-none focus:border-navy bg-white';
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
  /** The service being read on the phone, before any decision to change it. */
  const [preview, setPreview] = useState<Service | null>(null);
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);

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

  /* Asked by the app, not by the browser. window.confirm() is a grey strip
     with the hostname on it and two buttons called OK and Cancel — on a phone
     it is the one thing on the screen that is not this app. */
  function askRemove() {
    const s = rows?.find((x) => x.id === editingId);
    setAsk({
      title: 'Remove ' + (s?.name || editingId) + '?',
      body: 'It disappears from the catalogue and from quotation line items.'
        + (s?.pdf ? ' Its information sheet goes with it.' : ''),
      confirmLabel: 'Remove service',
      cancelLabel: 'Keep it',
      danger: true,
      onConfirm: remove,
    });
  }

  async function remove() {
    if (!editingId) return;
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
        searchPlaceholder="Search a treatment or a code"
        /* `visible`, not `rows`. The phone had a search box wired to `q` and a
           list built from the unfiltered array underneath it, so typing
           narrowed nothing and the field read as broken. The category chips
           are the same list the desk filters by. */
        filters={CATS.map((c) => ({ key: c, label: c }))}
        filter={cat}
        onFilter={setCat}
        rows={visible.map((sv) => ({
          id: sv.id,
          onClick: () => setPreview(sv),
          title: sv.name,
          amount: sv.price ? money(sv.price) : undefined,
          meta: [sv.code, sv.cat, durationText(sv.mins)].filter(Boolean).join(' \u00b7 '),
          tone: (sv.used ? 'good' : 'plain') as 'good' | 'plain',
          state: sv.used ? sv.used + ' on contracts' : 'Not used yet',
        }))}
        empty="Nothing in the catalogue"
        emptyHint="List what you sell before raising a quotation."
        fabOnClick={() => open(null)}
        fabLabel="Add service"
      />

      {/* Tap a service and you get the whole of it: what it costs, how long it
          takes, what is guaranteed, what goes on the wall. Then Edit. */}
      {preview && (
        <Sheet title={preview.name}
          sub={[preview.code, preview.cat].filter(Boolean).join(' \u00b7 ')}
          onClose={() => setPreview(null)}
          actions={
            <button className={btnPrimary}
              onClick={() => { const s = preview; setPreview(null); open(s); }}>
              <Icon name="edit" size={17} /> Edit service
            </button>
          }>
          {/* The rate, in the size the question deserves — "what does it
              cost?" is why anybody opens the catalogue on a phone. */}
          <div className="rounded-[16px] bg-rose px-4 py-3.5 text-center">
            <p className="text-[27px] font-bold tracking-[-0.02em] leading-none text-rose-ink">
              {money(preview.price)}
            </p>
            <p className="text-[13px] text-rose-ink/80 mt-1">{preview.unit || 'per visit'}</p>
          </div>

          <div className="mt-3">
            <Facts rows={[
              ['Takes', durationText(preview.mins)],
              ['Warranty', preview.warranty],
              ['Category', preview.cat],
              ['Code', preview.code],
              ['On contracts', preview.used ? preview.used + ' jobs' : 'Not used yet'],
              ['Information sheet', preview.pdf ? 'PDF attached' : ''],
            ]} />
          </div>

          {preview.desc && (
            <>
              <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                What it covers
              </p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{preview.desc}</p>
            </>
          )}

          {/* Chemicals by name. The record holds ids, and "IN01, IN03" tells
              the person standing in front of the customer nothing. */}
          {preview.chem.length > 0 && (
            <>
              <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Chemicals used
              </p>
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {preview.chem.map((id) => (
                  <span key={id}
                    className="h-8 px-3 rounded-full bg-ground text-[13.5px] font-semibold
                      inline-flex items-center">
                    {chems.find((c) => c.id === id)?.name || id}
                  </span>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
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
      {/* A sheet rising from the bottom on a phone, the same dialog as before
          at a desk. The editor is long — eight fields, a chemical picker and a
          file — so on a phone the header and the buttons are pinned and only
          the middle scrolls, rather than the whole overlay drifting. */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-start justify-center
          bg-navy/40 lg:overflow-y-auto lg:py-10"
          onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="w-full lg:w-[640px] lg:max-w-[94vw] bg-white rounded-t-[24px] lg:rounded-md
            shadow-pop lg:border border-line max-h-[92vh] lg:max-h-none flex flex-col lg:block">
            <div className="flex items-center justify-between px-5 h-[56px] lg:h-[52px]
              border-b border-line shrink-0">
              <h2 className="text-[16px] lg:text-[15px] font-bold lg:font-semibold">
                {editingId ? 'Edit service' : 'Add service'}
              </h2>
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
                <label className="block sm:col-span-2">
                  <span className={labelCls}>Warranty</span>
                  <input className={inputCls} value={draft.warranty} onChange={(e) => set('warranty', e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
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
              {/* Removal lives at the bottom of the form on a phone. The desk
                  keeps it in the footer; a phone footer holds Cancel and Save,
                  and a third button there is the one a thumb finds by accident. */}
              {editingId && (
                <button onClick={askRemove}
                  className="lg:hidden mt-6 w-full h-12 rounded-xl border border-accent
                    text-accent text-[15px] font-bold active:bg-red-wash">
                  Remove service
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
                    Remove service
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
                  <Icon name="check" size={15} /> {saving ? 'Saving…' : 'Save'}
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
