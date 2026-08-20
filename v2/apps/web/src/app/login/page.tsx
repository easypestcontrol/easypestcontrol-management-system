'use client';

/* ============================================================================
   Sign in.

   One card in the middle of the page: the mark, two fields, a button. There
   is nothing else here on purpose — a person reaching this screen already
   works here and is not being sold anything, and a sales panel beside a
   password box is just something else to read at seven in the morning.

   The logo carries the company name and its line, so neither is repeated as
   text underneath; a wordmark printed twice reads as a mistake.

   One way in: the email and password the administrator issued. The demo
   build shipped a shared password in this file so a visitor could look
   around as any of six people — which also put that password in front of
   anyone who opened the page source.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, setToken, type SessionUser } from '@/lib/api';
import { homeFor } from 'shared';

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
    <div className="min-h-screen bg-wash flex items-center justify-center p-5">
      <div className="w-full max-w-[400px]">
        <div className="rounded-2xl bg-white border border-line shadow-card px-7 py-8 sm:px-9 sm:py-10">
          {/* The mark is the heading. Width, not height, keeps a wide
              wordmark from swelling on a narrow screen. */}
          <img
            src="/logo.png"
            alt="Easy Pest — Next Level Pest Control Expert"
            className="w-[190px] max-w-full mx-auto"
          />

          <h1 className="mt-8 text-[19px] font-semibold text-center">Sign in</h1>
          <p className="text-muted text-[13px] mt-1.5 text-center leading-relaxed">
            Use the email and password your administrator issued you.
          </p>

          <form onSubmit={signIn} className="mt-7 space-y-4">
            <label className="block">
              <span className="block text-[12.5px] font-medium mb-1.5">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                type="email" required autoComplete="username" autoFocus
                className="w-full h-11 px-3 rounded-lg border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>

            <label className="block">
              <span className="block text-[12.5px] font-medium mb-1.5">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                type="password" required autoComplete="current-password"
                className="w-full h-11 px-3 rounded-lg border border-line text-[13.5px] outline-none focus:border-navy" />
            </label>

            {err && (
              <p role="alert" className="text-accent text-[12.5px] leading-relaxed">{err}</p>
            )}

            <button disabled={busy}
              className="w-full h-11 rounded-lg bg-accent text-white font-semibold text-[13.5px] hover:brightness-90 disabled:opacity-60">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-muted-2 text-[12px] leading-relaxed text-center">
            Lost your password? Ask your administrator to set a new one — for
            security, nobody here can read the one you had.
          </p>
        </div>

        <p className="mt-5 text-center text-muted-2 text-[11.5px]">
          © {new Date().getFullYear()} Easy Pest Control
        </p>
      </div>
    </div>
  );
}
