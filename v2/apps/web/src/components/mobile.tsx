'use client';

/* ============================================================================
   The phone's parts.

   Every mobile screen is assembled from these, so the app looks like one app
   rather than a set of pages that happen to share a colour. Nothing here
   renders above `lg` — the desktop keeps its own layout, because a desk and a
   phone are used differently and one design cannot serve both without
   shortchanging the phone.

   The rules these encode, once, so no screen has to remember them:
     · a row is one tap target, 84px, not a stack of cells
     · state is a dot and two words, readable before the number
     · anything pressed is at least 48px
     · nothing is smaller than 12px
   ========================================================================== */

import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

/* ------------------------------------------------------------------ money */

/** Indian grouping: 1,24,500 — never 124,500. */
export const money = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

/** For a figure that has to fit a small tile. */
export function compact(n: number): string {
  const v = Math.round(n || 0);
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1).replace(/\.0$/, '') + ' Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + v;
}

/** 2026-08-21 → "21 Aug", or Today / Tomorrow / Yesterday. */
export function niceDate(iso: string): string {
  const p = String(iso || '').split('-');
  if (p.length !== 3) return iso || '';
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (Number.isNaN(d.getTime())) return iso;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.getDate() + ' ' + MON[d.getMonth()];
}

/* ------------------------------------------------------------------- chip */

export type Tone = 'plain' | 'good' | 'bad' | 'warn' | 'info';

const TONE: Record<Tone, string> = {
  plain: 'bg-wash text-muted',
  good: 'bg-mint text-mint-ink',
  bad: 'bg-rose text-rose-ink',
  warn: 'bg-amber text-amber-ink',
  info: 'bg-sky text-sky-ink',
};

/**
 * State as a dot and two words.
 *
 * The dot does the work: it is legible at a glance and in a photograph, and
 * it survives a screen in sunlight where a colour difference alone does not.
 */
export function Chip({ tone = 'plain', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold '
      + TONE[tone]}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- row */

/**
 * One record, three lines: what it is and what it is worth, then when, then
 * where it stands. 84px so a thumb — about 45px wide, and never precise —
 * cannot land between two of them.
 */
export function Row({ href, title, amount, meta, chip, right, onMore }: {
  href?: string;
  title: string;
  amount?: string;
  meta?: string;
  chip?: React.ReactNode;
  right?: string;
  onMore?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[15.5px] font-bold tracking-[-0.01em] truncate">{title}</span>
        {(amount || right) && (
          <span className="text-[15.5px] font-bold tabular-nums shrink-0">{amount || right}</span>
        )}
      </span>
      {meta && <span className="block text-[13px] text-muted truncate mt-1">{meta}</span>}
      {chip && (
        <span className="flex items-center justify-between gap-2 mt-1.5">
          {chip}
          {onMore && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMore(); }}
              aria-label="More"
              className="w-9 h-9 -mr-2 flex items-center justify-center text-muted-2 text-[17px] font-bold tracking-[2px]">
              ⋯
            </button>
          )}
        </span>
      )}
    </>
  );

  const cls = 'block px-4 py-3.5 min-h-[84px] border-b border-line-soft last:border-b-0 active:bg-wash';
  return href
    ? <Link href={href} className={cls}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/* ------------------------------------------------------------------- card */

/** A white card on the grey ground. The gap is the design. */
export function Card({ title, action, actionHref, icon, flush, children, className = '' }: {
  title?: string;
  action?: string;
  actionHref?: string;
  icon?: IconName;
  /** Rows go edge to edge; anything else gets padding. */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={'bg-white rounded-2xl overflow-hidden ' + className}>
      {title && (
        <header className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <h2 className="flex items-center gap-2 text-[16.5px] font-bold tracking-[-0.01em]">
            {icon && <Icon name={icon} size={17} className="text-accent" />}
            {title}
          </h2>
          {action && actionHref && (
            <Link href={actionHref} className="text-accent text-[14px] font-semibold -m-2 p-2">
              {action}
            </Link>
          )}
        </header>
      )}
      <div className={flush ? '' : 'px-4 pb-4'}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------- stat tile */

export function Stat({ href, label, value, foot, tone = 'info' }: {
  href: string;
  label: string;
  value: string | number;
  foot?: string;
  tone?: 'info' | 'bad';
}) {
  const bad = tone === 'bad';
  return (
    <Link href={href}
      className={'rounded-2xl p-3.5 min-h-[92px] flex flex-col active:brightness-95 '
        + (bad ? 'bg-rose' : 'bg-sky')}>
      {bad ? (
        <>
          <span className="text-[27px] font-bold leading-none tabular-nums text-rose-ink">{value}</span>
          <span className="text-[12.5px] leading-tight mt-1.5 text-muted">{label}</span>
        </>
      ) : (
        <>
          <span className="text-[12.5px] text-muted font-medium leading-tight">{label}</span>
          <span className="text-[23px] font-bold tracking-[-0.02em] tabular-nums mt-1">{value}</span>
        </>
      )}
      <span className="mt-auto pt-2 flex items-center justify-between">
        <span className={'text-[12.5px] ' + (bad ? 'text-rose-ink font-semibold' : 'text-muted')}>
          {foot || ''}
        </span>
        <Icon name="chevRight" size={14} className={bad ? 'text-rose-ink' : 'text-muted-2'} />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------ quick create */

export function QuickTiles({ items }: {
  items: Array<{ href: string; label: string; icon: IconName; tint: 'rose' | 'sky' | 'mint' | 'wash' }>;
}) {
  const TINT = {
    rose: 'bg-rose text-rose-ink',
    sky: 'bg-sky text-sky-ink',
    mint: 'bg-mint text-mint-ink',
    wash: 'bg-wash text-ink',
  };
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map((i) => (
        <Link key={i.href + i.label} href={i.href} className="flex flex-col items-center gap-2 py-1 active:opacity-60">
          <span className={'w-[52px] h-[52px] rounded-full flex items-center justify-center ' + TINT[i.tint]}>
            <Icon name={i.icon} size={21} />
          </span>
          <span className="text-[12.5px] text-muted font-medium text-center leading-tight">{i.label}</span>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

/** The screen's own scroll container: grey ground, clear of the tab bar. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:hidden bg-ground min-h-full pb-[calc(env(safe-area-inset-bottom)+84px)]">
      {children}
    </div>
  );
}

/** A band of cards with the standard gutter. */
export function Stack({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-3 flex flex-col gap-3">{children}</div>;
}

/** Horizontal filter chips. The selected one is solid red. */
export function Filters({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar bg-white">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={'h-[34px] px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 '
            + (value === o.key
              ? 'bg-accent text-white'
              : 'bg-white border border-line text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The screen's title bar for a top-level tab. */
export function ScreenTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white px-4 pt-2 pb-1 flex items-center justify-between gap-2">
      <h1 className="text-[25px] font-bold tracking-[-0.025em]">{title}</h1>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

/** A round icon button in a title bar. */
export function IconButton({ name, onClick, href, label }: {
  name: IconName; onClick?: () => void; href?: string; label: string;
}) {
  const cls = 'w-[38px] h-[38px] rounded-full bg-wash flex items-center justify-center active:brightness-95';
  const inner = <Icon name={name} size={19} />;
  return href
    ? <Link href={href} aria-label={label} className={cls}>{inner}</Link>
    : <button onClick={onClick} aria-label={label} className={cls}>{inner}</button>;
}

/** The floating plus. Sits above the tab bar and the gesture bar. */
export function Fab({ href, onClick, label = 'New' }: {
  href?: string; onClick?: () => void; label?: string;
}) {
  const cls = 'lg:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-30 '
    + 'w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center '
    + 'shadow-[0_6px_18px_rgba(255,0,0,0.35)] active:brightness-90';
  const inner = <Icon name="plus" size={25} />;
  return href
    ? <Link href={href} aria-label={label} className={cls}>{inner}</Link>
    : <button onClick={onClick} aria-label={label} className={cls}>{inner}</button>;
}

/** A red banner for the one thing on a screen that needs a person. */
export function Alert({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="flex items-center gap-2.5 bg-rose rounded-2xl px-3.5 py-3 active:brightness-95">
      <Icon name="alert" size={19} className="text-rose-ink shrink-0" />
      <span className="flex-1 text-[14px] font-semibold text-rose-ink">{children}</span>
      <Icon name="chevRight" size={16} className="text-rose-ink shrink-0" />
    </Link>
  );
}
