import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OffersController } from '../offers/offers.controller.js';
import { OffersService } from '../offers/offers.service.js';
import { OffersSweeper } from '../offers/offers.sweeper.js';
import { ProfessionalsDirectory } from '../offers/professionals.directory.js';
import { SettingsReader } from '../settings/settings.reader.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CancellationService } from './cancellation.service.js';
import { BookingEmailsController } from './booking-emails.controller.js';
import { BookingPushController } from './push.controller.js';
import { DisputesController } from './disputes.controller.js';
import { DisputesService } from './disputes.service.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { DailyMetricsService } from './daily-metrics.service.js';
import { PrivacyExportController } from './privacy-export.controller.js';
import { InvoicesController } from './invoices.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [BookingsController, OffersController, BookingEmailsController, BookingPushController, DisputesController, AdminBookingsController, PrivacyExportController, InvoicesController],
  providers: [BookingsService, CancellationService, OffersService, OffersSweeper, ProfessionalsDirectory, SettingsReader, DisputesService, DailyMetricsService],
})
export class BookingsModule {}
