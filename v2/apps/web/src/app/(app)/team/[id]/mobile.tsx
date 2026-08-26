'use client';

/* ============================================================================
   One team member, on a phone.

   Opened to ring somebody, or to check what they are doing today. So the
   phone number is a button, and today's work is directly beneath it.

   The employee record — Aadhaar, blood group, address, working hours — is
   below that and deliberately quiet. It is filled in once when somebody
   joins, at a desk, and read only when it is genuinely needed.
   ========================================================================== */

import { Icon } from '@/components/icons';
import { Card, Chip, Row, Screen, niceDate } from '@/components/mobile';

/* Mirrors the shape the team endpoint sends -- no `type` on it, so the row
   shows the time and the state and does not invent a service name. */
interface JobToday { id: string; clientName: string; slot: string; status: string }

export default function MemberMobile({ m, branchName, roleLabel }: {
  m: {
    id: string; name: string; role: string; title: string; phone: string; email: string;
    color: string; joined: string; skills: string[]; branches: string[];
    empType: string; blood: string; addr: string; active: boolean;
    hoursFrom: string; hoursTo: string;
    rating: number; jobsDone: number;
    todayJobs?: JobToday[];
  };
  branchName: (id: string) => string;
  roleLabel: string;
}) {
  const initials = m.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const today = m.todayJobs || [];

  return (
    <Screen>
      <div className="bg-white px-4 pt-4 pb-5 text-center">
        <span className="w-16 h-16 rounded-full text-white text-[22px] font-bold
          flex items-center justify-center mx-auto"
          style={{ background: m.color || '#141414' }}>{initials}</span>
        <h1 className="text-[20px] font-bold mt-3 tracking-[-0.02em]">{m.name}</h1>
        <p className="text-[13.5px] text-muted mt-1">{m.title || roleLabel}</p>
        <div className="mt-2.5 flex items-center justify-center gap-2">
          <Chip tone={m.active ? 'good' : 'plain'}>{m.active ? 'Working' : 'Not active'}</Chip>
          {m.jobsDone > 0 && <Chip tone="info">{m.jobsDone} services done</Chip>}
        </div>

        {m.phone && (
          <div className="flex gap-2 mt-4">
            <a href={'tel:' + m.phone}
              className="flex-1 h-12 rounded-xl bg-accent text-white font-bold text-[15px]
                flex items-center justify-center gap-2 active:brightness-90">
              <Icon name="phone" size={18} /> Call
            </a>
            <a href={'https://wa.me/91' + m.phone.replace(/\D/g, '').slice(-10)}
              className="flex-1 h-12 rounded-xl bg-wash font-bold text-[15px]
                flex items-center justify-center active:brightness-95">
              WhatsApp
            </a>
          </div>
        )}
      </div>

      <div className="px-4 pt-3 flex flex-col gap-3">
        {today.length > 0 && (
          <Card title="Today" flush>
            {today.map((j) => (
              <Row key={j.id} href={'/jobs/' + j.id}
                title={j.clientName}
                right={j.slot}
                chip={<Chip tone={j.status === 'completed' ? 'good' : 'info'}>
                  {j.status === 'completed' ? 'Done' : 'Scheduled'}
                </Chip>} />
            ))}
          </Card>
        )}

        <Card title="Posted to" flush>
          {m.branches.length === 0 ? (
            <p className="px-4 pb-4 text-[14px] text-muted">No branch. They will see nothing.</p>
          ) : (
            m.branches.map((b) => (
              <div key={b} className="px-4 py-3 border-b border-line-soft last:border-b-0 text-[14.5px]">
                {branchName(b) || b}
              </div>
            ))
          )}
        </Card>

        {m.skills.length > 0 && (
          <Card title="Can do">
            <div className="flex flex-wrap gap-1.5">
              {m.skills.map((s) => (
                <span key={s} className="h-7 px-3 rounded-full bg-wash text-[13px] font-medium
                  flex items-center">{s}</span>
              ))}
            </div>
          </Card>
        )}

        {/* Filled in once when somebody joins, read only when needed. */}
        <Card title="Record" flush className="mb-4">
          {[
            { k: 'Role', v: roleLabel },
            { k: 'Phone', v: m.phone },
            { k: 'Email', v: m.email },
            { k: 'Joined', v: m.joined ? niceDate(m.joined) : '' },
            { k: 'Employment', v: m.empType },
            { k: 'Hours', v: m.hoursFrom && m.hoursTo ? m.hoursFrom + ' – ' + m.hoursTo : '' },
            { k: 'Blood group', v: m.blood },
            { k: 'Address', v: m.addr },
          ].filter((x) => x.v).map((x) => (
            <div key={x.k} className="flex gap-3 px-4 py-3 border-b border-line-soft last:border-b-0">
              <span className="w-[92px] shrink-0 text-[13px] text-muted">{x.k}</span>
              <span className="flex-1 text-[14.5px] break-words">{x.v}</span>
            </div>
          ))}
        </Card>
      </div>
    </Screen>
  );
}
