'use client';

/* ============================================================================
   Notifications, as a screen.

   The bell on the phone's home band linked to /notifications, and there was
   no such route — every tap returned a 404 and the console filled up with
   them. The desktop has a dropdown for this; the phone had the link and
   nothing behind it.

   Same data the shell's dropdown reads, opened as a page and marked read on
   arrival, which is what tapping a bell means.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { BackBar } from '@/components/mobile';
import { notifTime } from '@/components/notification-bell';

interface Note { id: number; at: string; text: string; read: boolean }

export default function Notifications() {
  const [rows, setRows] = useState<Note[] | null>(null);

  useEffect(() => {
    let dead = false;
    api.get<{ rows: Note[]; unread: number }>('/notifications')
      .then((n) => {
        if (dead) return;
        setRows(n.rows || []);
        // Opening the screen IS reading them.
        if ((n.unread || 0) > 0) api.post('/notifications/read-all', {}).catch(() => {});
      })
      .catch(() => { if (!dead) setRows([]); });
    return () => { dead = true; };
  }, []);

  return (
    <div className="min-h-full bg-ground max-lg:pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <div className="lg:hidden"><BackBar title="Notifications" fallback="/dashboard" /></div>
      <div className="max-lg:hidden px-6 pt-5 pb-3">
        <h1 className="text-[20px] font-semibold">Notifications</h1>
      </div>

      <div className="px-4 lg:px-6 pt-3">
        {rows === null ? (
          <p className="text-muted text-[13.5px] px-1">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="card p-8 text-center">
            <span className="chipbox bg-sky mx-auto mb-3">
              <Icon name="bell" size={18} className="text-sky-ink" />
            </span>
            <p className="text-[15px] font-semibold">Nothing yet</p>
            <p className="text-muted text-[13.5px] mt-1">
              Assignments, approvals and payments show up here.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-line-soft overflow-hidden">
            {rows.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3.5">
                <span className={'chipbox shrink-0 ' + (n.read ? 'bg-wash' : 'bg-rose')}>
                  <Icon name="bell" size={16} className={n.read ? 'text-muted-2' : 'text-rose-ink'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block text-[14px] leading-snug ' + (n.read ? 'text-ink-2' : 'font-semibold')}>
                    {n.text}
                  </span>
                  <span className="block text-[12px] text-muted-2 mt-0.5 whitespace-nowrap">
                    {notifTime(n.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
