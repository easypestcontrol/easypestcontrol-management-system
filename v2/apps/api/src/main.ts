import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { startPushWatcher } from './notifications/push';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  // Logos, signatures and job photos travel as data URLs; the default 100kb
  // body limit would reject the first real logo upload.
  app.use(json({ limit: '140mb' })); // training videos travel as base64
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT) || 4000);
  // Every Notification row becomes a phone push (once Firebase keys exist),
  // and the two daily digests fire from here too.
  startPushWatcher(app.get(PrismaService));
}
bootstrap();
