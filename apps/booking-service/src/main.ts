import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { BookingServiceModule } from './booking-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(BookingServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.BOOKING_SERVICE_PORT ?? 3003);
}
await bootstrap();
