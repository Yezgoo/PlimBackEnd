import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

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

  @Get(':id')                                 // GET /bookings/<id>?customerId=<uuid> → with its status history
  find(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    return this.bookings.findForCustomer(id, customerId);
  }
}
