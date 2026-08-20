import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { open, seal } from '../secrets.util';

/**
 * The organisation: company profile, the logo the sidebar shows, branches,
 * the service catalogue and the team roster. Everything a screen needs to
 * paint names and colors comes from here in one call (GET /api/org/bootstrap).
 */
@Controller('org')
@UseGuards(AuthGuard)
export class OrgController {
  constructor(private prisma: PrismaService) {}

  @Get('bootstrap')
  async bootstrap() {
    const [company, branches, users, services] = await Promise.all([
      this.prisma.company.findFirst(),
      this.prisma.branch.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.user.findMany({
        where: { active: true },
        orderBy: { id: 'asc' },
        // never ship password hashes to the browser
        select: {
          id: true, name: true, role: true, title: true, phone: true, email: true,
          color: true, skills: true, branches: true, photo: true, sign: true,
          hoursFrom: true, hoursTo: true, hoursDays: true, rating: true, jobsDone: true,
        },
      }),
      this.prisma.service.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return { company, branches, users, services };
  }

  /** Which third-party connections exist — safe for any signed-in screen. */
  @Get('integrations')
  async integrations() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    return { ola: !!ig.olaKey, razorpay: !!(ig.rzpKeyId && ig.rzpKeySecret) };
  }

  /** The map component needs the key client-side to fetch Ola tiles. */
  @Get('integrations/ola')
  async olaKey() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    return { key: open(ig.olaKey) };
  }

  /** Admin pastes the keys; blanks leave the stored value untouched.
      Everything is sealed before it touches the database. */
  @Patch('integrations')
  @Roles('admin')
  async setIntegrations(@Body() body: Record<string, unknown>) {
    const co = await this.prisma.company.findFirst();
    if (!co) return { ok: false };
    const ig = { ...((co.integrations || {}) as Record<string, string>) };
    for (const k of ['olaKey', 'olaClientId', 'olaClientSecret', 'rzpKeyId', 'rzpKeySecret'] as const) {
      const v = String(body[k] ?? '').trim();
      if (v) ig[k] = seal(v);
      if (body[k] === null) delete ig[k]; // explicit null disconnects
    }
    await this.prisma.company.update({ where: { id: co.id }, data: { integrations: ig as never } });
    return { ola: !!ig.olaKey, razorpay: !!(ig.rzpKeyId && ig.rzpKeySecret) };
  }

  /** The stored operational keys, decrypted — admin's eyes only, fetched only
      when the reveal icon is pressed. */
  @Get('integrations/reveal')
  @Roles('admin')
  async revealIntegrations() {
    const co = await this.prisma.company.findFirst();
    const ig = (co?.integrations || {}) as Record<string, string>;
    return {
      olaKey: open(ig.olaKey),
      rzpKeyId: open(ig.rzpKeyId),
      rzpKeySecret: open(ig.rzpKeySecret),
    };
  }

  @Patch('company')
  @Roles('admin', 'ops')
  updateCompany(@Body() body: Record<string, unknown>) {
    const allowed = [
      'name', 'tagline', 'phone', 'email', 'gstin', 'addr', 'city', 'state', 'pin',
      'gstRate', 'logo', 'hoursFrom', 'hoursTo', 'hoursDays', 'terms', 'docTerms', 'roleAccess',
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) data[k] = body[k];
    return this.prisma.company.update({ where: { id: 'co' }, data });
  }
}
