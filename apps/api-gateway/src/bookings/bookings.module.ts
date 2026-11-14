import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { UsersModule } from '../users/users.module.js';
import { BookingsClient } from './bookings.client.js';
import { BookingsController } from './bookings.controller.js';
import { MeOffersController } from './me-offers.controller.js';
import { PricingSettingsClient } from './pricing-settings.client.js';
import { CheckoutController } from './checkout.controller.js';
import { PayoutAccountController } from './payout-account.controller.js';
import { BookingReviewController } from './booking-review.controller.js';
import { AdminDisputesController } from './admin-disputes.controller.js';

@Module({
  imports: [UsersModule, CatalogModule],
  controllers: [BookingsController, MeOffersController, CheckoutController, PayoutAccountController, BookingReviewController, AdminDisputesController],
  providers: [BookingsClient, PricingSettingsClient],
})
export class BookingsModule {}
