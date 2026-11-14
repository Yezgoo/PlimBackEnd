import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BookingsClient } from './bookings.client.js';

@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly bookings: BookingsClient) {}

  @Get()
  list() {
    return this.bookings.listDisputes();
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string, @Body('decision') decision: unknown) {
    return this.bookings.resolveDispute(id, decision, user.sub!);
  }
}
