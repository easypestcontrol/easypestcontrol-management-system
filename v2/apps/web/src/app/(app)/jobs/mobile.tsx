'use client';

/* ============================================================================
   Services, on a phone.

   The day as a list, in the order it happens. The one thing that genuinely
   needs a person — work with nobody assigned to it — is lifted out of the
   list into a banner above it, because buried in a list it reads as just
   another row, and it is not: every other row is somebody else's problem
   until it goes wrong.
   ========================================================================== */

import {
  Card, Chip, Row, Screen, Filters, ScreenTitle, IconButton, Alert, Fab,
  niceDate, type Tone,
} from '@/components/mobile';
import type { JobRow, JobsList } from './format';

/* ------------------------------------------------------------------ state */

function stateOf(j: JobRow): { tone: Tone; label: string } {
  if (j.status === 'completed') return { tone: 'good', label: 'Completed' };
  if (j.status === 'cancelled') return { tone: 'plain', label: 'Cancelled' };
  if (!j.techIds?.length) return { tone: 'bad', label: 'Needs a technician' };
  if (j.status === 'in_progress' || j.status === 'started') return { tone: 'warn', label: 'In progress' };
  if (j.status === 'on_the_way') return { tone: 'info', label: 'On the way' };
  return { tone: 'info', label: 'Scheduled' };
}

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'open', label: 'All open' },
  { key: 'completed', label: 'Done' },
];

/* ----------------------------------------------------------------- screen */

export default function JobsMobile({ data, tab, onTab, techName, onNew }: {
  data: JobsList | null;
  tab: string;
  onTab: (t: string) => void;
  /** Turns a technician id into a name; the row shows people, not ids. */
  techName: (id: string) => string;
  onNew?: () => void;
}) {
  const rows = data?.rows || [];
  const unassigned = data?.counts.unassigned || 0;

  return (
    <Screen>
      <ScreenTitle title="Services">
        <IconButton name="calendar" href="/schedule" label="Schedule" />
      </ScreenTitle>

      <Filters value={tab} onChange={onTab} options={TABS} />

      {!data ? (
        <div className="px-4 pt-3 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[84px] rounded-2xl bg-white animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-3">
          {/* The only thing on this screen that needs a decision. */}
          {unassigned > 0 && tab !== 'unassigned' && (
            <Alert href="/board">
              {unassigned === 1
                ? '1 service has no technician'
                : `${unassigned} services have no technician`}
            </Alert>
          )}

          {rows.length === 0 ? (
            <Card>
              <p className="text-[16px] font-bold text-center">Nothing here</p>
              <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
                {tab === 'today'
                  ? 'No services scheduled for today.'
                  : tab === 'unassigned'
                    ? 'Every service has a technician. Nothing to do.'
                    : 'Nothing in this list right now.'}
              </p>
            </Card>
          ) : (
            <Card flush className="mb-4">
              {rows.map((j) => {
                const st = stateOf(j);
                const who = (j.techIds || []).map(techName).filter(Boolean).join(', ');
                return (
                  <Row key={j.id} href={'/jobs/' + j.id}
                    title={j.clientName || j.clientId}
                    right={j.slot || niceDate(j.date)}
                    meta={[j.title || j.type, j.clientArea, who].filter(Boolean).join(' · ')}
                    chip={<Chip tone={st.tone}>{st.label}</Chip>} />
                );
              })}
            </Card>
          )}
        </div>
      )}

      {onNew && <Fab onClick={onNew} label="New service" />}
    </Screen>
  );
}
