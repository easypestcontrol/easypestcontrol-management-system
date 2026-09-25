/* ============================================================================
   Tasks — the admin's to-do list for the team. A task is a standalone thing:
   who it is for, what has to be done, by when (date + time), how urgent.
   Deliberately NOT wired into quotations, contracts or services.

   Who sees what:
     admin / ops     — every task in their branch scope (+ the ?branch filter)
     everyone else   — the tasks assigned to them, nothing more

   The life of a task:
     open  ->  submitted  ->  done
     The assignee does the work, then SUBMITS it with proof — a note, photos,
     a file or a voice memo. That does not close the task; it parks it for the
     office to check. A manager APPROVES (it goes done) or SENDS IT BACK (open
     again, with a reason). A manager may also complete a task outright.
   Everyone hears the parts that concern them through the bell / push: the
   assignee when a task is raised, approved or sent back; the office when one
   is submitted for checking.
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

/** Any other document on a task: a PDF, a spreadsheet, a signed letter, or —
    on a completion — a short video of the work. Photos keep their own list
    because they are shown, not just kept. A file goes to storage (R2, or
    inline where R2 is not configured) and the task keeps its name, type, size
    and where it went. */
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

const asFiles = (raw: unknown): TaskFile[] => (Array.isArray(raw) ? raw as TaskFile[] : []);
const filesOf = (t: { files?: unknown }): TaskFile[] => asFiles(t.files);
const doneFilesOf = (t: { doneFiles?: unknown }): TaskFile[] => asFiles(t.doneFiles);
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
   * was dropped is deleted from storage. `seg` separates the two piles that
   * live under one task — the brief ('') and the completion proof ('/done').
   */
  private async storeFiles(incoming: FileIn[], id: string, existing: TaskFile[], seg = ''): Promise<TaskFile[]> {
    const kept: TaskFile[] = [];
    for (const f of incoming) {
      if (f.data) {
        kept.push({ name: f.name, type: f.type, size: f.size, ref: await this.storage.put(f.data, 'tasks/' + id + seg) });
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

  /** Who should hear that a task in this branch needs checking: the office.
      Admins see everything; a scoped ops manager only their own branches. */
  private async approvers(branch: string, exclude: string): Promise<string[]> {
    const office = await this.prisma.user.findMany({
      where: { role: { in: ['admin', 'ops'] } },
      select: { id: true, role: true, branches: true },
    });
    return office
      .filter((u) => u.id && u.id !== exclude
        && (u.role === 'admin' || u.branches.includes('') || u.branches.includes(branch)))
      .map((u) => u.id);
  }

  private async notify(userIds: string[], text: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const at = nowStamp();
    await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, at, text })) });
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
      // from the detail endpoint when a task is opened. The completion stamps
      // (submitted / done / created) travel too — the list shows "time taken".
      rows: rows.map((t) => {
        const { images, voice, files, doneImages, doneVoice, doneFiles, doneNotes, reviewNote, ...lean } = t;
        return {
          ...lean,
          createdAt: t.createdAt,
          imageCount: Array.isArray(images) ? images.length : 0,
          hasVoice: !!voice,
          fileCount: filesOf({ files }).length,
          proofCount: (Array.isArray(doneImages) ? doneImages.length : 0)
            + doneFilesOf({ doneFiles }).length + (doneVoice ? 1 : 0),
          hasProofNote: !!String(doneNotes || '').trim(),
          assigneeName: uOf.get(t.assignee)?.name || t.assignee || '—',
          assigneeColor: uOf.get(t.assignee)?.color || '#141414',
          createdByName: uOf.get(t.createdBy)?.name || t.createdBy || '—',
        };
      }),
      canManage: manage,
    };
  }

  /** One task in full — the brief AND the completion proof. Scope: a manager
      in range, or the task's own assignee. */
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
      where: { id: { in: [t.assignee, t.createdBy, t.submittedBy, t.approvedBy].filter(Boolean) } },
      select: { id: true, name: true, color: true },
    });
    const uOf = new Map(users.map((u) => [u.id, u]));
    return {
      ...t,
      files: filesOut(filesOf(t)),
      doneFiles: filesOut(doneFilesOf(t)),
      assigneeName: uOf.get(t.assignee)?.name || t.assignee || '—',
      assigneeColor: uOf.get(t.assignee)?.color || '#141414',
      createdByName: uOf.get(t.createdBy)?.name || t.createdBy || '—',
      submittedByName: uOf.get(t.submittedBy)?.name || '',
      approvedByName: uOf.get(t.approvedBy)?.name || '',
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
    // Where a task is raised across branches, each person's row is filed under
    // a branch that is truly theirs — a mismatch falls back rather than fails.
    let branch = String(body.branch || '').trim();
    if (!branch || (person.branches.length && !person.branches.includes(branch))) {
      branch = person.branches[0] || branch;
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
    await this.notify([assignee],
      `New task: ${title}`
      + (t.due ? ` — due ${t.due}${t.dueTime ? ' ' + t.dueTime : ''}` : '')
      + `. (${t.id})`);
    return { id: t.id };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    const me = req.user?.sub || '';
    const manage = this.canManage(req.user?.role);
    const mine = t.assignee === me;

    if (manage) {
      if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
        throw new NotFoundException('No such task');
      }
    } else if (!mine) {
      throw new ForbiddenException('Not your task');
    }

    // A plain { status } from an older client maps onto the new verbs: a
    // manager ticking means "approve/complete", anyone else means "submit".
    let action = String(body.action || '');
    if (!action && 'status' in body) {
      const s = String(body.status);
      action = s === 'done' ? (manage ? 'approve' : 'submit') : 'reopen';
    }

    const data: Record<string, unknown> = {};
    const notes: Array<{ to: string[]; text: string }> = [];
    const whoName = async () =>
      (await this.prisma.user.findUnique({ where: { id: me }, select: { name: true } }))?.name || me;

    if (action === 'submit') {
      // The assignee (or a manager on their behalf) hands the work in.
      data.status = 'submitted';
      data.submittedAt = nowStamp();
      data.submittedBy = me;
      data.doneAt = '';
      data.approvedBy = '';
      data.reviewNote = '';
      if ('doneNotes' in body) data.doneNotes = String(body.doneNotes || '').trim();
      if ('doneImages' in body) data.doneImages = cleanImages(body.doneImages);
      if ('doneVoice' in body) data.doneVoice = cleanVoice(body.doneVoice);
      if ('doneFiles' in body) {
        data.doneFiles = await this.storeFiles(cleanFiles(body.doneFiles), id, doneFilesOf(t), '/done');
      }
      const to = [...new Set([t.createdBy, ...(await this.approvers(t.branch, me))].filter((x) => x && x !== me))];
      notes.push({ to, text: `Task ready to check: ${t.title} — ${await whoName()} finished it. (${t.id})` });
    } else if (action === 'approve') {
      if (!manage) throw new ForbiddenException('Only the office can approve');
      data.status = 'done';
      data.doneAt = nowStamp();
      data.approvedBy = me;
      if (!t.submittedAt) { data.submittedAt = nowStamp(); data.submittedBy = t.assignee; }
      if ('reviewNote' in body) data.reviewNote = String(body.reviewNote || '').trim();
      const to = [...new Set([t.submittedBy || t.assignee, t.assignee].filter((x) => x && x !== me))];
      notes.push({ to, text: `Task approved: ${t.title}. (${t.id})` });
    } else if (action === 'reject') {
      if (!manage) throw new ForbiddenException('Only the office can send a task back');
      data.status = 'open';
      data.doneAt = '';
      data.submittedAt = '';
      data.approvedBy = '';
      data.reviewNote = String(body.reviewNote || '').trim();
      const to = [...new Set([t.submittedBy || t.assignee].filter((x) => x && x !== me))];
      const tail = data.reviewNote ? ` — ${data.reviewNote as string}` : '';
      notes.push({ to, text: `Task sent back: ${t.title}${tail} (${t.id})` });
    } else if (action === 'reopen') {
      // Un-submit (the assignee, before it is checked) or reopen a done one
      // (the office). Either way the proof stays put for the next round.
      if (!manage && !(mine && t.status === 'submitted')) {
        throw new ForbiddenException('Not your task');
      }
      data.status = 'open';
      data.doneAt = '';
      data.approvedBy = '';
      if (manage && t.status === 'submitted') data.submittedAt = '';
    }

    // Field edits are the scheduler's alone, and never mixed with a verb.
    if (manage && !action) {
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

    for (const n of notes) await this.notify(n.to, n.text);
    return { ...up, files: filesOut(filesOf(up)), doneFiles: filesOut(doneFilesOf(up)) };
  }

  @Delete(':id')
  @Roles('admin', 'ops')
  async remove(@Param('id') id: string, @Req() req: AuthedReq) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('No such task');
    if (!inScope(await branchScope(this.prisma, req.user), t.branch)) {
      throw new NotFoundException('No such task');
    }
    // Its documents go with it, brief and proof alike; storage is not a place
    // things are forgotten.
    for (const f of [...filesOf(t), ...doneFilesOf(t)]) await this.storage.remove(f.ref);
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}
