import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { UsersModule } from '../users/users.module.js';
import { BookingsClient } from './bookings.client.js';
import { BookingsController } from './bookings.controller.js';

@Module({
  imports: [UsersModule, CatalogModule],
  controllers: [BookingsController],
  providers: [BookingsClient],
})
export class BookingsModule {}
