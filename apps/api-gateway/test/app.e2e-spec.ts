import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, it } from 'vitest';

// Boots the whole gateway (global AuthGuard included) and checks who gets in.
describe('api-gateway (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.AUTH0_ISSUER_URL = 'https://example.eu.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.plim.app';
    process.env.CATALOG_SERVICE_URL = 'http://127.0.0.1:1'; // nothing listens there
    const { ApiGatewayModule } = await import('../src/api-gateway.module.js'); // after env is set

    const moduleRef = await Test.createTestingModule({ imports: [ApiGatewayModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /whoami without a token → 401', () => {
    return request(app.getHttpServer()).get('/whoami').expect(401);
  });

  it('GET /me with a garbage token → 401', () => {
    return request(app.getHttpServer()).get('/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('the catalog is public: no token gets past the guard (503 here, since catalog-service is not running)', () => {
    return request(app.getHttpServer()).get('/catalog/categories').expect(503);
  });

  it('GET /admin/me without a token → 401', () => {
    return request(app.getHttpServer()).get('/admin/me').expect(401);
  });

  it('PATCH /admin/settings is protected', () => {
    return request(app.getHttpServer()).patch('/admin/settings/commission_default').send({ value: 2100 }).expect(401);
  });

  it('protects the admin booking list and coupon writes', async () => {
    await request(app.getHttpServer()).get('/admin/bookings').expect(401);
    await request(app.getHttpServer()).post('/admin/coupons').send({ code: 'WELCOME5', fixedCents: 500 }).expect(401);
    await request(app.getHttpServer()).patch('/admin/coupons/WELCOME5').send({ active: false }).expect(401);
  });

  it('requires authentication for marketplace metrics', () => {
    return request(app.getHttpServer()).get('/admin/metrics?days=7').expect(401);
  });

  it('protects privacy exports, deletion requests, and the deletion queue', async () => {
    await request(app.getHttpServer()).get('/me/privacy/export').expect(401);
    await request(app.getHttpServer()).get('/me/privacy/deletion').expect(401);
    await request(app.getHttpServer()).post('/me/privacy/deletion').send({ confirm: true }).expect(401);
    await request(app.getHttpServer()).get('/admin/privacy/deletions').expect(401);
    await request(app.getHttpServer()).post('/admin/privacy/deletions/11111111-1111-4111-8111-111111111111/cleanup')
      .send({ confirm: true }).expect(401);
    await request(app.getHttpServer()).get('/admin/privacy/deletions/11111111-1111-4111-8111-111111111111/check').expect(401);
    await request(app.getHttpServer()).post('/admin/privacy/deletions/11111111-1111-4111-8111-111111111111/start')
      .send({ admin: 'forged' }).expect(401);
  });

  it('a route nobody marked @Public() is protected by default', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });
});
