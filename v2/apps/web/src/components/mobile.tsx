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
  /* An inset card, not a full-bleed band.
     Bled to the edges and squared off at the top, the brand colour owned the
     first third of every screen — which is a lot of saturated red to hand
     somebody before they have read a word. Held in from the sides with all
     four corners round, the same colour reads as one element on the page
     instead of as the page's background, and the grey ground gets to do the
     job it is there for. */
  return (
    <div className="mx-4 mt-5 rounded-[28px] px-4 pt-6 pb-6 text-white shadow-card"
      style={{ background: 'linear-gradient(145deg, var(--color-hero), var(--color-hero-2))' }}>
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
    <div className={'mt-4 grid gap-2 '
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
        /* Taller tiles inside a taller band — at 2.5 the figures sat on top
           of their labels and the whole panel read as a strip rather than a
           panel. */
        /* A hairline instead of a heavier fill: the tile reads as a panel
           on the band rather than a paler rectangle stuck to it. */
        const cls = 'rounded-2xl px-2.5 py-4 text-center border border-hero-line';
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
/* A phone address book puts a face beside every name; ours had a wall of
   black text. The initials come from whoever the row is about and the colour
   is derived from their name, so the same customer always wears the same one
   and the list becomes something you can find your place in. */
const AVATAR = [
  { bg: 'bg-sky', fg: 'text-sky-ink' },
  { bg: 'bg-mint', fg: 'text-mint-ink' },
  { bg: 'bg-amber', fg: 'text-amber-ink' },
  { bg: 'bg-rose', fg: 'text-rose-ink' },
];
export function initialsOf(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '');
  return (a + b).toUpperCase();
}
function avatarTone(name: string) {
  let n = 0;
  for (const ch of String(name || '')) n = (n + ch.charCodeAt(0)) % 997;
  return AVATAR[n % AVATAR.length];
}

export function Row({ href, title, amount, meta, chip, right, onMore, avatar, stats, pill }: {
  href?: string;
  title: string;
  amount?: string;
  meta?: string;
  chip?: React.ReactNode;
  right?: string;
  onMore?: () => void;
  /** Initials beside the row, taken from this name. */
  avatar?: string;
  /** A third line of figures — what this record is worth at a glance. */
  stats?: string;
  /** A state word on the right, under the place. */
  pill?: React.ReactNode;
}) {
  const tone = avatar ? avatarTone(avatar) : null;
  const inner = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[15.5px] font-bold tracking-[-0.01em] truncate">{title}</span>
        {amount && <span className="text-[15.5px] font-bold tabular-nums shrink-0">{amount}</span>}
        {!amount && (right || pill) && (
          /* A place and a state, not a number: they read as labels rather
             than competing with the name for the same weight of black. */
          <span className="shrink-0 text-right">
            {pill}
            {right && (
              <span className="block text-[12.5px] font-semibold text-sky-ink whitespace-nowrap">
                {right}
              </span>
            )}
          </span>
        )}
      </span>
      {/* The chip rides on the meta line instead of taking a third row of
          its own. Three stacked lines per record turned a list of eight
          customers into a wall — the tag is one word and belongs beside the
          detail it qualifies, not underneath it. */}
      {(meta || chip) && (
        <span className={'flex items-center gap-2 min-w-0 ' + (stats ? 'mt-1' : 'mt-2')}>
          {chip}
          {meta && <span className="text-[13.5px] text-muted truncate min-w-0">{meta}</span>}
          {onMore && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMore(); }}
              aria-label="More"
              className="w-9 h-9 -mr-2 flex items-center justify-center text-muted-2">
              <Icon name="more" size={17} />
            </button>
          )}
        </span>
      )}
      {/* The figures last, quietest of the three lines. They are what you
          check after you have found the name, not what you scan for. */}
      {stats && (
        <span className="block text-[12.5px] text-muted-2 mt-1 truncate">{stats}</span>
      )}
    </>
  );

  const body = tone ? (
    <span className="flex items-start gap-3">
      <span className={'w-10 h-10 rounded-full shrink-0 flex items-center justify-center '
        + 'text-[13px] font-bold ' + tone.bg + ' ' + tone.fg}>
        {initialsOf(avatar || '')}
      </span>
      <span className="flex-1 min-w-0">{inner}</span>
    </span>
  ) : inner;

  /* Roomier and shorter at the same time: the third line is gone, so the
     space it used to take becomes breathing room around two. */
  /* A one-line row needs air around it more than a three-line one did: the
     space that used to be filled with a contact and a phone number becomes
     the gap between one customer and the next. */
  const cls = 'block px-4 border-b border-line-soft last:border-b-0 active:bg-wash '
    + (stats ? 'py-4' : 'py-5');
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
      {/* The header wears a rule and a tint so it reads as a header.
          Without them it was the same weight as the first row under it and
          the same hairline separated them, so "Today's services" looked like
          another customer in the list rather than the title above it. The
          rule is `border-line`; the ones between rows are `line-soft`, which
          is what makes one a heading and the others a list. */}
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
          <h2 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink min-w-0">
            {icon && <Icon name={icon} size={16} className="text-accent shrink-0" />}
            <span className="truncate">{title}</span>
          </h2>
          {action && actionHref && (
            <Link href={actionHref}
              className="text-accent text-[13px] font-bold whitespace-nowrap shrink-0 -m-2 p-2">
              {action}
            </Link>
          )}
        </header>
      )}
      <div className={flush ? '' : 'px-4 py-4'}>{children}</div>
    </section>
  );
}

/**
 * A card that starts closed and says how much is inside.
 *
 * A customer with twelve visits and nine invoices printed all twenty-one on
 * the page, so the thing people actually open this screen for — the phone
 * number and what is owed — was four screens above the fold. Now each section
 * is one row you tap: "Services 12". Open it and the list is there; leave it
 * and the page is short.
 */
export function Fold({ title, count, icon, children, open: initial }: {
  title: string; count: number; icon?: IconName;
  children: React.ReactNode; open?: boolean;
}) {
  const [open, setOpen] = useState(!!initial);
  if (!count) return null;
  return (
    <section className="bg-white rounded-[20px] overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 active:bg-wash">
        <span className="flex items-center gap-2 min-w-0">
          {icon && <Icon name={icon} size={16} className="text-accent shrink-0" />}
          <span className="text-[12.5px] font-bold uppercase tracking-[0.06em] truncate">{title}</span>
          <span className="text-[12.5px] font-bold text-muted-2 tabular-nums">{count}</span>
        </span>
        <Icon name="chevRight" size={16}
          className={'text-muted-2 shrink-0 transition-transform ' + (open ? 'rotate-90' : '')} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
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
  /* One card, one look. These used to come in three colours — rose for a
     problem, mint for a problem that had gone away, white for everything
     else — and four tiles side by side in three different tints read as
     decoration rather than as information. They are all the white card now.
     The figure still carries the state: a real alarm prints in the brand
     red, everything else in ink. */
  const bad = tone === 'bad' && Number(value) !== 0 && value !== '0';
  return (
    <Link href={href}
      className="rounded-[18px] p-3.5 min-h-[96px] flex flex-col bg-white shadow-card active:brightness-95">
      <span className="text-[12.5px] text-muted font-medium leading-tight">{label}</span>
      <span className={'text-[23px] font-bold tracking-[-0.02em] tabular-nums mt-1 '
        + (bad ? 'text-hero' : 'text-ink')}>
        {value}
      </span>
      <span className="mt-auto pt-2 flex items-center justify-between">
        <span className={'text-[12.5px] truncate ' + (bad ? 'text-hero font-semibold' : 'text-muted')}>
          {foot || ''}
        </span>
        <Icon name="chevRight" size={14} className="text-muted-2" />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------ quick create */

/** The four tints a tile can wear, as a background and a matching ink. */
const TILE_TINT: Record<string, { bg: string; fg: string }> = {
  rose: { bg: 'bg-rose', fg: 'text-rose-ink' },
  sky: { bg: 'bg-sky', fg: 'text-sky-ink' },
  mint: { bg: 'bg-mint', fg: 'text-mint-ink' },
  amber: { bg: 'bg-amber', fg: 'text-amber-ink' },
};

export function QuickTiles({ items }: {
  items: Array<{ href: string; label: string; icon: IconName; tint?: string }>;
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
          {/* The square carries the colour so the tile does not have to.
              Six identical red squares was the same shout as one red block,
              only spread out. */}
          <span className={'w-11 h-11 rounded-[14px] flex items-center justify-center '
            + (TILE_TINT[it.tint || 'sky'] || TILE_TINT.sky).bg}>
            <Icon name={it.icon} size={19}
              className={(TILE_TINT[it.tint || 'sky'] || TILE_TINT.sky).fg} />
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

/**
 * A filter that is a chip, not a dropdown.
 *
 * The operating system's own <select> lands on the screen as a grey list in
 * system type — the one control that does not belong to this app. This is a
 * chip that says what it is filtering by, and opens a sheet where a thumb
 * already is. Filtering shows in the chip itself: once a choice is made it
 * goes solid and carries the choice, so you can see what you are looking at
 * without opening anything.
 */
export function PickChip({ label, value, options, onPick }: {
  /** What it filters — "Status", "Location". Shown when nothing is picked. */
  label: string;
  value: string;
  /** The first option is the one that filters nothing. */
  options: Array<{ key: string; label: string }>;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = !!value;
  const picked = options.find((o) => o.key === value);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={'h-[34px] pl-3.5 pr-2.5 rounded-full text-[13.5px] font-semibold '
          + 'inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 '
          + (on ? 'bg-accent text-white' : 'bg-white border border-line text-ink')}>
        <span className="truncate max-w-[130px]">{on ? picked?.label || value : label}</span>
        <Icon name="chevDown" size={13} className="shrink-0 opacity-75" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-navy/45 flex items-end"
          onClick={() => setOpen(false)}>
          <div className="w-full bg-white rounded-t-[24px] pt-2
            pb-[calc(env(safe-area-inset-bottom)+96px)] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1" />
            <p className="px-5 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-2">
              {label}
            </p>
            {options.map((o) => {
              const sel = o.key === value;
              return (
                <button key={o.key || 'all'} type="button"
                  onClick={() => { onPick(o.key); setOpen(false); }}
                  className={'w-full text-left px-5 h-12 flex items-center justify-between gap-3 '
                    + 'text-[15px] active:bg-wash ' + (sel ? 'font-bold text-accent' : 'text-ink')}>
                  {o.label}
                  {sel && <Icon name="check" size={16} className="text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** The screen's title bar for a top-level tab. */
export function ScreenTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  /* The same bar the New customer screen wears: 16px semibold, 56px tall,
     with a rule under it. A 25px display heading is a magazine cover, not an
     app bar — it ate the top of every list and made the page title shout
     louder than anything on the page. */
  return (
    <div className="relative bg-white px-4 h-[56px] border-b border-line
      flex items-center justify-between gap-2">
      <h1 className="text-[16px] font-semibold truncate min-w-0">{title}</h1>
      <span className="flex items-center gap-2 shrink-0">{children}</span>
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
  /* Clear of the tab bar. At +76px the button's lower half sat behind the
     floating bar and read as half-hidden. */
  const cls = 'lg:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-30 '
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
  /** Show initials beside the row, taken from this name. */
  avatar?: string;
  /** A third line of figures. */
  stats?: string;
  /** A state word on the right. */
  pill?: React.ReactNode;
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
  searchPlaceholder, pinSearch, chips,
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
  searchPlaceholder?: string;
  /** Keep the field on screen instead of hiding it behind a magnifier. On a
      list people arrive at knowing the name they want, a magnifier is one tap
      standing between them and the only thing they came to do. */
  pinSearch?: boolean;
  /** PickChips, usually — a row of filters under the search field. */
  chips?: React.ReactNode;
  empty?: string;
  emptyHint?: string;
  fabHref?: string;
  fabOnClick?: () => void;
  fabLabel?: string;
  headerRight?: React.ReactNode;
  /** Anything to sit above the list — a banner, a total. */
  children?: React.ReactNode;
}) {
  const [sOpen, setSOpen] = useState(false);
  return (
    <Screen>
      {/* A tab gets the big title; anything reached from More gets the back bar
          instead, carrying the same name. Showing both says it twice. */}
      {back ? (
        <BackBar title={title} fallback={back} right={
          <>
            {headerRight}
            {onSearch && !pinSearch
              && <SearchToggle open={sOpen} onToggle={() => setSOpen((v) => !v)} />}
          </>
        } />
      ) : (
        <ScreenTitle title={title}>
          {headerRight}
          {onSearch && !pinSearch
            && <SearchToggle open={sOpen} onToggle={() => setSOpen((v) => !v)} />}
        </ScreenTitle>
      )}

      {onSearch && (pinSearch || sOpen) && (
        <SearchField value={search || ''} onChange={onSearch}
          placeholder={searchPlaceholder} focus={!pinSearch} />
      )}

      {chips && (
        <div className="flex gap-2 px-4 pb-3 pt-0.5 overflow-x-auto no-scrollbar bg-white
          border-b border-line">
          {chips}
        </div>
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
              <Row key={r.id} href={r.href} avatar={r.avatar}
                stats={r.stats} pill={r.pill}
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
/* The magnifier only. The field itself is rendered by the screen, in normal
   flow under the title bar — as an absolutely positioned panel it floated on
   top of the list and hid the first result, which on a search of one match
   meant hiding the only thing you were looking for. */
function SearchToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <IconButton name="search" label={open ? 'Close search' : 'Search'} onClick={onToggle} />;
}

function SearchField({ value, onChange, placeholder, focus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; focus?: boolean;
}) {
  return (
    <div className={'bg-white px-4 pt-3 pb-3 ' + (focus ? 'border-b border-line' : '')}>
      <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-ground
        focus-within:ring-2 focus-within:ring-accent/30">
        <Icon name="search" size={16} className="text-muted-2 shrink-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={focus}
          placeholder={placeholder || 'Search…'}
          className="flex-1 min-w-0 bg-transparent text-[15px] outline-none" />
        {value && (
          <button type="button" onClick={() => onChange('')} aria-label="Clear search"
            className="shrink-0 w-6 h-6 rounded-full bg-line-soft flex items-center justify-center">
            <Icon name="x" size={12} className="text-muted" />
          </button>
        )}
      </label>
    </div>
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
      relative flex items-center gap-2 h-[60px] px-2">
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
        <span className="block text-[16px] font-semibold truncate leading-tight">{title}</span>
        {sub && <span className="block text-[12.5px] text-muted truncate">{sub}</span>}
      </span>
      {right}
    </div>
  );
}
