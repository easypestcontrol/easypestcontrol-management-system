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
import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
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

  @Get('*key')
  async one(@Param('key') key: string | string[], @Res() res: Response) {
    const path = Array.isArray(key) ? key.join('/') : key;
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
