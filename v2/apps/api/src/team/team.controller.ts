/* ============================================================================
   Team — the staff directory and employee record (HR master data).

   Ported from v1 assets/js/views/team.js. The validation gate is the v1 save
   handler verbatim (team.js:269-328): name + phone, at least one branch,
   aadhaar must be 12 digits when given, at least one emergency contact with
   both name and phone. Designation auto-follows the role default while it is
   still unedited (DEFAULT_TITLE, team.js:10). Members are deactivated, never
   deleted — their id is stamped on jobs, quotes and contracts.

   v2 additions over v1: passwords (default 'pestops123', bcrypt), an active
   flag, and the working-hours editor the parity doc asks for ("no editor UI
   in v1" — V2_PARITY.md §1.5 hours).

   The fake onTime stat (88 + charCodeAt trick, team.js:27) is dropped, per
   parity item 3: compute honestly or drop.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { isFieldTech } from 'shared';
import { branchScope, clampScope } from '../branch.util';

/**
 * A fresh password for a new member, shown to the admin once and never stored
 * in the clear.
 *
 * It used to be a constant every account shared, which is fine for a demo and
 * indefensible in production: the value sits in the source, so knowing one
 * person's email is knowing their password. Random per member closes that, and
 * because nobody can read it back afterwards, a forgotten password is reset
 * rather than looked up.
 *
 * No l/1/I or O/0 — this gets read off a screen and typed on a phone.
 */
const PW_ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
function freshPassword(): string {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
}

/** v1 team.js:10 — designation defaults per role. */
const DEFAULT_TITLE: Record<string, string> = {
  admin: 'Administrator',
  ops: 'Operations Manager',
  sales: 'Sales Executive',
  tech: 'Technician',
  accounts: 'Accounts Executive',
};

/** v1 team.js:298 — avatar colors handed out by index. */
const PALETTE = ['#0B7454', '#7C3AED', '#2E90FA', '#F79009', '#12B76A', '#F04438', '#DB2777'];

const EDITABLE = [
  'name', 'phone', 'email', 'role', 'title', 'dob', 'blood', 'aadhaar', 'addr',
  'empType', 'joined', 'skills', 'branches', 'photo', 'sign', 'emergency',
  'hoursFrom', 'hoursTo', 'hoursDays', 'color', 'active',
] as const;

function pick(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) data[k] = body[k];
  return data;
}

interface EmergencyContact { name: string; relation: string; phone: string }
interface ExecRec { rating?: number; durationMins?: number; findings?: string[] }

/** Local date, not UTC — "today" on an IST server is the IST day. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** v1 team.js:289-295 — keep only contacts with both a name and a phone. */
function validEmergency(list: unknown): EmergencyContact[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => ({
      name: String((e as Record<string, unknown>)?.name || '').trim(),
      relation: String((e as Record<string, unknown>)?.relation || 'Father'),
      phone: String((e as Record<string, unknown>)?.phone || '').trim(),
    }))
    .filter((e) => e.name && e.phone);
}

/** Never ship password hashes to the browser. */
function sansPassword<T extends { password?: string }>(u: T) {
  const { password, ...rest } = u;
  void password;
  return rest;
}

@Controller('team')
@UseGuards(AuthGuard)
export class TeamController {
  constructor(private prisma: PrismaService) {}

  /* ------------------------------------------------------------------ list */
  @Get()
  async list(
    @Req() req: { user?: { sub?: string; role?: string } },
    @Query('branchId') branchId?: string,
    @Query('branch') branchQ?: string,
  ) {
    const scope = clampScope(
      await branchScope(this.prisma, req.user), branchQ || branchId);
    const [members, jobs] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: { not: 'client' },
          ...(scope === null ? {} : { branches: { hasSome: scope } }),
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.job.findMany({ select: { date: true, status: true, techIds: true, exec: true } }),
    ]);

    const today = todayISO();
    const rows = members
      .map(sansPassword)
      .map((u) => {
        if (!isFieldTech(u.role)) return { ...u, perf: null };
        const mine = jobs.filter((j) => j.techIds.includes(u.id));
        const done = mine.filter((j) => j.status === 'completed');
        const todayJobs = mine.filter((j) => j.date === today);
        const rated = done
          .map((j) => (j.exec as ExecRec | null)?.rating || 0)
          .filter((r) => r > 0);
        return {
          ...u,
          perf: {
            total: mine.length,
            done: done.length,
            today: todayJobs.length,
            todayDone: todayJobs.filter((j) => j.status === 'completed').length,
            open: mine.length - done.length,
            rating: rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : u.rating || 0,
            ratedN: rated.length,
          },
        };
      });

    return {
      members: rows,
      unposted: members.filter((u) => u.active && !u.branches.length).length,
    };
  }

  /* ---------------------------------------------------------------- detail */
  @Get(':id')
  async one(@Param('id') id: string) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found || found.role === 'client') throw new NotFoundException('No such team member');
    const u = sansPassword(found);
    if (!isFieldTech(u.role)) return { ...u, perf: null, todayJobs: [], doneJobs: [] };

    const jobs = await this.prisma.job.findMany({
      where: { techIds: { has: id } },
      orderBy: { date: 'desc' },
      select: {
        id: true, clientId: true, date: true, slot: true, status: true,
        serviceIds: true, exec: true,
      },
    });
    const clients = await this.prisma.client.findMany({
      where: { id: { in: [...new Set(jobs.map((j) => j.clientId))] } },
      select: { id: true, name: true },
    });
    const clientName = new Map(clients.map((c) => [c.id, c.name]));

    const today = todayISO();
    const done = jobs.filter((j) => j.status === 'completed');
    const todayJobs = jobs.filter((j) => j.date === today);
    const rated = done.map((j) => (j.exec as ExecRec | null)?.rating || 0).filter((r) => r > 0);
    const mins = done.reduce((s, j) => s + ((j.exec as ExecRec | null)?.durationMins || 0), 0);

    return {
      ...u,
      perf: {
        total: jobs.length,
        done: done.length,
        today: todayJobs.length,
        todayDone: todayJobs.filter((j) => j.status === 'completed').length,
        open: jobs.length - done.length,
        rating: rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : u.rating || 0,
        ratedN: rated.length,
        hours: Math.round(mins / 60),
      },
      todayJobs: todayJobs
        .sort((a, b) => a.slot.localeCompare(b.slot))
        .map((j) => ({
          id: j.id, clientName: clientName.get(j.clientId) || j.clientId,
          slot: j.slot, status: j.status,
        })),
      doneJobs: done.slice(0, 10).map((j) => {
        const ex = j.exec as ExecRec | null;
        return {
          id: j.id, clientName: clientName.get(j.clientId) || j.clientId, date: j.date,
          durationMins: ex?.durationMins || 0,
          findings: ex?.findings || [],
          rating: ex?.rating || 0,
        };
      }),
    };
  }

  /* ---------------------------------------------------------------- create */
  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || !phone) throw new BadRequestException('Full name and phone are required');

    const branches = Array.isArray(body.branches) ? body.branches.map(String).filter(Boolean) : [];
    if (!branches.length) {
      throw new BadRequestException('Select at least one branch — a member must be posted to a branch');
    }

    const aadhaar = String(body.aadhaar || '').trim();
    if (aadhaar && aadhaar.replace(/\D/g, '').length !== 12) {
      throw new BadRequestException('Aadhaar number must be 12 digits');
    }

    const emergency = validEmergency(body.emergency);
    if (!emergency.length) {
      throw new BadRequestException('One emergency contact is required — name and phone number are both needed');
    }

    const role = DEFAULT_TITLE[String(body.role || '')] ? String(body.role) : 'tech';
    const tempPassword = freshPassword();

    // Mint the next free U-id. Seeded ids were not counted into the sequence,
    // so scan past collisions the way v1's nextBranchId did (masterdata.js:21-26).
    let id = '';
    let n = 0;
    for (;;) {
      const seq = await this.prisma.seq.upsert({
        where: { key: 'user' },
        create: { key: 'user', value: 1 },
        update: { value: { increment: 1 } },
      });
      n = seq.value;
      id = 'U' + String(n).padStart(2, '0');
      const clash = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!clash) break;
    }

    // Email is unique in v2 (it is the login); v1 allowed it to be blank.
    const email = String(body.email || '').trim().toLowerCase() || `${id.toLowerCase()}@pestops.local`;

    return this.prisma.user.create({
      data: {
        id,
        name,
        phone,
        email,
        role: role as never,
        title: String(body.title || '').trim() || DEFAULT_TITLE[role] || 'Team member',
        password: await bcrypt.hash(tempPassword, 10),
        color: PALETTE[(n - 1) % PALETTE.length],
        joined: String(body.joined || '').trim() || todayISO(),
        dob: String(body.dob || ''),
        blood: String(body.blood || ''),
        aadhaar,
        addr: String(body.addr || '').trim(),
        empType: String(body.empType || 'Full-time'),
        skills: Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim()).filter(Boolean) : [],
        branches,
        photo: String(body.photo || ''),
        sign: String(body.sign || ''),
        emergency: emergency as never,
        hoursFrom: String(body.hoursFrom || ''),
        hoursTo: String(body.hoursTo || ''),
        hoursDays: Array.isArray(body.hoursDays) ? body.hoursDays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
        rating: 0,
        jobsDone: 0,
      } as never,
    }).then(sansPassword)
      // The one moment this is readable. It is not stored anywhere in the
      // clear, so if the admin loses it the answer is to set a new one.
      .then((u) => ({ ...u, tempPassword }));
  }

  /* ---------------------------------------------------------------- update */
  @Patch(':id')
  @Roles('admin', 'ops')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role === 'client') throw new NotFoundException('No such team member');

    const data = pick(body);

    if ('name' in data && !String(data.name || '').trim()) {
      throw new BadRequestException('Full name and phone are required');
    }
    if ('phone' in data && !String(data.phone || '').trim()) {
      throw new BadRequestException('Full name and phone are required');
    }
    if ('branches' in data) {
      const branches = Array.isArray(data.branches) ? data.branches.map(String).filter(Boolean) : [];
      if (!branches.length) {
        throw new BadRequestException('Select at least one branch — a member must be posted to a branch');
      }
      data.branches = branches;
    }
    if ('aadhaar' in data) {
      const aad = String(data.aadhaar || '').trim();
      if (aad && aad.replace(/\D/g, '').length !== 12) {
        throw new BadRequestException('Aadhaar number must be 12 digits');
      }
      data.aadhaar = aad;
    }
    if ('emergency' in data) {
      const kin = validEmergency(data.emergency);
      if (!kin.length) {
        throw new BadRequestException('One emergency contact is required — name and phone number are both needed');
      }
      data.emergency = kin as never;
    }
    if ('skills' in data) {
      data.skills = Array.isArray(data.skills)
        ? data.skills.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }
    if ('role' in data && !DEFAULT_TITLE[String(data.role)]) {
      throw new BadRequestException('Not a staff role');
    }
    if ('hoursDays' in data) {
      data.hoursDays = Array.isArray(data.hoursDays)
        ? data.hoursDays.map(Number).filter((d) => d >= 0 && d <= 6)
        : [];
    }
    if ('active' in data) data.active = !!data.active;
    // Blank email would collide with the next blank email — leave it unchanged.
    if ('email' in data) {
      const email = String(data.email || '').trim().toLowerCase();
      if (email) data.email = email;
      else delete data.email;
    }
    // Designation keeps following the role default while it is still a default
    // (v1 team.js:224-226, 313).
    if ('title' in data || 'role' in data) {
      const role = String(data.role ?? existing.role);
      const t = String(data.title ?? existing.title).trim();
      const isDefault = !t || Object.values(DEFAULT_TITLE).includes(t);
      data.title = isDefault ? DEFAULT_TITLE[role] || 'Team member' : t;
    }

    return this.prisma.user.update({ where: { id }, data }).then(sansPassword);
  }

  /* -------------------------------------------------------------- password */
  @Post(':id/password')
  @Roles('admin', 'ops')
  async setPassword(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const password = String(body.password || '');
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw new NotFoundException('No such team member');
    await this.prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }
}
