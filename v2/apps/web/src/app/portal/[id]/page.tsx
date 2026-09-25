'use client';

/* ============================================================================
   The customer portal — what a customer sees when they open their link.

   Reached from a QR on a card or a WhatsApp message, almost always on a
   phone, by somebody who is not signed in to anything and never will be. So
   it is one narrow column, big type, and two steps: say who you are, then
   see what you have with us — contracts, the services we have done and are
   coming to do, and invoices with what is still owed.

   Sign-in is the mobile number on the record, for now. The link itself is
   the real key (it is signed and cannot be guessed); the number confirms the
   person holding it is the one it was sent to. When the WhatsApp automation
   lands, a one-time code goes between the number and the door — the API's
   login already accepts a `channel` for it, and the form below has the
   place for the choice marked.

   The session lives under its own key, never the staff token's: a customer
   opening their portal on the office laptop must not become the office.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { money } from 'shared';

interface Meta { name: string; phoneHint: string }
interface Home {
  name: string; contact: string; phone: string;
  contracts: Array<{ id: string; mode: string; start: string; end: string; value: number; services: number }>;
  jobs: Array<{ id: string; date: string; slot: string; type: string; status: string }>;
  invoices: Array<{ id: string; date: string; due: string; status: string; total: number; paid: number; balance: number }>;
}

const fmtD = (iso: string) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso || '—';
};

/* State, in the customer's words and the app's colours. */
const JOB: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Booked', cls: 'bg-sky text-sky-ink' },
  enroute: { label: 'On the way', cls: 'bg-violet text-violet-ink' },
  inprogress: { label: 'In progress', cls: 'bg-amber text-amber-ink' },
  completed: { label: 'Done', cls: 'bg-mint text-mint-ink' },
};
const INV: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Due', cls: 'bg-sky text-sky-ink' },
  partial: { label: 'Part paid', cls: 'bg-amber text-amber-ink' },
  paid: { label: 'Paid', cls: 'bg-mint text-mint-ink' },
  overdue: { label: 'Overdue', cls: 'bg-rose text-rose-ink' },
};

function Pill({ map, k }: { map: Record<string, { label: string; cls: string }>; k: string }) {
  const s = map[k] || { label: k, cls: 'bg-wash-2 text-ink-2' };
  return (
    <span className={'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold ' + s.cls}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />{s.label}
    </span>
  );
}

export default function Portal() {
  const { id } = useParams<{ id: string }>();
  const key = 'pestops.portal.' + id;

  const [k, setK] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dead, setDead] = useState(false);

  /* `k` comes off the URL by hand rather than useSearchParams, which would
     want a Suspense boundary around a page that has nothing else to wait
     for. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('k') || '';
    setK(q);
    let session = '';
    try { session = localStorage.getItem(key) || ''; } catch { /* private mode */ }
    if (session) {
      fetch('/api/portal/' + id + '/home?s=' + encodeURIComponent(session))
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(setHome)
        .catch(() => { try { localStorage.removeItem(key); } catch { /* */ } loadMeta(q); });
    } else {
      loadMeta(q);
    }
    function loadMeta(kk: string) {
      fetch('/api/portal/' + id + '/meta?k=' + encodeURIComponent(kk))
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(setMeta)
        .catch(() => setDead(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function signIn() {
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/portal/' + id + '/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `channel` is where "send me the code on WhatsApp / SMS" will go.
        body: JSON.stringify({ k, phone }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || 'Could not sign in');
      try { localStorage.setItem(key, j.session); } catch { /* still works this visit */ }
      const h = await fetch('/api/portal/' + id + '/home?s=' + encodeURIComponent(j.session));
      if (!h.ok) throw new Error('Could not load your portal');
      setHome(await h.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign in');
    } finally { setBusy(false); }
  }

  function signOut() {
    try { localStorage.removeItem(key); } catch { /* */ }
    setHome(null);
  }

  /* ------------------------------------------------------------- frames */

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-dvh bg-ground text-ink">
      <div className="max-w-[520px] mx-auto px-4 py-6">{children}</div>
    </div>
  );

  if (dead) {
    return (
      <Frame>
        <div className="card p-6 text-center mt-10">
          <p className="text-[18px] font-bold">This link isn’t valid</p>
          <p className="text-muted text-[14px] mt-2 leading-relaxed">
            It may have been typed out by hand or belong to a different customer. Ask us for a fresh one.
          </p>
        </div>
      </Frame>
    );
  }

  /* ------------------------------------------------------------- sign in */

  if (!home) {
    return (
      <Frame>
        <div className="mt-8 mb-6 text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-2">Customer portal</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {meta ? 'Welcome, ' + meta.name : 'Loading…'}
          </h1>
          <p className="text-muted text-[14px] mt-2 leading-relaxed">
            Sign in with the mobile number we have for you
            {meta?.phoneHint ? <> — it ends in <b className="text-ink">{meta.phoneHint.slice(-4)}</b></> : ''}.
          </p>
        </div>

        <form className="card p-5" onSubmit={(e) => { e.preventDefault(); if (!busy) signIn(); }}>
          <label className="block">
            <span className="block text-sm font-medium text-ink-2 mb-1.5">Mobile number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              type="tel" inputMode="numeric" autoComplete="tel" autoFocus
              placeholder="10-digit mobile"
              className="w-full h-12 px-4 rounded-[12px] border border-line bg-wash text-[16px]
                outline-none focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors" />
          </label>

          {/* When the WhatsApp automation is in, the choice of where the code
              goes sits here — two chips, WhatsApp / SMS — and the button below
              becomes "Send code". */}

          {err && <p className="mt-3 text-[13.5px] text-accent font-medium">{err}</p>}

          <button type="submit" disabled={busy || !meta}
            className="mt-4 w-full h-12 rounded-[12px] bg-accent text-white text-[15px] font-semibold
              shadow-lg shadow-accent/20 hover:brightness-90 disabled:opacity-50 transition-all">
            {busy ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-[12px] text-muted-2 mt-6">
          Only the number on your record can open this. If yours has changed, tell us and we’ll update it.
        </p>
      </Frame>
    );
  }

  /* ---------------------------------------------------------------- home */

  const owed = home.invoices.reduce((a, i) => a + i.balance, 0);
  const upcoming = home.jobs.filter((j) => j.status !== 'completed');
  const done = home.jobs.filter((j) => j.status === 'completed');

  return (
    <Frame>
      <div className="flex items-start justify-between gap-3 mt-2 mb-5">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-2">Customer portal</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1 truncate">{home.name}</h1>
          {home.contact && <p className="text-muted text-[13.5px] mt-0.5">{home.contact}</p>}
        </div>
        <button onClick={signOut}
          className="shrink-0 h-9 px-3.5 rounded-[12px] border border-line text-[13px] font-medium hover:bg-wash">
          Sign out
        </button>
      </div>

      {/* The one number that matters, first. */}
      <div className="card p-5 mb-4">
        <p className="text-[12px] font-medium text-muted">Outstanding</p>
        <p className={'text-2xl font-bold tracking-tight mt-1 tabular-nums ' + (owed > 0 ? 'text-accent' : 'text-ink')}>
          {money(owed)}
        </p>
        <p className="text-[12.5px] text-muted-2 mt-1">
          {owed > 0 ? 'across ' + home.invoices.filter((i) => i.balance > 0).length + ' invoice(s) — tap one below to pay'
            : 'Nothing owed. Thank you.'}
        </p>
      </div>

      <Section title="Contracts" count={home.contracts.length} empty="No contracts yet.">
        {home.contracts.map((c) => (
          <div key={c.id} className="px-4 py-3.5 border-b border-line-soft last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-semibold">{c.mode || 'Contract'} <span className="text-muted-2 font-normal text-[12px]">{c.id}</span></span>
              <span className="text-[15px] font-bold tabular-nums">{money(c.value)}</span>
            </div>
            <p className="text-[13px] text-muted mt-0.5">
              {fmtD(c.start)} – {fmtD(c.end)} · {c.services} service{c.services === 1 ? '' : 's'}
            </p>
          </div>
        ))}
      </Section>

      <Section title="Coming up" count={upcoming.length} empty="Nothing booked ahead.">
        {upcoming.map((j) => (
          <div key={j.id} className="px-4 py-3.5 border-b border-line-soft last:border-b-0 flex items-center gap-3">
            <span className="w-11 h-11 rounded-[12px] bg-sky text-sky-ink flex flex-col items-center justify-center shrink-0 leading-none">
              <span className="text-[14px] font-bold">{fmtD(j.date).split('/')[0]}</span>
              <span className="text-[9.5px] font-semibold mt-0.5">{fmtD(j.date).split('/')[1]}/{fmtD(j.date).split('/')[2]?.slice(2)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold truncate">{j.type}</span>
              <span className="block text-[13px] text-muted">{j.slot} · {j.id}</span>
            </span>
            <Pill map={JOB} k={j.status} />
          </div>
        ))}
      </Section>

      <Section title="Invoices" count={home.invoices.length} empty="Nothing billed yet.">
        {home.invoices.map((i) => (
          <a key={i.id} href={'/invoice/' + i.id}
            className="px-4 py-3.5 border-b border-line-soft last:border-b-0 flex items-center gap-3 hover:bg-wash">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold">{i.id}</span>
                <span className={'text-[15px] font-bold tabular-nums ' + (i.balance > 0 ? 'text-accent' : '')}>
                  {i.balance > 0 ? money(i.balance) + ' due' : money(i.total)}
                </span>
              </span>
              <span className="flex items-center gap-2 mt-1">
                <Pill map={INV} k={i.status} />
                <span className="text-[12.5px] text-muted">{fmtD(i.date)} · due {fmtD(i.due)}</span>
              </span>
            </span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
              className="text-muted-2 shrink-0"><path d="m9 6 6 6-6 6" /></svg>
          </a>
        ))}
      </Section>

      <Section title="Services done" count={done.length} empty="No completed services yet.">
        {done.slice(0, 10).map((j) => (
          <div key={j.id} className="px-4 py-3 border-b border-line-soft last:border-b-0 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium truncate">{j.type}</span>
              <span className="block text-[12.5px] text-muted">{fmtD(j.date)} · {j.id}</span>
            </span>
            <Pill map={JOB} k={j.status} />
          </div>
        ))}
      </Section>

      <p className="text-center text-[12px] text-muted-2 mt-6">Questions? Reply to the message this link came in.</p>
    </Frame>
  );
}

function Section({ title, count, empty, children }: {
  title: string; count: number; empty: string; children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden mb-4">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-line-soft">
        <h2 className="text-[13px] font-bold">{title}</h2>
        <span className="text-[12px] font-semibold text-muted-2 tabular-nums">{count}</span>
      </header>
      {count === 0 ? <p className="px-4 py-4 text-[14px] text-muted">{empty}</p> : children}
    </section>
  );
}
