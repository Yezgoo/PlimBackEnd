import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Booking, type BookingOffer, type OfferStatus } from '../generated/prisma/client.js';
import { ProfessionalsDirectory } from './professionals.directory.js';

// How the search for a professional behaves. Read on each use, so a change in .env needs only a restart.
// (These become admin settings in roadmap step 12a.)
export const dispatchRules = () => ({
  offerMinutes: Number(process.env.OFFER_TIMEOUT_MINUTES ?? 15), // time a professional has to answer
  maxOffers: Number(process.env.MAX_OFFERS ?? 5),                // professionals asked before giving up
});

// A professional is busy when one of their jobs in these states overlaps the new one
const BUSY: Booking['status'][] = ['accepted', 'en_route', 'in_progress'];

type OfferWithBooking = BookingOffer & { booking: Booking };

// Finds a professional for a booking by asking one at a time:
//   start()     the booking begins looking ("finding_pro") and the first professional is asked
//   decline() / expireDue()   that professional said no or let the deadline pass → the next one is asked
//   accept()    the professional takes the job → the booking is "accepted"
//   nobody left → the booking is cancelled with reason "no_pro_found"
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProfessionalsDirectory,
  ) {}

  async start(bookingId: string) {
    const moved = await this.changeStatus(bookingId, 'pending_payment', { status: 'finding_pro' });
    if (moved) await this.offerNext(bookingId);
  }

  // Picks the next professional and asks them. Safe to call again: it does nothing when the booking
  // is no longer looking, or when someone is already being asked.
  async offerNext(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { offers: true } });
    if (!booking || booking.status !== 'finding_pro') return;
    if (booking.offers.some((offer) => offer.status === 'pending')) return;

    const { offerMinutes, maxOffers } = dispatchRules();
    if (booking.offers.length >= maxOffers || booking.scheduledStart <= new Date()) {
      return this.giveUp(booking.id);
    }

    const candidates = await this.directory.eligibleFor({
      serviceTypeId: booking.serviceTypeId,
      municipalityCode: booking.municipalityCode,
      start: booking.scheduledStart,
      end: booking.scheduledEnd,
    });
    const alreadyAsked = new Set(booking.offers.map((offer) => offer.professionalId));
    const busy = await this.busyAmong(candidates.map((candidate) => candidate.id), booking);
    const next = candidates.find(
      (candidate) =>
        !alreadyAsked.has(candidate.id) &&
        !busy.has(candidate.id) &&
        candidate.userId !== booking.customerId, // nobody is offered their own booking
    );
    if (!next) return this.giveUp(booking.id);

    try {
      await this.prisma.bookingOffer.create({
        data: {
          bookingId: booking.id,
          professionalId: next.id,
          position: booking.offers.length + 1,
          expiresAt: new Date(Date.now() + offerMinutes * 60_000),
        },
      });
    } catch (e) {
      // two callers picked the same professional at the same moment: the other one's offer stands
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      throw e;
    }
  }

  async accept(offerId: string, professionalId: string) {
    const offer = await this.offerOf(offerId, professionalId);
    const gone = new ConflictException('This offer is no longer available');
    if (offer.status !== 'pending' || offer.expiresAt <= new Date()) throw gone;

    const busy = await this.busyAmong([professionalId], offer.booking);
    if (busy.has(professionalId)) throw new ConflictException('You already have a job at that time');

    await this.prisma.$transaction(async (tx) => {
      // each step only succeeds if nothing changed in the meantime (a timeout, a cancellation)
      const claimed = await tx.bookingOffer.updateMany({
        where: { id: offer.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      if (!claimed.count) throw gone;

      const assigned = await tx.booking.updateMany({
        where: { id: offer.bookingId, status: 'finding_pro' },
        data: { status: 'accepted', professionalId },
      });
      if (!assigned.count) throw gone; // rolls the offer back too

      await tx.bookingEvent.create({
        data: { bookingId: offer.bookingId, fromStatus: 'finding_pro', toStatus: 'accepted', changedBy: professionalId },
      });
    });

    return this.presentOne(offerId, professionalId);
  }

  async decline(offerId: string, professionalId: string) {
    const offer = await this.offerOf(offerId, professionalId);
    const declined = await this.prisma.bookingOffer.updateMany({
      where: { id: offer.id, status: 'pending' },
      data: { status: 'declined', respondedAt: new Date() },
    });
    if (!declined.count) throw new ConflictException('This offer is no longer available');

    await this.offerNextSafely(offer.bookingId);
    return this.presentOne(offerId, professionalId);
  }

  // Called by the sweeper: offers nobody answered in time are closed and the next professional is asked
  async expireDue() {
    const due = await this.prisma.bookingOffer.findMany({
      where: { status: 'pending', expiresAt: { lte: new Date() } },
      select: { id: true, bookingId: true },
      take: 50,
    });
    for (const offer of due) {
      // only one copy of booking-service wins this update, so the next offer is created once
      const expired = await this.prisma.bookingOffer.updateMany({
        where: { id: offer.id, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });
      if (expired.count) await this.offerNextSafely(offer.bookingId);
    }
    return due.length;
  }

  // Called by the sweeper: bookings that are looking but have nobody being asked
  // (users-service was down when the offer should have been made) get another try
  async retryStalled() {
    const stalled = await this.prisma.booking.findMany({
      where: { status: 'finding_pro', offers: { none: { status: 'pending' } } },
      select: { id: true },
      take: 50,
    });
    for (const booking of stalled) await this.offerNextSafely(booking.id);
    return stalled.length;
  }

  async listForProfessional(professionalId: string, status?: OfferStatus) {
    const offers = await this.prisma.bookingOffer.findMany({
      where: { professionalId, ...(status ? { status } : {}) },
      orderBy: { offeredAt: 'desc' },
      include: { booking: true },
      take: 100,
    });
    return offers.map((offer) => this.present(offer));
  }

  // Used where a failure must not break the caller (the customer's request, the sweeper's loop)
  async offerNextSafely(bookingId: string) {
    try {
      await this.offerNext(bookingId);
    } catch (e) {
      this.logger.warn(`Could not offer booking ${bookingId} yet, will retry: ${(e as Error).message}`);
    }
  }

  private async giveUp(bookingId: string) {
    const cancelled = await this.changeStatus(bookingId, 'finding_pro', { status: 'cancelled', cancelReason: 'no_pro_found' });
    if (cancelled) this.logger.log(`Booking ${bookingId}: no professional found`);
  }

  // Moves a booking from one status to another and writes the history line, only if it is still in `from`
  private async changeStatus(bookingId: string, from: Booking['status'], data: { status: Booking['status']; cancelReason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({ where: { id: bookingId, status: from }, data });
      if (!count) return false;
      await tx.bookingEvent.create({ data: { bookingId, fromStatus: from, toStatus: data.status, changedBy: null } });
      return true;
    });
  }

  // Which of these professionals already have a job overlapping this booking's time
  private async busyAmong(professionalIds: string[], booking: Pick<Booking, 'id' | 'scheduledStart' | 'scheduledEnd'>) {
    if (!professionalIds.length) return new Set<string>();
    const overlapping = await this.prisma.booking.findMany({
      where: {
        id: { not: booking.id },
        professionalId: { in: professionalIds },
        status: { in: BUSY },
        scheduledStart: { lt: booking.scheduledEnd },
        scheduledEnd: { gt: booking.scheduledStart },
      },
      select: { professionalId: true },
    });
    return new Set(overlapping.map((other) => other.professionalId as string));
  }

  // An offer is only ever reached through the professional it was made to
  private async offerOf(offerId: string, professionalId: string): Promise<OfferWithBooking> {
    const offer = await this.prisma.bookingOffer.findFirst({ where: { id: offerId, professionalId }, include: { booking: true } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    return offer;
  }

  private async presentOne(offerId: string, professionalId: string) {
    return this.present(await this.offerOf(offerId, professionalId));
  }

  // What a professional sees. Before accepting: the job and the area, but not the door.
  // The full address and the customer's notes come with acceptance.
  private present(offer: OfferWithBooking) {
    const { booking } = offer;
    const address = booking.address as { street: string; details?: string; postalCode: string; city: string };
    const accepted = offer.status === 'accepted';
    return {
      id: offer.id,
      status: offer.status,
      offeredAt: offer.offeredAt,
      expiresAt: offer.expiresAt,
      respondedAt: offer.respondedAt,
      booking: {
        id: booking.id,
        status: booking.status,
        serviceName: booking.serviceName,
        durationMinutes: booking.durationMinutes,
        scheduledStart: booking.scheduledStart,
        scheduledEnd: booking.scheduledEnd,
        priceCents: booking.priceCents,
        proPayoutCents: booking.proPayoutCents,
        currency: booking.currency,
        city: address.city,
        postalArea: address.postalCode.slice(0, 4),
        address: accepted ? address : null,
        notes: accepted ? booking.notes : null,
      },
    };
  }
}
