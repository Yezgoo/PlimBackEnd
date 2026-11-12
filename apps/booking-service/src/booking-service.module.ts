import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalTokenGuard } from './auth/internal-token.guard.js';
import { BookingsModule } from './bookings/bookings.module.js';

@Module({
  imports: [BookingsModule],
  providers: [
    { provide: APP_GUARD, useClass: InternalTokenGuard }, // every route requires the gateway's secret
  ],
})
export class BookingServiceModule {}
