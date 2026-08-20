'use client';

/* ============================================================================
   Contract detail — the agreement, its service plan, and every visit it
   generates. Staffing is set here: one crew per service, capped at the
   line's crew size, trip-aware so picking somebody already going costs
   nothing. The plan editor shows exactly what changes before it is applied;
   visits done, under way, or hand-placed on the board are never touched.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { addMonths, cadenceLabel, daysBetween, isFieldTech, lineCrew, money, moneyShort, planVisits, type ContractInput, type PlanLineInput } from 'shared';
import { api, type SessionUser } from '@/lib/api';
import { Icon } from '@/components/icons';
import ShareLink from '@/components/share-link';
import {
  durationText, fmtDate, fmtShort, fmtTime, initials, ordinal, statusPill,
  type Boot, type BootUser, type ContractDetail, type PlanLineDto,
} from '../lib';

/* --------------------------------------------------------------- utilities */

function toInput(c: ContractDetail, plan: PlanLineDto[]): ContractInput {
  return {
    id: c.id, start: c.start, end: c.end, months: c.months || undefined, slot: c.slot,
    mergeSameDay: c.mergeSameDay, workdaysOnly: c.workdaysOnly, blackout: c.blackout,
    plan: plan.map((l): PlanLineInput => ({
      svId: l.svId, visits: l.visits, months: l.months || undefined, mins: l.mins,
      dayRule: l.dayRule, startAt: l.startAt || undefined, slot: l.slot,
      freq: l.freq, crew: l.crew, techIds: l.techIds,
    })),
  };
}

function jobPill(status: string): { cls: string; label: string } {
  if (status === 'completed') return { cls: 'zpill navy', label: 'Completed' };
  if (status === 'cancelled') return { cls: 'zpill', label: 'Cancelled' };
  if (status === 'inprogress') return { cls: 'zpill red', label: 'In progress' };
  if (status === 'enroute') return { cls: 'zpill red', label: 'En route' };
  return { cls: 'zpill outline', label: 'Scheduled' };
}

function TechStack({ ids, users }: { ids: string[]; users: BootUser[] }) {
  if (!ids.length) return <span className="text-[12px] text-muted-2">Unassigned</span>;
  return (
    <span className="flex items-center">
      {ids.map((id, i) => {
        const u = users.find((x) => x.id === id);
        return (
          <span key={id} title={u?.name || id}
            className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center border-2 border-white"
            style={{ background: u?.color || '#141414', marginLeft: i ? -6 : 0 }}>
            {initials(u?.name || id)}
          </span>
        );
      })}
    </span>
  );
}

const btnGhost = 'flex items-center gap-1.5 h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash';
const btnRed = 'flex items-center gap-1.5 h-8 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90';

/* ================================================================== page */

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<ContractDetail | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [missing, setMissing] = useState(false);
  const [dialog, setDialog] = useState<'' | 'assign' | 'plan' | 'renew'>('');
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    api.get<ContractDetail>('/contracts/' + id).then(setC).catch(() => setMissing(true));
  }, [id]);

  /**
   * Raise the next unraised installment straight from this page. The server
   * follows the billing plan, so what lands is exactly what the Billing
   * history promised. Per-service contracts refuse with an explanation —
   * their invoices raise themselves when a service completes.
   */
  async function raiseInvoice() {
    try {
      const inv = await api.post<{ id: string }>('/invoices/from-contract/' + id, {});
      router.push('/invoices/' + inv.id);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Could not raise an invoice');
    }
  }

  /** The whole ripple happens server-side; here we just confirm and reload. */
  async function cancelVisit(e: React.MouseEvent, jobId: string, visitNo: number, date: string) {
    e.stopPropagation(); // the row click would open the job
    if (!confirm('Cancel service ' + (visitNo || '') + ' on ' + fmtDate(date) + '?\n\n' +
      'It leaves the technicians\u2019 schedules, the billing plan drops this service, ' +
      'and future invoices shrink by its amount.')) return;
    try {
      await api.post('/jobs/' + jobId + '/cancel', {});
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not cancel the service');
    }
  }

  useEffect(() => {
    load();
    api.get<Boot>('/org/bootstrap').then(setBoot).catch(() => {});
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const svcName = (sv: string) => boot?.services.find((s) => s.id === sv)?.name || sv;
  const svcCode = (sv: string) => boot?.services.find((s) => s.id === sv)?.code || sv;
  const userName = (u: string) => boot?.users.find((x) => x.id === u)?.name || u;

  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Contract not found</p>
        <p className="text-muted text-[13px] mt-1">It may have been removed.</p>
        <Link href="/contracts" className="inline-block mt-4 text-[13px] font-semibold text-accent">
          Back to contracts
        </Link>
      </div>
    );
  }
  if (!c || !boot) return <p className="p-6 text-muted text-[13px]">Loading…</p>;

  const cl = c.client;
  const one = c.mode === 'onetime';
  const canManage = !!me && ['admin', 'ops'].indexOf(me.role) >= 0;
  const daysLeft = c.daysLeft;
  const shortRows = c.staffing.rows.filter((r) => r.short > 0);
  const assignedAll: string[] = [];
  for (const r of c.staffing.rows) for (const tid of r.have) {
    if (assignedAll.indexOf(tid) < 0) assignedAll.push(tid);
  }

  const stats = [
    {
      label: 'Services completed',
      value: <>{c.progress.done}<span className="text-[15px] text-muted-2">/{c.progress.total}</span></>,
      foot: c.progress.pct + '% of the contract delivered',
    },
    { label: 'Contract value', value: moneyShort(c.value), foot: c.billing + ' billing cycle' },
    {
      label: 'Billed to date',
      value: moneyShort(c.billed),
      // Billed past the contract's own value is a fault, not a detail — it is
      // what nobody could see while installments raised themselves by counting.
      foot: c.billed > c.value
        ? moneyShort(c.billed - c.value) + ' more than the contract is worth'
        : (c.servicesBilled ?? 0) + ' of ' + (c.servicesTotal ?? 0) + ' services billed',
      red: c.billed > c.value,
    },
    {
      label: 'Days remaining', value: String(Math.max(0, daysLeft)),
      foot: 'Ends ' + fmtDate(c.end), red: daysLeft <= 30,
    },
  ];

  return (
    <div className="p-6 max-w-[1220px]">
      <Link href="/contracts" className="text-[12.5px] text-muted hover:text-navy">← All contracts</Link>

      {/* -------------------------------------------------------- header */}
      <div className="flex items-start justify-between gap-4 mt-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full text-white text-[13px] font-bold flex items-center justify-center shrink-0"
            style={{ background: cl?.color || '#141414' }}>
            {initials(cl?.name || '?')}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[19px] font-semibold truncate">{cl?.name || '—'}</h1>
              <span className="zpill outline">{one ? 'One-time' : 'AMC'}</span>
              <span className={statusPill(c.status.key)}>{c.status.label}</span>
            </div>
            <p className="text-muted text-[13px] mt-0.5">
              {c.id} · {c.planSummaryText} · {c.billing} billing · {money(c.value)} / year
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            <ShareLink path={'/contract/' + c.id} title={'Contract ' + c.id}
              phone={c.client?.phone}
              text={`Your service contract ${c.id} — services, schedule and status, always up to date:`} />
            <button className={btnGhost} onClick={() => router.push('/contracts/' + c.id + '/edit')}>
              Edit
            </button>
            <button className={btnGhost} onClick={() => setDialog('plan')}>Service plan</button>
            <button className={btnGhost} onClick={() => setDialog('assign')}>Assign technicians</button>
            <button className={btnRed} onClick={raiseInvoice}
              title={c.billingMode === 'pervisit'
                ? 'Per-service contracts invoice themselves when a service completes'
                : 'Raise the next installment from the billing plan'}>
              Raise invoice
            </button>
            {daysLeft <= 45 && (
              <button className={btnRed} onClick={() => setDialog('renew')}>Renew contract</button>
            )}
          </div>
        )}
      </div>

      {flash && (
        <p className="mb-4 rounded border border-line bg-wash px-4 py-2.5 text-[13px] text-ink-2">
          {flash}
        </p>
      )}

      {/* ------------------------------------------------------- banners */}
      {daysLeft <= 30 && daysLeft >= 0 && (
        <div className="mb-4 rounded border border-red-line bg-red-wash px-4 py-3 text-[13px]">
          <p className="font-semibold text-accent">Contract expires in {daysLeft} days</p>
          <p className="text-ink-2 mt-0.5">Send the renewal quotation now so service continues without a gap.</p>
        </div>
      )}
      {daysLeft < 0 && (
        <div className="mb-4 rounded border border-red-line bg-red-wash px-4 py-3 text-[13px]">
          <p className="font-semibold text-accent">This contract expired on {fmtDate(c.end)}</p>
          <p className="text-ink-2 mt-0.5">Services are no longer generated. Renew to resume the contract.</p>
        </div>
      )}

      {/* --------------------------------------------------------- stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-line px-4 py-3">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{s.label}</p>
            <p className={'text-[20px] font-semibold mt-0.5 ' + (s.red ? 'text-accent' : 'text-navy')}>
              {s.value}
            </p>
            <p className="text-[11.5px] text-muted-2 mt-0.5">{s.foot}</p>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------- staffing banner */}
      {c.plan.length > 0 && !c.staffing.ok && (
        <div className="mb-5 rounded border border-red-line bg-red-wash px-4 py-3 text-[13px]">
          <p className="font-semibold text-accent">
            {c.staffing.missing} technician{c.staffing.missing === 1 ? '' : 's'} still to be assigned
          </p>
          <p className="text-ink-2 mt-0.5">
            {shortRows.map((r) => svcName(r.svId) + ' needs ' + r.short + ' more of ' + r.need).join(' · ')}
            {shortRows.length ? '. ' : ''}Services will go out with nobody on them until this is done.
          </p>
          {canManage && (
            <button className={btnRed + ' mt-2.5'} onClick={() => setDialog('assign')}>
              Assign technicians
            </button>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- service plan */}
      <section className="rounded-md border border-line mb-5">
        <h2 className="text-[13px] font-semibold px-4 py-3 border-b border-line-soft">Service plan</h2>
        {c.plan.length ? (
          <>
            <table className="ztable">
              <thead>
                <tr>
                  <th>Service</th><th>Every</th><th className="text-right">Services</th><th>Day</th>
                  <th>Time</th><th className="text-center">Crew</th><th>Technicians</th>
                  <th className="text-right">On site</th>
                </tr>
              </thead>
              <tbody>
                {c.plan.map((l) => {
                  const day = (/^dom:(\d{1,2})$/.exec(l.dayRule || '') || [])[1];
                  const have = lineCrew({ svId: l.svId, crew: l.crew, techIds: l.techIds });
                  const need = Math.max(1, l.crew || 1);
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className="block font-medium">{svcName(l.svId)}</span>
                        <span className="block text-[11px] text-muted-2 font-mono">{svcCode(l.svId)}</span>
                      </td>
                      <td><span className="zpill outline">{l.freq || '—'}</span></td>
                      <td className="text-right font-semibold">{l.visits}</td>
                      <td>{day ? ordinal(day) : '—'}</td>
                      <td>{fmtTime(l.slot)}</td>
                      <td className="text-center font-semibold">{need}</td>
                      <td>
                        {have.length === 0 ? (
                          <span className="zpill red">None of {need}</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <TechStack ids={have} users={boot.users} />
                            <span className={'text-[12px] ' +
                              (have.length === need ? 'text-muted' : 'text-accent font-semibold')}>
                              {have.length} of {need}
                            </span>
                            {have.length < need && (
                              <span className="text-[11px] text-accent font-semibold">
                                {need - have.length} more needed
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="text-right">{durationText(l.mins)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-line-soft">
              <p className="text-[12.5px] text-muted">
                {c.plan.reduce((a, l) => a + (l.visits || 0), 0)} service-visits →{' '}
                <strong className="text-ink">{c.progress.total} trip{c.progress.total === 1 ? '' : 's'}</strong>
                {c.mergeSameDay ? ' · same-day services merged' : ' · one trip per service'}
                {c.workdaysOnly ? ' · Sundays skipped' : ''}
              </p>
              {canManage && (
                <button className={btnGhost} onClick={() => setDialog('plan')}>Edit plan</button>
              )}
            </div>
          </>
        ) : (
          <div className="p-4">
            <div className="rounded border border-red-line bg-red-wash px-4 py-3 text-[13px]">
              <p className="font-semibold text-accent">This contract has no service plan yet</p>
              <p className="text-ink-2 mt-0.5">
                It was created before per-service scheduling existed. Open the plan editor to
                build one from the services it covers.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* -------------------------------------- schedule + side column */}
      <div className="grid grid-cols-[1fr_340px] gap-5 items-start">
        <section className="rounded-md border border-line">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <h2 className="text-[13px] font-semibold">Service schedule</h2>
            <span className="zpill navy">{c.progress.done}/{c.progress.total}</span>
          </div>
          {c.jobs.length ? (
            <table className="ztable">
              <thead>
                <tr>
                  <th className="w-12">#</th><th>Scheduled</th><th>Services due</th>
                  <th>Technician</th><th>Status</th><th className="w-16 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {c.jobs.map((j) => {
                  const p = jobPill(j.status);
                  return (
                    <tr key={j.id} className="zrow" onClick={() => router.push('/jobs/' + j.id)}>
                      <td>
                        <span className={j.status === 'completed' ? 'zpill navy' : 'zpill'}>
                          {j.visitNo || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="block font-medium">{fmtDate(j.date)}</span>
                        <span className="block text-[11.5px] text-muted">
                          {fmtTime(j.slot)} · {durationText(j.mins)}
                        </span>
                      </td>
                      <td className="max-w-[200px]">
                        <span className="flex gap-1 flex-wrap">
                          {j.serviceIds.map((sv) => (
                            <span key={sv} className="zpill" title={svcName(sv)}>{svcCode(sv)}</span>
                          ))}
                        </span>
                        {j.serviceIds.length > 1 && (
                          <span className="block text-[10.5px] text-muted-2 mt-0.5">
                            {j.serviceIds.length} services, one trip
                          </span>
                        )}
                      </td>
                      <td><TechStack ids={j.techIds} users={boot.users} /></td>
                      <td>
                        <span className={p.cls}>{p.label}</span>
                        {j.pinned && (
                          <span className="block text-[10.5px] text-muted-2 mt-0.5">placed by hand</span>
                        )}
                      </td>
                      <td className="text-center">
                        {j.status === 'scheduled' && (
                          <button onClick={(e) => cancelVisit(e, j.id, j.visitNo, j.date)}
                            title="Cancel this service — technicians, billing plan and invoices all update"
                            className="px-3 py-1.5 text-[16px] leading-none font-semibold text-muted hover:text-accent">
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="p-5 text-[13px] text-muted">
              No visits generated yet — apply the service plan to build the schedule.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-md border border-line p-4">
            <h2 className="text-[13px] font-semibold mb-3">Contract details</h2>
            <dl className="text-[12.5px]">
              {([
                ['Contract no.', c.id],
                ['Period', fmtDate(c.start) + ' → ' + fmtDate(c.end)],
                ['Schedule', c.planSummaryText + ' — ' + c.progress.total +
                  ' service' + (c.progress.total === 1 ? '' : 's')],
                ['Billing', c.billing],
                ['Services', Array.from(new Set(c.plan.map((l) => l.svId))).map(svcName).join(', ') || '—'],
                ['Site', c.site || '—'],
                ['Technicians', assignedAll.length
                  ? assignedAll.map(userName).join(', ') +
                    (c.staffing.ok ? '' : ' — ' + c.staffing.missing + ' still needed')
                  : 'Nobody assigned yet'],
                ['Managed by', userName(c.owner)],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-line-soft last:border-0">
                  <dt className="text-muted shrink-0">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
              {c.quoteId && (
                <div className="flex justify-between gap-4 py-1.5">
                  <dt className="text-muted shrink-0">From quotation</dt>
                  <dd className="text-right">
                    <Link href={'/quotations/' + c.quoteId} className="font-semibold text-accent">
                      {c.quoteId}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-md border border-line p-4">
            <h2 className="text-[13px] font-semibold mb-2">Scope of work</h2>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{c.scope}</p>
            {c.notes && (
              <div className="mt-3 rounded border border-line bg-wash px-3 py-2.5 text-[12px]">
                <p className="font-semibold">Site instructions</p>
                <p className="text-ink-2 mt-0.5">{c.notes}</p>
              </div>
            )}
          </section>

          
        </div>
      </div>

      <div className="mt-5">
<section className="rounded-md border border-line p-4">
            <h2 className="text-[13px] font-semibold mb-2">Billing history</h2>
            {c.arrears > 0 && (
              <div className="mb-3 rounded border border-red-line bg-red-wash px-3.5 py-2.5 text-[12.5px]">
                <b className="text-accent">{money(c.arrears)} outstanding.</b>{' '}
                <span className="text-ink-2">Service continues — the balance rides on the next invoice.</span>
              </div>
            )}
            <div className="grid grid-cols-[1.35fr_1fr] gap-6 items-start mt-1">
              <div>
            {c.billingRows.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                  Billing plan — {c.billingMode === 'upfront' ? 'everything upfront'
                    : c.billingMode === 'pervisit' ? 'pay per service (collected on site)'
                    : c.billing + ' installments'}
                </p>
                <div className="rounded-md border border-line-soft divide-y divide-line-soft overflow-hidden">
                  {c.billingRows.map((r) => {
                    const open = () => r.invoice && router.push('/invoices/' + r.invoice.id);
                    const pill = !r.invoice ? <span className="zpill outline">not due yet</span>
                      : r.invoice.paid >= r.invoice.total ? <span className="zpill navy">paid</span>
                      : r.invoice.paid > 0 ? <span className="zpill red">part-paid</span>
                      : <span className="zpill red">unpaid</span>;
                    return (
                      <div key={r.seq} onClick={open}
                        title={r.invoice ? 'Open ' + r.invoice.id : 'No invoice yet'}
                        className={'flex items-center gap-3 px-3 py-2.5 ' +
                          (r.invoice ? 'cursor-pointer hover:bg-wash' : '')}>
                        <span className={'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ' +
                          (r.invoice ? 'bg-navy text-white' : 'bg-wash-2 text-muted')}>
                          {r.seq}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12.5px] font-medium leading-snug">{r.label}</span>
                          <span className="block text-[11px] text-muted mt-0.5">
                            Due {fmtDate(r.due)}
                            {r.invoice && <> · <span className="text-navy font-semibold">{r.invoice.id} ↗</span></>}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-[13px] font-semibold leading-tight">
                            {r.invoice
                              ? <>{money(r.invoice.total)}<span className="text-muted-2 font-normal text-[10.5px]"> incl. GST</span></>
                              : <>{money(r.amount)}<span className="text-muted-2 font-normal text-[10.5px]"> +GST</span></>}
                          </span>
                          <span className="mt-0.5 inline-block">{pill}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
              <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">Invoices raised</p>
            {c.invoices.length ? (
              <>
                {c.invoices.map((inv) => (
                  <Link key={inv.id} href={'/invoices/' + inv.id}
                    className="flex justify-between gap-3 py-2 border-b border-line-soft">
                    <span className="min-w-0">
                      <span className="block font-medium text-[13px]">{inv.id}</span>
                      <span className="block text-[11.5px] text-muted">
                        {fmtDate(inv.date)}{inv.period ? ' · ' + inv.period : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{money(inv.total)}</span>
                      <span className={inv.status === 'paid' ? 'zpill navy'
                        : inv.status === 'overdue' ? 'zpill red' : 'zpill'}>
                        {inv.status}
                      </span>
                    </span>
                  </Link>
                ))}
                <p className="flex justify-between text-[12.5px] mt-2.5">
                  <span className="text-muted">Collected</span>
                  <strong>{money(c.collected)} of {money(c.billed)}</strong>
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-muted">No invoices raised against this contract yet.</p>
            )}
          </div>
            </div>
          </section>
      </div>

      {/* ------------------------------------------------------- dialogs */}
      {dialog === 'assign' && (
        <AssignDialog c={c} boot={boot} onClose={() => setDialog('')}
          onSaved={(msg) => { setDialog(''); setFlash(msg); load(); }} />
      )}
      {dialog === 'plan' && (
        <PlanDialog c={c} boot={boot} onClose={() => setDialog('')}
          onSaved={(msg) => { setDialog(''); setFlash(msg); load(); }} />
      )}
      {dialog === 'renew' && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6"
          onClick={() => setDialog('')}>
          <div className="bg-white rounded-lg shadow-pop w-full max-w-[440px] p-6"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold">Renew {c.id}?</h2>
            <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
              A new contract will be created starting the day after this one ends, with the
              same scope, frequency and value — and a fresh set of scheduled visits.
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button className={btnGhost} onClick={() => setDialog('')}>Cancel</button>
              <button className={btnRed}
                onClick={async () => {
                  try {
                    const r = await api.post<{ id: string; visitsCreated: number }>(
                      '/contracts/' + c.id + '/renew', {});
                    router.push('/contracts/' + r.id);
                  } catch (e) {
                    setDialog('');
                    setFlash(e instanceof Error ? e.message : 'Could not renew');
                  }
                }}>
                Renew for {c.months} months
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================= assign dialog */

function AssignDialog({ c, boot, onClose, onSaved }: {
  c: ContractDetail; boot: Boot; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const techs = boot.users.filter((u) => isFieldTech(u.role));
  const [busy, setBusy] = useState(false);
  // One-off visits for this customer with nobody on them — offered here
  // because "I assigned the contract, why is this still empty?" is exactly
  // the question this dialog used to leave behind.
  const loose = c.standaloneOpen || [];
  const [cover, setCover] = useState(true);
  // A working copy, so backing out of the dialog changes nothing.
  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const l of c.plan) {
      out[l.svId] = lineCrew({ svId: l.svId, crew: l.crew, techIds: l.techIds }).slice();
    }
    return out;
  });

  // Services landing on the same day are one trip and one crew. Picking
  // somebody already going that day costs nothing; a fresh face is another
  // head in the van.
  const mates = useMemo(() => {
    const out: Record<string, Record<string, 1>> = {};
    for (const v of planVisits(toInput(c, c.plan))) {
      for (const a of v.serviceIds) {
        out[a] = out[a] || {};
        for (const b of v.serviceIds) if (b !== a) out[a][b] = 1;
      }
    }
    return out;
  }, [c]);

  const peak = c.peakCrew || 1;
  const svcName = (sv: string) => boot.services.find((s) => s.id === sv)?.name || sv;
  const openJobs = (tid: string) => c.openJobsByTech[tid] || 0;

  /** Everyone already going on a trip this service shares. */
  function alreadyGoing(svId: string): Record<string, 1> {
    const out: Record<string, 1> = {};
    for (const other of Object.keys(mates[svId] || {})) {
      for (const tid of picked[other] || []) out[tid] = 1;
    }
    return out;
  }
  /** Total heads that will actually travel to this site. */
  function heads(): string[] {
    const all: Record<string, 1> = {};
    for (const l of c.plan) for (const tid of picked[l.svId] || []) all[tid] = 1;
    return Object.keys(all);
  }

  function toggle(svId: string, tid: string, need: number) {
    setPicked((p) => {
      const list = (p[svId] || []).slice();
      const at = list.indexOf(tid);
      if (at >= 0) list.splice(at, 1);
      else {
        // Never more than the service asks for — the oldest pick makes way,
        // so the count can't run past its own crew size.
        if (list.length >= need) list.shift();
        list.push(tid);
      }
      return { ...p, [svId]: list };
    });
  }

  // First on the list leads the service — this hands the lead to someone else.
  function makeHead(svId: string, tid: string) {
    setPicked((p) => {
      const list = (p[svId] || []).slice();
      const at = list.indexOf(tid);
      if (at <= 0) return p;
      list.splice(at, 1);
      list.unshift(tid);
      return { ...p, [svId]: list };
    });
  }

  const short = c.plan.reduce(
    (a, l) => a + Math.max(0, Math.max(1, l.crew || 1) - (picked[l.svId] || []).length), 0);
  const going = heads().length;
  const spare = going - peak;

  async function save() {
    setBusy(true);
    try {
      const r = await api.post<{ updated: number; held: number; covered: number; missing: number; ok: boolean }>(
        '/contracts/' + c.id + '/assign',
        {
          lines: c.plan.map((l) => ({ svId: l.svId, techIds: picked[l.svId] || [] })),
          coverStandalone: cover && loose.length > 0,
        });
      onSaved((r.ok ? 'Every service staffed' : 'Assignment saved') + ' — ' +
        r.updated + ' pending service' + (r.updated === 1 ? '' : 's') + ' updated' +
        (r.covered ? ' · ' + r.covered + ' standalone service' + (r.covered === 1 ? '' : 's') + ' covered too' : '') +
        (r.held ? ' · ' + r.held + ' hand-placed service' + (r.held === 1 ? '' : 's') + ' left alone' : '') +
        (r.ok ? '' : ' · ' + r.missing + ' still to fill'));
    } catch (e) {
      setBusy(false);
      onSaved(e instanceof Error ? e.message : 'Could not save the assignment');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-pop w-full max-w-[720px] max-h-[88vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Assign technicians</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {c.client?.name || '—'} · each service is staffed on its own
        </p>

        <div className="mt-4 rounded border border-line bg-wash px-4 py-3 text-[12.5px] text-ink-2 leading-relaxed">
          Services falling on the same day share one trip, and one crew works through
          them — so this contract needs <strong>{peak}</strong> {peak === 1 ? 'person' : 'people'} on
          its busiest day, not the total of every service below.
          {c.plan.some((l) => (l.crew || 1) > 1) && (
            <> Where a service takes a crew, the one marked{' '}
            <strong>HEAD</strong> leads it and records the work — tap{' '}
            <em>head?</em> on another name to hand that over.</>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {c.plan.map((l) => {
            const need = Math.max(1, l.crew || 1);
            const on = picked[l.svId] || [];
            const full = on.length >= need;
            const goingMap = alreadyGoing(l.svId);
            // Anybody already on the trip first — they are the free choice.
            const order = techs.slice().sort((x, y) =>
              (goingMap[y.id] ? 1 : 0) - (goingMap[x.id] ? 1 : 0));
            return (
              <div key={l.svId + l.id} className="rounded border border-line p-3.5">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[13.5px] truncate">{svcName(l.svId)}</p>
                    <p className="text-[12px] text-muted">
                      {l.visits} visit{l.visits === 1 ? '' : 's'} · {l.freq || ''} · takes{' '}
                      {need} {need === 1 ? 'person' : 'people'}
                    </p>
                  </div>
                  <span className={full ? 'zpill navy' : 'zpill red'}>{on.length} of {need}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.map((t) => {
                    const at = on.indexOf(t.id);
                    const free = !!goingMap[t.id];
                    return (
                      <button key={t.id} type="button"
                        title={free ? 'Already on this trip for another service'
                          : openJobs(t.id) + ' open jobs'}
                        onClick={() => toggle(l.svId, t.id, need)}
                        className={'flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-full border text-[12px] ' +
                          (at >= 0
                            ? 'border-navy bg-navy text-white font-medium'
                            : free
                              ? 'border-red-line bg-red-wash text-ink hover:border-accent'
                              : 'border-line hover:bg-wash')}>
                        <span className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center"
                          style={{ background: t.color || '#141414' }}>
                          {initials(t.name)}
                        </span>
                        {t.name}
                        <span className={'text-[10.5px] ' + (at >= 0 ? 'text-white/70'
                          : free ? 'text-accent font-semibold' : 'text-muted-2')}>
                          {free && at < 0 ? 'on the trip' : openJobs(t.id)}
                        </span>
                        {at === 0 && need > 1 && on.length > 1 && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-accent rounded px-1 py-px"
                            title="Leads the service — records the work">
                            Head
                          </span>
                        )}
                        {at > 0 && (
                          <span role="button" tabIndex={0}
                            title="Make them the head — they record the work"
                            onClick={(e) => { e.stopPropagation(); makeHead(l.svId, t.id); }}
                            className="text-[9px] font-semibold uppercase tracking-wider bg-white/15 hover:bg-white/35 rounded px-1 py-px">
                            head?
                          </span>
                        )}
                        {at >= 0 && <Icon name="check" size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[12.5px] text-ink-2 leading-relaxed">
          {short > 0 ? (
            <>
              <span className="text-accent font-semibold">
                {short} more {short === 1 ? 'place' : 'places'} to fill.
              </span>{' '}
              Save part-way if you like — the contract keeps reminding you.
            </>
          ) : spare > 0 ? (
            <>
              <span className="text-accent font-semibold">
                {going} people travel, but the busiest day only needs {peak}.
              </span>{' '}
              Pick someone marked <em>on the trip</em> instead of a new face and it drops to {peak}.
            </>
          ) : (
            <>
              Every service is staffed. <strong>{going}</strong>{' '}
              {going === 1 ? 'person goes' : 'people go'} to this site — exactly the {peak} the
              busiest day needs.
            </>
          )}
        </p>

        {loose.length > 0 && (
          <label className="mt-4 flex items-start gap-2.5 rounded border border-line bg-wash px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)}
              className="mt-0.5 accent-[#FF0000]" />
            <span className="text-[12.5px] leading-relaxed text-ink-2">
              <b>{c.client?.name || 'This customer'}</b> also has{' '}
              <b>{loose.length} standalone service{loose.length === 1 ? '' : 's'}</b> with nobody on{' '}
              {loose.length === 1 ? 'it' : 'them'} ({loose.map((x) => x.id).join(', ')}) — one-off
              bookings outside this contract. Put this crew on {loose.length === 1 ? 'it' : 'them'} too.
            </span>
          </label>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnRed} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================= plan editor */

interface EditLine {
  svId: string;
  visits: number;
  months: number;
  mins: number;
  day: number;
  slot: string;
  crew: number;
  techIds: string[];
  startAt: string; // carried through untouched, like the v1 editor
}

function PlanDialog({ c, boot, onClose, onSaved }: {
  c: ContractDetail; boot: Boot; onClose: () => void; onSaved: (msg: string) => void;
}) {
  // Work on a copy so Cancel really cancels.
  const [lines, setLines] = useState<EditLine[]>(() => c.plan.map((l) => ({
    svId: l.svId,
    visits: l.visits,
    months: l.months || c.months || 12,
    mins: l.mins,
    day: Number((/^dom:(\d{1,2})$/.exec(l.dayRule || '') || [])[1] || '1'),
    slot: l.slot || '10:00',
    crew: Math.max(1, l.crew || 1),
    techIds: l.techIds,
    startAt: l.startAt || '',
  })));
  const [merge, setMerge] = useState(c.mergeSameDay);
  const [workdays, setWorkdays] = useState(c.workdaysOnly);
  const [diff, setDiff] = useState<{
    add: number; update: number; remove: number; kept: number; frozen: number;
    warnings: Array<{ tone: string; text: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const svcName = (sv: string) => boot.services.find((s) => s.id === sv)?.name || sv;
  const svcCode = (sv: string) => boot.services.find((s) => s.id === sv)?.code || sv;

  const body = useMemo(() => ({
    mergeSameDay: merge,
    workdaysOnly: workdays,
    plan: lines.map((l) => ({
      svId: l.svId, visits: l.visits, months: l.months, mins: l.mins,
      dayRule: 'dom:' + l.day, slot: l.slot, crew: l.crew, techIds: l.techIds,
      startAt: l.startAt,
    })),
  }), [lines, merge, workdays]);

  const preview = useMemo(() => planVisits({
    id: c.id, start: c.start, end: c.end, months: c.months || undefined,
    slot: c.slot, mergeSameDay: merge, workdaysOnly: workdays, blackout: c.blackout,
    plan: body.plan.map((l) => ({ ...l, startAt: l.startAt || undefined })),
  }), [body, c, merge, workdays]);

  const serviceVisits = lines.reduce((a, l) => a + l.visits, 0);
  const mergedCount = preview.filter((v) => v.lines > 1).length;
  const totalMins = preview.reduce((a, v) => a + v.mins, 0);

  // The diff banner asks the server, debounced, so frozen visits and
  // technician clashes are judged against the real book of work.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post<typeof diff>('/contracts/' + c.id + '/plan-diff', body)
        .then(setDiff).catch(() => {});
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  function setLine(i: number, patch: Partial<EditLine>) {
    setLines((ls) => {
      const next = ls.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function cadenceOf(l: EditLine): string {
    const from = l.startAt || c.start;
    const term = Math.max(1, daysBetween(from, addMonths(from, l.months)));
    return cadenceLabel(term / Math.max(1, l.visits), l.visits) +
      (l.visits > 1 ? ' · every ' + Math.round(term / Math.max(1, l.visits)) + ' days' : '');
  }

  async function apply() {
    setBusy(true);
    try {
      const r = await api.post<{
        added: number; updated: number; removed: number; frozen: number;
        dropped: string[];
      }>('/contracts/' + c.id + '/apply-plan', body);
      const cut = (r.dropped || [])
        .map((id) => boot.users.find((u) => u.id === id)?.name || id);
      onSaved('Schedule updated — ' + r.added + ' added · ' + r.updated + ' updated · ' +
        r.removed + ' removed · ' + r.frozen + ' completed kept' +
        (cut.length ? '. ' + cut.join(', ') + ' came off a service — the crew size was lowered below the number assigned.' : ''));
    } catch (e) {
      setBusy(false);
      onSaved(e instanceof Error ? e.message : 'Could not apply the plan');
    }
  }

  const nothing = diff && !diff.add && !diff.update && !diff.remove;
  const num = 'h-8 rounded border border-line text-[12.5px] text-center outline-none focus:border-navy';

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-pop w-full max-w-[760px] max-h-[88vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Service plan · {c.id}</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Change an interval and see exactly what happens before it is applied.
        </p>

        {/* ------------------------------------------------- editable grid */}
        <div className="mt-4 rounded border border-line overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="flex gap-2 px-3 py-2 bg-wash border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted-2">
              <span className="flex-1">Service</span>
              <span className="w-[58px] shrink-0">Services</span>
              <span className="w-[64px] shrink-0">Months</span>
              <span className="w-[56px] shrink-0">Day</span>
              <span className="w-[92px] shrink-0">Time</span>
              <span className="w-[74px] shrink-0">Crew</span>
            </div>
            {lines.map((l, i) => (
              <div key={l.svId + i} className="flex gap-2 items-center px-3 py-2 border-b border-line-soft last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] truncate">{svcName(l.svId)}</p>
                  <p className="text-[11px] text-muted-2">
                    {svcCode(l.svId)} · {durationText(l.mins)} ·{' '}
                    <span className="text-navy font-semibold">{cadenceOf(l).toLowerCase()}</span>
                  </p>
                </div>
                <input className={num + ' w-[58px] shrink-0'} type="number" min={1} max={120}
                  value={l.visits}
                  onChange={(e) => setLine(i, {
                    visits: Math.min(120, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
                <input className={num + ' w-[64px] shrink-0'} type="number" min={1} max={60}
                  value={l.months}
                  onChange={(e) => setLine(i, {
                    months: Math.max(1, parseInt(e.target.value, 10) || c.months || 12),
                  })} />
                <input className={num + ' w-[56px] shrink-0'} type="number" min={1} max={31}
                  value={l.day}
                  onChange={(e) => setLine(i, {
                    day: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
                <input className={num + ' w-[92px] shrink-0 px-1'} type="time" value={l.slot}
                  onChange={(e) => setLine(i, { slot: e.target.value || '10:00' })} />
                <input className={num + ' w-[74px] shrink-0'} type="number" min={1} max={9}
                  title="How many technicians this service takes"
                  value={l.crew}
                  onChange={(e) => setLine(i, {
                    crew: Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-6 mt-3.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            Merge services falling on the same day into one visit
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={workdays} onChange={(e) => setWorkdays(e.target.checked)} />
            Skip Sundays
          </label>
        </div>

        {/* ---------------------------------------------------- preview */}
        {preview.length === 0 ? (
          <div className="mt-4 rounded border border-red-line bg-red-wash px-4 py-3 text-[13px] text-accent font-medium">
            This plan produces no visits. Check the frequency and visit counts.
          </div>
        ) : (
          <div className="mt-4 rounded border border-line bg-wash p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2.5">
              <p className="font-semibold text-[13.5px]">
                {serviceVisits} service-visits → {preview.length} trip{preview.length === 1 ? '' : 's'}
              </p>
              <p className="text-[12px] text-muted">
                {mergedCount} merged · {durationText(totalMins)} on site in total
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.slice(0, 8).map((v) => (
                <span key={v.date} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-line bg-white text-[11px]"
                  title={v.serviceIds.map(svcName).join(', ')}>
                  {fmtShort(v.date)}
                  <span className="text-muted-2">{v.serviceIds.length} svc · {v.mins}m</span>
                </span>
              ))}
              {preview.length > 8 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded border border-dashed border-line text-[11px] text-muted">
                  + {preview.length - 8} more
                </span>
              )}
            </div>
            {diff && diff.warnings.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {diff.warnings.map((wn, i) => (
                  <p key={i} className={'text-[12px] ' +
                    (wn.tone === 'crit' ? 'text-accent font-semibold'
                      : wn.tone === 'warn' ? 'text-accent' : 'text-muted')}>
                    {wn.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------- diff banner */}
        {diff && (
          <div className={'mt-3.5 rounded border px-4 py-3 text-[12.5px] ' +
            (nothing ? 'border-line bg-wash text-ink-2' : 'border-red-line bg-red-wash')}>
            <p className="font-semibold">
              {nothing ? 'No change to the schedule' : 'Applying this will change the schedule'}
            </p>
            <p className="mt-0.5 text-ink-2">
              {diff.add ? <><strong>{diff.add}</strong> service{diff.add === 1 ? '' : 's'} added · </> : null}
              {diff.update ? <><strong>{diff.update}</strong> updated · </> : null}
              {diff.remove ? <><strong>{diff.remove}</strong> removed · </> : null}
              <strong>{diff.frozen}</strong> completed service{diff.frozen === 1 ? '' : 's'} left untouched.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnRed} disabled={busy} onClick={apply}>
            {busy ? 'Applying…' : 'Apply to schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
