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
  onAdd: (f: File) => void; onRemove: (i: number) => void; onZoom: (src: string) => void;
  /** Also offer the gallery. Site photos may have been taken minutes ago on
      another app; the uniform photo may not, and never passes this. */
  gallery?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  return (
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
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="h-20 rounded border border-dashed border-line flex flex-col items-center justify-center gap-1 text-muted hover:bg-wash hover:text-ink disabled:opacity-60">
        <Icon name="plus" size={16} />
        <span className="text-[11px] font-semibold">Camera</span>
      </button>
      {gallery && (
        <button onClick={() => pickRef.current?.click()} disabled={busy}
          className="h-20 rounded border border-dashed border-line flex flex-col items-center justify-center gap-1 text-muted hover:bg-wash hover:text-ink disabled:opacity-60">
          <Icon name="upload" size={16} />
          <span className="text-[11px] font-semibold">Gallery</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-kind={kind}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = '';
        }} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" data-kind={kind}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = '';
        }} />
    </div>
  );
}

export function ChemBlock({ j, busy, onAdd, onRemove, onErr }: {
  j: JobDetail; busy: boolean;
  onAdd: (itemId: string, qty: number) => void; onRemove: (i: number) => void;
  onErr: (msg: string) => void;
}) {
  const inv = new Map(j.inventory.map((i) => [i.id, i]));
  const used = j.exec?.chemicals || [];
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState('50');

  /*
   * ONLY what is in the technician's own hand. Not the warehouse, not the
   * catalogue — what was issued to them, minus what this service already
   * recorded. An exhausted chemical disappears from the list entirely: no
   * "0 g" rows, and nothing can be used past the holding.
   */
  const [hold, setHold] = useState<Record<string, number> | null>(null); // null = loading
  useEffect(() => {
    api.get<{ holding: Array<{ itemId: string; qty: number }> }>('/techstock')
      .then((r) => {
        const m: Record<string, number> = {};
        (r.holding || []).forEach((h) => { m[h.itemId] = h.qty; });
        setHold(m);
      })
      .catch(() => setHold({}));
  }, [j.id]);

  const usedOf = (id: string) => used.filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);
  const leftOf = (id: string) => ((hold || {})[id] ?? 0) - usedOf(id);
  /* Every chemical, not only what the store has issued.
     Refusing to record anything a technician is not carrying on paper does
     not stop him using it — it stops him TELLING us he used it, which is the
     one thing the report exists for. What he is carrying is still shown
     against each name, and anything beyond it is recorded as owed to the
     store rather than quietly dropped. */
  const avail = j.inventory.filter((i) => i.cat === 'Chemical');
  const left = sel ? leftOf(sel) : 0;

  // Keep the selection on something actually available as holdings change.
  useEffect(() => {
    if (!avail.some((c) => c.id === sel)) {
      // What he is actually carrying first; the rest of the list after it.
      setSel((avail.find((c) => leftOf(c.id) > 0) || avail[0])?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, used.length]);

  return (
    <div>
      {used.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {used.map((c, i) => {
            const it = inv.get(c.id);
            return (
              <div key={i} className="flex items-center gap-3 rounded border border-line px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">{it?.name || c.id}</span>
                  <span className="block text-[11.5px] text-muted">{it?.note || ''}</span>
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap">{c.qty} {it?.unit || ''}</span>
                <button onClick={() => onRemove(i)} disabled={busy} aria-label="Remove"
                  className="w-7 h-7 rounded flex items-center justify-center text-muted hover:bg-red-wash hover:text-accent">
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {hold === null ? (
        <p className="text-[12.5px] text-muted">Checking what you are carrying…</p>
      ) : avail.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          No chemicals on this service&rsquo;s list. Ask the office to add them to the
          service, or leave this step empty.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className={selectCls + ' flex-1'}>
              {avail.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {leftOf(c.id) > 0 ? leftOf(c.id) + ' ' + c.unit + ' with you' : 'not issued to you'}
                </option>
              ))}
            </select>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-[88px] h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            <button disabled={busy}
              onClick={() => {
                const n = parseFloat(qty) || 0;
                if (!n) { onErr('Enter a quantity'); return; }
                if (!sel) { onErr('Pick a chemical'); return; }
                onAdd(sel, n);
              }}
              className="h-9 px-3.5 rounded bg-navy text-white flex items-center justify-center hover:brightness-110 disabled:opacity-60">
              <Icon name="plus" size={15} />
            </button>
          </div>
          <p className="text-[11.5px] text-muted mt-2">
            {left > 0
              ? `Comes off your holding when you finish — ${left} ${inv.get(sel)?.unit || ''} of ${inv.get(sel)?.name || ''} with you.`
              : 'You are not carrying this one on paper — record it anyway and it shows against you as owed to the store.'}
          </p>
        </>
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
  const [draft, setDraft] = useState<AreaFinding[]>(rows.length ? rows : [{ area: '', text: '' }]);

  /* Keep a blank row at the bottom so there is always somewhere to type. */
  const norm = (list: AreaFinding[]) => {
    const filled = list.filter((r) => r.area.trim() || r.text.trim());
    return [...filled, { area: '', text: '' }];
  };

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

  return (
    <div className="flex flex-col gap-2">
      {draft.map((r, i) => {
        const last = i === draft.length - 1;
        const empty = !r.area.trim() && !r.text.trim();
        return (
          <div key={i} className="flex gap-2 items-start">
            <input value={r.area} disabled={busy} onBlur={commit}
              onChange={(e) => edit(i, 'area', e.target.value)}
              placeholder="Area"
              className="w-[104px] shrink-0 h-9 px-2.5 rounded border border-line text-[13px]
                outline-none focus:border-navy" />
            <textarea value={r.text} disabled={busy} onBlur={commit}
              onChange={(e) => edit(i, 'text', e.target.value)}
              placeholder="What you did here"
              className="flex-1 min-h-[36px] px-2.5 py-2 rounded border border-line text-[13px]
                outline-none focus:border-navy" />
            <button type="button" onClick={() => remove(i)}
              disabled={busy || (last && empty)}
              aria-label="Remove this area"
              className="h-9 w-9 shrink-0 rounded border border-line text-muted
                hover:bg-wash disabled:opacity-30 flex items-center justify-center">
              <Icon name="x" size={14} />
            </button>
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


/** Pointer-events signature pad, dpr-scaled, saved as a PNG data URL. */
export function SigPad({ apiRef, big }: {
  apiRef: React.MutableRefObject<{ isInked: () => boolean; clear: () => void; data: () => string } | null>;
  big?: boolean;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    /* A signature is a wide, short thing.
       Filling the whole height of a phone made the saved PNG portrait — taller
       than it is wide — so every report showed a name signed across the middle
       of a tall white box, printed at stamp size to fit. The pad is now a
       landscape strip, and what comes out of it is the shape of the line
       somebody actually signs on. */
    const h = big ? Math.min(240, Math.max(150, Math.round(window.innerHeight * 0.32))) : 168;
    cv.style.height = h + 'px';
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(280, rect.width) * dpr;
    cv.height = h * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#141414';

    let drawing = false;
    const state = { inked: false };
    const pt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      drawing = true;
      state.inked = true;
      const p = pt(e);
      g.beginPath();
      g.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pt(e);
      g.lineTo(p.x, p.y);
      g.stroke();
    };
    const up = () => { drawing = false; };

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    apiRef.current = {
      isInked: () => state.inked,
      clear: () => { g.clearRect(0, 0, cv.width, cv.height); state.inked = false; },
      data: () => cv.toDataURL('image/png'),
    };

    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      apiRef.current = null;
    };
  }, [apiRef, big]);

  return (
    <canvas ref={cvRef} style={{ height: big ? 220 : 168 }}
      className="w-full rounded border border-line bg-white touch-none" />
  );
}
