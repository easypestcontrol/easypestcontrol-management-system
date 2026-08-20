'use client';

/* ============================================================================
   Team — the staff directory. Branch chips filter the roster; technicians
   carry their delivery stats. Ported from v1 team.js (V.team).
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { isFieldTech } from 'shared';

interface TechPerf {
  total: number; done: number; today: number; todayDone: number;
  open: number; rating: number; ratedN: number;
}

interface Member {
  id: string; name: string; role: string; title: string; phone: string;
  email: string; color: string; joined: string; skills: string[];
  branches: string[]; photo: string; active: boolean; perf: TechPerf | null;
}

interface TeamList { members: Member[]; unposted: number }

interface BranchRow { id: string; name: string; code: string; areas: string[]; staff: number }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator', ops: 'Operations Manager', sales: 'Sales Executive',
  tech: 'Field Technician', accounts: 'Accounts & Billing',
};

function Avatar({ m, size = 28 }: { m: Member; size?: number }) {
  if (m.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.photo} alt="" className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: m.color || '#1B2E65' }}>
      {m.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </span>
  );
}

export default function Team() {
  const router = useRouter();
  const [data, setData] = useState<TeamList | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchFilter, setBranchFilter] = useState('');

  useEffect(() => {
    api.get<TeamList>('/team').then(setData).catch(() => setData({ members: [], unposted: 0 }));
    api.get<BranchRow[]>('/branches').then(setBranches).catch(() => {});
  }, []);

  const all = data?.members ?? [];
  const members = branchFilter ? all.filter((m) => m.branches.includes(branchFilter)) : all;
  const techs = members.filter((m) => isFieldTech(m.role));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id;
  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code || id;

  return (
    <div>
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Team</h1>
          {data && (
            <span className="text-muted-2 text-[12.5px]">
              {members.length} people · {techs.length} field technicians
              {branchFilter ? ' · ' + branchName(branchFilter) : ''}
            </span>
          )}
        </div>
        <button onClick={() => router.push('/team/new')}
          className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> Add member
        </button>
      </div>

      {/* branch chips */}
      <div className="px-6 py-3 border-b border-line-soft flex items-center gap-2 flex-wrap">
        <button onClick={() => setBranchFilter('')}
          className={'h-7 px-3 rounded-full text-[12.5px] border transition-colors ' +
            (!branchFilter ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
          All branches
        </button>
        {branches.map((b) => (
          <button key={b.id} onClick={() => setBranchFilter(b.id)}
            className={'h-7 px-3 rounded-full text-[12.5px] border transition-colors flex items-center gap-1.5 ' +
              (branchFilter === b.id ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
            <Icon name="branch" size={13} /> {b.name}
            <span className={branchFilter === b.id ? 'opacity-70' : 'text-muted-2'}>{b.staff}</span>
          </button>
        ))}
      </div>

      {data && data.unposted > 0 && (
        <div className="mx-6 mt-4 px-4 py-3 rounded border border-red-line bg-red-wash text-[13px]">
          <span className="font-semibold">
            {data.unposted} team member{data.unposted === 1 ? '' : 's'} without a branch.
          </span>{' '}
          <span className="text-ink-2">
            Open the member and pick their branches so they show up on branch filters and reports.
          </span>
        </div>
      )}

      {!data ? (
        <p className="p-6 text-muted text-[13px]">Loading…</p>
      ) : members.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-[15px] font-medium">Nobody at this branch</p>
          <p className="text-muted text-[13px] mt-1">Choose another branch above, or post someone to this one.</p>
        </div>
      ) : (
        <table className="ztable mt-4">
          <thead>
            <tr>
              <th>Member</th><th>Role</th><th>Branches</th><th>Contact</th>
              <th>Joined</th><th style={{ textAlign: 'right' }}>Services done</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="zrow" onClick={() => router.push('/team/' + m.id)}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <Avatar m={m} />
                    <span>
                      <span className="block font-medium text-navy">{m.name}</span>
                      <span className="block text-[11px] text-muted-2">{m.title}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className={'zpill ' + (isFieldTech(m.role) ? 'navy' : 'outline')}>
                    {ROLE_LABEL[m.role] || m.role}
                  </span>
                </td>
                <td>
                  {m.branches.length ? (
                    <span className="flex gap-1 flex-wrap">
                      {m.branches.map((id) => (
                        <span key={id} className="zpill" title={branchName(id)}>{branchCode(id)}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="zpill red">None</span>
                  )}
                </td>
                <td>
                  <span className="block">{m.phone || '—'}</span>
                  <span className="block text-[11.5px] text-muted">{m.email}</span>
                </td>
                <td className="text-muted">{m.joined || '—'}</td>
                <td style={{ textAlign: 'right' }} className="font-medium">
                  {m.perf ? m.perf.done : '—'}
                </td>
                <td>
                  {m.active
                    ? <span className="zpill outline">Active</span>
                    : <span className="zpill red">Inactive</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
