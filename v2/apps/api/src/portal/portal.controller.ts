/* ============================================================================
   The customer portal — a customer's own view of what they have with us.

   Every customer gets one link, unguessable, that opens their portal. The
   office puts it on a QR, sends it on WhatsApp, or copies it; the customer
   opens it, types their mobile number, and is in: their contracts, their
   services, their invoices.

   The link is a signature, not a lookup. `k` is an HMAC of the customer id
   under the app secret (the same trick that lets an <img> load a private
   photograph), so there is nothing to store, nothing to migrate, and a link
   cannot be guessed from another customer's. A session is the same idea one
   step on: an HMAC over the id AND the number that was typed, handed back
   to the browser and presented on every read. Neither is a staff token and
   neither can be mistaken for one — a portal session opens exactly one
   customer's portal and nothing else in the API.

   Sign-in is the mobile number alone for now, by the customer's instruction.
   The link being unguessable is the real gate; the number is a check that
   the person holding the link is the person it was sent to. An OTP over
   WhatsApp or SMS, chosen by the customer, is the next step and belongs in
   `login` below — the body already accepts a `channel` for it — once the
   WhatsApp automation exists to deliver one.
   ========================================================================== */

import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard, Public } from '../auth/auth.guard';
import { StorageService } from '../storage/storage.service';
import { docTotals } from 'shared';

/** The last ten digits of whatever was typed — "+91 98400 55221" and
    "9840055221" are the same number. */
const digits = (s: unknown) => String(s || '').replace(/\D/g, '').slice(-10);

@Controller('portal')
@UseGuards(AuthGuard)
export class PortalController {
  constructor(private prisma: PrismaService) {}

  private linkKey(id: string) { return 'portal:' + id; }
  private sessionKey(id: string, phone: string) { return 'portal-session:' + id + ':' + phone; }

  /* ----------------------------------------------------------- staff side */

  /** The customer's portal link, for the QR and the WhatsApp message.
      Signed in only — this is the office handing out the key. */
  @Get('link/:id')
  async link(@Param('id') id: string) {
    const c = await this.prisma.client.findUnique({
      where: { id }, select: { id: true, name: true, phone: true, contact: true },
    });
    if (!c) throw new NotFoundException('No such customer');
    return {
      path: '/portal/' + c.id + '?k=' + StorageService.sign(this.linkKey(c.id)),
      name: c.name, contact: c.contact, phone: c.phone,
    };
  }

  /* -------------------------------------------------------- customer side */

  private async byLink(id: string, k: string) {
    if (!StorageService.verify(this.linkKey(id), k)) {
      throw new NotFoundException('This link is not valid. Ask us for a fresh one.');
    }
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('This link is not valid. Ask us for a fresh one.');
    return c;
  }

  /** Who this link belongs to — enough to greet them and hint the number. */
  @Public()
  @Get(':id/meta')
  async meta(@Param('id') id: string, @Query('k') k: string) {
    const c = await this.byLink(id, k || '');
    const d = digits(c.phone);
    return { name: c.name, phoneHint: d ? '••••••' + d.slice(-4) : '' };
  }

  /**
   * Sign in with the mobile number on the record — the customer's own, or any
   * contact person's. Returns a portal session for this customer only.
   *
   * `channel` ('whatsapp' | 'sms') is accepted and ignored today. When the
   * WhatsApp automation lands, this is where the OTP goes: mint a code, send
   * it on the chosen channel, and only issue the session once it comes back.
   */
  @Public()
  @Post(':id/login')
  async login(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const c = await this.byLink(id, String(body.k || ''));
    const given = digits(body.phone);
    if (given.length !== 10) throw new BadRequestException('Enter the 10-digit mobile number');

    const known = new Set<string>();
    const own = digits(c.phone);
    if (own) known.add(own);
    // Contact persons carry numbers too — the manager who books for a hotel
    // is not the hotel's own line.
    // The column is [{salutation, firstName, lastName, email, workPhone, mobile}].
    const contacts = (c as unknown as { contacts?: unknown }).contacts;
    if (Array.isArray(contacts)) {
      for (const p of contacts as Array<{ mobile?: unknown; workPhone?: unknown }>) {
        for (const d of [digits(p?.mobile), digits(p?.workPhone)]) if (d) known.add(d);
      }
    }
    if (!known.has(given)) {
      throw new BadRequestException('That number is not on this customer’s record');
    }

    return {
      session: given + '.' + StorageService.sign(this.sessionKey(id, given)),
      name: c.name,
    };
  }

  private async bySession(id: string, s: string) {
    const [phone, sig] = String(s || '').split('.');
    if (!phone || !sig || !StorageService.verify(this.sessionKey(id, phone), sig)) {
      throw new NotFoundException('Please sign in again');
    }
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Please sign in again');
    return c;
  }

  /** Everything the customer has with us, trimmed to what is theirs to see. */
  @Public()
  @Get(':id/home')
  async home(@Param('id') id: string, @Query('s') s: string) {
    const c = await this.bySession(id, s);
    const [contracts, jobs, invoices, co] = await Promise.all([
      this.prisma.contract.findMany({
        where: { clientId: id }, include: { plan: true }, orderBy: { start: 'desc' },
      }),
      this.prisma.job.findMany({
        where: { clientId: id, status: { not: 'cancelled' } }, orderBy: { date: 'desc' }, take: 20,
      }),
      this.prisma.invoice.findMany({
        where: { clientId: id, status: { notIn: ['cancelled', 'draft'] } },
        include: { payments: true }, orderBy: { date: 'desc' },
      }),
      // The home state and GST rate decide CGST/SGST against IGST — the same
      // arithmetic the printed invoice uses, done here so the portal never
      // has to know tax.
      this.prisma.company.findFirst(),
    ]);
    const homeState = co?.state || 'Tamil Nadu';
    const gstRate = co?.gstRate ?? 18;
    return {
      name: c.name, contact: c.contact, phone: c.phone,
      contracts: contracts.map((x) => ({
        id: x.id, mode: x.mode, start: x.start, end: x.end, value: x.value,
        services: x.plan.length,
      })),
      jobs: jobs.map((j) => ({ id: j.id, date: j.date, slot: j.slot, type: j.type, status: j.status })),
      // Finished figures, the same ones the printed invoice shows: what it
      // came to, what has been paid, what is still owed. Nothing about cost.
      invoices: invoices.map((i) => {
        const t = docTotals(i.items as never, i.discount, i.placeOfSupply || homeState, homeState, gstRate);
        const paid = i.payments.reduce((a, p) => a + (p.amount || 0), 0);
        return {
          id: i.id, date: i.date, due: i.due, status: i.status,
          total: Math.round(t.total), paid: Math.round(paid),
          balance: Math.max(0, Math.round(t.total - paid)),
        };
      }),
    };
  }
}
