import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';

// Boots the whole catalog-service with a fake database and checks the internal-token rule.
describe('catalog-service (e2e)', () => {
  let app: INestApplication<App>;
  const secret = 'e2e-secret';
  const categories = [{ id: 'c1', name: 'Limpezas', slug: 'limpezas', icon: null }];

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = secret;
    const { CatalogServiceModule } = await import('../src/catalog-service.module.js'); // after env is set

    const moduleRef = await Test.createTestingModule({ imports: [CatalogServiceModule] })
      .overrideProvider(PrismaService)
      .useValue({
        serviceCategory: { findMany: vi.fn().mockResolvedValue(categories) },
        serviceType: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects callers without the internal token', () => {
    return request(app.getHttpServer()).get('/categories').expect(401);
  });

  it('serves the gateway (right token)', () => {
    return request(app.getHttpServer()).get('/categories').set('X-Internal-Token', secret).expect(200, categories);
  });

  it('unknown service → 404', () => {
    return request(app.getHttpServer()).get('/services/nope').set('X-Internal-Token', secret).expect(404);
  });
});
