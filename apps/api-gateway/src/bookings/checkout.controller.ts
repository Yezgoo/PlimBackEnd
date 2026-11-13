import { Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { callInternalService } from '../internal/internal-http.js';
import { UsersClient } from '../users/users.client.js';

@Controller('bookings')
@UseGuards(HumanCallerGuard)
export class CheckoutController {
  constructor(private readonly users: UsersClient) {}

  @Post(':id/checkout')
  @HttpCode(200)
  async checkout(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.users.findByAuth0Id(user.sub!);
    return callInternalService('payments-service', process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3005', `/checkout/${id}`, {
      method: 'POST', body: JSON.stringify({ customerId: customer.id }),
    });
  }
}
