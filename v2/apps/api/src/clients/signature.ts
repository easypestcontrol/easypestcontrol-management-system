/* ============================================================================
   A customer's signature, kept.

   A signature is collected once - on the salesperson's phone at the doorstep,
   or by the customer from the link - and then it is the customer's signature,
   not that one contract's. It is kept against the customer so the next
   agreement written for them starts signed instead of asking again at every
   renewal.

   Two rules live here because three controllers need them to agree:
   what counts as a signature at all, and when the copy on file is replaced.
   ========================================================================== */
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { nowStamp } from '../contracts/plan';

/* A drawn signature is a few kilobytes; a photograph pasted in its place is
   megabytes, and this field rides inside every contract read. */
const MAX_CHARS = 400_000;

/**
 * '' stays '' (an unsigned agreement is a legitimate state). Anything else has
 * to be a small inline image - the only thing the pads produce.
 */
export function cleanSign(v: unknown): string {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) {
    throw new BadRequestException('That is not a signature - please sign again');
  }
  if (s.length > MAX_CHARS) {
    throw new BadRequestException('The signature image is too large - please sign again');
  }
  return s;
}

/**
 * Keep this signature as the customer's own. A signature identical to the
 * one on file is that same signature being reused, not given again, so its
 * date does not move.
 */
export async function rememberSign(prisma: PrismaClient, clientId: string, sign: string) {
  if (!clientId || !sign) return;
  const cur = await prisma.clientSignature.findUnique({ where: { clientId } });
  if (cur?.sign === sign) return;
  const at = nowStamp();
  await prisma.clientSignature.upsert({
    where: { clientId }, create: { clientId, sign, at }, update: { sign, at },
  });
}
