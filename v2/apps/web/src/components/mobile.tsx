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

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
/* ============================================================= the brand band

   The top of a phone screen, in the company's own colour.

   A white bar with small grey text tells somebody holding a phone at a
   customer's gate almost nothing. A solid band of the brand says which app
   this is from across a room, and gives the two or three numbers that
   actually matter a ground to sit on rather than floating in a list.

   It curves into the page below it. That corner is doing real work: it draws
   the eye down from the band into the content instead of stopping it at a
   hard edge, and it is the shape people recognise the app by.
   ========================================================================= */

export function Hero({ eyebrow, title, right, status, children }: {
  /** The small line above the title — "Welcome back", or a date. */
  eyebrow?: string;
  title: string;
  /** Something on the far side of the title: a bell, a settings cog. */
  right?: React.ReactNode;
  /** A white pill under the title — a state worth stating in words. */
  status?: React.ReactNode;
  /** HeroStats, usually. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-b-[30px] px-4 pt-3 pb-4 text-white"
      style={{ background: 'linear-gradient(160deg, var(--color-hero), var(--color-hero-2))' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[12.5px] font-medium text-white/75 leading-tight">{eyebrow}</p>
          )}
          <h1 className="text-[23px] font-bold tracking-[-0.02em] leading-tight truncate mt-0.5">
            {title}
          </h1>
        </div>
        {right && <span className="flex items-center gap-1.5 shrink-0">{right}</span>}
      </div>

      {status && (
        <div className="mt-3 bg-white rounded-full h-11 px-4 flex items-center justify-center gap-2
          text-[14px] font-semibold text-ink">
          {status}
        </div>
      )}

      {children}
    </div>
  );
}

/** The numbers that matter, on the band rather than below it. */
export function HeroStats({ items }: {
  items: Array<{ label: string; value: string | number; icon?: IconName; href?: string }>;
}) {
  return (
    <div className={'mt-3 grid gap-2 '
      + (items.length >= 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((it) => {
        const body = (
          <>
            {it.icon && <Icon name={it.icon} size={15} className="text-white/70" />}
            <span className="block text-[19px] font-bold leading-none tabular-nums mt-1.5">
              {it.value}
            </span>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.06em]
              text-white/70 mt-1 leading-tight">
              {it.label}
            </span>
          </>
        );
        const cls = 'rounded-2xl px-2.5 py-2.5 text-center';
        return it.href
          ? <Link key={it.label} href={it.href} className={cls + ' active:brightness-95'}
              style={{ background: 'var(--color-hero-soft)' }}>{body}</Link>
          : <span key={it.label} className={cls} style={{ background: 'var(--color-hero-soft)' }}>
              {body}
            </span>;
      })}
    </div>
  );
}

/** A round, translucent button for the band — a bell, a cog. */
export function HeroButton({ name, href, onClick, label, dot }: {
  name: IconName; href?: string; onClick?: () => void; label: string; dot?: boolean;
}) {
  const cls = 'relative w-10 h-10 rounded-full flex items-center justify-center text-white '
    + 'active:brightness-90';
  const body = (
    <>
      <Icon name={name} size={18} />
      {dot && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white
          ring-2 ring-[var(--color-hero)]" />
      )}
    </>
  );
  const style = { background: 'var(--color-hero-soft)' };
  return href
    ? <Link href={href} aria-label={label} className={cls} style={style}>{body}</Link>
    : <button onClick={onClick} aria-label={label} className={cls} style={style}>{body}</button>;
}

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
    <section className={'bg-white rounded-[20px] overflow-hidden ' + className}>
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
  items: Array<{ href: string; label: string; icon: IconName }>;
}) {
  /* Three across, each a white card with the icon in a tinted square. The
     square is what makes a row of these read as buttons rather than as a
     list somebody forgot to finish. */
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map((it) => (
        <Link key={it.href} href={it.href}
          className="bg-white rounded-[18px] py-3.5 flex flex-col items-center gap-2
            active:brightness-95">
          <span className="w-11 h-11 rounded-[14px] bg-rose flex items-center justify-center">
            <Icon name={it.icon} size={19} className="text-accent" />
          </span>
          <span className="text-[12.5px] font-semibold text-center leading-tight px-1">
            {it.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** A section heading with a tinted icon square, the way the cards are marked. */
export function SectionTitle({ icon, children, action, actionHref }: {
  icon: IconName;
  children: React.ReactNode;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-[9px] bg-rose flex items-center justify-center shrink-0">
          <Icon name={icon} size={14} className="text-accent" />
        </span>
        <span className="text-[16px] font-bold tracking-[-0.01em]">{children}</span>
      </span>
      {action && actionHref && (
        <Link href={actionHref} className="text-[13px] font-semibold text-accent flex items-center gap-0.5">
          {action}<Icon name="chevRight" size={13} />
        </Link>
      )}
    </div>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:hidden bg-ground min-h-full pb-[calc(env(safe-area-inset-bottom)+96px)]">
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
    <div className="relative bg-white px-4 pt-2 pb-1 flex items-center justify-between gap-2">
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

/* ------------------------------------------------------------ list screen */

export interface ListRow {
  id: string;
  href?: string;
  title: string;
  amount?: string;
  right?: string;
  meta?: string;
  tone?: Tone;
  state?: string;
}

/**
 * A whole list screen: title, optional search, optional filters, the rows,
 * and the states around them.
 *
 * Most of this app is a list of things with a name, a number and a state.
 * Writing that page fifteen times is fifteen chances for the spacing to
 * drift, and the one that drifts is always the one somebody is looking at.
 */
export function ListScreen({
  title, rows, loading, filters, filter, onFilter, search, onSearch,
  empty, emptyHint, fabHref, fabOnClick, fabLabel, headerRight, children, back,
}: {
  title: string;
  /** Set on any screen that is not one of the four tabs: reached from More,
      it needs a way out, and inside the Android shell there is no browser
      chrome to fall back on. */
  back?: string;
  rows: ListRow[];
  loading?: boolean;
  filters?: Array<{ key: string; label: string }>;
  filter?: string;
  onFilter?: (v: string) => void;
  /** Passing a value turns the search control on. */
  search?: string;
  onSearch?: (v: string) => void;
  empty?: string;
  emptyHint?: string;
  fabHref?: string;
  fabOnClick?: () => void;
  fabLabel?: string;
  headerRight?: React.ReactNode;
  /** Anything to sit above the list — a banner, a total. */
  children?: React.ReactNode;
}) {
  return (
    <Screen>
      {/* A tab gets the big title; anything reached from More gets the back bar
          instead, carrying the same name. Showing both says it twice. */}
      {back ? (
        <BackBar title={title} fallback={back} right={
          <>
            {headerRight}
            {onSearch && <SearchToggle value={search || ''} onChange={onSearch} />}
          </>
        } />
      ) : (
        <ScreenTitle title={title}>
          {headerRight}
          {onSearch && <SearchToggle value={search || ''} onChange={onSearch} />}
        </ScreenTitle>
      )}

      {filters && filter !== undefined && onFilter && (
        <Filters value={filter} onChange={onFilter} options={filters} />
      )}

      <div className="px-4 pt-3 flex flex-col gap-3">
        {children}

        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[84px] rounded-2xl bg-white animate-pulse" />
          ))
        ) : rows.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">{empty || 'Nothing here yet'}</p>
            {emptyHint && (
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">{emptyHint}</p>
            )}
          </Card>
        ) : (
          <Card flush className="mb-4">
            {rows.map((r) => (
              <Row key={r.id} href={r.href}
                title={r.title} amount={r.amount} right={r.right} meta={r.meta}
                chip={r.state ? <Chip tone={r.tone || 'plain'}>{r.state}</Chip> : undefined} />
            ))}
          </Card>
        )}
      </div>

      {(fabHref || fabOnClick) && (
        <Fab href={fabHref} onClick={fabOnClick} label={fabLabel || 'New'} />
      )}
    </Screen>
  );
}

/** The magnifier that opens a field, rather than a field always taking room. */
function SearchToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton name="search" label="Search" onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute left-0 right-0 top-full bg-white px-4 pb-3 z-10">
          <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus
            placeholder="Search…"
            className="w-full h-11 px-3.5 rounded-xl bg-ground text-[15px] outline-none
              focus:ring-2 focus:ring-accent/30" />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- desk only */

/**
 * For the handful of screens a phone genuinely cannot do.
 *
 * The dispatch board is drag-and-drop across a day's timeline; a print view
 * is a sheet of A4. Shrinking either produces something that looks usable and
 * is not, which is worse than saying so — a person who knows a screen needs a
 * laptop stops fighting it and goes to find one.
 */
export function DeskOnly({ title, why, goHref, goLabel, back = '/dashboard' }: {
  title: string; why: string; goHref: string; goLabel: string; back?: string;
}) {
  return (
    <Screen>
      {/* Even a screen that refuses needs a way out of itself. */}
      <BackBar title="Dispatch board" fallback={back} />
      <div className="px-4 pt-6">
        <Card>
          <p className="text-[17px] font-bold text-center">{title}</p>
          <p className="text-muted text-[14.5px] mt-2 text-center leading-relaxed">{why}</p>
          <Link href={goHref}
            className="mt-5 flex items-center justify-center h-12 rounded-xl bg-accent
              text-white font-bold text-[15px] active:brightness-90">
            {goLabel}
          </Link>
        </Card>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------- back */

/**
 * The way out of a screen.
 *
 * A phone screen that can be opened must be closable, and inside the Android
 * shell there is no browser chrome to fall back on — without this a person is
 * stranded on an invoice with only the hardware key, which was closing the
 * whole app.
 *
 * router.back() where there is history, and the named fallback where there is
 * not: opening a link straight into a detail screen leaves nothing to go back
 * to, and a dead button is worse than no button.
 */
export function BackBar({ title, sub, fallback = '/dashboard', right }: {
  title: string;
  sub?: string;
  fallback?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-line-soft
      relative flex items-center gap-2 h-[52px] px-2">
      <button
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) router.back();
          else router.push(fallback);
        }}
        aria-label="Back"
        className="w-11 h-11 rounded-full flex items-center justify-center active:bg-wash shrink-0">
        <Icon name="chevRight" size={22} className="rotate-180" />
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-bold truncate leading-tight">{title}</span>
        {sub && <span className="block text-[12.5px] text-muted truncate">{sub}</span>}
      </span>
      {right}
    </div>
  );
}
