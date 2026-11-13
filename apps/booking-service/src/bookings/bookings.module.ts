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

@Module({
  imports: [DatabaseModule],
  controllers: [BookingsController, OffersController],
  providers: [BookingsService, CancellationService, OffersService, OffersSweeper, ProfessionalsDirectory, SettingsReader],
})
export class BookingsModule {}
