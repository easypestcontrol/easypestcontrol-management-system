import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  email: string;
  color: string;
  photo: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!u || !u.active) throw new UnauthorizedException('Wrong email or password');
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) throw new UnauthorizedException('Wrong email or password');

    const user: SessionUser = {
      id: u.id, name: u.name, role: u.role, email: u.email, color: u.color, photo: u.photo,
    };
    return { token: await this.jwt.signAsync({ sub: u.id, role: u.role }), user };
  }

  async me(userId: string): Promise<SessionUser> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    return { id: u.id, name: u.name, role: u.role, email: u.email, color: u.color, photo: u.photo };
  }
}
