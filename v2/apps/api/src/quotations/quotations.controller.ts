/* ============================================================================
   Quotations — the document pipeline. CRUD, status transitions, duplication,
   and the lead side-effects that keep the sales funnel honest.

   Ported from v1 assets/js/views/quotations.js; every rule cites its line.
   Money math lives in the shared package — nothing is recomputed here.
   ========================================================================== */
import {
  BadRequestException, Body, ConflictException, Controller, Get,
  NotFoundException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { composeQuote, todayISO, type QuoteRow } from './shape';
import { branchScope, branchWhere, clampScope, clientBranch, inScope } from '../branch.util';

interface ScopedReq { user?: { sub?: string; role?: string } }

/** v1 store.js:194 — a lead still in play can be quoted against. */
const OPEN_LEAD_STAGES = ['new', 'followup', 'inspection', 'quoted', 'contract'];

const EDITABLE = [
  'date', 'mode', 'title', 'refNo', 'placeOfSupply', 'billAddr', 'shipAddr',
  'discount', 'advancePct', 'notes', 'terms', 'branch', 'owner', 'signCustomer',
] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  return data;
}

/** Sanitise line items — quotations.js:565-579. qty/rate are integers in v2. */
function cleanItems(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((i: Record<string, unknown>, n: number) => ({
    svId: String(i.svId || ''),
    desc: String(i.desc || '').trim(),
    qty: Math.max(0, Math.round(Number(i.qty) || 1)),
    rate: Math.max(0, Math.round(Number(i.rate) || 0)),
    visits: Math.max(1, Math.round(Number(i.visits) || 1)),
    months: Math.max(1, Math.round(Number(i.months) || 12)),
    order: n,
  }));
}

/** amc: the longest line wins, default 12; onetime: 0 — quotations.js:600-601. */
function quoteMonths(mode: string, items: Array<{ months: number }>) {
  return mode === 'amc'
    ? items.reduce((m, i) => Math.max(m, i.months || 0), 0) || 12
    : 0;
}

@Controller('quotations')
@UseGuards(AuthGuard)
export class QuotationsController {
  constructor(private prisma: PrismaService) {}

  /* ---------------------------------------------------------------- reads */

  // The list is the whole book. A technician needs the one record his own
  // screens link to, never the ledger — so the collection is gated and the
  // detail below is not.
  @Get()
  @Roles('admin', 'ops', 'sales')
  async list(@Req() req: ScopedReq, @Query('branch') branch?: string) {
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const [quotes, clients, leads] = await Promise.all([
      this.prisma.quotation.findMany({
        where: branchWhere(scope),
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' }, // v1 unshifts new quotes to the front
      }),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
      this.prisma.lead.findMany({ select: { id: true, name: true } }),
    ]);
    const cn = new Map(clients.map((c) => [c.id, c.name]));
    const ln = new Map(leads.map((l) => [l.id, l.name]));
    return quotes.map((q) => ({
      ...q,
      partyName: q.clientId ? cn.get(q.clientId) || '—' : ln.get(q.leadId) || '—',
    }));
  }

  /** Everything the builder's "Raise for" combobox searches over. */
  @Get('parties')
  async parties() {
    const [clients, leads] = await Promise.all([
      this.prisma.client.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.lead.findMany({
        where: { stage: { in: OPEN_LEAD_STAGES as never } },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { clients, leads };
  }

  /** The number the builder shows before the save mints one — quotations.js:265. */
  @Get('next-no')
  async nextNo() {
    const seq = await this.prisma.seq.findUnique({ where: { key: 'quote' } });
    return { nextNo: 'QT-' + (((seq && seq.value) || 1000) + 1) };
  }

  @Get(':id')
  async one(@Param('id') id: string, @Req() req?: ScopedReq) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!q) throw new NotFoundException('No such quotation');
    if (req && !inScope(await branchScope(this.prisma, req.user), q.branch)) {
      throw new NotFoundException('No such quotation');
    }
    return composeQuote(this.prisma, q as unknown as QuoteRow);
  }

  /* --------------------------------------------------------------- writes */

  @Post()
  @Roles('admin', 'ops', 'sales')
  async create(@Body() body: Record<string, unknown>) {
    const title = String(body.title || '').trim();
    if (!title) throw new BadRequestException('Give the quotation a title');
    const clientId = String(body.clientId || '');
    const leadId = clientId ? '' : String(body.leadId || '');
    if (!clientId && !leadId) throw new BadRequestException('Pick who this is for');

    const mode = body.mode === 'onetime' ? 'onetime' : 'amc';
    const items = cleanItems(body.items);
    if (!items.length) throw new BadRequestException('Keep at least one line item');

    // The counter always advances; a typed number is kept only while it is
    // unique — quotations.js:582-587.
    const seq = await this.prisma.seq.upsert({
      where: { key: 'quote' },
      create: { key: 'quote', value: 1001 },
      update: { value: { increment: 1 } },
    });
    const typed = String(body.id || '').trim();
    const clash = typed
      ? await this.prisma.quotation.findUnique({ where: { id: typed } })
      : null;
    const id = typed && !clash ? typed : 'QT-' + seq.value;

    const owner = String(body.owner || '');
    const q = await this.prisma.quotation.create({
      data: {
        id,
        clientId,
        leadId,
        date: String(body.date || '') || todayISO(),
        status: 'draft',
        mode,
        months: quoteMonths(mode, items),
        freq: '', // quotations.js:599
        title,
        refNo: String(body.refNo || '').trim(),
        placeOfSupply: String(body.placeOfSupply || ''),
        billAddr: String(body.billAddr || '').trim(),
        shipAddr: String(body.shipAddr || '').trim(),
        branch: String(body.branch || '')
          || (clientId ? await clientBranch(this.prisma, clientId) : '')
          || (leadId
            ? (await this.prisma.lead.findUnique({ where: { id: leadId }, select: { branch: true } }))?.branch || ''
            : ''),
        owner,
        discount: Math.max(0, Math.round(Number(body.discount) || 0)),
        // 0-100. What is asked for when the customer says yes.
        advancePct: Math.max(0, Math.min(100, Math.round(Number(body.advancePct) || 0))),
        notes: String(body.notes || '').trim(),
        terms: Array.isArray(body.terms) ? (body.terms as unknown[]).map(String) : [],
        signCustomer: String(body.signCustomer || ''),
        signExec: await this.execSign(owner, String(body.signExec || '')),
        items: { create: items },
      } as never,
      include: { items: { orderBy: { order: 'asc' } } },
    });

    await this.leadOnRaise(leadId);
    return composeQuote(this.prisma, q as unknown as QuoteRow);
  }

  @Patch(':id')
  @Roles('admin', 'ops', 'sales')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const q0 = await this.prisma.quotation.findUnique({ where: { id } });
    if (!q0) throw new NotFoundException('No such quotation');
    // Once a contract has been generated off it, the quotation is the record
    // of what was agreed — quotations.js:1373.
    if (q0.contractId) {
      throw new ConflictException(
        'A contract was generated from this quotation — it can no longer be edited',
      );
    }

    const data = pick(body);
    if ('title' in data && !String(data.title || '').trim()) {
      throw new BadRequestException('Give the quotation a title');
    }
    if ('mode' in data) data.mode = data.mode === 'onetime' ? 'onetime' : 'amc';
    if ('discount' in data) data.discount = Math.max(0, Math.round(Number(data.discount) || 0));
    if ('advancePct' in data) {
      data.advancePct = Math.max(0, Math.min(100, Math.round(Number(data.advancePct) || 0)));
    }
    if ('billAddr' in data) data.billAddr = String(data.billAddr || '').trim();
    if ('shipAddr' in data) data.shipAddr = String(data.shipAddr || '').trim();
    if ('terms' in data) {
      data.terms = Array.isArray(data.terms) ? (data.terms as unknown[]).map(String) : [];
    }
    // Re-picking the party swaps one id in and blanks the other, like v1.
    if ('clientId' in body || 'leadId' in body) {
      const cid = String(body.clientId || '');
      data.clientId = cid;
      data.leadId = cid ? '' : String(body.leadId || '');
    }

    let newItems: ReturnType<typeof cleanItems> | null = null;
    if ('items' in body) {
      newItems = cleanItems(body.items);
      if (!newItems.length) throw new BadRequestException('Keep at least one line item');
    }
    const mode = String(data.mode || q0.mode);
    const monthsSource =
      newItems || (await this.prisma.quoteItem.findMany({ where: { quoteId: id } }));
    data.months = quoteMonths(mode, monthsSource);
    data.freq = '';

    // The owner's on-file signature wins over anything sent up, which wins
    // over what was already there — quotations.js:606-607.
    const owner = String(('owner' in data ? data.owner : q0.owner) || '');
    data.signExec = await this.execSign(owner, String(body.signExec || ''), q0.signExec);

    if (newItems) await this.prisma.quoteItem.deleteMany({ where: { quoteId: id } });
    const q = await this.prisma.quotation.update({
      where: { id },
      data: {
        ...data,
        ...(newItems ? { items: { create: newItems } } : {}),
      } as never,
      include: { items: { orderBy: { order: 'asc' } } },
    });

    // Saving a quotation raised on a lead drags the lead to 'quoted', on
    // create AND edit — quotations.js:611.
    await this.leadOnRaise(String(('leadId' in data ? data.leadId : q0.leadId) || ''));
    return composeQuote(this.prisma, q as unknown as QuoteRow);
  }

  /**
   * Status transitions with their lead side-effects:
   *   sent      — draft→sent only; resending never regresses (quotations.js:1203-1209)
   *   approved  — lead moves to 'contract' unless already won (quotations.js:1413-1417)
   *   rejected  — lead moves to 'lost' (quotations.js:1419-1422)
   */
  @Post(':id/status')
  @Roles('admin', 'ops', 'sales')
  async setStatus(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { user: { sub?: string } },
  ) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('No such quotation');
    const action = String(body.action || '');

    if (action === 'approve-internal') {
      // Our half of the two-handed acceptance. The customer's half is the
      // 'approved' action (or the public accept link).
      await this.prisma.quotation.update({
        where: { id },
        data: {
          approvedBy: req.user?.sub || 'us',
          approvedAt: new Date().toISOString().slice(0, 10),
        },
      });
    } else if (action === 'sent') {
      if (q.status === 'draft') {
        await this.prisma.quotation.update({ where: { id }, data: { status: 'sent' } });
      }
    } else if (action === 'approved') {
      await this.prisma.quotation.update({ where: { id }, data: { status: 'approved' } });
      if (q.leadId) {
        const l = await this.prisma.lead.findUnique({ where: { id: q.leadId } });
        if (l && l.stage !== 'won') {
          await this.prisma.lead.update({ where: { id: l.id }, data: { stage: 'contract' } });
        }
      }
    } else if (action === 'rejected') {
      await this.prisma.quotation.update({ where: { id }, data: { status: 'rejected' } });
      if (q.leadId) {
        const l = await this.prisma.lead.findUnique({ where: { id: q.leadId } });
        if (l) {
          await this.prisma.lead.update({ where: { id: l.id }, data: { stage: 'lost' } });
        }
      }
    } else {
      throw new BadRequestException('Unknown action — use approve-internal, sent, approved or rejected');
    }
    return this.one(id);
  }

  /** Deep copy as a fresh draft dated today — quotations.js:1452-1459. */
  @Post(':id/duplicate')
  @Roles('admin', 'ops', 'sales')
  async duplicate(@Param('id') id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!q) throw new NotFoundException('No such quotation');

    const seq = await this.prisma.seq.upsert({
      where: { key: 'quote' },
      create: { key: 'quote', value: 1001 },
      update: { value: { increment: 1 } },
    });
    const copy = await this.prisma.quotation.create({
      data: {
        id: 'QT-' + seq.value,
        clientId: q.clientId,
        leadId: q.leadId,
        date: todayISO(),
        status: 'draft',
        mode: q.mode,
        months: q.months,
        freq: q.freq,
        title: q.title,
        refNo: q.refNo,
        placeOfSupply: q.placeOfSupply,
        branch: q.branch,
        owner: q.owner,
        discount: q.discount,
        advancePct: q.advancePct,
        notes: q.notes,
        terms: q.terms,
        signCustomer: q.signCustomer,
        signExec: q.signExec,
        contractId: '', // the copy is unconverted — quotations.js:1457
        items: {
          create: q.items.map((i, n) => ({
            svId: i.svId, desc: i.desc, qty: i.qty, rate: i.rate,
            visits: i.visits, months: i.months, order: n,
          })),
        },
      } as never,
      include: { items: { orderBy: { order: 'asc' } } },
    });
    return composeQuote(this.prisma, copy as unknown as QuoteRow);
  }

  /* -------------------------------------------------------------- helpers */

  /** Raising a quotation on a lead moves it to 'quoted' — quotations.js:611. */
  private async leadOnRaise(leadId: string) {
    if (!leadId) return;
    const l = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (l && l.stage !== 'won') {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { stage: 'quoted', followUp: '' },
      });
    }
  }

  /** The owner's on-file signature wins over a drawn one — quotations.js:606-607. */
  private async execSign(owner: string, drawn: string, previous = '') {
    const u = owner ? await this.prisma.user.findUnique({ where: { id: owner } }) : null;
    return (u && u.sign) || drawn || previous;
  }
}
