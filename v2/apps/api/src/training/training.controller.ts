/* ============================================================================
   Training / knowledge base — admin uploads lessons (text, a video file, or
   an external link) targeted at a role; each person sees their role's lessons.
   Video files live on disk under uploads/training and stream with Range
   support so the player can seek.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

const ROLES = ['all', 'tech', 'sales', 'ops', 'accounts', 'admin'];
const VIDEO_DIR = path.join(process.cwd(), 'uploads', 'training');
const MAX_VIDEO = 100 * 1024 * 1024; // 100 MB

interface Jwt { user?: { sub?: string; role?: string } }

@Controller('training')
@UseGuards(AuthGuard)
export class TrainingController {
  constructor(private prisma: PrismaService) {}

  /** Lessons for me — managers see everything (they maintain the library). */
  @Get()
  async list(@Req() req: Request & Jwt) {
    const role = req.user?.role || '';
    const manage = role === 'admin' || role === 'ops';
    const rows = await this.prisma.training.findMany({
      where: manage ? {} : { role: { in: ['all', role] } },
      orderBy: { createdAt: 'desc' },
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((t) => ({
      id: t.id, title: t.title, role: t.role, body: t.body,
      hasVideo: !!t.video, link: t.link,
      by: nameOf.get(t.by) || '—',
      createdAt: t.createdAt.toISOString().slice(0, 10),
      canManage: manage,
    }));
  }

  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>, @Req() req: Request & Jwt) {
    const title = String(body.title || '').trim();
    if (!title) throw new BadRequestException('Give the lesson a title');
    const role = ROLES.includes(String(body.role)) ? String(body.role) : 'all';
    const text = String(body.body || '').trim();
    const link = String(body.link || '').trim();
    const b64 = String(body.videoB64 || '');
    if (!text && !link && !b64) {
      throw new BadRequestException('Add some text, a video file, or a video link');
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'training' }, create: { key: 'training', value: 1 },
      update: { value: { increment: 1 } },
    });
    const id = 'TR-' + seq.value;

    let video = '';
    if (b64) {
      const raw = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!raw.length) throw new BadRequestException('The video file came through empty');
      if (raw.length > MAX_VIDEO) {
        throw new BadRequestException('Keep videos under 100 MB — trim it or host it and paste the link');
      }
      const ext = (String(body.videoName || '').match(/\.(mp4|webm|mov|m4v)$/i) || [])[1] || 'mp4';
      fs.mkdirSync(VIDEO_DIR, { recursive: true });
      video = id + '.' + ext.toLowerCase();
      fs.writeFileSync(path.join(VIDEO_DIR, video), raw);
    }

    await this.prisma.training.create({
      data: { id, title, role, body: text, link, video, by: req.user?.sub || '' },
    });

    // The audience hears about their new lesson. 'tech' includes seniors —
    // same rule the list uses. 'all' is a broadcast row.
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const at = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    const lessonText = `New lesson: ${title}${video || link ? ' (video)' : ''}. (${id})`;
    if (role === 'all') {
      await this.prisma.notification.create({ data: { userId: '', at, text: lessonText } });
    } else {
      const roles = (role === 'tech' ? ['tech', 'senior_tech'] : [role]) as Role[];
      const audience = await this.prisma.user.findMany({ where: { role: { in: roles } } });
      await this.prisma.notification.createMany({
        data: audience.map((u) => ({ userId: u.id, at, text: lessonText })),
      });
    }
    return { id };
  }

  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string) {
    const t = await this.prisma.training.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such lesson');
    if (t.video) {
      try { fs.unlinkSync(path.join(VIDEO_DIR, t.video)); } catch { /* already gone */ }
    }
    await this.prisma.training.delete({ where: { id } });
    return { ok: true };
  }

  /** Streams the uploaded video with Range support so seeking works. */
  @Get(':id/video')
  async video(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const t = await this.prisma.training.findUnique({ where: { id } });
    if (!t || !t.video) throw new NotFoundException('No video on this lesson');
    const file = path.join(VIDEO_DIR, t.video);
    if (!fs.existsSync(file)) throw new NotFoundException('The video file is missing on disk');

    const size = fs.statSync(file).size;
    const type = t.video.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const range = String(req.headers.range || '');
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.set({ 'Content-Length': size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    }
  }
}
