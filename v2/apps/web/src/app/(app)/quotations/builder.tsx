'use client';

/* ============================================================================
   The quotation builder — one form for new and edit, exactly like v1's
   newQuote modal (quotations.js:239-627), laid out as a full page.

   The behavioural rules ported verbatim:
   - party required first, title required; picking a party titles the document
   - visits auto-sync: while the operator has not typed into Visits, qty edits
     copy visits for /per visit/i services only (quotations.js:487-517)
   - service change re-seeds rate/desc and untouched visits (js:522-543)
   - per-line cadence hint from the shared cadenceLabel (js:469-484)
   - amc shows the "Deliver X times over Y months" strips; onetime hides them
   - at least one line item, always
   - the owner's on-file signature signs the document (js:606-607, server-side)
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Bootstrap, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import { FREQ_MONTHS, addDays, addMonths, cadenceLabel, daysBetween, docTotals, money } from 'shared';
import { QUOTE_STATUS, STATES, fmtDate, lineVisits, todayISO, type QuoteFull } from './lib';

/* ------------------------------------------------------------ local types */

interface ClientRec {
  id: string; name: string; type: string; contact: string; phone: string;
  email: string; addr: string; city: string; pin: string; gstin: string;
  since: string; area: string; branch: string;
}
interface LeadRec {
  id: string; name: string; phone: string; email: string; type: string;
  area: string; branch: string; notes: string;
}
interface PartyRow {
  key: string; kind: 'customer' | 'lead'; id: string; name: string;
  sub: string; hint: string; hay: string;
}
interface RowItem {
  svId: string; desc: string; qty: number; rate: number;
  visits: number; months: number; touched: boolean;
}

const INP = 'w-full h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy bg-white';
const AREA = 'w-full min-h-[88px] p-3 rounded border border-line text-[13px] leading-relaxed outline-none focus:border-navy bg-white';

function Field({ label, hint, req, children }: {
  label: string; hint?: string; req?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">
        {label}{req && <span className="text-accent"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted-2 mt-1">{hint}</span>}
    </label>
  );
}

export default function Builder({ edit, presetClient, presetLead }: {
  edit?: QuoteFull | null; presetClient?: string; presetLead?: string;
}) {
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [clients, setClients] = useState<ClientRec[]>([]);
  const [leads, setLeads] = useState<LeadRec[]>([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  /* ------------------------------------------------------------ form state */
  const [partyKey, setPartyKey] = useState(
    edit
      ? (edit.clientId ? 'C:' + edit.clientId : edit.leadId ? 'L:' + edit.leadId : '')
      : presetClient ? 'C:' + presetClient : presetLead ? 'L:' + presetLead : '',
  );
  const [partyQ, setPartyQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [mode, setMode] = useState<'amc' | 'onetime'>(edit ? edit.mode : 'amc');
  const [title, setTitle] = useState(edit ? edit.title : '');
  const [qNo, setQNo] = useState(edit ? edit.id : '');
  const [refNo, setRefNo] = useState(edit ? edit.refNo : '');
  const [date, setDate] = useState(edit ? edit.date : todayISO());
  const [pos, setPos] = useState(edit ? edit.placeOfSupply || 'Tamil Nadu' : 'Tamil Nadu');
  const [billAddr, setBillAddr] = useState(edit ? edit.billAddr || '' : '');
  const [shipAddr, setShipAddr] = useState(edit ? edit.shipAddr || '' : '');
  const [branch, setBranch] = useState(edit ? edit.branch : '');
  const [owner, setOwner] = useState(edit ? edit.owner : '');
  const [discount, setDiscount] = useState(edit ? edit.discount : 0);
  const [notes, setNotes] = useState(edit ? edit.notes : '');
  const [terms, setTerms] = useState(edit && edit.terms?.length ? edit.terms.join('\n') : '');
  const [items, setItems] = useState<RowItem[] | null>(
    edit
      ? edit.items.map((i) => ({
          svId: i.svId, desc: i.desc, qty: i.qty, rate: i.rate,
          visits: lineVisits(i), months: i.months || 12, touched: false,
        }))
      : null,
  );

  /* ----------------------------------------------------------------- data */
  useEffect(() => {
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
    api.get<{ clients: ClientRec[]; leads: LeadRec[] }>('/quotations/parties')
      .then((r) => { setClients(r.clients); setLeads(r.leads); }).catch(() => {});
    if (!edit) {
      api.get<{ nextNo: string }>('/quotations/next-no')
        .then((r) => setQNo((v) => v || r.nextNo)).catch(() => {});
    }
  }, [edit]);

  // Defaults once the data lands: salesperson = me, branch = first,
  // terms = company terms, place of supply = the home state.
  useEffect(() => {
    if (!edit && me) setOwner((v) => v || me.id);
  }, [me, edit]);
  useEffect(() => {
    if (!boot) return;
    setBranch((v) => v || (boot.branches[0]?.id ?? ''));
    if (!edit) {
      setTerms((v) => v || (boot.company.terms || []).join('\n'));
      setPos((v) => (v === 'Tamil Nadu' && boot.company.state ? boot.company.state : v));
    }
  }, [boot, edit]);

  // A fresh quotation starts with one BLANK line — the person picks the
  // service; the catalogue then fills the rate and description itself.
  useEffect(() => {
    if (items !== null || !boot) return;
    setItems([{ svId: '__unset', desc: '', qty: 1, rate: 0, visits: 1, months: 12, touched: false }]);
  }, [boot, items]);

  // A preselected party fills the search box, the title and (for a lead)
  // the notes — v1 quotations.js:268-306.
  useEffect(() => {
    if (!partyKey) return;
    const id = partyKey.slice(2);
    const rec = partyKey[0] === 'C'
      ? clients.find((c) => c.id === id)
      : leads.find((l) => l.id === id);
    if (!rec) return;
    setPartyQ((v) => v || rec.name);
    if (!edit) {
      setTitle((v) => v || 'Pest Management Proposal — ' + rec.name);
      if (partyKey[0] === 'L') setNotes((v) => v || (rec as LeadRec).notes || '');
      // The customer's place of supply drives the GST split on the document.
      const posOf = (rec as { placeOfSupply?: string }).placeOfSupply;
      if (partyKey[0] === 'C' && posOf) setPos(posOf);
      if (partyKey[0] === 'C' && (rec as ClientRec).branch) {
        setBranch((v) => v || (rec as ClientRec).branch);
      }
      // Prefill both printed addresses from the party on file; the user can
      // then edit either before saving.
      const lines = partyKey[0] === 'C'
        ? [
            (rec as ClientRec).addr,
            [(rec as ClientRec).city, (rec as ClientRec).pin].filter(Boolean).join(' '),
          ].filter(Boolean).join('\n')
        : [(rec as LeadRec).area, 'Chennai'].filter(Boolean).join('\n');
      setBillAddr(lines);
      setShipAddr(lines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, leads, partyKey]);

  /* ---------------------------------------------------------- party search */
  const idx: PartyRow[] = useMemo(() => {
    const out: PartyRow[] = [];
    clients.forEach((c) => out.push({
      key: 'C:' + c.id, kind: 'customer', id: c.id, name: c.name,
      sub: [c.type, c.city].filter(Boolean).join(' · '),
      hint: c.gstin || '',
      hay: [c.name, c.contact, c.phone, c.email, c.city, c.gstin, c.id].join(' ').toLowerCase(),
    }));
    leads.forEach((l) => out.push({
      key: 'L:' + l.id, kind: 'lead', id: l.id, name: l.name,
      sub: [l.type, l.area].filter(Boolean).join(' · '),
      hint: 'Lead ' + l.id,
      hay: [l.name, l.phone, l.email, l.area, l.id].join(' ').toLowerCase(),
    }));
    return out;
  }, [clients, leads]);

  const hits = useMemo(() => {
    const needle = partyQ.trim().toLowerCase();
    return (needle ? idx.filter((x) => x.hay.includes(needle)) : idx).slice(0, 8);
  }, [idx, partyQ]);

  function pick(i: number) {
    const x = hits[i];
    if (!x) return;
    setPartyKey(x.key);
    setPartyQ(x.name);
    setMenuOpen(false);
    setCursor(-1);
    // A quotation for a named party should title itself.
    setTitle((v) => v.trim() ? v : 'Pest Management Proposal — ' + x.name);
    if (x.kind === 'customer') {
      const c = clients.find((cc) => cc.id === x.id);
      if (c?.branch) setBranch(c.branch); // the customer's branch wins
    }
  }

  /* ------------------------------------------------------------ line items */
  const svcOf = (id: string) => boot?.services.find((s) => s.id === id);

  function patchItem(i: number, patch: Partial<RowItem>) {
    setItems((list) => (list || []).map((it, n) => (n === i ? { ...it, ...patch } : it)));
  }

  function onQty(i: number, v: number) {
    const it = (items || [])[i];
    if (!it) return;
    const patch: Partial<RowItem> = { qty: v };
    // The quantity IS the delivery count: qty 3 = delivered 3 times, qty 1 =
    // once. Only a hand-edited Deliver field overrides this.
    if (!it.touched) patch.visits = Math.max(1, Math.round(v || 1));
    patchItem(i, patch);
  }

  function onSvc(i: number, svId: string) {
    const it = (items || [])[i];
    if (!it) return;
    const s = svcOf(svId);
    const patch: Partial<RowItem> = { svId };
    if (s) {
      patch.rate = s.price;
      patch.desc = s.desc;
      if (!it.touched) {
        // The quantity IS the delivery count — a qty of 1 is one service,
        // no matter what cadence the catalogue suggests.
        patch.visits = Math.max(1, Math.round(it.qty || 1));
      }
    }
    patchItem(i, patch);
  }

  function addItem() {
    // New rows are blank too — nothing is ever chosen for the user.
    setItems((list) => [...(list || []), {
      svId: '__unset', desc: '', qty: 1, rate: 0, visits: 1, months: 12, touched: false,
    }]);
  }

  function rmItem(i: number) {
    if ((items || []).length <= 1) { setErr('Keep at least one line item'); return; }
    setItems((list) => (list || []).filter((_, n) => n !== i));
  }

  /** The per-line cadence hint — quotations.js:469-484. */
  function cad(it: RowItem): string {
    const start = todayISO();
    const months = Math.max(1, Math.round(it.months) || 1);
    const visits = Math.max(1, Math.round(it.visits) || 1);
    const gap = daysBetween(start, addMonths(start, months)) / visits;
    return visits === 1
      ? 'once, on day one'
      : cadenceLabel(gap, visits).toLowerCase() + ' · every ' + Math.round(gap) + ' days';
  }

  /* ---------------------------------------------------------------- totals */
  const home = boot?.company.state || 'Tamil Nadu';
  const gstRate = boot?.company.gstRate || 18;
  const t = docTotals(items || [], Number(discount) || 0, pos, home, gstRate);

  /* ------------------------------------------------------------------ save */
  async function save() {
    if (!partyKey) {
      setErr('Pick who this is for — type a name in “Raise for” and choose from the list');
      return;
    }
    if (!title.trim()) { setErr('Give the quotation a title'); return; }
    const isClient = partyKey[0] === 'C';
    const pid = partyKey.slice(2);
    const payload: Record<string, unknown> = {
      clientId: isClient ? pid : '',
      leadId: isClient ? '' : pid,
      date: date || todayISO(),
      mode,
      title: title.trim(),
      refNo: refNo.trim(),
      placeOfSupply: pos,
      branch,
      owner,
      discount: Number(discount) || 0,
      notes: notes.trim(),
      billAddr: billAddr.trim(),
      shipAddr: shipAddr.trim(),
      terms: terms.split('\n').map((x) => x.trim()).filter(Boolean),
      items: (items || []).filter((i) => i.svId !== '__unset').map((i) => ({
        svId: i.svId,
        desc: i.desc.trim(),
        qty: Number(i.qty) || 1,
        rate: Number(i.rate) || 0,
        visits: Math.max(1, Math.round(i.visits) || 1),
        months: Math.max(1, Math.round(i.months) || 12),
      })),
    };
    if (!edit) payload.id = qNo.trim();

    setSaving(true);
    setErr('');
    try {
      const saved = edit
        ? await api.patch<{ id: string }>('/quotations/' + edit.id, payload)
        : await api.post<{ id: string }>('/quotations', payload);
      // A quotation raised from a lead returns to that lead — the drawer is
      // where it gets sent on WhatsApp. Customer quotes go to the document.
      if (!isClient && pid) router.push('/leads?open=' + pid);
      else router.push('/quotations/' + saved.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the quotation');
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------ party panel */
  function panel() {
    if (!partyKey) {
      return (
        <div className="rounded border border-line bg-wash p-4 flex items-start gap-2.5 text-[12.5px] text-muted">
          <Icon name="search" size={15} className="mt-0.5 shrink-0" />
          Start typing a customer or lead name above — billing, site and GST details fill in here.
        </div>
      );
    }
    const id = partyKey.slice(2);
    if (partyKey[0] === 'L') {
      const l = leads.find((x) => x.id === id);
      if (!l) return null;
      const branchName = boot?.branches.find((b) => b.id === l.branch)?.name;
      return (
        <div className="rounded border border-line bg-wash p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="zpill navy">Lead {l.id}</span>
            <span className="text-[12px] text-muted">{branchName || 'No branch'}</span>
          </div>
          <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[12.5px]">
            <span className="text-muted">Contact</span><span>{l.phone || '—'}</span>
            <span className="text-muted">Email</span><span>{l.email || '—'}</span>
            <span className="text-muted">Location</span><span>{l.area || '—'}</span>
            <span className="text-muted">Property type</span><span>{l.type || '—'}</span>
            <span className="text-muted">GST details</span>
            <span>Not on file — captured when the lead becomes a customer</span>
          </div>
        </div>
      );
    }
    const c = clients.find((x) => x.id === id);
    if (!c) return null;
    return (
      <div className="rounded border border-line bg-wash p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Billing address</div>
            <div className="text-[12.5px] leading-relaxed mt-1.5">
              {[c.addr, c.city, c.pin].filter(Boolean).map((x, i) => <span key={i} className="block">{x}</span>)}
              {![c.addr, c.city, c.pin].some(Boolean) && <span className="text-muted-2">No address on file</span>}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Account</div>
            <div className="text-[12.5px] leading-relaxed mt-1.5">
              {(c.contact || '—') + ' · ' + (c.phone || '—')}<br />
              Customer since {fmtDate(c.since)}
            </div>
          </div>
        </div>
        <div className="border-t border-line my-3.5" />
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Recipient GST details</div>
        <div className="text-[12.5px] mt-1.5">
          GSTIN: {c.gstin
            ? <span className="font-mono font-semibold">{c.gstin}</span>
            : <span className="text-accent">Not on file</span>}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- signature */
  const ownerUser = boot?.users.find((u) => u.id === owner) as
    | (Bootstrap['users'][number] & { sign?: string })
    | undefined;
  const ownerName = ownerUser?.name || '—';

  const assignable = (boot?.users || []).filter((u) =>
    ['admin', 'ops', 'sales'].includes(u.role));

  /* ---------------------------------------------------------------- render */
  return (
    <div>
      <div className="flex items-center justify-between px-6 h-[56px] border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={edit ? '/quotations/' + edit.id : '/quotations'}
            className="text-muted hover:text-navy flex" title="Cancel">
            <Icon name="x" size={16} />
          </Link>
          <h1 className="text-[17px] font-semibold">{edit ? 'Edit quotation' : 'New quotation'}</h1>
          <span className="text-muted-2 text-[12.5px] truncate">
            {edit
              ? edit.id + ' · ' + (QUOTE_STATUS[edit.status]?.label || '')
              : 'Generates a GST-compliant document you can send immediately'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {err && <span className="text-accent text-[12.5px] max-w-[380px] truncate">{err}</span>}
          {/* On a phone the save button lives at the bottom, where the thumb
              is after filling a form -- not at the top, where it would be
              scrolled away by the time it is wanted. */}
          <button onClick={save} disabled={saving}
            className="max-lg:hidden flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
            <Icon name="check" size={14} /> {edit ? 'Save changes' : 'Save quotation'}
          </button>
        </div>
      </div>

      {/* The phone's save bar. Errors sit above the button rather than beside
          it, because a message truncated to fit next to a button is a
          message nobody reads. */}
      <div className="lg:hidden fixed left-0 right-0 z-30 bottom-[calc(max(12px,env(safe-area-inset-bottom))+70px)] bg-white border-t border-line
        px-4 pt-2.5 pb-2.5">
        {err && <p className="text-accent text-[13px] mb-2 leading-snug">{err}</p>}
        <button onClick={save} disabled={saving}
          className="w-full h-[52px] rounded-xl bg-accent text-white font-bold text-[16px]
            active:brightness-90 disabled:opacity-60">
          {saving ? 'Saving…' : edit ? 'Save changes' : 'Save quotation'}
        </button>
      </div>

      <div className="p-4 lg:p-6 max-w-[960px] max-lg:pb-[calc(env(safe-area-inset-bottom)+92px)]">
        {/* -------------------------------------------------- who and what */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Raise for" req
            hint="Customers and open leads — matches on name, contact, phone, city or GSTIN.">
            <div className="relative">
              <input value={partyQ} autoComplete="off"
                placeholder="Type a name, phone or GSTIN…" className={INP}
                onClick={() => setMenuOpen(true)}
                onChange={(e) => { setPartyQ(e.target.value); setPartyKey(''); setMenuOpen(true); }}
                onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
                onKeyDown={(e) => {
                  if (!menuOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                    setMenuOpen(true); return;
                  }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCursor((c) => {
                      const n = c + (e.key === 'ArrowDown' ? 1 : -1);
                      if (n < 0) return hits.length - 1;
                      if (n >= hits.length) return 0;
                      return n;
                    });
                    return;
                  }
                  if (e.key === 'Enter') { e.preventDefault(); pick(cursor < 0 ? 0 : cursor); return; }
                  if (e.key === 'Escape') setMenuOpen(false);
                }} />
              {menuOpen && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-line rounded shadow-pop max-h-[300px] overflow-auto">
                  {hits.length === 0 ? (
                    <div className="px-3 py-2.5 text-[12.5px] text-muted">
                      No customer or open lead matches that.
                    </div>
                  ) : hits.map((x, i) => (
                    <button key={x.key} type="button"
                      onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                      className={'w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-wash ' + (i === cursor ? 'bg-wash' : '')}>
                      <span className={'w-6 h-6 rounded flex items-center justify-center shrink-0 ' +
                        (x.kind === 'customer' ? 'bg-navy text-white' : 'bg-wash-2 text-navy')}>
                        <Icon name={x.kind === 'customer' ? 'customers' : 'leads'} size={13} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-navy truncate">{x.name}</span>
                        <span className="block text-[11.5px] text-muted truncate">{x.sub}</span>
                      </span>
                      <span className="text-[11px] text-muted-2 font-mono whitespace-nowrap">{x.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Quotation type">
            <select value={mode} onChange={(e) => setMode(e.target.value as 'amc' | 'onetime')} className={INP}>
              <option value="onetime">One-time service</option>
              <option value="amc">AMC — annual maintenance contract</option>
            </select>
          </Field>
        </div>

        <div className="mt-4">{panel()}</div>

        <div className="mt-4">
          <Field label="Title / subject" req hint="What the customer sees at the top of the document.">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Pest Management — Fresh Basket, Anna Nagar" className={INP} />
          </Field>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <Field label="Quotation no." hint="Assigned automatically by the system.">
            <input value={qNo || '…'} readOnly tabIndex={-1}
              className={INP + ' font-mono bg-wash text-muted cursor-default'} />
          </Field>
          <Field label="Reference no.">
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)}
              placeholder="Customer PO or enquiry ref" className={INP} />
          </Field>
          <Field label="Quotation date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INP} />
          </Field>
          <Field label="Valid till" hint="Quotations stay valid for 15 days from the date.">
            <input value={fmtDate(addDays(date || todayISO(), 15))} readOnly className={INP + ' bg-wash'} />
          </Field>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <Field label="Billing address" hint="Printed under 'Quotation for' on the document.">
            <textarea value={billAddr} onChange={(e) => setBillAddr(e.target.value)} rows={3}
              placeholder="Street, area — City PIN" className={AREA} />
          </Field>
          <Field label="Shipping / site address" hint="Where the service happens — printed on the right of the document.">
            <textarea value={shipAddr} onChange={(e) => setShipAddr(e.target.value)} rows={3}
              placeholder="Street, area — City PIN" className={AREA} />
            <button type="button" onClick={() => setShipAddr(billAddr)}
              className="mt-1 text-[11.5px] font-medium text-navy hover:text-accent">
              Same as billing address
            </button>
          </Field>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Field label="Place of supply"
            hint="Within the home state this splits into CGST + SGST; any other state is charged as a single IGST line.">
            <select value={pos} onChange={(e) => setPos(e.target.value)} className={INP}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Location / branch">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={INP}>
              {(boot?.branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Salesperson">
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={INP}>
              {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>

        {/* -------------------------------------------------------- items */}
        <div className="border-t border-line mt-6 pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13.5px] font-semibold">Line items</span>
            <button onClick={addItem}
              className="flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
              <Icon name="plus" size={14} /> Add item
            </button>
          </div>
          <div className="max-lg:hidden grid grid-cols-[1fr_84px_110px_110px_32px] gap-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>Service</span><span>Qty</span><span>Rate (₹)</span><span>Amount (₹)</span><span />
          </div>
          {(items || []).map((it, i) => (
            <div key={i} className="grid grid-cols-1 lg:grid-cols-[1fr_84px_110px_110px_32px] gap-2 items-start py-3 border-b border-line-soft">
              <div>
                <select value={it.svId} onChange={(e) => onSvc(i, e.target.value)} className={INP}>
                  <option value="__unset">Pick a service…</option>
                  {(boot?.services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="">— Custom item —</option>
                </select>
                <input value={it.desc} onChange={(e) => patchItem(i, { desc: e.target.value })}
                  placeholder="Description shown on the quotation"
                  className="w-full h-8 px-2.5 mt-2 rounded border border-line text-[12.5px] outline-none focus:border-navy bg-white" />
                {mode === 'amc' && it.svId !== '__unset' && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-muted">
                    <span>Deliver</span>
                    <input type="number" min={1} step={1} value={it.visits}
                      title="How many times this service happens"
                      onChange={(e) => patchItem(i, { visits: Number(e.target.value) || 1, touched: true })}
                      className="w-[60px] h-7 px-2 rounded border border-line text-[12.5px] outline-none focus:border-navy bg-white" />
                    <span>{it.visits === 1 ? 'time' : 'times'} over</span>
                    <input type="number" min={1} step={1} value={it.months}
                      title="Over how many months"
                      onChange={(e) => patchItem(i, { months: Number(e.target.value) || 1 })}
                      className="w-[60px] h-7 px-2 rounded border border-line text-[12.5px] outline-none focus:border-navy bg-white" />
                    <span>months</span>
                    <span className="text-muted-2">{cad(it)}</span>
                  </div>
                )}
              </div>
              {/* On a phone the column headings are gone, so each number
                  carries its own label. Three unlabelled boxes in a row is
                  the classic way a form becomes a guessing game.
                  inputMode="numeric" gets the digit keypad, not the alphabet. */}
              <label className="lg:contents">
                <span className="lg:hidden block text-[12px] font-semibold uppercase
                  tracking-[0.06em] text-muted mb-1 mt-2">Quantity</span>
                <input type="number" inputMode="numeric" min={0} step={1} value={it.qty}
                  onChange={(e) => onQty(i, Number(e.target.value) || 0)}
                  className={INP + ' text-right'} />
              </label>
              <label className="lg:contents">
                <span className="lg:hidden block text-[12px] font-semibold uppercase
                  tracking-[0.06em] text-muted mb-1 mt-2">Rate (&#8377;)</span>
                <input type="number" inputMode="numeric" min={0} step={50} value={it.rate}
                  onChange={(e) => patchItem(i, { rate: Number(e.target.value) || 0 })}
                  className={INP + ' text-right'} />
              </label>
              <label className="lg:contents">
                <span className="lg:hidden block text-[12px] font-semibold uppercase
                  tracking-[0.06em] text-muted mb-1 mt-2">Amount</span>
                <input readOnly value={money(it.qty * it.rate)}
                  className={INP + ' text-right bg-wash'} />
              </label>
              <button onClick={() => rmItem(i)} title="Remove"
                className="max-lg:w-full max-lg:h-11 max-lg:mt-2 max-lg:rounded-lg max-lg:bg-wash
                  max-lg:text-[14px] max-lg:font-semibold
                  h-9 w-8 flex items-center justify-center gap-1.5 text-muted-2 hover:text-accent">
                <Icon name="x" size={15} /><span className="lg:hidden">Remove this line</span>
              </button>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------------- totals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
          <Field label="Discount (₹)">
            <input type="number" inputMode="numeric" min={0} step={500} value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)} className={INP} />
          </Field>
          <div className="rounded border border-line bg-wash p-4">
            <div className="flex justify-between text-[13px] mb-1.5">
              <span className="text-muted">Subtotal</span>
              <span className="font-semibold">{money(t.sub)}</span>
            </div>
            <div className="flex justify-between text-[13px] mb-1.5">
              <span className="text-muted">Discount</span>
              <span className="font-semibold">− {money(t.disc)}</span>
            </div>
            {t.tax.rows.map((r) => (
              <div key={r[0]} className="flex justify-between text-[13px] mb-1.5">
                <span className="text-muted">{r[0]}</span>
                <span className="font-semibold">{money(r[1])}</span>
              </div>
            ))}
            {t.tax.interState && (
              <div className="text-[11.5px] text-muted-2 mb-1.5">
                Supplied to {t.tax.place} — IGST applies.
              </div>
            )}
            <div className="border-t border-line my-2" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[13.5px]">Total</span>
              <span className="font-bold text-[16px] text-accent">{money(t.total)}</span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------- notes, terms, sign */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <Field label="Customer notes" hint="Printed on the quotation.">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Timing restrictions, chemical preferences, access instructions…"
              className={AREA} />
          </Field>
          <Field label="Terms & conditions" hint="Pre-filled from Settings — edit for this quotation only.">
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} className={AREA} />
          </Field>
        </div>

        <div className="border-t border-line mt-6 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13.5px] font-semibold">Digital signatures</span>
            <span className="text-[11.5px] text-muted-2">Optional here, required before a contract</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded border border-line p-4">
              <div className="text-[12px] font-semibold text-ink-2 mb-2">Customer signature</div>
              {edit?.signCustomer ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={edit.signCustomer} alt="Customer signature" className="h-[42px]" />
              ) : (
                <div className="h-[42px] rounded border border-dashed border-line flex items-center justify-center text-[11.5px] text-muted-2">
                  Captured when the customer accepts, or on the printed copy
                </div>
              )}
            </div>
            <div className="rounded border border-line p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-ink-2">
                  For {boot?.company.name || 'us'}
                </span>
                {ownerUser?.sign && <span className="zpill">On file</span>}
              </div>
              {ownerUser?.sign ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ownerUser.sign} alt="Signature" className="h-[42px]" />
              ) : (
                <div className="h-[42px] rounded border border-dashed border-line" />
              )}
            </div>
          </div>
          <p className="text-[11.5px] text-muted-2 mt-2">
            {ownerUser?.sign
              ? ownerName + '’s signature is taken from their team profile and goes on every document they raise.'
              : 'Optional. ' + ownerName + ' has no signature on file — upload one on their team profile and it will appear here on its own.'}
          </p>
        </div>
      </div>
    </div>
  );
}
