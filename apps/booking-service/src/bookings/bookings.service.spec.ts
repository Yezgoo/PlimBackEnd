import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BookingsService } from './bookings.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

// "now" is fixed, so the date rules can be tested exactly
const NOW = new Date('2026-11-16T10:00:00Z');

const dto = (overrides: Partial<CreateBookingDto> = {}): CreateBookingDto => ({
  customerId: '11111111-1111-4111-8111-111111111111',
  service: {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'desentupimento-lavatorio-sanita',
    name: 'Desentupimento de lavatório ou sanita',
    durationMinutes: 60,
    priceCents: 6500,
    vatRate: 0.23,
  },
  address: { street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000-389', city: 'Coimbra' },
  municipalityCode: '0603',
  scheduledStart: '2026-11-18T15:00:00Z',
  notes: 'Tocar à campainha',
  ...overrides,
});

describe('BookingsService', () => {
  const prismaMock = { booking: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() } };
  let service: BookingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.booking.findFirst.mockResolvedValue(null);
    prismaMock.booking.create.mockImplementation(async ({ data }) => ({ id: 'booking-1', status: 'pending_payment', ...data, vatRate: new Prisma.Decimal(data.vatRate) }));
    service = new BookingsService(prismaMock as unknown as PrismaService);
  });

  afterEach(() => vi.useRealTimers());

  describe('create()', () => {
    it('saves copies of the service, price and address, and ends after the service duration', async () => {
      const result = await service.create(dto());

      const data = prismaMock.booking.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        customerId: '11111111-1111-4111-8111-111111111111',
        serviceName: 'Desentupimento de lavatório ou sanita',
        priceCents: 6500,
        durationMinutes: 60,
        municipalityCode: '0603',
        address: { street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000-389', city: 'Coimbra' },
      });
      expect(data.scheduledStart).toEqual(new Date('2026-11-18T15:00:00Z'));
      expect(data.scheduledEnd).toEqual(new Date('2026-11-18T16:00:00Z'));
      expect(result.vatRate).toBe(0.23);
      expect(result.totalCents).toBe(6500);
    });

    it('starts as pending_payment and writes the first line of its history', async () => {
      await service.create(dto());

      const data = prismaMock.booking.create.mock.calls[0][0].data;
      expect(data.status).toBeUndefined(); // the database default decides, never the caller
      expect(data.events.create).toEqual({
        fromStatus: null,
        toStatus: 'pending_payment',
        changedBy: '11111111-1111-4111-8111-111111111111',
      });
    });

    it('refuses the same service at the same time twice (double tap)', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1' });

      await expect(service.create(dto())).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.booking.create).not.toHaveBeenCalled();
      // a cancelled booking does not block booking that slot again
      expect(prismaMock.booking.findFirst.mock.calls[0][0].where.status).toEqual({ not: 'cancelled' });
    });
  });

  describe('when a booking may start', () => {
    const start = (scheduledStart: string) => () => service.preview(dto({ scheduledStart }));

    it('accepts two hours from now, on a quarter of an hour', () => {
      expect(start('2026-11-16T12:00:00Z')).not.toThrow();
      expect(start('2026-11-16T12:15:00Z')).not.toThrow();
    });

    it('refuses anything sooner than two hours, or in the past', () => {
      expect(start('2026-11-16T11:45:00Z')).toThrow('at least 2 hours');
      expect(start('2026-11-15T15:00:00Z')).toThrow(BadRequestException);
    });

    it('refuses more than 90 days ahead', () => {
      expect(start('2027-02-13T10:00:00Z')).not.toThrow(); // 89 days
      expect(start('2027-02-15T10:00:00Z')).toThrow('90 days');
    });

    it('refuses a start that is not on a quarter of an hour', () => {
      expect(start('2026-11-18T15:10:00Z')).toThrow('quarter of an hour');
      expect(start('2026-11-18T15:00:30Z')).toThrow('quarter of an hour');
    });
  });

  it('preview() returns the summary and saves nothing', () => {
    const summary = service.preview(dto());

    expect(summary).toMatchObject({
      service: { name: 'Desentupimento de lavatório ou sanita', durationMinutes: 60 },
      priceCents: 6500,
      totalCents: 6500,
      currency: 'EUR',
      scheduledEnd: new Date('2026-11-18T16:00:00Z'),
    });
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it('listForCustomer() only returns that customer\'s bookings, latest first', async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);

    await service.listForCustomer('customer-1');

    expect(prismaMock.booking.findMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      orderBy: { scheduledStart: 'desc' },
    });
  });

  it('findForCustomer() never finds another customer\'s booking', async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);

    await expect(service.findForCustomer('booking-1', 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.booking.findFirst.mock.calls[0][0].where).toEqual({ id: 'booking-1', customerId: 'someone-else' });
  });
});
