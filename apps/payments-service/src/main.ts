import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PaymentsModule } from './payments.module.js';

const app = await NestFactory.create(PaymentsModule, { rawBody: true });
app.enableShutdownHooks();
await app.listen(process.env.PAYMENTS_SERVICE_PORT ?? 3005);
