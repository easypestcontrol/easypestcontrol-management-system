/* ============================================================================
   Service Catalogue — "what services do you provide?"

   Ported from v1 assets/js/views/services.js. Only admin and ops maintain the
   catalogue; everyone signed in can read it (services.js:19-21). Save defaults
   are the v1 save handler exactly (services.js:218-236): code defaults to the
   first three letters uppercased, price parses to 0, minutes to 60. Delete is
   blocked with a reference count while jobs, contracts or quotations still
   name the service (services.js:29-70); v1 also counted leads.interest, but
   v2 leads carry no interest column — noted in the module's deferred list.

   The information sheet is a PDF stored as a data URL (≤1.5 MB, the v1
   MAX_PDF_KB), auto-attached to quotations by the quotations module.
   ========================================================================== */
import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  NotFoundException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

const MAX_PDF_KB = 1500; // v1 services.js:14

const EDITABLE = [
  'code', 'name', 'cat', 'price', 'unit', 'mins', 'warranty', 'chem', 'desc', 'pdf',
] as const;

const CATS = ['Residential', 'Commercial', 'Industrial', 'Specialised'];

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  return data;
}

/** Coerce the numeric fields the way v1 did: parseFloat||0 and parseInt||60. */
function coerce(data: Record<string, unknown>) {
  if ('price' in data) data.price = Math.round(Number(data.price)) || 0;
  if ('mins' in data) data.mins = parseInt(String(data.mins), 10) || 60;
  if ('code' in data) data.code = String(data.code || '').trim();
  if ('name' in data) data.name = String(data.name || '').trim();
  if ('chem' in data) {
    data.chem = Array.isArray(data.chem) ? data.chem.map(String).filter(Boolean) : [];
  }
  if ('cat' in data && !CATS.includes(String(data.cat))) data.cat = 'Residential';
  if ('pdf' in data) data.pdf = checkPdf(data.pdf);
  return data;
}

/** A sheet must actually be a PDF, and small enough to live in a row. */
function checkPdf(v: unknown): string {
  const data = String(v || '');
  if (!data) return '';
  if (!data.startsWith('data:application/pdf')) {
    throw new BadRequestException('That is not a PDF — choose a .pdf file');
  }
  const b64 = data.slice(data.indexOf(',') + 1);
  const bytes = Math.floor(b64.length * 3 / 4);
  if (bytes > MAX_PDF_KB * 1024) {
    throw new BadRequestException(`PDF is too large — keep it under ${MAX_PDF_KB / 1000} MB`);
  }
  return data;
}

@Controller('services')
@UseGuards(AuthGuard)
export class CatalogueController {
  constructor(private prisma: PrismaService) {}

  /** Everything already pointing at a service — a delete would orphan it. */
  private async referencesTo(sid: string) {
    const [jobs, lines, items] = await Promise.all([
      this.prisma.job.count({ where: { serviceIds: { has: sid } } }),
      this.prisma.planLine.findMany({ where: { svId: sid }, select: { contractId: true } }),
      this.prisma.quoteItem.findMany({ where: { svId: sid }, select: { quoteId: true } }),
    ]);
    const contracts = new Set(lines.map((l) => l.contractId)).size;
    const quotes = new Set(items.map((i) => i.quoteId)).size;
    const out: string[] = [];
    if (jobs) out.push(`${jobs} job${jobs === 1 ? '' : 's'}`);
    if (contracts) out.push(`${contracts} contract${contracts === 1 ? '' : 's'}`);
    if (quotes) out.push(`${quotes} quotation${quotes === 1 ? '' : 's'}`);
    return out;
  }

  /* ------------------------------------------------------------------ list */
  @Get()
  async list(@Query('cat') cat?: string, @Query('q') q?: string) {
    const [services, jobs] = await Promise.all([
      this.prisma.service.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.job.findMany({ select: { serviceIds: true } }),
    ]);
    const used = new Map<string, number>();
    for (const j of jobs) for (const sid of j.serviceIds) used.set(sid, (used.get(sid) || 0) + 1);

    const needle = (q || '').toLowerCase();
    return services
      .filter((s) => (!cat || cat === 'All' || s.cat === cat) &&
        (!needle || (s.name + s.code + s.desc).toLowerCase().includes(needle)))
      .map((s) => ({ ...s, used: used.get(s.id) || 0 }));
  }

  /** Inventory items for the "chemicals used" picker in the editor. */
  @Get('chemicals')
  chemicals() {
    return this.prisma.inventoryItem.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, cat: true, unit: true },
    });
  }

  /* ---------------------------------------------------------------- detail */
  @Get(':id')
  async one(@Param('id') id: string) {
    const s = await this.prisma.service.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('No such service');
    const [used, chems] = await Promise.all([
      this.prisma.job.count({ where: { serviceIds: { has: id } } }),
      this.prisma.inventoryItem.findMany({
        where: { id: { in: s.chem } },
        select: { id: true, name: true, cat: true, unit: true },
      }),
    ]);
    return { ...s, used, chems };
  }

  /* ---------------------------------------------------------------- create */
  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Service name is required');

    // Next free SV-id; scan past seeded ids the sequence never counted.
    let id = '';
    for (;;) {
      const seq = await this.prisma.seq.upsert({
        where: { key: 'service' },
        create: { key: 'service', value: 1 },
        update: { value: { increment: 1 } },
      });
      id = 'SV' + String(seq.value).padStart(2, '0');
      const clash = await this.prisma.service.findUnique({ where: { id }, select: { id: true } });
      if (!clash) break;
    }

    const data = coerce(pick(body));
    return this.prisma.service.create({
      data: {
        id,
        chem: [],
        unit: 'per visit',
        ...data,
        name,
        // v1 services.js:224 — code defaults to the name's first three letters
        code: String(data.code || '') || name.slice(0, 3).toUpperCase(),
      } as never,
    });
  }

  /* ---------------------------------------------------------------- update */
  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const s = await this.prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('No such service');
    const data = coerce(pick(body));
    if ('name' in data) {
      if (!data.name) throw new BadRequestException('Service name is required');
      if (!data.code) data.code = String(data.name).slice(0, 3).toUpperCase();
    }
    return this.prisma.service.update({ where: { id }, data });
  }

  /* ----------------------------------------------------------------- sheet */
  @Post(':id/sheet')
  @Roles('admin', 'ops')
  async attachSheet(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const pdf = checkPdf(body.data);
    if (!pdf) throw new BadRequestException('That is not a PDF — choose a .pdf file');
    const s = await this.prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('No such service');
    return this.prisma.service.update({ where: { id }, data: { pdf } });
  }

  @Delete(':id/sheet')
  @Roles('admin', 'ops')
  async removeSheet(@Param('id') id: string) {
    const s = await this.prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('No such service');
    return this.prisma.service.update({ where: { id }, data: { pdf: '' } });
  }

  /* ---------------------------------------------------------------- delete */
  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const s = await this.prisma.service.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('No such service');
    const used = await this.referencesTo(id);
    if (used.length) {
      // v1 services.js:52-56 — the toast wording, verbatim
      throw new ConflictException(
        `Cannot remove ${s.name} — still used by ${used.join(', ')}. Edit it instead of deleting.`,
      );
    }
    await this.prisma.service.delete({ where: { id } });
    return { ok: true };
  }
}
