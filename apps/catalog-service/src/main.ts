import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { CatalogServiceModule } from './catalog-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(CatalogServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.CATALOG_SERVICE_PORT ?? 3002);
}
await bootstrap();
