import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AdminServiceModule } from './admin-service.module.js';

const app = await NestFactory.create(AdminServiceModule);
app.enableShutdownHooks();
await app.listen(process.env.ADMIN_SERVICE_PORT ?? 3004);
