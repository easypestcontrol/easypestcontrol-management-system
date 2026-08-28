'use client';

/* ============================================================================
   Capture new lead — everything a caller tells you, in one screen. Ported
   from v1 newLead() (leads.js:700-897): the phone number is the key — 10
   digits in and a customer we have served before is recognised, their
   details fill in, and their old branch and owner beat the territory map.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Bootstrap, type Client, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { money } from 'shared';
import {
  LEAD_SOURCES, PROPERTY_TYPES, phoneKey, branchForArea, assignableUsers,
  type Lead, type BootUser, type BootBranch,
} from './lib';

/** One row of the customer directory (store.js:206-231). */
interface DirRow {
  kind: 'client' | 'lead'; id: string; clientId: string; name: string;
  phone: string; email: string; area: string; type: string;
}

/* Module-scope so React keeps the field DOM (and focus) across renders. */
function Label({ children, req }: { children: React.ReactNode; req?: boolean }) {
  return (
    <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">
      {children}{req && <span className="text-accent"> *</span>}
    </span>
  );
}
const inputCls =
  'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy';
const selectCls =
  'w-full h-9 px-2 rounded border border-line text-[13px] bg-white outline-none';

export default function NewLead({ boot, me, leads, onClose, onSaved }: {
  boot: Bootstrap; me: SessionUser | null; leads: Lead[];
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const users = boot.users as unknown as BootUser[];
  const branches = boot.branches as unknown as BootBranch[];
  const owners = assignableUsers(users);

  /** Who a new lead should land with: the capturer, if they can own leads (leads.js:18-21). */
  const defaultOwner =
    me && owners.some((u) => u.id === me.id) ? me.id : 'U03';
  const defaultBranch = (() => {
    const mine = users.find((u) => u.id === me?.id)?.branches || [];
    return mine[0] || branches[0]?.id || '';
  })();

  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [source, setSource] = useState('WhatsApp');
  const [type, setType] = useState('Residential');
  const [branch, setBranch] = useState(defaultBranch);
  const [owner, setOwner] = useState(defaultOwner);
  const [interest, setInterest] = useState<string[]>([]);
  const [follow, setFollow] = useState('');
  const [notes, setNotes] = useState('');
  const [pick, setPick] = useState('');
  const [matched, setMatched] = useState<DirRow | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Once the branch is picked by hand we stop moving it for them (leads.js:777-787).
  const branchTouched = useRef(false);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  /* Customers first (richest record), then leads whose phone we have not seen. */
  const dir = useMemo<DirRow[]>(() => {
    const seen: Record<string, 1> = {};
    const out: DirRow[] = [];
    clients.forEach((c) => {
      const k = phoneKey(c.phone);
      if (k) seen[k] = 1;
      out.push({
        kind: 'client', id: c.id, clientId: c.id, name: c.name, phone: c.phone,
        email: c.email || '',
        area: (String(c.addr || '').split(',').pop() || '').trim() || c.city || '',
        type: c.type || '',
      });
    });
    leads.forEach((l) => {
      const k = phoneKey(l.phone);
      if (k && seen[k]) return;
      if (k) seen[k] = 1;
      out.push({
        kind: 'lead', id: l.id, clientId: l.clientId || '', name: l.name,
        phone: l.phone, email: l.email || '', area: l.area || '', type: l.type || '',
      });
    });
    return out;
  }, [clients, leads]);

  /** Every locality any branch covers, for the type-ahead (leads.js:29-36). */
  const knownAreas = useMemo(() => {
    const out: Array<{ name: string; branch: string }> = [];
    branches.forEach((b) => (b.areas || []).forEach((a) => {
      if (!out.some((x) => x.name.toLowerCase() === a.toLowerCase())) {
        out.push({ name: a, branch: b.name });
      }
    }));
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  }, [branches]);

  /** Past leads for a known contact — clientId or phone-key match (store.js:248-255). */
  const contactHistory = (c: DirRow) => {
    const k = phoneKey(c.phone);
    return leads.filter((l) =>
      (c.clientId && l.clientId === c.clientId) || (k && phoneKey(l.phone) === k));
  };

  function areaChanged(v: string) {
    setArea(v);
    if (branchTouched.current) return;
    const b = branchForArea(branches, v);
    if (b) setBranch(b.id);
  }

  function clearMatch() {
    setMatched(null);
    setPick('');
  }

  function fill(c: DirRow) {
    setPick(c.clientId || '');
    setName(c.name || '');
    setEmail(c.email || '');
    setArea(c.area || '');
    if (c.type && PROPERTY_TYPES.indexOf(c.type) >= 0) setType(c.type);

    // A returning customer stays with the branch and the person who had them —
    // that beats anything the territory map would suggest (leads.js:808-825).
    const prev = contactHistory(c)[0];
    if (prev && prev.branch) {
      setBranch(prev.branch);
      branchTouched.current = true;
    } else {
      const b = branchForArea(branches, c.area || '');
      if (b && !branchTouched.current) setBranch(b.id);
    }
    if (prev && prev.owner && owners.some((u) => u.id === prev.owner)) {
      setOwner(prev.owner);
    }
    setMatched(c);
  }

  /** The phone number is the key: 10 digits in, and the record comes back. */
  function lookup(v: string) {
    setPhone(v);
    if (phoneKey(v).length < 10) { clearMatch(); return; }
    const k = phoneKey(v);
    const c = dir.find((x) => phoneKey(x.phone) === k);
    if (c) {
      if (!matched || matched.id !== c.id) { setPhone(c.phone); fill(c); }
    } else clearMatch();
  }

  function onPick(id: string) {
    if (!id) {
      clearMatch();
      setName(''); setPhone(''); setEmail(''); setArea('');
      branchTouched.current = false;
      return;
    }
    const known = dir.find((x) => x.kind === 'client' && x.clientId === id);
    if (!known) return;
    setPhone(known.phone || '');
    fill(known);
  }

  const value = interest.reduce(
    (s, sid) => s + (boot.services.find((x) => x.id === sid)?.price || 0), 0);

  async function save() {
    if (!name.trim() || !phone.trim()) {
      setErr('Name and phone are required');
      return;
    }
    setBusy(true);
    try {
      const l = await api.post<Lead>('/leads', {
        name: name.trim(), phone: phone.trim(), email: email.trim(),
        area: area.trim(), source, type, branch, owner, interest,
        followUp: follow, notes: notes.trim(),
        clientId: matched?.clientId || '',
        returning: !!matched,
      });
      onSaved(l.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the lead');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/30 flex items-start justify-center overflow-y-auto p-6"
      onClick={onClose}>
      <div className="w-[680px] bg-white rounded-md shadow-pop my-4"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-start justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-[16px] font-semibold">Capture new lead</h2>
            <p className="text-muted text-[12.5px] mt-0.5">Everything a caller tells you, in one screen</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-wash">
            <Icon name="x" size={16} className="text-muted" />
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="block">
            <Label>Existing customer</Label>
            <select value={pick} onChange={(e) => onPick(e.target.value)} className={selectCls}>
              <option value="">— someone new —</option>
              {clients.slice().sort((a, b) => (a.name < b.name ? -1 : 1)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ' · ' + c.phone : ''}
                </option>
              ))}
            </select>
            <span className="block text-[11.5px] text-muted-2 mt-1">
              Pick them from the customer list and everything below fills in. Leave it for a first-time caller.
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <label className="block">
              <Label req>Name / Business</Label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sowmya Balaji" className={inputCls} />
            </label>
            <label className="block">
              <Label req>Phone</Label>
              <input value={phone} onChange={(e) => lookup(e.target.value)}
                list="ldDirList" autoComplete="off" placeholder="+91 " className={inputCls} />
              <datalist id="ldDirList">
                {dir.map((c) => (
                  <option key={c.id} value={c.phone}>
                    {c.name}{c.area ? ' · ' + c.area : ''}
                  </option>
                ))}
              </datalist>
              <span className="block text-[11.5px] text-muted-2 mt-1">
                A customer we have served before is recognised from the number.
              </span>
            </label>
          </div>

          {matched && (
            <div className="flex items-center gap-3 mt-3 px-3 py-2.5 rounded border border-red-line bg-red-wash">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate">{matched.name}</p>
                <p className="text-[12px] text-muted truncate">
                  {matched.kind === 'client' ? 'Existing customer' : 'Known from an earlier lead'} · {matched.id}
                  {contactHistory(matched).length > 0 &&
                    ' · ' + contactHistory(matched).length + ' previous lead' +
                    (contactHistory(matched).length === 1 ? '' : 's')}
                  {' '}— details filled in below
                </p>
              </div>
              <button onClick={clearMatch}
                className="h-7 px-2.5 rounded border border-line bg-white text-[12px] font-medium hover:bg-wash shrink-0">
                Clear
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <label className="block">
              <Label>Email</Label>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="optional" className={inputCls} />
            </label>
            <label className="block">
              <Label>Area / Locality</Label>
              <input value={area} onChange={(e) => areaChanged(e.target.value)}
                list="ldAreaList" autoComplete="off" placeholder="e.g. Besant Nagar"
                className={inputCls} />
              <datalist id="ldAreaList">
                {knownAreas.map((a) => <option key={a.name} value={a.name}>{a.branch}</option>)}
              </datalist>
              <span className="block text-[11.5px] text-muted-2 mt-1">
                Sets the branch on its own, from the areas each branch covers.
              </span>
            </label>
            <label className="block">
              <Label>Lead source</Label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={selectCls}>
                {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <Label>Property type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
                {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <Label>Branch</Label>
              <select value={branch}
                onChange={(e) => { setBranch(e.target.value); branchTouched.current = true; }}
                className={selectCls}>
                <option value="">— no branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <Label req>Assign to</Label>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selectCls}>
                {owners.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select>
              <span className="block text-[11.5px] text-muted-2 mt-1">
                The salesperson who will follow this lead up.
              </span>
            </label>
          </div>

          <div className="mt-4">
            <Label>Services required</Label>
            <div className="rounded border border-line max-h-[170px] overflow-y-auto px-3 py-2">
              {boot.services.map((s) => (
                <label key={s.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={interest.indexOf(s.id) >= 0}
                    onChange={(e) => setInterest(e.target.checked
                      ? [...interest, s.id]
                      : interest.filter((x) => x !== s.id))}
                    className="accent-[#141414]" />
                  <span className="text-[13px] flex-1">{s.name}</span>
                  <span className="text-[12px] text-muted">{money(s.price)}</span>
                </label>
              ))}
            </div>
            <span className="block text-[11.5px] text-muted-2 mt-1">
              Optional — tick them now if you know, or leave it blank and confirm after the site visit.
              {value > 0 && <span className="text-ink-2 font-semibold"> Estimated value {money(value)}.</span>}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <label className="block">
              <Label>Follow up on</Label>
              <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)}
                className={inputCls} />
              <span className="block text-[11.5px] text-muted-2 mt-1">
                Optional — set a date and the lead lands in the Follow-up column.
              </span>
            </label>
          </div>

          <label className="block mt-4">
            <Label>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="What exactly did the customer say?"
              className="w-full px-3 py-2 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
          </label>

          {err && <p className="text-accent text-[12.5px] mt-3">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose}
            className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
            Cancel
          </button>
          <button onClick={save} disabled={busy}
            className="flex items-center gap-1.5 h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            <Icon name="check" size={14} /> Save lead
          </button>
        </div>
      </div>
    </div>
  );
}
