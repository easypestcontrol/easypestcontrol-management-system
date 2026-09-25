'use client';

/* ============================================================================
   One team member, on a phone.

   Opened to ring somebody, or to check what they are doing today. So the
   phone number is a button, and today's work is directly beneath it.

   The employee record — Aadhaar, blood group, address, working hours — is
   below that and deliberately quiet. It is filled in once when somebody
   joins, at a desk, and read only when it is genuinely needed.
   ========================================================================== */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { BackBar, Card, Chip, IconButton, Row, Screen, niceDate } from '@/components/mobile';

/* Mirrors the shape the team endpoint sends -- no `type` on it, so the row
   shows the time and the state and does not invent a service name. */
interface JobToday { id: string; clientName: string; slot: string; status: string }

export default function MemberMobile({
  m, branchName, roleLabel, canManage, onEdit, onToggleActive, onSetPassword,
}: {
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
  /** admin/ops only: everyone else sees the profile, not the controls. */
  canManage?: boolean;
  onEdit?: () => void;
  onToggleActive?: () => void;
  /** Resolves on success; throws with a message the drawer shows on failure. */
  onSetPassword?: (password: string) => Promise<void>;
}) {
  const initials = m.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const today = m.todayJobs || [];

  /* Set-password lives inline, in its own drawer under the button: a phone has
     nowhere to put a separate screen for one field, and a bottom sheet for a
     single input is a lot of ceremony for a rare, small job. */
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwOk, setPwOk] = useState(false);

  async function savePw() {
    if (!onSetPassword) return;
    setPwBusy(true); setPwMsg('');
    try {
      await onSetPassword(pw);
      setPw(''); setPwOk(true); setPwMsg('Password updated');
      setTimeout(() => { setPwOpen(false); setPwMsg(''); }, 1600);
    } catch (e) {
      setPwOk(false);
      setPwMsg(e instanceof Error ? e.message : 'Could not set the password');
    } finally { setPwBusy(false); }
  }

  return (
    <Screen>
      <BackBar title={m.name} fallback={'/team'} sub={roleLabel || undefined}
        right={canManage
          ? <IconButton name="edit" label="Edit member" onClick={onEdit} />
          : undefined} />
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
        <Card title="Record" flush className={canManage ? '' : 'mb-4'}>
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

        {/* The office's controls, kept together and out of the field's way. */}
        {canManage && (
          <Card title="Manage" flush className="mb-4">
            <button type="button" onClick={onEdit}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-line-soft text-left active:bg-wash">
              <Icon name="edit" size={18} className="text-muted-2 shrink-0" />
              <span className="flex-1 text-[14.5px] font-medium">Edit details</span>
              <Icon name="chevRight" size={16} className="text-muted-2 shrink-0" />
            </button>

            <button type="button" onClick={() => { setPwOpen((v) => !v); setPwMsg(''); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-line-soft text-left active:bg-wash">
              <Icon name="settings" size={18} className="text-muted-2 shrink-0" />
              <span className="flex-1 text-[14.5px] font-medium">Set a new password</span>
              <Icon name="chevRight" size={16}
                className={'text-muted-2 shrink-0 transition-transform ' + (pwOpen ? 'rotate-90' : '')} />
            </button>
            {pwOpen && (
              <div className="px-4 py-3.5 border-b border-line-soft bg-wash">
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                  placeholder="New password, at least 6 characters" autoComplete="new-password"
                  className="w-full h-11 px-3 rounded-xl border border-line bg-wash text-[16px]
                    outline-none transition-colors focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]" />
                {pwMsg && (
                  <p className={'text-[12.5px] mt-2 font-medium ' + (pwOk ? 'text-mint-ink' : 'text-accent')}>
                    {pwMsg}
                  </p>
                )}
                <button type="button" onClick={savePw} disabled={pwBusy || pw.length < 6}
                  className="mt-2.5 w-full h-11 rounded-xl bg-accent text-white font-bold text-[14.5px]
                    active:brightness-90 disabled:opacity-50">
                  {pwBusy ? 'Saving…' : 'Save password'}
                </button>
              </div>
            )}

            <button type="button" onClick={onToggleActive}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-wash">
              <Icon name={m.active ? 'logout' : 'check'} size={18}
                className={'shrink-0 ' + (m.active ? 'text-accent' : 'text-mint-ink')} />
              <span className={'flex-1 text-[14.5px] font-medium ' + (m.active ? 'text-accent' : 'text-mint-ink')}>
                {m.active ? 'Deactivate this member' : 'Reactivate this member'}
              </span>
            </button>
          </Card>
        )}
      </div>
    </Screen>
  );
}
