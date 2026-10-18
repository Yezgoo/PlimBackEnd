import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module.js';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);

  // Browsers only let the web app (Expo web on :8081) call the gateway if it's listed here.
  // The phone app doesn't need this: CORS is a browser-only rule.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:8081').split(','),
  });

  await app.listen(process.env.GATEWAY_PORT ?? 3000);
}
await bootstrap();
