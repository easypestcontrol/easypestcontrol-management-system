'use client';

/* ============================================================================
   Settings — section-wise, the Zoho Books way: a section list on the left,
   one section's controls on the right. Organisation holds the identity that
   prints on documents; Document terms holds a SEPARATE terms list for each
   document — quotation, invoice, contract, service report.

   API keys are NOT here any more — they live on the Credentials page, stored
   encrypted, revealed only on demand.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type Bootstrap, type Company } from '@/lib/api';
import { Icon } from '@/components/icons';

type SectionId = 'org' | 'terms';

const SECTIONS: Array<{ id: SectionId; label: string; sub: string }> = [
  { id: 'org', label: 'Organisation', sub: 'Name, logo, address, GSTIN' },
  { id: 'terms', label: 'Document terms', sub: 'Per quotation, invoice, contract, service' },
];

const DOCS = [
  { key: 'quotation', label: 'Quotation', sub: 'Printed at the foot of every quotation' },
  { key: 'invoice', label: 'Invoice', sub: 'Printed at the foot of every tax invoice' },
  { key: 'contract', label: 'Contract', sub: 'Printed on the shared contract view' },
  { key: 'service', label: 'Service report', sub: 'Printed at the foot of every service report' },
] as const;

export default function Settings() {
  const [co, setCo] = useState<Company | null>(null);
  const [section, setSection] = useState<SectionId>('org');
  const [saved, setSaved] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Bootstrap>('/org/bootstrap').then((b) => setCo(b.company)).catch(() => {});
  }, []);

  function set<K extends keyof Company>(k: K, v: Company[K]) {
    setCo((c) => (c ? { ...c, [k]: v } : c));
  }

  async function save() {
    if (!co) return;
    // The legacy shared list follows the quotation terms, so the builders
    // that still read it keep working — including following it to empty.
    const body = {
      ...co,
      terms: Array.isArray(co.docTerms?.quotation) ? co.docTerms!.quotation! : co.terms,
    };
    await api.patch('/org/company', body);
    setCo(body);
    setSaved('Saved');
    setTimeout(() => setSaved(''), 3000);
  }

  /** Downscale to a 240px-tall PNG so a phone photo doesn't bloat the database. */
  function onLogo(f: File) {
    const img = new Image();
    img.onload = () => {
      const h = Math.min(240, img.height);
      const w = Math.round(img.width * (h / img.height));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
      set('logo', cv.toDataURL('image/png'));
    };
    img.src = URL.createObjectURL(f);
  }

  if (!co) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  // A plain function, NOT a nested component: a component declared inside the
  // render is a new type every render, so React remounts the input and the
  // cursor falls out after every keystroke.
  const field = (label: string, k: keyof Company, wide?: boolean) => (
    <label key={k} className={'block ' + (wide ? 'sm:col-span-2' : '')}>
      <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">{label}</span>
      <input value={String(co[k] ?? '')} onChange={(e) => set(k, e.target.value as never)}
        className="w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
    </label>
  );

  const dt = co.docTerms || {};
  // An emptied list is a DECISION, not an absence: only a list that was never
  // set falls back to the legacy shared terms. Otherwise deleting the last
  // term resurrects it, and quotation edits bleed into the contract list.
  const listOf = (key: (typeof DOCS)[number]['key']): string[] =>
    Array.isArray(dt[key])
      ? dt[key]!
      : key === 'quotation' || key === 'contract' ? (co.terms || []) : [];
  const setList = (key: string, rows: string[]) =>
    set('docTerms', { ...dt, [key]: rows } as never);

  return (
    <div className="p-4 lg:p-6 max-w-[980px]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">Settings</h1>
          <p className="text-muted text-[13px] mt-0.5">Pick a section, change it, save.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[12.5px] font-semibold text-navy">{saved} ✓</span>}
          <button onClick={save}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            Save changes
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* ------------------------------------------------ section list */}
        <nav className="lg:w-[230px] shrink-0 flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={'text-left rounded-md px-3.5 py-2.5 shrink-0 border transition-colors '
                + (section === s.id
                  ? 'border-navy bg-wash'
                  : 'border-transparent hover:bg-wash')}>
              <span className={'block text-[13px] font-semibold ' + (section === s.id ? 'text-navy' : '')}>
                {s.label}
              </span>
              <span className="block text-[11px] text-muted max-lg:hidden">{s.sub}</span>
            </button>
          ))}
          <Link href="/credentials"
            className="text-left rounded-md px-3.5 py-2.5 shrink-0 border border-transparent hover:bg-wash">
            <span className="block text-[13px] font-semibold">API keys &amp; credentials ↗</span>
            <span className="block text-[11px] text-muted max-lg:hidden">
              Ola Maps, Razorpay, VPS — stored encrypted
            </span>
          </Link>
        </nav>

        {/* --------------------------------------------------- the section */}
        <div className="flex-1 min-w-0">
          {section === 'org' && (
            <>
              <section className="rounded-md border border-line p-5 mb-5">
                <h2 className="text-[14px] font-semibold mb-1">Company logo</h2>
                <p className="text-muted text-[12.5px] mb-4">
                  Shown at the top of the sidebar and on printed documents.
                </p>
                <div className="flex items-center gap-5 flex-wrap">
                  <span className="w-[120px] h-[64px] rounded border border-line bg-wash flex items-center justify-center overflow-hidden">
                    {co.logo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={co.logo} alt="logo" className="max-w-full max-h-full object-contain" />
                      : <span className="text-muted-2 text-[11px]">No logo yet</span>}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => file.current?.click()}
                      className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
                      <Icon name="upload" size={14} /> Upload
                    </button>
                    {co.logo && (
                      <button onClick={() => set('logo', '')}
                        className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium text-accent hover:bg-red-wash">
                        <Icon name="x" size={14} /> Remove
                      </button>
                    )}
                  </div>
                  <input ref={file} type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
                </div>
              </section>

              <section className="rounded-md border border-line p-5">
                <h2 className="text-[14px] font-semibold mb-4">Profile</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {field('Company name', 'name')}
                  {field('Phone', 'phone')}
                  {field('Email', 'email')}
                  {field('GSTIN', 'gstin')}
                  {field('Home state (decides CGST/SGST vs IGST)', 'state')}
                  {field('Address', 'addr', true)}
                  {field('City', 'city')}
                  {field('PIN', 'pin')}
                </div>
              </section>
            </>
          )}

          {section === 'terms' && (
            <div className="flex flex-col gap-5">
              {DOCS.map((d) => {
                const rows = listOf(d.key);
                return (
                  <section key={d.key} className="rounded-md border border-line p-5">
                    <h2 className="text-[14px] font-semibold mb-1">{d.label} terms</h2>
                    <p className="text-muted text-[12.5px] mb-4">{d.sub}. One line per term.</p>
                    {rows.map((t, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <span className="w-6 h-9 flex items-center justify-center text-[12px] text-muted-2 shrink-0">
                          {i + 1}.
                        </span>
                        <input value={t}
                          onChange={(e) => setList(d.key, rows.map((x, j) => (j === i ? e.target.value : x)))}
                          className="flex-1 h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
                        <button onClick={() => setList(d.key, rows.filter((_, j) => j !== i))}
                          title="Remove"
                          className="w-9 h-9 rounded border border-line text-muted hover:text-accent hover:bg-red-wash flex items-center justify-center shrink-0">
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setList(d.key, [...rows, ''])}
                      className="mt-1 flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
                      <Icon name="plus" size={13} /> Add a term
                    </button>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
