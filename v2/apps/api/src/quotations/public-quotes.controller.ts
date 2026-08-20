/* ============================================================================
   The public face of a quotation — what the WhatsApp link opens.

   No login, no shell: the customer taps the link, reads the document, and
   accepts or declines. Ported from v1 V.approve (quotations.js:1476-1622).
   Deliberately read-only except for the one decision endpoint.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Post,
  Query, Res, UseGuards,
} from '@nestjs/common';
import { addDays, daysBetween } from 'shared';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Public } from '../auth/auth.guard';
import { composeQuote, nowStamp, todayISO, type QuoteRow } from './shape';

@Controller('public/quotes')
@UseGuards(AuthGuard)
export class PublicQuotesController {
  constructor(private prisma: PrismaService) {}

  /**
   * The whole document in one payload: quotation, lines with catalogue names,
   * party block, company block. v2 has no `valid` column, so validity is
   * fixed at date + 15 days — v1's default (quotations.js:269, Seed.D(15)).
   */
  @Public()
  @Get(':id')
  async one(@Param('id') id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!q) throw new NotFoundException('No such quotation');
    const [composed, co] = await Promise.all([
      composeQuote(this.prisma, q as unknown as QuoteRow),
      this.prisma.company.findFirst(),
    ]);
    return {
      ...composed,
      valid: addDays(q.date, 15),
      company: co
        ? {
            name: co.name, tagline: co.tagline, phone: co.phone, email: co.email,
            gstin: co.gstin, addr: co.addr, city: co.city, state: co.state,
            pin: co.pin, gstRate: co.gstRate, logo: co.logo, terms: co.terms,
          }
        : null,
    };
  }

  /**
   * The customer's decision — v1 decide() (quotations.js:1556-1577):
   *   - status flips to approved/rejected
   *   - a decline note is appended to the quotation's notes
   *   - the lead moves to 'contract' or 'lost' (no won-guard here, unlike the
   *     staff action — v1 is unconditional on this path)
   *   - the lead log gets an entry with an empty `by` (it was the customer)
   * The first decision stands; a second tap returns the document unchanged.
   */
  /**
   * One service information sheet, streamed as a plain PDF so the approve
   * page can preview it inline with the browser chrome switched off.
   */
  @Public()
  @Get(':id/sheet/:svId')
  async sheet(
    @Param('id') id: string,
    @Param('svId') svId: string,
    @Res() res: import('express').Response,
    @Query('dl') dl?: string,
  ) {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { items: true } });
    if (!q || !q.items.some((i) => i.svId === svId)) {
      res.status(404).json({ message: 'No such sheet on this quotation' });
      return;
    }
    const sv = await this.prisma.service.findUnique({ where: { id: svId } });
    const dataUrl = sv?.pdf || '';
    const b64 = dataUrl.split('base64,')[1] || '';
    if (!b64) { res.status(404).json({ message: 'No sheet uploaded for this service' }); return; }
    const buf = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', (dl === '1' ? 'attachment' : 'inline') + '; filename="' + (sv?.name || 'sheet').replace(/[^\w -]/g, '') + '.pdf"');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }

  @Public()
  @Post(':id/decision')
  async decide(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const decision = String(body.decision || '');
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new BadRequestException('decision must be approved or rejected');
    }
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('No such quotation');
    if (q.status === 'approved' || q.status === 'rejected') return this.one(id);
    if (daysBetween(todayISO(), addDays(q.date, 15)) < 0) {
      throw new BadRequestException('This quotation has expired — ask us for a fresh one');
    }

    const note = String(body.note || '').trim();
    const notes =
      decision === 'rejected' && note
        ? (q.notes ? q.notes + '\n\n' : '') + 'Declined by customer: ' + note
        : q.notes;
    await this.prisma.quotation.update({
      where: { id },
      data: { status: decision, notes },
    });

    // The office hears the customer's answer the moment it lands.
    const office = await this.prisma.user.findMany({
      where: { role: { in: ['admin', 'ops', 'sales'] } },
    });
    await this.prisma.notification.createMany({
      data: office.map((u) => ({
        userId: u.id, at: nowStamp(),
        text: decision === 'approved'
          ? `Customer accepted ${q.id} — ready to convert to a contract.`
          : `Customer declined ${q.id}${note ? ' — ' + note : ''}.`,
      })),
    });

    if (q.leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: q.leadId } });
      if (l) {
        const log = Array.isArray(l.log) ? (l.log as unknown[]) : [];
        log.unshift({
          at: nowStamp(),
          text:
            decision === 'approved'
              ? 'Customer accepted ' + q.id + ' from the shared link'
              : 'Customer declined ' + q.id + (note ? ' — ' + note : ''),
          by: '',
        });
        await this.prisma.lead.update({
          where: { id: l.id },
          data: {
            stage: decision === 'approved' ? 'contract' : 'lost',
            log: log as never,
          },
        });
      }
    }
    return this.one(id);
  }
}
