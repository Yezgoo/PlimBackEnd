import { Body, Controller, Get, Header, HttpCode, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { callInternalService } from '../internal/internal-http.js';

@Controller('me/privacy')
@UseGuards(HumanCallerGuard)
export class MePrivacyController {
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(@CurrentUser() user: JWTPayload) {
    const account = await this.accountRequest<{ id: string; professional?: { id: string } | null }>(user.sub!, 'export');
    const professional = account.professional ? `?professionalId=${encodeURIComponent(account.professional.id)}` : '';
    const [bookings, reviews] = await Promise.all([
      callInternalService('booking-service', process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003', `/privacy/${account.id}/export${professional}`),
      callInternalService('reviews-service', process.env.REVIEWS_SERVICE_URL ?? 'http://localhost:3006', `/reviews/privacy/${account.id}`),
    ]);
    return { exportedAt: new Date().toISOString(), account, bookings, reviews };
  }

  @Get('deletion')
  @Header('Cache-Control', 'no-store')
  deletion(@CurrentUser() user: JWTPayload) {
    return this.accountRequest(user.sub!, 'deletion');
  }

  @Post('deletion')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  requestDeletion(@CurrentUser() user: JWTPayload, @Body('confirm') confirm: unknown) {
    if (confirm !== true) throw new UnprocessableEntityException('Confirma o pedido de eliminação.');
    return this.accountRequest(user.sub!, 'deletion', { method: 'POST' });
  }

  private accountRequest<T = unknown>(subject: string, action: string, init?: RequestInit) {
    return callInternalService<T>('users-service', process.env.USERS_SERVICE_URL ?? 'http://localhost:3001',
      `/users/by-auth0/${encodeURIComponent(subject)}/privacy/${action}`, init);
  }
}
