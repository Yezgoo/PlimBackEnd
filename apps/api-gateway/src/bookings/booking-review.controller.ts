import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { callInternalService } from '../internal/internal-http.js';
import { UsersClient } from '../users/users.client.js';

@Controller('bookings/:id/review')
@UseGuards(HumanCallerGuard)
export class BookingReviewController {
  constructor(private readonly users: UsersClient) {}

  @Get()
  find(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.request(user, id);
  }

  @Post()
  create(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.request(user, id, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  private async request(user: JWTPayload, id: string, init?: RequestInit) {
    const customer = await this.users.findByAuth0Id(user.sub!);
    return callInternalService('reviews-service', process.env.REVIEWS_SERVICE_URL ?? 'http://localhost:3006',
      `/reviews/${id}?customerId=${encodeURIComponent(customer.id)}`, init);
  }
}
