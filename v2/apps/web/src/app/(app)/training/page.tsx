'use client';

/* ============================================================================
   Training / knowledge base.
   Admin & ops: build the library — a lesson has a title, a target role,
   text, and either an uploaded video file or an external link.
   Everyone else: sees the lessons published for their role and opens them.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { api, getToken, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import Confirm from '@/components/confirm';
import { AttachEditor, AttachList, type TFile } from '@/components/attach';
import TrainingMobile, { LessonScreen } from './mobile';

const API_BASE = '/api'; // the Next proxy forwards to the API

interface Lesson {
  id: string; title: string; role: string; body: string;
  hasVideo: boolean; link: string; by: string; createdAt: string; canManage: boolean;
  files: TFile[];
}

const ROLE_LABEL: Record<string, string> = {
  all: 'Everyone', tech: 'Technicians', sales: 'Sales', ops: 'Operations',
  accounts: 'Accounts', admin: 'Admins',
};

/** youtube watch/short links become embeddable; anything else opens as a link. */
function embedOf(link: string): string {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(link);
  return m ? 'https://www.youtube.com/embed/' + m[1] : '';
}

export default function TrainingPage() {
  const [rows, setRows] = useState<Lesson[] | null>(null);
  const [open, setOpen] = useState<Lesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [confirming, setConfirming] = useState<Lesson | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);

  const load = () => api.get<Lesson[]>('/training').then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, []);

  // Publishing is admin/ops — same rule the API enforces on POST.
  const canManage = !!me && ['admin', 'ops'].includes(me.role);

  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((l) => !needle
    || [l.title, l.body, l.by, ROLE_LABEL[l.role] || l.role].join(' ').toLowerCase().includes(needle));

  return (
    <>
      {/* A lesson is read on the phone between jobs, which is the whole point
          of writing it down — so on a phone it opens, plays and reads there
          rather than listing titles that go nowhere. */}
      <TrainingMobile rows={rows} onOpen={setOpen}
        onNew={canManage ? () => setAdding(true) : undefined} />
      {open && (
        <LessonScreen lesson={open} onClose={() => setOpen(null)}
          onEdit={() => { const l = open; setOpen(null); setEditing(l); }}
          onDelete={() => setConfirming(open)} />
      )}
      <Confirm spec={confirming ? {
        title: 'Delete this lesson?',
        body: 'It goes for everyone it was published to. This cannot be undone.',
        confirmLabel: 'Yes, delete it',
        cancelLabel: 'Keep it',
        danger: true,
        onConfirm: () => {
          const id = confirming.id;
          setConfirming(null); setOpen(null);
          api.del('/training/' + id).then(load).catch(() => {});
        },
      } : null} onClose={() => setConfirming(null)} />
    <div className="max-lg:hidden p-6 max-w-[1320px]">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training</h1>
          <p className="text-muted text-[13px] mt-0.5">
            {canManage
              ? 'The knowledge base — publish lessons per role and each person sees theirs.'
              : 'Your lessons — everything published for your role.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(rows?.length || 0) > 3 && (
            <label className="relative block">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the lessons"
                className="h-9 w-[240px] pl-8 pr-3 rounded-lg border border-line bg-white text-[13px] outline-none focus:border-accent" />
            </label>
          )}
          {canManage && (
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              <Icon name="plus" size={14} /> New lesson
            </button>
          )}
        </div>
      </div>

      {!rows ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="card h-[286px] animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center max-w-[560px]">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-wash text-muted flex items-center justify-center mb-4">
            <Icon name="book" size={24} />
          </span>
          <p className="text-[15px] font-semibold">Nothing here yet</p>
          <p className="text-muted text-[12.5px] mt-1">
            Lessons published for your role will appear on this page.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-muted text-[13px]">Nothing matches “{q}”. Try the title, or who wrote it.</p>
      ) : (
        /* A shelf, not a list: each lesson is a cover that says what kind of
           thing it is before it is opened, and the shelf fills the width. */
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {shown.map((l) => (
            <LessonCard key={l.id} l={l} canManage={canManage} wide={shown.length === 1}
              onOpen={() => setOpen(l)} onEdit={() => setEditing(l)} onDelete={() => setConfirming(l)} />
          ))}
        </div>
      )}

      {open && (
        <span className="max-lg:hidden">
          <Viewer lesson={open} onClose={() => setOpen(null)}
            onEdit={() => { const l = open; setOpen(null); setEditing(l); }}
            onDelete={() => setConfirming(open)} />
        </span>
      )}
    </div>
    {adding && <LessonDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    {editing && (
      <LessonDialog lesson={editing}
        onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
    )}
    </>
  );
}

/* -------------------------------------------------------------- the card */

/** The id of a YouTube link, so the card can wear the video's own picture. */
function ytId(link: string): string {
  return (/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(link || '') || [])[1] || '';
}

/** 2026-09-08 → "8 Sep 2026". */
function niceDay(iso: string): string {
  const p = String(iso || '').slice(0, 10).split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return p.length === 3 && M[Number(p[1]) - 1] ? Number(p[2]) + ' ' + M[Number(p[1]) - 1] + ' ' + p[0] : iso;
}

/* What kind of thing the lesson is decides its cover: something to watch is
   dark with a play button, something to read is light with a book, a lesson
   that is only attachments shows the file. */
function kindOf(l: Lesson): {
  label: string; icon: 'play' | 'book' | 'file'; cover: string; badge: string; mark: string; hint: string;
} {
  if (l.hasVideo || l.link) {
    return { label: 'Video', icon: 'play', cover: 'bg-navy', badge: 'bg-white text-navy', mark: 'text-white', hint: 'Open to watch it.' };
  }
  if (!l.body && l.files?.length) {
    return { label: 'Files', icon: 'file', cover: 'bg-sky', badge: 'bg-white text-sky-ink', mark: 'text-sky-ink', hint: 'Open to see the files.' };
  }
  return { label: 'Reading', icon: 'book', cover: 'bg-amber', badge: 'bg-white text-amber-ink', mark: 'text-amber-ink', hint: 'Open to read it.' };
}

function LessonCard({ l, canManage, wide, onOpen, onEdit, onDelete }: {
  l: Lesson; canManage: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void;
  /** The only lesson on the shelf: laid on its side across two columns,
      cover beside the text, so one card does not sit alone in a corner. */
  wide?: boolean;
}) {
  const k = kindOf(l);
  const yt = ytId(l.link);
  const files = l.files?.length || 0;
  const who = l.by || 'The office';
  return (
    <article data-lesson-card
      className={'card overflow-hidden flex flex-col group transition-shadow hover:shadow-pop ' + (wide ? 'col-span-2' : '')}>
      <button type="button" onClick={onOpen} className={'text-left flex flex-1 ' + (wide ? 'flex-row' : 'flex-col')}>
        {/* ---- the cover */}
        <span className={'relative block overflow-hidden ' + (wide ? 'w-[44%] min-h-[230px] shrink-0 ' : 'h-[136px] w-full ') + k.cover}>
          <Icon name={k.icon} size={150} className={'absolute -right-7 -bottom-9 opacity-[0.09] ' + k.mark} />
          {yt && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={'https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg'} alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span className="absolute inset-0 bg-navy/35" />
            </>
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className={'w-14 h-14 rounded-full flex items-center justify-center shadow-pop '
              + 'transition-transform duration-200 group-hover:scale-110 ' + k.badge}>
              <Icon name={k.icon} size={22} />
            </span>
          </span>
          <span className="absolute left-3 top-3 px-2.5 py-1 rounded-full bg-white text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink shadow-card">
            {k.label}
          </span>
          {files > 0 && (
            <span className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-white text-[10.5px] font-bold text-ink shadow-card flex items-center gap-1">
              <Icon name="file" size={11} /> {files} {files === 1 ? 'file' : 'files'}
            </span>
          )}
        </span>

        {/* ---- what it is */}
        <span className={'block flex-1 ' + (wide ? 'p-6 self-center' : 'p-4')}>
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-accent">
            For {(ROLE_LABEL[l.role] || l.role).toLowerCase() === 'everyone' ? 'everyone' : ROLE_LABEL[l.role] || l.role}
          </span>
          <span className={'block font-semibold leading-snug mt-1.5 line-clamp-2 ' + (wide ? 'text-[20px]' : 'text-[15.5px]')}>{l.title}</span>
          <span className={'block text-muted mt-1.5 leading-relaxed ' + (wide ? 'text-[13.5px] line-clamp-4' : 'text-[12.5px] line-clamp-2')}>
            {l.body?.trim() || k.hint}
          </span>
        </span>
      </button>

      {/* ---- who wrote it, and what can be done with it */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-t border-line-soft">
        <span className="w-8 h-8 rounded-full bg-wash text-ink-2 text-[11px] font-bold flex items-center justify-center shrink-0">
          {who.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold truncate">{who}</span>
          <span className="block text-[11px] text-muted-2">{niceDay(l.createdAt)}</span>
        </span>
        {canManage ? (
          <>
            <button type="button" onClick={onEdit} title="Edit this lesson" aria-label="Edit this lesson"
              className="w-8 h-8 rounded-lg border border-line text-ink-2 flex items-center justify-center hover:bg-wash">
              <Icon name="edit" size={14} />
            </button>
            <button type="button" onClick={onDelete} title="Delete this lesson" aria-label="Delete this lesson"
              className="w-8 h-8 rounded-lg border border-line text-muted flex items-center justify-center hover:text-accent hover:bg-red-wash">
              <Icon name="x" size={14} />
            </button>
          </>
        ) : (
          <button type="button" onClick={onOpen}
            className="h-8 px-3 rounded-lg bg-wash text-[12px] font-semibold flex items-center gap-1 hover:bg-line-soft">
            Open <Icon name="chevRight" size={13} />
          </button>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ viewer */

function Viewer({ lesson, onClose, onEdit, onDelete }: {
  lesson: Lesson; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const embed = embedOf(lesson.link);
  const videoSrc = lesson.hasVideo
    ? API_BASE + '/training/' + lesson.id + '/video?t=' + (getToken() || '')
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[760px] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
          <div>
            <span className="zpill outline">{ROLE_LABEL[lesson.role] || lesson.role}</span>
            <h2 className="text-[16px] font-semibold mt-1.5">{lesson.title}</h2>
            <p className="text-[11px] text-muted-2 mt-0.5">{lesson.by} · {lesson.createdAt}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5">
          {videoSrc && (
            <video controls className="w-full card mb-4 bg-black" src={videoSrc} />
          )}
          {embed && (
            <iframe src={embed} className="w-full aspect-video card mb-4" allowFullScreen />
          )}
          {lesson.link && !embed && (
            <a href={lesson.link} target="_blank" rel="noreferrer"
              className="inline-block mb-4 text-[13px] font-semibold text-navy hover:text-accent underline">
              Open the material ↗
            </a>
          )}
          {lesson.body && (
            <p className="text-[13.5px] leading-relaxed whitespace-pre-line">{lesson.body}</p>
          )}
          {lesson.files?.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">Files</p>
              <AttachList files={lesson.files} />
            </div>
          )}
          {lesson.canManage && (
            <div className="mt-5 flex items-center gap-2">
              <button onClick={onEdit}
                className="h-9 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash flex items-center gap-1.5">
                <Icon name="edit" size={14} /> Edit
              </button>
              <button onClick={onDelete}
                className="h-9 px-4 rounded border border-line text-[13px] font-medium text-muted hover:text-accent">
                Delete lesson
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- add form */

function LessonDialog({ lesson, onClose, onDone }: {
  lesson?: Lesson; onClose: () => void; onDone: () => void;
}) {
  const editing = !!lesson;
  const [title, setTitle] = useState(lesson?.title || '');
  const [role, setRole] = useState(lesson?.role || 'tech');
  const [body, setBody] = useState(lesson?.body || '');
  const [link, setLink] = useState(lesson?.link || '');
  const [file, setFile] = useState<File | null>(null);
  const [removeVideo, setRemoveVideo] = useState(false);
  const [files, setFiles] = useState<TFile[]>(lesson?.files || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const hadVideo = !!lesson?.hasVideo;

  async function save() {
    setErr('');
    if (!title.trim()) { setErr('Give the lesson a title'); return; }
    // The lesson must still open after the edit: text, a link, a fresh file,
    // or an existing video that is being kept.
    const keepsVideo = editing && hadVideo && !removeVideo && !file;
    if (!body.trim() && !link.trim() && !file && !keepsVideo && files.length === 0) {
      setErr('Add some text, a video, a link, or a file'); return;
    }
    if (file && file.size > 100 * 1024 * 1024) { setErr('Keep videos under 100 MB'); return; }
    setBusy(true);
    try {
      let videoB64 = '';
      if (file) {
        videoB64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }
      const payload: Record<string, unknown> = {
        title: title.trim(), role, body: body.trim(), link: link.trim(),
        videoB64, videoName: file?.name || '', files,
      };
      if (editing) {
        if (removeVideo && !file) payload.removeVideo = true;
        await api.patch('/training/' + lesson!.id, payload);
      } else {
        await api.post('/training', payload);
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the lesson');
      setBusy(false);
    }
  }

  const input = 'w-full h-9 px-3 rounded-lg border border-line text-[13.5px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
  const label = 'block text-[12px] font-semibold text-ink-2 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[560px] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold">{editing ? 'Edit lesson' : 'New lesson'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink p-1"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <label className="block">
            <span className={label}>Title *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. How to do a gel treatment in a kitchen" className={input} />
          </label>
          <label className="block">
            <span className={label}>Who is this for?</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={input}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Lesson text</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
              placeholder="Write the steps, safety notes, dosages…"
              className="w-full px-3 py-2 rounded-lg border border-line text-[13.5px] leading-relaxed outline-none transition-colors bg-wash focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)] resize-none" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={label}>Video file</span>
              {editing && hadVideo && !file && !removeVideo && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="zpill navy">video attached</span>
                  <button type="button" onClick={() => setRemoveVideo(true)}
                    className="text-[12px] font-medium text-muted hover:text-accent">Remove</button>
                </div>
              )}
              {removeVideo && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[12px] font-medium text-accent">Video will be removed</span>
                  <button type="button" onClick={() => setRemoveVideo(false)}
                    className="text-[12px] font-medium text-muted hover:text-ink">Undo</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-[12px] text-muted file:mr-2 file:h-8 file:px-3 file:rounded file:border file:border-line file:bg-white file:text-[12px] file:font-medium" />
              <span className="block text-[10.5px] text-muted-2 mt-1">
                {editing && hadVideo ? 'Pick a file to replace it — MP4/WebM, up to 100 MB.' : 'MP4/WebM, up to 100 MB.'}
              </span>
            </div>
            <label className="block">
              <span className={label}>…or a video link</span>
              <input value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="YouTube or any URL" className={input} />
            </label>
          </div>

          <div>
            <span className={label}>Files — images, PDFs, documents</span>
            <AttachEditor files={files} onChange={setFiles} onError={setErr} />
          </div>

          {err && <p className="text-accent text-[12.5px]">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">Cancel</button>
          <button onClick={save} disabled={busy}
            className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            {busy ? (editing ? 'Saving…' : 'Uploading…') : editing ? 'Save changes' : 'Publish lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
