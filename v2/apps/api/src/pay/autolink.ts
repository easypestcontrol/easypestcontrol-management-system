/* ============================================================================
   A way to pay, attached the moment a bill exists.

   An AMC instalment is raised by the system on a schedule, often while nobody
   is looking at it. Without this the customer receives a bill and then waits
   for somebody to remember to ask them for the money — which is how a
   quarterly contract quietly becomes an annual argument.

   Deliberately best-effort. A link is a convenience; the invoice is the
   obligation. If Razorpay is unreachable, or the keys are not connected yet,
   the instalment is still raised and still owed — it simply has no shortcut
   attached. Anything else would mean a payment outage stopping billing.
   ========================================================================== */
import type { PrismaClient } from '@prisma/client';
import { docTotals } from 'shared';
import { open } from '../secrets.util';

const RZP = 'https://api.razorpay.com/v1';

/**
 * Attach a payment link to an invoice, if we can.
 *
 * Never throws. The caller is in the middle of raising money that is owed and
 * must not be interrupted by a payment provider having a bad afternoon.
 */
export async function attachLink(
  prisma: PrismaClient,
  invoiceId: string,
): Promise<string> {
  try {
    const [inv, co] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } }),
      prisma.company.findFirst(),
    ]);
    if (!inv || inv.status === 'draft' || inv.status === 'cancelled') return '';

    const ig = (co?.integrations || {}) as Record<string, string>;
    const keyId = open(ig.rzpKeyId || '');
    const keySecret = open(ig.rzpKeySecret || '');
    if (!keyId || !keySecret) return ''; // not connected — nothing to attach

    const total = Math.round(docTotals(
      (Array.isArray(inv.items) ? inv.items : []) as never,
      inv.discount || 0, inv.placeOfSupply || '',
      co?.state || 'Tamil Nadu', co?.gstRate ?? 18,
    ).total);
    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
    const balance = Math.max(0, total - paid);
    // An instalment already covered by an advance needs no link.
    if (balance <= 0) return '';

    const live = await prisma.paymentIntent.findFirst({
      where: { invoiceId, kind: 'link', status: 'pending' },
    });
    if (live) return live.shortUrl;

    const client = await prisma.client.findUnique({ where: { id: inv.clientId } });
    const auth = 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64');

    const r = await fetch(RZP + '/payment_links', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: balance * 100,
        currency: 'INR',
        accept_partial: false,
        description: (co?.name || 'Pest control') + ' — ' + (inv.period || invoiceId),
        customer: {
          name: client?.name || '', contact: client?.phone || '', email: client?.email || '',
        },
        notify: { sms: !!client?.phone, email: !!client?.email },
        reminder_enable: true,
        notes: { invoiceId, clientId: inv.clientId },
      }),
    });
    const link = (await r.json()) as { id?: string; short_url?: string };
    if (!r.ok || !link.id) return '';

    const seq = await prisma.seq.upsert({
      where: { key: 'intent' }, create: { key: 'intent', value: 1 },
      update: { value: { increment: 1 } },
    });
    await prisma.paymentIntent.create({
      data: {
        id: 'PI-' + seq.value, gatewayRef: link.id, kind: 'link',
        invoiceId, clientId: inv.clientId,
        amountPaise: balance * 100, status: 'pending', shortUrl: link.short_url || '',
      },
    });
    return link.short_url || '';
  } catch {
    // Billing does not depend on the payment provider being available.
    return '';
  }
}
