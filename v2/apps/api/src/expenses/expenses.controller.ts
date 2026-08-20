/* ============================================================================
   Expenses — the client's Zoho-Expense flow, kept small.

   Anyone makes a FOLDER for the day (21 Aug 2026), records expenses inside
   it — receipted spends and trip-distance allowances — and submits the
   folder. From there everything is the ADMIN's: approve or reject with a
   reason, then pay the money back — through RazorpayX straight to the
   person's bank account, or marked paid by hand.

   Money rules that keep this honest:
   - A trip line's amount is km × the company ₹/km rate, computed HERE and
     locked into the row, so neither the browser nor a later rate change can
     invent money.
   - A folder is editable only while it is open (or bounced back rejected);
     the moment it is submitted the lines are frozen.
   - Bank account numbers are sealed with the same AES vault as API keys.
   ========================================================================== */
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { branchScope, branchWhere, clampScope, inScope } from '../branch.util';
import { open, seal } from '../secrets.util';

interface AuthedReq { user?: { sub?: string; role?: string } }

const MAX_IMAGES = 4;
const MAX_IMAGE_B = 900 * 1024;

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const nowStamp = () => {
  const d = new Date();
  return `${todayISO()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const titleFor = (iso: string) => {
  const p = iso.split('-');
  return p.length === 3 ? `${Number(p[2])} ${MONTHS[Number(p[1]) - 1]} ${p[0]}` : iso;
};

function cleanImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v || ''))
    .filter((v) => v.startsWith('data:image/') && v.length <= MAX_IMAGE_B * 1.4)
    .slice(0, MAX_IMAGES);
}

@Controller('expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(private prisma: PrismaService) {}

  private async mint(key: string, prefix: string) {
    const seq = await this.prisma.seq.upsert({
      where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } },
    });
    return prefix + seq.value;
  }

  private async notifyAdmins(text: string) {
    const admins = await this.prisma.user.findMany({ where: { role: 'admin', active: true } });
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, at: nowStamp(), text })),
    }).catch(() => {});
  }

  private async notify(userId: string, text: string) {
    if (!userId) return;
    await this.prisma.notification.create({
      data: { userId, at: nowStamp(), text },
    }).catch(() => {});
  }

  private sum(expenses: Array<{ amount: number }>) {
    return expenses.reduce((a, e) => a + e.amount, 0);
  }

  /** One line into the folder's diary — the Zoho-style report history. */
  private async hist(id: string, text: string) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, select: { history: true },
    });
    const h = Array.isArray(r?.history) ? (r!.history as Array<unknown>) : [];
    await this.prisma.expenseReport.update({
      where: { id },
      data: { history: [...h, { at: nowStamp(), text }] as never },
    }).catch(() => {});
  }

  /* ------------------------------------------------------------- reading */

  /** Admin sees every folder in scope; everyone else sees their own. */
  @Get()
  async list(@Req() req: AuthedReq) {
    const me = req.user?.sub || '';
    const admin = req.user?.role === 'admin';
    const where = admin
      ? branchWhere(clampScope(await branchScope(this.prisma, req.user), undefined))
      : { by: me };
    const [reports, users, co] = await Promise.all([
      this.prisma.expenseReport.findMany({
        where: where as never,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        include: { expenses: { select: { amount: true, category: true, kind: true } } },
        take: 200,
      }),
      this.prisma.user.findMany({ select: { id: true, name: true, color: true } }),
      this.prisma.company.findFirst({ select: { kmRate: true } }),
    ]);
    const uOf = new Map(users.map((u) => [u.id, u]));

    // The shelf's analytics: where the money goes, and how the months run.
    const catOf = new Map<string, number>();
    const monOf = new Map<string, number>();
    for (const r of reports) {
      if (r.status === 'rejected') continue;
      const m = r.date.slice(0, 7);
      for (const e of r.expenses) {
        catOf.set(e.category, (catOf.get(e.category) || 0) + e.amount);
        monOf.set(m, (monOf.get(m) || 0) + e.amount);
      }
    }
    const now = new Date();
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const byMonth: Array<{ label: string; total: number }> = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.push({ label: MONTHS_S[d.getMonth()], total: monOf.get(key) || 0 });
    }
    const byCategory = Array.from(catOf.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return {
      canManage: admin,
      kmRate: co?.kmRate || 0,
      byMonth, byCategory,
      rows: reports.map((r) => ({
        id: r.id, title: r.title, date: r.date, status: r.status, branch: r.branch,
        by: r.by, byName: uOf.get(r.by)?.name || 'Former staff (' + r.by + ')',
        byColor: uOf.get(r.by)?.color || '#888',
        count: r.expenses.length, total: this.sum(r.expenses),
        payMode: r.payMode,
      })),
    };
  }

  @Get('reports/:id')
  async one(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, include: { expenses: { orderBy: { id: 'asc' } } },
    });
    if (!r) throw new NotFoundException('No such folder');
    const admin = req.user?.role === 'admin';
    if (!admin && r.by !== (req.user?.sub || '')) throw new NotFoundException('No such folder');
    if (admin && !inScope(await branchScope(this.prisma, req.user), r.branch)) {
      throw new NotFoundException('No such folder');
    }
    const [owner, co] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: r.by } }),
      this.prisma.company.findFirst({ select: { kmRate: true } }),
    ]);
    return {
      ...r,
      byName: owner?.name || 'Former staff (' + r.by + ')',
      total: this.sum(r.expenses),
      kmRate: co?.kmRate || 0,
      canManage: admin,
      mine: r.by === (req.user?.sub || ''),
      // What the admin needs to pay: masked account, never the sealed value.
      bank: admin && owner ? {
        holder: owner.bankHolder, ifsc: owner.bankIfsc,
        accMasked: owner.bankAcc ? '••••' + open(owner.bankAcc).slice(-4) : '',
        has: !!(owner.bankAcc && owner.bankIfsc),
      } : undefined,
    };
  }

  /* ------------------------------------------------------------- writing */

  /** New folder for a day. Several folders per day are fine — Zoho allows it. */
  @Post('reports')
  async create(@Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const me = req.user?.sub || '';
    const date = String(body.date || todayISO());
    const user = await this.prisma.user.findUnique({ where: { id: me } });
    const r = await this.prisma.expenseReport.create({
      data: {
        id: await this.mint('expense-report', 'EXR-'),
        title: String(body.title || '').trim() || titleFor(date),
        date,
        by: me,
        branch: user?.branches[0] || '',
        note: String(body.note || '').trim(),
        history: [{ at: nowStamp(), text: 'Folder created by ' + (user?.name || me) }] as never,
      },
    });
    return { id: r.id };
  }

  /** Add a line inside a folder — a receipted expense or a trip allowance. */
  @Post('reports/:id/items')
  async addItem(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('No such folder');
    if (r.by !== (req.user?.sub || '')) throw new ForbiddenException('Not your folder');
    if (r.status !== 'open' && r.status !== 'rejected') {
      throw new BadRequestException('This folder has been submitted — it cannot be changed now');
    }

    const kind = body.kind === 'trip' ? 'trip' : 'expense';
    let amount = 0, km = 0, rate = 0;
    if (kind === 'trip') {
      km = Math.max(0, Number(body.km) || 0);
      if (!km) throw new BadRequestException('How many kilometres?');
      const co = await this.prisma.company.findFirst({ select: { kmRate: true } });
      rate = co?.kmRate || 0;
      if (!rate) {
        throw new BadRequestException(
          'The ₹-per-km rate has not been set — the admin sets it in Settings → Organisation',
        );
      }
      amount = Math.round(km * rate);
    } else {
      amount = Math.round(Number(body.amount) || 0);
      if (amount <= 0) throw new BadRequestException('Enter the amount');
    }

    const e = await this.prisma.expense.create({
      data: {
        id: await this.mint('expense', 'EXP-'),
        reportId: id,
        kind,
        date: String(body.date || r.date),
        category: kind === 'trip' ? 'Trip allowance' : String(body.category || '').trim() || 'Other',
        merchant: String(body.merchant || '').trim(),
        note: String(body.note || '').trim(),
        amount, km, rate,
        images: cleanImages(body.images) as never,
      },
    });
    await this.hist(id, e.id + ' added — Rs ' + amount.toLocaleString('en-IN') + ' ' + e.category);
    // A rejected folder being reworked goes back to open.
    if (r.status === 'rejected') {
      await this.prisma.expenseReport.update({
        where: { id }, data: { status: 'open', adminNote: '' },
      });
      await this.hist(id, 'Reopened for rework');
    }
    return { id: e.id, amount };
  }

  @Delete('items/:id')
  async removeItem(@Param('id') id: string, @Req() req: AuthedReq) {
    const e = await this.prisma.expense.findUnique({ where: { id }, include: { report: true } });
    if (!e) throw new NotFoundException('No such expense');
    if (e.report.by !== (req.user?.sub || '')) throw new ForbiddenException('Not your folder');
    if (e.report.status !== 'open' && e.report.status !== 'rejected') {
      throw new BadRequestException('This folder has been submitted — it cannot be changed now');
    }
    await this.prisma.expense.delete({ where: { id } });
    await this.hist(e.reportId, e.id + ' removed');
    return { ok: true };
  }

  @Delete('reports/:id')
  async removeReport(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('No such folder');
    const admin = req.user?.role === 'admin';
    if (!admin && r.by !== (req.user?.sub || '')) throw new ForbiddenException('Not your folder');
    if (!admin && r.status !== 'open' && r.status !== 'rejected') {
      throw new BadRequestException('A submitted folder cannot be deleted');
    }
    if (r.status === 'paid') throw new BadRequestException('A paid folder is a financial record — it stays');
    await this.prisma.expenseReport.delete({ where: { id } });
    return { ok: true };
  }

  /** The owner sends the folder to the admin. */
  @Post('reports/:id/submit')
  async submit(@Param('id') id: string, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, include: { expenses: true },
    });
    if (!r) throw new NotFoundException('No such folder');
    if (r.by !== (req.user?.sub || '')) throw new ForbiddenException('Not your folder');
    if (r.status !== 'open' && r.status !== 'rejected') {
      throw new BadRequestException('Already submitted');
    }
    if (!r.expenses.length) throw new BadRequestException('The folder is empty — add an expense first');
    await this.prisma.expenseReport.update({
      where: { id }, data: { status: 'submitted', adminNote: '', submittedAt: nowStamp() },
    });
    await this.hist(id, 'Submitted for approval — Rs ' + this.sum(r.expenses).toLocaleString('en-IN'));
    const who = await this.prisma.user.findUnique({ where: { id: r.by } });
    await this.notifyAdmins(
      `Expenses to approve: Rs ${this.sum(r.expenses).toLocaleString('en-IN')} from ${who?.name || r.by}` +
      ` — ${r.title}. (${r.id})`,
    );
    return { ok: true };
  }

  /** Approve or bounce. Admin's alone, with a reason when bouncing. */
  @Post('reports/:id/decide')
  @Roles('admin')
  async decide(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthedReq) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, include: { expenses: true },
    });
    if (!r) throw new NotFoundException('No such folder');
    if (r.status !== 'submitted') throw new BadRequestException('This folder is not waiting for a decision');
    const approve = !!body.approve;
    const note = String(body.note || '').trim();
    if (!approve && !note) throw new BadRequestException('Tell them why it is rejected');
    await this.prisma.expenseReport.update({
      where: { id },
      data: {
        status: approve ? 'approved' : 'rejected',
        adminNote: note,
        approvedBy: approve ? (req.user?.sub || '') : '',
        decidedAt: nowStamp(),
      },
    });
    const who = await this.prisma.user.findUnique({ where: { id: req.user?.sub || '' } });
    await this.hist(id, approve
      ? 'Approved by ' + (who?.name || 'admin')
      : 'Returned by ' + (who?.name || 'admin') + ': ' + note);
    await this.notify(r.by, approve
      ? `Expenses approved: Rs ${this.sum(r.expenses).toLocaleString('en-IN')} — ${r.title}. Payment follows. (${r.id})`
      : `Expenses returned: ${r.title} — ${note} (${r.id})`);
    return { ok: true };
  }

  /* ----------------------------------------------------- the money going out */

  /** The employee's payout rails. Admin writes them; the number is sealed. */
  @Post('bank/:userId')
  @Roles('admin')
  async setBank(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('No such person');
    const holder = String(body.holder || '').trim();
    const acc = String(body.acc || '').replace(/\s/g, '');
    const ifsc = String(body.ifsc || '').trim().toUpperCase();
    if (!holder || !acc || !ifsc) throw new BadRequestException('Name, account number and IFSC — all three');
    if (!/^\d{6,20}$/.test(acc)) throw new BadRequestException('That account number does not look right');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new BadRequestException('That IFSC does not look right');
    await this.prisma.user.update({
      where: { id: userId },
      data: { bankHolder: holder, bankAcc: seal(acc), bankIfsc: ifsc },
    });
    return { ok: true, accMasked: '••••' + acc.slice(-4) };
  }

  /**
   * Pay an approved folder.
   *
   * mode 'razorpayx' moves real money: contact → fund account → payout, the
   * ids cached on the user so the second payout is one call. mode 'manual'
   * records that the cash changed hands outside the system.
   */
  @Post('reports/:id/pay')
  @Roles('admin')
  async pay(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const r = await this.prisma.expenseReport.findUnique({
      where: { id }, include: { expenses: true },
    });
    if (!r) throw new NotFoundException('No such folder');
    if (r.status !== 'approved') throw new BadRequestException('Approve the folder first');
    const total = this.sum(r.expenses);
    if (total <= 0) throw new BadRequestException('Nothing to pay');
    const mode = body.mode === 'razorpayx' ? 'razorpayx' : 'manual';

    let payoutId = '';
    if (mode === 'razorpayx') {
      payoutId = await this.razorpayxPayout(r.by, total, r.id);
    }
    await this.prisma.expenseReport.update({
      where: { id },
      data: { status: 'paid', paidAt: nowStamp(), payMode: mode, payoutId },
    });
    await this.hist(id, mode === 'razorpayx'
      ? 'Rs ' + total.toLocaleString('en-IN') + ' paid via RazorpayX' + (payoutId ? ' · ' + payoutId : '')
      : 'Rs ' + total.toLocaleString('en-IN') + ' marked paid by hand');
    await this.notify(r.by,
      `Expenses paid: Rs ${total.toLocaleString('en-IN')} — ${r.title}` +
      (mode === 'razorpayx' ? ' sent to your bank account via RazorpayX.' : ' (paid by hand).') +
      ` (${r.id})`);
    return { ok: true, payoutId };
  }

  /** The three RazorpayX calls, with the ids cached for next time. */
  private async razorpayxPayout(userId: string, amount: number, ref: string): Promise<string> {
    const [u, co] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.company.findFirst(),
    ]);
    if (!u) throw new BadRequestException('No such person');
    const ig = (co?.integrations || {}) as Record<string, string>;
    const keyId = open(ig.rzpKeyId || '');
    const keySecret = open(ig.rzpKeySecret || '');
    const xAccount = open(ig.rzpxAccount || '');
    if (!keyId || !keySecret) {
      throw new BadRequestException(
        'Razorpay keys are not set — add them on the Credentials page, or mark this paid manually',
      );
    }
    if (!xAccount) {
      throw new BadRequestException(
        'The RazorpayX account number is not set — add it on the Credentials page, or mark this paid manually',
      );
    }
    const acc = open(u.bankAcc || '');
    if (!u.bankHolder || !acc || !u.bankIfsc) {
      throw new BadRequestException('Add ' + u.name + "'s bank details first");
    }

    const call = async (path: string, payload: unknown) => {
      const res = await fetch('https://api.razorpay.com/v1' + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const err = (data.error as { description?: string })?.description || res.statusText;
        throw new BadRequestException('RazorpayX said: ' + err);
      }
      return data as { id: string };
    };

    // 1. The contact, once per person.
    let contactId = u.rzpContactId;
    if (!contactId) {
      contactId = (await call('/contacts', {
        name: u.bankHolder || u.name, type: 'employee', reference_id: u.id,
      })).id;
    }
    // 2. The fund account — remade whenever the bank details change.
    const fundKey = [u.bankHolder, acc.slice(-4), u.bankIfsc].join('|');
    let fundId = u.rzpFundKey === fundKey ? u.rzpFundId : '';
    if (!fundId) {
      fundId = (await call('/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: { name: u.bankHolder, ifsc: u.bankIfsc, account_number: acc },
      })).id;
    }
    await this.prisma.user.update({
      where: { id: u.id },
      data: { rzpContactId: contactId, rzpFundId: fundId, rzpFundKey: fundKey },
    });
    // 3. The money.
    const payout = await call('/payouts', {
      account_number: xAccount,
      fund_account_id: fundId,
      amount: amount * 100, // paise
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: ref,
      narration: 'Expense reimbursement ' + ref,
    });
    return payout.id;
  }
}
