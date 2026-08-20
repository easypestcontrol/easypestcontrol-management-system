/* One-time: seal every stored secret (Ola / Razorpay keys, credential API
   tokens) with the same AES-256-GCM sealing the API now applies on write,
   and seed the per-document terms from the old shared list.
   Run from v2/:  node sealfill.mjs                                          */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
const p = new PrismaClient();

const PREFIX = 'enc1:';
const key = crypto.createHash('sha256')
  .update('pestops.secrets.' + (process.env.JWT_SECRET || 'dev-only-change-me-on-the-vps'))
  .digest();
const seal = (v) => {
  if (!v || v.startsWith(PREFIX)) return v;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(v, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
};

// -- company integrations + docTerms ----------------------------------------
const co = await p.company.findFirst();
if (co) {
  const ig = { ...(co.integrations || {}) };
  let sealed = 0;
  for (const k of Object.keys(ig)) {
    const v = seal(String(ig[k] || ''));
    if (v !== ig[k]) { ig[k] = v; sealed++; }
  }
  const dt = { ...(co.docTerms || {}) };
  if (!dt.quotation?.length) dt.quotation = co.terms || [];
  if (!dt.contract?.length) dt.contract = co.terms || [];
  if (!dt.invoice?.length) dt.invoice = [
    'Payment due within 15 days of invoice date.',
    'Interest at 18% p.a. applies on overdue amounts.',
    'Subject to Chennai jurisdiction.',
  ];
  if (!dt.service?.length) dt.service = [
    'Chemicals applied by licensed applicators as per CIB&RC guidelines.',
    'Warranty covers re-treatment of the same pest at the same site only.',
  ];
  await p.company.update({ where: { id: co.id }, data: { integrations: ig, docTerms: dt } });
  console.log('integration values sealed:', sealed, '| docTerms seeded:', Object.keys(dt).join(', '));
}

// -- credential secrets ------------------------------------------------------
const creds = await p.credential.findMany();
let n = 0;
for (const c of creds) {
  const data = {};
  for (const f of ['apiKey', 'apiSecret', 'accountRef', 'resourceRef']) {
    const v = seal(String(c[f] || ''));
    if (v !== c[f]) data[f] = v;
  }
  if (Object.keys(data).length) { await p.credential.update({ where: { id: c.id }, data }); n++; }
}
console.log('credentials sealed:', n, 'of', creds.length);
await p.$disconnect();
