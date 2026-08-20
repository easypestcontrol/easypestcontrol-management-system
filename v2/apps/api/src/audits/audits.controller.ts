import {
  Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, clampScope } from '../branch.util';

/**
 * Site audits — the periodic hygiene walk-through a commercial customer gets.
 * A score out of 100, a findings list, open until every finding is closed.
 */
@Controller('audits')
@UseGuards(AuthGuard)
export class AuditsController {
  constructor(private prisma: PrismaService) {}

  // The list is the whole book. A technician needs the one record his own
  // screens link to, never the ledger — so the collection is gated and the
  // detail below is not.
  @Get()
  @Roles('admin', 'ops')
  async list(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('branch') branch?: string,
  ) {
    // Audits carry no branch column — they follow their customer.
    const scope = clampScope(await branchScope(this.prisma, req.user), branch);
    const rows = await this.prisma.audit.findMany({ orderBy: { date: 'desc' } });
    if (scope === null) return rows;
    const ok = new Set(
      (await this.prisma.client.findMany({
        where: { branch: { in: scope } }, select: { id: true },
      })).map((c) => c.id),
    );
    return rows.filter((a) => ok.has(a.clientId));
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const a = await this.prisma.audit.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('No such audit');
    return a;
  }

  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: {
    clientId: string; date: string; auditor?: string; score?: number;
    findings?: Array<{ area: string; note: string; severity: string; closed?: boolean }>;
  }) {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'audit' },
      create: { key: 'audit', value: 120 },
      update: { value: { increment: 1 } },
    });
    return this.prisma.audit.create({
      data: {
        id: 'AUD-' + seq.value,
        clientId: body.clientId,
        date: body.date,
        auditor: body.auditor || '',
        score: Math.max(0, Math.min(100, body.score || 0)),
        status: 'open',
        findings: (body.findings || []) as never,
      },
    });
  }

  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const k of ['date', 'auditor', 'score', 'status', 'findings']) {
      if (k in body) data[k] = k === 'findings' ? (body[k] as never) : body[k];
    }
    // Closing the last finding closes the audit; reopening one reopens it.
    if (Array.isArray(body.findings)) {
      const open = (body.findings as Array<{ closed?: boolean }>).some((f) => !f.closed);
      data.status = open ? 'open' : 'closed';
    }
    return this.prisma.audit.update({ where: { id }, data });
  }
}
