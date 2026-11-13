import { Controller, ForbiddenException, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { callInternalService } from '../internal/internal-http.js';
import { UsersClient } from '../users/users.client.js';

@Controller('me/professional/payout-account')
@UseGuards(HumanCallerGuard)
export class PayoutAccountController {
  constructor(private readonly users: UsersClient) {}

  @Get()
  status(@CurrentUser() user: JWTPayload) {
    return this.request(user);
  }

  @Post('onboarding')
  @HttpCode(200)
  onboarding(@CurrentUser() user: JWTPayload) {
    return this.request(user, true);
  }

  private async request(user: JWTPayload, onboarding = false) {
    const professional = await this.users.findProfessional(user.sub!);
    if (professional.status !== 'approved') throw new ForbiddenException('An approved professional profile is required');
    const path = `/payout-accounts/${encodeURIComponent(professional.id)}`;
    return callInternalService('payments-service', process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3005',
      onboarding ? `${path}/onboarding` : path, { method: onboarding ? 'POST' : 'GET' });
  }
}
