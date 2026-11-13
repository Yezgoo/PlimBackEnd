import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { CancellationService } from './cancellation.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import type { Booking } from '../generated/prisma/client.js';

// Bookings as the customer sees them. customerId always comes from the gateway (resolved from the token).
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly cancellation: CancellationService,
  ) {}

  @Post('preview')                            // POST /bookings/preview → the summary step, nothing saved
  @HttpCode(200)
  preview(@Body() dto: CreateBookingDto) {
    return this.bookings.previewWithTerms(dto);
  }

  @Post()                                     // POST /bookings → creates it, status "pending_payment"
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @Get()                                      // GET /bookings?customerId=<uuid>
  list(@Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.bookings.listForCustomer(customerId);
  }

  @Get('professional')
  listProfessional(@Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.bookings.listForProfessional(professionalId);
  }

  @Get('payment-settlements')
  settlements() {
    return this.bookings.pendingSettlements();
  }

  @Post(':id/payment-settled')
  @HttpCode(200)
  paymentSettled(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.markSettled(id);
  }

  @Get('professional/:id')
  findProfessional(@Param('id', ParseUUIDPipe) id: string, @Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.bookings.findForProfessional(id, professionalId);
  }

  @Post('professional/:id/status')
  @HttpCode(200)
  advanceProfessional(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('professionalId', ParseUUIDPipe) professionalId: string,
    @Body('status') status: Booking['status'],
  ) {
    return this.bookings.advanceForProfessional(id, professionalId, status);
  }

  @Post('professional/:id/cancel')            // the professional gives a job back: it goes to the next professional
  @HttpCode(200)
  cancelProfessional(@Param('id', ParseUUIDPipe) id: string, @Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.cancellation.cancelByProfessional(id, professionalId);
  }

  @Post(':id/cancel')                         // the customer cancels (free or with the late fee, as agreed when booking)
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.cancellation.cancelByCustomer(id, customerId);
  }

  @Post(':id/payment-succeeded')
  @HttpCode(200)
  paymentSucceeded(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payment: { intentId: string; eventId: string; amountCents: number; currency: string },
  ) {
    return this.bookings.recordPayment(id, payment);
  }

  @Post(':id/no-show')                        // the customer reports that nobody came: full refund
  @HttpCode(200)
  reportNoShow(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.cancellation.reportNoShow(id, customerId);
  }

  @Post(':id/confirm')                        // the customer confirms a finished job
  @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.bookings.confirmForCustomer(id, customerId);
  }

  @Get(':id')                                 // GET /bookings/<id>?customerId=<uuid> → with its status history
  find(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.bookings.findForCustomer(id, customerId);
  }
}
