import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Booking } from '../generated/prisma/client.js';
import { OffersService } from '../offers/offers.service.js';
import { SettingsReader } from '../settings/settings.reader.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

// When a job may be booked for
export const MIN_LEAD_MINUTES = 120; // not sooner than 2 hours from now: a professional has to be found and get there
export const MAX_DAYS_AHEAD = 90;
export const START_STEP_MINUTES = 15; // 10:00, 10:15, 10:30 ... keeps timetables tidy

// Hours after "done" before a job is confirmed automatically, when admin-service has no value for it
export const DEFAULT_RELEASE_AFTER_HOURS = 48;

const MINUTE = 60_000;
const history = { orderBy: { at: 'asc' }, select: { fromStatus: true, toStatus: true, at: true } } as const;

const previousStatus = new Map<string, Booking['status']>([
  ['en_route', 'accepted'],
  ['in_progress', 'en_route'],
  ['done', 'in_progress'],
]);

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OffersService,
    private readonly settings: SettingsReader,
  ) {}

  // The last step of the booking screens: "this is what you are about to book". Saves nothing.
  preview(dto: CreateBookingDto) {
    const { scheduledStart, scheduledEnd } = this.schedule(dto);
    return {
      service: { id: dto.service.id, slug: dto.service.slug, name: dto.service.name, durationMinutes: dto.service.durationMinutes },
      address: dto.address,
      municipalityCode: dto.municipalityCode,
      scheduledStart,
      scheduledEnd,
      priceCents: dto.service.priceCents,
      serviceFeeCents: dto.serviceFeeCents,
      vatRate: dto.service.vatRate,
      totalCents: dto.service.priceCents + dto.serviceFeeCents,
      currency: 'EUR',
      notes: dto.notes ?? null,
    };
  }

  async create(dto: CreateBookingDto) {
    const preview = this.preview(dto);
    const { scheduledStart, scheduledEnd, priceCents, serviceFeeCents, totalCents } = preview;
    const { reviewedPrice, commissionBps } = dto;
    if (reviewedPrice && (reviewedPrice.priceCents !== priceCents || reviewedPrice.serviceFeeCents !== serviceFeeCents)) {
      throw new ConflictException({ code: 'BOOKING_PRICE_CHANGED', message: 'Review the updated booking price', preview });
    }
    // Round half a cent up using integer arithmetic. The customer fee is outside this split.
    const commissionCents = Math.floor((priceCents * commissionBps + 5_000) / 10_000);

    // a double tap on "Marcar" must not create two bookings
    const duplicate = await this.prisma.booking.findFirst({
      where: {
        customerId: dto.customerId,
        serviceTypeId: dto.service.id,
        scheduledStart,
        status: { not: 'cancelled' },
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('You already have this service booked for that time');

    const booking = await this.prisma.booking.create({
      data: {
        customerId: dto.customerId,
        serviceTypeId: dto.service.id,
        serviceSlug: dto.service.slug,
        serviceName: dto.service.name,
        durationMinutes: dto.service.durationMinutes,
        address: { ...dto.address },
        municipalityCode: dto.municipalityCode,
        scheduledStart,
        scheduledEnd,
        priceCents,
        serviceFeeCents,
        totalCents,
        commissionBps,
        commissionCents,
        proPayoutCents: priceCents - commissionCents,
        vatRate: dto.service.vatRate,
        notes: dto.notes,
        // the first line of the booking's history
        events: { create: { fromStatus: null, toStatus: 'pending_payment', changedBy: dto.customerId } },
      },
    });

    // Until payments exist (roadmap step 12), a new booking goes straight to finding a professional.
    // With PAYMENTS_REQUIRED=true it waits in "pending_payment" for the payment to arrive first.
    if (process.env.PAYMENTS_REQUIRED !== 'true') {
      try {
        await this.offers.start(booking.id);
      } catch (e) {
        // the booking exists; the sweeper will ask a professional as soon as it can
        this.logger.warn(`Booking ${booking.id} created, but no professional could be asked yet: ${(e as Error).message}`);
      }
      return this.present(await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    }
    return this.present(booking);
  }

  // Next job first is what a person wants to see: upcoming at the top, history below
  async listForCustomer(customerId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { customerId },
      orderBy: { scheduledStart: 'desc' },
    });
    return bookings.map((booking) => this.present(booking));
  }

  // Looked up together with its owner, so nobody can read someone else's booking by guessing an id
  async findForCustomer(id: string, customerId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId },
      include: { events: history },
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return this.present(booking);
  }

  async listForProfessional(professionalId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { professionalId },
      orderBy: { scheduledStart: 'desc' },
    });
    return bookings.map((booking) => this.present(booking, true));
  }

  async findForProfessional(id: string, professionalId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, professionalId },
      include: { events: history },
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return this.present(booking, true);
  }

  async advanceForProfessional(id: string, professionalId: string, status: Booking['status']) {
    const fromStatus = previousStatus.get(status);
    if (!fromStatus) throw new BadRequestException('Unsupported booking status');

    // "done" starts the clock: the customer confirms, or it is confirmed automatically at releaseAt
    let finished = {};
    if (status === 'done') {
      const hours = await this.settings.number('release_after_hours', 'RELEASE_AFTER_HOURS', DEFAULT_RELEASE_AFTER_HOURS);
      const doneAt = new Date();
      finished = { doneAt, releaseAt: new Date(doneAt.getTime() + hours * 60 * MINUTE) };
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.booking.updateMany({
        where: { id, professionalId, status: fromStatus },
        data: { status, ...finished },
      });
      if (moved.count) {
        await tx.bookingEvent.create({ data: { bookingId: id, fromStatus, toStatus: status, changedBy: professionalId } });
      }
      const current = await tx.booking.findFirst({ where: { id, professionalId }, include: { events: history } });
      if (!current) throw new NotFoundException(`Booking ${id} not found`);
      if (current.status !== status) throw new ConflictException('Booking cannot move to that status');
      return current;
    });
    return this.present(booking, true);
  }

  // The customer says "yes, the work was done". This is what releases the professional's payment.
  async confirmForCustomer(id: string, customerId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.booking.updateMany({
        where: { id, customerId, status: 'done' },
        data: { status: 'confirmed', confirmedAt: new Date() },
      });
      if (moved.count) {
        await tx.bookingEvent.create({ data: { bookingId: id, fromStatus: 'done', toStatus: 'confirmed', changedBy: customerId } });
      }
      const current = await tx.booking.findFirst({ where: { id, customerId }, include: { events: history } });
      if (!current) throw new NotFoundException(`Booking ${id} not found`);
      // already confirmed (a second tap, or the automatic confirmation got there first) is fine
      if (current.status !== 'confirmed') throw new ConflictException('Only a finished job can be confirmed');
      return current;
    });
    return this.present(booking);
  }

  // Called by the sweeper: jobs finished long enough ago, with no answer from the customer, are confirmed
  // so the professional is not left waiting for their money. (A disputed job is not "done", so it is skipped.)
  async autoConfirmDue() {
    const due = await this.prisma.booking.findMany({
      where: { status: 'done', releaseAt: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    let confirmed = 0;
    for (const { id } of due) {
      confirmed += await this.prisma.$transaction(async (tx) => {
        // only succeeds if the customer did not confirm (or dispute) in the meantime
        const moved = await tx.booking.updateMany({
          where: { id, status: 'done' },
          data: { status: 'confirmed', confirmedAt: new Date() },
        });
        if (moved.count) {
          await tx.bookingEvent.create({ data: { bookingId: id, fromStatus: 'done', toStatus: 'confirmed', changedBy: null } });
        }
        return moved.count;
      });
    }
    if (confirmed) this.logger.log(`Confirmed ${confirmed} finished job(s) automatically`);
    return confirmed;
  }

  private schedule(dto: CreateBookingDto) {
    const scheduledStart = new Date(dto.scheduledStart);
    const now = Date.now();

    if (scheduledStart.getTime() < now + MIN_LEAD_MINUTES * MINUTE) {
      throw new BadRequestException(`A booking must start at least ${MIN_LEAD_MINUTES / 60} hours from now`);
    }
    if (scheduledStart.getTime() > now + MAX_DAYS_AHEAD * 24 * 60 * MINUTE) {
      throw new BadRequestException(`A booking can be made at most ${MAX_DAYS_AHEAD} days ahead`);
    }
    if (scheduledStart.getTime() % (START_STEP_MINUTES * MINUTE) !== 0) {
      throw new BadRequestException(`A booking must start on a quarter of an hour, e.g. 10:00 or 10:15`);
    }

    const scheduledEnd = new Date(scheduledStart.getTime() + dto.service.durationMinutes * MINUTE);
    return { scheduledStart, scheduledEnd };
  }

  // Plain values for JSON: the VAT rate as a number (Prisma returns a Decimal object)
  private present<T extends Booking>(booking: T, professional = false) {
    const { commissionBps: _commissionBps, commissionCents: _commissionCents, proPayoutCents, ...details } = booking;
    return {
      ...details,
      vatRate: Number(booking.vatRate),
      ...(professional ? { proPayoutCents } : {}),
    };
  }
}
