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

type SectionId = 'org' | 'terms' | 'roles';

const SECTIONS: Array<{ id: SectionId; label: string; sub: string }> = [
  { id: 'org', label: 'Organisation', sub: 'Name, logo, signature & seal, GSTIN' },
  { id: 'terms', label: 'Document terms', sub: 'Per quotation, invoice, contract, service' },
  { id: 'roles', label: 'User roles', sub: 'Which pages each role can open' },
];

/* Every page the checklist can grant or hide, with each role's built-in
   default — unticking hides the page AND blocks navigating to it. */
const PAGES: Array<{ href: string; label: string; def: string[] }> = [
  { href: '/dashboard', label: 'Home', def: ['ops', 'sales', 'accounts', 'tech', 'senior_tech'] },
  { href: '/tasks', label: 'Tasks', def: ['ops', 'sales', 'accounts', 'tech', 'senior_tech'] },
  { href: '/leads', label: 'Leads', def: ['ops', 'sales'] },
  { href: '/quotations', label: 'Quotations', def: ['ops', 'sales'] },
  { href: '/customers', label: 'Customers', def: ['ops', 'sales', 'accounts'] },
  { href: '/contracts', label: 'Contracts', def: ['ops', 'sales', 'accounts'] },
  { href: '/board', label: 'Dispatch', def: ['ops', 'sales'] },
  { href: '/schedule', label: 'Schedule', def: ['ops', 'sales'] },
  { href: '/jobs', label: 'Services', def: ['ops', 'sales', 'tech', 'senior_tech'] },
  { href: '/trip', label: 'Trips', def: ['ops', 'sales', 'accounts', 'tech', 'senior_tech'] },
  { href: '/audits', label: 'Audits', def: ['ops'] },
  { href: '/invoices', label: 'Invoices', def: ['ops', 'accounts'] },
  { href: '/reports', label: 'Reports', def: ['ops', 'accounts'] },
  { href: '/wallet', label: 'Collections / Wallet', def: ['ops', 'accounts', 'tech', 'senior_tech'] },
  { href: '/purchase-orders', label: 'Purchase orders', def: ['ops', 'accounts'] },
  { href: '/vendors', label: 'Vendors', def: ['ops', 'accounts'] },
  { href: '/inventory', label: 'Inventory', def: ['ops'] },
  { href: '/chemicals', label: 'Chemicals', def: ['ops'] },
  { href: '/services', label: 'Service Catalogue', def: ['ops'] },
  { href: '/branches', label: 'Branches', def: ['ops'] },
  { href: '/team', label: 'Team', def: ['ops'] },
  { href: '/training', label: 'Training', def: ['ops', 'sales', 'accounts', 'tech', 'senior_tech'] },
];

const ROLE_LIST: Array<{ id: string; label: string }> = [
  { id: 'ops', label: 'Operations' },
  { id: 'sales', label: 'Sales' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'senior_tech', label: 'Senior Technician' },
  { id: 'tech', label: 'Technician' },
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
    try {
      await api.patch('/org/company', body);
      setCo(body);
      setSaved('Saved ✓');
    } catch {
      // Without this a dead server looked exactly like a successful save.
      setSaved('Could not save — check the connection and try again');
    }
    setTimeout(() => setSaved(''), 4000);
  }

  // One hidden file input serves all three images; this remembers which
  // tile asked for the upload.
  const upKind = useRef<'logo' | 'sign' | 'seal'>('logo');

  /** Downscale to a PNG (240px logo / 200px signature / 280px seal) so a
      phone photo doesn't bloat the database. PNG keeps transparency, so a
      signature scanned on white or cut out clean both print well. */
  function onImage(f: File) {
    const kind = upKind.current;
    const cap = kind === 'sign' ? 200 : kind === 'seal' ? 280 : 240;
    const img = new Image();
    img.onload = () => {
      const h = Math.min(cap, img.height);
      const w = Math.round(img.width * (h / img.height));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
      set(kind, cv.toDataURL('image/png'));
    };
    img.src = URL.createObjectURL(f);
  }
  const pickImage = (kind: 'logo' | 'sign' | 'seal') => {
    upKind.current = kind;
    file.current?.click();
  };

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
          {saved && (
            <span className={'text-[12.5px] font-semibold ' + (saved.startsWith('Saved') ? 'text-navy' : 'text-accent')}>
              {saved}
            </span>
          )}
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
                    <button onClick={() => pickImage('logo')}
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
                    onChange={(e) => { if (e.target.files?.[0]) onImage(e.target.files[0]); e.target.value = ''; }} />
                </div>
              </section>

              <section className="rounded-md border border-line p-5 mb-5">
                <h2 className="text-[14px] font-semibold mb-1">Signature &amp; seal</h2>
                <p className="text-muted text-[12.5px] mb-4">
                  Printed together on the &ldquo;Authorised signatory&rdquo; block of every
                  quotation, invoice, contract and purchase order. A PNG with a
                  transparent background prints cleanest.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([['sign', 'Signature'], ['seal', 'Seal / stamp']] as const).map(([k, label]) => (
                    <div key={k} className="rounded border border-line-soft p-4">
                      <div className="text-[12px] font-semibold text-ink-2 mb-2">{label}</div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="w-[130px] h-[72px] rounded border border-line bg-wash flex items-center justify-center overflow-hidden">
                          {co[k]
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={co[k]} alt={label} className="max-w-full max-h-full object-contain" />
                            : <span className="text-muted-2 text-[11px]">Nothing yet</span>}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => pickImage(k)}
                            className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
                            <Icon name="upload" size={14} /> Upload
                          </button>
                          {co[k] && (
                            <button onClick={() => set(k, '')}
                              className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium text-accent hover:bg-red-wash">
                              <Icon name="x" size={14} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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

          {section === 'roles' && (
            <div className="flex flex-col gap-5">
              <p className="text-[12.5px] text-muted -mb-1">
                Tick what each role may open; untick to hide the page from their
                sidebar AND block the address. The administrator always sees everything.
                Save changes applies it — people see it on their next page load.
              </p>
              {ROLE_LIST.map((r) => {
                const ov = (co.roleAccess || {})[r.id] || {};
                const isOn = (href: string, def: string[]) => ov[href] ?? def.includes(r.id);
                const flip = (href: string, def: string[]) => {
                  const next = { ...(co.roleAccess || {}) };
                  next[r.id] = { ...ov, [href]: !isOn(href, def) };
                  set('roleAccess', next as never);
                };
                return (
                  <section key={r.id} className="rounded-md border border-line p-5">
                    <h2 className="text-[14px] font-semibold mb-1">{r.label}</h2>
                    <p className="text-muted text-[12px] mb-3.5">
                      {PAGES.filter((p) => isOn(p.href, p.def)).length} of {PAGES.length} pages visible
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                      {PAGES.map((p) => (
                        <label key={p.href}
                          className="flex items-center gap-2 text-[12.5px] cursor-pointer select-none">
                          <input type="checkbox" checked={isOn(p.href, p.def)}
                            onChange={() => flip(p.href, p.def)}
                            className="w-4 h-4 accent-[#FF0000]" />
                          <span className={isOn(p.href, p.def) ? '' : 'text-muted line-through'}>
                            {p.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
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
