'use client';

/* ============================================================================
   Training, on a phone.

   It was a list of titles with a grey word beside each one and nothing behind
   a tap — a library you could see the spines of but not open. A lesson is
   written so somebody can read it standing in a stairwell between jobs, which
   only works if it opens.

   So: a card per lesson that says what it is before you tap it — a video or
   something to read, who wrote it and when, and the first line or two of it —
   and a full screen to read it in, with the video at the top where it can be
   played without hunting.
   ========================================================================== */

import { useState } from 'react';
import { getToken } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar, Card, Fab, Screen, SearchBox } from '@/components/mobile';
import { AttachList, type TFile } from '@/components/attach';

export interface Lesson {
  id: string; title: string; role: string; body: string;
  hasVideo: boolean; link: string; by: string; createdAt: string; canManage: boolean;
  files: TFile[];
}

const ROLE_LABEL: Record<string, string> = {
  all: 'Everyone', tech: 'Technicians', sales: 'Sales', ops: 'Operations',
  accounts: 'Accounts', admin: 'Admins',
};

/** youtube watch/short links become embeddable; anything else opens as a link. */
export function embedOf(link: string): string {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(link);
  return m ? 'https://www.youtube.com/embed/' + m[1] : '';
}

/** 2026-09-08 → "8 Sep 2026". */
const niceDay = (iso: string) => {
  const p = String(iso || '').split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return p.length === 3 ? Number(p[2]) + ' ' + M[Number(p[1]) - 1] + ' ' + p[0] : iso;
};

/** What kind of thing this lesson is, in the two words somebody would use. */
function kindOf(l: Lesson): { label: string; icon: 'play' | 'book' | 'file'; tile: string } {
  if (l.hasVideo || l.link) return { label: 'Video', icon: 'play', tile: 'bg-navy text-white' };
  if (!l.body && l.files?.length) return { label: 'Files', icon: 'file', tile: 'bg-sky text-sky-ink' };
  return { label: 'Reading', icon: 'book', tile: 'bg-amber text-amber-ink' };
}

/* ------------------------------------------------------------- the reader */

export function LessonScreen({ lesson, onClose, onEdit, onDelete }: {
  lesson: Lesson; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const embed = embedOf(lesson.link);
  const videoSrc = lesson.hasVideo
    ? '/api/training/' + lesson.id + '/video?t=' + (getToken() || '')
    : '';

  return (
    <div className="lg:hidden fixed inset-0 z-[60] bg-ground overflow-y-auto
      pb-[calc(env(safe-area-inset-bottom)+110px)]">
      <BackBar title={lesson.title} sub={ROLE_LABEL[lesson.role] || lesson.role}
        fallback="/training" onBack={onClose} />

      <div className="px-4 pt-4 flex flex-col gap-3">
        {videoSrc && (
          <video controls playsInline src={videoSrc}
            className="w-full rounded-[18px] bg-black aspect-video" />
        )}
        {embed && (
          <iframe src={embed} title={lesson.title} allowFullScreen
            className="w-full aspect-video rounded-[18px] bg-black" />
        )}
        {lesson.link && !embed && (
          <a href={lesson.link} target="_blank" rel="noreferrer"
            className="h-12 rounded-xl bg-accent text-white text-[15px] font-bold
              flex items-center justify-center gap-2 active:brightness-90">
            <Icon name="play" size={18} /> Open the material
          </a>
        )}

        {lesson.body && (
          <section className="bg-white rounded-[20px] px-4 py-4">
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{lesson.body}</p>
          </section>
        )}

        {lesson.files?.length > 0 && (
          <section className="bg-white rounded-[20px] px-4 py-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-2 mb-2">Files</p>
            <AttachList files={lesson.files} />
          </section>
        )}

        <p className="text-[12.5px] text-muted-2 px-1">
          {lesson.by} · {niceDay(lesson.createdAt)}
        </p>

        {lesson.canManage && (
          <div className="flex gap-2">
            <button type="button" onClick={onEdit}
              className="flex-1 h-12 rounded-xl border border-navy text-navy text-[14.5px] font-semibold
                active:bg-wash flex items-center justify-center gap-2">
              <Icon name="edit" size={16} /> Edit lesson
            </button>
            <button type="button" onClick={onDelete}
              className="h-12 px-5 rounded-xl border border-accent text-accent text-[14.5px] font-semibold
                active:bg-red-wash">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the list */

export default function TrainingMobile({ rows, onOpen, onNew }: {
  rows: Lesson[] | null;
  onOpen: (l: Lesson) => void;
  onNew?: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((l) => !needle
    || [l.title, l.body, l.by, ROLE_LABEL[l.role] || l.role].join(' ').toLowerCase().includes(needle));

  return (
    <Screen>
      <BackBar title="Training" fallback="/dashboard" />
      <SearchBox value={q} onChange={setQ} placeholder="Search the lessons" />

      <div className="px-4 pt-3 flex flex-col gap-3">
        {rows === null ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[104px] rounded-[20px] bg-white animate-pulse" />)
        ) : shown.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">
              {rows.length === 0 ? 'No lessons yet' : 'Nothing matches that'}
            </p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              {rows.length === 0
                ? 'How the work is done, written down once, so it can be handed over.'
                : 'Try the title, or who wrote it.'}
            </p>
          </Card>
        ) : (
          /* One card to a lesson, with a tile that says what kind of thing it
             is - dark with a play button to watch, light with a book to read -
             who it is for, and the first line of it. */
          <div className="flex flex-col gap-3 mb-4">
            {shown.map((l) => {
              const k = kindOf(l);
              const files = l.files?.length || 0;
              return (
                <button key={l.id} type="button" onClick={() => onOpen(l)} data-lesson-card
                  className="w-full text-left bg-white rounded-[20px] border border-line p-3.5 flex items-start gap-3.5
                    active:bg-wash">
                  <span className={'w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 ' + k.tile}>
                    <Icon name={k.icon} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
                      {k.label} · {ROLE_LABEL[l.role] || l.role}
                    </span>
                    <span className="block text-[15.5px] font-semibold leading-snug mt-0.5 line-clamp-2">{l.title}</span>
                    {l.body?.trim() && (
                      <span className="block text-[13px] text-muted mt-0.5 truncate">{l.body.trim()}</span>
                    )}
                    <span className="block text-[12px] text-muted-2 mt-1">
                      {[l.by, niceDay(l.createdAt), files ? files + (files === 1 ? ' file' : ' files') : '']
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Icon name="chevRight" size={16} className="text-muted-2 shrink-0 mt-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {onNew && <Fab onClick={onNew} label="New lesson" />}
    </Screen>
  );
}
