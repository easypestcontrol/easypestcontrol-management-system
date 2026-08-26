'use client';

/* ============================================================================
   The customer form — the full v1 record, six tabs, creating and editing.

   Tax & terms is the tab that earns its keep: GST treatment, place of supply
   and PAN are what make the CGST/SGST-vs-IGST split automatic on every
   quotation and invoice raised for this customer.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import {
  SALUTATIONS, LANGUAGES, CURRENCIES, GST_TREATMENTS, PAYMENT_TERMS,
  STATES, COUNTRIES, type AddressBlock, type ContactPerson, type ClientDoc,
} from 'shared';
import { api, type Client } from '@/lib/api';
import { Icon } from '@/components/icons';

const MAX_DOC_KB = 1500;

const BLANK_ADDR: AddressBlock = {
  attention: '', country: 'India', street1: '', street2: '',
  city: 'Chennai', state: 'Tamil Nadu', pin: '', phone: '',
};

const BLANK = {
  name: '', type: 'Residential', contact: '', phone: '', email: '',
  addr: '', city: 'Chennai', pin: '', gstin: '', area: '', branch: '',
  custKind: 'Business', salutation: '', firstName: '', lastName: '',
  company: '', language: 'English', workPhone: '',
  channels: ['Email', 'WhatsApp'] as string[],
  gstTreatment: '', placeOfSupply: 'Tamil Nadu', pan: '', taxPref: 'Taxable',
  currency: 'INR - Indian Rupee', openingBalance: 0,
  payTerms: 'Due on Receipt', propertySize: '', portal: false,
  billing: { ...BLANK_ADDR } as AddressBlock,
  shipping: { ...BLANK_ADDR } as AddressBlock,
  contacts: [] as ContactPerson[],
  docs: [] as ClientDoc[],
  remarks: '',
};
type F = typeof BLANK;

const TABS = ['Overview', 'Tax & terms', 'Addresses', 'Contacts', 'Documents', 'Remarks'] as const;

/* ------------------------------------------------------------ small pieces */

function L({ children }: { children: React.ReactNode }) {
  return <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">{children}</span>;
}
const INPUT = 'w-full h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy';
const SELECT = INPUT + ' bg-white';

export default function CustomerForm({ initial, onDone, onClose }: {
  initial?: Client | null;
  onDone: (c: Client) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<F>(() => ({
    ...BLANK,
    ...(initial || {}),
    channels: (initial as F | null)?.channels || BLANK.channels,
    billing: { ...BLANK_ADDR, ...((initial as F | null)?.billing || {}) },
    shipping: { ...BLANK_ADDR, ...((initial as F | null)?.shipping || {}) },
    contacts: (initial as F | null)?.contacts || [],
    docs: (initial as F | null)?.docs || [],
  }));
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nameTouched = useRef(!!initial);
  const fileIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>('/branches').then(setBranches).catch(() => {});
  }, []);

  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const setAddr = (which: 'billing' | 'shipping', k: keyof AddressBlock, v: string) =>
    setF((x) => ({ ...x, [which]: { ...x[which], [k]: v } }));

  // The display name suggests itself from the company or the person,
  // until the user has typed one of their own (v1 behaviour).
  useEffect(() => {
    if (nameTouched.current) return;
    const person = [f.firstName, f.lastName].filter(Boolean).join(' ');
    const suggestion = f.custKind === 'Business' ? (f.company || person) : (person || f.company);
    if (suggestion) setF((x) => ({ ...x, name: suggestion }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.firstName, f.lastName, f.company, f.custKind]);

  function toggleChannel(c: string) {
    set('channels', f.channels.includes(c)
      ? f.channels.filter((x) => x !== c) : [...f.channels, c]);
  }

  function addDocs(files: FileList) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOC_KB * 1024) {
        setErr(`${file.name} is over ${MAX_DOC_KB / 1000} MB — attach a smaller copy.`);
        continue;
      }
      const rd = new FileReader();
      rd.onload = () => setF((x) => ({
        ...x,
        docs: [...x.docs, { name: file.name, size: file.size, type: file.type, data: String(rd.result) }],
      }));
      rd.readAsDataURL(file);
    }
  }

  async function save() {
    if (!f.name.trim()) { setErr('The customer needs a display name.'); setTab('Overview'); return; }
    setErr(''); setBusy(true);

    // The flat summary every screen reads, derived from the detailed blocks:
    // the site address is where the technician goes; blank falls back to billing.
    const site = f.shipping.street1 ? f.shipping : f.billing;
    const payload = {
      ...f,
      contact: f.contact ||
        [f.salutation, f.firstName, f.lastName].filter(Boolean).join(' ').trim() || f.company,
      addr: [site.street1, site.street2].filter(Boolean).join(', ') || f.addr,
      city: site.city || f.city,
      pin: site.pin || f.pin,
    };

    try {
      const c = initial
        ? await api.patch<Client>('/clients/' + initial.id, payload)
        : await api.post<Client>('/clients', payload);
      onDone(c);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------ the tabs */

  const overview = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block col-span-2">
        <L>Customer type</L>
        <span className="flex gap-5 h-9 items-center">
          {['Business', 'Individual'].map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
              <input type="radio" checked={f.custKind === k} onChange={() => set('custKind', k)}
                className="accent-[#FF0000]" />
              {k}
            </label>
          ))}
        </span>
      </label>

      <div className="col-span-2 grid grid-cols-[110px_1fr_1fr] gap-3">
        <label className="block"><L>Salutation</L>
          <select value={f.salutation} onChange={(e) => set('salutation', e.target.value)} className={SELECT}>
            {SALUTATIONS.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
          </select>
        </label>
        <label className="block"><L>First name</L>
          <input value={f.firstName} onChange={(e) => set('firstName', e.target.value)}
            placeholder="Primary contact" className={INPUT} />
        </label>
        <label className="block"><L>Last name</L>
          <input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} className={INPUT} />
        </label>
      </div>

      <label className="block"><L>Company name</L>
        <input value={f.company} onChange={(e) => set('company', e.target.value)} className={INPUT} />
      </label>
      <label className="block"><L>Display name <span className="text-accent">*</span></L>
        <input value={f.name}
          onChange={(e) => { nameTouched.current = true; set('name', e.target.value); }}
          placeholder="What every screen and document shows" className={INPUT} />
      </label>

      <label className="block"><L>Email address</L>
        <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)}
          placeholder="name@company.in" className={INPUT} />
      </label>
      <label className="block"><L>Customer language</L>
        <select value={f.language} onChange={(e) => set('language', e.target.value)} className={SELECT}>
          {LANGUAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>

      <label className="block"><L>Work phone</L>
        <input value={f.workPhone} onChange={(e) => set('workPhone', e.target.value)}
          placeholder="+91 …" className={INPUT} />
      </label>
      <label className="block"><L>Mobile</L>
        <input value={f.phone} onChange={(e) => set('phone', e.target.value)}
          placeholder="+91 …" className={INPUT} />
        <span className="block text-[11px] text-muted-2 mt-1">Used for WhatsApp and the visit reminders.</span>
      </label>

      <label className="block"><L>Property type</L>
        <select value={f.type} onChange={(e) => set('type', e.target.value)} className={SELECT}>
          {['Residential', 'Commercial', 'Industrial'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="block"><L>Communication channels</L>
        <span className="flex gap-4 h-9 items-center">
          {['Email', 'SMS', 'WhatsApp'].map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={f.channels.includes(c)} onChange={() => toggleChannel(c)}
                className="accent-[#FF0000]" />
              {c}
            </label>
          ))}
        </span>
      </label>
    </div>
  );

  const tax = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block"><L>GST treatment</L>
        <select value={f.gstTreatment} onChange={(e) => set('gstTreatment', e.target.value)} className={SELECT}>
          <option value="">— select —</option>
          {GST_TREATMENTS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="block"><L>Place of supply</L>
        <select value={f.placeOfSupply} onChange={(e) => set('placeOfSupply', e.target.value)} className={SELECT}>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="block text-[11px] text-muted-2 mt-1">
          Decides the split on every document: home state = CGST + SGST, any other = IGST.
        </span>
      </label>

      <label className="block"><L>GSTIN</L>
        <input value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())}
          maxLength={15} placeholder="33AABCS1429B1ZP" className={INPUT + ' font-mono'} />
      </label>
      <label className="block"><L>PAN</L>
        <input value={f.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())}
          maxLength={10} placeholder="AABCS1429B" className={INPUT + ' font-mono'} />
      </label>

      <label className="block"><L>Tax preference</L>
        <span className="flex gap-5 h-9 items-center">
          {['Taxable', 'Tax Exempt'].map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
              <input type="radio" checked={f.taxPref === k} onChange={() => set('taxPref', k)}
                className="accent-[#FF0000]" />
              {k}
            </label>
          ))}
        </span>
      </label>
      <label className="block"><L>Currency</L>
        <select value={f.currency} onChange={(e) => set('currency', e.target.value)} className={SELECT}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>

      <label className="block"><L>Opening balance (₹)</L>
        <input type="number" step={100} value={f.openingBalance}
          onChange={(e) => set('openingBalance', Number(e.target.value) || 0)} className={INPUT} />
        <span className="block text-[11px] text-muted-2 mt-1">What they already owed when they came on the books.</span>
      </label>
      <label className="block"><L>Payment terms</L>
        <select value={f.payTerms} onChange={(e) => set('payTerms', e.target.value)} className={SELECT}>
          {PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>

      <label className="block"><L>Branch</L>
        <select value={f.branch} onChange={(e) => set('branch', e.target.value)} className={SELECT}>
          <option value="">— by area —</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="block"><L>Area / locality</L>
        <input value={f.area} onChange={(e) => set('area', e.target.value)}
          placeholder="Adyar, Velachery…" className={INPUT} />
      </label>

      <label className="block"><L>Property size</L>
        <input value={f.propertySize} onChange={(e) => set('propertySize', e.target.value)}
          placeholder="e.g. 3 BHK / 1,450 sq.ft" className={INPUT} />
      </label>
      <label className="block"><L>Customer portal</L>
        <span className="flex h-9 items-center">
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
            <input type="checkbox" checked={f.portal} onChange={(e) => set('portal', e.target.checked)}
              className="accent-[#FF0000]" />
            Allow portal access — contracts, visit history and invoices
          </label>
        </span>
      </label>
    </div>
  );

  const addrBlock = (which: 'billing' | 'shipping', title: string) => {
    const a = f[which];
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</p>
          {which === 'shipping' && (
            <button type="button" onClick={() => set('shipping', { ...f.billing })}
              className="text-[12px] font-medium text-navy hover:text-accent underline underline-offset-2">
              Copy billing
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2"><L>Attention</L>
            <input value={a.attention || ''} onChange={(e) => setAddr(which, 'attention', e.target.value)} className={INPUT} />
          </label>
          <label className="block col-span-2"><L>Country / region</L>
            <select value={a.country || 'India'} onChange={(e) => setAddr(which, 'country', e.target.value)} className={SELECT}>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block col-span-2"><L>Address</L>
            <input value={a.street1 || ''} onChange={(e) => setAddr(which, 'street1', e.target.value)}
              placeholder="Street 1" className={INPUT} />
            <input value={a.street2 || ''} onChange={(e) => setAddr(which, 'street2', e.target.value)}
              placeholder="Street 2" className={INPUT + ' mt-2'} />
          </label>
          <label className="block"><L>City</L>
            <input value={a.city || ''} onChange={(e) => setAddr(which, 'city', e.target.value)} className={INPUT} />
          </label>
          <label className="block"><L>State</L>
            <select value={a.state || 'Tamil Nadu'} onChange={(e) => setAddr(which, 'state', e.target.value)} className={SELECT}>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block"><L>PIN code</L>
            <input value={a.pin || ''} onChange={(e) => setAddr(which, 'pin', e.target.value)}
              maxLength={6} inputMode="numeric" className={INPUT} />
          </label>
          <label className="block"><L>Phone</L>
            <input value={a.phone || ''} onChange={(e) => setAddr(which, 'phone', e.target.value)}
              placeholder="+91 …" className={INPUT} />
          </label>
        </div>
      </div>
    );
  };

  const contacts = (
    <div>
      {f.contacts.length === 0 && (
        <p className="text-[13px] text-muted mb-3">
          Everyone else at the site worth calling — the security desk, the facility manager,
          the accounts contact.
        </p>
      )}
      {f.contacts.map((p, i) => (
        <div key={i} className="rounded border border-line p-3 mb-3">
          <div className="flex justify-between mb-2">
            <span className="text-[12px] font-semibold text-muted">Person {i + 1}</span>
            <button type="button"
              onClick={() => set('contacts', f.contacts.filter((_, j) => j !== i))}
              className="text-[12px] text-accent hover:underline">Remove</button>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {([
              ['salutation', 'Salutation'], ['firstName', 'First name'], ['lastName', 'Last name'],
              ['email', 'Email'], ['workPhone', 'Work phone'], ['mobile', 'Mobile'],
            ] as Array<[keyof ContactPerson, string]>).map(([k, label]) => (
              k === 'salutation' ? (
                <label key={k} className="block"><L>{label}</L>
                  <select value={p[k] || ''} className={SELECT}
                    onChange={(e) => set('contacts', f.contacts.map((x, j) =>
                      j === i ? { ...x, [k]: e.target.value } : x))}>
                    {SALUTATIONS.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                  </select>
                </label>
              ) : (
                <label key={k} className="block"><L>{label}</L>
                  <input value={p[k] || ''} className={INPUT}
                    onChange={(e) => set('contacts', f.contacts.map((x, j) =>
                      j === i ? { ...x, [k]: e.target.value } : x))} />
                </label>
              )
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => set('contacts', [...f.contacts, {}])}
        className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
        <Icon name="plus" size={13} /> Add contact person
      </button>
    </div>
  );

  const documents = (
    <div>
      {f.docs.length === 0 && (
        <p className="text-[13px] text-muted mb-3">
          Agreements, site plans, purchase orders, ID proofs — up to {MAX_DOC_KB / 1000} MB each.
        </p>
      )}
      {f.docs.map((d, i) => (
        <div key={i} className="flex items-center gap-3 rounded border border-line px-3 py-2.5 mb-2">
          <Icon name="quote" size={16} className="text-muted shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium truncate">{d.name}</span>
            <span className="block text-[11px] text-muted-2">{Math.round(d.size / 1024)} KB</span>
          </span>
          <a href={d.data} download={d.name}
            className="text-[12px] font-medium text-navy hover:underline shrink-0">Open</a>
          <button type="button" onClick={() => set('docs', f.docs.filter((_, j) => j !== i))}
            className="text-[12px] text-accent hover:underline shrink-0">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => fileIn.current?.click()}
        className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
        <Icon name="upload" size={13} /> Upload file
      </button>
      <input ref={fileIn} type="file" hidden multiple accept="application/pdf,image/*"
        onChange={(e) => { if (e.target.files) addDocs(e.target.files); e.target.value = ''; }} />
    </div>
  );

  const remarks = (
    <label className="block"><L>Remarks</L>
      <textarea value={f.remarks} onChange={(e) => set('remarks', e.target.value)} rows={6}
        placeholder="Anything the team should know before they call or visit."
        className="w-full px-3 py-2 rounded border border-line text-[13px] outline-none focus:border-navy resize-none" />
      <span className="block text-[11px] text-muted-2 mt-1">Internal only — the customer never sees this.</span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-navy/30 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[760px] bg-white rounded-md shadow-pop max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-[52px] border-b border-line shrink-0">
          <h2 className="text-[15px] font-semibold">
            {initial ? 'Edit ' + initial.name : 'New customer'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex gap-0.5 px-5 pt-3 border-b border-line shrink-0">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={'px-3 h-9 text-[13px] font-medium rounded-t border-b-2 -mb-px transition-colors ' +
                (tab === t
                  ? 'border-accent text-navy font-semibold'
                  : 'border-transparent text-muted hover:text-ink')}>
              {t}
              {t === 'Contacts' && f.contacts.length > 0 && <span className="ml-1 text-muted-2">({f.contacts.length})</span>}
              {t === 'Documents' && f.docs.length > 0 && <span className="ml-1 text-muted-2">({f.docs.length})</span>}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === 'Overview' && overview}
          {tab === 'Tax & terms' && tax}
          {tab === 'Addresses' && (
            <div className="grid grid-cols-2 gap-6">
              {addrBlock('billing', 'Billing address')}
              {addrBlock('shipping', 'Site / service address')}
              <p className="col-span-2 text-[11.5px] text-muted-2 -mt-2">
                The site address is where the technician goes. Leave it blank and billing is used.
              </p>
            </div>
          )}
          {tab === 'Contacts' && contacts}
          {tab === 'Documents' && documents}
          {tab === 'Remarks' && remarks}
        </div>

        {err && <p className="px-5 pb-1 text-accent text-[13px] shrink-0">{err}</p>}

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line-soft shrink-0">
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={save} disabled={busy}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
