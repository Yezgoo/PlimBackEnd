import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import type { Booking } from '../generated/prisma/client.js';

// Bookings as the customer sees them. customerId always comes from the gateway (resolved from the token).
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('preview')                            // POST /bookings/preview → the summary step, nothing saved
  @HttpCode(200)
  preview(@Body() dto: CreateBookingDto) {
    return this.bookings.preview(dto);
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

  @Get(':id')                                 // GET /bookings/<id>?customerId=<uuid> → with its status history
  find(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.bookings.findForCustomer(id, customerId);
  }
}
