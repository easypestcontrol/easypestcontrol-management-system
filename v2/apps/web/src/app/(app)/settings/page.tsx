'use client';

import { docTermsFor } from 'shared';

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
import { useRouter } from 'next/navigation';
import { api, type Bootstrap, type Company, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar } from '@/components/mobile';

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
  { href: '/expenses', label: 'Expenses', def: ['ops', 'sales', 'accounts', 'tech', 'senior_tech'] },
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
  const router = useRouter();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [co, setCo] = useState<Company | null>(null);
  const [section, setSection] = useState<SectionId>('org');
  const [saved, setSaved] = useState('');
  const file = useRef<HTMLInputElement>(null);

  /* Settings is the office's own — the organisation's identity, its seal, and
     who may open which page. Only the administrator and operations reach it;
     anyone else who types the address is sent home. (The API already refuses
     their saves — this closes the door on merely seeing it.) */
  const denied = !!me && me.role !== 'admin' && me.role !== 'ops';
  useEffect(() => {
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, []);
  useEffect(() => {
    if (denied) router.replace('/dashboard');
  }, [denied, router]);

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

  if (denied) return null; // the effect is sending them to the dashboard
  if (!me || !co) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  // A plain function, NOT a nested component: a component declared inside the
  // render is a new type every render, so React remounts the input and the
  // cursor falls out after every keystroke.
  const field = (label: string, k: keyof Company, wide?: boolean) => (
    <label key={k} className={'block ' + (wide ? 'sm:col-span-2' : '')}>
      <span className="block text-xs font-semibold text-ink-2 mb-1">{label}</span>
      <input value={String(co[k] ?? '')} onChange={(e) => set(k, e.target.value as never)}
        className="w-full h-[38px] px-3 rounded-lg border border-line text-sm outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]" />
    </label>
  );

  const dt = co.docTerms || {};
  // Which list applies is decided in one place now, shared with the API and
  // with every printed document — this screen had its own copy of the rule
  // and the contracts controller had a third that disagreed with both.
  const listOf = (key: (typeof DOCS)[number]['key']): string[] => docTermsFor(co, key);
  const setList = (key: string, rows: string[]) =>
    set('docTerms', { ...dt, [key]: rows } as never);

  const sectionCls = 'rounded-xl border border-[#cfd4de] bg-white p-4 lg:p-5 shadow-[0_1px_3px_rgba(20,20,20,0.06)]';
  const btnSm = 'inline-flex items-center gap-1 h-[30px] px-2.5 rounded-md border border-line bg-white text-xs font-semibold hover:bg-wash';
  const termsCount = DOCS.reduce((a, d) => a + listOf(d.key).filter((t) => t.trim()).length, 0);

  return (
    <div className="lg:p-6 max-w-[980px] max-lg:bg-ground max-lg:min-h-full max-lg:pb-[calc(env(safe-area-inset-bottom)+168px)]">
      {/* ---------------------------------------------------- phone header */}
      <BackBar title="Settings" sub={SECTIONS.find((s) => s.id === section)?.sub} fallback="/dashboard" />
      <div className="lg:hidden sticky top-[54px] z-10 bg-white border-b border-line px-4 py-2">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-ground">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={'h-[32px] rounded-lg text-sm font-semibold truncate px-1 '
                + (section === s.id ? 'bg-white text-ink shadow-[0_1px_2px_rgba(20,20,20,0.12)]' : 'text-muted')}>
              {s.id === 'org' ? 'Organisation' : s.id === 'terms' ? 'Terms' : 'User roles'}
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------- desk header */}
      <div className="max-lg:hidden mb-5 flex items-center justify-between">
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
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold whitespace-nowrap hover:brightness-90">
            Save changes
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 max-lg:px-4 max-lg:pt-3">
        {/* ------------------------------------------------ section list (desk) */}
        <nav className="max-lg:hidden lg:w-[230px] shrink-0 flex flex-col gap-1.5">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={'text-left rounded-md px-3.5 py-2.5 shrink-0 border transition-colors '
                + (section === s.id ? 'border-navy bg-wash' : 'border-transparent hover:bg-wash')}>
              <span className={'block text-[13px] font-semibold ' + (section === s.id ? 'text-navy' : '')}>{s.label}</span>
              <span className="block text-[11px] text-muted">{s.sub}</span>
            </button>
          ))}
          <Link href="/credentials" className="text-left rounded-md px-3.5 py-2.5 shrink-0 border border-transparent hover:bg-wash">
            <span className="block text-[13px] font-semibold">API keys &amp; credentials ↗</span>
            <span className="block text-[11px] text-muted">Ola Maps, Razorpay, VPS — stored encrypted</span>
          </Link>
        </nav>

        {/* --------------------------------------------------- the section */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 lg:gap-5">
          <input ref={file} type="file" accept="image/*" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) onImage(e.target.files[0]); e.target.value = ''; }} />

          {section === 'org' && (
            <>
              {/* Branding: the three images that print on every document */}
              <section className={sectionCls}>
                <h2 className="text-base font-bold">Branding</h2>
                <p className="text-sm text-muted mt-0.5 mb-3">
                  Printed on every quotation, invoice, contract, purchase order and service report - the only signature and seal on them. A PNG with a transparent background prints cleanest.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {([['logo', 'Company logo', 'Top of documents & sidebar'], ['sign', 'Signature', 'Authorised signatory'], ['seal', 'Seal / stamp', 'Beside the signature']] as const).map(([k, label, hint]) => (
                    <div key={k} className="rounded-lg border border-line-soft bg-[#fafbfc] p-3 flex sm:flex-col items-center sm:items-stretch gap-3">
                      <span className="w-[96px] sm:w-full h-[64px] rounded-md border border-line bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {co[k]
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={co[k]} alt={label} className="max-w-full max-h-full object-contain p-1" />
                          : <span className="text-muted-2 text-xs">Nothing yet</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted truncate">{hint}</p>
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => pickImage(k)} className={btnSm}>
                            <Icon name="upload" size={12} /> {co[k] ? 'Replace' : 'Upload'}
                          </button>
                          {co[k] && (
                            <button onClick={() => set(k, '')} className={btnSm + ' text-accent'}>
                              <Icon name="x" size={12} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* The company, in three groups */}
              <section className={sectionCls}>
                <h2 className="text-base font-bold">Company details</h2>
                <p className="text-sm text-muted mt-0.5 mb-3">What prints at the top of every document.</p>
                {([
                  ['Identity', [['Company name', 'name', true], ['GSTIN', 'gstin'], ['Home state (CGST/SGST vs IGST)', 'state']]],
                  ['Contact', [['Phone', 'phone'], ['Email', 'email']]],
                  ['Address', [['Address', 'addr', true], ['City', 'city'], ['PIN', 'pin']]],
                ] as Array<[string, Array<[string, keyof Company, boolean?]>]>).map(([group, fields], gi) => (
                  <div key={group} className={gi ? 'mt-4 pt-4 border-t border-line-soft' : ''}>
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-2 mb-2">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {fields.map(([label, k, wide]) => field(label, k, wide))}
                    </div>
                  </div>
                ))}
              </section>

              <Link href="/credentials" className={sectionCls + ' lg:hidden flex items-center gap-3 active:bg-wash'}>
                <span className="w-9 h-9 rounded-lg bg-wash flex items-center justify-center shrink-0"><Icon name="lock" size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">API keys &amp; credentials</span>
                  <span className="block text-xs text-muted truncate">Ola Maps, Razorpay, VPS — stored encrypted</span>
                </span>
                <Icon name="chevRight" size={14} className="text-muted-2" />
              </Link>
            </>
          )}

          {section === 'roles' && (
            <>
              <p className="text-sm text-muted px-1">
                Tick what each role may open; untick to hide the page from their menu and block its address.
                The administrator always sees everything. Save to apply.
              </p>
              {ROLE_LIST.map((r, ri) => {
                const ov = (co.roleAccess || {})[r.id] || {};
                const isOn = (href: string, def: string[]) => ov[href] ?? def.includes(r.id);
                const flip = (href: string, def: string[]) => {
                  const next = { ...(co.roleAccess || {}) };
                  next[r.id] = { ...ov, [href]: !isOn(href, def) };
                  set('roleAccess', next as never);
                };
                const on = PAGES.filter((p) => isOn(p.href, p.def)).length;
                return (
                  <details key={r.id} open={ri === 0} className={sectionCls + ' group'}>
                    <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="w-9 h-9 rounded-lg bg-sky text-sky-ink flex items-center justify-center shrink-0"><Icon name="team" size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-bold">{r.label}</span>
                        <span className="block text-xs text-muted">{on} of {PAGES.length} pages visible</span>
                      </span>
                      <Icon name="chevRight" size={14} className="text-muted-2 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-3">
                      {PAGES.map((p) => {
                        const v = isOn(p.href, p.def);
                        return (
                          <button key={p.href} type="button" onClick={() => flip(p.href, p.def)}
                            className={'h-[34px] px-2.5 rounded-lg border text-sm text-left flex items-center gap-2 '
                              + (v ? 'border-mint-ink/30 bg-mint text-mint-ink font-semibold' : 'border-line bg-white text-muted')}>
                            <span className={'w-4 h-4 rounded flex items-center justify-center shrink-0 '
                              + (v ? 'bg-mint-ink text-white' : 'border border-line-strong')}>
                              {v && <Icon name="check" size={11} />}
                            </span>
                            <span className="truncate">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </>
          )}

          {section === 'terms' && (
            <>
              <p className="text-sm text-muted px-1">
                {termsCount} terms across {DOCS.length} documents. Each document prints its own list — one line per term.
              </p>
              {DOCS.map((d, di) => {
                const rows = listOf(d.key);
                return (
                  <details key={d.key} open={di === 0} className={sectionCls + ' group'}>
                    <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="w-9 h-9 rounded-lg bg-rose text-rose-ink flex items-center justify-center shrink-0"><Icon name="file" size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-bold">{d.label} terms</span>
                        <span className="block text-xs text-muted truncate">{rows.length} {rows.length === 1 ? 'term' : 'terms'} · {d.sub}</span>
                      </span>
                      <Icon name="chevRight" size={14} className="text-muted-2 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="mt-3 flex flex-col gap-2">
                      {rows.map((t, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <span className="w-6 text-center text-xs font-semibold text-muted-2 shrink-0">{i + 1}.</span>
                          <input value={t}
                            onChange={(e) => setList(d.key, rows.map((x, j) => (j === i ? e.target.value : x)))}
                            className="flex-1 min-w-0 h-[38px] px-3 rounded-lg border border-line text-sm outline-none bg-wash focus:border-accent focus:bg-white" />
                          <button onClick={() => setList(d.key, rows.filter((_, j) => j !== i))} title="Remove"
                            className="w-[34px] h-[34px] rounded-md border border-line text-muted hover:text-accent hover:bg-red-wash flex items-center justify-center shrink-0">
                            <Icon name="x" size={13} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setList(d.key, [...rows, ''])} className={btnSm + ' self-start mt-1'}>
                        <Icon name="plus" size={12} /> Add a term
                      </button>
                    </div>
                  </details>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ phone save bar */}
      <div className="lg:hidden fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+68px+var(--trip-gap,0px))] z-20
        rounded-xl bg-white border border-[#cfd4de] shadow-[0_6px_20px_rgba(20,20,20,0.12)] px-3 py-2 flex items-center gap-3">
        <span className={'flex-1 min-w-0 text-sm truncate ' + (saved ? (saved.startsWith('Saved') ? 'text-navy font-semibold' : 'text-accent font-semibold') : 'text-muted')}>
          {saved || 'Changes are kept until you save'}
        </span>
        <button onClick={save} className="h-[36px] px-4 rounded-lg bg-accent text-white text-sm font-bold shrink-0">
          Save changes
        </button>
      </div>
    </div>
  );
}
