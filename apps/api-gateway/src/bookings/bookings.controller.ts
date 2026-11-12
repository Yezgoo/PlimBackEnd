import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { CatalogClient } from '../catalog/catalog.client.js';
import { UsersClient } from '../users/users.client.js';
import { BookingsClient, type BookingRequest, type ReviewedPrice } from './bookings.client.js';
import { PricingSettingsClient } from './pricing-settings.client.js';

// What the app sends: which service, where and when. Never the price or the customer.
export type BookingInput = {
  serviceSlug?: string;
  address?: { street?: string; details?: string; postalCode?: string; city?: string };
  scheduledStart?: string;
  notes?: string;
  reviewedPrice?: ReviewedPrice;
};

// The customer's bookings. The app's four steps (service, address, date and time, summary) end in
// POST /bookings/preview for the summary and POST /bookings to book.
@Controller('bookings')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class BookingsController {
  constructor(
    private readonly bookings: BookingsClient,
    private readonly users: UsersClient,
    private readonly catalog: CatalogClient,
    private readonly pricing: PricingSettingsClient,
  ) {}

  @Post('preview')                            // POST /bookings/preview → what the booking would be; saves nothing
  @HttpCode(200)
  async preview(@CurrentUser() user: JWTPayload, @Body() input: BookingInput) {
    return this.bookings.preview(await this.buildRequest(user, input));
  }

  @Post()                                     // POST /bookings → 201, status "pending_payment"
  async create(@CurrentUser() user: JWTPayload, @Body() input: BookingInput) {
    const request = await this.buildRequest(user, input);
    return this.bookings.create({ ...request, reviewedPrice: input.reviewedPrice });
  }

  @Get()                                      // GET /bookings → my bookings, latest first
  async list(@CurrentUser() user: JWTPayload) {
    return this.bookings.listForCustomer(await this.customerId(user));
  }

  @Get(':id')                                 // GET /bookings/<id> → one of my bookings, with its status history
  async find(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.bookings.findForCustomer(id, await this.customerId(user));
  }

  // 404 here means the person has no Plim profile yet (the app sends them to "complete profile")
  private async customerId(user: JWTPayload) {
    return (await this.users.findByAuth0Id(user.sub!)).id;
  }

  // Turns "this service, here, then" into a full booking request, using only trusted sources for
  // who is booking (the token), what it costs (the catalog) and whether we work there (the catalog).
  private async buildRequest(user: JWTPayload, input: BookingInput): Promise<BookingRequest> {
    const { serviceSlug, address, scheduledStart } = input ?? {};
    if (typeof serviceSlug !== 'string' || !serviceSlug) throw new BadRequestException('serviceSlug is required');
    if (typeof address?.postalCode !== 'string') throw new BadRequestException('address.postalCode is required');
    if (typeof scheduledStart !== 'string') throw new BadRequestException('scheduledStart is required');

    const [customerId, service, area, pricing] = await Promise.all([
      this.customerId(user),
      this.catalog.findBookingTerms(serviceSlug),      // 404 if the service doesn't exist (or was switched off)
      this.catalog.findArea(address.postalCode),      // 400 if it isn't a postal code
      this.pricing.read(),
    ]);

    if (service.pricingModel !== 'fixed') {
      throw new UnprocessableEntityException('This service cannot be booked directly yet');
    }
    // "3000" is enough to search, but a professional needs the full code to find the door
    if (!/^\d{4}-\d{3}$/.test(area.postalCode)) {
      throw new BadRequestException('address.postalCode must be complete, like 3000-123');
    }
    if (!area.available || !area.municipality) {
      throw new UnprocessableEntityException(`We don't work in postal code ${area.postalCode} yet`);
    }

    return {
      customerId,
      service: {
        id: service.id,
        slug: service.slug,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        vatRate: service.vatRate,
      },
      address: {
        street: address.street as string, // booking-service checks it is there
        details: address.details,
        postalCode: area.postalCode,      // normalised: "3000123" becomes "3000-123"
        city: address.city || area.municipality.name,
      },
      municipalityCode: area.municipality.code,
      scheduledStart,
      notes: input.notes,
      serviceFeeCents: pricing.serviceFeeCents,
      commissionBps: service.commissionBps ?? pricing.commissionBps,
    };
  }
}
