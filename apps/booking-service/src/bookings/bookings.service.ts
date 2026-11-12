import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Booking } from '../generated/prisma/client.js';
import { OffersService } from '../offers/offers.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

// When a job may be booked for
export const MIN_LEAD_MINUTES = 120; // not sooner than 2 hours from now: a professional has to be found and get there
export const MAX_DAYS_AHEAD = 90;
export const START_STEP_MINUTES = 15; // 10:00, 10:15, 10:30 ... keeps timetables tidy

const MINUTE = 60_000;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OffersService,
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
      vatRate: dto.service.vatRate,
      totalCents: dto.service.priceCents, // service fee and coupons are added in a later step
      currency: 'EUR',
      notes: dto.notes ?? null,
    };
  }

  async create(dto: CreateBookingDto) {
    const { scheduledStart, scheduledEnd } = this.schedule(dto);

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
        priceCents: dto.service.priceCents,
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
      include: { events: { orderBy: { at: 'asc' }, select: { fromStatus: true, toStatus: true, at: true } } },
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return this.present(booking);
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
  private present<T extends Booking>(booking: T) {
    return { ...booking, vatRate: Number(booking.vatRate), totalCents: booking.priceCents };
  }
}
