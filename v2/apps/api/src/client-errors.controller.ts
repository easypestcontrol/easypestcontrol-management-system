/* ============================================================================
   What broke on a phone we cannot plug a debugger into.

   The web app's error boundary posts here when a page throws: the path, the
   error's first line, the top of its stack, and the browser it happened in.
   It goes to the API's log and nowhere else - no table, no retention, no
   personal data - so the office can read `docker compose logs api` and see
   what a screenshot of the error card can never show.

   Public on purpose: the boundary may render after the session is gone,
   and a report that needs a token is a report that never arrives. The body
   is clipped hard so this cannot be used to fill the log.
   ========================================================================== */
import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './auth/auth.guard';

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

@Controller('client-errors')
export class ClientErrorsController {
  private log = new Logger('ClientError');

  @Public()
  @Post()
  @HttpCode(204)
  report(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const who = (req as Request & { user?: { sub?: string } }).user?.sub || 'anon';
    this.log.warn(
      `${clip(body.path, 120)} | ${clip(body.name, 60)}: ${clip(body.message, 300)} | ` +
      `stack: ${clip(body.stack, 600)} | ua: ${clip(body.ua, 160)} | by ${who}` +
      (body.digest ? ` | ref ${clip(body.digest, 40)}` : ''),
    );
    return;
  }
}
