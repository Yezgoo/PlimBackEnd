import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { OffersService } from './offers.service.js';
import { SettingsReader } from '../settings/settings.reader.js';
import { ProfessionalsDirectory } from './professionals.directory.js';

const NOW = new Date('2026-11-16T10:00:00Z');

const booking = (overrides = {}) => ({
  id: 'booking-1',
  customerId: 'user-customer',
  professionalId: null,
  serviceTypeId: 'svc-1',
  serviceName: 'Desentupimento',
  durationMinutes: 60,
  municipalityCode: '0603',
  scheduledStart: new Date('2026-11-18T15:00:00Z'),
  scheduledEnd: new Date('2026-11-18T16:00:00Z'),
  priceCents: 6500,
  currency: 'EUR',
  notes: 'Tocar à campainha',
  address: { street: 'Rua da Sofia 10', postalCode: '3000-389', city: 'Coimbra' },
  status: 'finding_pro',
  offers: [] as object[],
  ...overrides,
});

const candidate = (id: string, userId = `user-${id}`) => ({ id, userId, name: id, ratingAvg: null, ratingCount: 0 });

const offer = (overrides = {}) => ({
  id: 'offer-1',
  bookingId: 'booking-1',
  professionalId: 'pro-a',
  position: 1,
  status: 'pending',
  offeredAt: NOW,
  expiresAt: new Date(NOW.getTime() + 15 * 60_000),
  respondedAt: null,
  booking: booking(),
  ...overrides,
});

describe('OffersService', () => {
  const prismaMock = {
    booking: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    bookingOffer: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    bookingEvent: { create: vi.fn() },
    // run the transaction callback against the same fake, like a real transaction would
    $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prismaMock)),
  };
  const directoryMock = { eligibleFor: vi.fn() };
  // like the real reader: an environment variable wins, otherwise the default (no admin-service in unit tests)
  const settingsMock = {
    number: vi.fn(async (_key: string, envName: string, fallback: number) =>
      process.env[envName] ? Number(process.env[envName]) : fallback,
    ),
  };
  let service: OffersService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    delete process.env.OFFER_TIMEOUT_MINUTES;
    delete process.env.MAX_OFFERS;
    prismaMock.booking.findUnique.mockResolvedValue(booking());
    prismaMock.booking.findMany.mockResolvedValue([]); // nobody is busy
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.bookingOffer.updateMany.mockResolvedValue({ count: 1 });
    directoryMock.eligibleFor.mockResolvedValue([candidate('pro-a'), candidate('pro-b')]);
    settingsMock.number.mockImplementation(async (_key: string, envName: string, fallback: number) =>
      process.env[envName] ? Number(process.env[envName]) : fallback,
    );
    service = new OffersService(
      prismaMock as unknown as PrismaService,
      directoryMock as unknown as ProfessionalsDirectory,
      settingsMock as unknown as SettingsReader,
    );
  });

  afterEach(() => vi.useRealTimers());

  const cancelledAsNoProFound = () =>
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: 'finding_pro' },
      data: { status: 'cancelled', cancelReason: 'no_pro_found' },
    });

  describe('offerNext()', () => {
    it('asks the first eligible professional, with a 15 minute deadline', async () => {
      await service.offerNext('booking-1');

      expect(directoryMock.eligibleFor).toHaveBeenCalledWith({
        serviceTypeId: 'svc-1',
        municipalityCode: '0603',
        start: new Date('2026-11-18T15:00:00Z'),
        end: new Date('2026-11-18T16:00:00Z'),
      });
      expect(prismaMock.bookingOffer.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', professionalId: 'pro-a', position: 1, expiresAt: new Date('2026-11-16T10:15:00Z') },
      });
    });

    it('skips professionals already asked and asks the next one', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(
        booking({ offers: [{ professionalId: 'pro-a', status: 'declined' }] }),
      );

      await service.offerNext('booking-1');

      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data).toMatchObject({ professionalId: 'pro-b', position: 2 });
    });

    it('skips a professional who already has a job at that time', async () => {
      prismaMock.booking.findMany.mockResolvedValue([{ professionalId: 'pro-a' }]);

      await service.offerNext('booking-1');

      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data.professionalId).toBe('pro-b');
      // "busy" = another booking of theirs, accepted or under way, overlapping this one
      expect(prismaMock.booking.findMany.mock.calls[0][0].where).toMatchObject({
        id: { not: 'booking-1' },
        status: { in: ['accepted', 'en_route', 'in_progress'] },
        scheduledStart: { lt: new Date('2026-11-18T16:00:00Z') },
        scheduledEnd: { gt: new Date('2026-11-18T15:00:00Z') },
      });
    });

    it('never offers a booking to the customer who made it', async () => {
      directoryMock.eligibleFor.mockResolvedValue([candidate('pro-a', 'user-customer'), candidate('pro-b')]);

      await service.offerNext('booking-1');

      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data.professionalId).toBe('pro-b');
    });

    it('does nothing while someone is still being asked', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(booking({ offers: [{ professionalId: 'pro-a', status: 'pending' }] }));

      await service.offerNext('booking-1');

      expect(directoryMock.eligibleFor).not.toHaveBeenCalled();
      expect(prismaMock.bookingOffer.create).not.toHaveBeenCalled();
    });

    it('does nothing for a booking that is no longer looking', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(booking({ status: 'accepted' }));

      await service.offerNext('booking-1');

      expect(prismaMock.bookingOffer.create).not.toHaveBeenCalled();
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled();
    });

    it('cancels the booking as "no_pro_found" when nobody is left to ask', async () => {
      directoryMock.eligibleFor.mockResolvedValue([candidate('pro-a')]);
      prismaMock.booking.findUnique.mockResolvedValue(booking({ offers: [{ professionalId: 'pro-a', status: 'expired' }] }));

      await service.offerNext('booking-1');

      expect(prismaMock.bookingOffer.create).not.toHaveBeenCalled();
      cancelledAsNoProFound();
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus: 'finding_pro', toStatus: 'cancelled', changedBy: null },
      });
    });

    it('takes the deadline and the limit from the admin settings', async () => {
      settingsMock.number.mockImplementation(async (key: string) => (key === 'offer_timeout_minutes' ? 30 : 5));

      await service.offerNext('booking-1');

      expect(settingsMock.number).toHaveBeenCalledWith('offer_timeout_minutes', 'OFFER_TIMEOUT_MINUTES', 15);
      expect(settingsMock.number).toHaveBeenCalledWith('max_offers', 'MAX_OFFERS', 5);
      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data.expiresAt).toEqual(new Date('2026-11-16T10:30:00Z'));
    });

    it('gives up after MAX_OFFERS professionals, even if more exist', async () => {
      process.env.MAX_OFFERS = '2';
      prismaMock.booking.findUnique.mockResolvedValue(
        booking({ offers: [{ professionalId: 'pro-x', status: 'declined' }, { professionalId: 'pro-y', status: 'expired' }] }),
      );

      await service.offerNext('booking-1');

      expect(directoryMock.eligibleFor).not.toHaveBeenCalled();
      cancelledAsNoProFound();
    });

    it('gives up when the job\'s start time has already passed', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(booking({ scheduledStart: new Date('2026-11-16T09:00:00Z') }));

      await service.offerNext('booking-1');

      cancelledAsNoProFound();
    });

    it('lets users-service being down surface, so the caller can retry later', async () => {
      directoryMock.eligibleFor.mockRejectedValue(new Error('users-service is unavailable'));

      await expect(service.offerNext('booking-1')).rejects.toThrow('unavailable');
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled(); // not treated as "nobody found"
    });

    it('accepts losing a race for the same professional', async () => {
      prismaMock.bookingOffer.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.offerNext('booking-1')).resolves.toBeUndefined();
    });
  });

  it('start() moves the booking to finding_pro, writes history, and asks the first professional', async () => {
    await service.start('booking-1');

    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: 'pending_payment' },
      data: { status: 'finding_pro' },
    });
    expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
      data: { bookingId: 'booking-1', fromStatus: 'pending_payment', toStatus: 'finding_pro', changedBy: null },
    });
    expect(prismaMock.bookingOffer.create).toHaveBeenCalledTimes(1);
  });

  it('start() does nothing for a booking that already started', async () => {
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

    await service.start('booking-1');

    expect(prismaMock.bookingOffer.create).not.toHaveBeenCalled();
  });

  describe('accept()', () => {
    it('assigns the booking to the professional and reveals the address', async () => {
      prismaMock.bookingOffer.findFirst
        .mockResolvedValueOnce(offer())
        .mockResolvedValueOnce(offer({ status: 'accepted', booking: booking({ status: 'accepted', professionalId: 'pro-a' }) }));

      const result = await service.accept('offer-1', 'pro-a');

      expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', status: 'finding_pro' },
        data: { status: 'accepted', professionalId: 'pro-a' },
      });
      expect(prismaMock.bookingEvent.create).toHaveBeenCalledWith({
        data: { bookingId: 'booking-1', fromStatus: 'finding_pro', toStatus: 'accepted', changedBy: 'pro-a' },
      });
      expect(result.status).toBe('accepted');
      expect(result.booking.address).toMatchObject({ street: 'Rua da Sofia 10' });
      expect(result.booking.notes).toBe('Tocar à campainha');
    });

    it('refuses an offer whose deadline passed', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer({ expiresAt: new Date('2026-11-16T09:59:00Z') }));

      await expect(service.accept('offer-1', 'pro-a')).rejects.toThrow('no longer available');
      expect(prismaMock.booking.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an offer already answered', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer({ status: 'declined' }));

      await expect(service.accept('offer-1', 'pro-a')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when the professional took another job at that time in the meantime', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer());
      prismaMock.booking.findMany.mockResolvedValue([{ professionalId: 'pro-a' }]);

      await expect(service.accept('offer-1', 'pro-a')).rejects.toThrow('already have a job');
    });

    it('refuses when the booking stopped looking between the check and the update (e.g. cancelled)', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer());
      prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept('offer-1', 'pro-a')).rejects.toThrow('no longer available');
      expect(prismaMock.bookingEvent.create).not.toHaveBeenCalled();
    });

    it('never finds another professional\'s offer', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(null);

      await expect(service.accept('offer-1', 'pro-b')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.bookingOffer.findFirst.mock.calls[0][0].where).toEqual({ id: 'offer-1', professionalId: 'pro-b' });
    });
  });

  describe('decline()', () => {
    it('marks the offer declined and asks the next professional', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer());
      prismaMock.booking.findUnique.mockResolvedValue(booking({ offers: [{ professionalId: 'pro-a', status: 'declined' }] }));

      await service.decline('offer-1', 'pro-a');

      expect(prismaMock.bookingOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', status: 'pending' },
        data: { status: 'declined', respondedAt: NOW },
      });
      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data.professionalId).toBe('pro-b');
    });

    it('still records the decline when the next professional cannot be asked right now', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer());
      directoryMock.eligibleFor.mockRejectedValue(new Error('users-service is unavailable'));

      await expect(service.decline('offer-1', 'pro-a')).resolves.toBeDefined();
    });

    it('refuses to decline an offer that is no longer pending', async () => {
      prismaMock.bookingOffer.findFirst.mockResolvedValue(offer({ status: 'expired' }));
      prismaMock.bookingOffer.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.decline('offer-1', 'pro-a')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('the sweeper\'s jobs', () => {
    it('expireDue() closes offers past their deadline and asks the next professional', async () => {
      prismaMock.bookingOffer.findMany.mockResolvedValue([{ id: 'offer-1', bookingId: 'booking-1' }]);
      prismaMock.booking.findUnique.mockResolvedValue(booking({ offers: [{ professionalId: 'pro-a', status: 'expired' }] }));

      await service.expireDue();

      expect(prismaMock.bookingOffer.findMany.mock.calls[0][0].where).toEqual({ status: 'pending', expiresAt: { lte: NOW } });
      expect(prismaMock.bookingOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', status: 'pending' },
        data: { status: 'expired', respondedAt: NOW },
      });
      expect(prismaMock.bookingOffer.create.mock.calls[0][0].data.professionalId).toBe('pro-b');
    });

    it('expireDue() does not ask anyone when another copy of the service already expired the offer', async () => {
      prismaMock.bookingOffer.findMany.mockResolvedValue([{ id: 'offer-1', bookingId: 'booking-1' }]);
      prismaMock.bookingOffer.updateMany.mockResolvedValue({ count: 0 });

      await service.expireDue();

      expect(prismaMock.bookingOffer.create).not.toHaveBeenCalled();
    });

    it('retryStalled() asks a professional for bookings that are looking with nobody being asked', async () => {
      prismaMock.booking.findMany.mockResolvedValueOnce([{ id: 'booking-1' }]).mockResolvedValue([]);

      await service.retryStalled();

      expect(prismaMock.booking.findMany.mock.calls[0][0].where).toEqual({
        status: 'finding_pro',
        offers: { none: { status: 'pending' } },
      });
      expect(prismaMock.bookingOffer.create).toHaveBeenCalledTimes(1);
    });
  });

  it('a pending offer shows the job and the area, but not the door or the notes', async () => {
    prismaMock.bookingOffer.findMany.mockResolvedValue([offer()]);

    const [shown] = await service.listForProfessional('pro-a', 'pending');

    expect(prismaMock.bookingOffer.findMany.mock.calls[0][0].where).toEqual({ professionalId: 'pro-a', status: 'pending' });
    expect(shown.booking).toMatchObject({
      serviceName: 'Desentupimento',
      priceCents: 6500,
      city: 'Coimbra',
      postalArea: '3000',
      address: null,
      notes: null,
    });
  });
});
