'use client';

/* ============================================================================
   The service, one step at a time.

   On a phone the eleven steps of a service used to be eleven cards stacked
   down a page: everything open at once, everything scrollable, and the one
   thing you were supposed to do next somewhere in the middle of it. Standing
   at a customer's gate with one hand free, that is a page to search rather
   than a job to do.

   So it is a runner. The job stays at the top — who, what, when, where —
   because that is what you check before you knock. Under it, one step fills
   the frame, with one button that moves you on. The bar across the top goes
   from red to green as the service gets done, so how far through you are is
   a colour rather than a count.

   Anything that cannot be taken back asks first, in the app's own voice: the
   trip, the finished work, the report. Anything that can be — a photo, a
   note — just happens.

   The desk keeps the stacked view. A manager reading a service after the
   fact wants it all on one screen; the person doing it does not.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type SessionUser } from '@/lib/api';
import { getPosition } from '@/lib/geo';
import { Icon } from '@/components/icons';
import Confirm, { type ConfirmSpec } from '@/components/confirm';
import NavigateSheet from '@/components/navigate-sheet';
import { BackBar } from '@/components/mobile';
import { canRecordService, money } from 'shared';
import { STATUS, durationText, fmtTime, relDay, type AreaFinding, type JobDetail } from '../format';
import { Lightbox, Stars } from '../ui';
import {
  AreaFindingsBlock, ChemBlock, LiveTimer, PhotoBlock, SigPad,
  blankExec, geoStamp, shrinkImage,
} from './exec-parts';

/* --------------------------------------------------------------- the step */

interface Step {
  key: string;
  /** The words on the progress line and the step head. Short. */
  title: string;
  /** One line under the title. Never a paragraph. */
  hint?: string;
  done: boolean;
  body: React.ReactNode;
  /** What the button says when the step is not finished yet. */
  waiting?: string;
  /** Runs instead of a plain advance — a confirm, or the finish. */
  onNext?: () => void;
}

/** The honorific is not the name to call somebody by. */
const HONORIFICS = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt', 'sri'];
function firstName(contact?: string | null): string {
  const parts = String(contact || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.includes(parts[0].replace(/\.$/, '').toLowerCase())) {
    parts.shift();
  }
  return parts[0] || 'customer';
}

export default function TechRun({ j, me, reload }: {
  j: JobDetail; me: SessionUser; reload: () => Promise<void>;
}) {
  const x = j.exec || blankExec();
  const cl = j.client;
  const path = '/jobs/' + j.id;
  /* The server's rule, not a second guess at it: a technician records the
     service he is head of, and a job with no head recorded is a data fault
     nobody writes to. Guessing more freely here only produced a checklist
     whose every tap came back 403. */
  const isHead = canRecordService(me, j);

  const [at, setAt] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  const [said, setSaid] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [notes, setNotes] = useState(x.techNotes || '');
  const [areas, setAreas] = useState<AreaFinding[]>(x.areaFindings || []);
  const [signName, setSignName] = useState(x.signedBy || cl?.contact || '');
  const [rating, setRating] = useState(x.rating || 0);
  const [workDone, setWorkDone] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [bill, setBill] = useState<{ amount: number; note: string; mode: string } | null>(null);
  const sigRef = useRef<{ isInked: () => boolean; clear: () => void; data: () => string } | null>(null);

  const myUniform = (x.uniformPhotos || {})[me.id] || '';
  const siteKnown = cl?.siteLat != null && cl?.siteLng != null;
  const hasTravel = j.status === 'enroute' || j.status === 'inprogress' || !!x.checkinAt;
  const hasCheckin = !!x.checkinAt;
  const hasBefore = x.photosBefore.length > 0;
  const hasStart = !!x.startedAt;
  const hasAfter = x.photosAfter.length > 0;
  const destText = [cl?.addr, cl?.city].filter(Boolean).join(', ');

  /* What this visit collects, in one line. The technician is told the figure
     and nothing else — whether it has been paid is the office's business. */
  useEffect(() => {
    let dead = false;
    api.get<{ amount: number; note: string; mode: string }>(path + '/billing')
      .then((b) => { if (!dead) setBill(b); })
      .catch(() => {});
    return () => { dead = true; };
  }, [path]);

  /** A word that appears, then goes. Confirmation without a dialog to dismiss. */
  function say(msg: string) {
    setSaid(msg);
    setTimeout(() => setSaid((v) => (v === msg ? '' : v)), 2600);
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setErr('');
    try {
      await fn();
      await reload();
      if (ok) say(ok);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------- actions */

  /**
   * Navigate to site and On my way are one thing, so they are one button.
   * Tapping it starts the trip the office is paying for, so it asks first —
   * and only then tells the customer, opens the map, and moves the service
   * to "on the way".
   */
  function goNavigate() {
    setAsk({
      title: 'Start the trip to this site?',
      body: 'Tells ' + (cl?.contact || 'the customer') + ' you are on the way, starts your '
        + 'trip for reimbursement, and opens the map.',
      confirmLabel: 'Yes, start the trip',
      cancelLabel: 'Not yet',
      onConfirm: () => { void travel(); },
    });
  }

  async function travel() {
    setBusy(true); setErr('');
    try {
      await api.post(path + '/exec/travel', {});
      const digits = (cl?.phone || '').replace(/\D/g, '');
      if (digits) {
        const msg = 'Hello' + (cl?.contact ? ' ' + cl.contact : '')
          + '! We are on the way to your site for today’s service: ' + j.title + ' (' + j.id + ').';
        window.open('https://wa.me/' + (digits.length === 10 ? '91' + digits : digits)
          + '?text=' + encodeURIComponent(msg), '_blank');
      }
      try {
        await api.post('/trips', {
          purpose: 'Service ' + j.id + ' — ' + (cl?.name || ''), jobId: j.id, dest: destText,
        });
        window.dispatchEvent(new Event('trip:changed'));
      } catch { /* a trip already running keeps counting */ }
      await reload();
      /* Our own map, not Google's. The trip is measured on the route Ola
         gives us — every kilometre of it lands on the technician's trip and
         his reimbursement, and a route driven inside another app is a
         distance nobody here can account for. */
      setMapOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start travel');
    }
    setBusy(false);
  }


  async function markSite(): Promise<boolean> {
    setBusy(true); setErr('');
    try {
      const pos = await getPosition();
      await api.post(path + '/exec/site-geo', {
        lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy,
      });
      await reload();
      say('Location marked successfully');
      return true;
    } catch (e) {
      setErr(e instanceof GeolocationPositionError
        ? (e.code === 1 ? 'Location permission is off — turn it on for this site'
          : 'Could not get a location fix. Step outside and try again')
        : e instanceof Error ? e.message : 'Could not save the location');
      return false;
    } finally { setBusy(false); }
  }

  /** Marking the doorstep and checking in are the same arrival, so one tap does both. */
  async function markAndCheckin() {
    setBusy(true); setErr('');
    try {
      if (!siteKnown) {
        const pos = await getPosition();
        await api.post(path + '/exec/site-geo', {
          lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy,
        });
      }
      let geo = await geoStamp();
      if (!geo && siteKnown) {
        geo = cl!.siteLat!.toFixed(4) + '° N, ' + cl!.siteLng!.toFixed(4) + '° E';
      }
      await api.post(path + '/exec/checkin', geo ? { geo } : {});
      /* Arriving IS the end of the trip. It used to keep recording through the
         service and out the other side, so a two-hour treatment turned into
         two hours of "travel" and the map kept offering to navigate to a site
         the technician was standing in. */
      await endTrip();
      await reload();
      say('Checked in at site');
    } catch (e) {
      setErr(e instanceof GeolocationPositionError
        ? (e.code === 1 ? 'Location permission is off — turn it on for this site'
          : 'Could not get a location fix. Step outside and try again')
        : e instanceof Error ? e.message : 'Could not check in');
    }
    setBusy(false);
  }

  /** Close this job's running trip, if it is still going. */
  async function endTrip() {
    try {
      const t = await api.get<{ id: string; jobId: string; status: string } | null>('/trips/active');
      if (t && t.jobId === j.id && t.status === 'active') {
        await api.post('/trips/' + t.id + '/end', {});
        window.dispatchEvent(new Event('trip:changed'));
      }
    } catch { /* the office can close a stray trip; this is not worth an error */ }
  }

  const addUniform = (f: File) =>
    shrinkImage(f, 720).then((dataUrl) => act(() => api.post(path + '/exec/uniform', { dataUrl }), 'Uniform photo saved'));

  const addPhoto = (kind: 'before' | 'after', f: File) =>
    shrinkImage(f, 520).then((dataUrl) => act(() => api.post(path + '/exec/photos', { kind, dataUrl })));

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

  async function saveSignature() {
    if (!sigRef.current?.isInked()) { setErr('Ask the customer to sign in the box'); return; }
    const ok = await act(() => api.post(path + '/exec/signature', {
      signedBy: signName.trim(),
      signatureImage: sigRef.current!.data(),
      rating: rating || 5,
      observations: x.observations || '',
    }), 'Signature saved');
    if (ok) setSigOpen(false);
  }

  function askFinish() {
    setAsk({
      title: 'Finish the service and send the report?',
      body: 'The report goes to ' + (cl?.contact || 'the customer')
        + ' and the visit is billed. You cannot reopen it from here.',
      confirmLabel: 'Yes, finish and send',
      cancelLabel: 'Not yet',
      danger: true,
      onConfirm: () => {
        void act(async () => {
          await api.post(path + '/exec/finish', { observations: x.observations || '' });
          await endTrip();   // nothing about this service is still running
        });
      },
    });
  }

  /* --------------------------------------------------------- the eleven */

  const steps: Step[] = [
    {
      key: 'travel',
      title: 'On my way',
      hint: hasTravel ? 'Travel started' : undefined,
      done: hasTravel,
      waiting: 'Start the trip first',
      body: hasTravel ? (
        <div className="flex flex-col gap-2.5">
          <Ok>On the way — {cl?.contact || 'the customer'} has been told.</Ok>
          <button type="button" onClick={() => setMapOpen(true)}
            className="h-12 rounded-xl bg-accent text-white text-[15px] font-bold
              active:brightness-90 flex items-center justify-center gap-2">
            <Icon name="road" size={18} /> Open the map
          </button>
        </div>
      ) : (
        <button type="button" onClick={goNavigate} disabled={busy}
          className="w-full h-12 rounded-xl bg-accent text-white text-[15px] font-bold
            active:brightness-90 disabled:opacity-60 flex items-center justify-center gap-2">
          <Icon name="road" size={18} /> Navigate to site
        </button>
      ),
      onNext: hasTravel && !siteKnown ? () => setAsk({
        title: 'Mark this location?',
        body: 'Stand at the door and mark it once. Every next visit here navigates straight to it.',
        confirmLabel: 'Mark this location',
        cancelLabel: 'Later',
        onConfirm: () => { void markSite().then((ok) => { if (ok) setAt((v) => v + 1); }); },
      }) : undefined,
    },
    {
      key: 'uniform',
      title: 'Photo of you in uniform',
      hint: myUniform ? 'Taken' : undefined,
      done: !!myUniform,
      waiting: 'Take the photo first',
      body: myUniform ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setZoom(myUniform)}
            className="w-20 h-20 rounded-xl border border-line overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={myUniform} alt="In uniform" className="w-full h-full object-cover" />
          </button>
          <label className="h-11 px-4 rounded-xl border border-line text-[14px] font-semibold
            active:bg-wash flex items-center">
            Retake
            <input type="file" accept="image/*" capture="user" hidden disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addUniform(f); }} />
          </label>
        </div>
      ) : (
        <>
          <label className="w-full h-12 rounded-xl bg-accent text-white text-[15px] font-bold
            active:brightness-90 flex items-center justify-center gap-2">
            <Icon name="plus" size={18} /> Open the camera
            <input type="file" accept="image/*" capture="user" hidden disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addUniform(f); }} />
          </label>
        </>
      ),
    },
    {
      key: 'checkin',
      title: 'Mark location & check in',
      hint: hasCheckin ? 'Checked in at ' + fmtTime(x.checkinAt) : undefined,
      done: hasCheckin,
      waiting: 'Check in first',
      body: hasCheckin ? (
        <div className="flex flex-col gap-2">
          <Ok>Marked · {cl?.siteLat?.toFixed(4)}° N, {cl?.siteLng?.toFixed(4)}° E</Ok>
          <Ok>Checked in at {fmtTime(x.checkinAt)}</Ok>
        </div>
      ) : (
        <>
          <button type="button" onClick={markAndCheckin} disabled={busy}
            className="w-full h-12 rounded-xl bg-accent text-white text-[15px] font-bold
              active:brightness-90 disabled:opacity-60 flex items-center justify-center gap-2">
            <Icon name="branch" size={17} />
            {busy ? 'Getting a fix…' : siteKnown ? 'Check in at this site' : 'Mark location & check in'}
          </button>
        </>
      ),
    },
    {
      key: 'before',
      title: 'Before-treatment photos',
      hint: x.photosBefore.length ? x.photosBefore.length + ' added' : undefined,
      done: hasBefore,
      waiting: 'Add at least one photo',
      body: (
        <PhotoBlock list={x.photosBefore} kind="before" busy={busy} gallery
          onAdd={(f) => addPhoto('before', f)} onZoom={setZoom}
          onRemove={(i) => act(() => api.del(path + '/exec/photos?kind=before&index=' + i))} />
      ),
    },
    {
      key: 'work',
      title: 'Start the work',
      hint: hasStart ? 'Clock running since ' + fmtTime(x.startedAt) : undefined,
      done: hasStart && workDone,
      waiting: hasStart ? 'Tap Work complete when you finish' : 'Start the work first',
      body: hasStart ? (
        <div className="rounded-xl bg-wash px-4 py-4 text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Time on site</p>
          <LiveTimer startedAt={x.startedAt!} />
        </div>
      ) : (
        <button type="button" disabled={busy}
          onClick={() => act(() => api.post(path + '/exec/start', {}), 'Work started — the clock is running')}
          className="w-full h-12 rounded-xl bg-accent text-white text-[15px] font-bold
            active:brightness-90 disabled:opacity-60">
          Start work
        </button>
      ),
      onNext: hasStart && !workDone ? () => setAsk({
        title: 'Have you finished the work on site?',
        body: 'The clock keeps running until you send the report.',
        confirmLabel: 'Yes, work complete',
        cancelLabel: 'Still working',
        onConfirm: () => { setWorkDone(true); setAt((v) => v + 1); },
      }) : undefined,
    },
    {
      key: 'chem',
      title: 'Chemicals used',
      hint: x.chemicals.length ? x.chemicals.length + ' recorded' : undefined,
      done: x.chemicals.length > 0,
      body: (
        <ChemBlock j={j} busy={busy}
          onAdd={(itemId, qty) => act(() => api.post(path + '/exec/chemicals', { itemId, qty }))}
          onRemove={(i) => act(() => api.del(path + '/exec/chemicals/' + i))}
          onErr={setErr} />
      ),
    },
    {
      key: 'areas',
      title: 'What you did, area by area',
      hint: areas.length ? areas.length + ' area(s)' : undefined,
      done: areas.length > 0,
      /* Required. This is the only record of what was actually done in the
         property — the report the customer reads is built from these lines,
         and an empty one is a service nobody can account for later. */
      waiting: 'Write what you did in at least one area',
      body: <AreaFindingsBlock rows={areas} busy={busy} onChange={saveAreas} />,
    },
    {
      key: 'after',
      title: 'After-treatment photos',
      hint: x.photosAfter.length ? x.photosAfter.length + ' added' : undefined,
      done: hasAfter,
      waiting: 'Add at least one photo',
      body: (
        <PhotoBlock list={x.photosAfter} kind="after" busy={busy} gallery
          onAdd={(f) => addPhoto('after', f)} onZoom={setZoom}
          onRemove={(i) => act(() => api.del(path + '/exec/photos?kind=after&index=' + i))} />
      ),
    },
    {
      key: 'notes',
      title: 'Your notes',
      hint: notes.trim() ? 'Noted' : undefined,
      done: !!notes.trim(),
      body: (
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
          disabled={busy} placeholder="Access, the customer's requests, what to watch next visit…"
          className="w-full min-h-[110px] px-3.5 py-3 rounded-xl border border-line text-[15px]
            outline-none focus:border-accent" />
      ),
    },
    {
      key: 'sign',
      title: 'Customer signature',
      hint: x.signature ? 'Recorded' : undefined,
      done: !!x.signature,
      waiting: 'Get the customer to sign',
      body: x.signature ? (
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-mint text-mint-ink flex items-center justify-center shrink-0">
            <Icon name="check" size={19} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-semibold truncate">Signed by {x.signedBy}</span>
            {x.rating > 0 && <Stars n={x.rating} />}
          </span>
          <button type="button" disabled={busy}
            onClick={() => act(() => api.del(path + '/exec/signature'))}
            className="h-10 px-3.5 rounded-xl border border-line text-[13.5px] font-semibold active:bg-wash">
            Redo
          </button>
        </div>
      ) : (
        <div>
          <input value={signName} onChange={(e) => setSignName(e.target.value)}
            placeholder="Who is signing?"
            className="w-full h-12 px-3.5 rounded-xl border border-line text-[15px]
              outline-none focus:border-accent" />
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[13px] text-muted">Rating</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={n + ' stars'}
                className={'text-[24px] leading-none ' + (n <= rating ? 'text-accent' : 'text-muted-2')}>
                ★
              </button>
            ))}
          </div>
          <button type="button" disabled={busy}
            onClick={() => {
              if (!signName.trim()) { setErr('Enter the name of the person signing'); return; }
              setErr(''); setSigOpen(true);
            }}
            className="mt-4 w-full h-12 rounded-xl bg-accent text-white text-[15px] font-bold
              active:brightness-90 disabled:opacity-60">
            Open the signature pad
          </button>
        </div>
      ),
    },
    {
      key: 'finish',
      title: 'Finish & send report',
      hint: undefined,
      done: false,
      body: (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={askFinish} disabled={busy}
            className="h-13 min-h-[52px] rounded-xl bg-accent text-white text-[15.5px] font-bold
              active:brightness-90 disabled:opacity-60">
            Finish service &amp; send report
          </button>
        </div>
      ),
    },
  ];

  const mine = isHead ? steps : steps.slice(0, 3);
  const total = mine.length;

  /* Land on the first thing not done — resuming a service should not mean
     tapping Next past the seven steps already behind you. */
  const firstOpen = useMemo(() => {
    const k = mine.findIndex((s) => !s.done);
    return k < 0 ? total - 1 : k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.status, x.checkinAt, x.startedAt, x.signature, x.photosBefore.length, x.photosAfter.length, myUniform, workDone]);

  useEffect(() => { setAt((v) => (v < 0 ? firstOpen : v)); }, [firstOpen]);

  const i = Math.min(Math.max(at < 0 ? firstOpen : at, 0), total - 1);
  const step = mine[i];
  const doneCount = mine.filter((s) => s.done).length;
  /* How far through the service you are — the steps behind you, not only the
     ones that recorded something. Chemicals and notes can honestly be empty
     on a visit, and a bar that refuses to fill because a technician had
     nothing to write is a bar that lies about where he is. */
  const pct = Math.round((Math.max(i, doneCount) / Math.max(1, total - 1)) * 100);
  /* Red at the start, green at the end — the bar answers "how far in am I"
     before any number does. */
  const barColor = 'hsl(' + Math.round((pct / 100) * 132) + ' 82% ' + (pct > 55 ? 36 : 47) + '%)';

  function next() {
    if (step.onNext) { step.onNext(); return; }
    if (!step.done && step.waiting) { setErr(step.waiting); return; }
    setErr('');
    setAt(Math.min(i + 1, total - 1));
  }

  return (
    <div className="lg:hidden min-h-full bg-ground pb-[calc(env(safe-area-inset-bottom)+110px)]">
      <BackBar title="Today's work" sub={j.id} fallback="/jobs" />

      {/* Who, what, when, where — checked before you knock, so it stays first. */}
      <div className="mx-4 mt-4 card p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="h-6 px-2.5 rounded-full bg-wash text-[11.5px] font-bold text-ink-2 flex items-center">
              {j.type}
            </span>
            <span className="h-6 px-2.5 rounded-full bg-navy text-white text-[11.5px] font-bold flex items-center">
              {STATUS[j.status]?.label || j.status}
            </span>
          </span>
          <span className="text-[12px] text-muted-2 font-mono shrink-0">{j.id}</span>
        </div>
        {/* Four lines, not seven bars.
            Every fact here used to get a full-width row of its own — the money
            in one, the call in another, the site note in a third — and the card
            pushed the step you are actually on off the bottom of the screen.
            The name takes the call button beside it, the facts share a line,
            and what is worth collecting is a chip, not a banner. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[18px] font-bold tracking-[-0.01em] truncate">{cl?.name || '—'}</p>
            <p className="text-[13px] text-muted mt-0.5 truncate">
              {j.title}{j.visitNo ? ' · ' + j.visitNo + ' of ' + j.ofVisits : ''}
            </p>
          </div>
          {cl?.phone && (
            <a href={'tel:' + cl.phone} aria-label={'Call ' + firstName(cl.contact)}
              className="w-11 h-11 rounded-full bg-rose text-accent flex items-center
                justify-center shrink-0 active:brightness-95">
              <Icon name="phone" size={18} />
            </a>
          )}
        </div>
        <p className="text-[13px] text-ink-2 mt-2">
          {fmtTime(j.slot)} · {durationText(j.mins)} · {relDay(j.date)}
          {(cl?.addr || cl?.city) ? ' · ' + [cl?.addr, cl?.city].filter(Boolean).join(', ') : ''}
        </p>
        {(bill && bill.amount > 0) || j.notes ? (
          <div className="flex flex-wrap gap-2 mt-2.5">
            {bill && bill.amount > 0 && (
              <span className="h-7 px-3 rounded-full bg-wash text-[12.5px] font-bold flex items-center">
                Collect {money(bill.amount)}
              </span>
            )}
            {j.notes && (
              <button type="button" onClick={() => setNoteOpen((v) => !v)}
                className="h-7 px-3 rounded-full bg-rose text-rose-ink text-[12.5px] font-bold
                  flex items-center gap-1.5 max-w-full">
                <Icon name="alert" size={13} className="shrink-0" />
                <span className="truncate">{noteOpen ? 'Site instructions' : j.notes}</span>
              </button>
            )}
          </div>
        ) : null}
        {j.notes && noteOpen && (
          <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{j.notes}</p>
        )}
      </div>

      {/* How far in, as a colour. */}
      <div className="mx-4 mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
            Step {i + 1} of {total}
          </p>
          <p className="text-[12px] font-bold" style={{ color: barColor }}>{pct}% done</p>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-line-soft overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: Math.max(4, pct) + '%', background: barColor }} />
        </div>
      </div>

      {!isHead && (
        <div className="mx-4 mt-4 rounded-xl bg-wash px-4 py-3">
          <p className="text-[13.5px] font-semibold">
            {j.techs.find((t) => t.id === j.headTechId)?.name || 'The head'} is leading this service
          </p>
          <p className="text-[12.5px] text-muted mt-0.5">
            They record the work. Your part is the three steps here.
          </p>
        </div>
      )}

      {/* One step, filling the frame. */}
      <div className="mx-4 mt-4 card p-4">
        <div className="flex items-center gap-3">
          <span className={'w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0 '
            + (step.done ? 'bg-mint text-mint-ink' : 'bg-accent text-white')}>
            {step.done ? <Icon name="check" size={17} /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span data-run="step" className="block text-[16px] font-bold leading-tight">{step.title}</span>
            {step.hint && <span className="block text-[12.5px] text-muted mt-0.5">{step.hint}</span>}
          </span>
        </div>
        <div className="mt-4">{step.body}</div>
      </div>

      {err && (
        /* Not the same pink as the site instructions above it: something that
           went wrong and something to read before you knock must not look
           like the same kind of thing. */
        <p className="mx-4 mt-3 rounded-xl bg-white border border-accent px-3.5 py-2.5
          flex items-start gap-2 text-[13px] font-semibold text-accent">
          <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
          <span className="min-w-0">{err}</span>
        </p>
      )}
      {said && (
        <p className="mx-4 mt-3 rounded-xl bg-mint px-3.5 py-2.5 text-[13px] font-semibold text-mint-ink">
          {said}
        </p>
      )}

      <div className="mx-4 mt-4 flex gap-3">
        <button type="button" data-run="back" onClick={() => { setErr(''); setAt(Math.max(0, i - 1)); }}
          disabled={i === 0}
          className="h-12 px-5 rounded-xl border border-line text-[14.5px] font-semibold
            active:bg-wash disabled:opacity-40">
          Back
        </button>
        {/* One word. The button used to wear the reason it was not ready yet
            — "Write what you did in at least one area" — which wrapped onto two
            lines, said the same thing as the message above it, and told a
            technician something he already knows. The reason appears when he
            taps it, and only until he acts on it. */}
        {i < total - 1 && (
          <button type="button" data-run="next" onClick={next} disabled={busy}
            className={'flex-1 h-12 rounded-xl text-[15px] font-bold active:brightness-90 '
              + (step.done || step.onNext ? 'bg-navy text-white' : 'bg-wash-2 text-muted')}>
            {step.key === 'work' && !step.done && step.onNext ? 'Work complete' : 'Next'}
          </button>
        )}
      </div>

      {mapOpen && (
        <NavigateSheet destText={destText} title={cl?.name || 'the site'}
          onClose={() => setMapOpen(false)} />
      )}

      {sigOpen && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-[15px] font-bold">Customer signature</p>
              <p className="text-[12.5px] text-muted truncate">
                {signName.trim()} — please sign in the box
              </p>
            </div>
            <button type="button" onClick={() => setSigOpen(false)}
              className="h-10 px-4 rounded-xl border border-line text-[13.5px] font-semibold shrink-0">
              Cancel
            </button>
          </div>
          <div className="flex-1 p-4 flex flex-col justify-center overflow-hidden">
            <p className="text-[13px] text-muted text-center mb-2">Sign inside the box</p>
            <SigPad apiRef={sigRef} big />
          </div>
          {err && <p className="px-4 pb-1 text-[13px] font-semibold text-accent shrink-0">{err}</p>}
          <div className="px-4 py-3 border-t border-line grid grid-cols-2 gap-3 shrink-0
            pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => sigRef.current?.clear()}
              className="h-12 rounded-xl border border-line text-[15px] font-semibold">
              Clear
            </button>
            <button type="button" onClick={saveSignature} disabled={busy}
              className="h-12 rounded-xl bg-accent text-white text-[15px] font-bold disabled:opacity-60">
              {busy ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      )}

      <Confirm spec={ask} onClose={() => setAsk(null)} />
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** A line that is already true — green tick, plain words. */
function Ok({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-[13.5px] text-ink-2">
      <Icon name="check" size={16} className="text-mint-ink shrink-0 mt-0.5" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
