import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthGuard, Public } from './auth.guard';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(4) password: string;
}

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@Req() req: { user: { sub: string } }) {
    return this.auth.me(req.user.sub);
  }
}
