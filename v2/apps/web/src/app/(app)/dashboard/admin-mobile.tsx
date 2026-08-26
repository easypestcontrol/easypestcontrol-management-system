'use client';

/* ============================================================================
   Home, on a phone.

   The office runs on a laptop. This screen exists for the other moments —
   standing at a gate, in a car, at a customer's counter — so it answers the
   three questions that get asked away from the desk, in the order they get
   asked: what is owed, what is going wrong, and what do I need to start.

   Everything else is a number you tap. A dashboard on a phone is a doorway,
   not a place to work.
   ========================================================================== */

import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';
import {
  Card, Chip, Row, Screen, Stack, Stat, QuickTiles,
  money, compact, niceDate,
} from '@/components/mobile';
import type { DashboardStats, SessionUser } from '@/lib/api';

/* --------------------------------------------------------------- the chart */

/**
 * Six months of collections as one soft curve.
 *
 * No gridlines, no axis, no tooltip — at this size they are noise. The shape
 * is the message: is the line climbing or falling. The exact figures live on
 * the Reports screen, which is a desk job anyway.
 */
function Collections({ months }: { months: DashboardStats['months'] }) {
  const pts = months.slice(-6);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((m) => m.collected), 1);
  const W = 320, H = 96;
  const xy = pts.map((m, i) => [
    (i / (pts.length - 1)) * W,
    H - (m.collected / max) * (H - 12) - 6,
  ] as const);

  // A Catmull-Rom-ish smoothing: straight segments read as a sawtooth at this
  // width, and the point is the trend, not the joins.
  let d = `M${xy[0][0]} ${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const [x0, y0] = xy[i];
    const [x1, y1] = xy[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  const last = xy[xy.length - 1];

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[96px] block">
        <defs>
          <linearGradient id="collect" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF0000" stopOpacity="0.20" />
            <stop offset="1" stopColor="#FF0000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#collect)" />
        <path d={d} fill="none" stroke="#FF0000" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="#FF0000" />
      </svg>
      <div className="flex justify-between mt-2">
        {pts.map((m) => (
          <span key={m.label} className="text-[11.5px] text-muted">{m.label}</span>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ screen */

export default function AdminMobile({ s, me, actions, branchEl }: {
  s: DashboardStats | null;
  me: SessionUser | null;
  actions: Array<{ href: string; label: string; icon: IconName }>;
  branchEl?: React.ReactNode;
}) {
  const rate = s && s.billed > 0 ? Math.round((s.collected / s.billed) * 100) : 0;
  const empty = !!s && !s.clients && !s.leads && !s.contracts && !s.billed && !s.jobsToday;
  // The mix already counts them by status; asking the server again for a
  // number it has just sent would be a second round trip for nothing.
  const overdue = s?.invoiceMix.find((m) => m.status === 'overdue');

  // Four to start. Whatever the role is allowed, in the order it gets used.
  const quick = actions.slice(0, 4).map((a, i) => ({
    href: a.href,
    label: a.label.replace(/^(New|Add|Raise) /, ''),
    icon: a.icon,
    tint: (['rose', 'sky', 'mint', 'wash'] as const)[i],
  }));

  return (
    <Screen>
      {/* ------------------------------------------------------- app bar */}
      <div className="bg-white px-4 pt-2.5">
        <div className="flex items-center gap-2.5 h-[46px]">
          <span className="w-[34px] h-[34px] rounded-full bg-accent text-white flex items-center
            justify-center font-bold text-[15px] shrink-0">E</span>
          <span className="flex-1 min-w-0 text-[16px] font-bold truncate">
            {me?.name?.split(' ')[0] ? `Hello, ${me.name.split(' ')[0]}` : 'Easy Pest Control'}
          </span>
          {branchEl}
          <Link href="/notifications" aria-label="Notifications"
            className="w-[38px] h-[38px] rounded-full bg-wash flex items-center justify-center relative">
            <Icon name="bell" size={19} />
          </Link>
        </div>
      </div>

      {!s ? (
        <Stack>
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-2xl bg-white animate-pulse" />)}
          </div>
          <div className="h-[120px] rounded-2xl bg-white animate-pulse" />
          <div className="h-[170px] rounded-2xl bg-white animate-pulse" />
        </Stack>
      ) : empty ? (
        <Stack>
          <Card>
            <p className="text-[16px] font-bold text-center">Nothing to show yet</p>
            <p className="text-muted text-[14px] mt-1.5 text-center leading-relaxed">
              This fills itself in as the business runs. Set it up in this order and every
              screen after it has what it needs.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {[
                { href: '/branches', label: 'Add your branch' },
                { href: '/services', label: 'List the services you sell' },
                { href: '/chemicals', label: 'Add your chemicals' },
                { href: '/team', label: 'Add your technicians' },
                { href: '/customers?new=1', label: 'Add your first customer' },
              ].map((x, i) => (
                <Link key={x.href} href={x.href}
                  className="flex items-center gap-3 h-[52px] px-3 rounded-xl bg-ground active:brightness-95">
                  <span className="w-6 h-6 rounded-full bg-navy text-white text-[11.5px] font-bold
                    flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="flex-1 text-[14.5px] font-medium">{x.label}</span>
                  <Icon name="chevRight" size={16} className="text-muted-2" />
                </Link>
              ))}
            </div>
          </Card>
        </Stack>
      ) : (
        <Stack>
          {/* --------------------------------------------------- the money */}
          <div className="grid grid-cols-2 gap-2.5">
            <Stat href="/invoices" label="Total receivable"
              value={compact(s.outstanding)} foot={`${s.clients} customers`} />
            <Stat href="/invoices?filter=overdue" tone="bad" label="Overdue invoices"
              value={overdue?.n || 0}
              foot={overdue && overdue.value > 0 ? compact(overdue.value) : 'None overdue'} />
            <Stat href="/invoices" label="Collected"
              value={compact(s.collected)} foot={`${rate}% of billed`} />
            <Stat href="/board" tone="bad" label="Services with no technician"
              value={s.waiting} foot={s.waiting > 0 ? 'Assign them' : 'All covered'} />
          </div>

          {/* ------------------------------------------------ quick create */}
          {quick.length > 0 && (
            <Card title="Start something" icon="plus">
              <QuickTiles items={quick} />
            </Card>
          )}

          {/* ----------------------------------------------- collections */}
          {s.months.length > 1 && (
            <Card title="Collections" icon="report">
              <Collections months={s.months} />
            </Card>
          )}

          {/* -------------------------------------------- today's services */}
          <Card title="Today's services" action="View all" actionHref="/schedule" flush>
            {s.upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-[14px] text-muted">Nothing scheduled.</p>
            ) : (
              s.upcoming.slice(0, 4).map((j) => (
                <Row key={j.id} href={'/jobs/' + j.id}
                  title={j.client}
                  right={j.slot || niceDate(j.date)}
                  meta={[j.type, j.techs || 'Not assigned'].filter(Boolean).join(' · ')}
                  chip={j.techs
                    ? <Chip tone="info">Scheduled</Chip>
                    : <Chip tone="bad">Needs a technician</Chip>} />
              ))
            )}
          </Card>

          {/* ------------------------------------------------- money in */}
          {s.recentPayments.length > 0 && (
            <Card title="Money in" action="View all" actionHref="/invoices" flush>
              {s.recentPayments.slice(0, 4).map((p) => (
                <Row key={p.id} href={'/invoices/' + p.invoiceId}
                  title={p.client}
                  amount={money(p.amount)}
                  meta={[p.mode, niceDate(p.date)].filter(Boolean).join(' · ')}
                  chip={<Chip tone="good">Received</Chip>} />
              ))}
            </Card>
          )}
        </Stack>
      )}

    </Screen>
  );
}
