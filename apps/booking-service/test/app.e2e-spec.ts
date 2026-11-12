import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';

// Boots the whole booking-service with a fake database and checks who gets in and what is accepted.
describe('booking-service (e2e)', () => {
  let app: INestApplication<App>;
  const secret = 'e2e-secret';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const professionalId = '33333333-3333-4333-8333-333333333333';
  const bookingId = '44444444-4444-4444-8444-444444444444';

  const validBooking = () => ({
    customerId,
    service: {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'limpeza-domestica-3h',
      name: 'Limpeza doméstica (3 h)',
      durationMinutes: 180,
      priceCents: 4500,
      vatRate: 0.23,
    },
    address: { street: 'Rua da Sofia 10', postalCode: '3000-389', city: 'Coimbra' },
    municipalityCode: '0603',
    serviceFeeCents: 200,
    commissionBps: 2000,
    // tomorrow at a round hour: always inside the allowed window
    scheduledStart: new Date(Math.ceil((Date.now() + 24 * 3_600_000) / 3_600_000) * 3_600_000).toISOString(),
  });

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = secret;
    const { BookingServiceModule } = await import('../src/booking-service.module.js'); // after env is set

    const moduleRef = await Test.createTestingModule({ imports: [BookingServiceModule] })
      .overrideProvider(PrismaService)
      .useValue({ booking: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) } })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).set('X-Internal-Token', secret).send(body);

  it('rejects callers without the internal token', () => {
    return request(app.getHttpServer()).get(`/bookings?customerId=${customerId}`).expect(401);
  });

  it('lists a customer\'s bookings for the gateway', () => {
    return request(app.getHttpServer()).get(`/bookings?customerId=${customerId}`).set('X-Internal-Token', secret).expect(200, []);
  });

  it('needs to know whose bookings to list', () => {
    return request(app.getHttpServer()).get('/bookings').set('X-Internal-Token', secret).expect(400);
  });

  it('routes the professional list separately from customer booking details', () => {
    return request(app.getHttpServer())
      .get(`/bookings/professional?professionalId=${professionalId}`)
      .set('X-Internal-Token', secret)
      .expect(200, []);
  });

  it('rejects unsupported professional status targets over HTTP', () => {
    return post(`/bookings/professional/${bookingId}/status?professionalId=${professionalId}`, { status: 'confirmed' })
      .expect(400, { statusCode: 400, message: 'Unsupported booking status', error: 'Bad Request' });
  });

  it('previews a valid booking', () => {
    return post('/bookings/preview', validBooking()).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ priceCents: 4500, serviceFeeCents: 200, totalCents: 4700 });
      expect(body).not.toHaveProperty('commissionBps');
    });
  });

  it('returns the updated price breakdown when the reviewed price no longer matches', () => {
    return post('/bookings', { ...validBooking(), reviewedPrice: { priceCents: 4500, serviceFeeCents: 150 } })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'BOOKING_PRICE_CHANGED',
          preview: { priceCents: 4500, serviceFeeCents: 200, totalCents: 4700 },
        });
      });
  });

  it('refuses a booking with an incomplete postal code', () => {
    const body = validBooking();
    return post('/bookings/preview', { ...body, address: { ...body.address, postalCode: '3000' } }).expect(400);
  });

  it('refuses a status sent by the caller', () => {
    return post('/bookings/preview', { ...validBooking(), status: 'confirmed' }).expect(400);
  });

  it('refuses a price of zero', () => {
    const body = validBooking();
    return post('/bookings/preview', { ...body, service: { ...body.service, priceCents: 0 } }).expect(400);
  });
});
