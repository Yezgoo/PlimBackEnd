import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { UsersClient } from '../users/users.client.js';
import { BookingsClient } from './bookings.client.js';

// Jobs offered to the caller as a professional. Each offer has a deadline (expiresAt);
// declining it, or letting it pass, sends the job to the next professional.
@Controller('me/professional/offers')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeOffersController {
  constructor(
    private readonly bookings: BookingsClient,
    private readonly users: UsersClient,
  ) {}

  @Get()                                      // GET /me/professional/offers?status=pending
  async list(@CurrentUser() user: JWTPayload, @Query('status') status?: string) {
    return this.bookings.listOffers(await this.professionalId(user), status);
  }

  @Post(':id/accept')                         // take the job → the answer includes the full address
  @HttpCode(200)
  async accept(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.bookings.acceptOffer(id, await this.professionalId(user));
  }

  @Post(':id/decline')
  @HttpCode(200)
  async decline(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.bookings.declineOffer(id, await this.professionalId(user));
  }

  // 404 here means the caller never applied as a professional
  private async professionalId(user: JWTPayload) {
    return (await this.users.findProfessional(user.sub!)).id;
  }
}
