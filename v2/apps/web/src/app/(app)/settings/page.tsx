'use client';

/* Organisation settings — the company profile and the logo the sidebar wears. */

import { useEffect, useRef, useState } from 'react';
import { api, type Bootstrap, type Company } from '@/lib/api';
import { Icon } from '@/components/icons';

export default function Settings() {
  const [co, setCo] = useState<Company | null>(null);
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
    await api.patch('/org/company', co);
    setSaved('Saved — reload to see the sidebar update');
    setTimeout(() => setSaved(''), 4000);
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

  const Field = ({ label, k, wide }: { label: string; k: keyof Company; wide?: boolean }) => (
    <label className={'block ' + (wide ? 'col-span-2' : '')}>
      <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">{label}</span>
      <input value={String(co[k] ?? '')} onChange={(e) => set(k, e.target.value as never)}
        className="w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
    </label>
  );

  return (
    <div className="p-6 max-w-[760px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">Organisation</h1>
          <p className="text-muted text-[13px] mt-0.5">
            The profile printed on every quotation and invoice.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[12.5px] text-muted">{saved}</span>}
          <button onClick={save}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            Save changes
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------- logo */}
      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[14px] font-semibold mb-1">Company logo</h2>
        <p className="text-muted text-[12.5px] mb-4">
          Shown at the top of the sidebar and on printed documents.
        </p>
        <div className="flex items-center gap-5">
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

      {/* -------------------------------------------------------- profile */}
      <section className="rounded-md border border-line p-5 mb-5">
        <h2 className="text-[14px] font-semibold mb-4">Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company name" k="name" />
          <Field label="Phone" k="phone" />
          <Field label="Email" k="email" />
          <Field label="GSTIN" k="gstin" />
          <Field label="Home state (decides CGST/SGST vs IGST)" k="state" />
          <Field label="Address" k="addr" wide />
          <Field label="City" k="city" />
          <Field label="PIN" k="pin" />
        </div>
      </section>

      {/* ---------------------------------------------------------- terms */}
      <section className="rounded-md border border-line p-5">
        <h2 className="text-[14px] font-semibold mb-1">Quotation terms</h2>
        <p className="text-muted text-[12.5px] mb-4">
          Printed at the foot of every quotation and contract. One line per term.
        </p>
        {(co.terms || []).map((t, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <span className="w-6 h-9 flex items-center justify-center text-[12px] text-muted-2 shrink-0">
              {i + 1}.
            </span>
            <input value={t}
              onChange={(e) => set('terms', co.terms.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1 h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
            <button onClick={() => set('terms', co.terms.filter((_, j) => j !== i))}
              title="Remove"
              className="w-9 h-9 rounded border border-line text-muted hover:text-accent hover:bg-red-wash flex items-center justify-center shrink-0">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => set('terms', [...(co.terms || []), ''])}
          className="mt-1 flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
          <Icon name="plus" size={13} /> Add a term
        </button>
      </section>

      {/* --------------------------------------------------- integrations */}
      <Integrations />
    </div>
  );
}

/* ============================================================ integrations */

/**
 * Third-party keys — Ola Maps powers the live trip map and in-app navigation;
 * Razorpay powers every UPI QR — the technician collecting on site and the
 * office recording a payment against an invoice. Keys are stored
 * server-side and never echoed back.
 */
function Integrations() {
  const [flags, setFlags] = useState<{ ola: boolean; razorpay: boolean } | null>(null);
  const [olaKey, setOlaKey] = useState('');
  const [rzpKeyId, setRzpKeyId] = useState('');
  const [rzpKeySecret, setRzpKeySecret] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.get<{ ola: boolean; razorpay: boolean }>('/org/integrations')
    .then(setFlags).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save() {
    setMsg('');
    try {
      const r = await api.patch<{ ola: boolean; razorpay: boolean }>('/org/integrations', {
        olaKey: olaKey.trim(), rzpKeyId: rzpKeyId.trim(), rzpKeySecret: rzpKeySecret.trim(),
      });
      setFlags(r);
      setOlaKey(''); setRzpKeyId(''); setRzpKeySecret('');
      setMsg('Saved. ' + (r.razorpay ? 'UPI QR is live for technicians. ' : '') +
        (r.ola ? 'Ola Maps is connected.' : ''));
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save'); }
  }

  const input = 'w-full h-9 px-3 rounded border border-line text-[13.5px] font-mono outline-none focus:border-navy';
  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
  const badge = (on: boolean) => on
    ? <span className="zpill navy">connected</span>
    : <span className="zpill outline">not connected</span>;

  return (
    <section className="rounded-md border border-line p-5 mt-5">
      <h2 className="text-[14px] font-semibold mb-1">Integrations</h2>
      <p className="text-muted text-[12.5px] mb-4">
        Paste the keys and the features switch on by themselves. Stored keys are never shown again —
        pasting a new one replaces it.
      </p>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold">Ola Maps</span>
          {flags && badge(flags.ola)}
          <span className="text-[11.5px] text-muted">— live trip map & in-app navigation</span>
        </div>
        <label className="block">
          <span className={label}>API key</span>
          <input value={olaKey} onChange={(e) => setOlaKey(e.target.value)}
            placeholder={flags?.ola ? '•••••••• (stored)' : 'Ola Maps API key'} className={input} />
        </label>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold">Razorpay</span>
          {flags && badge(flags.razorpay)}
          <span className="text-[11.5px] text-muted">— UPI QR collections on site</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Key ID</span>
            <input value={rzpKeyId} onChange={(e) => setRzpKeyId(e.target.value)}
              placeholder={flags?.razorpay ? '•••••••• (stored)' : 'rzp_live_…'} className={input} />
          </label>
          <label className="block">
            <span className={label}>Key secret</span>
            <input type="password" value={rzpKeySecret} onChange={(e) => setRzpKeySecret(e.target.value)}
              placeholder={flags?.razorpay ? '•••••••• (stored)' : 'secret'} className={input} />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save}
          className="h-9 px-4 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110">
          Save keys
        </button>
        {msg && <span className="text-[12.5px] text-muted">{msg}</span>}
      </div>
    </section>
  );
}
