/* ============================================================================
   Secrets at rest. Every stored key — Ola, Razorpay, credential API tokens —
   is sealed with AES-256-GCM before it touches the database, so a database
   dump or a stray SELECT shows ciphertext, not credentials.

   The sealing key derives from JWT_SECRET (set a strong one on the VPS — it
   then protects both sessions and stored keys). Values written before this
   existed pass through open() unchanged and get sealed the next time they
   are saved.
   ========================================================================== */
import * as crypto from 'crypto';

const PREFIX = 'enc1:';

function masterKey(): Buffer {
  const seed = process.env.JWT_SECRET || 'dev-only-change-me-on-the-vps';
  return crypto.createHash('sha256').update('pestops.secrets.' + seed).digest();
}

/** Encrypt a value for storage. Empty stays empty; sealed stays sealed. */
export function seal(value: string): string {
  const v = String(value || '');
  if (!v || v.startsWith(PREFIX)) return v;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(v, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a stored value. Legacy plaintext passes through untouched. */
export function open(value: string | null | undefined): string {
  const v = String(value || '');
  if (!v.startsWith(PREFIX)) return v;
  try {
    const raw = Buffer.from(v.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    // Wrong master key (JWT_SECRET changed) — surface emptiness, not garbage.
    return '';
  }
}
