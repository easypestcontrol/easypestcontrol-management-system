'use client';

/* ============================================================================
   Job detail — manager view and the technician execution flow.

   Ported from v1 assets/js/views/jobs.js:243-789. A manager sees the customer
   and assignment cards, service details and the service report; a signed-in
   technician gets the 8 gated step cards (travel -> check in -> before photos
   -> start -> chemicals/findings -> after photos -> signature -> finish) with
   a live timer and a pointer-events signature pad.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { decodePolyline } from '@/lib/polyline';
import { getPosition } from '@/lib/geo';

// Ola map, loaded only when the technician opens navigation — never before.
const RouteMap = dynamic(() => import('../../trip/trip-map'), { ssr: false });
import Link from 'next/link';
import { api, type SessionUser } from '@/lib/api';
import NavigateSheet from '@/components/navigate-sheet';
import ShareLink from '@/components/share-link';
import { isFieldTech, money, toMin } from 'shared';
import { Icon } from '@/components/icons';
import PaidTick from '@/components/paid-tick';
import {
  SLOTS, durationText, fmtDate, fmtLong, fmtTime, relDay,
  type AreaFinding, type DayBoard, type ExecRecord, type JobDetail,
} from '../format';
import {
  Avatar, Field, Lightbox, Modal, PriorityPill, Stars, StatusPill, TypePill,
  inputCls, selectCls,
} from '../ui';

/* ---------------------------------------------------------------- helpers */

function blankExec(): ExecRecord {
  return {
    checkinAt: null, startedAt: null, finishedAt: null, durationMins: 0, geo: '',
    photosBefore: [], photosAfter: [], chemicals: [], findings: [], areaFindings: [],
    observations: '', techNotes: '', uniformPhotos: {},
    reportSentAt: '', reportSentTo: '', reportBy: '',
    signedBy: '', signature: false, signatureImage: '', rating: 0, feedback: '',
  };
}

/** Resize a camera photo to <=520px JPEG q0.72 — v1 jobs.js:17-32. */
function shrinkImage(file: File, max = 520): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
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
    fr.readAsDataURL(file);
  });
}

/** Browser GPS with a 2.5s race — v1 jobs.js:539-552. Server fills a fallback. */
function geoStamp(): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(undefined); } }, 4000);
    getPosition().then((pos) => {
      if (settled) return; settled = true; clearTimeout(t);
      resolve(pos.coords.latitude.toFixed(4) + '° N, ' + pos.coords.longitude.toFixed(4) + '° E');
    }).catch(() => {
      if (settled) return; settled = true; clearTimeout(t); resolve(undefined);
    });
  });
}

/* ------------------------------------------------------------------- page */

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [j, setJ] = useState<JobDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(
    () => api.get<JobDetail>('/jobs/' + id).then(setJ).catch(() => setMissing(true)),
    [id],
  );

  useEffect(() => {
    api.get<SessionUser>('/auth/me').then(setMe).catch(() => {});
    load();
  }, [load]);


  if (missing) {
    return (
      <div className="p-16 text-center">
        <p className="text-[15px] font-medium">Service not found</p>
        <p className="text-muted text-[13px] mt-1">This service may have been removed.</p>
        <Link href="/jobs" className="inline-block mt-4 text-[13px] font-semibold text-accent">
          Back to services
        </Link>
      </div>
    );
  }
  if (!j || !me) return <p className="p-4 lg:p-6 text-muted text-[13px]">Loading…</p>;

  return isFieldTech(me.role)
    ? <TechDetail j={j} me={me} reload={load} />
    : <ManagerDetail j={j} me={me} reload={load} />;
}

/**
 * The name to put on a call button. "Mr. Denishlin Hersho" split on the first
 * space gives "Call Mr." — which tells the technician nothing about who is
 * going to answer. Drop the honorific first.
 */
const HONORIFICS = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt', 'sri'];
function firstName(contact?: string | null): string {
  const parts = String(contact || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.includes(parts[0].replace(/\.$/, '').toLowerCase())) {
    parts.shift();
  }
  return parts[0] || 'customer';
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/jobs" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink">
      <Icon name="chevRight" size={13} className="rotate-180" /> {label}
    </Link>
  );
}

function Kv({ rows }: { rows: Array<[string, React.ReactNode] | null> }) {
  return (
    <dl>
      {rows.filter(Boolean).map((r, i) => (
        <div key={i} className="flex gap-3 py-1.5 border-b border-line-soft last:border-0 text-[13px]">
          <dt className="w-[128px] shrink-0 text-muted">{r![0]}</dt>
          <dd className="min-w-0 flex-1 text-ink">{r![1] || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({ title, children, foot }: {
  title: string; children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line">
      <h3 className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted border-b border-line-soft bg-wash rounded-t-md">
        {title}
      </h3>
      <div className="p-4">{children}</div>
      {foot && <div className="px-4 py-2.5 border-t border-line-soft">{foot}</div>}
    </section>
  );
}

function StatTile({ label, value, foot }: { label: string; value: React.ReactNode; foot?: string }) {
  return (
    <div className="rounded-md border border-line p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[19px] font-semibold text-navy mt-1 leading-tight">{value}</p>
      {foot && <p className="text-[11.5px] text-muted mt-0.5">{foot}</p>}
    </div>
  );
}

/* ====================================================== the service report */
// Shared between the manager view and the technician's completed view —
// v1 jobs.js:170-242.

function ReportCard({ j, onZoom }: { j: JobDetail; onZoom: (src: string) => void }) {
  const x = j.exec;
  if (!x) return null;
  const inv = new Map(j.inventory.map((i) => [i.id, i]));
  const dur = x.durationMins || j.mins;

  const photoGrid = (list: string[], alt: string) => (
    <div className="grid grid-cols-3 gap-2">
      {list.length ? list.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={p} alt={alt} onClick={() => onZoom(p)}
          className="h-20 w-full object-cover rounded border border-line cursor-zoom-in" />
      )) : <p className="text-[12.5px] text-muted col-span-3">No photos</p>}
    </div>
  );

  return (
    <Card title="Service report">
      {/* The report as a document — preview and share, like an invoice. */}
      {j.status === 'completed' && (
        <div className="flex items-center gap-2 mb-4">
          <a href={'/report/' + j.id} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110">
            View service report
          </a>
          <ShareLink path={'/report/' + j.id} title={'Service report ' + j.id}
            phone={j.client?.phone}
            text={`Service report for ${j.id} — what was done, photos and your signed acknowledgement:`} />
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile label="Checked in" value={fmtTime(x.checkinAt)} />
        <StatTile label="Work started" value={fmtTime(x.startedAt)} />
        <StatTile label="Completed" value={fmtTime(x.finishedAt)} />
        <StatTile label="Time on site" value={durationText(dur)} />
      </div>

      {x.geo && (
        <p className="text-[12.5px] text-muted mb-4">GPS verified at check-in — {x.geo}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-[12px] font-semibold text-ink-2 mb-2">Before treatment</p>
          {photoGrid(x.photosBefore, 'Before')}
        </div>
        <div>
          <p className="text-[12px] font-semibold text-ink-2 mb-2">After treatment</p>
          {photoGrid(x.photosAfter, 'After')}
        </div>
      </div>

      {x.findings.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-ink-2 mb-2">Pest activity observed</p>
          <div className="flex flex-wrap gap-1.5">
            {x.findings.map((f) => (
              <span key={f} className={f.indexOf('No activity') === 0 ? 'zpill outline' : 'zpill red'}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {x.chemicals.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-ink-2 mb-2">Chemicals used</p>
          <table className="ztable">
            <thead><tr><th>Product</th><th className="text-right">Quantity</th></tr></thead>
            <tbody>
              {x.chemicals.map((c, i) => {
                const it = inv.get(c.id);
                return (
                  <tr key={i}>
                    <td className="font-medium">{it?.name || c.id}</td>
                    <td className="text-right font-semibold">{c.qty} {it?.unit || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {x.observations && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-ink-2 mb-1.5">Technician observations</p>
          <p className="rounded border border-line-soft bg-wash p-3 text-[13px] leading-relaxed">
            {x.observations}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 pt-3.5 border-t border-line">
        <div>
          <p className="text-[12px] font-semibold text-ink-2 mb-1.5">Customer acknowledgement</p>
          {x.signature ? (
            <div className="flex items-center gap-3">
              {x.signatureImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.signatureImage} alt="Signature"
                  className="h-[52px] rounded border border-line bg-white" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-wash-2 flex items-center justify-center text-navy">
                  <Icon name="check" size={17} />
                </span>
              )}
              <span>
                <span className="block text-[13px] font-semibold">{x.signedBy || 'Signed on site'}</span>
                <span className="block text-[11.5px] text-muted">Digitally signed on completion</span>
              </span>
            </div>
          ) : (
            <span className="zpill red">Not signed</span>
          )}
        </div>
        {x.rating > 0 && (
          <div className="text-right">
            <p className="text-[12px] font-semibold text-ink-2 mb-1">Customer rating</p>
            <Stars n={x.rating} size={17} />
            {x.feedback && (
              <p className="text-[12px] text-muted mt-1 max-w-[280px]">&ldquo;{x.feedback}&rdquo;</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ========================================================== manager detail */

function ManagerDetail({ j, me, reload }: {
  j: JobDetail; me: SessionUser; reload: () => Promise<void>;
}) {
  const canManage = ['admin', 'ops', 'sales'].includes(me.role);
  const [zoom, setZoom] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [err, setErr] = useState('');

  // A standalone visit is not covered by any contract crew — but the
  // customer's contract people are the obvious first choice, so offer them.
  const [crewHint, setCrewHint] = useState<Array<{
    tech: { id: string; name: string; color: string };
    why: Array<{ good: boolean; text: string }>;
  }>>([]);
  useEffect(() => {
    if (j.contract || j.techIds.length || j.status === 'cancelled') { setCrewHint([]); return; }
    api.get<Array<{ tech: { id: string; name: string; color: string };
      why: Array<{ good: boolean; text: string }> }>>(
      '/dispatch/suggest?jobId=' + encodeURIComponent(j.id) + '&limit=6')
      .then((rows) => setCrewHint(
        rows.filter((r) => r.why.some((w) => w.text === "On this customer's contract"))))
      .catch(() => setCrewHint([]));
  }, [j]);

  // The money instruction for this visit — and the on-site Collect action
  // when the contract bills per visit.
  const [moneyInfo, setMoneyInfo] = useState<{
    mode: string; note: string; amount: number;
    invoice: { id: string; total: number; paid: number; balance: number } | null;
  } | null>(null);
  useEffect(() => {
    api.get<typeof moneyInfo>('/jobs/' + j.id + '/billing')
      .then(setMoneyInfo).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.id, j.status]);

  async function collect(payMode: string) {
    if (!moneyInfo?.invoice) return;
    try {
      await api.post('/invoices/' + moneyInfo.invoice.id + '/payments',
        { amount: moneyInfo.invoice.balance, mode: payMode, ref: 'Collected on site — ' + j.id });
      const fresh = await api.get<typeof moneyInfo>('/jobs/' + j.id + '/billing');
      setMoneyInfo(fresh);
    } catch { /* stays collectable */ }
  }

  async function quickAssign(techId: string) {
    try {
      await api.post('/jobs/' + j.id + '/assign-toggle', { techId });
      await reload();
    } catch { /* the banner stays; the modal is the fallback */ }
  }

  const cl = j.client;
  const done = j.status === 'completed';
  const x = j.exec;
  const svcCount = j.serviceIds.length;

  async function cancelJob() {
    if (!window.confirm('Cancel ' + j.id + '? The customer will need a new booking.')) return;
    try { await api.post('/jobs/' + j.id + '/cancel', {}); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not cancel'); }
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <BackLink label="All services" />

      {/* -------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mt-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={cl?.name || '?'} color={cl?.color} size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[18px] font-semibold truncate">{cl?.name || 'Service'}</h1>
              <StatusPill status={j.status} />
              <TypePill type={j.type} visitNo={j.visitNo} ofVisits={j.ofVisits} />
              <PriorityPill priority={j.priority} />
            </div>
            <p className="text-muted text-[13px] mt-0.5">
              {j.id} · {j.title} · {fmtLong(j.date)} at {fmtTime(j.slot)}
            </p>
          </div>
        </div>
        {canManage && !done && j.status !== 'cancelled' && (
          <div className="flex items-center gap-2">
            <button onClick={cancelJob}
              className="h-8 px-3 rounded text-[12.5px] font-medium text-muted hover:text-accent hover:bg-red-wash">
              Cancel service
            </button>
            <button onClick={() => setReschedOpen(true)}
              className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
              Reschedule
            </button>
            <button onClick={() => setAssignOpen(true)}
              className="h-8 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
              {j.techIds.length ? 'Reassign' : 'Assign technician'}
            </button>
          </div>
        )}
      </div>

      {err && <p className="mb-4 text-[12.5px] text-accent font-medium">{err}</p>}

      {/* --------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label={done ? 'Completed' : 'Scheduled'} value={fmtTime(j.slot)}
          foot={fmtDate(j.date) + ' · ' + relDay(j.date)} />
        <StatTile label={done ? 'Time on site' : 'Estimated duration'}
          value={durationText(done ? (x?.durationMins || j.mins) : j.mins)}
          foot={svcCount + ' service' + (svcCount === 1 ? '' : 's') + ' this service'} />
        {j.contract ? (
          <StatTile label="AMC service"
            value={(j.visitNo || 1) + ' / ' + (j.ofVisits || j.contract.totalVisits || 1)}
            foot={j.contract.id} />
        ) : (
          <StatTile label="Service type" value={j.type} foot="One-time service" />
        )}
        <StatTile label="Technician"
          value={j.techs.length ? j.techs[0].name.split(' ')[0] : '—'}
          foot={j.techs.length ? (j.techs[0].title || 'Technician') : 'Not assigned yet'} />
      </div>

      {/* ------------------------------------------------------- banners */}
      {!j.techIds.length && !done && j.status !== 'cancelled' && (
        <div className="mb-4 rounded-md border border-red-line bg-red-wash px-4 py-3 text-[13px]">
          <span className="font-semibold text-accent">No technician assigned.</span>{' '}
          <span className="text-ink-2">
            {j.contract
              ? 'This service will not appear on anyone’s “My day” list until you assign it.'
              : 'This is a standalone service — booked outside any contract, so the contract crew is not on it automatically.'}
          </span>
          {crewHint.length > 0 && (
            <span className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-ink-2">
                On this customer&rsquo;s contract:
              </span>
              {crewHint.map((r) => (
                <button key={r.tech.id} onClick={() => quickAssign(r.tech.id)}
                  className="flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full border border-line bg-white text-[12px] font-medium hover:border-navy">
                  <span className="w-5 h-5 rounded-full text-white text-[8.5px] font-bold flex items-center justify-center"
                    style={{ background: r.tech.color || '#141414' }}>
                    {r.tech.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </span>
                  Put {r.tech.name} on it
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      <ServiceScopeCard j={j} manager={true} />
      {/* Billed against a contract invoice. The office gets the link; what it
          shows is still only that the service was billed, not what happened to
          the money — that question belongs on the invoice, not here. */}
      {j.invoice && j.invoice.id !== moneyInfo?.invoice?.id && (
        <div className="mb-4 rounded-md border border-line bg-wash px-4 py-3 text-[13px]">
          <span className="font-semibold">Invoiced.</span>{' '}
          <span className="text-ink-2">
            This service was billed on{' '}
            <Link href={'/invoices/' + j.invoice.id}
              className="font-bold text-navy underline decoration-line hover:text-accent">
              {j.invoice.id} ↗
            </Link>{' '}
            on {j.invoice.date}.
          </span>
        </div>
      )}
      {moneyInfo && j.status !== 'cancelled' && (
        <div className={'mb-4 rounded-md border px-4 py-3 text-[13px] ' +
          (moneyInfo.invoice && moneyInfo.invoice.balance > 0
            ? 'border-red-line bg-red-wash' : 'border-line bg-wash')}>
          <span className="font-semibold">{moneyInfo.note}.</span>
          {moneyInfo.invoice && (
            <span className="text-ink-2">
              {' '}Invoice{' '}
              <Link href={'/invoices/' + moneyInfo.invoice.id}
                className="font-bold text-navy underline decoration-line hover:text-accent">
                {moneyInfo.invoice.id} ↗
              </Link>{' '}
              — {money(moneyInfo.invoice.total)} incl. GST
              {moneyInfo.invoice.balance <= 0
                ? <span className="text-navy font-semibold"> · collected ✓</span>
                : <> · balance <b className="text-accent">{money(moneyInfo.invoice.balance)}</b></>}
            </span>
          )}
          {moneyInfo.invoice && moneyInfo.invoice.balance > 0 && (
            <span className="mt-2 flex gap-2">
              {['UPI', 'Cash'].map((pm) => (
                <button key={pm} onClick={() => collect(pm)}
                  className="h-8 px-3.5 rounded bg-accent text-white text-[12.5px] font-semibold hover:brightness-90">
                  Collected {money(moneyInfo.invoice!.balance)} — {pm}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {j.status === 'inprogress' && x && (
        <div className="mb-4 rounded-md border border-line bg-wash px-4 py-3 text-[13px]">
          <span className="font-semibold">{j.techs[0]?.name || 'The technician'} is on site right now.</span>{' '}
          <span className="text-muted">
            Checked in at {fmtTime(x.checkinAt)} · work started {fmtTime(x.startedAt)}
          </span>
        </div>
      )}

      {/* --------------------------------------------------------- body */}
      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <Card title="Customer & site"
            foot={cl && (
              <Link href="/customers" className="text-[12.5px] font-semibold text-accent">
                View customer file
              </Link>
            )}>
            <div className="flex items-center gap-3 mb-3.5">
              <Avatar name={cl?.name || '?'} color={cl?.color} size={38} />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold truncate">{cl?.name || '—'}</p>
                <p className="text-[12px] text-muted">{cl ? cl.type + (cl.area ? ' · ' + cl.area : '') : ''}</p>
              </div>
            </div>
            <Kv rows={[
              ['Contact', cl?.contact],
              ['Phone', cl?.phone],
              ['Site address', cl ? [cl.addr, cl.city].filter(Boolean).join(', ') + (cl.pin ? ' — ' + cl.pin : '') : '—'],
            ]} />
          </Card>

          <Card title="Assignment">
            {j.techs.length ? j.techs.map((t) => (
              <div key={t.id} className="mb-4 last:mb-0">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={t.name} color={t.color} size={38} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold">{t.name}</p>
                    <p className="text-[12px] text-muted">{t.title || 'Technician'}</p>
                  </div>
                </div>
                <Kv rows={[
                  ['Phone', t.phone],
                  ['Skills', t.skills.join(', ')],
                  ['Rating', t.rating ? t.rating.toFixed(1) + ' ★' : '—'],
                ]} />
              </div>
            )) : (
              <p className="text-[13px] text-muted">Nobody assigned yet.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Card title="Service details">
            <Kv rows={[
              ['Service number', j.id],
              ['Type', (j.type === 'AMC Visit' ? 'AMC Service' : j.type) + (j.visitNo ? ' — service ' + j.visitNo + ' of ' + j.ofVisits : '')],
              ['Services', j.services.map((s) => s.name).join(', ') || j.title],
              ['Scheduled', fmtLong(j.date) + ' at ' + fmtTime(j.slot)],
              ['Estimated duration', durationText(j.mins)],
              j.contract ? ['Contract', (
                <Link key="c" href={'/contracts/' + j.contract.id} className="font-semibold text-accent">
                  {j.contract.id}
                </Link>
              )] : null,
              ['Warranty', j.services.map((s) => s.warranty).filter(Boolean).join(', ') || '—'],
            ]} />
            {j.notes && (
              <div className="mt-3.5 rounded-md border border-line bg-wash px-3.5 py-2.5 text-[12.5px]">
                <span className="font-semibold">Instructions for the technician.</span>{' '}
                <span className="text-ink-2">{j.notes}</span>
              </div>
            )}
          </Card>

          {done && x ? (
            <ReportCard j={j} onZoom={setZoom} />
          ) : (
            <Card title="Service report">
              <div className="py-8 text-center">
                <p className="text-[14px] font-medium">Report not available yet</p>
                <p className="text-muted text-[12.5px] mt-1 max-w-[420px] mx-auto">
                  The technician fills this in from the field — timings, before/after photos,
                  chemicals used, findings and the customer signature.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {assignOpen && (
        <AssignModal j={j} onClose={() => setAssignOpen(false)}
          onDone={async () => { setAssignOpen(false); await reload(); }} />
      )}
      {reschedOpen && (
        <RescheduleModal j={j} onClose={() => setReschedOpen(false)}
          onDone={async () => { setReschedOpen(false); await reload(); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ assign modal */
// v1 jobs.js:817-869 — rows show that-day load (red when >3); click toggles:
// on the job -> removed; crew full -> the oldest pick makes way.

function AssignModal({ j, onClose, onDone }: {
  j: JobDetail; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [board, setBoard] = useState<DayBoard | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<DayBoard>('/schedule/day?date=' + j.date).then(setBoard).catch(() => {});
  }, [j.date]);

  async function toggle(techId: string) {
    setBusy(techId); setErr('');
    try {
      await api.post('/jobs/' + j.id + '/assign-toggle', { techId });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the crew');
      setBusy('');
    }
  }

  return (
    <Modal title="Assign technician" sub={fmtDate(j.date) + ' at ' + fmtTime(j.slot)} onClose={onClose}>
      {!board ? (
        <p className="text-muted text-[13px]">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {board.techs.map((t) => {
            const load = t.jobs.length;
            const mine = j.techIds.includes(t.id);
            return (
              <button key={t.id} onClick={() => toggle(t.id)} disabled={!!busy}
                className={
                  'flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-left hover:bg-wash disabled:opacity-60 ' +
                  (mine ? 'border-navy' : 'border-line')
                }>
                <Avatar name={t.name} color={t.color} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                    {t.name}
                    {mine && <span className="zpill navy">On this job</span>}
                  </span>
                  <span className="block text-[12px] text-muted truncate">
                    {t.title || 'Technician'}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className={'block text-[15px] font-semibold ' + (load > 3 ? 'text-accent' : load ? 'text-ink' : 'text-muted-2')}>
                    {load}
                  </span>
                  <span className="block text-[10.5px] text-muted uppercase tracking-wide">that day</span>
                </span>
              </button>
            );
          })}
          <p className="text-[11.5px] text-muted mt-1">
            This service needs {Math.max(1, j.crewNeed)} {Math.max(1, j.crewNeed) === 1 ? 'person' : 'people'}.
            When the crew is full, the earliest pick makes way.
          </p>
          {err && <p className="text-[12.5px] text-accent font-medium">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------- reschedule modal */
// v1 jobs.js:870-889 — date + slot + reason; direct set, no pin.

function RescheduleModal({ j, onClose, onDone }: {
  j: JobDetail; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [date, setDate] = useState(j.date);
  const [slot, setSlot] = useState(j.slot || '10:00');
  const [slotEnd, setSlotEnd] = useState(
    j.slotEnd || (() => {
      const m = toMin(j.slot || '10:00') + Math.max(60, j.mins || 120);
      return String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    })(),
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      await api.post('/jobs/' + j.id + '/reschedule', { date, slot, slotEnd, reason: reason.trim() });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reschedule');
      setBusy(false);
    }
  }

  return (
    <Modal title="Reschedule service"
      sub={j.id + ' · currently ' + fmtDate(j.date) + ' at ' + fmtTime(j.slot)} onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="New date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="From">
          <input type="time" value={slot} onChange={(e) => setSlot(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <p className="text-[11px] text-muted-2 mt-1.5">
        The technicians are booked for exactly this window — the day schedule and dispatch follow it.
      </p>
      <div className="mt-4">
        <Field label="Reason (goes to the customer)">
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested a different day" className={inputCls} />
        </Field>
      </div>
      {err && <p className="mt-3 text-[12.5px] text-accent font-medium">{err}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="h-9 px-4 rounded border border-line text-[13px] font-medium hover:bg-wash">
          Cancel
        </button>
        <button onClick={save} disabled={busy}
          className="h-9 px-4 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-60">
          {busy ? 'Saving…' : 'Reschedule'}
        </button>
      </div>
    </Modal>
  );
}

/* ======================================================= technician detail */
// The 8 gated steps — v1 jobs.js:361-427. st(cond, active): everything is
// done once the job completes; a met condition is done; the next unmet step
// is active; the rest stay locked. Chemicals and findings never show "done".

type StepState = 'done' | 'active' | 'locked';

/**
 * Everything this visit delivers — the quoted services by NAME, what each
 * involves, and the medicines defined for it (issued from inventory; the
 * technician uses only these). Managers also see the contracted rate and
 * the quotation the contract came from.
 */
function ServiceScopeCard({ j, manager }: { j: JobDetail; manager: boolean }) {
  const info = (j as unknown as { serviceInfo?: Array<{
    id: string; name: string; desc: string; warranty: string; mins: number; rate: number;
    medicines: Array<{ id: string; name: string; unit: string; stock: number }>;
  }> }).serviceInfo || [];
  const ct = j.contract as unknown as { id?: string; quoteId?: string; scope?: string } | null;
  if (!info.length) return null;
  return (
    <div className="rounded-md border border-line mb-4 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          What this visit delivers
        </span>
        {ct?.id && (
          <span className="text-[11px] text-muted">
            Contract <Link href={'/contracts/' + ct.id} className="font-semibold text-navy hover:text-accent">{ct.id}</Link>
            {manager && ct.quoteId ? <> · from quotation{' '}
              <Link href={'/quotations/' + ct.quoteId} className="font-semibold text-navy hover:text-accent">{ct.quoteId}</Link></> : null}
          </span>
        )}
      </div>
      {info.map((sv) => (
        <div key={sv.id} className="px-4 py-3 border-b border-line-soft last:border-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-[13.5px] font-semibold">{sv.name}</span>
            <span className="text-[11.5px] text-muted">
              {durationText(sv.mins)}{sv.warranty ? ' · warranty ' + sv.warranty : ''}
              {manager && sv.rate > 0 ? ' · ' + money(sv.rate) + ' per service' : ''}
            </span>
          </div>
          {sv.desc && <p className="text-[12px] text-ink-2 leading-relaxed mt-1">{sv.desc}</p>}
          {sv.medicines.length > 0 && (
            <div className="mt-2">
              <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted mb-1">
                Medicines for this service — issued from inventory
              </span>
              <span className="flex flex-wrap gap-1.5">
                {sv.medicines.map((m) => (
                  <span key={m.id} title={'In stock: ' + m.stock + ' ' + m.unit}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-line text-[11.5px]">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-2">({m.unit})</span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      ))}
      <p className="px-4 py-2 text-[10.5px] text-muted-2 bg-wash">
        Service is delivered exactly as quoted on the contract. Use only the medicines issued from
        stores — what is actually used is recorded at finish and deducted from inventory.
      </p>
    </div>
  );
}

function TechDetail({ j, me, reload }: {
  j: JobDetail; me: SessionUser; reload: () => Promise<void>;
}) {
  const x = j.exec || blankExec();
  const cl = j.client;
  const done = j.status === 'completed';

  // Each crew member submits their own uniform photo — it is about *this*
  // person. Uniform + site mark stay REQUIRED (the finish gate names them),
  // they just no longer block "On my way" — travel comes first.
  const myUniform = (x.uniformPhotos || {})[me.id] || '';
  const hasUniform = !!myUniform;
  // Only the head records the work; the crew get the trip and a read-only view.
  const isHead = !j.headTechId || j.headTechId === me.id;
  const siteKnown = cl?.siteLat != null && cl?.siteLng != null;

  const hasTravel = j.status === 'enroute' || !!x.checkinAt || j.status === 'inprogress';
  const hasCheckin = !!x.checkinAt;
  const hasBefore = x.photosBefore.length > 0;
  const hasStart = !!x.startedAt;
  const hasAfter = x.photosAfter.length > 0;
  const hasSign = x.signature;

  /**
   * Why the finish button is not available yet. Naming the missing thing is
   * the difference between a button that looks broken and one that is waiting.
   */
  // Name only what is actually outstanding. Telling a technician to take a
  // uniform photo he has already taken is worse than saying nothing — he goes
  // looking for a bug that is not there.
  const finishBlocker = (() => {
    const missing: string[] = [];
    if (!hasUniform) missing.push('take your uniform photo');
    if (!siteKnown) missing.push('mark this location');
    if (!hasAfter) missing.push('add an after-treatment photo');
    if (!hasSign) missing.push('get the customer to sign');
    if (!missing.length) return '';
    const list = missing.length === 1
      ? missing[0]
      : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
    return list.charAt(0).toUpperCase() + list.slice(1);
  })();
  const canFinish = !finishBlocker;

  const st = (cond: boolean, active: boolean): StepState =>
    done ? 'done' : cond ? 'done' : active ? 'active' : 'locked';

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [obs, setObs] = useState(x.observations);
  const [areas, setAreas] = useState<AreaFinding[]>(x.areaFindings || []);
  const [notes, setNotes] = useState(x.techNotes || '');
  const [signName, setSignName] = useState(x.signedBy || cl?.contact || '');
  const [rating, setRating] = useState(0);
  const [finished, setFinished] = useState<{
    photos: number; chemicals: number; rating: number; durationMins: number;
    billing?: { invoiceId: string; existed: boolean; planBilled: boolean } | null;
  } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const destText = [cl?.addr, cl?.city].filter(Boolean).join(', ');
  const sigRef = useRef<{ isInked: () => boolean; clear: () => void; data: () => string } | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); }
    setBusy(false);
  }

  const path = '/jobs/' + j.id;

  async function addPhoto(kind: 'before' | 'after', file: File) {
    const dataUrl = await shrinkImage(file, 520);
    await act(() => api.post(path + '/exec/photos', { kind, dataUrl }));
  }

  /**
   * The uniform photo. `capture="environment"` on the input asks the phone for
   * the camera rather than the gallery — an old photo would defeat the point.
   */
  async function addUniform(file: File) {
    const dataUrl = await shrinkImage(file, 720);
    await act(() => api.post(path + '/exec/uniform', { dataUrl }));
  }

  /**
   * Mark where this site is, once, from the doorstep. The server rejects a fix
   * that is not accurate enough; we surface that reason rather than a generic
   * failure, because the fix is for the technician to step outside.
   */
  async function markSite() {
    setBusy(true); setErr('');
    try {
      const pos = await getPosition();
      await api.post(path + '/exec/site-geo', {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      });
      await reload();
    } catch (e) {
      const msg = e instanceof GeolocationPositionError
        ? (e.code === 1 ? 'Location permission is off — turn it on for this site'
          : 'Could not get a location fix. Step outside and try again')
        : e instanceof Error ? e.message : 'Could not save the location';
      setErr(msg);
    }
    setBusy(false);
  }

  async function checkin() {
    setBusy(true); setErr('');
    let geo = await geoStamp();
    // The marked site location answers when the phone's GPS will not —
    // the check-in auto-fetches from "Mark this location".
    if (!geo && siteKnown) {
      geo = cl!.siteLat!.toFixed(4) + '° N, ' + cl!.siteLng!.toFixed(4) + '° E';
    }
    try { await api.post(path + '/exec/checkin', geo ? { geo } : {}); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not check in'); }
    setBusy(false);
  }

  /**
   * Step 1 — three things in one tap: the enroute status, the customer's
   * WhatsApp heads-up (prefilled; sending stays a human act), and the trip
   * with live directions on the Ola map.
   */
  async function onMyWay() {
    setBusy(true); setErr('');
    try {
      await api.post(path + '/exec/travel', {});
      const digits = (cl?.phone || '').replace(/\D/g, '');
      if (digits) {
        const msg = `Hello${cl?.contact ? ' ' + cl.contact : ''}! We are on the way to your site for today's service: ${j.title} (${j.id}).`;
        window.open(
          'https://wa.me/' + (digits.length === 10 ? '91' + digits : digits)
            + '?text=' + encodeURIComponent(msg),
          '_blank',
        );
      }
      try {
        await api.post('/trips', {
          purpose: 'Service ' + j.id + ' — ' + (cl?.name || ''), jobId: j.id, dest: destText,
        });
        window.dispatchEvent(new Event('trip:changed')); // the tracker starts pinging
      } catch { /* a trip already running keeps counting */ }
      if (destText) setNavOpen(true); // directions open right away
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start travel'); }
    setBusy(false);
  }

  async function toggleFinding(f: string) {
    const next = x.findings.includes(f)
      ? x.findings.filter((v) => v !== f)
      : [...x.findings, f];
    await act(() => api.patch(path + '/exec/findings', { findings: next, observations: obs.trim() }));
  }

  async function saveObservations() {
    if (obs.trim() === x.observations) return;
    try { await api.patch(path + '/exec/findings', { findings: x.findings, observations: obs.trim() }); await reload(); }
    catch { /* observations retry on next save */ }
  }

  async function saveAreas(next: AreaFinding[]) {
    setAreas(next);
    try { await api.patch(path + '/exec/notes', { areaFindings: next, techNotes: notes.trim() }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save — check your connection'); }
  }

  async function saveNotes() {
    if (notes.trim() === (x.techNotes || '')) return;
    try { await api.patch(path + '/exec/notes', { areaFindings: areas, techNotes: notes.trim() }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the note'); }
  }

  const [sigOpen, setSigOpen] = useState(false);

  async function saveSignature() {
    if (!sigRef.current?.isInked()) { setErr('Ask the customer to sign in the box'); return; }
    await act(() => api.post(path + '/exec/signature', {
      signedBy: signName.trim(),
      signatureImage: sigRef.current!.data(),
      rating: rating || 5,
      observations: obs.trim(),
    }));
    setSigOpen(false);
  }

  async function finish() {
    if (!(hasSign && hasAfter)) {
      setErr('Add after-photos and the customer signature first');
      return;
    }
    setBusy(true); setErr('');
    try {
      const res = await api.post<{
        summary: { photos: number; chemicals: number; rating: number; durationMins: number };
        billing?: { invoiceId: string; existed: boolean; planBilled: boolean } | null;
      }>(path + '/exec/finish', { observations: obs.trim() });
      setFinished({ ...res.summary, billing: res.billing || null });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not finish');
    }
    setBusy(false);
  }

  /* -------------------------------------------------- completed view */
  if (done) {
    return (
      <div className="p-5 max-w-[640px] mx-auto pb-16">
        <BackLink label="Today's work" />
        <div className="mt-3 mb-4 rounded-md border border-line bg-wash px-4 py-3 text-[13px]">
          <span className="font-semibold">Service completed.</span>{' '}
          <span className="text-muted">
            Finished at {fmtTime(x.finishedAt)} · {durationText(x.durationMins)} on site.
            The report has gone to {cl?.contact || 'the customer'}.
          </span>
        </div>
        <HeaderCard j={j} />
        <div className="mt-4">
          <ServiceScopeCard j={j} manager={false} />
          <TechMoney j={j} />
        </div>
        <div className="mt-4">
          <ReportCard j={j} onZoom={setZoom} />
        </div>
        {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}

        {finished && (
          <Modal title="Service completed" sub={j.id + ' · ' + j.title}
            onClose={() => setFinished(null)}>
            <div className="text-center py-2">
              <span className="mx-auto w-[58px] h-[58px] rounded-full bg-navy text-white flex items-center justify-center">
                <Icon name="check" size={28} />
              </span>
              <p className="text-[17px] font-semibold mt-3.5">
                Nice work, {me.name.split(' ')[0]}
              </p>
              <p className="text-muted text-[13px] mt-1">
                {durationText(finished.durationMins)} on site at {cl?.name || 'the customer'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mt-4">
              <StatTile label="Photos" value={finished.photos} />
              <StatTile label="Chemicals" value={finished.chemicals} />
              <StatTile label="Rating" value={finished.rating + '★'} />
            </div>
            {/* The billing answer, right where the finish happened. */}
            {finished.billing?.invoiceId && (
              <p className="mt-4 rounded border border-line bg-wash px-3.5 py-2.5 text-[12.5px] text-ink-2 text-center">
                {finished.billing.existed ? (
                  <>Invoice <b>{finished.billing.invoiceId}</b> was already raised by the
                  office for this service — it is on this page below, with its paid status.</>
                ) : (
                  <>Invoice <b>{finished.billing.invoiceId}</b> has been raised for this
                  service — collect and record the payment below.</>
                )}
              </p>
            )}
            {finished.billing?.planBilled && (
              <p className="mt-4 rounded border border-line bg-wash px-3.5 py-2.5 text-[12.5px] text-muted text-center">
                This service is billed on the contract&rsquo;s payment plan — its invoice
                comes from the billing schedule, not per service.
              </p>
            )}
            <button onClick={() => setFinished(null)}
              className="mt-5 w-full h-10 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90">
              Done — report sent
            </button>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[640px] mx-auto pb-24 max-lg:pb-28">
      <BackLink label="Today's work" />
      <div className="mt-3">
        <HeaderCard j={j} />
      </div>
      <div className="mt-3">
        <ServiceScopeCard j={j} manager={false} />
        <TechMoney j={j} />
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-line bg-red-wash px-4 py-2.5 text-[12.5px] font-medium text-accent">
          {err}
        </div>
      )}

      {j.status === 'inprogress' && x.startedAt && (
        <div className="mt-4 rounded-md border border-red-line p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Time on site</p>
          <LiveTimer startedAt={x.startedAt} />
        </div>
      )}

      {!isHead && (
        <div className="mt-4 rounded-md border border-line bg-wash p-4">
          <p className="text-[13.5px] font-semibold">
            {j.techs.find((t) => t.id === j.headTechId)?.name || 'The head'} is leading this service
          </p>
          <p className="text-[12.5px] text-muted mt-1">
            They record the work. You are on the crew — start your trip, and the checklist
            below is yours to follow.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 mt-4">
        <StepCard n={1} title="On my way" state={st(hasTravel, true)}
          subtitle={hasTravel ? 'Travel started' : 'WhatsApp the customer + directions to the site'}>
          {hasTravel ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] text-muted">On the way — the customer has been notified.</p>
              {destText && (
                <button onClick={() => setNavOpen(true)}
                  className="w-full h-10 rounded border border-navy text-navy text-[13px] font-semibold hover:bg-wash">
                  Open directions
                </button>
              )}
            </div>
          ) : (
            <>
              <button onClick={onMyWay} disabled={busy}
                className="w-full h-11 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90 disabled:opacity-60">
                I&rsquo;m on my way
              </button>
              <p className="text-[11.5px] text-muted mt-1.5">
                Opens WhatsApp with the heads-up message for the customer, starts your trip,
                and shows directions to the site on the Ola map.
              </p>
            </>
          )}
        </StepCard>

        <StepCard n={2} title="Photo of you in uniform" state={st(hasUniform, hasTravel && !hasUniform)} why="After you start travel"
          subtitle={hasUniform ? 'Taken' : 'Camera only — proof you arrived in uniform'}>
          {hasUniform ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setZoom(myUniform)}
                className="w-16 h-16 rounded border border-line overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={myUniform} alt="In uniform" className="w-full h-full object-cover" />
              </button>
              <label className="h-9 px-3 rounded border border-line text-[12.5px] font-medium
                hover:bg-wash cursor-pointer flex items-center">
                Retake
                <input type="file" accept="image/*" capture="environment" hidden disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addUniform(f); }} />
              </label>
            </div>
          ) : (
            <>
              <label className="w-full h-11 rounded bg-accent text-white text-[13.5px] font-semibold
                hover:brightness-90 cursor-pointer flex items-center justify-center gap-2">
                <Icon name="upload" size={16} /> Take the photo
                <input type="file" accept="image/*" capture="environment" hidden disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addUniform(f); }} />
              </label>
              <p className="text-[11.5px] text-muted mt-1.5">
                Taken now with the camera, not picked from your gallery.
              </p>
            </>
          )}
        </StepCard>

        <StepCard n={3} title="Mark this location" state={st(siteKnown, hasTravel && !siteKnown)} why="After you start travel"
          subtitle={siteKnown ? 'Marked — every visit here navigates to it' : 'Stand at the doorstep and mark it once'}>
          {siteKnown ? (
            <p className="text-[12.5px] text-muted">
              {cl!.siteLat!.toFixed(4)}° N, {cl!.siteLng!.toFixed(4)}° E — saved as this
              customer&rsquo;s location. Every next service navigates straight here on the Ola map.
            </p>
          ) : (
            <>
              <button onClick={markSite} disabled={busy}
                className="w-full h-11 rounded bg-accent text-white text-[13.5px] font-semibold
                  hover:brightness-90 disabled:opacity-60 flex items-center justify-center gap-2">
                <Icon name="branch" size={16} /> {busy ? 'Getting a fix…' : 'Mark this location'}
              </button>
              <p className="text-[11.5px] text-muted mt-1.5">
                This records the customer&rsquo;s exact location — the next technician navigates
                to it, and the office sees the service happened at the right place.
              </p>
            </>
          )}
        </StepCard>

        {/* From here on only the head records; the crew's part was 1–3. */}
        <div className={'flex flex-col gap-2.5' + (isHead ? '' : ' opacity-40 pointer-events-none')}
          aria-disabled={!isHead}>
        <StepCard n={4} title="Check in at site" state={st(hasCheckin, hasTravel && !hasCheckin)} why="After you start travel"
          subtitle={hasCheckin ? 'Checked in at ' + fmtTime(x.checkinAt) : 'Location is stamped on the report'}>
          {hasCheckin ? (
            <p className="text-[12.5px] text-muted">{x.geo} · {fmtTime(x.checkinAt)}</p>
          ) : (
            <>
              {siteKnown && (
                <p className="text-[12px] text-muted mb-2">
                  Site location on file: {cl!.siteLat!.toFixed(4)}° N, {cl!.siteLng!.toFixed(4)}° E
                  — the check-in fetches it automatically if the GPS is slow.
                </p>
              )}
              <button onClick={checkin} disabled={busy}
                className="w-full h-11 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90 disabled:opacity-60">
                {busy ? 'Getting location…' : 'Check in at this site'}
              </button>
            </>
          )}
        </StepCard>

        <StepCard n={5} title="Before-treatment photos" state={st(hasBefore, hasCheckin && !hasBefore)} why="After you check in"
          subtitle={x.photosBefore.length + ' photo(s) added'}>
          <PhotoBlock list={x.photosBefore} kind="before" busy={busy}
            onAdd={(f) => addPhoto('before', f)} onZoom={setZoom}
            onRemove={(i) => act(() => api.del(path + '/exec/photos?kind=before&index=' + i))} />
        </StepCard>

        <StepCard n={6} title="Start the work" state={st(hasStart, hasBefore && !hasStart)} why="After the before-photos"
          subtitle={hasStart ? 'Timer running' : 'The clock starts when you tap this'}>
          {hasStart ? (
            <p className="text-[12.5px] text-muted">Started at {fmtTime(x.startedAt)}</p>
          ) : (
            <button onClick={() => act(() => api.post(path + '/exec/start', {}))} disabled={busy}
              className="w-full h-12 rounded bg-accent text-white text-[14px] font-semibold hover:brightness-90 disabled:opacity-60">
              Start work
            </button>
          )}
        </StepCard>

        <StepCard n={7} title="Chemicals used" state={hasStart ? 'active' : 'locked'} why="After you start the work"
          subtitle={x.chemicals.length + ' item(s) recorded'}>
          <ChemBlock j={j} busy={busy}
            onAdd={(itemId, qty) => act(() => api.post(path + '/exec/chemicals', { itemId, qty }))}
            onRemove={(i) => act(() => api.del(path + '/exec/chemicals/' + i))}
            onErr={setErr} />
        </StepCard>

        <StepCard n={8} title="What you did, area by area" state={hasStart ? 'active' : 'locked'} why="After you start the work"
          subtitle={areas.length ? areas.length + ' area(s) recorded' : 'Kitchen, bathroom, living room…'}>
          <AreaFindingsBlock rows={areas} busy={busy} onChange={saveAreas} />
        </StepCard>

        <StepCard n={9} title="After-treatment photos" state={st(hasAfter, hasStart && !hasAfter)} why="After you start the work"
          subtitle={x.photosAfter.length + ' photo(s) added'}>
          <PhotoBlock list={x.photosAfter} kind="after" busy={busy}
            onAdd={(f) => addPhoto('after', f)} onZoom={setZoom}
            onRemove={(i) => act(() => api.del(path + '/exec/photos?kind=after&index=' + i))} />
        </StepCard>

        <StepCard n={10} title="Your notes" state={hasStart ? 'active' : 'locked'} why="After you start the work"
          subtitle={notes.trim() ? 'Noted' : 'Anything the office should know'}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
            disabled={busy}
            placeholder="Access, the customer's requests, what to watch for next visit…"
            className="w-full min-h-[80px] px-3 py-2 rounded border border-line text-[13px]
              outline-none focus:border-navy" />
          <p className="text-[11.5px] text-muted mt-1.5">
            Goes on the report with your name against it.
          </p>
        </StepCard>

        <StepCard n={11} title="Customer signature & rating" state={st(hasSign, hasAfter && !hasSign)} why="After the after-photos"
          subtitle={hasSign ? 'Signed by ' + (x.signedBy || '—') : 'Hand the phone to the customer'}>
          {hasSign ? (
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-wash-2 flex items-center justify-center text-navy shrink-0">
                <Icon name="check" size={17} />
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold">Signed by {x.signedBy}</span>
                {x.rating > 0 && <Stars n={x.rating} />}
              </span>
              <button onClick={() => act(() => api.del(path + '/exec/signature'))} disabled={busy}
                className="h-8 px-3 rounded border border-line text-[12.5px] font-medium hover:bg-wash">
                Redo
              </button>
            </div>
          ) : (
            <div>
              <Field label="Customer name">
                <input value={signName} onChange={(e) => setSignName(e.target.value)}
                  placeholder="Who is signing?" className={inputCls} />
              </Field>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[12px] text-muted">Rating:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={n + ' stars'}
                    className={'text-[19px] leading-none ' + (n <= rating ? 'text-accent' : 'text-muted-2 hover:text-muted')}>
                    ★
                  </button>
                ))}
              </div>
              <button disabled={busy}
                onClick={() => {
                  if (!signName.trim()) { setErr('Enter the name of the person signing first'); return; }
                  setErr(''); setSigOpen(true);
                }}
                className="mt-3 w-full h-12 rounded bg-accent text-white text-[14px] font-semibold hover:brightness-90 disabled:opacity-60">
                Add signature
              </button>
              <p className="text-[11.5px] text-muted mt-1.5">
                Opens a full-screen box — hand the phone to the customer to sign.
              </p>
            </div>
          )}
        </StepCard>
        </div>
      </div>

      {navOpen && (
        <NavigateSheet destText={destText} title={cl?.name || 'the site'}
          onClose={() => setNavOpen(false)} />
      )}

      {/* Full-screen signature sheet — the phone becomes the signature pad. */}
      {sigOpen && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold">Customer signature</p>
              <p className="text-[12px] text-muted truncate">
                {signName.trim()} — please sign anywhere in the box
              </p>
            </div>
            <button onClick={() => setSigOpen(false)}
              className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash shrink-0">
              Cancel
            </button>
          </div>
          <div className="flex-1 p-3 overflow-hidden">
            <SigPad apiRef={sigRef} big />
          </div>
          {err && (
            <p className="px-4 pb-1 text-[12.5px] font-medium text-accent shrink-0">{err}</p>
          )}
          <div className="px-4 py-3 border-t border-line grid grid-cols-2 gap-3 shrink-0
            pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={() => sigRef.current?.clear()}
              className="h-12 rounded border border-line text-[14px] font-semibold hover:bg-wash">
              Clear
            </button>
            <button onClick={saveSignature} disabled={busy}
              className="h-12 rounded bg-accent text-white text-[14px] font-semibold hover:brightness-90 disabled:opacity-60">
              {busy ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- finish bar
          Only the head can finish, so only the head gets the bar. On a phone
          it rides ABOVE the bottom nav (60px tall, also fixed) — same z-index,
          later paint order, so bottom-0 here would bury the button under the
          tabs. Desktop offsets past the sidebar and keeps the safe-area pad. */}
      {isHead && (
        <div className="fixed bottom-[60px] lg:bottom-0 left-0 lg:left-[224px] right-0 bg-white
          border-t border-line px-5 py-3 z-40 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-[640px] mx-auto">
            <button onClick={finish} disabled={busy || !canFinish}
              className={
                'w-full h-12 rounded text-[14px] font-semibold ' +
                (canFinish
                  ? 'bg-accent text-white hover:brightness-90'
                  : 'bg-wash-2 text-muted cursor-not-allowed')
              }>
              Finish service &amp; send report
            </button>
            {/* Never a dead button with no reason — §11. */}
            {!canFinish && (
              <p className="text-[11.5px] text-muted text-center mt-1.5">{finishBlocker}</p>
            )}
          </div>
        </div>
      )}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/* ----------------------------------------------------- money on site */

/**
 * What this visit is worth and how to take the money — Cash goes into the
 * technician's wallet, UPI opens a Razorpay QR once the keys are connected,
 * Bank transfer records the UTR. Every rupee lands against the collector's
 * name with date and time.
 */
function TechMoney({ j }: { j: JobDetail }) {
  const router = useRouter();
  const [info, setInfo] = useState<{
    mode: string; note: string; amount: number;
    invoice: { id: string; total: number; paid: number; balance: number } | null;
    trip?: Array<{ id: string; status: string; services: string; amount: number }>;
  } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const load = () => api.get<typeof info>('/jobs/' + j.id + '/billing').then(setInfo).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [j.id, j.status]);

  if (!info || (!info.invoice && info.mode !== 'pervisit')) return null;

  return (
    <div className={'rounded-md border p-4 ' +
      (info.invoice && info.invoice.balance > 0 ? 'border-red-line bg-red-wash' : 'border-line')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Money</p>
      <p className="text-[13px] font-semibold">{info.note}</p>
      {info.invoice ? (
        <p className="text-[12.5px] text-ink-2 mt-1">
          Invoice{' '}
          <Link href={'/invoices/' + info.invoice.id}
            className="font-bold text-navy underline decoration-line hover:text-accent">
            {info.invoice.id} ↗
          </Link>{' '}
          — {money(info.invoice.total)} incl. GST
          {info.invoice.balance <= 0
            ? <span className="text-navy font-semibold"> · collected ✓</span>
            : <> · to collect <b className="text-accent">{money(info.invoice.balance)}</b></>}
        </p>
      ) : (
        <p className="text-[12px] text-muted mt-1">The invoice raises itself when you finish the service.</p>
      )}
      {(info.trip?.length || 0) > 0 && (
        <div className="mt-2 rounded border border-line bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
            Same trip — also due on this visit
          </p>
          {info.trip!.map((tj) => (
            <Link key={tj.id} href={'/jobs/' + tj.id}
              className="flex justify-between gap-2 text-[12.5px] py-0.5 text-navy hover:text-accent">
              <span className="truncate">{tj.services} <span className="text-muted-2 font-mono text-[10.5px]">{tj.id}</span></span>
              <span className="font-semibold shrink-0">
                {tj.amount > 0 ? money(tj.amount) + ' + GST' : ''}
              </span>
            </Link>
          ))}
          <p className="text-[10.5px] text-muted-2 mt-1">
            Each service bills as its own invoice, so every amount tallies —
            collect them together on this one visit.
          </p>
        </div>
      )}
      {doneMsg && <p className="text-[12.5px] font-semibold text-navy mt-2">{doneMsg}</p>}
      {info.invoice && info.invoice.balance > 0 && (
        <button onClick={() => setCollecting(true)}
          className="mt-3 w-full h-10 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90">
          Collect {money(info.invoice.balance)}
        </button>
      )}
      {collecting && info.invoice && (
        <CollectDialog invoiceId={info.invoice.id} balance={info.invoice.balance} jobId={j.id}
          onClose={() => setCollecting(false)}
          onDone={(msg) => {
            setCollecting(false); setDoneMsg(msg); load();
            // The moment the money is recorded, the invoice itself opens —
            // the receipt is on it, no extra tap.
            router.push('/invoices/' + info.invoice!.id);
          }} />
      )}
    </div>
  );
}

function CollectDialog({ invoiceId, balance, jobId, onClose, onDone }: {
  invoiceId: string; balance: number; jobId: string;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'Cash' | 'UPI' | 'Transfer'>('Cash');
  const [amount, setAmount] = useState(String(balance));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState<{ qrId: string; image: string; amount: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [landed, setLanded] = useState<
    { amount: number; receiptId: string; note?: string } | null
  >(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  /* Let it be seen before the screen moves. */
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => onDone(
      money(landed.amount) + ' received on UPI — receipt ' + (landed.receiptId || '') + '.',
    ), 1900);
    return () => clearTimeout(t);
  }, [landed, onDone]);

  async function recordManual() {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { setErr('Enter the amount collected'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/invoices/' + invoiceId + '/payments', {
        amount: amt, mode,
        ref: (ref.trim() ? ref.trim() + ' · ' : '') + 'Collected on site — ' + jobId,
      });
      onDone(mode === 'Cash'
        ? money(amt) + ' recorded in your wallet — deposit it at the office.'
        : money(amt) + ' recorded against your name (' + (mode === 'Transfer' ? 'bank transfer' : mode) + ').');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not record'); setBusy(false); }
  }

  async function openQr() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ qrId: string; image: string; amount: number }>('/pay/upi/' + invoiceId, {});
      setQr(r); setBusy(false);
      pollRef.current = setInterval(async () => {
        try {
          const st = await api.get<{ paid: boolean; receipt?: string; amount?: number }>(
            '/pay/upi/' + r.qrId + '/status?invoiceId=' + invoiceId);
          if (st.paid) {
            if (pollRef.current) clearInterval(pollRef.current);
            /* The customer is standing right there. Say it, then stand aside. */
            setLanded({
              amount: st.amount || r.amount,
              receiptId: st.receipt || '',
              note: 'Receipt ' + (st.receipt || 'issued') + ' — the office has been told.',
            });
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the QR');
      setBusy(false);
    }
  }

  const modeBtn = (m: 'Cash' | 'UPI' | 'Transfer', label: string) => (
    <button key={m} onClick={() => { setMode(m); setErr(''); setQr(null); if (pollRef.current) clearInterval(pollRef.current); }}
      className={'h-10 rounded border text-[13px] font-semibold ' +
        (mode === m ? 'border-navy bg-wash text-navy' : 'border-line text-ink-2 hover:bg-wash')}>
      {label}
    </button>
  );

  return (
    <Modal title={'Collect payment'} sub={invoiceId + ' · balance ' + money(balance)} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {modeBtn('Cash', 'Cash')}
        {modeBtn('UPI', 'UPI')}
        {modeBtn('Transfer', 'Bank transfer')}
      </div>

      {mode === 'UPI' && !qr && (
        <button onClick={openQr} disabled={busy}
          className="w-full h-10 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-60 mb-3">
          {busy ? 'Opening…' : 'Show the QR code'}
        </button>
      )}
      {landed && <PaidTick {...landed} />}
      {qr && !landed && (
        <div className="text-center mb-3">
          {/* Held up to a customer at their door, so it wants the width it can
              get — the code inside Razorpay's poster is only a third of it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.image} alt="Scan to pay with any UPI app"
            className="block mx-auto w-full max-w-[320px] h-auto rounded bg-white" />
          <p className="text-[13px] text-muted mt-2">
            {money(qr.amount)} — waiting for the customer to scan and pay…
          </p>
        </div>
      )}

      {(mode !== 'UPI' || err) && !landed && (
        <>
          <label className="block mb-3">
            <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">Amount collected (₹)</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 rounded border border-line text-[14px] outline-none focus:border-navy" />
          </label>
          {mode === 'Transfer' && (
            <label className="block mb-3">
              <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">UTR / reference no.</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder="From the customer's transfer receipt"
                className="w-full h-10 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>
          )}
          {mode === 'UPI' && (
            <p className="text-[11.5px] text-muted-2 mb-2">
              …or record the UPI collection manually if the customer paid to the office UPI directly.
            </p>
          )}
          <button onClick={recordManual} disabled={busy}
            className="w-full h-10 rounded bg-accent text-white text-[13.5px] font-semibold hover:brightness-90 disabled:opacity-60">
            {busy ? 'Recording…' : 'Record ' + (mode === 'Transfer' ? 'bank transfer' : mode)}
          </button>
        </>
      )}
      {err && <p className="text-accent text-[12.5px] mt-2">{err}</p>}
      <p className="text-[11px] text-muted-2 mt-3">
        Every collection is stored with your name, the date and the exact time — visible to you and the office.
      </p>
    </Modal>
  );
}

/**
 * Start a tracked trip to this site and open the Ola map INSIDE the app —
 * no new tab. Falls back to an external link only when Ola is not connected.
 */
function NavigateButton({ j }: { j: JobDetail }) {
  const [tripOn, setTripOn] = useState(false);
  const [open, setOpen] = useState(false);
  const cl = j.client;
  const destText = [cl?.addr, cl?.city].filter(Boolean).join(', ');

  async function go() {
    try {
      if (!tripOn) {
        await api.post('/trips', {
          purpose: 'Service ' + j.id + ' — ' + (cl?.name || ''), jobId: j.id, dest: destText,
        });
        window.dispatchEvent(new Event('trip:changed')); // the tracker starts pinging
        setTripOn(true);
      }
    } catch { /* the map still opens */ }
    setOpen(true); // the Ola sheet handles every case — including "not connected"
  }

  return (
    <>
      <button onClick={go}
        className={'flex items-center justify-center h-12 lg:h-9 rounded text-[12.5px] font-semibold ' +
          (tripOn ? 'border border-navy text-navy' : 'bg-navy text-white hover:brightness-110')}>
        {tripOn ? 'Trip recording · open map' : 'Navigate to site'}
      </button>
      {open && (
        <NavigateSheet destText={destText} title={cl?.name || 'the site'} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * The in-app navigation sheet. Opening it costs exactly ONE Ola geocode and
 * ONE route call (plus the map tiles the person is looking at) — refreshed
 * only when the technician taps Refresh, never on a timer.
 */

/* -------------------------------------------------------- tech sub-blocks */

function HeaderCard({ j }: { j: JobDetail }) {
  const cl = j.client;
  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <span className="flex items-center gap-1.5 flex-wrap">
          <TypePill type={j.type} />
          <StatusPill status={j.status} />
          <PriorityPill priority={j.priority} />
        </span>
        <span className="font-mono text-[12px] text-muted">{j.id}</span>
      </div>
      <p className="text-[16.5px] font-semibold tracking-tight">{cl?.name || '—'}</p>
      <p className="text-[13px] text-muted mt-0.5">
        {j.title}{j.visitNo ? ' · service ' + j.visitNo + ' of ' + j.ofVisits : ''}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12.5px] text-ink-2">
        <span>{fmtTime(j.slot)}</span>
        <span>{durationText(j.mins)}</span>
        <span>{relDay(j.date)}</span>
      </div>
      {cl && (cl.addr || cl.city) && (
        <p className="mt-2.5 text-[12.5px] text-ink-2">
          {cl.addr}{cl.city ? ', ' + cl.city : ''}
        </p>
      )}
      {(cl?.phone || cl?.addr || cl?.city) && (
        <div className="grid grid-cols-2 gap-2 mt-3.5">
          {cl?.phone && (
            <a href={'tel:' + cl.phone}
              className="flex items-center justify-center h-12 lg:h-9 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
              Call {firstName(cl.contact)}
            </a>
          )}
          {(cl?.addr || cl?.city) && <NavigateButton j={j} />}
        </div>
      )}
      {j.notes && (
        <div className="mt-3.5 rounded-md border border-red-line bg-red-wash px-3.5 py-2.5 text-[12.5px]">
          <span className="font-semibold">Site instructions.</span>{' '}
          <span className="text-ink-2">{j.notes}</span>
        </div>
      )}
      {/* Billed or not — and nothing more. No amount, no paid-or-unpaid: a
          technician who knows the visit is invoiced knows enough, and telling
          him whether the customer has paid only invites him to chase it. */}
      {j.invoice && (
        <div className="mt-3.5 flex items-center gap-2 text-[12px] text-muted">
          <Icon name="invoice" size={13} className="opacity-70" />
          <span><span className="font-semibold text-ink-2">Invoiced</span> · {j.invoice.id} · {j.invoice.date}</span>
        </div>
      )}
    </div>
  );
}

function StepCard({ n, title, state, subtitle, why, children }: {
  n: number; title: string; state: StepState; subtitle?: string;
  /** What has to happen first. A locked step that will not say why is the
      single most common small failure in a field app — the technician stands
      there tapping it. */
  why?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={
      'rounded-md border ' +
      (state === 'active' ? 'border-navy' : 'border-line') +
      (state === 'locked' ? ' opacity-55' : '')
    }>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={
          'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ' +
          (state === 'done' ? 'bg-navy text-white' : state === 'active' ? 'bg-accent text-white' : 'bg-wash-2 text-muted')
        }>
          {state === 'done' ? <Icon name="check" size={13} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{title}</span>
          {subtitle && <span className="block text-[12px] text-muted">{subtitle}</span>}
        </span>
        {state === 'locked' && (
          <span className="text-[11px] text-muted-2 text-right shrink-0 max-w-[124px] leading-tight">
            {why || 'Locked'}
          </span>
        )}
      </div>
      {state !== 'locked' && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function PhotoBlock({ list, kind, busy, onAdd, onRemove, onZoom }: {
  list: string[]; kind: string; busy: boolean;
  onAdd: (f: File) => void; onRemove: (i: number) => void; onZoom: (src: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-3 gap-2">
      {list.map((p, i) => (
        <span key={i} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt="" onClick={() => onZoom(p)}
            className="h-20 w-full object-cover rounded border border-line cursor-zoom-in" />
          <button onClick={() => onRemove(i)} disabled={busy} aria-label="Remove photo"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center hover:bg-accent">
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="h-20 rounded border border-dashed border-line flex flex-col items-center justify-center gap-1 text-muted hover:bg-wash hover:text-ink disabled:opacity-60">
        <Icon name="plus" size={16} />
        <span className="text-[11px] font-semibold">Camera</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-kind={kind}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = '';
        }} />
    </div>
  );
}

function ChemBlock({ j, busy, onAdd, onRemove, onErr }: {
  j: JobDetail; busy: boolean;
  onAdd: (itemId: string, qty: number) => void; onRemove: (i: number) => void;
  onErr: (msg: string) => void;
}) {
  const inv = new Map(j.inventory.map((i) => [i.id, i]));
  const used = j.exec?.chemicals || [];
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState('50');

  /*
   * ONLY what is in the technician's own hand. Not the warehouse, not the
   * catalogue — what was issued to them, minus what this service already
   * recorded. An exhausted chemical disappears from the list entirely: no
   * "0 g" rows, and nothing can be used past the holding.
   */
  const [hold, setHold] = useState<Record<string, number> | null>(null); // null = loading
  useEffect(() => {
    api.get<{ holding: Array<{ itemId: string; qty: number }> }>('/techstock')
      .then((r) => {
        const m: Record<string, number> = {};
        (r.holding || []).forEach((h) => { m[h.itemId] = h.qty; });
        setHold(m);
      })
      .catch(() => setHold({}));
  }, [j.id]);

  const usedOf = (id: string) => used.filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);
  const leftOf = (id: string) => ((hold || {})[id] ?? 0) - usedOf(id);
  const avail = j.inventory.filter((i) => i.cat === 'Chemical' && leftOf(i.id) > 0);
  const left = sel ? leftOf(sel) : 0;

  // Keep the selection on something actually available as holdings change.
  useEffect(() => {
    if (!avail.some((c) => c.id === sel)) setSel(avail[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, used.length]);

  return (
    <div>
      {used.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {used.map((c, i) => {
            const it = inv.get(c.id);
            return (
              <div key={i} className="flex items-center gap-3 rounded border border-line px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">{it?.name || c.id}</span>
                  <span className="block text-[11.5px] text-muted">{it?.note || ''}</span>
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap">{c.qty} {it?.unit || ''}</span>
                <button onClick={() => onRemove(i)} disabled={busy} aria-label="Remove"
                  className="w-7 h-7 rounded flex items-center justify-center text-muted hover:bg-red-wash hover:text-accent">
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {hold === null ? (
        <p className="text-[12.5px] text-muted">Checking what you are carrying…</p>
      ) : avail.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          {used.length
            ? 'Everything issued to you is recorded — nothing left in your hand.'
            : 'Nothing in your hand. Chemicals are issued to you from the store — ask the office or your senior technician.'}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className={selectCls + ' flex-1'}>
              {avail.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {leftOf(c.id)} {c.unit} with you
                </option>
              ))}
            </select>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-[88px] h-9 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            <button disabled={busy}
              onClick={() => {
                const n = parseFloat(qty) || 0;
                if (!n) { onErr('Enter a quantity'); return; }
                if (!sel) { onErr('Pick a chemical'); return; }
                if (n > left) {
                  onErr('You only have ' + left + ' ' + (inv.get(sel)?.unit || '') + ' of '
                    + (inv.get(sel)?.name || 'this') + ' in hand — that is the most you can record.');
                  return;
                }
                onAdd(sel, n);
              }}
              className="h-9 px-3.5 rounded bg-navy text-white flex items-center justify-center hover:brightness-110 disabled:opacity-60">
              <Icon name="plus" size={15} />
            </button>
          </div>
          <p className="text-[11.5px] text-muted mt-2">
            Only what the store issued to you appears here. It comes off your holding when
            you finish{sel ? ` — ${left} ${inv.get(sel)?.unit || ''} of ${inv.get(sel)?.name || ''} left` : ''}.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * What was done, area by area. The old canned-chip list said what was *found*;
 * the technician needs to say what he *did*, and the areas of a property are
 * not a list anyone can pre-write — a factory has bays, a flat has a kitchen.
 * So: type the area, type the work, add another.
 */
function AreaFindingsBlock({ rows, busy, onChange }: {
  rows: AreaFinding[]; busy: boolean; onChange: (next: AreaFinding[]) => void;
}) {
  const [draft, setDraft] = useState<AreaFinding[]>(rows.length ? rows : [{ area: '', text: '' }]);

  /* Keep a blank row at the bottom so there is always somewhere to type. */
  const norm = (list: AreaFinding[]) => {
    const filled = list.filter((r) => r.area.trim() || r.text.trim());
    return [...filled, { area: '', text: '' }];
  };

  const edit = (i: number, key: 'area' | 'text', v: string) => {
    const next = draft.map((r, k) => (k === i ? { ...r, [key]: v } : r));
    setDraft(next);
  };

  const commit = () => {
    const clean = draft.filter((r) => r.area.trim() || r.text.trim());
    setDraft(norm(clean));
    onChange(clean);
  };

  const remove = (i: number) => {
    const clean = draft.filter((_, k) => k !== i).filter((r) => r.area.trim() || r.text.trim());
    setDraft(norm(clean));
    onChange(clean);
  };

  return (
    <div className="flex flex-col gap-2">
      {draft.map((r, i) => {
        const last = i === draft.length - 1;
        const empty = !r.area.trim() && !r.text.trim();
        return (
          <div key={i} className="flex gap-2 items-start">
            <input value={r.area} disabled={busy} onBlur={commit}
              onChange={(e) => edit(i, 'area', e.target.value)}
              placeholder="Area"
              className="w-[104px] shrink-0 h-9 px-2.5 rounded border border-line text-[13px]
                outline-none focus:border-navy" />
            <textarea value={r.text} disabled={busy} onBlur={commit}
              onChange={(e) => edit(i, 'text', e.target.value)}
              placeholder="What you did here"
              className="flex-1 min-h-[36px] px-2.5 py-2 rounded border border-line text-[13px]
                outline-none focus:border-navy" />
            <button type="button" onClick={() => remove(i)}
              disabled={busy || (last && empty)}
              aria-label="Remove this area"
              className="h-9 w-9 shrink-0 rounded border border-line text-muted
                hover:bg-wash disabled:opacity-30 flex items-center justify-center">
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
      <p className="text-[11.5px] text-muted">
        One line per area — kitchen, bathroom, terrace. A new row appears as you fill the last.
      </p>
    </div>
  );
}

function FindingsBlock({ selected, busy, onToggle }: {
  selected: string[]; busy: boolean; onToggle: (f: string) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>([]);
  useEffect(() => {
    api.get<string[]>('/jobs/findings-catalog').then(setCatalog).catch(() => {});
  }, []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {catalog.map((f) => {
        const on = selected.includes(f);
        return (
          <button key={f} onClick={() => onToggle(f)} disabled={busy}
            className={
              'h-7 px-2.5 rounded-full text-[12px] font-medium border disabled:opacity-60 ' +
              (on ? 'bg-navy text-white border-navy' : 'border-line text-ink-2 hover:bg-wash')
            }>
            {f}
          </button>
        );
      })}
    </div>
  );
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [txt, setTxt] = useState('00:00');
  useEffect(() => {
    const t0 = new Date(startedAt.replace(' ', 'T')).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setTxt((hh !== '00' ? hh + ':' : '') + mm + ':' + ss);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [startedAt]);
  return <p className="text-[28px] font-bold text-navy font-mono tracking-tight mt-1">{txt}</p>;
}

/** Pointer-events signature pad, dpr-scaled, saved as a PNG data URL. */
function SigPad({ apiRef, big }: {
  apiRef: React.MutableRefObject<{ isInked: () => boolean; clear: () => void; data: () => string } | null>;
  big?: boolean;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    // Big mode fills the customer-facing sheet — a signature needs room.
    const h = big ? Math.max(300, Math.round(window.innerHeight - 230)) : 168;
    cv.style.height = h + 'px';
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(280, rect.width) * dpr;
    cv.height = h * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#141414';

    let drawing = false;
    const state = { inked: false };
    const pt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      drawing = true;
      state.inked = true;
      const p = pt(e);
      g.beginPath();
      g.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pt(e);
      g.lineTo(p.x, p.y);
      g.stroke();
    };
    const up = () => { drawing = false; };

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    apiRef.current = {
      isInked: () => state.inked,
      clear: () => { g.clearRect(0, 0, cv.width, cv.height); state.inked = false; },
      data: () => cv.toDataURL('image/png'),
    };

    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      apiRef.current = null;
    };
  }, [apiRef, big]);

  return (
    <canvas ref={cvRef} style={{ height: big ? 300 : 168 }}
      className="w-full rounded border border-line bg-white touch-none" />
  );
}
