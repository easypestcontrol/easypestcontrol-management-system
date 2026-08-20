/* ============================================================================
   Tasks — the admin's to-do list for the team. A task is a standalone thing:
   who it is for, what has to be done, by when (date + time), how urgent.
   Deliberately NOT wired into quotations, contracts or services.

   Who sees what:
     admin / ops     — every task in their branch scope (+ the ?branch filter)
     everyone else   — the tasks assigned to them, nothing more
   Assignees may only tick a task done; shaping the task is the scheduler's.
   The assignee hears about a new task through the bell/push; the scheduler
   hears when it is done.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';

interface AuthedReq { user?: { sub?: string; role?: string } }

const PRIORITIES = ['low', 'normal', 'high'];

/** Reference photos and one voice note ride on the task as data URLs —
    shrunk client-side; these caps keep a task from becoming a media store. */
const MAX_IMAGES = 6;
const MAX_IMAGE_B = 900 * 1024;
const MAX_VOICE_B = 3 * 1024 * 1024;

function cleanImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v || ''))
    .filter((v) => v.startsWith('data:image/') && v.length <= MAX_IMAGE_B * 1.4)
    .slice(0, MAX_IMAGES);
}
function cleanVoice(raw: unknown): string {
  const v = String(raw || '');
  if (!v) return '';
  if (!v.startsWith('data:audio/')) return '';
  if (v.length > MAX_VOICE_B * 1.4) return '';
  return v;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private prisma: PrismaService) {}

  private canManage(role?: string) {
    return role === 'admin' || role === 'ops';
  }

  private async nextId() {
    const seq = await this.prisma.seq.upsert({
      where: { key: 'task' }, create: { key: 'task', value: 1 },
      update: { value: { increment: 1 } },
    });
    return 'TSK-' + seq.value;
  }

  @Get()
  async list(
    @Req() req: AuthedReq,
    @Query('branch') branch?: string,
    @Query('assignee') assignee?: string,
  ) {
    const manage = this.canManage(req.user?.role);
    let where: Record<string, unknown>;
    if (manage) {
      const scope = clampScope(await branchScope(this.prisma, req.user), branch);
      where = { ...branchWhere(scope), ...(assignee ? { assignee } : {}) };
    } else {
      // Everyone else's list IS their to-do — assigned to them, full stop.
      where = { assignee: req.user?.sub || '' };
    }
    const [rows, users] = await Promise.all([
      this.prisma.task.findMany({
        where: where as never,
        orderBy: [{ status: 'asc' }, { due: 'asc' }, { dueTime: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.findMany({ select: { id: true, name: true, color: true, role: true } }),
    ]);
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      // The list stays lean: attachment FLAGS ride here, the payloads come
      // from the detail endpoint when a task is opened.
      rows: rows.map((t) => {
        const { images, voice, ...lean } = t;
        return {
          ...lean,
          imageCount: Array.isArray(images) ? images.length : 0,
          hasVoice: !!voice,
          assigneeName: uOf.get(t.assignee)?.name || t.assignee || '—',
          assigneeColor: uOf.get(t.assignee)?.color || '#141414',
          createdByName: uOf.get(t.createdBy)?.name || t.createdBy || '—',
        };
      }),
      canManage: manage,
    };
  }

  /** One task in full — attachments included. Scope: manager, or its assignee. */
  @Get(':id')
  async one(@Param('id') id: string, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    if (this.canManage(req.user?.role)) {
      if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
        throw new NotFoundException('No such task');
      }
    } else if (t.assignee !== (req.user?.sub || '')) {
      throw new NotFoundException('No such task');
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [t.assignee, t.createdBy].filter(Boolean) } },
      select: { id: true, name: true, color: true },
    });
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      ...t,
      assigneeName: uOf.get(t.assignee)?.name || t.assignee || '—',
      assigneeColor: uOf.get(t.assignee)?.color || '#141414',
      createdByName: uOf.get(t.createdBy)?.name || t.createdBy || '—',
    };
  }

  @Post()
  @Roles('admin', 'ops')
  async create(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const title = String(body.title || '').trim();
    if (!title) throw new BadRequestException('Say what the task is');
    const assignee = String(body.assignee || '').trim();
    if (!assignee) throw new BadRequestException('Pick who it is for');
    const person = await this.prisma.user.findUnique({ where: { id: assignee } });
    if (!person) throw new BadRequestException('No such person');

    // The branch leads: it is picked first and the person must belong to it.
    let branch = String(body.branch || '').trim();
    if (!branch) branch = person.branches[0] || '';
    if (branch && person.branches.length && !person.branches.includes(branch)) {
      throw new BadRequestException(person.name + ' is not in that branch');
    }
    // A scoped scheduler cannot plant tasks in another branch.
    if (!inScope(await branchScope(this.prisma, req.user), branch)) {
      throw new ForbiddenException('That branch is outside your scope');
    }

    const t = await this.prisma.task.create({
      data: {
        id: await this.nextId(),
        title,
        notes: String(body.notes || '').trim(),
        assignee,
        createdBy: req.user?.sub || '',
        branch,
        due: String(body.due || '').trim(),
        dueTime: String(body.dueTime || '').trim(),
        priority: PRIORITIES.includes(String(body.priority)) ? String(body.priority) : 'normal',
        images: cleanImages(body.images) as never,
        voice: cleanVoice(body.voice),
      },
    });

    // The person hears about it — bell now, phone push when FCM is live.
    await this.prisma.notification.create({
      data: {
        userId: assignee, at: nowStamp(),
        text: `New task: ${title}` +
          (t.due ? ` — due ${t.due}${t.dueTime ? ' ' + t.dueTime : ''}` : '') +
          `. (${t.id})`,
      },
    });
    return { id: t.id };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    const me = req.user?.sub || '';
    const manage = this.canManage(req.user?.role);

    if (manage) {
      if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
        throw new NotFoundException('No such task');
      }
    } else if (t.assignee !== me) {
      throw new ForbiddenException('Not your task');
    }

    const data: Record<string, unknown> = {};
    // The assignee's only verb is done / not done. The shape is the scheduler's.
    if ('status' in body) {
      const done = String(body.status) === 'done';
      data.status = done ? 'done' : 'open';
      data.doneAt = done ? nowStamp() : '';
    }
    if (manage) {
      for (const k of ['title', 'notes', 'due', 'dueTime', 'branch'] as const) {
        if (k in body) data[k] = String(body[k] ?? '').trim();
      }
      if ('priority' in body && PRIORITIES.includes(String(body.priority))) {
        data.priority = String(body.priority);
      }
      if ('images' in body) data.images = cleanImages(body.images);
      if ('voice' in body) data.voice = cleanVoice(body.voice);
      if ('assignee' in body) {
        const a = String(body.assignee || '').trim();
        if (a && !(await this.prisma.user.findUnique({ where: { id: a } }))) {
          throw new BadRequestException('No such person');
        }
        data.assignee = a;
      }
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to change');
    const up = await this.prisma.task.update({ where: { id }, data: data as never });

    // Ticking it done tells whoever scheduled it.
    if (data.status === 'done' && t.createdBy && t.createdBy !== me) {
      const who = await this.prisma.user.findUnique({ where: { id: me } });
      await this.prisma.notification.create({
        data: {
          userId: t.createdBy, at: nowStamp(),
          text: `Task done: ${t.title} — by ${who?.name || me}. (${t.id})`,
        },
      });
    }
    return up;
  }

  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
      throw new NotFoundException('No such task');
    }
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}
