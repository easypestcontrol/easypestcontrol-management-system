/* ============================================================================
   Read-side shaping shared by the staff and public quotation controllers.

   A quotation row is raw; the document needs the party block, the owner's
   name and signature, and catalogue names on every line. v1 resolved these
   at render time (quotations.js partyOf/lineVisits); v2 resolves them once,
   server-side, so both the app page and the public approve page paint from
   one payload.
   ========================================================================== */
import { PrismaService } from '../prisma.service';

export interface PartyBlock {
  name: string; contact: string; addr: string; city: string; pin: string;
  gstin: string; phone: string; email: string;
}

export interface QuoteRow {
  id: string;
  clientId: string;
  leadId: string;
  owner: string;
  items: Array<{ svId: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 'YYYY-MM-DDTHH:MM' — v1 store.js:375 nowStamp. */
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return todayISO() + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/**
 * Who the document addresses — quotations.js:19-26. A lead has no full
 * address on file, so v1 filled a fixed city; preserved verbatim.
 */
export async function partyOf(
  prisma: PrismaService,
  q: { clientId: string; leadId: string },
): Promise<PartyBlock | null> {
  if (q.clientId) {
    const c = await prisma.client.findUnique({ where: { id: q.clientId } });
    return c
      ? { name: c.name, contact: c.contact, addr: c.addr, city: c.city,
          pin: c.pin, gstin: c.gstin, phone: c.phone, email: c.email }
      : null;
  }
  if (q.leadId) {
    const l = await prisma.lead.findUnique({ where: { id: q.leadId } });
    return l
      ? { name: l.name, contact: l.name, addr: l.area, city: 'Chennai',
          pin: '', gstin: '', phone: l.phone, email: l.email }
      : null;
  }
  return null;
}

/**
 * The full document payload: party, owner and catalogue names resolved.
 * Custom lines (svId '') fall back to v1's literals — quotations.js:571,576.
 */
export async function composeQuote(prisma: PrismaService, q: QuoteRow) {
  const [party, svcs, user] = await Promise.all([
    partyOf(prisma, q),
    prisma.service.findMany({ select: { id: true, name: true, unit: true } }),
    q.owner
      ? prisma.user.findUnique({ where: { id: q.owner }, select: { name: true, sign: true } })
      : Promise.resolve(null),
  ]);
  const byId = new Map(svcs.map((s) => [s.id, s]));

  // The service information sheets uploaded on the catalogue — every quoted
  // service that has one travels with the document, so the customer reads
  // what the treatment involves right under the quotation.
  const sheets = await prisma.service.findMany({
    where: { id: { in: (q.items || []).map((i) => i.svId) }, NOT: { pdf: '' } },
    select: { id: true, name: true, pdf: true },
  });

  // Addresses as printed: what was typed on the quotation wins; a blank falls
  // back to the party record so old documents keep rendering.
  const partyAddr = party
    ? [party.addr, [party.city, party.pin].filter(Boolean).join(' ')].filter(Boolean).join('\n')
    : '';
  const billAddr = String(q.billAddr || '') || partyAddr;
  const shipAddr = String(q.shipAddr || '') || billAddr;

  return {
    ...q,
    billAddr,
    shipAddr,
    sheets,
    items: (q.items || []).map((i) => {
      const s = byId.get(i.svId);
      return { ...i, name: s ? s.name : 'Custom service', unit: s ? s.unit : 'nos' };
    }),
    party,
    partyName: party ? party.name : '—',
    ownerName: (user && user.name) || '—',
    ownerSign: (user && user.sign) || '',
  };
}
