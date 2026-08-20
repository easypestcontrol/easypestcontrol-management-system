'use client';

/* ============================================================================
   Jobs + Schedule module — small shared UI atoms (pills, avatars, modal).
   Zoho Books density in the three-color system: navy ink, red action, white.
   ========================================================================== */

import { Icon } from '@/components/icons';
import { STATUS } from './format';

/* ------------------------------------------------------------------ pills */

export function StatusPill({ status }: { status: string }) {
  const m = STATUS[status] || STATUS.scheduled;
  return <span className={m.pill}>{m.label}</span>;
}

export function PriorityPill({ priority }: { priority: string }) {
  if (priority !== 'high' && priority !== 'urgent') return null;
  return <span className="zpill red">{priority === 'urgent' ? 'Urgent' : 'Priority'}</span>;
}

export function TypePill({ type, visitNo, ofVisits }: { type: string; visitNo?: number; ofVisits?: number }) {
  return (
    <span className="zpill outline">
      {type === 'AMC Visit' ? 'AMC Service' : type}{visitNo ? ` ${visitNo}/${ofVisits}` : ''}
    </span>
  );
}

/* ---------------------------------------------------------------- avatars */

export function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="rounded-full text-white font-bold flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, background: color || '#1B2E65',
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}>
      {initials(name || '?')}
    </span>
  );
}

/** Overlapping avatar row for a crew; em dash when nobody is assigned. */
export function TechStack({ techs }: { techs: Array<{ id: string; name: string; color?: string }> }) {
  if (!techs.length) return <span className="zpill red">Unassigned</span>;
  return (
    <span className="flex items-center">
      {techs.map((t, i) => (
        <span key={t.id} title={t.name} style={{ marginLeft: i ? -6 : 0 }}
          className="rounded-full ring-2 ring-white inline-flex">
          <Avatar name={t.name} color={t.color} size={24} />
        </span>
      ))}
      <span className="ml-2 text-[12.5px] text-ink-2 truncate">
        {techs.length === 1 ? techs[0].name.split(' ')[0] : techs.length + ' techs'}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ stars */

export function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" style={{ fontSize: size, lineHeight: 1 }} aria-label={n + ' of 5'}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'text-accent' : 'text-muted-2'}>★</span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({ title, sub, onClose, children, wide }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4"
      style={{ background: 'rgb(27 46 101 / 0.4)' }} onClick={onClose}>
      <div className={'bg-white rounded-md shadow-pop w-full ' + (wide ? 'max-w-[640px]' : 'max-w-[480px]')}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line-soft">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {sub && <p className="text-muted text-[12.5px] mt-0.5">{sub}</p>}
          </div>
          <button onClick={onClose} className="text-muted-2 hover:text-ink mt-0.5" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- lightbox */

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 cursor-zoom-out"
      style={{ background: 'rgb(27 46 101 / 0.72)' }} onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-w-full max-h-full rounded shadow-pop bg-white" />
    </div>
  );
}

/* ------------------------------------------------------------ form fields */

export function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">
        {label}{required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
export const selectCls = inputCls + ' appearance-none';
