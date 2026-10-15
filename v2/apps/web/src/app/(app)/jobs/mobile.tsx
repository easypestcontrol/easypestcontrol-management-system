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
  SearchBox, niceDate, type Tone, whenShort,
} from '@/components/mobile';
import Link from 'next/link';
import { Icon } from '@/components/icons';
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

export default function JobsMobile({ data, tab, onTab, techName, onNew, q, onSearch, canSchedule }: {
  data: JobsList | null;
  tab: string;
  onTab: (t: string) => void;
  /** Turns a technician id into a name; the row shows people, not ids. */
  techName: (id: string) => string;
  onNew?: () => void;
  /** The same search the desk has: a customer, an address, a service id. */
  q?: string;
  onSearch?: (v: string) => void;
  /** The office plans the week; a technician is handed his day. */
  canSchedule?: boolean;
}) {
  const rows = data?.rows || [];
  const unassigned = data?.counts.unassigned || 0;

  return (
    <Screen>
      <ScreenTitle title="Services">
        {/* The schedule is the office planning the week. A technician cannot
            move anybody's work, so the button only ever took him to a screen
            he could look at and not use. */}
        {/* The Schedule is a desk page; a phone has no way into it. */}
      </ScreenTitle>

      {onSearch && (
        <SearchBox value={q || ''} onChange={onSearch} placeholder="Search a customer or a service" />
      )}

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
                {q
                  ? 'Nothing matches that. Try a phone number, or part of the name.'
                  : tab === 'today'
                    ? 'No services scheduled for today.'
                    : tab === 'unassigned'
                      ? 'Every service has a technician. Nothing to do.'
                      : 'Nothing in this list right now.'}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3 mb-4">
              {rows.map((j) => (
                <ServiceCard key={j.id} j={j} techName={techName} canAssign={!!canSchedule} />
              ))}
            </div>
          )}
        </div>
      )}

      {onNew && <Fab onClick={onNew} label="New service" />}
    </Screen>
  );
}

/* ------------------------------------------------------------ the card

   One visit, everything the office needs to read it without opening it:
   the day (with the year), the start and the end, the customer and the
   person to ask for, where it is, what is being done, where it stands and
   who is going. A visit with nobody on it says so in red and offers the
   one thing to do about it. */

type CardRow = JobRow & {
  clientContact?: string; clientPhone?: string; clientAddr?: string; serviceNames?: string[];
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ampmOf(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]);
  return (h % 12 || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM');
}
function plusMins(hhmm: string, mins: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return '';
  const t = (Number(m[1]) * 60 + Number(m[2]) + mins) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/* Sizes here are rem-based (text-base/sm/xs), not the fixed-px classes the
   rest of the app uses: the phone's type scale steps every fixed size up a
   notch, which is what made the first version of this card shout. */
const PILL: Record<Tone, string> = {
  good: 'bg-mint text-mint-ink', bad: 'bg-red-wash text-accent', warn: 'bg-amber text-amber-ink',
  info: 'bg-sky text-sky-ink', plain: 'bg-wash text-muted',
};

function ServiceCard({ j, techName, canAssign }: {
  j: CardRow; techName: (id: string) => string; canAssign: boolean;
}) {
  const st = stateOf(j);
  const p = String(j.date || '').split('-').map(Number);
  const d = p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : null;
  const end = j.slotEnd || (j.slot ? plusMins(j.slot, j.mins || 60) : '');
  const services = j.serviceNames?.length ? j.serviceNames : [j.title || j.type];
  const crew = (j.techIds || []).map(techName).filter(Boolean);
  const unassigned = !crew.length && j.status !== 'completed' && j.status !== 'cancelled';
  const day = d ? WD[d.getDay()] + ', ' + d.getDate() + ' ' + MO[d.getMonth()] + ' ' + d.getFullYear() : '';
  const time = (ampmOf(j.slot) || '') + (end ? ' – ' + ampmOf(end) : '');

  return (
    <div data-service-card
      className="rounded-xl bg-white border border-[#cfd4de] overflow-hidden
        shadow-[0_1px_3px_rgba(20,20,20,0.08),0_4px_12px_rgba(20,20,20,0.08)]">
      <Link href={'/jobs/' + j.id} className="block px-3.5 pt-3 pb-2.5 active:bg-wash">
        {/* who, and where it stands */}
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-base font-bold truncate">{j.clientName || j.clientId}</p>
          <span className={'shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-xs font-semibold whitespace-nowrap ' + PILL[st.tone]}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{st.label}
          </span>
        </div>
        {(j.clientContact || j.clientPhone) && (
          <p className="text-sm text-ink-2 truncate mt-0.5">
            {j.clientContact}{j.clientContact && j.clientPhone ? ' · ' : ''}{j.clientPhone}
          </p>
        )}
        {(j.clientAddr || j.clientArea) && (
          <p className="text-xs text-muted truncate mt-0.5">{j.clientAddr || j.clientArea}</p>
        )}

        {/* when: the date, the start and end, which visit - one line */}
        <div className="mt-2.5 rounded-lg bg-ground px-2.5 py-2 flex items-center gap-2 min-w-0">
          <Icon name="calendar" size={14} className="text-muted shrink-0" />
          <p className="min-w-0 flex-1 text-sm truncate whitespace-nowrap">
            <span className="font-semibold">{day}</span>
            {time && <span className="text-muted"> · </span>}
            {time && <span className="font-bold tabular-nums">{time}</span>}
          </p>
          {j.ofVisits > 1 && (
            <span className="shrink-0 text-xs font-semibold text-muted whitespace-nowrap">
              {j.visitNo}/{j.ofVisits}
            </span>
          )}
        </div>

        {/* what is being done - one line */}
        <p className="mt-2 text-sm text-sky-ink font-semibold truncate">
          <span className="text-xs font-bold uppercase tracking-[0.05em] text-muted-2 mr-1.5">
            {services.length === 1 ? 'Service' : 'Services'}
          </span>
          {services.join(' + ')}
        </p>
      </Link>

      {/* who is going - one line */}
      <div className={'px-3.5 py-2 border-t flex items-center gap-2.5 '
        + (unassigned ? 'border-red-line bg-red-wash' : 'border-line-soft bg-[#fafbfc]')}>
        {unassigned ? (
          <>
            <p className="flex-1 min-w-0 text-sm font-semibold text-accent truncate">
              No technician yet{j.crewNeed > 1 ? ' · needs ' + j.crewNeed : ''}
            </p>
            {canAssign && (
              <Link href={'/jobs/' + j.id}
                className="h-[28px] px-3 rounded-md bg-accent text-white text-xs font-bold inline-flex items-center shrink-0">
                Assign
              </Link>
            )}
          </>
        ) : (
          <>
            <Icon name="team" size={14} className="text-muted shrink-0" />
            <p className="flex-1 min-w-0 text-sm truncate">{crew.join(', ')}</p>
          </>
        )}
        <span className="text-xs font-mono text-muted-2 shrink-0">{j.id}</span>
      </div>
    </div>
  );
}
