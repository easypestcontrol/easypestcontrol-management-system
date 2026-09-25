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
    <div className="max-lg:hidden p-6 max-w-[980px]">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[20px] font-semibold">Training</h1>
          <p className="max-lg:hidden text-muted text-[13px] mt-0.5">
            {canManage
              ? 'The knowledge base — publish lessons per role and each person sees theirs.'
              : 'Your lessons — everything published for your role.'}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            <Icon name="plus" size={14} /> New lesson
          </button>
        )}
      </div>

      {!rows ? (
        <p className="text-muted text-[13px]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[14px] font-medium">Nothing here yet</p>
          <p className="text-muted text-[12.5px] mt-1">
            Lessons published for your role will appear on this page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((l) => (
            <div key={l.id} className="card p-4 flex flex-col">
              <button onClick={() => setOpen(l)} className="text-left">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="zpill outline">{ROLE_LABEL[l.role] || l.role}</span>
                  {l.hasVideo && <span className="zpill navy">video</span>}
                  {l.link && !l.hasVideo && <span className="zpill">link</span>}
                </div>
                <p className="text-[14px] font-semibold leading-snug">{l.title}</p>
                <p className="text-[12px] text-muted mt-1 line-clamp-2">{l.body || '—'}</p>
                <p className="text-[10.5px] text-muted-2 mt-2">{l.by} · {l.createdAt}</p>
              </button>
              {canManage && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line-soft">
                  <button onClick={() => setEditing(l)}
                    className="h-8 px-3 rounded border border-line text-[12px] font-semibold hover:bg-wash flex items-center gap-1.5">
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button onClick={() => setConfirming(l)}
                    className="h-8 px-3 rounded border border-line text-[12px] font-medium text-muted hover:text-accent hover:bg-red-wash flex items-center gap-1.5">
                    <Icon name="x" size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
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
