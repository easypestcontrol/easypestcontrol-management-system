# The ZService design system, extracted

Every value below is read from the reference's source, not estimated from a
screenshot. Source: `github.com/z3connectoperations-oss/zservicebooking`
(cloned to `C:\Users\Jenish\Downloads\zservicebooking-ref`), files
`tailwind.config.js`, `src/index.css`, `src/components/ui/*`,
`src/components/admin/*`, `src/components/layout/AdminLayout.jsx`,
`src/pages/admin/AdminDashboard.jsx`.

The reference is Vite + React + Tailwind 3 + Firebase. This app is Next.js +
Tailwind 4. So the port is of the *design system* — colour, type, shadow,
shape, spacing, component anatomy — into this app's tokens and shared
utilities, so every screen inherits it. Its page files are not copied; its
screens (AC Repair, Plumbing bookings) do not exist here.

Where each value now lives in this app is noted as `→`.

## Type

- Family: **Inter**, weights 300–900. `→ --font-sans` (already Inter).
- Page title: `text-2xl font-bold gray-900` + subtitle `text-sm gray-500 mt-1`.
- Section/card title: `text-sm font-bold gray-900`; sub `text-xs gray-400 mt-0.5`.
- Table head: `text-xs font-medium gray-400` — **normal case**, not uppercase.
- Figures: `text-2xl font-bold tracking-tight`.

## Colour

### The two reds — a deliberate split in the reference itself

| Role | Class in reference | Hex | `→` |
|---|---|---|---|
| Buttons / actions / brand | `bg-admin-600` (Button.jsx) | **#E11D48** | `--color-accent` |
| Button hover | `bg-admin-700` | #BE123C | `hover:brightness-90` on accent |
| Secondary button | `bg-admin-50 text-admin-800` | #FFF1F2 / #9F1239 | — |
| Outline button | `border-2 border-admin-500` | #F43F5E | — |
| Sidebar active label | `text-red-700` (AdminLayout) | **#B91C1C** | inline in `shell.tsx` |
| Sidebar active icon | `text-red-600` | #DC2626 | — |
| Sidebar active chevron | `text-red-400` | #F87171 | — |
| Sidebar active fill | `bg-red-50` | #FEF2F2 | `--color-side-active` |
| Logo tile | `bg-red-600` | #DC2626 | — |
| Danger button | `bg-red-600` | #DC2626 | — |

The admin scale (`admin-*`) is Tailwind **rose**; the sidebar uses Tailwind
**red**. Actions are rose, navigation is red.

### Neutrals (Tailwind gray)

| Role | Hex | `→` |
|---|---|---|
| ink / headings | #111827 gray-900 | `--color-ink`, `--color-navy` |
| body / labels | #374151 gray-700 | `--color-ink-2` |
| secondary text | #6B7280 gray-500 | `--color-muted`, `--color-side-text` |
| captions, table heads | #9CA3AF gray-400 | `--color-muted-2`, `--color-side-muted` |
| input border | #E5E7EB gray-200 | `--color-line` |
| card border, dividers | #F3F4F6 gray-100 | `--color-line-soft`, `--color-side-line` |
| page ground, input fill, row hover | #F9FAFB gray-50 | `--color-ground`, `--color-wash`, `--color-side-hover` |
| chip fill | #F3F4F6 gray-100 | `--color-wash-2` |

### KPI tile tints (AdminStatsCard) — Tailwind 50 for the square, 600 for the icon

| | square | icon | `→` |
|---|---|---|---|
| blue | #EFF6FF | #2563EB | `--color-sky` / `-ink` |
| emerald | #ECFDF5 | #059669 | `--color-mint` / `-ink` |
| violet | #F5F3FF | #7C3AED | `--color-violet` / `-ink` |
| amber | #FFFBEB | #D97706 | `--color-amber` / `-ink` |
| red (alarm) | #FEF2F2 | #DC2626 | `--color-rose` / `-ink` |
| teal | #F0FDFA | #0D9488 | `--color-teal` / `-ink` |

### Status badges (Badge.jsx + index.css)

pending amber-50/700/200 · accepted blue · on-the-way purple · started
indigo · completed emerald · cancelled red. Each: `bg-*-50 text-*-700
border-*-200`.

### Chart series (AdminDashboard)

Revenue bars: red-500 for the current month, red-100 for the rest; commission
red-300 / red-50. Category bars: blue-500, sky-500, violet-500, amber-500 on a
`h-2 bg-gray-100 rounded-full` track. Activity icons: `w-8 h-8 rounded-lg`
in blue/violet/amber/emerald/yellow 50-with-600.

## Shape

| | reference | px | `→` |
|---|---|---|---|
| card, table, modal | `rounded-2xl` | 16 | `--radius-md`, `.card`, `.ztable` |
| button (md), input, nav pill, icon tile | `rounded-xl` | 12 | `--radius` (bare `rounded`), `.chipbox` |
| small button, activity icon | `rounded-lg` | 8 | — |
| badge, avatar | `rounded-full` | — | `.zpill` |

**Trap:** this app remaps Tailwind's `rounded-xl` to 22px and `rounded-lg`
to 18px (`--radius-xl`, `--radius-lg`). The reference's `rounded-xl` is 12px.
Write `rounded-[12px]` where the reference says `rounded-xl`.

## Depth (tailwind.config boxShadow, verbatim)

- `soft` — resting cards: `0 2px 15px -3px rgba(0,0,0,.07), 0 10px 20px -2px rgba(0,0,0,.04)` `→ --shadow-card`
- `card` — lifted: `0 0 0 1px rgba(0,0,0,.03), 0 2px 4px rgba(0,0,0,.05), 0 12px 24px rgba(0,0,0,.05)` `→ --shadow-raise`
- `elevated` — modal: `0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)` `→ --shadow-pop`
- `glow-red` — primary button hover: `0 0 20px rgba(244,63,94,.3)`

## Component anatomy

**Card** — `bg-white rounded-2xl border border-gray-100 shadow-soft p-4|p-5`;
interactive: hover `y:-2` + shadow-card, tap `scale .98`. `→ .card`

**KPI card (AdminStatsCard)** — card `p-5`; header row `flex justify-between
mb-4`: tile `w-11 h-11 rounded-xl {tint-50}` with `w-5 h-5 {tint-600}` icon,
optional trend pill `text-xs font-semibold px-2 py-1 rounded-lg
emerald-50/700` (red-50/700 if negative); value `text-2xl font-bold
tracking-tight`; label `text-xs gray-400 mt-1 font-medium`.
`→ dashboard/page.tsx cards, reports/page.tsx Stat`

**Button (admin)** — base `inline-flex items-center justify-center gap-2
font-semibold transition-all duration-200`; sizes sm `px-3 py-1.5 text-sm
rounded-lg`, md `px-5 py-2.5 text-sm rounded-xl`, lg `px-6 py-3.5 text-base
rounded-xl`, xl `px-8 py-4 text-lg rounded-2xl`; primary adds `shadow-lg`.
Tap `scale .97`, hover `scale 1.01`.

**Input** — `w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5
text-base placeholder:gray-400 focus:ring-2 focus:border-gray-900
focus:ring-gray-200`; label `text-sm font-medium gray-700 mb-1.5`; error
`border-red-300 focus:border-red-500 focus:ring-red-200`, message `text-sm
red-500`. **Admin search / table filter:** `pl-10 pr-4 py-2 bg-gray-50 border
gray-200 rounded-xl text-sm focus:ring-2 ring-red-100 border-red-400`.

**Badge** — `inline-flex items-center gap-1.5 font-semibold rounded-full
border`; sm `px-2 py-0.5 text-xs`, md `px-3 py-1 text-xs`, lg `px-4 py-1.5
text-sm`; a `w-1.5 h-1.5 rounded-full bg-current` dot, pulsing when live.
`→ .zpill`

**Table (AdminTable)** — card `rounded-2xl border gray-100 shadow-soft
overflow-hidden`; header `p-5 pb-4 border-b gray-100` with `text-base
font-bold` title, `text-xs gray-400` subtitle, search input at right; thead
row `text-xs gray-400 border-b gray-100 bg-gray-50/50`, `th px-5 py-3.5
font-medium`, sortable heads get a red-500 chevron; tbody `divide-y gray-50`,
rows `hover:bg-gray-50/80`, `td px-5 py-4`; pager `px-5 py-3.5 border-t
gray-100 bg-gray-50/30`, active page `w-8 h-8 rounded-lg bg-red-600 text-white
text-xs font-semibold`; empty state `w-14 h-14 bg-gray-50 rounded-2xl` icon
box + `text-sm gray-400`. `→ .ztable`

**Modal (AdminModal)** — overlay `bg-black/40 backdrop-blur-sm`; panel
`rounded-2xl shadow-elevated`, sizes sm `max-w-md` md `max-w-lg` lg
`max-w-2xl`; header `px-6 py-4 border-b gray-100`, `text-base font-bold`,
close `p-2 rounded-xl hover:bg-gray-100`; body `px-6 py-5 max-h-[60vh]`;
footer `px-6 py-4 border-t gray-100 bg-gray-50/50`, actions right. Enters
`scale .95→1, y 10→0`, spring 400/30. Mobile Modal is a bottom sheet
`rounded-t-3xl` with a `w-10 h-1` drag handle.

**Sidebar (AdminLayout)** — `w-64` (collapsed `w-[72px]`), `bg-white
border-r gray-100`; logo block `px-5 py-5 border-b gray-100`: tile `w-10 h-10
bg-red-600 rounded-xl` + `font-bold text-sm` name + `text-[10px] gray-400`
sub; nav `p-3 space-y-0.5`; item `flex gap-3 px-4 py-2.5 rounded-xl text-sm
font-medium`, icon `18px`; active `bg-red-50 text-red-700`, icon `red-600`,
chevron `w-3.5 h-3.5 red-400`; inactive `gray-500 hover:bg-gray-50
hover:text-gray-700`; collapse row `p-3 border-t`, button `px-4 py-2.5
rounded-xl text-sm gray-400 hover:bg-gray-50`; user block `p-3 border-t`:
avatar `w-9 h-9 bg-red-100 rounded-full` with `text-sm font-bold red-600`
initial, name `text-sm font-medium`, email `text-[10px] gray-400`, logout `p-2
rounded-lg`. `→ shell.tsx`

**Topbar** — `sticky top-0 bg-white/90 backdrop-blur-xl border-b gray-100`,
inner `px-6 lg:px-8 py-3`; title `text-sm font-bold` + `text-[10px] gray-400`;
search `w-64` (admin input above); bell `p-2.5 rounded-xl hover:bg-gray-50`
with `w-2 h-2 bg-red-500` dot; avatar `w-8 h-8 bg-red-100 rounded-full`,
`text-xs font-bold red-600`. `→ shell.tsx`

**Page frame** — `p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto`, sections
`space-y-6`, grids `gap-4`; KPI row `grid sm:grid-cols-2 lg:grid-cols-4`;
charts `lg:grid-cols-3` with the main chart `lg:col-span-2`.

**Motion** — page enter `opacity 0→1, y 8→0, 200ms`; cards `y 20→0` staggered
`index × 50ms`; bars grow from 0 over 500–600ms with stagger; Badge springs
in `scale .9→1`. Utilities `.hover-lift`, `.press-effect`, `.tap-shrink`,
`.card-interactive`, `.glass` (`white/80 + blur 24px`), `.shimmer`.

## What was NOT ported, on purpose

- The green `+12.5%` trend pills on KPI cards: period-over-period deltas the
  API does not send. Inventing growth on a money dashboard is not on. Add a
  real comparison to the backend first.
- The reference's screens and data (bookings, providers, AC Repair). Only
  the system moved; the content is this app's.
