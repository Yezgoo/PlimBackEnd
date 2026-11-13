import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Booking } from '../generated/prisma/client.js';
import { OffersService } from '../offers/offers.service.js';
import { SettingsReader } from '../settings/settings.reader.js';
import { BookingsService } from './bookings.service.js';

export const DEFAULT_NO_SHOW_GRACE_MINUTES = 30;

// The cancellation rules, in one place:
//   customer, before a professional accepted ............ free
//   customer, after acceptance, before freeCancelUntil .. free
//   customer, after freeCancelUntil ..................... pays lateCancelFeeCents (both agreed when booking)
//   customer, once the professional is on the way ....... not possible here (support / dispute)
//   professional cancels ................................ customer pays nothing; the job goes to the next professional
//   professional does not show up ....................... the customer reports it after a grace period; full refund
// What is refunded is recorded here; moving the money is payments-service's job (roadmap step 12e).
@Injectable()
export class CancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly offers: OffersService,
    private readonly settings: SettingsReader,
  ) {}

  async cancelByCustomer(id: string, customerId: string) {
    const booking = await this.ofCustomer(id, customerId);
    if (booking.status === 'cancelled') return this.bookings.findForCustomer(id, customerId); // a second tap

    let feeCents: number;
    if (booking.status === 'pending_payment' || booking.status === 'finding_pro') {
      feeCents = 0; // nobody has committed to the job yet
    } else if (booking.status === 'accepted') {
      const free = !booking.freeCancelUntil || new Date() <= booking.freeCancelUntil;
      feeCents = free ? 0 : (booking.lateCancelFeeCents ?? 0);
    } else if (booking.status === 'en_route' || booking.status === 'in_progress') {
      throw new ConflictException('The professional is already on the way, so this booking can no longer be cancelled here');
    } else {
      throw new ConflictException('A finished booking cannot be cancelled');
    }

    await this.close(booking, { cancelReason: 'customer', feeCents, changedBy: customerId });
    return this.bookings.findForCustomer(id, customerId);
  }

  // "Nobody came." Possible once the start time plus a grace period has passed and the job never started.
  async reportNoShow(id: string, customerId: string) {
    const booking = await this.ofCustomer(id, customerId);
    if (booking.status === 'cancelled') return this.bookings.findForCustomer(id, customerId);
    if (booking.status !== 'accepted' && booking.status !== 'en_route') {
      throw new ConflictException('A no-show can only be reported for a job that has not started');
    }

    const graceMinutes = await this.settings.number('no_show_grace_minutes', 'NO_SHOW_GRACE_MINUTES', DEFAULT_NO_SHOW_GRACE_MINUTES);
    const reportableFrom = new Date(booking.scheduledStart.getTime() + graceMinutes * 60_000);
    if (new Date() < reportableFrom) {
      throw new ConflictException({
        code: 'NO_SHOW_TOO_EARLY',
        message: `A no-show can be reported from ${graceMinutes} minutes after the start time`,
        reportableFrom,
      });
    }

    await this.close(booking, { cancelReason: 'no_show', feeCents: 0, changedBy: customerId });
    return this.bookings.findForCustomer(id, customerId);
  }

  // The professional gives the job back. The customer keeps their booking: it is offered to the next professional.
  async cancelByProfessional(id: string, professionalId: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, professionalId } });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    if (booking.status !== 'accepted' && booking.status !== 'en_route') {
      throw new ConflictException('Only a job that has not started can be given back');
    }

    await this.prisma.$transaction(async (tx) => {
      const released = await tx.booking.updateMany({
        where: { id, professionalId, status: booking.status },
        data: { status: 'finding_pro', professionalId: null },
      });
      if (!released.count) throw new ConflictException('The booking changed in the meantime, try again');

      await tx.bookingEvent.create({
        data: { bookingId: id, fromStatus: booking.status, toStatus: 'finding_pro', changedBy: professionalId },
      });
      // their accepted offer becomes a decline, so they are not asked again for this booking
      await tx.bookingOffer.updateMany({
        where: { bookingId: id, professionalId, status: 'accepted' },
        data: { status: 'declined', respondedAt: new Date() },
      });
    });

    await this.offers.offerNextSafely(id);
    return { id, released: true };
  }

  private async ofCustomer(id: string, customerId: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, customerId } });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  // Marks the booking cancelled, records fee and refund, writes the history line and withdraws any pending offer
  private async close(booking: Booking, outcome: { cancelReason: string; feeCents: number; changedBy: string }) {
    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status, professionalId: booking.professionalId },
        data: {
          status: 'cancelled',
          cancelReason: outcome.cancelReason,
          cancelledAt: new Date(),
          cancellationFeeCents: outcome.feeCents,
          refundCents: booking.totalCents - outcome.feeCents,
        },
      });
      if (!closed.count) throw new ConflictException('The booking changed in the meantime, try again');

      await tx.bookingEvent.create({
        data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'cancelled', changedBy: outcome.changedBy },
      });
      await tx.bookingOffer.updateMany({
        where: { bookingId: booking.id, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });
    });
  }
}
