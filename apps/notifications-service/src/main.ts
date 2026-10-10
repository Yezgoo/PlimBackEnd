import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NotificationsServiceModule } from './notifications-service.module.js';

// No HTTP server: this service only reacts to Kafka events.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(NotificationsServiceModule);
  app.enableShutdownHooks(); // on Ctrl+C, run onModuleDestroy so the consumer leaves its group cleanly
}
await bootstrap();
