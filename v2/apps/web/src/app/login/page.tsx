'use client';

/* ============================================================================
   Sign in — the v2 version of v1's index.html.

   Same anatomy: brand panel left, entry right. And the same one-click demo
   experience — "choose a role to explore" — each card signs straight in as
   that person, because every seeded account shares the demo password. The
   classic email/password form sits below for real use.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, setToken, type SessionUser } from '@/lib/api';
import { homeFor } from 'shared';

const DEMO_PASSWORD = 'pestops123';

const ROLES = [
  { email: 'rajesh@shieldpest.in', name: 'Rajesh Kumar', role: 'Administrator', who: 'Founder & Director', blurb: 'Everything — pipeline, contracts, dispatch, money', color: '#FF0000' },
  { email: 'priya@shieldpest.in', name: 'Priya Sharma', role: 'Operations', who: 'Operations Manager', blurb: 'Contracts, the dispatch board, the day-to-day', color: '#1B2E65' },
  { email: 'arun@shieldpest.in', name: 'Arun Prakash', role: 'Sales', who: 'Sales Executive', blurb: 'Leads, quotations, follow-ups', color: '#1B2E65' },
  { email: 'karthik@shieldpest.in', name: 'Karthik R', role: 'Senior Technician', who: 'Senior Technician', blurb: "Today's services, execution, customer signatures", color: '#1B2E65' },
  { email: 'suresh@shieldpest.in', name: 'Suresh M', role: 'Technician', who: 'Technician', blurb: 'The field view — services, trips, wallet', color: '#0B7454' },
  { email: 'deepa@shieldpest.in', name: 'Deepa Nair', role: 'Accounts', who: 'Accounts & Billing', blurb: 'Invoices, payments, outstanding', color: '#1B2E65' },
];

const FEATURES = [
  'Lead pipeline with follow-ups',
  'Quotations with GST + customer approval links',
  'AMC contracts that generate every visit',
  'Drag-and-drop technician dispatch',
  'Field execution with photo proof + signatures',
  'Invoices, payments and outstanding',
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  async function signIn(mail: string, pass: string) {
    setErr(''); setBusy(mail);
    try {
      const r = await api.post<{ token: string; user: SessionUser }>('/auth/login', { email: mail, password: pass });
      setToken(r.token);
      // A technician has no business on the office dashboard — send him to his day.
      router.replace(homeFor(r.user?.role));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not sign in');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ------------------------------------------------ brand panel */}
      <div className="hidden lg:flex w-[42%] bg-navy text-white flex-col p-12 overflow-y-auto">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded bg-accent flex items-center justify-center font-bold text-lg">P</span>
          <span>
            <span className="block text-[17px] font-bold leading-tight">PestOps</span>
            <span className="block text-[10px] tracking-[0.1em] uppercase text-white/50 font-semibold">Operations Platform</span>
          </span>
        </div>

        <div className="mt-12">
          <h1 className="text-[26px] font-semibold leading-snug max-w-md">
            Run your whole pest-control business from one screen.
          </h1>
          <p className="mt-4 text-white/60 text-[13.5px] leading-relaxed max-w-sm">
            Lead to quotation, quotation to AMC contract, contract to scheduled visits,
            visits to photo-proof reports and invoices — no more WhatsApp threads and
            manual books.
          </p>

          <ul className="mt-8 space-y-2.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/75">
                <span className="mt-[3px] w-3.5 h-3.5 rounded-sm bg-accent/90 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex gap-8">
            {[['6', 'User roles'], ['14', 'Modules'], ['100%', 'Feature parity']].map(([v, k]) => (
              <div key={k}>
                <div className="text-[22px] font-bold">{v}</div>
                <div className="text-[10.5px] uppercase tracking-wide text-white/45 font-semibold">{k}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-auto pt-10 text-white/35 text-[12px]">© {new Date().getFullYear()} PestOps</p>
      </div>

      {/* ------------------------------------------------ entry */}
      <div className="flex-1 flex items-start justify-center overflow-y-auto p-5 lg:p-8">
        <div className="w-full max-w-[430px] py-4">
          <span className="zpill red">Interactive demo — one click, no typing</span>
          <h2 className="mt-4 text-[22px] font-semibold">Choose a role to explore</h2>
          <p className="text-muted text-[13px] mt-1 leading-relaxed">
            Each role opens the exact screens that person uses day to day. Everything is
            live — raise a quotation, generate an AMC, dispatch a visit, complete it as
            the technician, then bill it.
          </p>

          <div className="mt-5 space-y-2.5">
            {ROLES.map((r) => (
              <button key={r.email} onClick={() => signIn(r.email, DEMO_PASSWORD)} disabled={!!busy}
                className="w-full flex items-center gap-3.5 rounded-md border border-line bg-white p-3.5 text-left hover:border-navy/50 hover:shadow-card transition-all disabled:opacity-60 group">
                <span className="w-10 h-10 rounded-full text-white text-[12px] font-bold flex items-center justify-center shrink-0"
                  style={{ background: r.color }}>
                  {r.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold text-[13.5px]">{r.role}</span>
                    <span className="text-muted-2 text-[11.5px]">{r.name} · {r.who}</span>
                  </span>
                  <span className="block text-muted text-[12px] mt-0.5 truncate">{r.blurb}</span>
                </span>
                <span className="text-muted-2 group-hover:text-accent transition-colors">
                  {busy === r.email
                    ? <span className="text-[11px] font-semibold">Signing in…</span>
                    : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>}
                </span>
              </button>
            ))}
          </div>

          {err && <p className="mt-3 text-accent text-[13px]">{err}</p>}

          {/* ------------------------------------ the classic form */}
          <div className="mt-7 pt-6 border-t border-line-soft">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-2 mb-3">
              Or sign in with credentials
            </p>
            {/* Three fields on one line needs 420px. A phone has 390px minus
                padding, so the row wraps rather than pushing Go off the edge. */}
            <form onSubmit={(e) => { e.preventDefault(); signIn(email, password); }}
              className="flex flex-wrap gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                placeholder="Email"
                className="max-lg:w-full lg:flex-1 h-11 lg:h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
                placeholder="Password"
                className="flex-1 lg:flex-none lg:w-[130px] h-11 lg:h-9 px-3 rounded border border-line text-[13px] outline-none focus:border-navy" />
              <button disabled={!!busy}
                className="h-11 lg:h-9 px-5 rounded bg-accent text-white font-semibold text-[13px] hover:brightness-90 disabled:opacity-60">
                Go
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
