import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { DisputesService } from './disputes.service.js';

@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService, private readonly bookings: BookingsService) {}

  @Post('bookings/:id/dispute')
  @HttpCode(200)
  async open(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string, @Body('evidence') evidence: unknown) {
    await this.disputes.open(id, customerId, evidence);
    return this.bookings.findForCustomer(id, customerId);
  }

  @Get('disputes')
  list() {
    return this.disputes.listOpen();
  }

  @Post('disputes/:id/resolve')
  @HttpCode(200)
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() body: { decision?: unknown; admin?: unknown }) {
    return this.disputes.resolve(id, body?.decision, body?.admin);
  }
}
