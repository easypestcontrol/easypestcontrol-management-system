'use client';

/* ============================================================================
   The parts a service is recorded with.

   Both the desk and the phone record the same service, and they have to
   record it the same way — the same photo shrink, the same signature pad,
   the same rule about what a technician is carrying. They used to live
   inside the job page, which meant the phone could only have them by having
   a second copy, and a second copy of a rule is a rule that drifts.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getPosition } from '@/lib/geo';
import { Icon } from '@/components/icons';
import SignFull from '@/components/sign-full';
import type { AreaFinding, ExecRecord, JobDetail } from '../format';
import { selectCls } from '../ui';

export function blankExec(): ExecRecord {
  return {
    checkinAt: null, startedAt: null, finishedAt: null, durationMins: 0, geo: '',
    photosBefore: [], photosAfter: [], chemicals: [], findings: [], areaFindings: [],
    observations: '', techNotes: '', uniformPhotos: {},
    reportSentAt: '', reportSentTo: '', reportBy: '',
    signedBy: '', signature: false, signatureImage: '', rating: 0, feedback: '',
  };
}


/** Resize a camera photo to <=520px JPEG q0.72 — v1 jobs.js:17-32. */
export function shrinkImage(file: File, max = 520): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        try { resolve(cv.toDataURL('image/jpeg', 0.72)); } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}


/** Browser GPS with a 2.5s race — v1 jobs.js:539-552. Server fills a fallback. */
export function geoStamp(): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(undefined); } }, 4000);
    getPosition().then((pos) => {
      if (settled) return; settled = true; clearTimeout(t);
      resolve(pos.coords.latitude.toFixed(4) + '° N, ' + pos.coords.longitude.toFixed(4) + '° E');
    }).catch(() => {
      if (settled) return; settled = true; clearTimeout(t); resolve(undefined);
    });
  });
}

/* ------------------------------------------------------------------- page */

export function PhotoBlock({ list, kind, busy, onAdd, onRemove, onZoom, gallery }: {
  list: string[]; kind: string; busy: boolean;
  /** One photo; awaited, so a batch from the gallery goes up one after another. */
  onAdd: (f: File) => unknown; onRemove: (i: number) => void; onZoom: (src: string) => void;
  /** Also offer the gallery. Site photos may have been taken minutes ago on
      another app; the uniform photo may not, and never passes this. */
  gallery?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  // Several photos picked at once from the gallery: "2 of 5" while they go up.
  const [upl, setUpl] = useState<{ done: number; of: number } | null>(null);
  async function addMany(files: File[]) {
    if (!files.length) return;
    setUpl({ done: 0, of: files.length });
    for (let k = 0; k < files.length; k++) {
      try { await onAdd(files[k]); } catch { /* the next one still goes */ }
      setUpl({ done: k + 1, of: files.length });
    }
    setUpl(null);
  }
  return (
    <>
    <div className="grid grid-cols-3 gap-2">
      {list.map((p, i) => (
        <span key={i} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt="" onClick={() => onZoom(p)}
            className="h-20 w-full object-cover rounded border border-line cursor-zoom-in" />
          <button onClick={() => onRemove(i)} disabled={busy} aria-label="Remove photo"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center hover:bg-accent">
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <button onClick={() => fileRef.current?.click()} disabled={busy || !!upl}
        className="h-20 rounded border border-dashed border-line flex flex-col items-center justify-center gap-1 text-muted hover:bg-wash hover:text-ink disabled:opacity-60">
        <Icon name="plus" size={16} />
        <span className="text-[11px] font-semibold">Camera</span>
      </button>
      {gallery && (
        <button onClick={() => pickRef.current?.click()} disabled={busy || !!upl}
          className="h-20 rounded border border-dashed border-line flex flex-col items-center justify-center gap-1 text-muted hover:bg-wash hover:text-ink disabled:opacity-60">
          <Icon name="upload" size={16} />
          <span className="text-[11px] font-semibold">{upl ? 'Uploading…' : 'Gallery'}</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-kind={kind}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = '';
        }} />
      {/* multiple: pick as many photos as were taken, in one go */}
      <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" data-kind={kind}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void addMany(files);
        }} />
    </div>
    {upl && (
      <p className="text-[12px] font-semibold text-muted mt-2" data-photo-progress>
        Uploading {Math.min(upl.done + 1, upl.of)} of {upl.of} photos…
      </p>
    )}
    </>
  );
}

export function ChemBlock({ j, busy, onAdd, onRemove, onErr, pendingRef }: {
  j: JobDetail; busy: boolean;
  onAdd: (itemId: string, qty: number) => void; onRemove: (i: number) => void;
  onErr: (msg: string) => void;
  /** What is filled in but not added yet. The runner adds it on Next, so a
      chemical picked and measured is never lost for want of one more tap. */
  pendingRef?: React.MutableRefObject<{ itemId: string; qty: number } | null>;
}) {
  const inv = new Map(j.inventory.map((i) => [i.id, i]));
  const used = j.exec?.chemicals || [];
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState('');

  /*
   * ONLY what is in the technician's own hand. Not the warehouse, not the
   * catalogue — what was issued to them, minus what this service already
   * recorded. An exhausted chemical disappears from the list entirely: no
   * "0 g" rows, and nothing can be used past the holding.
   */
  const [hold, setHold] = useState<Record<string, number> | null>(null); // null = loading
  useEffect(() => {
    // The head technician's holding - his own when he records, his when the office does.
    api.get<{ holding: Array<{ itemId: string; qty: number }> }>(
      '/techstock' + (j.headTechId ? '?userId=' + encodeURIComponent(j.headTechId) : ''))
      .then((r) => {
        const m: Record<string, number> = {};
        (r.holding || []).forEach((h) => { m[h.itemId] = h.qty; });
        setHold(m);
      })
      .catch(() => setHold({}));
  }, [j.id]);

  const usedOf = (id: string) => used.filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);
  const leftOf = (id: string) => ((hold || {})[id] ?? 0) - usedOf(id);
  /* Only what the store has issued to him, and only while some is left.
     A chemical is collected from the office against his name first; the
     server refuses anything else, and anything beyond what he holds. */
  const issued = j.inventory.filter((i) => i.cat === 'Chemical' && ((hold || {})[i.id] ?? 0) > 0
    || used.some((c) => c.id === i.id));
  const avail = j.inventory.filter((i) => i.cat === 'Chemical' && leftOf(i.id) > 0);
  const left = sel ? leftOf(sel) : 0;
  const unit = inv.get(sel)?.unit || '';

  // Keep the selection on something actually available as holdings change.
  useEffect(() => {
    if (!avail.some((c) => c.id === sel)) {
      // What he is actually carrying first; the rest of the list after it.
      setSel((avail.find((c) => leftOf(c.id) > 0) || avail[0])?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, used.length]);

  // Filled in, not yet added: the runner picks this up on Next.
  const n = parseFloat(qty) || 0;
  useEffect(() => {
    if (pendingRef) pendingRef.current = sel && n > 0 ? { itemId: sel, qty: n } : null;
  }, [pendingRef, sel, n]);

  function add() {
    if (!sel) { onErr('Pick a chemical'); return; }
    if (!n) { onErr('Enter how much you used'); return; }
    if (n > left) { onErr('Only ' + left + ' ' + unit + ' of ' + (inv.get(sel)?.name || 'it') + ' is left with you'); return; }
    onAdd(sel, n);
    setQty('');
    if (pendingRef) pendingRef.current = null;
  }

  const field = 'w-full h-11 px-3 rounded-lg border border-line bg-white text-[13.5px] outline-none transition-colors '
    + 'focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
  return (
    <div className="flex flex-col gap-3">
      {used.length > 0 && (
        <div className="flex flex-col gap-2">
          {used.map((c, i) => {
            const it = inv.get(c.id);
            return (
              <div key={i} data-chem-row className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5">
                <span className="w-8 h-8 rounded-full bg-mint text-mint-ink flex items-center justify-center shrink-0">
                  <Icon name="check" size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold truncate">{it?.name || c.id}</span>
                  <span className="block text-[12px] text-muted">{c.qty} {it?.unit || ''} used</span>
                </span>
                <button onClick={() => onRemove(i)} disabled={busy} aria-label="Remove"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-red-wash hover:text-accent">
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {hold !== null && issued.length > 0 && (
        <div data-chem-carry className="rounded-lg border border-line bg-white overflow-hidden">
          <div className="px-3 py-2 bg-wash border-b border-line-soft grid grid-cols-[1fr_auto_auto_auto] gap-x-3
            text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            <span>With you</span><span className="text-right">Issued</span>
            <span className="text-right">Used here</span><span className="text-right">Left</span>
          </div>
          {issued.map((c) => {
            const had = (hold || {})[c.id] ?? 0;
            const u = usedOf(c.id);
            const l = had - u;
            return (
              <div key={c.id} className="px-3 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center
                text-[12.5px] border-t border-line-soft first:border-t-0 tabular-nums">
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                <span className="text-right text-muted">{had} {c.unit}</span>
                <span className="text-right text-muted">{u || '—'}</span>
                <span className={'text-right font-semibold ' + (l > 0 ? 'text-mint-ink' : 'text-accent')}>
                  {l > 0 ? l + ' ' + c.unit : 'None'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {hold === null ? (
        <p className="text-[12.5px] text-muted">Checking what you are carrying…</p>
      ) : avail.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-wash px-3.5 py-3">
          <p className="text-[13px] font-semibold">
            {issued.length ? 'Nothing left to use' : 'No chemicals issued to you'}
          </p>
          <p className="text-[12px] text-muted mt-0.5">
            Collect chemicals from the office store — they are issued against your name and
            appear here with the quantity you hold. If none were used, tap Next.
          </p>
        </div>
      ) : (
        <div data-chem-add className="rounded-lg border border-line-soft bg-wash p-3 flex flex-col gap-2.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            {used.length ? 'Add another chemical' : 'Add a chemical'}
          </span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={selectCls + ' w-full'}>
            {avail.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {leftOf(c.id)} {c.unit} left
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <label className="relative flex-1">
              <input type="number" inputMode="decimal" min={1} max={left > 0 ? left : undefined} value={qty}
                placeholder={left > 0 ? 'Up to ' + left : 'Quantity used'}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                className={field + (unit ? ' pr-14' : '')} />
              {unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-muted pointer-events-none">{unit}</span>
              )}
            </label>
            <button type="button" disabled={busy} onClick={add}
              className="h-11 px-4 rounded-lg bg-accent text-white text-[13.5px] font-bold
                flex items-center justify-center gap-1.5 active:brightness-90 disabled:opacity-60 shrink-0">
              <Icon name="plus" size={14} /> Add
            </button>
          </div>
          <p className={'text-[12px] ' + (n > left ? 'text-accent font-semibold' : 'text-muted')}>
            {n > left
              ? `More than you hold — only ${left} ${unit} left with you.`
              : `You can use up to ${left} ${unit}. It comes off your stock when you finish.`}
          </p>
        </div>
      )}
    </div>
  );
}


/**
 * What was done, area by area. The old canned-chip list said what was *found*;
 * the technician needs to say what he *did*, and the areas of a property are
 * not a list anyone can pre-write — a factory has bays, a flat has a kitchen.
 * So: type the area, type the work, add another.
 */
export function AreaFindingsBlock({ rows, busy, onChange }: {
  rows: AreaFinding[]; busy: boolean; onChange: (next: AreaFinding[]) => void;
}) {
  /* Keep a blank row at the bottom so there is always somewhere to type. */
  const norm = (list: AreaFinding[]) => {
    const filled = list.filter((r) => r.area.trim() || r.text.trim());
    return [...filled, { area: '', text: '' }];
  };
  const [draft, setDraft] = useState<AreaFinding[]>(() => norm(rows));

  const edit = (i: number, key: 'area' | 'text', v: string) => {
    const next = draft.map((r, k) => (k === i ? { ...r, [key]: v } : r));
    setDraft(next);
  };

  const commit = () => {
    const clean = draft.filter((r) => r.area.trim() || r.text.trim());
    setDraft(norm(clean));
    onChange(clean);
  };

  const remove = (i: number) => {
    const clean = draft.filter((_, k) => k !== i).filter((r) => r.area.trim() || r.text.trim());
    setDraft(norm(clean));
    onChange(clean);
  };

  /* Each area is its own small box: the area name on top, what was done
     under it, full width. Three boxes side by side on a phone left the
     area name cut off and the work squeezed into a sliver. */
  const field = 'w-full px-3 rounded-lg border border-line text-[13px] outline-none transition-colors '
    + 'bg-white focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
  return (
    <div className="flex flex-col gap-2.5">
      {draft.map((r, i) => {
        const last = i === draft.length - 1;
        const empty = !r.area.trim() && !r.text.trim();
        return (
          <div key={i} data-area-row className="rounded-lg border border-line-soft bg-wash p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                {last && empty ? 'Add an area' : 'Area ' + (i + 1)}
              </span>
              {!(last && empty) && (
                <button type="button" onClick={() => remove(i)} disabled={busy}
                  aria-label="Remove this area"
                  className="h-7 px-2 -mr-1 rounded text-[12px] font-semibold text-muted
                    hover:bg-white disabled:opacity-30 inline-flex items-center gap-1">
                  <Icon name="x" size={12} /> Remove
                </button>
              )}
            </div>
            <input value={r.area} disabled={busy} onBlur={commit}
              onChange={(e) => edit(i, 'area', e.target.value)}
              placeholder="Area (kitchen, store room, bay 2…)"
              className={field + ' h-10'} />
            <textarea value={r.text} disabled={busy} onBlur={commit} rows={2}
              onChange={(e) => edit(i, 'text', e.target.value)}
              placeholder="What you did here"
              className={field + ' py-2 min-h-[60px] resize-none'} />
          </div>
        );
      })}
    </div>
  );
}

export function LiveTimer({ startedAt }: { startedAt: string }) {
  const [txt, setTxt] = useState('00:00');
  useEffect(() => {
    const t0 = new Date(startedAt.replace(' ', 'T')).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setTxt((hh !== '00' ? hh + ':' : '') + mm + ':' + ss);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [startedAt]);
  return <p className="text-[28px] font-bold text-navy font-mono tracking-tight mt-1">{txt}</p>;
}


/**
 * The customer's signature at the end of a visit.
 *
 * It used to be a strip drawn on in the middle of the form, in whatever way
 * the phone was held. It is now the same full-screen pad every signature in
 * the app uses (components/sign-full.tsx), which signs in landscape: the box
 * here says "Tap to sign", opens the pad, and then shows what was signed.
 * Screens talk to it exactly as before - isInked / clear / data.
 */
export function SigPad({ apiRef, big }: {
  apiRef: React.MutableRefObject<{ isInked: () => boolean; clear: () => void; data: () => string } | null>;
  big?: boolean;
}) {
  const [img, setImg] = useState('');
  const [open, setOpen] = useState(false);
  const imgRef = useRef('');
  imgRef.current = img;

  useEffect(() => {
    apiRef.current = {
      isInked: () => !!imgRef.current,
      clear: () => setImg(''),
      data: () => imgRef.current,
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  return (
    <>
      <button type="button" data-sig-pad onClick={() => setOpen(true)}
        style={{ height: big ? 200 : 160 }}
        className={'w-full rounded border bg-white flex items-center justify-center overflow-hidden '
          + (img ? 'border-line' : 'border-dashed border-accent/50 bg-[#fff7f7]')}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="Customer signature" className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <span className="text-center">
            <span className="block text-[15px] font-bold text-accent">Tap to sign</span>
            <span className="block text-[12px] text-muted mt-1">Opens a full-screen pad - sign with the phone sideways</span>
          </span>
        )}
      </button>
      {open && (
        <SignFull title="Customer signature" who="Customer"
          onCancel={() => setOpen(false)}
          onDone={(url) => { setImg(url); setOpen(false); }} />
      )}
    </>
  );
}
