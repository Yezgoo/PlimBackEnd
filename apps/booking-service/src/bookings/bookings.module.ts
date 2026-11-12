import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
