import { BadRequestException, Body, Controller, HttpException, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { callInternalService } from '../internal/internal-http.js';
import { UsersClient } from './users.client.js';

@Controller('me/push')
@UseGuards(HumanCallerGuard)
export class MePushController {
  constructor(private readonly users: UsersClient) {}

  @Post('register')
  async register(@CurrentUser() user: JWTPayload, @Body('token') token: unknown) {
    const customer = await this.users.findByAuth0Id(user.sub!);
    const professional = await this.users.findProfessional(user.sub!).catch((error: unknown) => {
      if (error instanceof HttpException && error.getStatus() === 404) return null;
      throw error;
    });
    return this.request('register', token, customer.id, professional?.status === 'approved' ? professional.id : undefined);
  }

  @Post('remove')
  async remove(@CurrentUser() user: JWTPayload, @Body('token') token: unknown) {
    const customer = await this.users.findByAuth0Id(user.sub!);
    return this.request('remove', token, customer.id);
  }

  private request(action: string, token: unknown, userId: string, professionalId?: string) {
    if (typeof token !== 'string' || !/^(Expo|Exponent)PushToken\[[\w-]{1,128}\]$/.test(token)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    return callInternalService('booking-service', process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003',
      `/booking-push/${action}`, { method: 'POST', body: JSON.stringify({ token, userId, professionalId }) });
  }
}
