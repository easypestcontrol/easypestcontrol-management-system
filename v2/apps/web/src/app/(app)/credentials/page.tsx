'use client';

/* ============================================================================
   Credentials — the services this business runs on.

   Two questions, and the page is arranged to answer them in that order:

     what am I about to be charged for?    renewals, soonest first
     what am I about to run out of?        quotas past 80%

   Everything else — which mailbox the account sits under, what the plan is,
   where the console is — hangs off those. The point is that when a renewal
   notice arrives you know which inbox it landed in and whether the plan is
   still the right size, without logging into four dashboards to find out.

   **Usage is read, never typed.** Each service holds a read-only key, and the
   figures are fetched from the provider — so what the page says is what the
   provider says. Editing a service is editing the account and the key; the
   numbers are not yours to set.

   The keys go in and never come back out: the API answers `hasKey`, not the
   key. Nothing secret is rendered here.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Modal, Field, inputCls, selectCls } from '../jobs/ui';

interface Quota {
  id: number; label: string; used: number; limit: number; unit: string;
  note: string; pct: number | null;
}

interface Credential {
  id: string; service: string; provider: string; account: string; plan: string;
  cost: number; cycle: string; renewsOn: string; autoRenew: boolean;
  console: string; note: string; active: boolean; checkedOn: string;
  syncError: string;
  /** Whether a key is on file — never the key itself. */
  hasKey: boolean; hasSecret: boolean; hasAccountRef: boolean; hasResourceRef: boolean;
  canSync: boolean;
  /** The traffic light: green = stable, orange = watch, red = warning. */
  health: 'green' | 'orange' | 'red';
  /** What still has to be filled in before a sync can work. */
  needs: string[];
  daysToRenewal: number | null;
  quotas: Quota[];
}

interface Payload {
  items: Credential[];
  summary: {
    services: number; monthlyRunRate: number; yearlyRunRate: number;
    dueSoon: Array<{ id: string; service: string; renewsOn: string; days: number; cost: number }>;
    tight: Array<{ id: string; service: string; label: string; pct: number; used: number; limit: number; unit: string }>;
    accounts: string[];
  };
}

interface Draft {
  service: string; provider: string; account: string; plan: string;
  cost: number; cycle: string; renewsOn: string; autoRenew: boolean;
  console: string; note: string; active: boolean;
  /* The key fields. Blank means "leave whatever is on file alone" — the form
     cannot show the existing key, so an empty box must not wipe it. */
  apiKey: string; apiSecret: string; accountRef: string; resourceRef: string;
}

const CYCLES = ['Monthly', 'Yearly', 'Pay as you go', 'Free'];

/* What each provider needs before its figures can be read, and where the
   numbers come from. Saying this on the form saves a round trip through a
   failed sync to find out. */
const PRESETS: Record<string, {
  provider: string;
  keyLabel?: string; keyHint?: string;
  secretLabel?: string;
  accountLabel?: string; accountHint?: string;
  source: string;
}> = {
  'Ola Maps': {
    provider: 'Ola Krutrim',
    source: 'Ola publishes no usage endpoint, so this app counts its own calls — every geocode and route it makes. The key itself lives in Settings → Integrations, where the map and navigation read it.',
  },
  'Cloudflare R2': {
    provider: 'Cloudflare',
    keyLabel: 'API token',
    keyHint: 'A token with Account Analytics : Read. Nothing else — it only needs to look.',
    accountLabel: 'Account id',
    accountHint: 'The 32-character id in your Cloudflare dashboard URL.',
    source: 'Measured with the same R2 keys that store the photographs, set on the server. Nothing to type here.',
  },
  VPS: {
    provider: '',
    source: 'Read off the machine itself — this app runs on it, so it reports its own disk, memory and network. No key needed.',
  },
  Razorpay: {
    provider: 'Razorpay',
    keyLabel: 'Key id',
    secretLabel: 'Key secret',
    source: 'This month’s captured payments, from Razorpay. There is no quota to run out of — it is charged per transaction.',
  },
  Domain: { provider: '', source: 'No usage to read. Track the renewal date and cost.' },
  Other: { provider: '', source: 'No usage reader for this one — track the renewal date and cost.' },
};

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const num = (n: number) => n.toLocaleString('en-IN');


function toDraft(c: Credential): Draft {
  return {
    service: c.service, provider: c.provider, account: c.account, plan: c.plan,
    cost: c.cost, cycle: c.cycle, renewsOn: c.renewsOn, autoRenew: c.autoRenew,
    console: c.console, note: c.note, active: c.active,
    // Left blank on purpose — the key cannot be shown, so it is only sent when
    // it is actually retyped.
    apiKey: '', apiSecret: '', accountRef: '', resourceRef: '',
  };
}

/** How urgent a renewal is. Overdue reads differently from "next month". */
function renewalTone(days: number | null) {
  if (days === null) return { text: 'no renewal date set', cls: 'text-muted-2' };
  if (days < 0) return { text: `${Math.abs(days)} days overdue`, cls: 'text-accent font-semibold' };
  if (days === 0) return { text: 'renews today', cls: 'text-accent font-semibold' };
  if (days <= 7) return { text: `renews in ${days} days`, cls: 'text-accent font-semibold' };
  if (days <= 30) return { text: `renews in ${days} days`, cls: 'text-ink-2' };
  return { text: `renews in ${days} days`, cls: 'text-muted' };
}

export default function Credentials() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState('');

  const load = useCallback(() => {
    api.get<Payload>('/credentials').then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load'));
  }, []);
  useEffect(load, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  function pickService(name: string) {
    const p = PRESETS[name];
    setDraft((d) => (d ? { ...d, service: name, provider: d.provider || p?.provider || '' } : d));
  }

  /** Pull the real figures now. */
  async function sync(id: string) {
    setSyncing(id); setErr('');
    try { await api.post('/credentials/' + id + '/sync', {}); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not read the usage'); }
    finally { setSyncing(''); load(); }
  }

  async function syncAll() {
    setSyncing('all'); setErr('');
    try { await api.post('/credentials/sync-all', {}); }
    catch { /* each row reports its own */ }
    finally { setSyncing(''); load(); }
  }

  async function save() {
    if (!draft) return;
    setErr(''); setBusy(true);
    try {
      // A blank key box means "leave what is on file" — the form can never
      // show the existing key, so an empty string must not wipe it.
      const body: Record<string, unknown> = { ...draft };
      for (const k of ['apiKey', 'apiSecret', 'accountRef', 'resourceRef']) {
        if (!String(body[k] || '').trim()) delete body[k];
      }
      if (editing) await api.patch('/credentials/' + editing, body);
      else await api.post('/credentials', body);
      setDraft(null); setEditing(''); load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally { setBusy(false); }
  }



  if (!data) {
    return <p className="p-6 text-muted text-[13px]">{err || 'Loading…'}</p>;
  }

  const s = data.summary;
  const current = editing ? data.items.find((x) => x.id === editing) : undefined;

  return (
    <div className="p-4 lg:p-6 max-w-[1000px] flex flex-col gap-4">
      <div>
        <h1 className="text-[19px] lg:text-[20px] font-semibold">Credentials</h1>
        <p className="text-muted text-[13px] mt-0.5">
          Every key the business runs on, stored encrypted — masked here, revealed
          only when you press the eye. Green is stable, orange is worth a look,
          red needs you.
        </p>
      </div>

      {/* --------------------------------------------- the operational keys */}
      <OperationalKeys />

      {/* ------------------------------------------------------- the money */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4">
        {[
          { label: 'Services', value: String(s.services), foot: 'live subscriptions' },
          { label: 'Every month', value: money(s.monthlyRunRate), foot: 'yearly plans spread out' },
          { label: 'Every year', value: money(s.yearlyRunRate), foot: 'at the current run rate' },
          {
            label: 'Accounts', value: String(s.accounts.length),
            foot: s.accounts.length ? s.accounts[0] : 'none recorded',
          },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-white p-4 shadow-card max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1.5 text-[20px] font-bold leading-none text-navy">{t.value}</p>
            <p className="mt-1.5 text-[11.5px] text-muted-2 truncate">{t.foot}</p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- what is due */}
      {(s.dueSoon.length > 0 || s.tight.length > 0) && (
        <section className="rounded-xl border border-accent/40 bg-red-wash overflow-hidden">
          <header className="px-4 pt-3 pb-1">
            <h2 className="text-[13.5px] font-bold text-accent">Needs you</h2>
          </header>
          <div className="px-4 pb-3 flex flex-col gap-1.5 text-[12.5px] text-ink-2">
            {s.dueSoon.map((d) => (
              <p key={'r' + d.id}>
                <b>{d.service}</b> renews {d.days < 0 ? `${Math.abs(d.days)} days ago`
                  : d.days === 0 ? 'today' : `in ${d.days} days`} — {money(d.cost)} on {d.renewsOn}
              </p>
            ))}
            {s.tight.map((t, i) => (
              <p key={'q' + i}>
                <b>{t.service}</b> is at <b>{t.pct}%</b> of its {t.label.toLowerCase()} —{' '}
                {num(t.used)} of {num(t.limit)} {t.unit}
              </p>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold">Every service</h2>
        {/* No "add". The four services are what this app runs on — the app
            knows them, and a list somebody curates by hand only drifts from
            what is actually being paid for. */}
        <button onClick={syncAll} disabled={!!syncing}
          className="h-10 lg:h-9 px-3.5 rounded border border-line text-[13px] font-semibold hover:bg-wash disabled:opacity-60">
          {syncing === 'all' ? 'Reading…' : 'Refresh all'}
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-10 text-center max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
          <p className="text-[15px] font-medium">Loading the services…</p>
          <p className="text-muted text-[13px] mt-1">
            VPS, Cloudflare R2, Ola Maps and Razorpay appear by themselves.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((c) => {
            const r = renewalTone(c.daysToRenewal);
            return (
              <section key={c.id}
                className={'rounded-xl border bg-white shadow-card overflow-hidden '
                  + (c.active ? 'border-line' : 'border-line-soft opacity-60')}>
                <header className="px-4 py-3 border-b border-line-soft flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <HealthDot health={c.health} />
                      <span className="text-[15px] font-bold text-navy">{c.service}</span>
                      {c.provider && <span className="zpill">{c.provider}</span>}
                      {!c.active && <span className="zpill">Not in use</span>}
                    </span>
                    <span className="block text-[12px] text-muted mt-0.5">
                      {[c.plan, c.account].filter(Boolean).join(' · ') || 'no account recorded'}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[15px] font-bold">
                      {c.cycle === 'Free' ? 'Free' : money(c.cost)}
                    </span>
                    <span className="block text-[11px] text-muted-2">
                      {c.cycle === 'Free' ? 'no charge' : c.cycle.toLowerCase()}
                    </span>
                  </span>
                </header>

                <div className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
                  <span className={r.cls}>
                    {c.renewsOn ? <>{r.text} · {c.renewsOn}</> : r.text}
                  </span>
                  {c.autoRenew && <span className="text-muted">auto-renews</span>}
                  {c.checkedOn
                    ? <span className="text-muted-2">figures read {c.checkedOn}</span>
                    : c.canSync && <span className="text-muted-2">never read</span>}
                  {c.hasKey && <RevealKey id={c.id} />}
                  {c.console && (
                    <a href={c.console} target="_blank" rel="noreferrer"
                      className="text-navy underline decoration-line hover:text-accent">
                      console ↗
                    </a>
                  )}
                </div>

                {/* A stale figure has to explain itself rather than quietly ageing. */}
                {c.syncError && (
                  <p className="mx-4 mb-3 rounded border border-red-line bg-red-wash px-3 py-2 text-[12px] text-accent">
                    {c.syncError}
                  </p>
                )}
                {c.canSync && c.needs.length > 0 && !c.syncError && (
                  <p className="mx-4 mb-3 rounded border border-line bg-wash px-3 py-2 text-[12px] text-muted">
                    Add the {c.needs.map((n) => n === 'apiKey' ? 'API key'
                      : n === 'apiSecret' ? 'key secret'
                      : n === 'accountRef' ? 'account id' : n).join(' and ')} to read this one.
                  </p>
                )}
                {c.quotas.length > 0 && (
                  <div className="px-4 pb-3 flex flex-col gap-2.5">
                    {c.quotas.map((q) => (
                      <div key={q.id}>
                        <div className="flex items-baseline justify-between text-[12px] mb-1">
                          <span className="font-medium">{q.label}</span>
                          <span className={q.pct !== null && q.pct >= 80 ? 'text-accent font-semibold' : 'text-muted'}>
                            {num(q.used)}
                            {q.limit > 0 ? <> of {num(q.limit)}</> : ' used'} {q.unit}
                            {q.pct !== null && <> · {q.pct}%</>}
                          </span>
                        </div>
                        {q.limit > 0 ? (
                          <div className="h-[6px] rounded-full bg-wash-2 overflow-hidden">
                            <div className={'h-full rounded-full ' + ((q.pct || 0) >= 80 ? 'bg-accent' : 'bg-navy')}
                              style={{ width: Math.max(2, q.pct || 0) + '%' }} />
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-2">no stated ceiling — billed on use</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {c.note && (
                  <p className="px-4 pb-3 text-[12px] text-muted">{c.note}</p>
                )}

                <div className="px-4 py-2.5 border-t border-line-soft flex gap-2">
                  <button onClick={() => { setDraft(toDraft(c)); setEditing(c.id); }}
                    className="h-9 px-3.5 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
                    Edit
                  </button>
                  {c.canSync && (
                    <button onClick={() => sync(c.id)} disabled={!!syncing}
                      className="h-9 px-3.5 rounded border border-navy text-navy text-[12.5px] font-semibold hover:bg-wash disabled:opacity-60">
                      {syncing === c.id ? 'Reading…' : 'Refresh figures'}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {err && !draft && <p className="text-[12.5px] text-accent">{err}</p>}

      {draft && (
        <Modal title={'Edit ' + (current?.service || 'service')}
          sub={editing || 'What it costs and what it meters'}
          onClose={() => { setDraft(null); setEditing(''); setErr(''); }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Service" required>
              <select value={draft.service} onChange={(e) => pickService(e.target.value)} className={selectCls}>
                <option value="">Choose…</option>
                {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
                {draft.service && !PRESETS[draft.service] && <option>{draft.service}</option>}
              </select>
            </Field>
            <Field label="Provider">
              <input value={draft.provider} onChange={(e) => set('provider', e.target.value)}
                placeholder="Hostinger, Cloudflare…" className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Account it sits under">
                {/* The whole reason this page exists: which mailbox the renewal
                    notice lands in, and whose card is on it. */}
                <input value={draft.account} onChange={(e) => set('account', e.target.value)}
                  placeholder="you@example.com" className={inputCls} />
              </Field>
            </div>
            <Field label="Plan">
              <input value={draft.plan} onChange={(e) => set('plan', e.target.value)}
                placeholder="KVM 2 · R2 Standard · Free tier" className={inputCls} />
            </Field>
            <Field label="Billing cycle">
              <select value={draft.cycle} onChange={(e) => set('cycle', e.target.value)} className={selectCls}>
                {CYCLES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={'Cost per ' + (draft.cycle === 'Yearly' ? 'year' : 'cycle') + ' (₹)'}>
              <input type="number" min={0} value={draft.cost}
                onChange={(e) => set('cost', Math.max(0, Number(e.target.value) || 0))}
                className={inputCls} />
            </Field>
            <Field label="Renews on">
              <input type="date" value={draft.renewsOn}
                onChange={(e) => set('renewsOn', e.target.value)} className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Console link">
                <input value={draft.console} onChange={(e) => set('console', e.target.value)}
                  placeholder="https://dash.cloudflare.com/…" className={inputCls} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={draft.autoRenew}
                onChange={(e) => set('autoRenew', e.target.checked)} />
              Renews automatically
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={draft.active}
                onChange={(e) => set('active', e.target.checked)} />
              Still in use
            </label>
          </div>

          {/* -------------------------------------------------- the key

              The only thing here that touches the numbers. Usage is read from
              the provider with this key; nobody types a figure, because a
              figure somebody typed is out of date the moment they stop typing.

              The box is always empty on open — the key cannot be shown, only
              replaced. Leaving it blank keeps whatever is on file.            */}
          {(() => {
            const p = PRESETS[draft.service];
            if (!p) return null;
            const wantsKey = !!p.keyLabel;
            const wantsSecret = !!p.secretLabel;
            const wantsAccount = !!p.accountLabel;
            return (
              <div className="mt-4 rounded-md border border-line overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-line-soft bg-wash">
                  <span className="text-[12.5px] font-semibold">Where the figures come from</span>
                </div>
                <p className="px-3.5 pt-3 text-[12px] text-muted leading-relaxed">{p.source}</p>

                {(wantsKey || wantsSecret || wantsAccount) && (
                  <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {wantsKey && (
                      <div className={wantsAccount ? '' : 'sm:col-span-2'}>
                        <Field label={p.keyLabel as string}>
                          <input type="password" value={draft.apiKey} autoComplete="off"
                            onChange={(e) => set('apiKey', e.target.value)}
                            placeholder={editing && current?.hasKey ? 'on file — type to replace' : ''}
                            className={inputCls} />
                        </Field>
                        {p.keyHint && (
                          <p className="text-[11px] text-muted mt-1 leading-relaxed">{p.keyHint}</p>
                        )}
                      </div>
                    )}
                    {wantsSecret && (
                      <Field label={p.secretLabel as string}>
                        <input type="password" value={draft.apiSecret} autoComplete="off"
                          onChange={(e) => set('apiSecret', e.target.value)}
                          placeholder={editing && current?.hasSecret ? 'on file — type to replace' : ''}
                          className={inputCls} />
                      </Field>
                    )}
                    {wantsAccount && (
                      <div>
                        <Field label={p.accountLabel as string}>
                          <input value={draft.accountRef} autoComplete="off"
                            onChange={(e) => set('accountRef', e.target.value)}
                            placeholder={editing && current?.hasAccountRef ? 'on file — type to replace' : ''}
                            className={inputCls + ' font-mono text-[12px]'} />
                        </Field>
                        {p.accountHint && (
                          <p className="text-[11px] text-muted mt-1 leading-relaxed">{p.accountHint}</p>
                        )}
                      </div>
                    )}
                    <p className="sm:col-span-2 text-[11px] text-muted-2">
                      Stored on the server and never sent back to this page. Saving reads
                      the figures straight away, so a wrong key says so at once.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="mt-3">
            <Field label="Note">
              <input value={draft.note} onChange={(e) => set('note', e.target.value)}
                placeholder="What it is for, who to ask, anything to remember at renewal"
                className={inputCls} />
            </Field>
          </div>

          {err && <p className="mt-3 text-[12.5px] text-accent">{err}</p>}

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => { setDraft(null); setEditing(''); setErr(''); }}
              className="h-10 px-4 rounded border border-line text-[13px] font-semibold hover:bg-wash">
              Cancel
            </button>
            <button onClick={save} disabled={busy || !draft.service.trim()}
              className="h-10 px-5 rounded bg-accent text-white text-[13px] font-semibold hover:brightness-90 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- traffic light */

function HealthDot({ health }: { health: 'green' | 'orange' | 'red' }) {
  const meta = {
    green: { color: '#0B7454', label: 'Stable' },
    orange: { color: '#E8890C', label: 'Watch' },
    red: { color: '#FF0000', label: 'Warning' },
  }[health] || { color: '#0B7454', label: 'Stable' };
  return (
    <span className="inline-flex items-center gap-1.5" title={meta.label}>
      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: meta.color }} />
      <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- reveal key */

/**
 * The stored key, masked as dots. The eye fetches it — decrypted server-side,
 * admin-only — and a second press hides it again. The list itself never
 * carries a secret.
 */
function RevealKey({ id }: { id: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (shown !== null) { setShown(null); return; }
    setBusy(true);
    try {
      const r = await api.get<{ apiKey: string; apiSecret: string }>('/credentials/' + id + '/reveal');
      setShown([r.apiKey, r.apiSecret].filter(Boolean).join('  ·  ') || '(empty)');
    } catch { setShown('(could not read)'); }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-muted">
      {shown !== null ? <span className="break-all select-all">{shown}</span> : '••••••••••••'}
      <button onClick={toggle} disabled={busy} title={shown !== null ? 'Hide the key' : 'Reveal the key'}
        className="w-6 h-6 rounded border border-line flex items-center justify-center hover:bg-wash text-[11px]">
        {busy ? '…' : shown !== null ? '🙈' : '👁'}
      </button>
    </span>
  );
}

/* -------------------------------------------------------- operational keys */

/**
 * The keys the app RUNS with — Ola Maps drives the live map and navigation,
 * Razorpay drives every UPI QR. Stored encrypted alongside everything else
 * here; masked until the eye is pressed; pasting a new value replaces the
 * old on Save.
 */
function OperationalKeys() {
  const [flags, setFlags] = useState<{ ola: boolean; razorpay: boolean; razorpayx?: boolean } | null>(null);
  const [revealed, setRevealed] = useState<{ olaKey: string; rzpKeyId: string; rzpKeySecret: string; rzpxAccount?: string } | null>(null);
  const [olaKey, setOlaKey] = useState('');
  const [rzpKeyId, setRzpKeyId] = useState('');
  const [rzpKeySecret, setRzpKeySecret] = useState('');
  const [rzpxAccount, setRzpxAccount] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);

  const load = () => api.get<{ ola: boolean; razorpay: boolean; razorpayx?: boolean }>('/org/integrations')
    .then(setFlags).catch(() => {});
  useEffect(() => { load(); }, []);

  async function toggleReveal() {
    if (revealed) { setRevealed(null); return; }
    try { setRevealed(await api.get('/org/integrations/reveal')); }
    catch { setMsg('Only the admin can reveal the keys'); }
  }

  async function save() {
    setMsg('');
    try {
      const r = await api.patch<{ ola: boolean; razorpay: boolean; razorpayx?: boolean }>('/org/integrations', {
        olaKey: olaKey.trim(), rzpKeyId: rzpKeyId.trim(), rzpKeySecret: rzpKeySecret.trim(),
        rzpxAccount: rzpxAccount.trim(),
      });
      setFlags(r);
      setOlaKey(''); setRzpKeyId(''); setRzpKeySecret(''); setRzpxAccount('');
      setRevealed(null); setEditing(false);
      setMsg('Saved — stored encrypted.');
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not save'); }
  }

  const input = 'w-full h-9 px-3 rounded border border-line text-[13px] font-mono outline-none focus:border-navy';
  const dot = (on: boolean) => (
    <span className="w-2.5 h-2.5 rounded-full inline-block"
      style={{ background: on ? '#0B7454' : '#FF0000' }} />
  );
  const masked = (v: string | undefined, on: boolean) =>
    revealed ? (
      <span className="font-mono text-[11.5px] break-all select-all">{v || '(not set)'}</span>
    ) : (
      <span className="font-mono text-[11.5px] text-muted">{on ? '••••••••••••••••' : 'not set'}</span>
    );

  return (
    <section className="rounded-xl border border-line bg-white shadow-card overflow-hidden max-lg:rounded-2xl max-lg:border-0 max-lg:bg-white max-lg:shadow-none">
      <header className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-3">
        <span>
          <span className="text-[14px] font-bold text-navy">Operational keys</span>
          <span className="block text-[11.5px] text-muted">
            What the app itself runs with — encrypted at rest, masked here.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <button onClick={toggleReveal} title={revealed ? 'Hide' : 'Reveal'}
            className="w-8 h-8 rounded border border-line flex items-center justify-center hover:bg-wash">
            {revealed ? '🙈' : '👁'}
          </button>
          <button onClick={() => setEditing((v) => !v)}
            className="h-8 px-3 rounded border border-line text-[12.5px] font-semibold hover:bg-wash">
            {editing ? 'Close' : 'Edit'}
          </button>
        </span>
      </header>

      <div className="px-4 py-3 flex flex-col gap-2.5 text-[12.5px]">
        <div className="flex items-center gap-2.5 flex-wrap">
          {flags && dot(flags.ola)}
          <span className="font-semibold w-[90px]">Ola Maps</span>
          {masked(revealed?.olaKey, !!flags?.ola)}
          <span className="text-[11px] text-muted-2">— live map & navigation</span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {flags && dot(flags.razorpay)}
          <span className="font-semibold w-[90px]">Razorpay</span>
          {masked(revealed ? revealed.rzpKeyId + (revealed.rzpKeySecret ? '  ·  ' + revealed.rzpKeySecret : '') : '', !!flags?.razorpay)}
          <span className="text-[11px] text-muted-2">— UPI QR collections</span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {flags && dot(!!flags.razorpayx)}
          <span className="font-semibold w-[90px]">RazorpayX</span>
          {masked(revealed?.rzpxAccount, !!flags?.razorpayx)}
          <span className="text-[11px] text-muted-2">— account no. for expense payouts</span>
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line-soft pt-3">
          <label className="block">
            <span className="block text-[11.5px] font-semibold text-ink-2 mb-1">Ola Maps API key</span>
            <input value={olaKey} onChange={(e) => setOlaKey(e.target.value)}
              placeholder="paste to replace" className={input} />
          </label>
          <label className="block">
            <span className="block text-[11.5px] font-semibold text-ink-2 mb-1">Razorpay key id</span>
            <input value={rzpKeyId} onChange={(e) => setRzpKeyId(e.target.value)}
              placeholder="rzp_live_…" className={input} />
          </label>
          <label className="block">
            <span className="block text-[11.5px] font-semibold text-ink-2 mb-1">Razorpay key secret</span>
            <input type="password" value={rzpKeySecret} onChange={(e) => setRzpKeySecret(e.target.value)}
              placeholder="secret" className={input} />
          </label>
          <label className="block">
            <span className="block text-[11.5px] font-semibold text-ink-2 mb-1">RazorpayX account number</span>
            <input value={rzpxAccount} onChange={(e) => setRzpxAccount(e.target.value)}
              placeholder="the X current-account no." className={input} />
          </label>
          <div className="sm:col-span-3">
            <button onClick={save}
              className="h-9 px-4 rounded bg-navy text-white text-[13px] font-semibold hover:brightness-110">
              Save keys
            </button>
          </div>
        </div>
      )}
      {msg && <p className="px-4 pb-3 text-[12px] text-muted">{msg}</p>}
    </section>
  );
}
