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
import { BackBar, Card, Chip, Fab, Screen, SearchBox } from '@/components/mobile';

export interface Lesson {
  id: string; title: string; role: string; body: string;
  hasVideo: boolean; link: string; by: string; createdAt: string; canManage: boolean;
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
function kindOf(l: Lesson): { label: string; icon: 'play' | 'book'; watch: boolean } {
  if (l.hasVideo || l.link) return { label: 'Watch', icon: 'play', watch: true };
  return { label: 'Read', icon: 'book', watch: false };
}

/* ------------------------------------------------------------- the reader */

export function LessonScreen({ lesson, onClose, onDelete }: {
  lesson: Lesson; onClose: () => void; onDelete: () => void;
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

        <p className="text-[12.5px] text-muted-2 px-1">
          {lesson.by} · {niceDay(lesson.createdAt)}
        </p>

        {lesson.canManage && (
          <button type="button" onClick={onDelete}
            className="h-12 rounded-xl border border-accent text-accent text-[14.5px] font-semibold
              active:bg-red-wash">
            Delete lesson
          </button>
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
          shown.map((l) => {
            const k = kindOf(l);
            return (
              <button key={l.id} type="button" onClick={() => onOpen(l)}
                className="w-full text-left bg-white rounded-[20px] px-4 py-4 active:bg-wash
                  flex items-start gap-3">
                <span className={'w-11 h-11 rounded-full shrink-0 flex items-center justify-center '
                  + (k.watch ? 'bg-accent text-white' : 'bg-rose text-accent')}>
                  <Icon name={k.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15.5px] font-bold tracking-[-0.01em] truncate">{l.title}</span>
                    <Icon name="chevRight" size={15} className="text-muted-2 shrink-0" />
                  </span>
                  <span className="flex items-center gap-2 mt-1.5">
                    <Chip tone={k.watch ? 'info' : 'plain'}>{k.label}</Chip>
                    <span className="text-[13px] text-muted truncate">
                      {ROLE_LABEL[l.role] || l.role}
                    </span>
                  </span>
                  {/* line-clamp sets its own display; a `block` class beside it
                      wins in the cascade and the whole lesson spills into the
                      card, which is what happened here the first time. */}
                  {l.body && (
                    <span className="text-[13px] text-muted-2 mt-1.5 line-clamp-2 leading-snug">
                      {l.body}
                    </span>
                  )}
                  {/* Who wrote it, and not when. The date told a technician
                      nothing he could act on and made a four-line card out of
                      a three-line one; it is on the lesson itself. */}
                  <span className="block text-[12.5px] text-muted-2 mt-1.5">{l.by}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      {onNew && <Fab onClick={onNew} label="New lesson" />}
    </Screen>
  );
}
