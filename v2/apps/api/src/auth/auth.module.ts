import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma.service';
// Global, like Prisma: every controller that stores a photograph needs it,
// and none of them should have to import a module to get one.
import { StorageService } from '../storage/storage.service';
// Also global: ending a trip is a rule the Trips screen and a finished
// service both have to obey, and a trip that outlives its job is money the
// office cannot account for.
import { TripsService } from '../trips/trips.service';

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
  providers: [AuthService, AuthGuard, PrismaService, StorageService, TripsService],
  exports: [AuthService, AuthGuard, PrismaService, StorageService, TripsService],
})
export class AuthModule {}
