import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { EventsPublisher } from '../src/events/events.publisher.js';
import { OutboxRelay } from '../src/events/outbox.relay.js';

// Boots the whole users-service with fake database and Kafka, and checks the internal-token rule.
describe('users-service (e2e)', () => {
  let app: INestApplication<App>;
  const secret = 'e2e-secret';

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = secret;
    const { UsersServiceModule } = await import('../src/users-service.module.js'); // after env is set

    const moduleRef = await Test.createTestingModule({ imports: [UsersServiceModule] })
      .overrideProvider(PrismaService)
      .useValue({ user: { findMany: vi.fn().mockResolvedValue([]) } })
      .overrideProvider(EventsPublisher)
      .useValue({ publish: vi.fn() })
      .overrideProvider(OutboxRelay)
      .useValue({ flush: vi.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects callers without the internal token', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('rejects a wrong internal token', () => {
    return request(app.getHttpServer()).get('/users').set('X-Internal-Token', 'guess').expect(401);
  });

  it('serves the gateway (right token)', () => {
    return request(app.getHttpServer()).get('/users').set('X-Internal-Token', secret).expect(200, []);
  });

  it('PATCH refuses fields a person may not change', () => {
    return request(app.getHttpServer())
      .patch('/users/by-auth0/auth0%7C1')
      .set('X-Internal-Token', secret)
      .send({ email: 'new@example.com' })
      .expect(400);
  });
});
