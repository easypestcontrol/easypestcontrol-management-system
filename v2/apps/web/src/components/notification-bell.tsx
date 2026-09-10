'use client';

/* ============================================================================
   The bell on the phone's band.

   Tapping it used to leave the screen — on a technician's home it went to
   Tasks, of all places, and on the office's it opened a whole page of its
   own. Neither is what a bell is for. You tap it to see what has come in and
   then carry on with what you were doing; being moved somewhere else for that
   is a trip you have to find your way back from.

   So it opens over the page and closes again. Opening it IS reading them,
   which is what tapping a bell means everywhere else.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { HeroButton } from '@/components/mobile';

interface Note { id: number; at: string; text: string; read: boolean }

/** "2026-09-08 14:12" → "Today, 2:12 pm" / "8 Sep, 2:12 pm". */
function when(at: string): string {
  const [d, t] = String(at || '').split(' ');
  if (!d) return '';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = d.split('-');
  const now = new Date();
  const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    + '-' + String(now.getDate()).padStart(2, '0');
  const day = d === iso ? 'Today' : Number(p[2]) + ' ' + (M[Number(p[1]) - 1] || '');
  if (!t) return day;
  const [hRaw, m] = t.split(':');
  const h = Number(hRaw);
  const am = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return day + ', ' + h12 + ':' + m + ' ' + am;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Note[] | null>(null);
  const [unread, setUnread] = useState(0);

  /* The count is worth having before anybody taps: a bell with nothing behind
     it should not look the same as one with three assignments waiting. */
  useEffect(() => {
    let dead = false;
    api.get<{ rows: Note[]; unread: number }>('/notifications')
      .then((n) => { if (!dead) { setRows(n.rows || []); setUnread(n.unread || 0); } })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  function show() {
    setOpen(true);
    api.get<{ rows: Note[]; unread: number }>('/notifications')
      .then((n) => setRows(n.rows || []))
      .catch(() => {});
    if (unread > 0) {
      setUnread(0);
      api.post('/notifications/read-all', {}).catch(() => {});
    }
  }

  return (
    <>
      <HeroButton name="bell" onClick={show} label="Notifications" dot={unread > 0} />

      {open && (
        <div className="lg:hidden fixed inset-0 z-[70] bg-navy/45 flex items-end"
          onClick={() => setOpen(false)}>
          {/* text-ink, said out loud.
              The bell lives inside the red band, and the band paints its
              children white — so a sheet that inherited its colour rendered
              white text on a white card: the timestamps showed (they are
              muted), and every notification was invisible. */}
          <div className="w-full bg-white text-ink rounded-t-[24px] pt-2 max-h-[76vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <span className="block w-10 h-1 rounded-full bg-line mx-auto mb-1 shrink-0" />
            <div className="px-5 py-2 flex items-center justify-between gap-3 shrink-0">
              <p className="text-[16px] font-bold">Notifications</p>
              <button type="button" onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-2 active:bg-wash">
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
              {rows === null ? (
                <p className="px-5 py-6 text-[14px] text-muted">Loading…</p>
              ) : rows.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span className="w-12 h-12 rounded-full bg-rose mx-auto mb-3
                    flex items-center justify-center">
                    <Icon name="bell" size={20} className="text-accent" />
                  </span>
                  <p className="text-[15.5px] font-bold">Nothing yet</p>
                  <p className="text-[13.5px] text-muted mt-1">
                    Assignments, approvals and payments land here.
                  </p>
                </div>
              ) : (
                rows.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-5 py-3.5
                    border-b border-line-soft last:border-b-0">
                    <span className={'w-9 h-9 rounded-full shrink-0 flex items-center justify-center '
                      + (n.read ? 'bg-wash text-muted-2' : 'bg-rose text-accent')}>
                      <Icon name="bell" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={'block text-[14.5px] leading-snug '
                        + (n.read ? 'text-ink-2' : 'font-semibold')}>
                        {n.text}
                      </span>
                      <span className="block text-[12.5px] text-muted-2 mt-0.5">{when(n.at)}</span>
                    </span>
                  </div>
                ))
              )}

              {rows !== null && rows.length > 0 && (
                <Link href="/notifications" onClick={() => setOpen(false)}
                  className="block px-5 py-4 text-[14px] font-semibold text-accent">
                  See all notifications
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
