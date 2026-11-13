import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { OffersService } from '../offers/offers.service.js';
import { SettingsReader } from '../settings/settings.reader.js';
import { BookingsService } from './bookings.service.js';
import { CancellationService } from './cancellation.service.js';

const NOW = new Date('2026-11-16T10:00:00Z');

// a 65 € job + 2 € fee on Wednesday 18 Nov at 15:00, free to cancel until the day before at 15:00
const booking = (overrides = {}) => ({
  id: 'booking-1',
  customerId: 'customer-1',
  professionalId: 'pro-1',
  status: 'accepted',
  scheduledStart: new Date('2026-11-18T15:00:00Z'),
  totalCents: 6700,
  freeCancelUntil: new Date('2026-11-17T15:00:00Z'),
  lateCancelFeeCents: 1950,
  ...overrides,
});

describe('CancellationService', () => {
  const prismaMock = {
    booking: { findFirst: vi.fn(), updateMany: vi.fn() },
    bookingEvent: { create: vi.fn() },
    bookingOffer: { updateMany: vi.fn() },
    $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prismaMock)),
  };
  const bookingsMock = { findForCustomer: vi.fn() };
  const offersMock = { offerNextSafely: vi.fn() };
  const settingsMock = { number: vi.fn() };
  let service: CancellationService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.booking.findFirst.mockResolvedValue(booking());
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    bookingsMock.findForCustomer.mockResolvedValue({ id: 'booking-1', status: 'cancelled' });
    settingsMock.number.mockImplementation(async (_key: string, _envName: string, fallback: number) => fallback);
    service = new CancellationService(
      prismaMock as unknown as PrismaService,
      bookingsMock as unknown as BookingsService,
      offersMock as unknown as OffersService,
      settingsMock as unknown as SettingsReader,
    );
  });

  afterEach(() => vi.useRealTimers());

  const cancelledWith = (expected: object) =>
    expect(prismaMock.booking.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'cancelled', cancelledAt: new Date(), ...expected });

  describe('the customer cancels', () => {
    it.each(['pending_payment', 'finding_pro'])('for free while nobody has accepted (%s), even at the last minute', async (status) => {
      vi.setSystemTime(new Date('2026-11-18T14:00:00Z'));
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status, professionalId: null }));

      await service.cancelByCustomer('booking-1', 'customer-1');

      cancelledWith({ cancelReason: 'customer', cancellationFeeCents: 0, refundCents: 6700 });
    });

    it('for free after acceptance, while the free period lasts', async () => {
      await service.cancelByCustomer('booking-1', 'customer-1');

      cancelledWith({ cancelReason: 'customer', cancellationFeeCents: 0, refundCents: 6700 });
      expect(prismaMock.booking.updateMany.mock.calls[0][0].where).toEqual({ id: 'booking-1', status: 'accepted', professionalId: 'pro-1' });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus: 'accepted', toStatus: 'cancelled', changedBy: 'customer-1' },
      });
    });

    it('with the agreed late fee once the free period is over', async () => {
      vi.setSystemTime(new Date('2026-11-17T15:00:01Z')); // one second too late

      await service.cancelByCustomer('booking-1', 'customer-1');

      cancelledWith({ cancellationFeeCents: 1950, refundCents: 4750 });
    });

    it('uses the cancellation terms stored on the booking', async () => {
      vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
      prismaMock.booking.findFirst.mockResolvedValue(booking({ lateCancelFeeCents: 500 }));

      await service.cancelByCustomer('booking-1', 'customer-1');

      cancelledWith({ cancellationFeeCents: 500, refundCents: 6200 });
      expect(settingsMock.number).not.toHaveBeenCalled();
    });

    it('and any offer still waiting for an answer is withdrawn', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status: 'finding_pro', professionalId: null }));

      await service.cancelByCustomer('booking-1', 'customer-1');

      expect(prismaMock.bookingOffer.updateMany).toHaveBeenCalledWith({
        where: { bookingId: 'booking-1', status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });
    });

    it.each(['en_route', 'in_progress'])('not once the professional is on the way (%s)', async (status) => {
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status }));

      await expect(service.cancelByCustomer('booking-1', 'customer-1')).rejects.toThrow('already on the way');
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled();
    });

    it.each(['done', 'confirmed'])('not after the job is finished (%s)', async (status) => {
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status }));

      await expect(service.cancelByCustomer('booking-1', 'customer-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('a second tap on a cancelled booking changes nothing', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status: 'cancelled' }));

      await expect(service.cancelByCustomer('booking-1', 'customer-1')).resolves.toMatchObject({ status: 'cancelled' });
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a booking belonging to another customer', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(null);

      await expect(service.cancelByCustomer('booking-1', 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.booking.findFirst.mock.calls[0][0].where).toEqual({ id: 'booking-1', customerId: 'someone-else' });
    });

    it('fails cleanly if the booking changed while cancelling (e.g. the professional set off)', async () => {
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelByCustomer('booking-1', 'customer-1')).rejects.toThrow('changed in the meantime');
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('the customer reports a no-show', () => {
    it('30 minutes after the start time: cancelled with a full refund', async () => {
      vi.setSystemTime(new Date('2026-11-18T15:30:00Z'));

      await service.reportNoShow('booking-1', 'customer-1');

      cancelledWith({ cancelReason: 'no_show', cancellationFeeCents: 0, refundCents: 6700 });
    });

    it('is told to wait before the grace period is over', async () => {
      vi.setSystemTime(new Date('2026-11-18T15:29:00Z'));

      const error = await service.reportNoShow('booking-1', 'customer-1').catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'NO_SHOW_TOO_EARLY', reportableFrom: new Date('2026-11-18T15:30:00Z') });
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled();
    });

    it('uses the grace period from the admin settings', async () => {
      settingsMock.number.mockResolvedValue(10);
      vi.setSystemTime(new Date('2026-11-18T15:10:00Z'));

      await expect(service.reportNoShow('booking-1', 'customer-1')).resolves.toBeDefined();
      expect(settingsMock.number).toHaveBeenCalledWith('no_show_grace_minutes', 'NO_SHOW_GRACE_MINUTES', 30);
    });

    it.each(['finding_pro', 'in_progress', 'done'])('not for a job in status %s', async (status) => {
      vi.setSystemTime(new Date('2026-11-18T16:00:00Z'));
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status }));

      await expect(service.reportNoShow('booking-1', 'customer-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('the professional gives the job back', () => {
    it('the booking goes back to looking, their offer becomes a decline, and the next professional is asked', async () => {
      await expect(service.cancelByProfessional('booking-1', 'pro-1')).resolves.toEqual({ id: 'booking-1', released: true });

      expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', professionalId: 'pro-1', status: 'accepted' },
        data: { status: 'finding_pro', professionalId: null },
      });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus: 'accepted', toStatus: 'finding_pro', changedBy: 'pro-1' },
      });
      expect(prismaMock.bookingOffer.updateMany).toHaveBeenCalledWith({
        where: { bookingId: 'booking-1', professionalId: 'pro-1', status: 'accepted' },
        data: { status: 'declined', respondedAt: NOW },
      });
      expect(offersMock.offerNextSafely).toHaveBeenCalledWith('booking-1');
    });

    it('charges the customer nothing', async () => {
      await service.cancelByProfessional('booking-1', 'pro-1');

      expect(prismaMock.booking.updateMany.mock.calls[0][0].data).not.toHaveProperty('cancellationFeeCents');
    });

    it.each(['in_progress', 'done', 'confirmed'])('not once the job has started (%s)', async (status) => {
      prismaMock.booking.findFirst.mockResolvedValue(booking({ status }));

      await expect(service.cancelByProfessional('booking-1', 'pro-1')).rejects.toBeInstanceOf(ConflictException);
      expect(offersMock.offerNextSafely).not.toHaveBeenCalled();
    });

    it('never a job that is not theirs', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(null);

      await expect(service.cancelByProfessional('booking-1', 'pro-2')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.booking.findFirst.mock.calls[0][0].where).toEqual({ id: 'booking-1', professionalId: 'pro-2' });
    });
  });
});
