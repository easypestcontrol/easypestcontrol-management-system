/* ============================================================================
   Leads — the sales pipeline.

   Ported from v1 assets/js/views/leads.js (+ store.js helpers). The rules
   that matter, with their v1 lines:
     - capture: name+phone required, area defaults 'Chennai', stage follows the
       follow-up date, value = Σ catalogue price of ticked services
       (leads.js:866-896)
     - log is newest-first, every stage move writes an entry (leads.js:94-97)
     - stage moves carry side-effects: follow-up books a call-back, lost
       requires a reason and appends it to the notes (leads.js:471-525),
       won promotes the lead to a client if none exists by phone match
       (amcform.js:91-143) and links the first lead contract (leads.js:616-621)
     - leadContracts(l): by leadId, contractId, quoteId or clientId
       (store.js:1100-1110)
   ========================================================================== */

import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { docTotals } from 'shared';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';

interface LogEntry { at: string; text: string; by: string }
interface AuthedReq { user: { sub: string; role: string } }

const STAGES = ['new', 'followup', 'inspection', 'quoted', 'contract', 'won', 'lost'] as const;
type Stage = (typeof STAGES)[number];

/** Roles that can own a lead — sales first, then the managers (store.js:142-147). */
const ASSIGNABLE_ROLES = ['sales', 'ops', 'admin'];

const EDITABLE = [
  'name', 'phone', 'email', 'type', 'area', 'source', 'followUp', 'notes',
  'owner', 'branch',
] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  return data;
}

/** Last 10 digits of a phone number — the only reliable way to match it (store.js:199). */
const phoneKey = (v: unknown) => String(v || '').replace(/\D/g, '').slice(-10);

const pad = (n: number) => String(n).padStart(2, '0');
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
/** 'YYYY-MM-DDTHH:MM' — the timestamp format every v1 log entry uses (store.js:375). */
function nowStamp() {
  const d = new Date();
  return todayISO() + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso: string) {
  const p = String(iso || '').split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return '—';
  return p[2] + ' ' + MON[p[1] - 1] + ' ' + p[0];
}
function fmtTime(hhmm: string) {
  if (!hhmm) return '—';
  const t = String(hhmm).slice(-5);
  let h = parseInt(t.split(':')[0], 10);
  const m = t.split(':')[1];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(private prisma: PrismaService) {}

  /** Prepend an entry to a lead's activity trail — newest first (leads.js:94-97). */
  private logOf(log: unknown, text: string, by: string): LogEntry[] {
    const cur = Array.isArray(log) ? (log as LogEntry[]) : [];
    return [{ at: nowStamp(), text, by }, ...cur];
  }

  // The list is the whole book. A technician needs the one record his own
  // screens link to, never the ledger — so the collection is gated and the
  // detail below is not.
  @Get()
  @Roles('admin', 'ops', 'sales')
  async list(
    @Req() req: AuthedReq,
    @Query('q') q?: string,
    @Query('stage') stage?: string,
    @Query('owner') owner?: string,
    @Query('branch') branch?: string,
  ) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const where: Record<string, unknown> = { ...branchWhere(scope) };
    if (stage && (STAGES as readonly string[]).indexOf(stage) >= 0) where.stage = stage;
    if (owner) where.owner = owner;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { area: { contains: q, mode: 'insensitive' } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }
    // v1 unshifts new leads onto the front — newest first.
    return this.prisma.lead.findMany({ where: where as never, orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  async one(@Param('id') id: string, @Req() req: AuthedReq) {
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('No such lead');
    if (!inScope(await branchScope(this.prisma, req.user), l.branch)) {
      throw new NotFoundException('No such lead');
    }

    const [quotes, company, client] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { leadId: id }, include: { items: true }, orderBy: { id: 'desc' },
      }),
      this.prisma.company.findFirst(),
      l.clientId ? this.prisma.client.findUnique({ where: { id: l.clientId } }) : null,
    ]);

    // leadContracts(l) — store.js:1100-1110: by leadId, by the lead's own
    // contractId, by any of the lead's quotes, or by the shared client.
    const qids = quotes.map((q) => q.id);
    const or: Record<string, unknown>[] = [{ leadId: id }];
    if (l.contractId) or.push({ id: l.contractId });
    if (qids.length) or.push({ quoteId: { in: qids } });
    if (l.clientId) or.push({ clientId: l.clientId });
    const contracts = await this.prisma.contract.findMany({
      where: { OR: or } as never, orderBy: { id: 'desc' },
    });

    // contactHistory — store.js:248-255: every other lead from the same
    // customer, matched by clientId or by the last 10 digits of the phone.
    const k = phoneKey(l.phone);
    const all = await this.prisma.lead.findMany({
      select: {
        id: true, name: true, phone: true, clientId: true, stage: true,
        value: true, area: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const history = all.filter((x) =>
      x.id !== l.id &&
      ((l.clientId && x.clientId === l.clientId) || (k && phoneKey(x.phone) === k)));

    const state = company?.state || 'Tamil Nadu';
    const rate = company?.gstRate ?? 18;
    return {
      ...l,
      quotes: quotes.map((q) => ({
        ...q,
        total: docTotals(q.items, q.discount, q.placeOfSupply, state, rate).total,
      })),
      contracts,
      history,
      client,
    };
  }

  /**
   * Capture — leads.js:866-896. Name and phone are required; the area defaults
   * to Chennai; a follow-up date lands the lead straight in Follow-up; the
   * value is the catalogue price of every ticked service.
   */
  @Post()
  @Roles('admin', 'ops', 'sales')
  async create(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || !phone) throw new BadRequestException('Name and phone are required');

    // value = Σ catalogue price of the ticked interest services (leads.js:872)
    const interest = Array.isArray(body.interest) ? (body.interest as string[]) : [];
    const services = interest.length
      ? await this.prisma.service.findMany({ where: { id: { in: interest } } })
      : [];
    const value = interest.reduce(
      (s, sid) => s + (services.find((x) => x.id === sid)?.price || 0), 0);

    // Returning customer. The capture form owns the match: it sends clientId
    // (possibly '' — the user cleared the banner on purpose) plus a returning
    // flag when a prior lead matched by phone. A caller that never says
    // clientId at all gets the v1 phone-key lookup here (store.js:234-245).
    let clientId = String(body.clientId || '');
    let returning = !!clientId || body.returning === true;
    if (!('clientId' in body)) {
      const k = phoneKey(phone);
      if (k.length >= 10) {
        const clients = await this.prisma.client.findMany({ select: { id: true, phone: true } });
        clientId = clients.find((c) => phoneKey(c.phone) === k)?.id || '';
        returning = returning || !!clientId;
      }
    }

    // Owner defaults to whoever is capturing, if they can own leads (leads.js:18-21).
    const owner = String(body.owner || '') ||
      (ASSIGNABLE_ROLES.indexOf(req.user.role) >= 0 ? req.user.sub : 'U03');

    const followUp = String(body.followUp || '');
    const seq = await this.prisma.seq.upsert({
      where: { key: 'lead' },
      create: { key: 'lead', value: 1001 },
      update: { value: { increment: 1 } },
    });

    const log: LogEntry[] = [{
      at: todayISO(),
      text: 'Lead captured' + (returning ? ' — returning customer' : ''),
      by: req.user.sub,
    }];
    // The v2 schema keeps no interest[] column, so the ticked services live on
    // the activity trail — the value they priced is on the lead itself.
    if (services.length) {
      log.unshift({
        at: todayISO(),
        text: 'Services required: ' + interest
          .map((sid) => services.find((x) => x.id === sid)?.name || sid).join(', '),
        by: req.user.sub,
      });
    }

    return this.prisma.lead.create({
      data: {
        id: 'LD-' + seq.value,
        name,
        phone,
        email: String(body.email || '').trim(),
        source: String(body.source || 'WhatsApp'),
        type: String(body.type || 'Residential'),
        area: String(body.area || '').trim() || 'Chennai',
        stage: followUp ? 'followup' : 'new',
        followUp,
        clientId,
        branch: String(body.branch || ''),
        value,
        owner,
        notes: String(body.notes || '').trim() || 'New lead captured.',
        log: log as never,
      },
    });
  }

  /**
   * Edit. A change of owner or branch is an assignment and writes its own log
   * entry, exactly as the Save-assignment button did (leads.js:655-665).
   */
  @Patch(':id')
  @Roles('admin', 'ops', 'sales')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthedReq,
  ) {
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('No such lead');

    const data = pick(body);
    const ownerChanged = 'owner' in data && data.owner !== l.owner;
    const branchChanged = 'branch' in data && data.branch !== l.branch;
    if (ownerChanged || branchChanged) {
      const owner = String(data.owner ?? l.owner);
      const branch = String(data.branch ?? l.branch);
      const [u, b] = await Promise.all([
        owner ? this.prisma.user.findUnique({ where: { id: owner } }) : null,
        branch ? this.prisma.branch.findUnique({ where: { id: branch } }) : null,
      ]);
      data.log = this.logOf(l.log,
        'Assigned to ' + (u?.name || owner) + (b ? ' · ' + b.name : ''),
        req.user.sub) as never;
    }
    return this.prisma.lead.update({ where: { id }, data: data as never });
  }

  /** Append a note to the activity trail — newest first, with who and when. */
  @Post(':id/log')
  @Roles('admin', 'ops', 'sales')
  async addLog(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthedReq,
  ) {
    const text = String(body.text || '').trim();
    if (!text) throw new BadRequestException('Write the note first');
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('No such lead');
    return this.prisma.lead.update({
      where: { id },
      data: { log: this.logOf(l.log, text, req.user.sub) as never },
    });
  }

  /**
   * Stage move with the call-outcome side-effects (leads.js:471-631):
   *   followup   — books a call-back: date (default tomorrow) + time in the log
   *   inspection — books the site visit, optionally naming the technician
   *   lost       — reason REQUIRED, appended to the notes
   *   contract   — the quote was accepted
   *   won        — links the first lead contract and promotes the lead to a
   *                client if none exists (phone-key match, else a new CL-nnn —
   *                amcform.js:91-143)
   * Every move clears the dated commitment and writes a log entry.
   */
  @Post(':id/stage')
  @Roles('admin', 'ops', 'sales')
  async setStage(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthedReq,
  ) {
    const stage = String(body.stage || '') as Stage;
    if ((STAGES as readonly string[]).indexOf(stage) < 0) {
      throw new BadRequestException('Unknown stage');
    }
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('No such lead');

    const data: Record<string, unknown> = { stage };
    let text = '';

    if (stage === 'followup') {
      const date = String(body.date || '') || tomorrowISO();
      const time = String(body.time || '') || '10:00';
      data.followUp = date;
      text = 'Call back booked ' + fmtDate(date) + ' at ' + fmtTime(time);
    } else if (stage === 'inspection') {
      const date = String(body.date || '') || tomorrowISO();
      const time = String(body.time || '') || '10:00';
      const who = String(body.who || '');
      const u = who ? await this.prisma.user.findUnique({ where: { id: who } }) : null;
      data.followUp = date;
      text = 'Site inspection booked ' + fmtDate(date) + ' at ' + fmtTime(time) +
        (u ? ' with ' + u.name : '');
    } else if (stage === 'lost') {
      const why = String(body.reason || '').trim();
      if (!why) throw new BadRequestException('Add a note before marking it lost');
      data.followUp = '';
      data.notes = l.notes ? l.notes + '\n\nNot interested: ' + why : 'Not interested: ' + why;
      text = 'Not interested — ' + why;
    } else if (stage === 'won') {
      data.followUp = '';

      // Which contracts belong to this lead (store.js:1100-1110).
      const quotes = await this.prisma.quotation.findMany({
        where: { leadId: id }, select: { id: true },
      });
      const or: Record<string, unknown>[] = [{ leadId: id }];
      if (l.contractId) or.push({ id: l.contractId });
      if (quotes.length) or.push({ quoteId: { in: quotes.map((q) => q.id) } });
      if (l.clientId) or.push({ clientId: l.clientId });
      const cs = await this.prisma.contract.findMany({
        where: { OR: or } as never, orderBy: { id: 'asc' },
      });
      data.contractId = l.contractId || cs[0]?.id || '';

      // Lead → client promotion: existing client by phone key, else a new
      // CL-nnn carrying everything the lead knew (amcform.js:91-143).
      let clientId = l.clientId;
      if (!clientId) {
        const k = phoneKey(l.phone);
        const clients = await this.prisma.client.findMany({ select: { id: true, phone: true } });
        clientId = (k && clients.find((c) => phoneKey(c.phone) === k)?.id) || '';
        if (!clientId) {
          const seq = await this.prisma.seq.upsert({
            where: { key: 'client' },
            create: { key: 'client', value: 1 },
            update: { value: { increment: 1 } },
          });
          clientId = 'CL-' + String(seq.value).padStart(3, '0');
          await this.prisma.client.create({
            data: {
              id: clientId, name: l.name, type: l.type, contact: l.name,
              phone: l.phone, email: l.email, addr: l.area, city: 'Chennai',
              since: todayISO(), area: l.area, branch: l.branch,
            },
          });
        }
      }
      data.clientId = clientId;
      text = 'Contract signed — lead won' + (cs.length ? ' (' + cs[0].id + ')' : '');
    } else if (stage === 'contract') {
      data.followUp = '';
      text = 'Quote accepted — moved to Contract';
    } else if (stage === 'quoted') {
      data.followUp = '';
      text = 'Moved to Quoted';
    } else {
      // 'new' — dragging a lead back to the top of the funnel.
      data.followUp = '';
      text = 'Moved back to New Lead';
    }

    data.log = this.logOf(l.log, text, req.user.sub) as never;
    return this.prisma.lead.update({ where: { id }, data: data as never });
  }
}
