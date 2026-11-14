import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AdminProfessionalsController } from './admin-professionals.controller.js';
import { AdminController } from './admin.controller.js';
import { AdminSettingsController } from './admin-settings.controller.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminPrivacyController } from './admin-privacy.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AdminController, AdminProfessionalsController, AdminSettingsController, AdminBookingsController, AdminPrivacyController],
})
export class AdminModule {}
