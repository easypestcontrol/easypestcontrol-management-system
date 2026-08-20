import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma.service';
// Global, like Prisma: every controller that stores a photograph needs it,
// and none of them should have to import a module to get one.
import { StorageService } from '../storage/storage.service';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-only-change-me-on-the-vps',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PrismaService, StorageService],
  exports: [AuthService, AuthGuard, PrismaService, StorageService],
})
export class AuthModule {}
