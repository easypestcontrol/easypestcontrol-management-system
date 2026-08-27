/* ============================================================================
   Public document views — what a Share link opens, no login required.

   Same pattern as /public/quotes (the customer approval page): the document
   id IS the link. Each endpoint returns only what belongs ON the printed
   document — no internal notes, no other customers, no lists to walk.
   ========================================================================== */
import {
  BadRequestException, Controller, Get, NotFoundException, Param, Post, UseGuards,
} from '@nestjs/common';
import { StorageService } from './storage/storage.service';
import { docTotals } from 'shared';
import { PrismaService } from './prisma.service';
import { AuthGuard, Public } from './auth/auth.guard';
import { open } from './secrets.util';

@Controller('public/docs')
@UseGuards(AuthGuard)
export class PublicDocsController {
  constructor(private prisma: PrismaService) {}

  private async companyBlock() {
    const co = await this.prisma.company.findFirst();
    const dt = (co?.docTerms || {}) as Record<string, string[]>;
    return {
      name: co?.name || '', tagline: co?.tagline || '', logo: co?.logo || '',
      sign: co?.sign || '', seal: co?.seal || '',
      addr: co?.addr || '', city: co?.city || '', pin: co?.pin || '',
      phone: co?.phone || '', email: co?.email || '', gstin: co?.gstin || '',
      state: co?.state || 'Tamil Nadu', gstRate: co?.gstRate ?? 18,
      // Each document prints ITS OWN terms, set section-wise in Settings.
      // A list that exists but is EMPTY was emptied on purpose — defaults
      // apply only when a list was never set at all.
      docTerms: {
        quotation: Array.isArray(dt.quotation) ? dt.quotation : (co?.terms || []),
        invoice: Array.isArray(dt.invoice) ? dt.invoice : [
          'Payment due within 15 days of invoice date.',
          'Interest at 18% p.a. applies on overdue amounts.',
          'Subject to Chennai jurisdiction.',
        ],
        contract: Array.isArray(dt.contract) ? dt.contract : (co?.terms || []),
        service: Array.isArray(dt.service) ? dt.service : [
          'Chemicals applied by licensed applicators as per CIB&RC guidelines.',
        ],
      },
    };
  }

  /**
   * Let the customer pay the invoice they are looking at.
   *
   * The Share link is how most of these documents are actually read — on a
   * phone, in the evening, by whoever signs the cheques. Making them find
   * somebody to ask for a payment link is how a settled invoice becomes a
   * fortnight of chasing. The bill and the way to pay it belong on the same
   * page.
   *
   * Public, because the customer is not signed in to anything and never
   * should be. That is safe for the same reason the approval page is: this
   * can only ever create a DEMAND for money against an invoice that already
   * exists and already says what it is owed. It moves nothing. The money
   * itself travels through Razorpay and comes home through the signed
   * webhook, the same as every other rupee.
   *
   * A live link for the same balance is handed back rather than replaced, so
   * refreshing the page — or three people opening it — cannot produce three
   * ways to pay the same bill.
   */
  @Public()
  @Post('invoice/:id/pay')
  async payInvoice(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id }, include: { payments: true },
    });
    if (!inv || inv.status === 'cancelled' || inv.status === 'draft') {
      throw new NotFoundException('No such invoice');
    }

    const co = await this.prisma.company.findFirst();
    const t = docTotals(
      (Array.isArray(inv.items) ? inv.items : []) as never,
      inv.discount || 0, inv.placeOfSupply || '',
      co?.state || 'Tamil Nadu', co?.gstRate ?? 18,
    );
    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
    const balance = Math.max(0, Math.round(t.total - paid));
    if (balance <= 0) throw new BadRequestException('This invoice is already settled');

    const live = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId: id, kind: 'link', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (live && live.amountPaise === balance * 100) {
      return { url: live.shortUrl, amount: balance, reused: true };
    }

    const ig = (co?.integrations || {}) as Record<string, string>;
    const keyId = open(ig.rzpKeyId || '');
    const keySecret = open(ig.rzpKeySecret || '');
    if (!keyId || !keySecret) {
      throw new BadRequestException('Online payment is not available — please contact us');
    }

    const client = await this.prisma.client.findUnique({ where: { id: inv.clientId } });
    const r = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: balance * 100,
        currency: 'INR',
        accept_partial: false,
        description: (co?.name || 'Pest control') + ' — invoice ' + id,
        customer: {
          name: client?.name || '', contact: client?.phone || '', email: client?.email || '',
        },
        notify: { sms: false, email: false },   // they are looking at it already
        reminder_enable: true,
        notes: { invoiceId: id, clientId: inv.clientId },
      }),
    });
    const link = (await r.json()) as {
      id?: string; short_url?: string; error?: { description?: string };
    };
    if (!r.ok || !link.id) {
      throw new BadRequestException('Could not open the payment page — please try again');
    }

    const seq = await this.prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    await this.prisma.paymentIntent.create({
      data: {
        id: 'PI-' + seq.value, gatewayRef: link.id, kind: 'link',
        invoiceId: id, clientId: inv.clientId,
        amountPaise: balance * 100, status: 'pending', shortUrl: link.short_url || '',
      },
    });
    return { url: link.short_url, amount: balance, reused: false };
  }

  /** The company identity for the public legal pages (terms, privacy). */
  @Public()
  @Get('company')
  async company() {
    return this.companyBlock();
  }

  @Public()
  @Get('invoice/:id')
  async invoice(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: { orderBy: [{ date: 'desc' }, { id: 'desc' }] } },
    });
    if (!inv || inv.status === 'cancelled') throw new NotFoundException('No such invoice');
    const [client, co] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: inv.clientId },
        select: {
          name: true, contact: true, phone: true, addr: true,
          city: true, pin: true, gstin: true,
        },
      }),
      this.companyBlock(),
    ]);
    const items = (Array.isArray(inv.items) ? inv.items : []) as Array<{
      desc?: string; qty?: number; rate?: number; date?: string; jobId?: string;
    }>;
    const t = docTotals(items as never, inv.discount, inv.placeOfSupply || co.state, co.state, co.gstRate);
    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
    return {
      id: inv.id, date: inv.date, due: inv.due, period: inv.period,
      status: inv.status, place: t.tax.place,
      items: items.map((x) => ({
        desc: x.desc || '', qty: x.qty || 1, rate: x.rate || 0,
        date: x.date || '', jobId: x.jobId || '',
      })),
      totals: {
        sub: t.sub, disc: t.disc, rows: t.tax.rows, total: t.total,
        // Whole rupees on both sides, so the customer's copy and ours can
        // never disagree about whether a thing is settled.
        paid, balance: Math.max(0, Math.round(t.total - paid)),
      },
      payments: inv.payments.map((p) => ({
        id: p.id, amount: p.amount, mode: p.mode, date: p.date,
      })),
      client, company: co,
    };
  }

  @Public()
  @Get('report/:id')
  async report(@Param('id') id: string) {
    const j = await this.prisma.job.findUnique({ where: { id } });
    // The report exists the moment the service is finished — not before.
    if (!j || j.status !== 'completed') throw new NotFoundException('No report for this service');
    const x = (j.exec || {}) as {
      checkinAt?: string; startedAt?: string; finishedAt?: string; durationMins?: number;
      geo?: string; photosBefore?: string[]; photosAfter?: string[];
      chemicals?: Array<{ id: string; qty: number }>;
      findings?: string[]; areaFindings?: Array<{ area: string; text: string }>;
      observations?: string; techNotes?: string;
      signedBy?: string; signature?: boolean; signatureImage?: string; rating?: number;
      reportSentAt?: string;
    };
    const [client, services, crew, items, co] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: j.clientId },
        select: { name: true, contact: true, phone: true, addr: true, city: true },
      }),
      this.prisma.service.findMany({
        where: { id: { in: j.serviceIds } }, select: { id: true, name: true, warranty: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: j.techIds } }, select: { id: true, name: true, title: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { id: { in: (x.chemicals || []).map((c) => c.id) } },
        select: { id: true, name: true, unit: true },
      }),
      this.companyBlock(),
    ]);
    const itemOf = new Map(items.map((i) => [i.id, i]));
    return {
      id: j.id, date: j.date, slot: j.slot, contractId: j.contractId,
      visitNo: j.visitNo, ofVisits: j.ofVisits,
      services: j.serviceIds.map((sid) => {
        const sv = services.find((s) => s.id === sid);
        return { name: sv?.name || sid, warranty: sv?.warranty || '' };
      }),
      crew: j.techIds.map((tid) => {
        const t = crew.find((u) => u.id === tid);
        return { name: t?.name || tid, title: t?.title || '', head: tid === j.headTechId };
      }),
      exec: {
        checkinAt: x.checkinAt || '', startedAt: x.startedAt || '',
        finishedAt: x.finishedAt || '', durationMins: x.durationMins || 0,
        geo: x.geo || '',
        // The customer has no token, so photographs come through the public
        // door. The keys are UUIDs — the link exposes the photograph it names
        // and nothing beside it.
        photosBefore: (x.photosBefore || []).map((v) => StorageService.url(v, true)),
        photosAfter: (x.photosAfter || []).map((v) => StorageService.url(v, true)),
        chemicals: (x.chemicals || []).map((c) => ({
          name: itemOf.get(c.id)?.name || c.id, qty: c.qty, unit: itemOf.get(c.id)?.unit || '',
        })),
        findings: x.findings || [], areaFindings: x.areaFindings || [],
        observations: x.observations || '', techNotes: x.techNotes || '',
        signedBy: x.signedBy || '', signature: !!x.signature,
        signatureImage: StorageService.url(x.signatureImage || '', true), rating: x.rating || 0,
        reportSentAt: x.reportSentAt || '',
      },
      client, company: co,
    };
  }

  @Public()
  @Get('contract/:id')
  async contract(@Param('id') id: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id }, include: { plan: { orderBy: { order: 'asc' } } },
    });
    if (!c) throw new NotFoundException('No such contract');
    const [client, services, jobs, co] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: c.clientId },
        select: { name: true, contact: true, phone: true, addr: true, city: true },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true } }),
      this.prisma.job.findMany({
        where: { contractId: id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
        select: { id: true, date: true, slot: true, status: true, serviceIds: true },
      }),
      this.companyBlock(),
    ]);
    const nameOf = new Map(services.map((s) => [s.id, s.name]));
    return {
      id: c.id, mode: c.mode, billing: c.billing, value: c.value,
      start: c.start, end: c.end, months: c.months,
      site: c.site || '', billAddr: c.billAddr || '',
      plan: c.plan.map((l) => ({
        service: nameOf.get(l.svId) || l.svId,
        visits: l.visits, freq: l.freq, crew: l.crew,
      })),
      schedule: jobs.map((j) => ({
        id: j.id, date: j.date, slot: j.slot, status: j.status,
        services: j.serviceIds.map((s) => nameOf.get(s) || s).join(' + '),
      })),
      client, company: co,
    };
  }
}
