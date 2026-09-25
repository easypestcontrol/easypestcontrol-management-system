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
import { StorageService } from '../storage/storage.service';

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

/** Any other document on a task: a PDF, a spreadsheet, a signed letter.
    Photos keep their own list because they are shown, not just kept. A file
    goes to storage (R2, or inline where R2 is not configured) and the task
    keeps its name, type, size and where it went. */
const MAX_FILES = 10;
const MAX_FILE_B = 15 * 1024 * 1024;
/** Types a browser would run rather than show. Kept, but never under a type
    that lets them execute on the app's own origin when served back. */
const INERT_TYPES = ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript'];

interface TaskFile { name: string; type: string; size: number; ref: string }
/** What the form sends: a new file carries `data`; one already on the task
    comes back as the `url` it was served with. */
interface FileIn { name: string; type: string; size: number; data?: string; url?: string }

function fileName(raw: unknown) {
  return String(raw || '').replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
}

function cleanFiles(raw: unknown): FileIn[] {
  if (!Array.isArray(raw)) return [];
  const out: FileIn[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const f = v as Record<string, unknown>;
    const name = fileName(f.name);
    const data = String(f.data || '');
    if (data) {
      const [head, b64] = data.split(';base64,');
      if (!data.startsWith('data:') || !b64) continue;
      // The decoded length, padding accounted for: what the file really weighs.
      const size = Buffer.byteLength(b64, 'base64');
      if (size > MAX_FILE_B) continue;
      let type = head.slice(5).split(';')[0] || 'application/octet-stream';
      if (INERT_TYPES.includes(type.toLowerCase())) type = 'application/octet-stream';
      out.push({ name, type, size, data: 'data:' + type + ';base64,' + b64 });
    } else if (typeof f.url === 'string' && f.url) {
      out.push({ name, type: String(f.type || ''), size: Number(f.size) || 0, url: f.url });
    }
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

const filesOf = (t: { files?: unknown }): TaskFile[] => (Array.isArray(t.files) ? t.files as TaskFile[] : []);
/** Files the way the wire carries them: a URL a browser can fetch, never a key. */
const filesOut = (list: TaskFile[]) =>
  list.map((f) => ({ name: f.name, type: f.type, size: f.size, url: StorageService.url(f.ref) }));

const pad2 = (n: number) => String(n).padStart(2, '0');
function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  /**
   * Put new files away and keep the ones that stayed. A kept file is matched
   * by the URL it was served with, recomputed here and never trusted from
   * the body, so a form cannot point a task at somebody else's object. What
   * was dropped is deleted from storage.
   */
  private async storeFiles(incoming: FileIn[], id: string, existing: TaskFile[]): Promise<TaskFile[]> {
    const kept: TaskFile[] = [];
    for (const f of incoming) {
      if (f.data) {
        kept.push({ name: f.name, type: f.type, size: f.size, ref: await this.storage.put(f.data, 'tasks/' + id) });
      } else if (f.url) {
        const was = existing.find((e) => StorageService.url(e.ref) === f.url);
        if (was && !kept.includes(was)) kept.push(was);
      }
    }
    for (const e of existing) if (!kept.includes(e)) await this.storage.remove(e.ref);
    return kept.slice(0, MAX_FILES);
  }

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
        const { images, voice, files, ...lean } = t;
        return {
          ...lean,
          imageCount: Array.isArray(images) ? images.length : 0,
          hasVoice: !!voice,
          fileCount: filesOf({ files }).length,
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
      files: filesOut(filesOf(t)),
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

    const id = await this.nextId();
    const t = await this.prisma.task.create({
      data: {
        id,
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
        files: (await this.storeFiles(cleanFiles(body.files), id, [])) as never,
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
      if ('files' in body) data.files = await this.storeFiles(cleanFiles(body.files), id, filesOf(t));
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
    return { ...up, files: filesOut(filesOf(up)) };
  }

  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
      throw new NotFoundException('No such task');
    }
    // Its documents go with it; storage is not a place things are forgotten.
    for (const f of filesOf(t)) await this.storage.remove(f.ref);
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}
