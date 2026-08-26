'use client';

/* ============================================================================
   The schedule, on a phone.

   A month grid is thirty small squares; at 390px each is about fifty pixels
   wide and holds nothing you can read. So the phone gets a week strip you
   swipe along and the chosen day as a list — which is how somebody away from
   a desk actually uses a calendar: not "show me October", but "what is on
   tomorrow?".

   The full month, and dragging work between technicians, stay on the desktop.
   ========================================================================== */

import { Card, Chip, Row, Screen, niceDate, type Tone } from '@/components/mobile';
import type { DayBoard, DayJob } from '../jobs/format';

function stateOf(j: DayJob): { tone: Tone; label: string } {
  if (j.status === 'completed') return { tone: 'good', label: 'Done' };
  if (j.status === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (!j.techIds?.length) return { tone: 'bad', label: 'Needs a technician' };
  if (j.status === 'inprogress' || j.status === 'enroute') return { tone: 'warn', label: 'Under way' };
  return { tone: 'info', label: 'Scheduled' };
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Seven days around the chosen one — the window a person actually plans in. */
function weekAround(iso: string): string[] {
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const out: string[] = [];
  for (let i = -2; i <= 4; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export default function ScheduleMobile({ day, selDate, onPick, counts, today }: {
  day: DayBoard | null;
  selDate: string;
  onPick: (iso: string) => void;
  /** How many services fall on each date, for the strip. */
  counts: Record<string, number>;
  today: string;
}) {
  const week = weekAround(selDate);

  // Everything on the chosen day, in the order it happens, whoever it is for.
  const jobs: DayJob[] = day
    ? [...day.techs.flatMap((t) => t.jobs), ...day.unassigned]
        .sort((a, b) => (a.slot || '').localeCompare(b.slot || ''))
    : [];

  return (
    <Screen>
      <div className="bg-white px-4 pt-2 pb-3">
        <h1 className="text-[25px] font-bold tracking-[-0.025em]">Schedule</h1>
      </div>

      {/* The week strip. Swipes sideways; the chosen day is solid red. */}
      <div className="bg-white pb-3">
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar">
          {week.map((iso) => {
            const d = new Date(iso.split('-').map(Number)[0], Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
            const on = iso === selDate;
            const n = counts[iso] || 0;
            return (
              <button key={iso} onClick={() => onPick(iso)}
                className={'shrink-0 w-[54px] rounded-2xl py-2.5 flex flex-col items-center gap-0.5 '
                  + (on ? 'bg-accent text-white' : 'bg-ground')}>
                <span className={'text-[11.5px] font-semibold ' + (on ? 'text-white/75' : 'text-muted')}>
                  {DAY[d.getDay()]}
                </span>
                <span className="text-[19px] font-bold leading-none tabular-nums">{d.getDate()}</span>
                <span className={'text-[11px] leading-none mt-0.5 '
                  + (on ? 'text-white/75' : n > 0 ? 'text-accent font-semibold' : 'text-muted-2')}>
                  {n > 0 ? n : '·'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {!day ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[84px] rounded-2xl bg-white animate-pulse" />)
        ) : jobs.length === 0 ? (
          <Card>
            <p className="text-[16px] font-bold text-center">
              Nothing on {selDate === today ? 'today' : niceDate(selDate)}
            </p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              Pick another day above, or schedule something from a contract.
            </p>
          </Card>
        ) : (
          <>
            {day.unassigned.length > 0 && (
              <div className="rounded-2xl bg-rose px-3.5 py-3 text-[14px] font-semibold text-rose-ink">
                {day.unassigned.length === 1
                  ? '1 service here has no technician'
                  : `${day.unassigned.length} services here have no technician`}
              </div>
            )}
            <Card flush className="mb-4">
              {jobs.map((j) => {
                const st = stateOf(j);
                return (
                  <Row key={j.id} href={'/jobs/' + j.id}
                    title={j.clientName || j.clientId}
                    right={j.slot || ''}
                    meta={j.title || j.type}
                    chip={<Chip tone={st.tone}>{st.label}</Chip>} />
                );
              })}
            </Card>
          </>
        )}
      </div>
    </Screen>
  );
}
