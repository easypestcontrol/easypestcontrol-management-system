'use client';

/* ============================================================================
   Customer detail — the v1 customer view in the Zoho idiom: who they are,
   the money position, their contracts, their visit history, their invoices.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { docTotals, money } from 'shared';
import { api, type Bootstrap, type Client } from '@/lib/api';
import { Icon } from '@/components/icons';
import CustomerForm from '../customer-form';
import { isOpen, phoneKey } from '../../leads/lib';
import CustomerMobile from './mobile';
import ActionMenu from '@/components/action-menu';
import Confirm, { type ConfirmSpec } from '@/components/confirm';

interface PlanLine { svId: string; crew: number; techIds: string[]; visits: number }
interface Contract {
  id: string; mode: string; start: string; end: string; value: number;
  totalVisits: number; plan: PlanLine[];
}
interface Job {
  id: string; date: string; slot: string; serviceIds: string[]; techIds: string[];
  status: string; mins: number; type: string;
}
interface Invoice {
  id: string; date: string; due: string; status: string; discount: number;
  placeOfSupply: string; items: Array<{ desc: string; qty: number; rate: number }>;
  payments: Array<{ amount: number }>;
}
type Detail = Client & { contracts: Contract[]; jobs: Job[]; invoices: Invoice[] };

const STATUS_PILL: Record<string, string> = {
  completed: 'zpill navy', inprogress: 'zpill red', enroute: 'zpill red',
  scheduled: 'zpill outline', cancelled: 'zpill',
  paid: 'zpill navy', overdue: 'zpill red', partial: 'zpill red',
  sent: 'zpill outline', draft: 'zpill',
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Detail | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState('');

  const load = () =>
    api.get<Detail>('/clients/' + id).then(setC).catch(() => setMissing(true));
  useEffect(() => {
    load();
    api.get<Bootstrap>('/org/bootstrap').then(setBoot).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * How complete this profile is. Commercial customers are also expected to
   * carry GSTIN and PAN; residential ones are not penalised for lacking them.
   */
  const profile = useMemo(() => {
    if (!c) return null;
    const commercial = c.type !== 'Residential';
    const checks: Array<[string, boolean]> = [
      ['Contact person', !!c.contact],
      ['Mobile number', !!c.phone],
      ['Email', !!c.email],
      ['Site address', !!c.addr],
      ['PIN code', !!c.pin],
      ['Billing address', !!c.billing?.street1],
      /*
       * Area and property size were counted here and are no longer asked for
       * anywhere. A meter that can never reach 100%, offering chips that open
       * a form without those fields in it, teaches people to ignore the meter.
       */
      ...(commercial
        ? ([['GSTIN', !!c.gstin], ['PAN', !!c.pan]] as Array<[string, boolean]>)
        : []),
    ];
    const done = checks.filter(([, ok]) => ok).length;
    return { checks, done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
  }, [c]);

  /** A returning customer with a fresh enquiry goes back into the pipeline. */
  /**
   * Put a customer back in the pipeline — by OPENING the capture form, not by
   * quietly creating a lead behind it.
   *
   * It used to POST straight away and land on the new lead's drawer. That
   * skipped every question the form exists to ask: where the enquiry came
   * from, which services they want, who is to follow it up, when to call
   * back, and what was actually said. A lead created without those is a row
   * somebody has to open and finish anyway, so the form may as well be shown
   * while the person still has the customer on the phone.
   *
   * The form fills itself in from the customer, so nothing is retyped.
   */
  /* Removing a customer is an admin's call and the server refuses when
     anything still hangs off them, so the confirm here only has to be sure
     the person meant it. */
  async function removeCustomer() {
    if (!c) return;
    try {
      await api.del('/clients/' + c.id);
      router.replace('/customers');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not delete this customer');
    }
  }

  /* Every one of these asks first, in the app's own card rather than the
     browser's grey strip. Editing does not: opening a form changes nothing
     until it is saved, and a confirm in front of it is a tap for nothing. */
  function actions() {
    if (!c) return [];
    return [
      { label: 'Edit', onClick: () => setEditing(true) },
      {
        label: 'Move to lead',
        onClick: () => setAsk({
          title: 'Move ' + c.name + ' back to leads?',
          body: 'They return to the pipeline as a fresh enquiry. The customer record stays as it is.',
          confirmLabel: 'Move to lead',
          onConfirm: moveToLead,
        }),
      },
      {
        label: 'Create quotation',
        onClick: () => setAsk({
          title: 'Start a quotation for ' + c.name + '?',
          body: 'The builder opens with this customer already filled in.',
          confirmLabel: 'Create quotation',
          onConfirm: () => router.push('/quotations/new?client=' + c.id),
        }),
      },
      {
        label: 'Create contract',
        onClick: () => setAsk({
          title: 'Start a contract for ' + c.name + '?',
          body: 'The contract form opens with this customer already filled in.',
          confirmLabel: 'Create contract',
          onConfirm: () => router.push('/contracts/new?client=' + c.id),
        }),
      },
      {
        label: 'Delete customer',
        danger: true,
        onClick: () => setAsk({
          title: 'Delete ' + c.name + '?',
          body: 'This cannot be undone. It is refused if they still have contracts, invoices or services.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: removeCustomer,
        }),
      },
    ];
  }

  async function moveToLead() {
    if (!c) return;
    if (!c.phone) {
      setNote('Add a mobile number first — a lead needs one to follow up on.');
      setEditing(true);
      return;
    }
    try {
      // Same person already in the pipeline? Open that lead rather than
      // starting a second one — the phone number is the identity key.
      const rows = await api.get<Array<{ id: string; phone: string; stage: string }>>('/leads');
      const existing = rows
        .filter((l) => isOpen(l) && phoneKey(l.phone) === phoneKey(c.phone))
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      router.push(existing ? '/leads?open=' + existing.id : '/leads?capture=' + c.id);
    } catch {
      // The duplicate check is a courtesy, not a gate. If the list cannot be
      // read, still open the form.
      router.push('/leads?capture=' + c.id);
    }
  }

  const svcName = (sid: string) =>
    boot?.services.find((s) => s.id === sid)?.code || sid;
  const techName = (tid: string) =>
    boot?.users.find((u) => u.id === tid)?.name || tid;

  const moneyPos = useMemo(() => {
    if (!c || !boot) return null;
    let billed = 0, collected = 0;
    for (const inv of c.invoices) {
      billed += docTotals(inv.items, inv.discount, inv.placeOfSupply,
        boot.company.state, boot.company.gstRate).total;
      collected += inv.payments.reduce((a, p) => a + p.amount, 0);
    }
    return { billed, collected, due: billed - collected };
  }, [c, boot]);

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">No such customer</p>
        <Link href="/customers" className="text-accent text-[13px] mt-1 inline-block">← All customers</Link>
      </div>
    );
  }
  if (!c) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  const done = c.jobs.filter((j) => j.status === 'completed').length;

  return (
    <>
      {/* Opened to ring them, or to answer what they owe. Both are one tap. */}
      <CustomerMobile c={c} actions={actions()} note={note} />

    <div className="max-lg:hidden">
      {/* ------------------------------------------------------- header */}
      <div className="flex items-center gap-4 px-6 h-[64px] border-b border-line">
        <Link href="/customers" className="text-muted hover:text-ink flex items-center gap-1 text-[13px]">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          Customers
        </Link>
        <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold flex items-center justify-center"
          style={{ background: c.color || '#141414' }}>
          {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[17px] font-semibold truncate">{c.name}</h1>
            <span className="zpill outline">{c.type}</span>
            <span className="text-muted-2 text-[12px]">{c.id}</span>
          </div>
        </div>
        <button onClick={() => router.push('/contracts/new?client=' + c.id)}
          className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
          <Icon name="plus" size={14} /> New contract
        </button>
        {/* The rest live behind the three dots, the same five the phone gets. */}
        <ActionMenu actions={actions()} />
      </div>

      {note && (
        <p className="px-6 pt-3 text-[12.5px] text-accent font-medium">{note}</p>
      )}

      <div className="p-6 grid grid-cols-[300px_minmax(0,1fr)] gap-6 max-w-[1300px]">
        {/* --------------------------------------------------- left rail */}
        <div>
          {profile && (
            <section className="card p-4 mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Profile</h2>
                <span className={'text-[13.5px] font-bold ' + (profile.pct === 100 ? 'text-navy' : 'text-accent')}>
                  {profile.pct}% complete
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-wash-2 overflow-hidden">
                <div className={'h-full rounded-full transition-all ' + (profile.pct === 100 ? 'bg-navy' : 'bg-accent')}
                  style={{ width: Math.max(4, profile.pct) + '%' }} />
              </div>
              {profile.pct < 100 ? (
                <>
                  <p className="mt-2 text-[11px] text-muted-2">
                    {profile.total - profile.done} missing — tap to fill in:
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {profile.checks.filter(([, ok]) => !ok).map(([label]) => (
                      <button key={label} onClick={() => setEditing(true)}
                        className="h-6 px-2 rounded-full border border-line text-[11px] text-muted hover:border-accent hover:text-accent">
                        + {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11.5px] text-muted">Everything on file.</p>
              )}
            </section>
          )}

          <section className="card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">Contact</h2>
            {[
              ['Contact', c.contact], ['Phone', c.phone], ['Work phone', c.workPhone],
              ['Email', c.email], ['Address', c.addr], ['Area', c.area], ['City', c.city],
              ['GST treatment', c.gstTreatment], ['Place of supply', c.placeOfSupply],
              ['GSTIN', c.gstin], ['PAN', c.pan], ['Payment terms', c.payTerms],
              ['Property size', c.propertySize], ['Customer since', c.since],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="mb-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">{k}</p>
                <p className="text-[13px] text-ink-2 break-words">{v}</p>
              </div>
            ))}

            {/* Every person added on the Contacts tab, phone ready to tap. */}
            {(c.contacts || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-line-soft">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2 mb-2">
                  Contact persons ({(c.contacts || []).length})
                </p>
                {(c.contacts || []).map((p, i) => {
                  const name = [p.salutation, p.firstName, p.lastName].filter(Boolean).join(' ');
                  return (
                    <div key={i} className="mb-2.5">
                      <p className="text-[13px] font-medium">{name || 'Person ' + (i + 1)}</p>
                      {p.mobile && (
                        <a href={'tel:' + p.mobile}
                          className="block text-[12.5px] text-navy hover:text-accent">
                          {p.mobile}
                        </a>
                      )}
                      {p.workPhone && (
                        <p className="text-[12.5px] text-ink-2">
                          {p.workPhone} <span className="text-muted-2 text-[11px]">work</span>
                        </p>
                      )}
                      {p.email && <p className="text-[12px] text-muted break-words">{p.email}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {(c.docs?.length || c.remarks) ? (
            <section className="card p-4 mt-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">
                Documents{c.docs?.length ? ' (' + c.docs.length + ')' : ''}
              </h2>
              {(c.docs || []).map((d, i) => (
                <a key={i} href={d.data} download={d.name}
                  className="flex items-baseline justify-between gap-2 mb-2 text-[12.5px] text-navy hover:underline">
                  <span className="truncate">{d.name}</span>
                  <span className="text-muted-2 shrink-0">{Math.round(d.size / 1024)} KB</span>
                </a>
              ))}
              {c.remarks && (
                <p className="text-[12.5px] text-ink-2 mt-2 pt-2 border-t border-line-soft whitespace-pre-wrap">
                  {c.remarks}
                </p>
              )}
            </section>
          ) : null}

          {moneyPos && (
            <section className="card p-4 mt-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">Position</h2>
              {[
                ['Services', `${done} done of ${c.jobs.length}`],
                ['Billed', money(moneyPos.billed)],
                ['Collected', money(moneyPos.collected)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between mb-2">
                  <span className="text-[12.5px] text-muted">{k}</span>
                  <span className="text-[13.5px] font-semibold">{v}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between pt-2 border-t border-line-soft">
                <span className="text-[12.5px] text-muted">Due</span>
                <span className={'text-[15px] font-bold ' + (moneyPos.due > 0 ? 'text-accent' : 'text-ink')}>
                  {money(moneyPos.due)}
                </span>
              </div>
            </section>
          )}
        </div>

        {/* ------------------------------------------------------ main */}
        <div className="min-w-0">
          <section className="card mb-5">
            <h2 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">
              Contracts <span className="text-muted-2 font-normal">{c.contracts.length}</span>
            </h2>
            {c.contracts.length === 0 ? (
              <p className="px-4 pb-4 text-muted text-[13px]">Nothing sold yet.</p>
            ) : (
              <table className="ztable">
                <thead><tr><th>Contract</th><th>Type</th><th>Period</th><th>Services</th><th>Value</th></tr></thead>
                <tbody>
                  {c.contracts.map((k) => (
                    <tr key={k.id} className="zrow" onClick={() => router.push('/contracts/' + k.id)}>
                      <td className="font-medium text-navy">{k.id}</td>
                      <td><span className="zpill outline">{k.mode === 'amc' ? 'AMC' : 'One-time'}</span></td>
                      <td className="text-muted">{k.start} → {k.end}</td>
                      <td>{k.totalVisits}</td>
                      <td className="font-semibold">{money(k.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card mb-5">
            <h2 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">
              Recent services <span className="text-muted-2 font-normal">{c.jobs.length}</span>
            </h2>
            {c.jobs.length === 0 ? (
              <p className="px-4 pb-4 text-muted text-[13px]">No services yet.</p>
            ) : (
              <table className="ztable">
                <thead><tr><th>Service</th><th>When</th><th>Services</th><th>Technicians</th><th>Status</th></tr></thead>
                <tbody>
                  {c.jobs.slice(0, 12).map((j) => (
                    <tr key={j.id} className="zrow" onClick={() => router.push('/jobs/' + j.id)}>
                      <td className="font-medium text-navy">{j.id}</td>
                      <td className="text-muted">{j.date} · {j.slot}</td>
                      <td>
                        <span className="flex gap-1 flex-wrap">
                          {j.serviceIds.map((s) => <span key={s} className="zpill">{svcName(s)}</span>)}
                        </span>
                      </td>
                      <td className="text-[12.5px]">{j.techIds.map(techName).join(', ') || '—'}</td>
                      <td><span className={STATUS_PILL[j.status] || 'zpill'}>{j.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">
              Invoices <span className="text-muted-2 font-normal">{c.invoices.length}</span>
            </h2>
            {c.invoices.length === 0 ? (
              <p className="px-4 pb-4 text-muted text-[13px]">Nothing billed yet.</p>
            ) : (
              <table className="ztable">
                <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {c.invoices.map((inv) => {
                    const t = boot
                      ? docTotals(inv.items, inv.discount, inv.placeOfSupply,
                          boot.company.state, boot.company.gstRate).total
                      : 0;
                    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
                    return (
                      <tr key={inv.id} className="zrow" onClick={() => router.push('/invoices/' + inv.id)}>
                        <td className="font-medium text-navy">{inv.id}</td>
                        <td className="text-muted">{inv.date}</td>
                        <td className="text-muted">{inv.due}</td>
                        <td className="font-semibold">{money(t)}</td>
                        <td>{money(paid)}</td>
                        <td><span className={STATUS_PILL[inv.status] || 'zpill'}>{inv.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

    </div>

      {/* Outside the desktop-only wrapper. It was inside it, so on a phone
          Edit set the flag and rendered the form into a hidden subtree —
          the button did nothing at all. */}
      {editing && (
        <CustomerForm initial={c} onClose={() => setEditing(false)}
          onDone={() => { setEditing(false); load(); }} />
      )}
      <Confirm spec={ask} onClose={() => setAsk(null)} />
    </>
  );
}
