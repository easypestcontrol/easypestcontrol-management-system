import { BadRequestException, Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';

/** Personal + broadcast notifications for the topbar bell. */
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: { user: { sub: string } }) {
    const rows = await this.prisma.notification.findMany({
      where: { OR: [{ userId: req.user.sub }, { userId: '' }] },
      orderBy: { id: 'desc' },
      take: 25,
    });
    return { rows, unread: rows.filter((r) => !r.read).length };
  }

  @Post('read-all')
  async readAll(@Req() req: { user: { sub: string } }) {
    await this.prisma.notification.updateMany({
      where: { OR: [{ userId: req.user.sub }, { userId: '' }], read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}

/** The phones. The app registers its FCM token after login; the push watcher
    fans every notification out to these. Logout removes the address. */
@Controller('devices')
@UseGuards(AuthGuard)
export class DevicesController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async register(@Body() body: Record<string, unknown>, @Req() req: { user: { sub: string } }) {
    const token = String(body.token || '').trim();
    if (!token) throw new BadRequestException('No device token');
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    await this.prisma.device.upsert({
      where: { token },
      create: {
        userId: req.user.sub, token,
        platform: String(body.platform || 'android'),
        at: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
      },
      // A shared phone re-homes to whoever logged in last.
      update: { userId: req.user.sub },
    });
    return { ok: true };
  }

  @Delete()
  async remove(
    @Body() body: Record<string, unknown>,
    @Query('token') qtoken: string | undefined,
    @Req() req: { user: { sub: string } },
  ) {
    const token = String(qtoken || body?.token || '').trim();
    if (token) {
      await this.prisma.device.deleteMany({ where: { token, userId: req.user.sub } });
    }
    return { ok: true };
  }
}
