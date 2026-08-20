'use client';

/* ============================================================================
   Sign in.

   There is one way in: the email and password the administrator issued. No
   role cards, no one-click anything. The demo build shipped a shared password
   in this file so a visitor could look around as any of six people — which
   also meant the password was readable by anyone who opened the page source.
   In production that is not a convenience, it is the front door left open.

   Who you are decides where you land and what you can see: homeFor() sends a
   technician to his day rather than the office dashboard, and the branch on
   the account scopes the data behind every screen. Both are decided from the
   signed token on the server, never from anything typed here.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, setToken, type SessionUser } from '@/lib/api';
import { homeFor } from 'shared';

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
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ token: string; user: SessionUser }>(
        '/auth/login', { email: email.trim(), password },
      );
      setToken(r.token);
      // A technician has no business on the office dashboard — send him to his day.
      router.replace(homeFor(r.user?.role));
    } catch (ex) {
      /* Never say which half was wrong: that turns the form into a way of
         finding out who has an account here. */
      setErr(ex instanceof Error && /network|failed to fetch/i.test(ex.message)
        ? 'Could not reach the server. Check your connection and try again.'
        : 'That email and password do not match.');
      setPassword('');
    } finally {
      setBusy(false);
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
        </div>

        <p className="mt-auto pt-10 text-white/35 text-[12px]">© {new Date().getFullYear()} PestOps</p>
      </div>

      {/* ------------------------------------------------ entry */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto p-5 lg:p-8">
        <div className="w-full max-w-[380px] py-4">
          {/* The brand panel is hidden on a phone, so the mark comes along. */}
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <span className="w-10 h-10 rounded bg-accent flex items-center justify-center font-bold text-lg text-white">P</span>
            <span>
              <span className="block text-[17px] font-bold leading-tight">PestOps</span>
              <span className="block text-[10px] tracking-[0.1em] uppercase text-muted-2 font-semibold">Operations Platform</span>
            </span>
          </div>

          <h2 className="text-[22px] font-semibold">Sign in</h2>
          <p className="text-muted text-[13px] mt-1.5 leading-relaxed">
            Use the email and password your administrator issued you.
          </p>

          <form onSubmit={signIn} className="mt-6 space-y-3.5">
            <label className="block">
              <span className="block text-[12.5px] font-medium mb-1.5">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                type="email" required autoComplete="username" autoFocus
                className="w-full h-11 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>

            <label className="block">
              <span className="block text-[12.5px] font-medium mb-1.5">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                type="password" required autoComplete="current-password"
                className="w-full h-11 px-3 rounded border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>

            {/* Reserve the line so the button does not jump when it appears. */}
            {err && (
              <p role="alert" className="text-accent text-[12.5px] leading-relaxed">{err}</p>
            )}

            <button disabled={busy}
              className="w-full h-11 rounded bg-accent text-white font-semibold text-[13.5px] hover:brightness-90 disabled:opacity-60">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-muted-2 text-[12px] leading-relaxed">
            Lost your password? Ask your administrator to set a new one — for
            security, nobody here can read the one you had.
          </p>
        </div>
      </div>
    </div>
  );
}
