'use client';

/* ============================================================================
   The dispatch board — technicians down the side, the day across the top,
   work as bars you pick up and drop.

   Ported from v1 board.js. The geometry is one idea: the day is a span of
   minutes and every bar is a fraction of it, drawn as a percentage so the
   whole day fits the viewport with nothing hidden off to the right (the v1
   'fit' mode). Dragging is pointer events, not browser drag-and-drop, so a
   finger, a mouse and a stylus all run the same code; a gesture only becomes
   a drag once it travels 4px, so a tap stays a tap.

   All the maths lives server-side (shared dispatch engine) — the board asks
   /dispatch/check while a bar hovers a lane and paints the warnings live.
   ========================================================================== */

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { addDays, dayOfWeek, parseISO, toHHMM, toISO, toMin } from 'shared';

/* ------------------------------------------------------------- constants */

const RAIL = 190;                 // px — the technician rail (v1 board.js:20)
const SNAP = 15;                  // minutes — the drag grain (v1 store.js:514)
const DAY_FROM = 0;               // midnight — the board shows the full 24 hours
const DAY_TO = 24 * 60;           // midnight next day

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** '14:00' -> '2:00 PM'; end = start + booked minutes. */
function t12(hhmm: string): string {
  const [h, mi] = String(hhmm || '').split(':').map(Number);
  if (isNaN(h)) return '—';
  return (h % 12 || 12) + ':' + String(mi || 0).padStart(2, '0') + (h < 12 ? ' AM' : ' PM');
}
function endT12(hhmm: string, mins: number): string {
  const [h, mi] = String(hhmm || '').split(':').map(Number);
  const m = (isNaN(h) ? 600 : h * 60 + (mi || 0)) + Math.max(30, mins || 60);
  return t12(String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
}

/* ----------------------------------------------------------------- types */

interface Gap { from: number; to: number }
interface DayTech {
  id: string; name: string; color: string; title: string;
  skills: string[]; branches: string[];
  hours: { from: string; to: string; days: number[] };
  off: boolean; booked: number; avail: number; pct: number; over: boolean;
  gaps: Gap[];
}
interface DayGroup { branchId: string; branchName: string; techs: DayTech[] }
interface DayJob {
  id: string; clientId: string; clientName: string; addr: string; city: string;
  serviceIds: string[]; serviceNames: string[];
  date: string; slot: string; mins: number; techIds: string[];
  crewNeed: number; status: string; priority: string; pinned: boolean;
  branchId: string; branchName: string;
}
interface WeekDay { date: string; jobs: number; unassigned: number }
interface DayPayload {
  date: string;
  company: { hoursFrom: string; hoursTo: string; hoursDays: number[] };
  branches: Array<{ id: string; name: string }>;
  groups: DayGroup[];
  jobs: DayJob[];
  queue: DayJob[];
  week: WeekDay[];
}
interface Warning { level: 'block' | 'warn'; text: string }
interface Before { date: string; slot: string; techIds: string[]; pinned: boolean }
interface UndoStep { label: string; entries: Array<{ jobId: string; before: Before }> }
interface SuggestRow {
  tech: { id: string; name: string; color: string };
  score: number; at: number | null;
  why: Array<{ good: boolean; text: string }>;
  bookedPct: number;
}
interface PlacedEntry { jobId: string; techIds: string[]; startMin: number; before: Before }
interface ToastState { msg: string; sub?: string; tone?: 'warn'; undo?: boolean }

interface DragState {
  job: DayJob; mode: 'move' | 'queue'; src: HTMLElement;
  grab: number; x0: number; y0: number; moved: boolean;
  ghost: HTMLElement | null; lane: HTMLElement | null; markedLane: HTMLElement | null;
  tech: string | null; start: number | null;
  warns: Warning[]; toQueue: boolean;
  checkKey: string; checkSeq: number;
  lastX: number; lastY: number;
}

/* --------------------------------------------------------------- helpers */

/** "14:30" -> "2:30 PM", exactly as v1 printed it. */
function fmtTime(hhmm: string): string {
  if (!hhmm) return '—';
  const t = String(hhmm).slice(-5);
  let h = parseInt(t.split(':')[0], 10);
  const m = t.split(':')[1];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}

/** Midnight is the end of this day, not a minute short of it. */
const clockAt = (m: number) => (m >= 24 * 60 ? '12:00 AM' : fmtTime(toHHMM(m)));

function durationText(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

function fmtLong(iso: string): string {
  const d = parseISO(iso);
  return DOWL[d.getDay()] + ', ' + d.getDate() + ' ' + MONL[d.getMonth()] + ' ' + d.getFullYear();
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const errMsg = (e: unknown) => (e instanceof Error && e.message) || 'Something went wrong';

/* The drag tooltip is imperative — it follows the pointer at 60fps and React
   has no business re-rendering for it. */
let tipEl: HTMLDivElement | null = null;
function tipShow(html: string, x: number, y: number, tone: 'ok' | 'warn' | 'bad') {
  if (typeof document === 'undefined') return;
  if (!tipEl || !tipEl.isConnected) {
    tipEl = document.createElement('div');
    document.body.appendChild(tipEl);
  }
  const bg = tone === 'bad' ? '#FF0000' : '#1B2E65';
  const border = tone === 'warn' ? '1px solid #FF0000' : '1px solid transparent';
  tipEl.style.cssText =
    'position:fixed;z-index:96;max-width:290px;padding:8px 11px;border-radius:6px;' +
    'font-size:12px;line-height:1.35;color:#fff;pointer-events:none;' +
    'box-shadow:0 6px 24px rgba(27,46,101,.25);' +
    `background:${bg};border:${border};` +
    `left:${Math.min(x + 14, window.innerWidth - 300)}px;top:${y + 16}px;`;
  tipEl.innerHTML = html;
}
function tipHide() { if (tipEl) { tipEl.remove(); tipEl = null; } }

/* Small line glyphs the shared icon set does not carry (lock, alert, pin…). */
const GLYPHS = {
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 9.5V14M12 16.8h.01" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />,
  shuffle: <><path d="M16 4h4v4" /><path d="M4 20 20 4" /><path d="M20 16v4h-4" /><path d="m14.5 14.5 5.5 5.5" /><path d="M4 4l5 5" /></>,
  pin: <><path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 0 1 13 0c0 4.6-6.5 10-6.5 10z" /><circle cx="12" cy="11" r="2.2" /></>,
} as const;

function Glyph({ name, size = 12, className = '' }: {
  name: keyof typeof GLYPHS; size?: number; className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[name]}
    </svg>
  );
}

function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span className="rounded-full text-white font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: color || '#1B2E65' }}>
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </span>
  );
}

/* ================================================================== page */

export default function Board() {
  const router = useRouter();

  const [date, setDate] = useState<string>(() => toISO(new Date()));
  const [data, setData] = useState<DayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<{ status: string; prio: boolean }>({ status: '', prio: false });
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pop, setPop] = useState<{ jobId: string; anchor: { top: number; bottom: number; left: number } } | null>(null);
  const [sug, setSug] = useState<{ job: DayJob; rows: SuggestRow[] | null } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [acting, setActing] = useState(false);
  const [nowMin, setNowMin] = useState<number>(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });

  const dataRef = useRef<DayPayload | null>(null);
  const dateRef = useRef(date);
  const selRef = useRef<string | null>(null);
  const spanRef = useRef({ from: DAY_FROM, to: DAY_TO, mins: DAY_TO - DAY_FROM });
  const techsFlatRef = useRef<DayTech[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const undoRef = useRef<UndoStep[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const queueWrapRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<{
    move: (e: PointerEvent) => void; up: () => void; key: (e: KeyboardEvent) => void;
  }>({ move: () => {}, up: () => {}, key: () => {} });

  /* ------------------------------------------------------------- loading */

  const showToast = useCallback((msg: string, opts: Omit<ToastState, 'msg'> = {}) => {
    setToast({ msg, ...opts });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const p = await api.get<DayPayload>('/dispatch/day?date=' + dateRef.current);
      if (p.date === dateRef.current) setData(p);
    } catch {
      showToast('Could not load the board', { tone: 'warn' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { dateRef.current = date; refresh(); }, [date, refresh]);
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(t);
  }, []);

  /* ------------------------------------------------------------ geometry */

  // The window the board draws stretches to hold anything booked outside the
  // working day — a 22:00 warehouse job has to be visible (v1 board.js:38-53).
  const span = useMemo(() => {
    let lo = DAY_FROM, hi = DAY_TO;
    for (const j of data?.jobs || []) {
      const a = toMin(j.slot);
      lo = Math.min(lo, a);
      hi = Math.max(hi, Math.min(24 * 60, a + (j.mins || 60)));
    }
    const from = Math.floor(lo / 60) * 60;
    const to = Math.ceil(hi / 60) * 60;
    return { from, to, mins: Math.max(60, to - from) };
  }, [data]);

  const at = (m: number) => ((m - span.from) / span.mins) * 100 + '%';
  const len = (m: number) => (m / span.mins) * 100 + '%';

  const hours = useMemo(() => {
    const step = span.mins > 12 * 60 ? 120 : 60;   // fewer labels or they collide
    const out: number[] = [];
    for (let m = span.from; m <= span.to; m += step) out.push(m);
    return out;
  }, [span]);

  /* ------------------------------------------------------------- derived */

  const allTechs = useMemo(() => (data ? data.groups.flatMap((g) => g.techs) : []), [data]);
  const filteredTechs = useMemo(
    () => (branchFilter ? allTechs.filter((t) => t.branches.includes(branchFilter)) : allTechs),
    [allTechs, branchFilter],
  );

  // Grouped in branch order, first branch wins a shared tech, leftovers under
  // a pseudo 'No branch' band (v1 board.js:92-102).
  const viewGroups = useMemo(() => {
    if (!data) return [] as DayGroup[];
    const seen = new Set<string>();
    const gs: DayGroup[] = [];
    for (const b of data.branches) {
      const techs = filteredTechs.filter((t) => t.branches.includes(b.id) && !seen.has(t.id));
      techs.forEach((t) => seen.add(t.id));
      if (techs.length) gs.push({ branchId: b.id, branchName: b.name, techs });
    }
    const rest = filteredTechs.filter((t) => !seen.has(t.id));
    if (rest.length) gs.push({ branchId: '_none', branchName: 'No branch', techs: rest });
    return gs;
  }, [data, filteredTechs]);

  const forTech = useCallback(
    (id: string) => (data?.jobs || []).filter((j) => j.techIds.includes(id)),
    [data],
  );

  /** The filter chips only fade bars; they never change what is there. */
  const passes = useCallback((j: DayJob) => {
    if (filter.prio && j.priority !== 'high' && j.priority !== 'urgent') return false;
    if (filter.status === 'open' && j.status === 'completed') return false;
    if (filter.status === 'live' && j.status !== 'inprogress' && j.status !== 'enroute') return false;
    return true;
  }, [filter]);

  const stats = useMemo(() => {
    const all = data?.jobs || [];
    const assigned = all.filter((j) => j.techIds.length).length;
    const queueN = (data?.queue || []).length;
    let bookedAll = 0, availAll = 0, overAny = 0, busy = 0;
    for (const t of filteredTechs) {
      bookedAll += t.booked;
      if (!t.off) availAll += t.avail;   // off-day techs never count as capacity
      if (t.over) overAny++;
      if (all.some((j) => j.techIds.includes(t.id))) busy++;
    }
    const util = availAll ? Math.round((bookedAll / availAll) * 100) : 0;
    return { all: all.length, assigned, queueN, busy, people: filteredTechs.length, util, overAny };
  }, [data, filteredTechs]);

  const queueShown = useMemo(() => {
    const list = data?.queue || [];
    const k = q.trim().toLowerCase();
    if (!k) return list;
    return list.filter((j) =>
      (j.id + ' ' + j.clientName + ' ' + j.serviceNames.join(' ') + ' ' + j.branchName + ' ' + j.city)
        .toLowerCase().includes(k));
  }, [data, q]);

  const techName = useCallback((id: string) => {
    const t = dataRef.current?.groups.flatMap((g) => g.techs).find((x) => x.id === id);
    return t ? t.name : id;
  }, []);

  const today = toISO(new Date());
  const showNow = date === today && nowMin >= span.from && nowMin <= span.to;

  /* ----------------------------------------------------------- undo memory */

  const pushUndo = useCallback((label: string, entries: UndoStep['entries']) => {
    if (!entries.length) return;
    undoRef.current.push({ label, entries });
    if (undoRef.current.length > 20) undoRef.current.shift();
  }, []);

  const undoLast = useCallback(async () => {
    const step = undoRef.current.pop();
    if (!step) { showToast('Nothing left to undo'); return; }
    try {
      await api.post('/dispatch/restore', { entries: step.entries });
      showToast('Undone', { sub: step.label });
      refresh();
    } catch (e) { showToast(errMsg(e), { tone: 'warn' }); }
  }, [refresh, showToast]);

  /* ------------------------------------------------------------- actions */

  async function doPlace(
    jobId: string, techIds: string[] | null, startMin: number,
    opts: { label: string; toastMsg?: string; sub?: string; tone?: 'warn' },
  ) {
    try {
      const r = await api.post<{ before: Before }>('/dispatch/place', {
        jobId, techIds, date: dateRef.current, startMin,
      });
      pushUndo(opts.label, [{ jobId, before: r.before }]);
      if (opts.toastMsg) showToast(opts.toastMsg, { sub: opts.sub, tone: opts.tone, undo: true });
      refresh();
    } catch (e) { showToast(errMsg(e), { tone: 'warn' }); }
  }

  async function doUnassign(jobId: string) {
    try {
      const r = await api.post<{ before: Before }>('/dispatch/unassign', { jobId });
      pushUndo(jobId + ' unassigned', [{ jobId, before: r.before }]);
      setSel(null);
      showToast(jobId + ' is back in the queue', { tone: 'warn', undo: true });
      refresh();
    } catch (e) { showToast(errMsg(e), { tone: 'warn' }); }
  }

  async function runAuto() {
    if (!dataRef.current?.queue.length) { showToast('Nothing is waiting on this day'); return; }
    setActing(true);
    try {
      const r = await api.post<{ placed: PlacedEntry[]; skipped: Array<{ jobId: string; reason: string }> }>(
        '/dispatch/auto', { date: dateRef.current });
      pushUndo(
        'Auto-assigned ' + r.placed.length + ' job' + (r.placed.length === 1 ? '' : 's'),
        r.placed.map((p) => ({ jobId: p.jobId, before: p.before })),
      );
      showToast(
        r.placed.length + ' placed' + (r.skipped.length ? ' · ' + r.skipped.length + ' could not be' : ''),
        {
          tone: r.skipped.length ? 'warn' : undefined,
          sub: r.skipped.length
            ? 'Nobody free and qualified for ' + r.skipped.map((x) => x.jobId).slice(0, 3).join(', ')
            : 'Matched on branch, skill, how full the day is, and the gaps in it',
          undo: r.placed.length > 0,
        },
      );
      refresh();
    } catch (e) { showToast(errMsg(e), { tone: 'warn' }); }
    finally { setActing(false); }
  }

  async function runBalance() {
    setActing(true);
    try {
      const r = await api.post<{ moved: PlacedEntry[] }>('/dispatch/balance', { date: dateRef.current });
      if (!r.moved.length) {
        showToast('Nothing to even out', { sub: 'Nobody is over their hours with somewhere to move work to' });
        return;
      }
      pushUndo(
        'Moved ' + r.moved.length + ' job' + (r.moved.length === 1 ? '' : 's'),
        r.moved.map((p) => ({ jobId: p.jobId, before: p.before })),
      );
      showToast(r.moved.length + ' job' + (r.moved.length === 1 ? '' : 's') + ' moved', {
        sub: 'Taken off the fullest days and given to whoever had room', undo: true,
      });
      refresh();
    } catch (e) { showToast(errMsg(e), { tone: 'warn' }); }
    finally { setActing(false); }
  }

  async function openSuggest(jobId: string) {
    const j = dataRef.current?.jobs.find((x) => x.id === jobId);
    if (!j) return;
    setPop(null);
    setSug({ job: j, rows: null });
    try {
      const rows = await api.get<SuggestRow[]>(
        `/dispatch/suggest?jobId=${encodeURIComponent(jobId)}&date=${dateRef.current}&limit=6`);
      setSug((s) => (s && s.job.id === jobId ? { ...s, rows } : s));
    } catch (e) { setSug(null); showToast(errMsg(e), { tone: 'warn' }); }
  }

  function takeSuggest(job: DayJob, r: SuggestRow) {
    if (r.at == null) { showToast('No gap long enough on that day', { tone: 'warn' }); return; }
    setSug(null);
    doPlace(job.id, [r.tech.id], r.at, {
      label: job.id + ' to ' + r.tech.name,
      toastMsg: job.id + ' → ' + r.tech.name,
      sub: fmtTime(toHHMM(r.at)),
    });
  }

  /* ------------------------------------------------------------- the drag */

  function laneUnder(x: number, y: number): HTMLElement | null {
    // Walked explicitly rather than by elementFromPoint, because the ghost
    // sits under the pointer and would answer every time.
    const grid = gridRef.current;
    if (!grid) return null;
    for (const lane of Array.from(grid.querySelectorAll<HTMLElement>('[data-lane]'))) {
      const r = lane.getBoundingClientRect();
      if (y >= r.top && y < r.bottom && x >= r.left && x < r.right) return lane;
    }
    return null;
  }

  /** Pixels per minute as the lane is actually drawn. */
  function minuteAt(lane: HTMLElement, clientX: number, grabOffset: number): number {
    const s = spanRef.current;
    const r = lane.getBoundingClientRect();
    const scale = r.width / s.mins;
    const raw = (clientX - r.left - grabOffset) / scale + s.from;
    const snapped = Math.round(raw / SNAP) * SNAP;
    return Math.max(s.from, Math.min(s.to - 15, snapped));
  }

  function lift(d: DragState) {
    const r = d.src.getBoundingClientRect();
    const g = d.src.cloneNode(true) as HTMLElement;
    let width = r.width;
    if (d.mode === 'queue') {
      const anyLane = gridRef.current?.querySelector<HTMLElement>('[data-lane]');
      if (anyLane) {
        const scale = anyLane.getBoundingClientRect().width / spanRef.current.mins;
        width = Math.max(90, (d.job.mins || 60) * scale);
      }
    }
    g.style.cssText +=
      ';position:fixed;left:0;top:0;margin:0;z-index:94;opacity:.92;pointer-events:none;' +
      `width:${width}px;height:${r.height}px;box-shadow:0 6px 24px rgba(27,46,101,.3);`;
    g.style.transform = `translate(${d.x0 - d.grab}px, ${d.y0 - 16}px)`;
    document.body.appendChild(g);
    d.ghost = g;
    d.src.style.opacity = '0.35';
    document.body.style.cursor = 'grabbing';
    setPop(null);
  }

  function paintDrag(d: DragState) {
    if (!d.lane || d.start == null || !d.tech) return;
    const blocked = d.warns.some((w) => w.level === 'block');
    d.markedLane = d.lane;
    d.lane.style.backgroundColor = blocked ? 'rgba(255,0,0,0.07)' : 'rgba(27,46,101,0.06)';
    const stop = toHHMM(d.start + (d.job.mins || 60));
    const html =
      `<div style="font-weight:600">${esc(fmtTime(toHHMM(d.start)))} – ${esc(fmtTime(stop))}</div>` +
      `<div style="opacity:.75">${esc(techName(d.tech))}</div>` +
      d.warns.map((w) =>
        `<div style="margin-top:3px;${w.level === 'block' ? 'font-weight:600' : 'opacity:.9'}">` +
        `${w.level === 'block' ? '× ' : '· '}${esc(w.text)}</div>`).join('');
    tipShow(html, d.lastX, d.lastY, blocked ? 'bad' : d.warns.length ? 'warn' : 'ok');
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea')) return;   // buttons stay buttons
    const barEl = t.closest('[data-job]') as HTMLElement | null;
    const queueEl = barEl ? null : (t.closest('[data-queue]') as HTMLElement | null);
    const el = barEl || queueEl;
    const d0 = dataRef.current;
    if (!el || !d0) return;
    const id = el.getAttribute(barEl ? 'data-job' : 'data-queue') || '';
    const j = d0.jobs.find((x) => x.id === id);
    if (!j) return;
    if (j.status === 'completed' || j.status === 'inprogress') {
      showToast('That service is already under way', { tone: 'warn', sub: 'Completed and in-progress work stays put' });
      return;
    }
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* older engine */ }
    const r = el.getBoundingClientRect();
    dragRef.current = {
      job: j, mode: barEl ? 'move' : 'queue', src: el,
      grab: e.clientX - r.left, x0: e.clientX, y0: e.clientY, moved: false,
      ghost: null, lane: null, markedLane: null, tech: null, start: null,
      warns: [], toQueue: false, checkKey: '', checkSeq: 0,
      lastX: e.clientX, lastY: e.clientY,
    };
  }

  function dragMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    d.lastX = e.clientX; d.lastY = e.clientY;

    // The gesture only becomes a drag once it travels; a tap stays a tap.
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
      d.moved = true;
      lift(d);
    }
    if (d.ghost) d.ghost.style.transform = `translate(${e.clientX - d.grab}px, ${e.clientY - 16}px)`;

    if (d.markedLane) { d.markedLane.style.backgroundColor = ''; d.markedLane = null; }
    const qw = queueWrapRef.current;
    if (qw) qw.style.boxShadow = '';

    // Back to the queue means "take everybody off this job".
    if (d.mode === 'move' && qw) {
      const r = qw.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        d.toQueue = true; d.lane = null; d.start = null; d.tech = null;
        qw.style.boxShadow = 'inset 0 0 0 2px #FF0000';
        tipShow(
          `<div style="font-weight:600">Unassign ${esc(d.job.id)}</div>` +
          '<div style="opacity:.75">It goes back to the waiting list</div>',
          e.clientX, e.clientY, 'warn');
        return;
      }
    }
    d.toQueue = false;

    const lane = laneUnder(e.clientX, e.clientY);
    d.lane = lane;
    if (!lane) { d.start = null; d.tech = null; tipHide(); return; }

    const techId = lane.getAttribute('data-lane') || '';
    const start = minuteAt(lane, e.clientX, d.mode === 'move' ? d.grab : 0);
    d.start = start;
    d.tech = techId;

    // Ask the server about THIS cell once; stale answers are dropped.
    const key = techId + ':' + start;
    if (key !== d.checkKey) {
      d.checkKey = key;
      d.warns = [];
      const seq = ++d.checkSeq;
      api.post<Warning[]>('/dispatch/check', {
        jobId: d.job.id, techId, startMin: start, date: dateRef.current,
      }).then((ws) => {
        const cur = dragRef.current;
        if (!cur || cur.checkSeq !== seq || !cur.moved) return;
        cur.warns = ws;
        paintDrag(cur);
      }).catch(() => {});
    }
    paintDrag(d);
  }

  function dragEnd() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.ghost) d.ghost.remove();
    d.src.style.opacity = '';
    document.body.style.cursor = '';
    if (d.markedLane) d.markedLane.style.backgroundColor = '';
    if (queueWrapRef.current) queueWrapRef.current.style.boxShadow = '';
    tipHide();

    // A tap, not a drag — show what the bar is instead of moving it.
    if (!d.moved) {
      if (d.mode === 'move') {
        setSel(d.job.id);
        const r = d.src.getBoundingClientRect();
        setPop({ jobId: d.job.id, anchor: { top: r.top, bottom: r.bottom, left: r.left } });
      } else {
        openSuggest(d.job.id);
      }
      return;
    }

    if (d.toQueue) { doUnassign(d.job.id); return; }
    if (!d.lane || d.start == null || !d.tech) return;   // dropped nowhere

    // A job that takes a crew keeps the others; the dragged seat changes.
    const crew = Math.max(1, d.job.crewNeed || 1);
    let ids = [d.tech];
    if (crew > 1) ids = [d.tech, ...d.job.techIds.filter((x) => x !== d.tech)].slice(0, crew);

    const block = d.warns.find((w) => w.level === 'block');
    setSel(d.job.id);
    doPlace(d.job.id, ids, d.start, {
      label: d.job.id + ' to ' + techName(d.tech),
      toastMsg: d.job.id + ' → ' + techName(d.tech),
      sub: (block ? block.text + ' · ' : '') + fmtTime(toHHMM(d.start)),
      tone: block ? 'warn' : undefined,
    });
  }

  /* ------------------------------------------------------------- keyboard */

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (!dataRef.current) return;

    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLast(); }
      return;
    }
    if (e.key === 'Escape') { setSel(null); setPop(null); setSug(null); return; }

    const selId = selRef.current;
    if (!selId) return;
    const j = dataRef.current.jobs.find((x) => x.id === selId);
    if (!j || j.status === 'completed' || j.status === 'inprogress') return;

    const step = e.shiftKey ? 60 : SNAP;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const to = toMin(j.slot) + (e.key === 'ArrowLeft' ? -step : step);
      doPlace(j.id, null, Math.max(0, to), { label: j.id + ' retimed' });
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const list = techsFlatRef.current;
      const cur = list.findIndex((u) => u.id === (j.techIds[0] || ''));
      const next = list[Math.max(0, Math.min(list.length - 1, cur + (e.key === 'ArrowUp' ? -1 : 1)))];
      if (!next || next.id === j.techIds[0]) return;
      doPlace(j.id, [next.id], toMin(j.slot), { label: j.id + ' to ' + next.name });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      doUnassign(j.id);
    }
  }

  // Document level and in capture, so events still arrive after an element
  // has taken the pointer. One stable set for the component's life.
  useEffect(() => {
    const move = (e: PointerEvent) => handlersRef.current.move(e);
    const up = () => handlersRef.current.up();
    const key = (e: KeyboardEvent) => handlersRef.current.key(e);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('keydown', key);
      tipHide();
    };
  }, []);

  // Mirror the latest render into the refs the stable handlers read.
  dataRef.current = data;
  dateRef.current = date;
  selRef.current = sel;
  spanRef.current = span;
  techsFlatRef.current = filteredTechs;
  handlersRef.current = { move: dragMove, up: dragEnd, key: onKey };

  /* -------------------------------------------------------------- pieces */

  function renderBar(j: DayJob) {
    const start = toMin(j.slot);
    const mins = j.mins || 60;
    const stop = Math.min(span.to, start + mins);
    const clipped = start + mins > span.to;
    const locked = j.status === 'completed' || j.status === 'inprogress';
    const dim = !passes(j);

    // The three-color rule: scheduled = navy outline, live = red outline,
    // done = navy solid faded (v1 tones plan / live / done).
    const tone = j.status === 'completed'
      ? 'bg-navy text-white border border-navy'
      : j.status === 'inprogress' || j.status === 'enroute'
        ? 'bg-red-wash text-accent border border-accent'
        : 'bg-white text-navy border border-navy/70';
    const fade = dim ? ' opacity-25' : j.status === 'completed' ? ' opacity-60' : '';

    return (
      <div key={j.id} data-job={j.id}
        className={'absolute top-[5px] bottom-[5px] rounded px-1.5 py-0.5 overflow-hidden select-none touch-none ' +
          tone + fade + (locked ? ' cursor-default' : ' cursor-grab') +
          (sel === j.id ? ' ring-2 ring-accent' : '')}
        style={{ left: at(start), width: len(Math.max(20, stop - start)) }}
        title={`${j.id} · ${j.clientName || 'Service'} · ${fmtTime(j.slot)} – ${fmtTime(toHHMM(start + mins))} · ${durationText(mins)}`}>
        <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
          <span className="truncate">{j.clientName || 'Service'}</span>
          {(j.priority === 'high' || j.priority === 'urgent') &&
            <Glyph name="alert" size={10} className={'shrink-0 ' + (j.status === 'completed' ? '' : 'text-accent')} />}
          {j.pinned && <Glyph name="lock" size={10} className="shrink-0 opacity-70" />}
        </span>
        <span className="block text-[9.5px] leading-tight truncate opacity-80">
          {fmtTime(j.slot)} · {durationText(mins)}
          {j.techIds.length > 1 ? ' · crew ' + j.techIds.length : ''}
          {clipped ? ' · past midnight' : ''}
        </span>
      </div>
    );
  }

  function renderTechRow(t: DayTech) {
    const hFrom = toMin(t.hours.from);
    const hTo = toMin(t.hours.to);
    return (
      <div key={t.id} className="flex border-b border-line-soft">
        <div style={{ width: RAIL }}
          className={'shrink-0 flex items-center gap-2.5 px-3 py-1.5 border-r border-line-soft ' + (t.off ? 'bg-wash' : '')}>
          <Avatar name={t.name} color={t.color} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold truncate flex items-center gap-1.5">
              <span className="truncate">{t.name}</span>
              {t.over && <span className="zpill red">Over</span>}
            </div>
            <div className={'text-[10.5px] ' + (t.over ? 'text-accent font-semibold' : 'text-muted')}>
              {t.off ? 'Day off' : durationText(t.booked) + ' of ' + durationText(t.avail)}
            </div>
            {!t.off && (
              <div className="mt-1 h-[3px] rounded bg-line-soft overflow-hidden">
                <span className={'block h-full ' + (t.over ? 'bg-accent' : 'bg-navy/60')}
                  style={{ width: Math.min(100, t.pct) + '%' }} />
              </div>
            )}
          </div>
        </div>
        <div data-lane={t.id} className={'relative flex-1 h-14 min-w-0 overflow-hidden ' + (t.off ? 'bg-wash' : '')}>
          {!t.off && (
            <>
              <span className="absolute inset-y-0 bg-wash pointer-events-none"
                style={{ left: 0, width: len(Math.max(0, hFrom - span.from)) }} />
              <span className="absolute inset-y-0 bg-wash pointer-events-none"
                style={{ left: at(hTo), width: len(Math.max(0, span.to - hTo)) }} />
              {t.gaps.filter((g) => g.to - g.from >= 45).map((g, i) => (
                <span key={i}
                  className="absolute top-[10px] bottom-[10px] rounded border border-dashed border-line flex items-center justify-center overflow-hidden pointer-events-none"
                  style={{ left: at(g.from), width: len(g.to - g.from) }}
                  title={'Free ' + fmtTime(toHHMM(g.from)) + ' – ' + fmtTime(toHHMM(g.to))}>
                  <span className="text-[9.5px] text-muted-2 whitespace-nowrap px-1">
                    {durationText(g.to - g.from)} free
                  </span>
                </span>
              ))}
            </>
          )}
          {hours.filter((m) => m > span.from && m < span.to).map((m) => (
            <span key={m} className="absolute inset-y-0 w-px bg-line-soft pointer-events-none"
              style={{ left: at(m) }} />
          ))}
          {forTech(t.id).map(renderBar)}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- skeleton */

  if (loading && !data) {
    return (
      <div>
        <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
          <h1 className="text-[17px] font-semibold">Service assignment</h1>
        </div>
        <div className="p-6 space-y-3 animate-pulse">
          <div className="h-14 rounded bg-wash" />
          <div className="h-8 w-2/3 rounded bg-wash" />
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded bg-wash" />)}
        </div>
      </div>
    );
  }

  const popJob = pop ? data?.jobs.find((x) => x.id === pop.jobId) : undefined;

  /* --------------------------------------------------------------- render */

  return (
    <div>
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center justify-between gap-3 px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-[17px] font-semibold whitespace-nowrap">Service assignment</h1>
          <span className="text-muted-2 text-[12.5px] truncate">
            {fmtLong(date)} · drag work onto whoever is free
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            className="h-8 px-2 rounded border border-line bg-white text-[12.5px] outline-none focus:border-navy">
            <option value="">All branches</option>
            {(data?.branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={runBalance} disabled={acting}
            className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[13px] font-medium hover:bg-wash disabled:opacity-50">
            <Glyph name="shuffle" size={13} /> Balance
          </button>
          <button onClick={runAuto} disabled={acting || !stats.queueN}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
            <Glyph name="sparkle" size={13} /> Auto-assign{stats.queueN ? ' ' + stats.queueN : ''}
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------- week strip */}
      <div className="flex gap-1.5 px-6 py-2 border-b border-line-soft overflow-x-auto">
        {(data?.week || []).map((w) => {
          const on = w.date === date;
          return (
            <button key={w.date} onClick={() => { setDate(w.date); setSel(null); setPop(null); }}
              className={'relative flex flex-col items-center px-3 py-1 rounded border min-w-[76px] ' +
                (on ? 'border-navy bg-navy text-white' : 'border-line hover:bg-wash')}>
              <span className={'text-[9.5px] uppercase tracking-wide ' + (on ? 'opacity-70' : 'text-muted-2')}>
                {DOW[dayOfWeek(w.date)]}
              </span>
              <span className={'text-[14px] font-semibold leading-tight ' +
                (!on && w.date === today ? 'text-accent' : '')}>
                {Number(w.date.slice(8, 10))}
              </span>
              <span className={'text-[9.5px] ' + (on ? 'opacity-70' : 'text-muted')}>
                {w.jobs ? w.jobs + ' job' + (w.jobs === 1 ? '' : 's') : '—'}
              </span>
              {w.unassigned > 0 && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent"
                  title={w.unassigned + ' unassigned'} />
              )}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------ controls + stats */}
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 px-6 py-2 border-b border-line-soft">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setDate(addDays(date, -1)); setSel(null); }}
            className="h-7 px-2.5 rounded border border-line text-[12px] hover:bg-wash">‹ Prev</button>
          <button onClick={() => { setDate(today); setSel(null); }}
            className="h-7 px-2.5 rounded border border-line text-[12px] hover:bg-wash">Today</button>
          <button onClick={() => { setDate(addDays(date, 1)); setSel(null); }}
            className="h-7 px-2.5 rounded border border-line text-[12px] hover:bg-wash">Next ›</button>
          <input type="date" value={date}
            onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSel(null); } }}
            className="h-7 px-2 rounded border border-line text-[12px] outline-none focus:border-navy" />
          <span className="flex items-center gap-1 ml-1">
            <button onClick={() => setFilter({ status: '', prio: false })}
              className={'h-6 px-2.5 rounded-full text-[11.5px] border ' +
                (!filter.status && !filter.prio ? 'bg-navy text-white border-navy' : 'border-line hover:bg-wash')}>
              All
            </button>
            <button onClick={() => setFilter((f) => ({ ...f, status: f.status === 'open' ? '' : 'open' }))}
              className={'h-6 px-2.5 rounded-full text-[11.5px] border ' +
                (filter.status === 'open' ? 'bg-navy text-white border-navy' : 'border-line hover:bg-wash')}>
              Not done
            </button>
            <button onClick={() => setFilter((f) => ({ ...f, status: f.status === 'live' ? '' : 'live' }))}
              className={'h-6 px-2.5 rounded-full text-[11.5px] border ' +
                (filter.status === 'live' ? 'bg-navy text-white border-navy' : 'border-line hover:bg-wash')}>
              On the way
            </button>
            <button onClick={() => setFilter((f) => ({ ...f, prio: !f.prio }))}
              className={'h-6 px-2.5 rounded-full text-[11.5px] border flex items-center gap-1 ' +
                (filter.prio ? 'bg-navy text-white border-navy' : 'border-line hover:bg-wash')}>
              <Glyph name="alert" size={10} /> Priority
            </button>
          </span>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-muted flex-wrap">
          <span><strong className="text-ink font-semibold">{stats.all}</strong> services</span>
          <span><strong className="text-navy font-semibold">{stats.assigned}</strong> assigned</span>
          <span><strong className="text-accent font-semibold">{stats.queueN}</strong> waiting</span>
          <span><strong className="text-ink font-semibold">{stats.busy}</strong>/{stats.people} busy</span>
          <span className={stats.util > 100 ? 'zpill red' : stats.util > 85 ? 'text-accent font-semibold' : ''}>
            <strong className="font-semibold">{stats.util}%</strong>&nbsp;of the day used
            {stats.overAny ? ' · ' + stats.overAny + ' over hours' : ''}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------- the board */}
      <section className="flex items-stretch" onPointerDown={onBoardPointerDown}
        onDoubleClick={(e) => {
          const el = (e.target as HTMLElement).closest('[data-job],[data-queue]');
          if (el) router.push('/jobs/' + (el.getAttribute('data-job') || el.getAttribute('data-queue')));
        }}>

        {/* the unassigned queue */}
        <aside ref={queueWrapRef}
          className="w-[248px] shrink-0 border-r border-line flex flex-col sticky top-0 self-start max-h-[calc(100vh-48px)]">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] font-bold">Unassigned</span>
            <span className={'zpill ' + (stats.queueN ? 'red' : '')}>{stats.queueN}</span>
          </div>
          <div className="px-3 pb-2">
            <label className="flex items-center gap-1.5 h-7 px-2 rounded border border-line bg-wash focus-within:bg-white">
              <Icon name="search" size={12} className="text-muted-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, id, area…"
                className="flex-1 min-w-0 bg-transparent outline-none text-[12px]" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-2">
            {queueShown.length ? queueShown.map((j) => (
              <div key={j.id} data-queue={j.id}
                className={'rounded border bg-white p-2.5 cursor-grab select-none touch-none shadow-card ' +
                  (j.priority === 'urgent' || j.priority === 'high' ? 'border-red-line' : 'border-line')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10.5px] font-bold">{j.id}</span>
                  <span className="text-[10.5px] text-muted">
                    {durationText(j.mins)}{j.crewNeed > 1 ? ' · ' + j.crewNeed + 'p' : ''}
                  </span>
                </div>
                <div className="text-[13px] font-medium truncate mt-0.5">{j.clientName || '—'}</div>
                <div className="text-[11px] text-muted truncate">{j.serviceNames.join(', ')}</div>
                <div className="text-[11px] font-semibold text-navy mt-1.5">
                  {t12(j.slot)} – {endT12(j.slot, j.mins)}
                </div>
                <div className="text-[10.5px] text-muted-2 mt-1 leading-snug flex items-start gap-1">
                  <Glyph name="pin" size={10} className="shrink-0 mt-[2px]" />
                  <span className="break-words min-w-0">
                    {[j.addr, j.city].filter(Boolean).join(', ') || j.branchName || '—'}
                  </span>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button onClick={() => openSuggest(j.id)}
                    className="text-[11px] font-semibold text-accent hover:underline shrink-0">Who?</button>
                </div>
              </div>
            )) : (
              <div className="text-center text-[12px] text-muted px-2 py-8">
                {q ? 'Nothing in the queue matches that.' : 'Everything on this day has somebody on it.'}
              </div>
            )}
          </div>
          <div className="border-t border-line-soft px-3 py-2 text-center text-[10.5px] text-muted-2">
            Drop a bar here to take everybody off it
          </div>
        </aside>

        {/* the grid */}
        <div className="flex-1 min-w-0">
          <div className="flex border-b border-line bg-wash">
            <div style={{ width: RAIL }}
              className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted border-r border-line-soft">
              Technician
            </div>
            <div className="relative flex-1 h-7 min-w-0">
              {hours.map((m) => (
                <span key={m}
                  className={'absolute top-1.5 text-[10px] text-muted-2 whitespace-nowrap ' +
                    (m === span.from ? '' : m === span.to ? '-translate-x-full' : '-translate-x-1/2')}
                  style={{ left: at(m) }}>
                  {clockAt(m)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative" ref={gridRef}>
            {showNow && (
              <div className="absolute top-0 bottom-0 w-[2px] bg-accent z-10 pointer-events-none"
                style={{ left: `calc(${RAIL}px + (100% - ${RAIL}px) * ${((nowMin - span.from) / span.mins).toFixed(5)})` }}>
                <span className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-accent" />
              </div>
            )}
            {viewGroups.map((g) => {
              const shut = !!collapsed[g.branchId];
              const jobsHere = g.techs.reduce((a, t) => a + forTech(t.id).length, 0);
              return (
                <div key={g.branchId}>
                  <button onClick={() => setCollapsed((c) => ({ ...c, [g.branchId]: !c[g.branchId] }))}
                    className="w-full flex items-center gap-2 px-3 h-8 bg-wash border-b border-line-soft text-left select-none">
                    <Icon name="chevRight" size={12}
                      className={'text-muted-2 transition-transform ' + (shut ? '' : 'rotate-90')} />
                    <span className="w-1.5 h-1.5 rounded-full bg-navy" />
                    <span className="text-[11.5px] font-bold">{g.branchName}</span>
                    <span className="text-[11px] text-muted">
                      · {g.techs.length} technician{g.techs.length === 1 ? '' : 's'} · {jobsHere} job{jobsHere === 1 ? '' : 's'}
                    </span>
                  </button>
                  {!shut && g.techs.map(renderTechRow)}
                </div>
              );
            })}
            {viewGroups.length === 0 && (
              <div className="p-12 text-center text-[13px] text-muted">
                Nobody matches this branch filter.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-6 py-3 text-[11px] text-muted border-t border-line-soft">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-2.5 rounded-[2px] bg-white border border-navy/70" />Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-2.5 rounded-[2px] bg-red-wash border border-accent" />On the way / in progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-2.5 rounded-[2px] bg-navy opacity-60" />Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-2.5 rounded-[2px] border border-dashed border-line" />Free time
        </span>
        <span className="flex items-center gap-1.5">
          <Glyph name="lock" size={11} /> Placed by hand — the plan will not move it
        </span>
        <span>
          Click a bar for its details · drag it sideways to retime · arrows nudge · Delete unassigns · Ctrl+Z undoes
        </span>
      </div>

      {/* ------------------------------------------------------- popover */}
      {pop && popJob && (
        <BarPopover job={popJob} anchor={pop.anchor}
          names={popJob.techIds.map(techName)}
          onClose={() => setPop(null)}
          onNudge={(delta) => {
            setPop(null);
            doPlace(popJob.id, null, Math.max(0, toMin(popJob.slot) + delta), { label: popJob.id + ' retimed' });
          }}
          onUnassign={() => { setPop(null); doUnassign(popJob.id); }}
          onSuggest={() => openSuggest(popJob.id)} />
      )}

      {/* -------------------------------------------------- suggest modal */}
      {sug && (
        <SuggestModal job={sug.job} rows={sug.rows}
          onTake={(r) => takeSuggest(sug.job, r)}
          onClose={() => setSug(null)} />
      )}

      {/* --------------------------------------------------------- toast */}
      {toast && (
        <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 z-[97] flex items-center gap-3 rounded px-4 py-2.5 shadow-pop text-white ' +
          (toast.tone === 'warn' ? 'bg-accent' : 'bg-navy')}>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">{toast.msg}</span>
            {toast.sub && <span className="block text-[11.5px] opacity-80">{toast.sub}</span>}
          </span>
          {toast.undo && (
            <button onClick={() => { setToast(null); undoLast(); }}
              className="text-[12.5px] font-bold underline underline-offset-2 shrink-0">
              Undo
            </button>
          )}
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 shrink-0">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================ bar popover */

function BarPopover({ job, anchor, names, onClose, onNudge, onUnassign, onSuggest }: {
  job: DayJob;
  anchor: { top: number; bottom: number; left: number };
  names: string[];
  onClose: () => void;
  onNudge: (delta: number) => void;
  onUnassign: () => void;
  onSuggest: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Prefer below the bar; flip above and pull inside if it would run off.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pr = el.getBoundingClientRect();
    let top = anchor.bottom + 8;
    if (top + pr.height > window.innerHeight - 10) top = Math.max(10, anchor.top - pr.height - 8);
    let left = anchor.left;
    if (left + pr.width > window.innerWidth - 10) left = Math.max(10, window.innerWidth - pr.width - 10);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      const t = e.target as HTMLElement;
      if (el && !el.contains(t) && !t.closest('[data-job]')) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  const start = toMin(job.slot);
  const have = job.techIds.length;
  const need = Math.max(1, job.crewNeed || 1);
  const chip = 'h-7 px-2.5 rounded border border-line text-[11.5px] hover:bg-wash';

  return (
    <div ref={ref}
      className="fixed z-[95] w-[268px] rounded-md border border-line bg-white p-3 shadow-pop"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: 'hidden' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] font-bold">{job.id}</span>
        <button onClick={onClose} aria-label="Close" className="text-muted-2 hover:text-ink">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="text-[14px] font-bold mt-0.5 truncate">{job.clientName || '—'}</div>
      <div className="text-[12px] text-muted truncate">{job.serviceNames.join(', ')}</div>
      <div className="text-[12.5px] mt-2">
        {fmtTime(job.slot)} – {fmtTime(toHHMM(start + (job.mins || 60)))} · {durationText(job.mins || 60)}
      </div>
      <div className="text-[12.5px] mt-1 flex items-center gap-1.5 flex-wrap">
        <span className="truncate">{names.length ? names.join(', ') : 'Nobody on it yet'}</span>
        {need > 1 && (
          <span className={'zpill ' + (have < need ? 'red' : 'outline')}>crew {have} of {need}</span>
        )}
      </div>
      {job.addr && (
        <div className="text-[11px] text-muted-2 mt-1 flex items-center gap-1">
          <Glyph name="pin" size={10} className="shrink-0" />
          <span className="truncate">{job.addr}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <button className={chip} onClick={() => onNudge(-15)}>−15m</button>
        <button className={chip} onClick={() => onNudge(15)}>+15m</button>
        <button className={chip} onClick={onSuggest}>Suggest somebody</button>
        <button className={chip} onClick={onUnassign}>Unassign</button>
      </div>
      <Link href={'/jobs/' + job.id}
        className="mt-2.5 flex items-center justify-center h-8 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
        Open the visit
      </Link>
    </div>
  );
}

/* ========================================================== suggest modal */

function SuggestModal({ job, rows, onTake, onClose }: {
  job: DayJob;
  rows: SuggestRow[] | null;
  onTake: (r: SuggestRow) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[96] bg-navy/40 flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[460px] rounded-md bg-white shadow-pop border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14.5px] font-semibold">Who should take {job.id}?</span>
            <button onClick={onClose} aria-label="Close" className="text-muted-2 hover:text-ink">
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="text-[12px] text-muted mt-0.5 truncate">
            {(job.clientName ? job.clientName + ' · ' : '') + durationText(job.mins || 60) +
              ' · ' + job.serviceNames.join(', ')}
          </div>
        </div>
        <div className="max-h-[54vh] overflow-y-auto p-3 flex flex-col gap-2">
          {!rows ? (
            <div className="text-[12.5px] text-muted text-center py-8">Ranking the team…</div>
          ) : rows.length === 0 ? (
            <div className="text-[12.5px] text-muted text-center py-8">No technicians on the roster.</div>
          ) : rows.map((r) => (
            <button key={r.tech.id} onClick={() => onTake(r)}
              className={'text-left rounded border p-2.5 flex items-start gap-2.5 hover:bg-wash ' +
                (r.at == null ? 'border-line-soft opacity-60' : 'border-line')}>
              <Avatar name={r.tech.name} color={r.tech.color} size={30} />
              <span className="min-w-0 flex-1 block">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold truncate">{r.tech.name}</span>
                  <span className={'text-[11px] shrink-0 ' + (r.at == null ? 'text-accent font-semibold' : 'text-muted')}>
                    {r.at == null ? 'No room' : 'Free ' + fmtTime(toHHMM(r.at))}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 mt-1">
                  {r.why.map((w, i) => (
                    <span key={i} className={'zpill ' + (w.good ? 'outline' : 'red')}>{w.text}</span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-line-soft text-right">
          <button onClick={onClose}
            className="h-8 px-3 rounded border border-line text-[12.5px] hover:bg-wash">Close</button>
        </div>
      </div>
    </div>
  );
}
