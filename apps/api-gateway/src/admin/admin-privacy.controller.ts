import { Body, ConflictException, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UnprocessableEntityException } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { callInternalService } from '../internal/internal-http.js';

type DeletionScope = { professionalId: string | null; frozenAt: string | null; bookingsCleanedAt: string | null; reviewsCleanedAt: string | null };

@Controller('admin/privacy')
export class AdminPrivacyController {
  private readonly baseUrl = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';
  private readonly bookingUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';

  @Get('deletions')
  @Header('Cache-Control', 'no-store')
  list() {
    return callInternalService('users-service', this.baseUrl, '/users/privacy/deletions');
  }

  @Get('deletions/:id/check')
  @Header('Cache-Control', 'no-store')
  async check(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingCheck(id, await this.professionalQuery(id));
  }

  @Post('deletions/:id/cleanup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async cleanup(@Param('id', ParseUUIDPipe) id: string, @Body('confirm') confirm: unknown) {
    if (confirm !== true) throw new UnprocessableEntityException('Confirma a limpeza dos dados.');
    const scope = await this.scope(id);
    if (scope.bookingsCleanedAt && scope.reviewsCleanedAt) return { cleaned: true };
    const query = this.professionalParam(scope.professionalId);
    const { openBookings, unsettledPayments } = await this.bookingCheck(id, query);
    if (openBookings || unsettledPayments) {
      throw new ConflictException('Existem marcações em aberto ou pagamentos por liquidar.');
    }
    if (!scope.frozenAt) await callInternalService('users-service', this.baseUrl, `/users/privacy/deletions/${id}/freeze`, { method: 'POST' });
    const frozen = await this.scope(id);
    if (!frozen.bookingsCleanedAt) {
      await callInternalService('booking-service', this.bookingUrl,
        `/privacy/${id}/scrub${this.professionalParam(frozen.professionalId)}`, { method: 'POST' });
      await this.checkpoint(id, 'bookings');
    }
    if (!frozen.reviewsCleanedAt) {
      await callInternalService('reviews-service', process.env.REVIEWS_SERVICE_URL ?? 'http://localhost:3006',
        `/reviews/privacy/${id}/scrub`, { method: 'POST' });
      await this.checkpoint(id, 'reviews');
    }
    return { cleaned: true };
  }

  @Post('deletions/:id/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string) {
    return callInternalService('users-service', this.baseUrl, `/users/privacy/deletions/${id}/start`, {
      method: 'POST', body: JSON.stringify({ admin: user.sub }),
    });
  }

  @Post('deletions/:id/finalize')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async finalize(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string,
    @Body('providerCleanupConfirmed') confirmed: unknown) {
    if (confirmed !== true) throw new UnprocessableEntityException('Confirma a conclusão da limpeza nos fornecedores.');
    const path = `/users/privacy/deletions/${id}`;
    const receipt = await callInternalService<{ completedAt: string | null }>('users-service', this.baseUrl, `${path}/receipt`);
    if (receipt.completedAt) return receipt;
    const scope = await this.scope(id);
    if (!scope.frozenAt || !scope.bookingsCleanedAt || !scope.reviewsCleanedAt) {
      throw new ConflictException('Conclui a limpeza de marcações e avaliações primeiro.');
    }
    await callInternalService('booking-service', this.bookingUrl,
      `/privacy/${id}/scrub${this.professionalParam(scope.professionalId)}`, { method: 'POST' });
    await callInternalService('reviews-service', process.env.REVIEWS_SERVICE_URL ?? 'http://localhost:3006',
      `/reviews/privacy/${id}/scrub`, { method: 'POST' });
    if (scope.professionalId) {
      await callInternalService('payments-service', process.env.PAYMENTS_SERVICE_URL ?? 'http://localhost:3005',
        `/payout-accounts/${scope.professionalId}/scrub`, { method: 'POST' });
    }
    return callInternalService('users-service', this.baseUrl, `${path}/finalize`, {
      method: 'POST', body: JSON.stringify({ admin: user.sub }),
    });
  }

  private async professionalQuery(id: string) {
    return this.professionalParam((await this.scope(id)).professionalId);
  }

  private scope(id: string) {
    return callInternalService<DeletionScope>('users-service', this.baseUrl, `/users/privacy/deletions/${id}/scope`);
  }

  private checkpoint(id: string, step: 'bookings' | 'reviews') {
    return callInternalService('users-service', this.baseUrl, `/users/privacy/deletions/${id}/checkpoint`, {
      method: 'POST', body: JSON.stringify({ step }),
    });
  }

  private professionalParam(professionalId: string | null) {
    return professionalId ? `?professionalId=${encodeURIComponent(professionalId)}` : '';
  }

  private bookingCheck(id: string, query: string) {
    return callInternalService<{ openBookings: number; unsettledPayments: number }>(
      'booking-service', this.bookingUrl, `/privacy/${id}/deletion-check${query}`);
  }
}
