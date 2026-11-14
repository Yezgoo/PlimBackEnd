import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { PayoutAccountsService } from './payout-accounts.service.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly payouts: PayoutAccountsService) {}

  @Post('checkout/:id')
  @HttpCode(200)
  checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('customerId', ParseUUIDPipe) customerId: string,
    @Headers('x-internal-token') token?: string,
  ) {
    this.requireInternalToken(token);
    return this.payments.checkout(id, customerId);
  }

  @Get('payout-accounts/:id')
  payoutStatus(@Param('id', ParseUUIDPipe) id: string, @Headers('x-internal-token') token?: string) {
    this.requireInternalToken(token);
    return this.payouts.status(id);
  }

  @Post('payout-accounts/:id/onboarding')
  @HttpCode(200)
  payoutOnboarding(@Param('id', ParseUUIDPipe) id: string, @Headers('x-internal-token') token?: string) {
    this.requireInternalToken(token);
    return this.payouts.onboarding(id);
  }

  @Post('payout-accounts/:id/scrub')
  @HttpCode(200)
  scrubPayoutAccount(@Param('id', ParseUUIDPipe) id: string, @Headers('x-internal-token') token?: string) {
    this.requireInternalToken(token);
    return this.payouts.eraseLocalLink(id);
  }

  private requireInternalToken(token?: string) {
    const expected = Buffer.from(process.env.INTERNAL_SERVICE_TOKEN ?? '');
    const given = Buffer.from(token ?? '');
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Missing or invalid internal token');
    }
  }

  @Post('stripe/webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.webhook(req.rawBody, signature);
  }
}
