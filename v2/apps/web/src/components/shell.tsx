'use client';

/* ============================================================================
   The application shell — Zoho Books anatomy in the three-color system.

   Solid navy sidebar: the company logo (uploadable in Settings) at top, flat
   nav below, the signed-in user at the bottom. White topbar: global search
   (press / to focus), the red "+ New" quick-create menu, the notification
   bell, settings. Content scrolls under it.
   ========================================================================== */

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, clearToken, getToken, type Bootstrap, type SessionUser } from '@/lib/api';
import { Icon, type IconName } from './icons';
import { homeFor, isFieldTech } from 'shared';
import { ensureNotifyReady, localNotify } from '@/lib/local-notify';
import { initPush, forgetPush } from '@/lib/push';

type NavItem = { href: string; label: string; icon: IconName; roles?: string[] };

/* The Zoho Books idiom: Home on top, everything else in categories that fold.
   One category open at a time; the one holding the current page opens itself. */
const HOME: NavItem = { href: '/dashboard', label: 'Home', icon: 'home' };
// Its own module, right under Home — the admin's to-do list for the team.
const TASKS: NavItem = { href: '/tasks', label: 'Tasks', icon: 'check' };
const SETTINGS: NavItem = { href: '/settings', label: 'Settings', icon: 'settings', roles: ['admin', 'ops'] };
/* What the business runs on and what it costs — the owner's view of the bill.
   Admin only: it is the account and the money, not the day-to-day. */
const CREDENTIALS: NavItem = { href: '/credentials', label: 'Credentials', icon: 'invoice', roles: ['admin'] };

const GROUPS: Array<{ id: string; label: string; items: NavItem[] }> = [
  {
    id: 'sales', label: 'Sales', items: [
      { href: '/leads', label: 'Leads', icon: 'leads', roles: ['admin', 'ops', 'sales'] },
      { href: '/quotations', label: 'Quotations', icon: 'quote', roles: ['admin', 'ops', 'sales'] },
      { href: '/customers', label: 'Customers', icon: 'customers', roles: ['admin', 'ops', 'sales', 'accounts'] },
      { href: '/contracts', label: 'Contracts', icon: 'contract', roles: ['admin', 'ops', 'sales', 'accounts'] },
    ],
  },
  {
    id: 'operations', label: 'Operations', items: [
      { href: '/board', label: 'Dispatch', icon: 'board', roles: ['admin', 'ops', 'sales'] },
      { href: '/schedule', label: 'Schedule', icon: 'calendar', roles: ['admin', 'ops', 'sales'] },
      { href: '/jobs', label: 'Services', icon: 'check', roles: ['admin', 'ops', 'sales'] },
      { href: '/trip', label: 'Trips', icon: 'branch', roles: ['admin', 'ops', 'sales', 'accounts'] },
      { href: '/audits', label: 'Audits', icon: 'service', roles: ['admin', 'ops'] },
    ],
  },
  {
    id: 'finance', label: 'Finance', items: [
      { href: '/invoices', label: 'Invoices', icon: 'invoice', roles: ['admin', 'ops', 'accounts'] },
      { href: '/reports', label: 'Reports', icon: 'report', roles: ['admin', 'ops', 'accounts'] },
      { href: '/wallet', label: 'Collections', icon: 'invoice', roles: ['admin', 'ops', 'accounts'] },
      { href: '/expenses', label: 'Expenses', icon: 'report', roles: ['admin', 'ops', 'sales', 'accounts'] },
    ],
  },
  {
    // What we buy and what we hold. Inventory lives here rather than in master
    // data because stock is no longer something anyone maintains by hand — it
    // is the *result* of purchasing, so it belongs beside the orders that fill it.
    id: 'purchase', label: 'Purchase', items: [
      { href: '/purchase-orders', label: 'Purchase Orders', icon: 'invoice', roles: ['admin', 'ops', 'accounts'] },
      { href: '/vendors', label: 'Vendors', icon: 'customers', roles: ['admin', 'ops', 'accounts'] },
      { href: '/inventory', label: 'Inventory', icon: 'inventory', roles: ['admin', 'ops'] },
    ],
  },
  {
    // The things we define once and refer to everywhere.
    id: 'masterdata', label: 'Master data', items: [
      { href: '/chemicals', label: 'Chemicals', icon: 'inventory', roles: ['admin', 'ops'] },
      { href: '/services', label: 'Service Catalogue', icon: 'service', roles: ['admin', 'ops'] },
      { href: '/branches', label: 'Branches', icon: 'branch', roles: ['admin', 'ops'] },
      { href: '/team', label: 'Team', icon: 'team', roles: ['admin', 'ops'] },
      { href: '/training', label: 'Training', icon: 'team', roles: ['admin', 'ops'] },
    ],
  },
];

/* A technician's sidebar is their field kit — nothing else. Home first: it is
   the one screen that answers "what do I owe and what am I doing" without him
   having to open three others. */
const TECH_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/jobs', label: 'My Services', icon: 'check' },
  { href: '/trip', label: 'Trip', icon: 'branch' },
  { href: '/training', label: 'Training', icon: 'team' },
  { href: '/wallet', label: 'My Wallet', icon: 'invoice' },
  { href: '/expenses', label: 'Expenses', icon: 'report' },
];

const QUICK: Array<{ href: string; label: string; icon: IconName; roles?: string[] }> = [
  { href: '/leads?new=1', label: 'Lead', icon: 'leads', roles: ['admin', 'ops', 'sales'] },
  { href: '/quotations/new', label: 'Quotation', icon: 'quote', roles: ['admin', 'ops', 'sales'] },
  { href: '/customers?new=1', label: 'Customer', icon: 'customers', roles: ['admin', 'ops', 'sales', 'accounts'] },
  { href: '/contracts/new', label: 'Contract', icon: 'contract', roles: ['admin', 'ops'] },
  { href: '/invoices?new=1', label: 'Invoice', icon: 'invoice', roles: ['admin', 'ops', 'accounts'] },
  { href: '/purchase-orders/new', label: 'Purchase order', icon: 'inventory', roles: ['admin', 'ops'] },
];

interface Hit { id: string; title: string; sub: string; href: string }
interface Note { id: number; at: string; text: string; read: boolean }

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [openGroup, setOpenGroup] = useState('');

  // The category holding the page you are on opens itself.
  useEffect(() => {
    const g = GROUPS.find((x) =>
      x.items.some((n) => path === n.href || path.startsWith(n.href + '/')));
    if (g) setOpenGroup(g.id);
  }, [path]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
  }, [router]);

  /* ---------------------------------------------- per-role page visibility
     Overrides set in Settings → User roles: true = shown, false = hidden,
     absent = the role's built-in default. The admin is never restricted. */
  const overrides: Record<string, boolean> =
    (me && me.role !== 'admin' ? boot?.company?.roleAccess?.[me.role] : undefined) || {};
  const allowed = (href: string): boolean | undefined => overrides[href];

  // A hidden page is not just unlisted — navigating to it bounces off.
  useEffect(() => {
    if (!me || me.role === 'admin' || !boot) return;
    const blocked = Object.entries(overrides).some(([href, on]) =>
      on === false && (path === href || path.startsWith(href + '/')));
    if (blocked) {
      const fallback = ['/dashboard', '/tasks', '/jobs', '/trip', '/wallet']
        .find((h) => overrides[h] !== false) || '/dashboard';
      router.replace(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, me, boot]);

  /* --------------------------------------------------------- global search */
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Record<string, Hit[]> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => {
      api.get<Record<string, Hit[]>>('/search?q=' + encodeURIComponent(q))
        .then((r) => { setHits(r); setSearchOpen(true); })
        .catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') { setSearchOpen(false); setMenuOpen(false); setBellOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((href: string) => {
    setSearchOpen(false); setQ('');
    router.push(href);
  }, [router]);

  /* ------------------------------------------------------------- dropdowns */
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<{ rows: Note[]; unread: number }>({ rows: [], unread: 0 });

  // The bell polls — 20 s keeps "real-time" honest without hammering the API.
  // Inside the app shell, a NEW row also raises an Android banner with sound.
  const lastNoteId = useRef(-1);
  useEffect(() => {
    if (!getToken()) return;
    void ensureNotifyReady();
    initPush((p) => router.push(p));
    const pull = () => api.get<{ rows: Note[]; unread: number }>('/notifications').then((n) => {
      setNotes(n);
      const top = n.rows.reduce((a, r) => Math.max(a, r.id), 0);
      if (lastNoteId.current >= 0) {
        n.rows
          .filter((r) => r.id > lastNoteId.current && !r.read)
          .forEach((r) => localNotify(r.id, 'PestOps', r.text));
      }
      lastNoteId.current = Math.max(lastNoteId.current, top);
    }).catch(() => {});
    pull();
    const iv = setInterval(pull, 20000);
    return () => clearInterval(iv);
  }, [path]);

  async function openBell() {
    setBellOpen((v) => !v); setMenuOpen(false);
    if (!bellOpen && notes.unread) {
      await api.post('/notifications/read-all', {}).catch(() => {});
      setNotes((n) => ({ rows: n.rows.map((r) => ({ ...r, read: true })), unread: 0 }));
    }
  }

  const co = boot?.company;
  const hitGroups = hits ? Object.entries(hits).filter(([, v]) => v.length) : [];

  return (
    <div className="flex h-screen overflow-hidden"
      onClick={() => { setMenuOpen(false); setBellOpen(false); setSearchOpen(false); }}>

      {/* -------------------------------------------------------- sidebar
          Desktop only. On a phone the app chrome takes over: an app bar on
          top and the bottom navigation — no sidebar at all. */}
      <aside onClick={(e) => e.stopPropagation()}
        className="w-[224px] shrink-0 bg-white border-r border-line hidden lg:flex flex-col z-50">
        <Link href={homeFor(me?.role)}
          className="flex items-center gap-3 px-4 h-[58px] border-b border-side-line">
          {co?.logo ? (
            <span className="w-9 h-9 rounded bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={co.logo} alt="" className="max-w-full max-h-full object-contain" />
            </span>
          ) : (
            <span className="w-9 h-9 rounded bg-accent text-white flex items-center justify-center font-bold text-[15px]">
              {(co?.name || 'P').charAt(0)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-ink font-semibold text-[13.5px] leading-tight truncate">
              {co?.name || 'PestOps'}
            </span>
            <span className="block text-side-muted text-[10.5px] truncate">
              {co?.city || 'Operations'}
            </span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto py-2">
          {(() => {
            const visible = (n: NavItem) => allowed(n.href)
              ?? (!n.roles || !me || n.roles.includes(me.role));
            const isActive = (n: NavItem) => path === n.href || path.startsWith(n.href + '/');
            const item = (n: NavItem, indent = false) => {
              const active = isActive(n);
              return (
                <Link key={n.href} href={n.href}
                  className={
                    'relative flex items-center gap-3 h-9 text-[13px] transition-colors ' +
                    (indent ? 'pl-7 pr-4 ' : 'px-4 ') +
                    (active
                      ? 'bg-side-active text-accent font-semibold'
                      : 'text-side-text hover:bg-side-hover hover:text-ink')
                  }>
                  {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent" />}
                  <Icon name={n.icon} size={16} className={active ? '' : 'opacity-75'} />
                  {n.label}
                </Link>
              );
            };

            if (isFieldTech(me?.role)) {
              return <>{[TECH_NAV[0], TASKS, ...TECH_NAV.slice(1)].filter(visible).map((n) => item(n))}</>;
            }

            return (
              <>
                {visible(HOME) && item(HOME)}
                {visible(TASKS) && item(TASKS)}
                {GROUPS.map((g) => {
                  const items = g.items.filter(visible);
                  if (!items.length) return null;
                  const open = openGroup === g.id;
                  const holdsActive = items.some(isActive);
                  return (
                    <div key={g.id}>
                      <button
                        onClick={() => setOpenGroup(open ? '' : g.id)}
                        className="w-full flex items-center gap-2 px-4 h-8 mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-side-muted hover:text-ink transition-colors">
                        <span className={'transition-transform duration-300 ' + (open ? 'rotate-90' : '')}>
                          <Icon name="chevRight" size={11} />
                        </span>
                        {g.label}
                        {holdsActive && !open && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        )}
                      </button>
                      <div
                        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
                        <div className="overflow-hidden min-h-0">
                          {items.map((n) => item(n, true))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-1.5 border-t border-side-line pt-1.5">
                  {visible(SETTINGS) && item(SETTINGS)}
                  {visible(CREDENTIALS) && item(CREDENTIALS)}
                </div>
              </>
            );
          })()}
        </nav>

        {me && (
          <div className="border-t border-side-line px-4 py-3 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
              style={{ background: me.color || '#FF0000' }}>
              {me.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-ink text-[12.5px] font-medium truncate">{me.name}</span>
              <span className="block text-side-muted text-[10.5px] capitalize">{me.role}</span>
            </span>
            <button title="Sign out" className="text-side-muted hover:text-accent"
              onClick={() => { forgetPush(); clearToken(); router.replace('/login'); }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------- main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[48px] shrink-0 bg-white border-b border-line flex items-center gap-3 px-4 relative z-30">
          {/* the phone app bar identity — desktop has the sidebar for this */}
          <Link href={homeFor(me?.role)} className="lg:hidden flex items-center gap-2 min-w-0 shrink-0">
            {co?.logo ? (
              <span className="w-8 h-8 rounded bg-white border border-line flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={co.logo} alt="" className="max-w-full max-h-full object-contain" />
              </span>
            ) : (
              <span className="w-8 h-8 rounded bg-accent text-white flex items-center justify-center font-bold text-[14px]">
                {(co?.name || 'P').charAt(0)}
              </span>
            )}
            <span className="text-[14px] font-bold text-navy truncate max-w-[140px]">
              {co?.name || 'PestOps'}
            </span>
          </Link>
          {/* ------------------------------------------------ search */}
          <div className="relative flex-1 max-w-[460px] max-lg:hidden" onClick={(e) => e.stopPropagation()}>
            <label className="flex items-center gap-2 h-8 px-3 rounded border border-line bg-wash focus-within:bg-white focus-within:border-navy/40">
              <Icon name="search" size={15} className="text-muted-2" />
              <input ref={searchRef} value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => hits && setSearchOpen(true)}
                placeholder="Search customers, contracts, invoices…  ( / )"
                className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-2" />
              {q && (
                <button onClick={() => { setQ(''); setHits(null); }} className="text-muted-2 hover:text-ink">
                  <Icon name="x" size={13} />
                </button>
              )}
            </label>

            {searchOpen && hits && (
              <div className="absolute top-9 left-0 right-0 rounded-md border border-line bg-white shadow-pop max-h-[420px] overflow-y-auto">
                {hitGroups.length === 0 ? (
                  <p className="p-4 text-muted text-[13px]">Nothing matches “{q}”.</p>
                ) : hitGroups.map(([group, rows]) => (
                  <div key={group}>
                    <p className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
                      {group}
                    </p>
                    {rows.map((h) => (
                      <button key={group + h.id} onClick={() => go(h.href)}
                        className="w-full text-left px-3 py-2 hover:bg-wash flex items-baseline gap-2">
                        <span className="text-[13px] font-medium text-navy">{h.title}</span>
                        <span className="text-[11.5px] text-muted truncate">{h.sub}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* ------------------------------------------------ + New */}
          {/* nothing in the quick menu for this role → no button at all */}
          <div className="relative"
            hidden={!QUICK.some((n) => !n.roles || !me || n.roles.includes(me.role))}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={15} /> New
              <Icon name="chevDown" size={13} className="opacity-80" />
            </button>
            {menuOpen && (
              <div className="absolute top-9 right-0 w-[190px] rounded-md border border-line bg-white shadow-pop py-1">
                {QUICK.filter((n) => !n.roles || !me || n.roles.includes(me.role)).map((n) => (
                  <button key={n.href}
                    onClick={() => { setMenuOpen(false); router.push(n.href); }}
                    className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-ink-2 hover:bg-wash text-left">
                    <Icon name={n.icon} size={15} className="text-muted" /> {n.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------------------------------ bell */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={openBell}
              className="w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-wash relative">
              <Icon name="bell" size={17} />
              {notes.unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
                  {notes.unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute top-9 right-0 w-[320px] rounded-md border border-line bg-white shadow-pop max-h-[400px] overflow-y-auto">
                <p className="px-3.5 pt-3 pb-2 text-[12px] font-semibold border-b border-line-soft">
                  Notifications
                </p>
                {notes.rows.length === 0 ? (
                  <p className="p-4 text-muted text-[12.5px]">Nothing yet — assignments and approvals land here.</p>
                ) : notes.rows.map((n) => (
                  <div key={n.id} className="px-3.5 py-2.5 border-b border-line-soft last:border-0">
                    <p className="text-[12.5px] text-ink-2 leading-snug">{n.text}</p>
                    <p className="text-[10.5px] text-muted-2 mt-0.5">{n.at}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link href="/settings"
            className="w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-wash">
            <Icon name="settings" size={17} />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto bg-white max-lg:pb-20">{children}</main>

        {/* ---------------------------------------------- bottom navigation
            The phone's way around the app — replaces the sidebar entirely. */}
        {me && (() => {
          const visibleAll = [HOME, TASKS, ...GROUPS.flatMap((g) => g.items), SETTINGS, CREDENTIALS]
            .filter((n) => allowed(n.href) ?? (!n.roles || n.roles.includes(me.role)));
          const primary = isFieldTech(me.role)
            ? TECH_NAV.filter((n) => allowed(n.href) !== false)
            : visibleAll
                .filter((n) => ['/dashboard', '/leads', '/contracts', '/jobs'].includes(n.href))
                .slice(0, 4);
          const rest = visibleAll.filter((n) => !primary.some((x) => x.href === n.href));
          const moreActive = rest.some((n) => path === n.href || path.startsWith(n.href + '/'));
          return (
            <>
              <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line
                flex items-stretch pb-[env(safe-area-inset-bottom)]">
                {primary.map((n) => {
                  const active = path === n.href || path.startsWith(n.href + '/');
                  return (
                    <Link key={n.href} href={n.href}
                      className={'relative flex-1 flex flex-col items-center justify-center gap-0.5 h-[60px] ' +
                        (active ? 'text-navy' : 'text-muted')}>
                      {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b bg-accent" />}
                      <Icon name={n.icon} size={20} className={active ? '' : 'opacity-70'} />
                      <span className={'text-[10px] leading-none ' + (active ? 'font-bold' : 'font-medium')}>
                        {n.label.replace('My ', '')}
                      </span>
                    </Link>
                  );
                })}
                <button onClick={(e) => { e.stopPropagation(); setMoreOpen(true); }}
                  className={'relative flex-1 flex flex-col items-center justify-center gap-0.5 h-[60px] ' +
                    (moreActive ? 'text-navy' : 'text-muted')}>
                  {moreActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b bg-accent" />}
                  <Icon name="board" size={20} className={moreActive ? '' : 'opacity-70'} />
                  <span className={'text-[10px] leading-none ' + (moreActive ? 'font-bold' : 'font-medium')}>More</span>
                </button>
              </nav>

              {/* the More drawer: every remaining section + who I am + Log out */}
              {moreOpen && (
                <div className="lg:hidden fixed inset-0 z-50 bg-navy/50 flex items-end"
                  onClick={() => setMoreOpen(false)}>
                  <div className="w-full bg-white rounded-t-2xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4" />
                    {rest.length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mb-4">
                        {rest.map((n) => {
                          const active = path === n.href || path.startsWith(n.href + '/');
                          return (
                            <button key={n.href}
                              onClick={() => { setMoreOpen(false); router.push(n.href); }}
                              className="flex flex-col items-center gap-1.5 py-3 rounded-lg hover:bg-wash">
                              <span className={'w-11 h-11 rounded-full flex items-center justify-center ' +
                                (active ? 'bg-navy text-white' : 'bg-wash text-navy')}>
                                <Icon name={n.icon} size={19} />
                              </span>
                              <span className={'text-[10.5px] leading-tight text-center ' +
                                (active ? 'font-bold text-navy' : 'text-ink-2')}>
                                {n.label.replace('My ', '')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-3 border-t border-line-soft pt-3">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ background: me.color || '#FF0000' }}>
                        {me.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold truncate">{me.name}</span>
                        <span className="block text-[11px] text-muted capitalize">{me.role.replace('_', ' ')}</span>
                      </span>
                      <button onClick={() => { forgetPush(); clearToken(); router.replace('/login'); }}
                        className="h-9 px-4 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90 shrink-0">
                        Log out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
