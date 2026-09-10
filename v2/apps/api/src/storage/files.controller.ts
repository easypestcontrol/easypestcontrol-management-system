/* ============================================================================
   Serving what is in R2.

   The bucket stays private. Photographs come back through here, so the app
   decides who may look rather than the whole internet being able to.

   Two doors, deliberately:

     GET /files/*         signed in — the office and the technician
     GET /public/files/*  no token — a customer opening the report or the
                          quotation we sent them, which are already public
                          documents behind an unguessable id

   Keys are random UUIDs, so the public door exposes exactly the photograph
   whose link was shared, never a listing and never a neighbour.
   ========================================================================== */
import { Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, Public } from '../auth/auth.guard';
import { StorageService } from './storage.service';

function send(res: Response, file: { body: Buffer; type: string } | null) {
  if (!file) throw new NotFoundException('No such file');
  res.setHeader('Content-Type', file.type);
  // Immutable: the key is a UUID, so the bytes behind it never change.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(file.body);
}

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private storage: StorageService) {}

  /**
   * The app's own door — opened by a signature in the URL, not a header.
   *
   * It used to sit behind the login guard, which is correct for a fetch and
   * useless for a photograph: the app renders `<img src={photo}>`, the
   * browser asks for the URL with no Authorization header, and every
   * before-photo, after-photo and signature in the app came back 401 and drew
   * as a broken icon. The evidence a technician had taken was on screens
   * nobody could see it on.
   *
   * The URL carries an HMAC of the key instead (StorageService.url mints it).
   * Only this API can produce one, so the bucket is no more exposed than it
   * was — and an <img> tag can finally load what it is pointed at.
   */
  @Get('*key')
  @Public()
  async one(
    @Param('key') key: string | string[],
    @Query('s') sig: string,
    @Res() res: Response,
  ) {
    const path = Array.isArray(key) ? key.join('/') : key;
    // An unsigned request is not "unauthorised", it is a request for a file
    // this API never handed out. Say what a stranger should hear.
    if (!StorageService.verify(path, sig)) throw new NotFoundException('No such file');
    send(res, await this.storage.get(path));
  }
}

@Controller('public/files')
@UseGuards(AuthGuard)
export class PublicFilesController {
  constructor(private storage: StorageService) {}

  /**
   * The customer's door. A report or quotation link is already something we
   * emailed to them; the photographs on it have to load without a login.
   */
  @Get('*key')
  @Public()
  async one(@Param('key') key: string | string[], @Res() res: Response) {
    const path = Array.isArray(key) ? key.join('/') : key;
    send(res, await this.storage.get(path));
  }
}
