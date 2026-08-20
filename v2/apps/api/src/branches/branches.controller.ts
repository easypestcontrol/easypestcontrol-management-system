/* ============================================================================
   Branches — the territory map the rest of PestOps routes on.

   Ported from v1 assets/js/views/masterdata.js (branch tab) and the territory
   matcher in store.js:152-190. A branch carries the localities it covers;
   those areas drive customer→branch and lead→branch mapping. Save rules are
   the v1 handler (masterdata.js:65-96): name + code required, code uppercased
   and unique case-insensitively, areas comma-split and deduped ignoring case.
   Delete stays blocked while staff are posted there — records already tagged
   to a removed branch keep the tag (masterdata.js:99-116).

   The v2 Branch row is leaner than v1's (no city/addr/pin/email/gstin/
   manager/opened/active columns), so resolve()'s third pass matches on the
   branch name only, and every branch counts as operating.
   ========================================================================== */
import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  NotFoundException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

const EDITABLE = ['name', 'code', 'phone', 'areas'] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  return data;
}

/** v1 store.js:153 — loose text key so "besant nagar" matches "Besant Nagar, Chennai". */
function areaKey(v: unknown) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Trim, drop blanks, dedupe ignoring case — v1 masterdata.js:74-76. */
function cleanAreas(v: unknown): string[] {
  const list = Array.isArray(v) ? v.map(String) : String(v || '').split(',');
  return list
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
}

@Controller('branches')
@UseGuards(AuthGuard)
export class BranchesController {
  constructor(private prisma: PrismaService) {}

  /** People posted to a branch — v1 store.js:131-135 branchStaff. */
  private async staffCount(branchId: string) {
    return this.prisma.user.count({
      where: { role: { not: 'client' }, branches: { has: branchId } },
    });
  }

  /* ------------------------------------------------------------------ list */
  @Get()
  async list() {
    const [branches, users, leads] = await Promise.all([
      this.prisma.branch.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.user.findMany({
        where: { role: { not: 'client' } },
        select: { branches: true },
      }),
      this.prisma.lead.findMany({ select: { branch: true } }),
    ]);
    return branches.map((b) => ({
      ...b,
      staff: users.filter((u) => u.branches.includes(b.id)).length,
      leads: leads.filter((l) => l.branch === b.id).length,
    }));
  }

  /* --------------------------------------------------------------- resolve */
  /**
   * Which branch looks after this locality — v1 branchForArea (store.js:169-190).
   * Pass 1: exact area match. Pass 2: substring either way ("Adyar" finds
   * "Adyar West"). Pass 3: the branch's own name. Null when nobody covers it.
   */
  @Get('resolve')
  async resolve(@Query('area') area?: string) {
    const k = areaKey(area);
    if (!k) return { branch: null };
    const list = await this.prisma.branch.findMany({ orderBy: { id: 'asc' } });

    let hit = list.find((b) => b.areas.some((a) => areaKey(a) === k));
    if (!hit) {
      hit = list.find((b) => b.areas.some((a) => {
        const ak = areaKey(a);
        return !!ak && (ak.includes(k) || k.includes(ak));
      }));
    }
    if (!hit) {
      hit = list.find((b) => {
        const nk = areaKey(b.name);
        return !!nk && nk.includes(k);
      });
    }
    return { branch: hit || null };
  }

  /* ---------------------------------------------------------------- detail */
  @Get(':id')
  async one(@Param('id') id: string) {
    const b = await this.prisma.branch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('No such branch');
    const staff = await this.prisma.user.findMany({
      where: { role: { not: 'client' }, branches: { has: id } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, role: true, title: true, color: true, photo: true, active: true },
    });
    return { ...b, staffList: staff, staff: staff.length };
  }

  /* ---------------------------------------------------------------- create */
  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim().toUpperCase().slice(0, 6);
    if (!name || !code) throw new BadRequestException('Branch name and short code are required');

    const all = await this.prisma.branch.findMany({ select: { id: true, name: true, code: true } });
    const clash = all.find((x) => x.code.toUpperCase() === code);
    if (clash) throw new ConflictException(`That short code is already used by ${clash.name}`);

    // First free BR-NN, exactly v1's nextBranchId scan (masterdata.js:21-26).
    let id = '';
    for (;;) {
      const seq = await this.prisma.seq.upsert({
        where: { key: 'branch' },
        create: { key: 'branch', value: 1 },
        update: { value: { increment: 1 } },
      });
      id = 'BR-' + String(seq.value).padStart(2, '0');
      if (!all.some((b) => b.id === id)) break;
    }

    return this.prisma.branch.create({
      data: {
        id,
        name,
        code,
        phone: String(body.phone || '').trim(),
        areas: cleanAreas(body.areas),
      },
    });
  }

  /* ---------------------------------------------------------------- update */
  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const b = await this.prisma.branch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('No such branch');

    const data = pick(body);
    if ('name' in data && !String(data.name || '').trim()) {
      throw new BadRequestException('Branch name and short code are required');
    }
    if ('code' in data) {
      const code = String(data.code || '').trim().toUpperCase().slice(0, 6);
      if (!code) throw new BadRequestException('Branch name and short code are required');
      const clash = await this.prisma.branch.findFirst({
        where: { id: { not: id }, code: { equals: code, mode: 'insensitive' } },
        select: { name: true },
      });
      if (clash) throw new ConflictException(`That short code is already used by ${clash.name}`);
      data.code = code;
    }
    if ('name' in data) data.name = String(data.name).trim();
    if ('phone' in data) data.phone = String(data.phone || '').trim();
    if ('areas' in data) data.areas = cleanAreas(data.areas);

    return this.prisma.branch.update({ where: { id }, data });
  }

  /* ---------------------------------------------------------------- delete */
  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const b = await this.prisma.branch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('No such branch');
    const staff = await this.staffCount(id);
    if (staff) {
      // v1 masterdata.js:100-106 — blocked, no cascade
      throw new ConflictException(
        `Cannot remove ${b.name} — ${staff} team member${staff === 1 ? ' is' : 's are'} still posted there`,
      );
    }
    await this.prisma.branch.delete({ where: { id } });
    return { ok: true };
  }
}
