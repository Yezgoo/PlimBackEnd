import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BookingsService } from './bookings.service.js';
import { OffersService } from '../offers/offers.service.js';
import { SettingsReader } from '../settings/settings.reader.js';
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
  serviceFeeCents: 200,
  commissionBps: 2000,
  notes: 'Tocar à campainha',
  ...overrides,
});

describe('BookingsService', () => {
  const prismaMock = {
    booking: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    bookingEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const offersMock = { start: vi.fn() };
  // no admin-service in unit tests: every setting answers its default
  const settingsMock = { number: vi.fn(async (_key: string, _envName: string, fallback: number) => fallback) };
  let service: BookingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.booking.findFirst.mockResolvedValue(null);
    prismaMock.booking.create.mockImplementation(async ({ data }) => ({ id: 'booking-1', status: 'pending_payment', ...data, vatRate: new Prisma.Decimal(data.vatRate) }));
    // after dispatch starts, the booking is read again: by default hand back what was created
    prismaMock.booking.findUniqueOrThrow.mockImplementation(async () => prismaMock.booking.create.mock.results[0].value);
    delete process.env.PAYMENTS_REQUIRED;
    settingsMock.number.mockImplementation(async (_key: string, _envName: string, fallback: number) => fallback);
    service = new BookingsService(
      prismaMock as unknown as PrismaService,
      offersMock as unknown as OffersService,
      settingsMock as unknown as SettingsReader,
    );
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
        serviceFeeCents: 200,
        totalCents: 6700,
        commissionBps: 2000,
        commissionCents: 1300,
        proPayoutCents: 5200,
        durationMinutes: 60,
        municipalityCode: '0603',
        address: { street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000-389', city: 'Coimbra' },
      });
      expect(data.scheduledStart).toEqual(new Date('2026-11-18T15:00:00Z'));
      expect(data.scheduledEnd).toEqual(new Date('2026-11-18T16:00:00Z'));
      expect(result.vatRate).toBe(0.23);
      expect(result.totalCents).toBe(6700);
      expect(result).not.toHaveProperty('commissionCents');
      expect(result).not.toHaveProperty('proPayoutCents');
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

    it('starts looking for a professional right away while payments are not required', async () => {
      await service.create(dto());

      expect(offersMock.start).toHaveBeenCalledWith('booking-1');
    });

    it('waits for the payment when PAYMENTS_REQUIRED is on', async () => {
      process.env.PAYMENTS_REQUIRED = 'true';

      const result = await service.create(dto());

      expect(offersMock.start).not.toHaveBeenCalled();
      expect(result.status).toBe('pending_payment');
    });

    it('still creates the booking when no professional can be asked yet', async () => {
      offersMock.start.mockRejectedValueOnce(new Error('users-service is unavailable'));

      await expect(service.create(dto())).resolves.toMatchObject({ id: 'booking-1' });
    });

    it('refuses the same service at the same time twice (double tap)', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1' });

      await expect(service.create(dto())).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.booking.create).not.toHaveBeenCalled();
      // a cancelled booking does not block booking that slot again
      expect(prismaMock.booking.findFirst.mock.calls[0][0].where.status).toEqual({ not: 'cancelled' });
    });

    it('rounds fractional commission cents and leaves the fee outside the split', async () => {
      await service.create(dto({ service: { ...dto().service, priceCents: 6502 }, commissionBps: 2500 }));
      expect(prismaMock.booking.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        commissionCents: 1626, proPayoutCents: 4876, totalCents: 6702,
      }) });
    });

    it('returns a fresh preview without creating a booking if the reviewed fee changed', async () => {
      await expect(service.create(dto({ reviewedPrice: { priceCents: 6500, serviceFeeCents: 150 } }))).rejects.toMatchObject({
        response: { code: 'BOOKING_PRICE_CHANGED', preview: { priceCents: 6500, serviceFeeCents: 200, totalCents: 6700 } },
      });
      expect(prismaMock.booking.create).not.toHaveBeenCalled();
      expect(offersMock.start).not.toHaveBeenCalled();
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
      serviceFeeCents: 200,
      totalCents: 6700,
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

  describe('professional status updates', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (work) => work(prismaMock));
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    });

    it.each([
      ['accepted', 'en_route'],
      ['en_route', 'in_progress'],
      ['in_progress', 'done'],
    ] as const)('records %s → %s for the assigned professional', async (fromStatus, status) => {
      prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
      const event = { fromStatus, toStatus: status, at: NOW };
      prismaMock.booking.findFirst.mockResolvedValue({ status, events: [event], vatRate: 0.23 });

      await expect(service.advanceForProfessional('booking-1', 'pro-1', status)).resolves.toMatchObject({ status, events: [event] });
      expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', professionalId: 'pro-1', status: fromStatus },
        // "done" also starts the 48 hour clock towards automatic confirmation
        data: status === 'done' ? { status, doneAt: NOW, releaseAt: new Date(NOW.getTime() + 48 * 3_600_000) } : { status },
      });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus, toStatus: status, changedBy: 'pro-1' },
      });
    });

    it('returns the existing status for a retry without writing another event', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ status: 'en_route', vatRate: 0.23 });
      await expect(service.advanceForProfessional('booking-1', 'pro-1', 'en_route')).resolves.toMatchObject({ status: 'en_route' });
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });

    it('rejects skipped states, unsupported targets, and bookings owned by someone else', async () => {
      prismaMock.booking.findFirst.mockResolvedValueOnce({ status: 'accepted' });
      await expect(service.advanceForProfessional('booking-1', 'pro-1', 'done')).rejects.toBeInstanceOf(ConflictException);
      await expect(service.advanceForProfessional('booking-1', 'pro-2', 'en_route')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.advanceForProfessional('booking-1', 'pro-1', 'confirmed')).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('confirming a finished job', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (work) => work(prismaMock));
      prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    });

    it('uses the admin setting for how long the customer has to answer', async () => {
      settingsMock.number.mockResolvedValue(24);
      prismaMock.booking.findFirst.mockResolvedValue({ status: 'done', vatRate: 0.23 });

      await service.advanceForProfessional('booking-1', 'pro-1', 'done');

      expect(settingsMock.number).toHaveBeenCalledWith('release_after_hours', 'RELEASE_AFTER_HOURS', 48);
      expect(prismaMock.booking.updateMany.mock.calls[0][0].data.releaseAt).toEqual(new Date(NOW.getTime() + 24 * 3_600_000));
    });

    it('lets the customer confirm, and writes it in the history under their name', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ status: 'confirmed', vatRate: 0.23 });

      await expect(service.confirmForCustomer('booking-1', 'customer-1')).resolves.toMatchObject({ status: 'confirmed' });
      expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', customerId: 'customer-1', status: 'done' },
        data: { status: 'confirmed', confirmedAt: NOW },
      });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus: 'done', toStatus: 'confirmed', changedBy: 'customer-1' },
      });
    });

    it('a second confirmation changes nothing and is not an error', async () => {
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.booking.findFirst.mockResolvedValue({ status: 'confirmed', vatRate: 0.23 });

      await expect(service.confirmForCustomer('booking-1', 'customer-1')).resolves.toMatchObject({ status: 'confirmed' });
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });

    it('refuses to confirm a job that is not finished yet', async () => {
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.booking.findFirst.mockResolvedValue({ status: 'in_progress', vatRate: 0.23 });

      await expect(service.confirmForCustomer('booking-1', 'customer-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('never confirms another customer\'s booking', async () => {
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.booking.findFirst.mockResolvedValue(null);

      await expect(service.confirmForCustomer('booking-1', 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('autoConfirmDue() confirms jobs whose time is up, as the system', async () => {
      prismaMock.booking.findMany.mockResolvedValue([{ id: 'booking-1' }, { id: 'booking-2' }]);

      await expect(service.autoConfirmDue()).resolves.toBe(2);

      expect(prismaMock.booking.findMany.mock.calls[0][0].where).toEqual({ status: 'done', releaseAt: { lte: NOW } });
      expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', status: 'done' },
        data: { status: 'confirmed', confirmedAt: NOW },
      });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-2', fromStatus: 'done', toStatus: 'confirmed', changedBy: null },
      });
    });

    it('autoConfirmDue() writes no history when the customer got there first', async () => {
      prismaMock.booking.findMany.mockResolvedValue([{ id: 'booking-1' }]);
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.autoConfirmDue()).resolves.toBe(0);
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });
  });
});
