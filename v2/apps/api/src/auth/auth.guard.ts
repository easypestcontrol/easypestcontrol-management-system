import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

/** Mark a route as reachable without a token (login, customer approve pages). */
export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Restrict a route to specific roles: @Roles('admin', 'ops') */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    // Media elements (the training <video>) cannot send headers, so a token
    // may also arrive as ?t= on the URL.
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      String((req.query && req.query.t) || '');
    if (!token) throw new UnauthorizedException('Not signed in');

    try {
      req.user = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Session expired — sign in again');
    }

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    // 403, not 401. The token is perfectly good — this person simply may not
    // call this route. The web client signs you out on a 401, so answering a
    // role refusal with one would throw a technician back to the login screen
    // for tapping something that was never his to tap.
    if (roles?.length && roles.indexOf(req.user.role) < 0) {
      throw new ForbiddenException('Not allowed for your role');
    }
    return true;
  }
}
