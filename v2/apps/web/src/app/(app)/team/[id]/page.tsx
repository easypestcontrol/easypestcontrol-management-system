'use client';

/* ============================================================================
   Team member — the employee record HR actually needs, and the editor that
   maintains it. Ported from v1 team.js (memberEditor + V.teamDetail).

   /team/new  → blank editor, POST /team (server mints the U-id and hashes
                the default password 'pestops123')
   /team/U04  → record view; Edit flips the same form into PATCH mode.

   The signature upload matters: it is placed on every quotation and contract
   this person raises, so it never has to be drawn by hand (team.js:159).
   Members are deactivated, never deleted.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { isFieldTech } from 'shared';

/* ------------------------------------------------------------ vocabulary */

const ROLE_META: Record<string, { label: string; desc: string }> = {
  admin: { label: 'Administrator', desc: 'Full access — business, money, people, settings' },
  ops: { label: 'Operations Manager', desc: 'Scheduling, dispatch, technicians, audits' },
  sales: { label: 'Sales Executive', desc: 'Leads, quotations, customer onboarding' },
  tech: { label: 'Field Technician', desc: 'Today’s work, service execution, photo proof' },
  senior_tech: {
    label: 'Senior Technician',
    desc: 'Everything a technician does, plus issuing chemicals from inventory',
  },
  accounts: { label: 'Accounts & Billing', desc: 'Invoices, receipts, payment follow-up' },
};
const ROLE_ORDER = ['admin', 'ops', 'sales', 'tech', 'senior_tech', 'accounts'];

const DEFAULT_TITLE: Record<string, string> = {
  admin: 'Administrator', ops: 'Operations Manager', sales: 'Sales Executive',
  tech: 'Technician', senior_tech: 'Senior Technician', accounts: 'Accounts Executive',
};

const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Son', 'Daughter', 'Guardian', 'Friend'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Probation', 'Intern'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ------------------------------------------------------------------ types */

interface Emergency { name: string; relation: string; phone: string }

interface TechPerf {
  total: number; done: number; today: number; todayDone: number;
  open: number; rating: number; ratedN: number; hours?: number;
}

interface JobToday { id: string; clientName: string; slot: string; status: string }
interface JobDone {
  id: string; clientName: string; date: string; durationMins: number;
  findings: string[]; rating: number;
}

interface Member {
  id: string; name: string; role: string; title: string; phone: string; email: string;
  color: string; joined: string; skills: string[]; branches: string[];
  photo: string; sign: string; empType: string; dob: string; blood: string;
  aadhaar: string; addr: string; emergency: Emergency[];
  hoursFrom: string; hoursTo: string; hoursDays: number[];
  rating: number; jobsDone: number; active: boolean;
  perf: TechPerf | null; todayJobs?: JobToday[]; doneJobs?: JobDone[];
}

interface BranchRow { id: string; name: string; code: string }

interface Draft {
  name: string; phone: string; email: string; aadhaar: string; dob: string;
  blood: string; addr: string; role: string; title: string; empType: string;
  joined: string; skillsText: string; branches: string[];
  hoursFrom: string; hoursTo: string; hoursDays: number[];
  emergency: Emergency[]; photo: string; sign: string;
}

/* ---------------------------------------------------------------- helpers */

const BLANK_KIN: Emergency = { name: '', relation: 'Father', phone: '' };

function toDraft(m: Member | null): Draft {
  return {
    name: m?.name || '', phone: m?.phone || '', email: m?.email || '',
    aadhaar: m?.aadhaar || '', dob: m?.dob || '', blood: m?.blood || '',
    addr: m?.addr || '', role: m?.role || 'tech',
    title: m?.title || DEFAULT_TITLE[m?.role || 'tech'],
    empType: m?.empType || 'Full-time', joined: m?.joined || '',
    skillsText: (m?.skills || []).join(', '), branches: m?.branches || [],
    hoursFrom: m?.hoursFrom || '', hoursTo: m?.hoursTo || '',
    hoursDays: m?.hoursDays || [],
    emergency: m?.emergency?.length ? m.emergency.map((e) => ({ ...e })) : [{ ...BLANK_KIN }],
    photo: m?.photo || '', sign: m?.sign || '',
  };
}

/** v1 ui.js:211-226 — downscale to max px on the long edge, JPEG q0.72. */
function shrinkImage(file: File, max: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        try { resolve(cv.toDataURL('image/jpeg', 0.72)); } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** v1 store.js:365-370. */
function durationText(mins: number) {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const labelCls = 'block text-[12px] font-semibold text-ink-2 mb-1.5';
const sectionTitle =
  'text-[11.5px] font-semibold uppercase tracking-wider text-muted-2 mb-3 mt-7 first:mt-0';

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}

/* ==================================================================== page */

export default function TeamMember() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [member, setMember] = useState<Member | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    api.get<BranchRow[]>('/branches').then(setBranches).catch(() => {});
    if (isNew) return;
    api.get<Member>('/team/' + id)
      .then((m) => { setMember(m); setDraft(toDraft(m)); })
      .catch(() => setMissing(true));
  }, [id, isNew]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  /** Designation auto-follows the role default while still unedited (v1 team.js:224-226). */
  function onRole(role: string) {
    setDraft((d) => {
      const isDefault = !d.title.trim() || Object.values(DEFAULT_TITLE).includes(d.title.trim());
      return { ...d, role, title: isDefault ? DEFAULT_TITLE[role] || '' : d.title };
    });
  }

  async function save() {
    setErr('');
    if (!draft.name.trim() || !draft.phone.trim()) {
      setErr('Full name and phone are required'); return;
    }
    if (!draft.branches.length) {
      setErr('Select at least one branch — a member must be posted to a branch'); return;
    }
    const aad = draft.aadhaar.trim();
    if (aad && aad.replace(/\D/g, '').length !== 12) {
      setErr('Aadhaar number must be 12 digits'); return;
    }
    const kin = draft.emergency
      .map((e) => ({ name: e.name.trim(), relation: e.relation, phone: e.phone.trim() }))
      .filter((e) => e.name && e.phone);
    if (!kin.length) {
      setErr('One emergency contact is required — name and phone number are both needed'); return;
    }

    const body = {
      name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(),
      aadhaar: aad, dob: draft.dob, blood: draft.blood, addr: draft.addr.trim(),
      role: draft.role, title: draft.title.trim(), empType: draft.empType,
      joined: draft.joined,
      skills: draft.skillsText.split(',').map((x) => x.trim()).filter(Boolean),
      branches: draft.branches,
      hoursFrom: draft.hoursFrom, hoursTo: draft.hoursTo, hoursDays: draft.hoursDays,
      emergency: kin, photo: draft.photo, sign: draft.sign,
    };

    setSaving(true);
    try {
      if (isNew) {
        const created = await api.post<Member>('/team', body);
        router.replace('/team/' + created.id);
      } else {
        const updated = await api.patch<Member>('/team/' + id, body);
        setMember((m) => (m ? { ...m, ...updated } : m));
        setEditing(false);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!member) return;
    const verb = member.active ? 'Deactivate' : 'Reactivate';
    if (!window.confirm(`${verb} ${member.name}? They stay on every past record — nothing is deleted.`)) return;
    const updated = await api.patch<Member>('/team/' + id, { active: !member.active });
    setMember((m) => (m ? { ...m, active: updated.active } : m));
  }

  async function setPassword() {
    setPwMsg('');
    try {
      await api.post('/team/' + id + '/password', { password: pw });
      setPw(''); setPwOpen(false); setPwMsg('Password updated');
      setTimeout(() => setPwMsg(''), 3000);
    } catch (e) {
      setPwMsg(e instanceof ApiError ? e.message : 'Could not set password');
    }
  }

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Member not found</p>
        <p className="text-muted text-[13px] mt-1">They may have been removed.</p>
        <Link href="/team" className="inline-block mt-4 text-[13px] text-navy underline">Back to Team</Link>
      </div>
    );
  }
  if (!isNew && !member) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  /* ================================================================ editor */
  if (editing) {
    return (
      <div className="p-6 max-w-[860px]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold">
              {isNew ? 'Add team member' : 'Edit team member'}
            </h1>
            <p className="text-muted text-[13px] mt-0.5">
              Employee record, posting and access in PestOps.
              {isNew && ' They sign in with the default password pestops123.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (isNew) { router.push('/team'); return; }
                setDraft(toDraft(member));
                setEditing(false);
              }}
              className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
              <Icon name="check" size={14} /> {isNew ? 'Add member' : 'Save member'}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 px-4 py-2.5 rounded border border-red-line bg-red-wash text-[13px] text-accent font-medium">
            {err}
          </div>
        )}

        <div className="rounded-md border border-line p-5">
          {/* ------------------------------------------------- photo + sign */}
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              {draft.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.photo} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-16 h-16 rounded-full bg-wash flex items-center justify-center text-muted-2 shrink-0">
                  <Icon name="customers" size={24} />
                </span>
              )}
              <div>
                <span className={labelCls}>Photo</span>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash cursor-pointer">
                    <Icon name="upload" size={13} /> Upload
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) shrinkImage(f, 320).then((src) => set('photo', src));
                        e.target.value = '';
                      }} />
                  </label>
                  {draft.photo && (
                    <button onClick={() => set('photo', '')}
                      className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium text-accent hover:bg-red-wash">
                      <Icon name="x" size={13} /> Remove
                    </button>
                  )}
                </div>
                <p className="text-muted-2 text-[11.5px] mt-1.5">
                  JPG or PNG. Shown on service cards, dispatch boards and the customer report.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="w-[120px] h-16 rounded border border-line bg-wash flex items-center justify-center overflow-hidden shrink-0">
                {draft.sign
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={draft.sign} alt="Signature" className="max-w-full max-h-full object-contain" />
                  : <span className="text-muted-2 text-[11px]">No signature</span>}
              </span>
              <div>
                <span className={labelCls}>Signature</span>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash cursor-pointer">
                    <Icon name="upload" size={13} /> Upload
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) shrinkImage(f, 520).then((src) => set('sign', src));
                        e.target.value = '';
                      }} />
                  </label>
                  {draft.sign && (
                    <button onClick={() => set('sign', '')}
                      className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium text-accent hover:bg-red-wash">
                      <Icon name="x" size={13} /> Remove
                    </button>
                  )}
                </div>
                <p className="text-muted-2 text-[11.5px] mt-1.5">
                  A scan of their signature on white paper. It is placed on every quotation and
                  contract they raise, so it never has to be drawn by hand.
                </p>
              </div>
            </div>
          </div>

          {/* --------------------------------------------- identity & contact */}
          <p className={sectionTitle + ' mt-7'}>Identity &amp; contact</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" required>
              <input className={inputCls} value={draft.name} placeholder="e.g. Karthik R"
                onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Phone" required>
              <input className={inputCls} value={draft.phone} placeholder="+91 "
                onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Email (used to sign in)">
              <input className={inputCls} value={draft.email} placeholder="name@shieldpest.in"
                onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Aadhaar / ID card number">
              <input className={inputCls} value={draft.aadhaar} placeholder="12 digits" inputMode="numeric"
                onChange={(e) => set('aadhaar', e.target.value)} />
            </Field>
            <Field label="Date of birth">
              <input type="date" className={inputCls} value={draft.dob}
                onChange={(e) => set('dob', e.target.value)} />
            </Field>
            <Field label="Blood group">
              <select className={inputCls} value={draft.blood}
                onChange={(e) => set('blood', e.target.value)}>
                <option value="">—</option>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <label className="block col-span-2">
              <span className={labelCls}>Residential address</span>
              <textarea className={inputCls + ' h-auto py-2 min-h-[64px]'} value={draft.addr}
                placeholder="Door no, street, area, city, PIN"
                onChange={(e) => set('addr', e.target.value)} />
            </label>
          </div>

          {/* ------------------------------------------------------ employment */}
          <p className={sectionTitle}>Employment</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role" required>
              <select className={inputCls} value={draft.role} onChange={(e) => onRole(e.target.value)}>
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
              </select>
            </Field>
            <Field label="Designation">
              <input className={inputCls} value={draft.title}
                onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Employment type">
              <select className={inputCls} value={draft.empType}
                onChange={(e) => set('empType', e.target.value)}>
                {EMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Date of joining">
              <input type="date" className={inputCls} value={draft.joined}
                onChange={(e) => set('joined', e.target.value)} />
            </Field>
            <label className="block col-span-2">
              <span className={labelCls}>Skills (comma separated)</span>
              <input className={inputCls} value={draft.skillsText} placeholder="Termite, Cockroach, Rodent"
                onChange={(e) => set('skillsText', e.target.value)} />
              <p className="text-muted-2 text-[11.5px] mt-1.5">
                Matched against service names when suggesting technicians for a visit.
              </p>
            </label>
          </div>

          <p className="text-[12.5px] text-ink-2 bg-wash rounded px-3 py-2 mt-4">
            <span className="font-semibold">{ROLE_META[draft.role].label}</span> — {ROLE_META[draft.role].desc}
          </p>

          {/* -------------------------------------------------------- branches */}
          <p className={sectionTitle}>Branches <span className="text-accent">*</span></p>
          {branches.length ? (
            <div className="flex gap-2 flex-wrap">
              {branches.map((b) => {
                const on = draft.branches.includes(b.id);
                return (
                  <button key={b.id} type="button"
                    onClick={() => set('branches', on
                      ? draft.branches.filter((x) => x !== b.id)
                      : [...draft.branches, b.id])}
                    className={'h-8 px-3 rounded border text-[12.5px] font-medium flex items-center gap-1.5 transition-colors ' +
                      (on ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
                    {on && <Icon name="check" size={13} />} {b.name}
                    <span className={on ? 'opacity-70' : 'text-muted-2'}>{b.code}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-accent bg-red-wash rounded px-3 py-2.5">
              No branches exist yet. Add them under Branches first.
            </p>
          )}
          <p className="text-muted-2 text-[11.5px] mt-2">
            Tick every branch this person covers — they can be posted to more than one.
          </p>

          {/* --------------------------------------------------- working hours */}
          <p className={sectionTitle}>Working hours</p>
          <p className="text-muted text-[12px] -mt-1 mb-3">
            Leave blank to follow the company default. The dispatch engine only offers
            this person visits inside these hours, on these days.
          </p>
          <div className="flex items-end gap-4 flex-wrap">
            <Field label="From">
              <input type="time" className={inputCls + ' w-[120px]'} value={draft.hoursFrom}
                onChange={(e) => set('hoursFrom', e.target.value)} />
            </Field>
            <Field label="To">
              <input type="time" className={inputCls + ' w-[120px]'} value={draft.hoursTo}
                onChange={(e) => set('hoursTo', e.target.value)} />
            </Field>
            <div>
              <span className={labelCls}>Days</span>
              <div className="flex gap-1.5">
                {DAY_NAMES.map((d, i) => {
                  const on = draft.hoursDays.includes(i);
                  return (
                    <button key={d} type="button"
                      onClick={() => set('hoursDays', on
                        ? draft.hoursDays.filter((x) => x !== i)
                        : [...draft.hoursDays, i].sort())}
                      className={'h-8 w-11 rounded border text-[12px] font-medium transition-colors ' +
                        (on ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---------------------------------------------- emergency contacts */}
          <p className={sectionTitle}>Emergency contacts <span className="text-accent">*</span></p>
          {draft.emergency.map((e, i) => (
            <div key={i} className="flex items-end gap-3 mb-2.5">
              <div className="flex-1 min-w-[150px]">
                <Field label={i === 0 ? 'Name' : ''}>
                  <input className={inputCls} value={e.name} placeholder="e.g. Ravi R"
                    onChange={(ev) => set('emergency',
                      draft.emergency.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                </Field>
              </div>
              <div className="w-[140px]">
                <Field label={i === 0 ? 'Relation' : ''}>
                  <select className={inputCls} value={e.relation}
                    onChange={(ev) => set('emergency',
                      draft.emergency.map((x, j) => (j === i ? { ...x, relation: ev.target.value } : x)))}>
                    {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Field label={i === 0 ? 'Phone' : ''}>
                  <input className={inputCls} value={e.phone} placeholder="+91 "
                    onChange={(ev) => set('emergency',
                      draft.emergency.map((x, j) => (j === i ? { ...x, phone: ev.target.value } : x)))} />
                </Field>
              </div>
              {draft.emergency.length > 1 && (
                <button type="button" title="Remove"
                  onClick={() => set('emergency', draft.emergency.filter((_, j) => j !== i))}
                  className="h-9 w-9 shrink-0 rounded border border-line text-muted hover:text-accent hover:bg-red-wash flex items-center justify-center">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button"
            onClick={() => set('emergency', [...draft.emergency, { ...BLANK_KIN }])}
            className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash mt-1">
            <Icon name="plus" size={13} /> Add another contact
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================ detail */
  const m = member!;
  const meta = ROLE_META[m.role] || { label: m.role, desc: '' };
  const isTech = isFieldTech(m.role);
  const p = m.perf;
  const kin = m.emergency || [];
  const hours = m.hoursFrom && m.hoursTo
    ? `${m.hoursFrom}–${m.hoursTo} · ${(m.hoursDays.length ? m.hoursDays : []).map((d) => DAY_NAMES[d]).join(' ') || 'no days set'}`
    : 'Company default';

  const kv: Array<[string, React.ReactNode]> = [
    ['Employee ID', m.id],
    ['Role', meta.label],
    ['Designation', m.title],
    ['Employment type', m.empType || '—'],
    ['Joined', m.joined || '—'],
    ['Phone', m.phone || '—'],
    ['Email', m.email || '—'],
    ['Date of birth', m.dob || '—'],
    ['Blood group', m.blood || '—'],
    ['Aadhaar / ID card', m.aadhaar || '—'],
    ['Address', m.addr || '—'],
    ['Working hours', hours],
  ];
  if (isTech) kv.push(['Skills', m.skills.join(', ') || '—']);

  return (
    <div>
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/team" className="text-muted hover:text-navy flex items-center gap-1 text-[13px] shrink-0">
            <Icon name="chevRight" size={14} className="rotate-180" /> Team
          </Link>
          <span className="text-line">/</span>
          <h1 className="text-[17px] font-semibold truncate">{m.name}</h1>
          {!m.active && <span className="zpill red shrink-0">Inactive</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pwMsg && <span className="text-[12.5px] text-muted">{pwMsg}</span>}
          <button onClick={() => setPwOpen((v) => !v)}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
            Set password
          </button>
          <button onClick={toggleActive}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium text-accent hover:bg-red-wash">
            {m.active ? 'Deactivate' : 'Reactivate'}
          </button>
          <button onClick={() => { setDraft(toDraft(m)); setEditing(true); }}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
            Edit
          </button>
        </div>
      </div>

      {pwOpen && (
        <div className="mx-6 mt-4 px-4 py-3 rounded border border-line bg-wash flex items-center gap-3">
          <span className="text-[12.5px] font-semibold text-ink-2">New password</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="At least 6 characters"
            className="h-8 px-3 rounded border border-line text-[13px] outline-none focus:border-navy bg-white w-[220px]" />
          <button onClick={setPassword}
            className="h-8 px-3 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
            Save
          </button>
          <button onClick={() => { setPwOpen(false); setPw(''); }}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-white">
            Cancel
          </button>
        </div>
      )}

      <div className="p-6">
        {/* ---------------------------------------------------------- header */}
        <div className="flex items-center gap-4 mb-6">
          {m.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <span className="w-16 h-16 rounded-full text-white text-[18px] font-bold flex items-center justify-center"
              style={{ background: m.color || '#141414' }}>
              {m.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[18px] font-semibold leading-tight">{m.name}</p>
            <p className="text-muted text-[13px]">{m.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="zpill navy">{meta.label}</span>
              {m.branches.length
                ? m.branches.map((b) => (
                    <span key={b} className="zpill outline">
                      {branches.find((x) => x.id === b)?.name || b}
                    </span>
                  ))
                : <span className="zpill red">No branch</span>}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ tech stats */}
        {isTech && p && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Services completed', value: String(p.done), foot: p.total + ' assigned all time' },
              { label: 'Today', value: p.todayDone + '/' + p.today, foot: p.open + ' still open overall' },
              { label: 'Customer rating', value: p.rating.toFixed(1) + '★', foot: p.ratedN + ' rated visits' },
              { label: 'Hours on site', value: (p.hours ?? 0) + 'h', foot: 'Logged through the app' },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-line p-4">
                <p className="text-muted text-[11.5px] font-semibold uppercase tracking-wide">{s.label}</p>
                <p className="text-[22px] font-semibold mt-1">{s.value}</p>
                <p className="text-muted-2 text-[11.5px] mt-0.5">{s.foot}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_360px] gap-5 items-start">
          {/* -------------------------------------------------------- record */}
          <section className="rounded-md border border-line">
            <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft">
              Employee record
            </h2>
            <dl className="px-5 py-2">
              {kv.map(([k, v]) => (
                <div key={k} className="flex py-2 border-b border-line-soft last:border-0 text-[13px]">
                  <dt className="w-[180px] shrink-0 text-muted">{k}</dt>
                  <dd className="flex-1 min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="flex flex-col gap-5">
            {/* --------------------------------------------------- emergency */}
            <section className="rounded-md border border-line">
              <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft flex items-center justify-between">
                Emergency contacts <span className="zpill">{kin.length}</span>
              </h2>
              <div className="px-5 py-3">
                {kin.length ? kin.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-line-soft last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{e.name}</p>
                      <p className="text-[11.5px] text-muted">{e.relation || 'Contact'}</p>
                    </div>
                    <span className="text-[12.5px] text-ink-2 whitespace-nowrap">{e.phone}</span>
                  </div>
                )) : (
                  <p className="text-muted text-[12.5px] py-2">
                    No emergency contact on file — add one from Edit.
                  </p>
                )}
              </div>
            </section>

            {/* --------------------------------------------------- signature */}
            <section className="rounded-md border border-line">
              <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft">
                Signature on file
              </h2>
              <div className="px-5 py-4">
                {m.sign ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.sign} alt="Signature" className="max-h-[72px] object-contain" />
                ) : (
                  <p className="text-muted text-[12.5px]">
                    None yet — documents they raise go out without a signature.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ------------------------------------------------ chemicals in hand */}
        {isTech && <HoldingCard userId={m.id} />}

        {/* --------------------------------------------------- tech schedule */}
        {isTech && (
          <section className="rounded-md border border-line mt-5">
            <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft flex items-center justify-between">
              Today’s schedule
              {p && <span className="zpill navy">{p.todayDone}/{p.today}</span>}
            </h2>
            {m.todayJobs?.length ? (
              <table className="ztable">
                <thead><tr><th>Ref</th><th>Customer</th><th>Slot</th><th>Status</th></tr></thead>
                <tbody>
                  {m.todayJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="font-medium text-navy">{j.id}</td>
                      <td>{j.clientName}</td>
                      <td>{j.slot}</td>
                      <td>
                        <span className={'zpill ' + (j.status === 'completed' ? 'navy' : j.status === 'cancelled' ? 'red' : 'outline')}>
                          {j.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-muted text-[13px]">Nothing scheduled today.</p>
            )}
          </section>
        )}

        {isTech && (
          <section className="rounded-md border border-line mt-5">
            <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft">
              Recent completed work
            </h2>
            {m.doneJobs?.length ? (
              <table className="ztable">
                <thead>
                  <tr><th>Ref</th><th>Customer</th><th>Date</th><th>Time on site</th><th>Findings</th><th>Rating</th></tr>
                </thead>
                <tbody>
                  {m.doneJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="font-medium text-navy">{j.id}</td>
                      <td>{j.clientName}</td>
                      <td>{j.date}</td>
                      <td>{j.durationMins ? durationText(j.durationMins) : '—'}</td>
                      <td className="text-muted max-w-[240px] truncate">{j.findings.join(', ') || '—'}</td>
                      <td>{j.rating ? j.rating.toFixed(1) + '★' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-muted text-[13px]">No completed services yet.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * What this technician is carrying right now. Chemicals signed out and not yet
 * accounted for are money walking around, so the office needs to see it against
 * the person, not buried in a stock ledger.
 */
function HoldingCard({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Array<{
    itemId: string; name: string; unit: string; qty: number; short: boolean;
  }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<{ holding: typeof rows }>('/techstock?userId=' + encodeURIComponent(userId))
      .then((r) => setRows(r.holding || []))
      .catch(() => { /* the rest of the profile still works */ })
      .finally(() => setLoaded(true));
  }, [userId]);

  if (!loaded || !rows.length) return null;
  const short = rows.filter((r) => r.short).length;

  return (
    <section className="rounded-md border border-line mt-5">
      <h2 className="text-[13.5px] font-semibold px-5 py-3 border-b border-line-soft
        flex items-center justify-between">
        Chemicals in hand
        {short > 0 && <span className="zpill red">{short} to reconcile</span>}
      </h2>
      <table className="ztable">
        <thead><tr><th>Item</th><th className="text-right">Quantity</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId}>
              <td>{r.name}</td>
              <td className={'text-right font-semibold ' + (r.short ? 'text-accent' : '')}>
                {r.qty} {r.unit}
                {r.short && <span className="block text-[11px] font-normal">used more than issued</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
