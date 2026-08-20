/* ============================================================================
   The services this business runs on, and what they cost.

   It answers two questions that previously had no home:

     what am I about to be charged for      → renewals, sorted by soonest
     what am I about to run out of          → quotas, sorted by fullest

   **Usage is read, never typed.** Each service holds the key its figures are
   fetched with, and a sync pulls the real numbers — see credential-sync.ts for
   what each provider can actually answer. A figure somebody typed is out of
   date the moment they stop typing, and the only reason to look at this page is
   to trust what it says.

   The keys go in and do not come back: the list returns `hasKey`, not the key.
   A page that prints your secrets leaks them the first time somebody shares a
   screen. These are read-only usage keys, kept separate from the operational
   keys in Settings → Integrations, so a leak here cannot move money or fire
   requests you pay for.

   Admin only. This is the owner's view of the bill.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { NEEDS, SYNCABLE, UsageUnavailable, readUsage } from './credential-sync';
import { open, seal } from '../secrets.util';

/*
 * What a person may edit: who the account is, what it costs, and the key the
 * figures are read with. **Not the figures.** A usage number somebody typed is
 * out of date the moment they stop typing, and the only reason to look at this
 * page is to trust what it says.
 */
const FIELDS = [
  'service', 'provider', 'account', 'plan', 'cycle', 'renewsOn',
  'console', 'note',
] as const;

/** Written in, never read back. The list returns `hasKey`, not the key. */
const SECRETS = ['apiKey', 'apiSecret', 'accountRef', 'resourceRef'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};

/** Whole days from today to an ISO date; negative once it has passed. */
function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const then = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(todayISO() + 'T00:00:00').getTime();
  return Math.round((then - now) / 86400000);
}

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = String(body[f] ?? '').trim();
  // An empty string clears a key on purpose; undefined leaves it alone, so
  // saving the form without retyping the key does not wipe it. Whatever goes
  // in is sealed — the database never holds a readable secret.
  for (const f of SECRETS) if (body[f] !== undefined) out[f] = seal(String(body[f] ?? '').trim());
  if (body.cost !== undefined) out.cost = Math.max(0, Math.round(Number(body.cost) || 0));
  if (body.autoRenew !== undefined) out.autoRenew = !!body.autoRenew;
  if (body.active !== undefined) out.active = !!body.active;
  return out;
}

@Controller('credentials')
@UseGuards(AuthGuard)
@Roles('admin')
export class CredentialsController {
  constructor(private prisma: PrismaService) {}

  private async nextId() {
    const rows = await this.prisma.credential.findMany({ select: { id: true } });
    const n = rows.reduce((a, r) => Math.max(a, Number(String(r.id).replace('CR-', '')) || 0), 0);
    return 'CR-' + String(n + 1).padStart(2, '0');
  }

  @Get()
  async list() {
    const rows = await this.prisma.credential.findMany({
      include: { quotas: { orderBy: { order: 'asc' } } },
      orderBy: { id: 'asc' },
    });

    const items = rows.map((c) => {
      const days = daysUntil(c.renewsOn);
      const need = NEEDS[c.service] || [];
      const missing = need.filter((f) => !String((c as unknown as Record<string, string>)[f] || '').trim());
      // Everything except the secrets. They go in; they do not come back.
      const { apiKey, apiSecret, accountRef, resourceRef, ...safe } = c;
      const quotas = c.quotas.map((q) => ({
        ...q,
        pct: q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : null,
      }));
      // The traffic light. Red = something is wrong or about to run out;
      // orange = worth a look this week; green = stable, nothing to do.
      const maxPct = quotas.reduce((a, q) => Math.max(a, q.pct || 0), 0);
      const health: 'red' | 'orange' | 'green' =
        c.syncError || maxPct >= 85 || (days !== null && days <= 0 && c.active)
          ? 'red'
          : maxPct >= 60 || (days !== null && days <= 14) || (SYNCABLE.includes(c.service) && missing.length > 0)
            ? 'orange'
            : 'green';
      return {
        ...safe,
        hasKey: !!apiKey,
        hasSecret: !!apiSecret,
        hasAccountRef: !!accountRef,
        hasResourceRef: !!resourceRef,
        canSync: SYNCABLE.includes(c.service),
        // What still has to be filled in before a sync can work, named so the
        // screen can say it rather than just failing.
        needs: missing,
        daysToRenewal: days,
        health,
        quotas,
      };
    });

    const live = items.filter((c) => c.active);
    const monthly = live.reduce((a, c) => {
      if (c.cycle === 'Monthly') return a + c.cost;
      if (c.cycle === 'Yearly') return a + Math.round(c.cost / 12);
      return a;
    }, 0);

    return {
      items,
      summary: {
        services: live.length,
        monthlyRunRate: monthly,
        yearlyRunRate: monthly * 12,
        // What needs paying in the next month, soonest first.
        dueSoon: live
          .filter((c) => c.daysToRenewal !== null && c.daysToRenewal <= 30)
          .sort((a, b) => (a.daysToRenewal || 0) - (b.daysToRenewal || 0))
          .map((c) => ({ id: c.id, service: c.service, renewsOn: c.renewsOn, days: c.daysToRenewal, cost: c.cost })),
        // Anything past 80% of a stated limit. Under it, nobody needs telling.
        tight: live.flatMap((c) => c.quotas
          .filter((q) => q.pct !== null && q.pct >= 80)
          .map((q) => ({ id: c.id, service: c.service, label: q.label, pct: q.pct, used: q.used, limit: q.limit, unit: q.unit }))),
        accounts: [...new Set(live.map((c) => c.account).filter(Boolean))],
      },
    };
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const data = pick(body);
    if (!data.service) throw new BadRequestException('Which service is this?');
    const made = await this.prisma.credential.create({
      data: { id: await this.nextId(), ...data } as never,
    });
    // Fetch the figures straight away, so a service added with a key is
    // useful before anyone has to press anything.
    await this.sync(made.id).catch(() => { /* reported on the row */ });
    return { id: made.id };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const exists = await this.prisma.credential.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('No such credential');
    await this.prisma.credential.update({ where: { id }, data: pick(body) as never });
    // A new key is only worth having if it works. Try it now.
    await this.sync(id).catch(() => { /* reported on the row */ });
    return { id };
  }

  /**
   * Read the real figures off the provider and write them down.
   *
   * Nobody types a usage number here — see credential-sync.ts for what each
   * service can actually answer. A sync that cannot work records why, so a
   * stale figure explains itself rather than quietly ageing.
   */
  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    const c = await this.prisma.credential.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('No such credential');

    try {
      // Ola publishes no usage endpoint, so the honest figure is our own count.
      const month = 'ola.calls.' + new Date().toISOString().slice(0, 7);
      const counter = await this.prisma.seq.findUnique({ where: { key: month } });

      const readings = await readUsage({
        service: c.service,
        apiKey: open(c.apiKey),
        apiSecret: open(c.apiSecret),
        accountRef: open(c.accountRef),
        resourceRef: open(c.resourceRef),
        selfCounts: { ola: counter?.value || 0 },
      });

      const existing = await this.prisma.credentialQuota.findMany({ where: { credentialId: id } });
      await this.prisma.$transaction([
        this.prisma.credentialQuota.deleteMany({ where: { credentialId: id } }),
        ...readings.map((q, i) => this.prisma.credentialQuota.create({
          data: {
            credentialId: id,
            label: q.label,
            used: Math.max(0, Math.round(q.used)),
            // A reading that does not state a ceiling keeps the one already
            // recorded — the plan decides it, not the meter.
            limit: q.limit !== undefined && q.limit > 0
              ? Math.round(q.limit)
              : (existing.find((e) => e.label === q.label)?.limit || 0),
            unit: q.unit,
            note: q.note || '',
            order: i,
          },
        })),
        this.prisma.credential.update({
          where: { id }, data: { checkedOn: todayISO(), syncError: '' },
        }),
      ]);
      return { ok: true, readings: readings.length };
    } catch (e) {
      const why = e instanceof Error ? e.message : 'could not read the usage';
      /*
       * A misconfiguration takes the old figures with it. Numbers measured on
       * the wrong machine, or under a key that has been revoked, are worse than
       * a blank — a blank prompts a question, a wrong number does not. A
       * transient failure keeps the last good reading.
       */
      if (e instanceof UsageUnavailable) {
        await this.prisma.credentialQuota.deleteMany({ where: { credentialId: id } });
      }
      await this.prisma.credential.update({
        where: { id },
        data: { syncError: why, ...(e instanceof UsageUnavailable ? { checkedOn: '' } : {}) },
      });
      throw new BadRequestException(why);
    }
  }

  /** Refresh everything that can be refreshed, newest figures first. */
  @Post('sync-all')
  async syncAll() {
    const rows = await this.prisma.credential.findMany({ where: { active: true } });
    const done: string[] = [];
    const failed: Array<{ id: string; why: string }> = [];
    for (const c of rows) {
      if (!SYNCABLE.includes(c.service)) continue;
      try { await this.sync(c.id); done.push(c.id); }
      catch (e) { failed.push({ id: c.id, why: e instanceof Error ? e.message : 'failed' }); }
    }
    return { done, failed };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.credential.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * The stored secrets, decrypted — fetched only when the admin presses the
   * reveal icon, never carried by the list. Admin-only by the class guard.
   */
  @Get(':id/reveal')
  async reveal(@Param('id') id: string) {
    const c = await this.prisma.credential.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('No such credential');
    return {
      apiKey: open(c.apiKey),
      apiSecret: open(c.apiSecret),
      accountRef: open(c.accountRef),
      resourceRef: open(c.resourceRef),
    };
  }
}
