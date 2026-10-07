import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { UsersServiceModule } from './users-service.module.js';
import { ValidationPipe } from '@nestjs/common';



async function bootstrap() {
  const app = await NestFactory.create(UsersServiceModule);

    app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strip fields that aren't in the DTO
      forbidNonWhitelisted: true, // ...or rather, reject the request if it has unknown fields
      transform: true,            // turn the JSON into a real DTO instance
    }),
  );

  await app.listen(process.env.port ?? 3001);
}
await bootstrap();
