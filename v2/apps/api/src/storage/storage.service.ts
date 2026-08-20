/* ============================================================================
   Where photographs live.

   Every before-photo, after-photo, uniform photo and signature arrives from the
   phone as a base64 data URL. Until now each one was written straight into the
   job's `exec` JSON column — a 218 KB row for a visit with four photographs,
   in a column PostgreSQL reads in full every time anybody opens that service.
   A year of work would be several gigabytes of base64 sitting in the middle of
   the hot path, and in every backup.

   So: the bytes go to Cloudflare R2 and the database keeps a key. The column
   goes from 218 KB to a few hundred characters.

   **It degrades on purpose.** With no R2 configured — a fresh clone, a
   developer's laptop, the first minutes of a deployment — `put` hands the data
   URL straight back and everything works exactly as it did. Nobody has to
   stand up object storage to run the app, and a misconfiguration in production
   costs quality of storage, never a lost photograph.
   ========================================================================== */
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

/** `r2:` marks a stored key. Anything else is a data URL we left alone. */
const PREFIX = 'r2:';

@Injectable()
export class StorageService {
  private readonly log = new Logger('Storage');
  private client: S3Client | null = null;
  private bucket = '';

  constructor() {
    const account = process.env.R2_ACCOUNT_ID || '';
    const key = process.env.R2_ACCESS_KEY_ID || '';
    const secret = process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucket = process.env.R2_BUCKET || '';

    if (!account || !key || !secret || !this.bucket) {
      this.log.warn('R2 not configured — photographs stay in the database as data URLs');
      return;
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: key, secretAccessKey: secret },
    });
    this.log.log(`R2 ready — bucket ${this.bucket}`);
  }

  get enabled() { return !!this.client; }

  /** Is this value a stored object rather than an inline data URL? */
  static isKey(v: string) { return typeof v === 'string' && v.startsWith(PREFIX); }
  static keyOf(v: string) { return v.slice(PREFIX.length); }

  /**
   * Store a data URL and return what belongs in the database.
   *
   * Returns the data URL unchanged when R2 is not configured, so callers never
   * branch on it: they store whatever comes back, and it works either way.
   */
  async put(dataUrl: string, folder: string): Promise<string> {
    if (!this.client || !dataUrl.startsWith('data:')) return dataUrl;

    const [head, b64] = dataUrl.split(';base64,');
    if (!b64) return dataUrl;
    const type = head.slice(5) || 'application/octet-stream';
    const ext = type.split('/')[1]?.split('+')[0] || 'bin';

    // A random name: unguessable, so a leaked link exposes one photograph and
    // never a directory, and two uploads can never collide.
    const key = `${folder}/${randomUUID()}.${ext}`;
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(b64, 'base64'),
        ContentType: type,
      }));
      return PREFIX + key;
    } catch (e) {
      // Storage failing must never lose the photograph the technician just
      // took. Keep it inline and say so — the visit is more important than
      // where its evidence is filed.
      this.log.error(`R2 put failed for ${key}: ${e instanceof Error ? e.message : e}`);
      return dataUrl;
    }
  }

  /** Store several at once, in order. */
  putAll(dataUrls: string[], folder: string) {
    return Promise.all(dataUrls.map((u) => this.put(u, folder)));
  }

  async get(key: string): Promise<{ body: Buffer; type: string } | null> {
    if (!this.client) return null;
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = Buffer.from(await r.Body!.transformToByteArray());
      return { body, type: r.ContentType || 'application/octet-stream' };
    } catch (e) {
      this.log.warn(`R2 get failed for ${key}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async remove(stored: string) {
    if (!this.client || !StorageService.isKey(stored)) return;
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket, Key: StorageService.keyOf(stored),
      }));
    } catch (e) {
      this.log.warn(`R2 delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * What the browser should load. A stored object is served back through the
   * API rather than from a public bucket — the bucket stays private, and the
   * app decides who may look.
   */
  static url(stored: string, pub = false): string {
    if (!StorageService.isKey(stored)) return stored;
    return (pub ? '/api/public/files/' : '/api/files/') + StorageService.keyOf(stored);
  }

  /**
   * Rewrite every image on an execution record to something a browser can
   * load, on the way out.
   *
   * Done here rather than in the front end on purpose: the screens render
   * `src={photo}` in half a dozen places, and a storage key that reached one
   * of them would show a broken image rather than an error. The database keeps
   * keys; the wire carries URLs; nothing above this line knows the difference.
   */
  static execUrls<T extends Record<string, unknown>>(exec: T | null, pub = false): T | null {
    if (!exec) return exec;
    const u = (v: unknown) => (typeof v === 'string' ? StorageService.url(v, pub) : v);
    const list = (v: unknown) => (Array.isArray(v) ? v.map(u) : v);
    return {
      ...exec,
      photosBefore: list(exec.photosBefore),
      photosAfter: list(exec.photosAfter),
      signatureImage: u(exec.signatureImage),
      uniformPhotos: exec.uniformPhotos && typeof exec.uniformPhotos === 'object'
        ? Object.fromEntries(
            Object.entries(exec.uniformPhotos as Record<string, unknown>).map(([k, v]) => [k, u(v)]),
          )
        : exec.uniformPhotos,
    };
  }
}
